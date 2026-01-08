"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { trackActivity } from "@/lib/tracker";
import { JSONPath } from "jsonpath-plus";
import {
    Filter, Info, X, ChevronDown, ChevronUp, Play, Trash2, RotateCcw,
    FolderTree, Braces, Brackets, Hash, Type, Text as TextIcon, Sidebar,
    ChevronRight, CheckCircle2
} from "lucide-react";

// --- Tree Component ---

type JsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

interface TreeItemProps {
    name: string;
    value: any;
    path: string;
    onSelectPath: (path: string) => void;
    depth?: number;
    isSchemaMode?: boolean; // If true, treats arrays as schema templates ([*])
}

const getJsonType = (value: any): JsonType => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value as JsonType;
};

const JsonTreeItem = ({ name, value, path, onSelectPath, depth = 0, isSchemaMode = true }: TreeItemProps) => {
    const [isOpen, setIsOpen] = useState(depth < 1); // Auto expand root only
    const type = getJsonType(value);
    const isExpandable = type === 'object' || type === 'array';

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    const handleSelect = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Schema Mode: If user clicks an array node, they usually want the array itself.
        // If they click a child of array, path generation logic below handles the [*].
        onSelectPath(path);
    };

    const renderIcon = () => {
        switch (type) {
            case 'object': return <Braces className="w-3 h-3 text-blue-400" />;
            case 'array': return <Brackets className="w-3 h-3 text-yellow-400" />;
            case 'string': return <TextIcon className="w-3 h-3 text-green-400" />;
            case 'number': return <Hash className="w-3 h-3 text-orange-400" />;
            case 'boolean': return <CheckCircle2 className="w-3 h-3 text-purple-400" />;
            default: return <Type className="w-3 h-3 text-gray-400" />;
        }
    };

    return (
        <div className="select-none">
            <div
                className={`flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer transition-colors group hover:bg-zinc-800 ${depth === 0 ? 'bg-zinc-900/50' : ''}`}
                style={{ paddingLeft: `${Math.max(4, depth * 12)}px` }}
                onClick={handleSelect}
            >
                {/* Expander Arrow */}
                <div
                    onClick={isExpandable ? handleToggle : undefined}
                    className={`w-4 h-4 flex items-center justify-center rounded hover:bg-zinc-700/50 ${isExpandable ? 'cursor-pointer' : 'invisible'}`}
                >
                    {isExpandable && (
                        isOpen
                            ? <ChevronDown className="w-3 h-3 text-zinc-500" />
                            : <ChevronRight className="w-3 h-3 text-zinc-500" />
                    )}
                </div>

                {/* Type Icon */}
                {renderIcon()}

                {/* Key Name */}
                <span className={`font-mono text-sm truncate ${type === 'object' || type === 'array' ? 'text-zinc-300 font-medium' : 'text-zinc-400'}`}>
                    {name}
                </span>

                {/* Validation / Value Hint (Optional, for primitives) */}
                {type !== 'object' && type !== 'array' && (
                    <span className="ml-2 text-xs text-zinc-600 truncate max-w-[100px] opacity-0 group-hover:opacity-100 transition-opacity">
                        {String(value)}
                    </span>
                )}
            </div>

            {/* Children */}
            {isExpandable && isOpen && (
                <div className="border-l border-zinc-800 ml-[11px]">
                    {type === 'object' && Object.entries(value).map(([key, val]) => (
                        <JsonTreeItem
                            key={key}
                            name={key}
                            value={val}
                            path={`${path}.${key}`}
                            onSelectPath={onSelectPath}
                            depth={depth + 1}
                            isSchemaMode={isSchemaMode}
                        />
                    ))}

                    {type === 'array' && (
                        isSchemaMode ? (
                            // Schema Mode: If array has items, inspect the first one as a schema template
                            (value as any[]).length > 0 && typeof (value as any[])[0] === 'object' ? (
                                <JsonTreeItem
                                    name="[*] (Item Schema)"
                                    value={(value as any[])[0]}
                                    path={`${path}[*]`}
                                    onSelectPath={onSelectPath}
                                    depth={depth + 1}
                                    isSchemaMode={isSchemaMode}
                                />
                            ) : (
                                // Array of primitives or empty
                                <div className="pl-6 py-1 text-xs text-zinc-600 italic">
                                    {(value as any[]).length} items
                                </div>
                            )
                        ) : (
                            // Normal Mode: List all items (not implemented here per requirement for schema view)
                            null
                        )
                    )}
                </div>
            )}
        </div>
    );
};

// --- Main Page Component ---

export default function JsonFormatter() {
    const [jsonInput, setJsonInput] = useState("");
    const [originalData, setOriginalData] = useState("");
    const [isFiltered, setIsFiltered] = useState(false);
    const [filterQuery, setFilterQuery] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isHelperOpen, setIsHelperOpen] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);

    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    const handleEditorDidMount: OnMount = (editor) => {
        editorRef.current = editor;
    };

    const handleEditorChange = (value: string | undefined) => {
        const val = value || "";
        setJsonInput(val);
        if (error) setError(null);

        if (!isFiltered) {
            setOriginalData(val);
        }
    };

    // Memoize parsed data for the tree view to avoid re-parsing on every render
    const treeData = useMemo(() => {
        try {
            if (!originalData.trim()) return null;
            return JSON.parse(originalData);
        } catch (e) {
            return null;
        }
    }, [originalData]);

    const handleFormat = () => {
        if (!jsonInput.trim()) {
            setError("Please enter some JSON to format.");
            return;
        }
        try {
            const parsed = JSON.parse(jsonInput);
            const formatted = JSON.stringify(parsed, null, 2);
            setJsonInput(formatted);

            if (!isFiltered) {
                setOriginalData(formatted);
            }

            setError(null);
            trackActivity({ action: "FORMAT_JSON", details: { length: jsonInput.length } });
        } catch (err) {
            const error = err as Error;
            setError(error.message);
        }
    };

    const handleFilter = () => {
        if (!jsonInput.trim() && !originalData.trim()) {
            setError("Please enter some JSON to filter.");
            return;
        }
        if (!filterQuery.trim()) {
            handleFormat();
            return;
        }

        try {
            let sourceJson = jsonInput;

            if (isFiltered) {
                sourceJson = originalData;
            } else {
                if (!originalData && jsonInput) {
                    setOriginalData(jsonInput);
                    sourceJson = jsonInput;
                } else if (originalData) {
                    sourceJson = originalData;
                }
            }

            const parsed = JSON.parse(sourceJson);

            let finalQuery = filterQuery.trim();
            if (!finalQuery.startsWith("$")) {
                if (!finalQuery.startsWith("[")) {
                    finalQuery = `$.${finalQuery}`;
                } else {
                    finalQuery = `$${finalQuery}`;
                }
            }

            const result = JSONPath({ path: finalQuery, json: parsed });
            const formatted = JSON.stringify(result, null, 2);

            setJsonInput(formatted);
            setIsFiltered(true);
            setError(null);
            trackActivity({ action: "FILTER_JSON", details: { query: finalQuery, resultLength: formatted.length } });
        } catch (err) {
            const error = err as Error;
            setError(`Filter Error: ${error.message}`);
        }
    };

    const handleReset = () => {
        if (isFiltered) {
            setJsonInput(originalData);
            setIsFiltered(false);
        }
        setFilterQuery("");
        setError(null);
        trackActivity({ action: "RESET_FILTER", label: "Revert to Original" });
    };

    const handleTreeSelect = (path: string) => {
        setFilterQuery(path);
        trackActivity({ action: "CLICK_TREE_NODE", label: path });
    };

    const handleHelperClick = (query: string) => {
        setFilterQuery(query);
        trackActivity({ action: "CLICK_HELPER_CHIP", label: query });
    };

    return (
        <div className="flex h-screen bg-zinc-950 font-sans text-zinc-100 overflow-hidden">

            {/* --- SIDEBAR: Schema Explorer --- */}
            <div className={`${showSidebar ? 'w-80' : 'w-0'} flex-shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col transition-all duration-300 overflow-hidden`}>
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2 text-zinc-200">
                        <FolderTree className="w-4 h-4 text-indigo-400" />
                        Schema Explorer
                    </h2>
                    <button onClick={() => {
                        setShowSidebar(false);
                        trackActivity({ action: "JSON_SIDEBAR_TOGGLE", label: "Hide" });
                    }} className="text-zinc-500 hover:text-zinc-300">
                        <ChevronRight className="w-4 h-4 rotate-180" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-800">
                    {!treeData ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2 p-4 text-center">
                            <FolderTree className="w-8 h-8 opacity-20" />
                            <p className="text-xs">
                                Enter valid JSON in the editor to view its structure here.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <JsonTreeItem
                                name="$ (Root)"
                                value={treeData}
                                path="$"
                                onSelectPath={handleTreeSelect}
                            />
                        </div>
                    )}
                </div>
                <div className="p-3 bg-zinc-900/50 border-t border-zinc-800 text-[10px] text-zinc-500 text-center">
                    Click items to generate query
                </div>
            </div>

            {/* --- MAIN CONTENT --- */}
            <div className="flex-1 flex flex-col min-w-0 h-full relative">

                {/* Header Navbar */}
                <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950 z-10 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        {!showSidebar && (
                            <button
                                onClick={() => {
                                    setShowSidebar(true);
                                    trackActivity({ action: "JSON_SIDEBAR_TOGGLE", label: "Show" });
                                }}
                                className="p-2 rounded hover:bg-zinc-900 text-zinc-400"
                                title="Show Schema Explorer"
                            >
                                <Sidebar className="w-5 h-5" />
                            </button>
                        )}
                        <h1 className="text-xl font-light tracking-wide text-zinc-200">JSON Formatter</h1>
                    </div>

                    <Link
                        href="/"
                        onClick={() => trackActivity({ action: "CLICK_BACK", label: "JSON Formatter" })}
                        className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                    >
                        Back to Home
                    </Link>
                </header>

                <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">

                    {/* Filter Toolbar */}
                    <div className="flex-shrink-0 flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center rounded-lg bg-indigo-500/10 p-2 text-indigo-400">
                                <Filter className="h-4 w-4" />
                            </div>
                            <input
                                type="text"
                                value={filterQuery}
                                onChange={(e) => setFilterQuery(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleFilter()}
                                placeholder="Data Filter (JSONPath)... e.g. store.book[*].author"
                                className="flex-grow rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-mono"
                            />
                            <button
                                onClick={handleFilter}
                                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 whitespace-nowrap"
                            >
                                <Play className="h-3 w-3 fill-current" />
                                Run Filter
                            </button>

                            {(isFiltered || filterQuery) && (
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-400 transition-all hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700/50"
                                    title="Reset to Original Data"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                </button>
                            )}

                            <button
                                onClick={() => {
                                    setIsHelperOpen(!isHelperOpen);
                                    trackActivity({ action: "JSON_HELPER_TOGGLE", label: !isHelperOpen ? "Open" : "Close" });
                                }}
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all border ${isHelperOpen ? 'bg-zinc-800 text-zinc-100 border-zinc-700' : 'bg-transparent text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-300'}`}
                            >
                                <Info className="h-4 w-4" />
                                {isHelperOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                        </div>

                        {/* Helper Section */}
                        {isHelperOpen && (
                            <div className="mt-2 text-sm text-zinc-400 animate-in slide-in-from-top-2 border-t border-zinc-800 pt-3">
                                <h3 className="mb-2 font-semibold text-zinc-200 flex items-center gap-2 text-xs uppercase tracking-wider opacity-70">
                                    Quick Examples
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono text-xs">
                                    <button onClick={() => handleHelperClick('$')} className="text-left p-2 rounded bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:text-indigo-300 transition-all">
                                        $ <span className="text-zinc-600">// Root</span>
                                    </button>
                                    <button onClick={() => handleHelperClick('[*]')} className="text-left p-2 rounded bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:text-indigo-300 transition-all">
                                        [*] <span className="text-zinc-600">// All Items</span>
                                    </button>
                                    <button onClick={() => handleHelperClick('[?(@.key=="val")]')} className="text-left p-2 rounded bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:text-indigo-300 transition-all">
                                        [?(@.k=="v")] <span className="text-zinc-600">// Condition</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Editor Area */}
                    <div className="flex-1 relative rounded-xl border border-zinc-800 shadow-sm bg-zinc-900 overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 z-10 pointer-events-none opacity-50"></div>
                        <Editor
                            height="100%"
                            defaultLanguage="json"
                            theme="vs-dark"
                            value={jsonInput}
                            onChange={handleEditorChange}
                            onMount={handleEditorDidMount}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                formatOnPaste: true,
                                formatOnType: true,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 16, bottom: 16 },
                                fontFamily: "'Fira Code', 'Consolas', monospace",
                                fontLigatures: true,
                            }}
                        />
                    </div>

                    {/* Error Overlay (Floating) */}
                    {error && (
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in">
                            <div className="rounded-xl bg-red-950/90 backdrop-blur border border-red-500/30 p-4 text-red-200 shadow-2xl flex items-center gap-4 max-w-lg">
                                <div className="rounded-full bg-red-500/20 p-2">
                                    <X className="h-5 w-5 text-red-400" />
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-sm">JSON Error</p>
                                    <p className="font-mono text-xs opacity-80 break-words">{error}</p>
                                </div>
                                <button onClick={() => setError(null)} className="p-2 hover:bg-red-900/50 rounded transition-colors"><X className="h-4 w-4" /></button>
                            </div>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex-shrink-0 flex gap-4">
                        <button
                            onClick={handleFormat}
                            className="flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold tracking-wide uppercase text-zinc-900 shadow-lg shadow-zinc-100/10 transition-all hover:bg-white active:scale-[0.99]"
                        >
                            Format / Validate
                        </button>
                        <button
                            onClick={() => {
                                setJsonInput("");
                                setOriginalData("");
                                setFilterQuery("");
                                setIsFiltered(false);
                                setError(null);
                                trackActivity({ action: "CLEAR_EDITOR", label: "JSON Formatter" });
                            }}
                            className="rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-3 text-zinc-400 font-medium transition-all hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/30 active:scale-[0.99]"
                            title="Clear All"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
