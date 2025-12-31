"use client";

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Background,
    Controls,
    MiniMap,
    Node,
    Position,
    MarkerType,
    useReactFlow,
    ReactFlowProvider,
    Panel,
    ConnectionLineType,
    BackgroundVariant,
    Handle,
    NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import Editor from '@monaco-editor/react';
import { Activity, RefreshCcw, AlertCircle, ArrowRight, ArrowDown, Filter, X, Hash, Type, Box, List, Braces, Link2, ArrowUpAZ, ArrowDownZA, Tag, Sun, Moon, AlertTriangle } from 'lucide-react';
import { trackActivity } from '@/lib/tracker';
import { JSONPath } from 'jsonpath-plus';

/* -------------------------------------------------------------------------------------------------
 * CONFIGURATION & CONSTANTS
 * -----------------------------------------------------------------------------------------------*/
const DEFAULT_JSON = `{
  "store": {
    "book": [
      {
        "category": "reference",
        "author": "Nigel Rees",
        "title": "Sayings of the Century",
        "price": 8.95
      },
      {
        "category": "fiction",
        "author": "Evelyn Waugh",
        "title": "Sword of Honour",
        "price": 12.99
      },
      {
        "category": "fiction",
        "author": "Herman Melville",
        "title": "Moby Dick",
        "isbn": "0-553-21311-3",
        "price": 8.99
      }
    ],
    "bicycle": {
      "color": "red",
      "price": 19.95,
      "specs": {
         "material": "carbon",
         "weight": "8kg"
      }
    }
  }
}`;

const NODE_WIDTH = 250;

/* -------------------------------------------------------------------------------------------------
 * UI COMPONENTS (Modal, etc)
 * -----------------------------------------------------------------------------------------------*/

interface ErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    message: string;
    theme: 'dark' | 'light';
}

const ErrorModal = ({ isOpen, onClose, title, message, theme }: ErrorModalProps) => {
    if (!isOpen) return null;

    const bgClass = theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200';
    const textClass = theme === 'dark' ? 'text-zinc-100' : 'text-gray-900';
    const subTextClass = theme === 'dark' ? 'text-zinc-400' : 'text-gray-500';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className={`${bgClass} border rounded-xl w-full max-w-md p-6 shadow-2xl flex flex-col relative animate-in fade-in zoom-in duration-200`}>
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-6 h-6 text-red-500" />
                    </div>
                    <div className="flex-1">
                        <h3 className={`text-lg font-bold ${textClass} mb-1`}>{title}</h3>
                        <p className={`text-sm ${subTextClass} leading-relaxed`}>
                            {message}
                        </p>
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${theme === 'dark'
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                            }`}
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
};

/* -------------------------------------------------------------------------------------------------
 * CUSTOM NODES (JSON CRACK STYLE)
 * -----------------------------------------------------------------------------------------------*/

const getTypeIcon = (value: any) => {
    if (Array.isArray(value)) return <List className="w-3 h-3 text-indigo-400" />;
    if (typeof value === 'object' && value !== null) return <Braces className="w-3 h-3 text-blue-400" />;
    if (typeof value === 'number') return <Hash className="w-3 h-3 text-emerald-400" />;
    if (typeof value === 'boolean') return <div className="w-3 h-3 rounded-full bg-rose-500" />;
    return <Type className="w-3 h-3 text-orange-400" />;
};

const ObjectNode = ({ data }: NodeProps) => {
    const content = data.content as Record<string, any>;
    const label = data.label as string;
    const theme = data.theme as 'dark' | 'light'; // Receive theme from data
    const entries = content ? Object.entries(content) : [];

    // Theme Classes
    const nodeBg = theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200';
    const headerBg = theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200';
    const headerText = theme === 'dark' ? 'text-zinc-100' : 'text-gray-900';
    const subText = theme === 'dark' ? 'text-zinc-500' : 'text-gray-400';
    const rowBorder = theme === 'dark' ? 'border-zinc-800/50 hover:bg-zinc-800/50' : 'border-gray-100 hover:bg-gray-50';
    const keyText = theme === 'dark' ? 'text-zinc-300' : 'text-gray-700';
    const valueText = theme === 'dark' ? 'text-zinc-400' : 'text-gray-500';

    return (
        <div className={`rounded-md overflow-hidden border shadow-xl min-w-[250px] ${nodeBg}`}>
            <div className={`${headerBg} px-3 py-2 border-b flex items-center justify-between`}>
                <span className={`font-bold text-xs flex items-center gap-2 ${headerText}`}>
                    {data.type === 'array' ? <List className="w-4 h-4 text-indigo-500" /> : <Braces className="w-4 h-4 text-blue-500" />}
                    {label}
                    <span className={`font-normal ml-1 ${subText}`}>
                        {data.type === 'array' ? `[${entries.length}]` : `{}`}
                    </span>
                </span>
                <Handle type="target" position={Position.Left} className="!bg-indigo-500 !w-3 !h-3 !border-zinc-900" />
            </div>

            <div className="flex flex-col">
                {entries.map(([key, value]) => {
                    const isPrimitive = typeof value !== 'object' || value === null;
                    const isComplex = !isPrimitive;

                    return (
                        <div key={key} className={`relative flex items-center justify-between px-3 py-2 text-xs border-b last:border-0 transition-colors group ${rowBorder}`}>

                            <div className="flex items-center gap-2 flex-1 overflow-hidden mr-4">
                                {getTypeIcon(value)}
                                <span className={`font-mono truncate ${keyText}`} title={key}>{key}</span>
                            </div>

                            {isPrimitive && (
                                <div className={`text-right flex-1 truncate font-mono ${valueText}`} title={String(value)}>
                                    {String(value)}
                                </div>
                            )}

                            {isComplex && (
                                <div className="text-zinc-500">
                                    <Link2 className="w-3 h-3" />
                                </div>
                            )}

                            {isComplex && (
                                <Handle
                                    type="source"
                                    position={Position.Right}
                                    id={key}
                                    className="!bg-indigo-500 !w-2 !h-2 !border-zinc-900 !right-[-5px]"
                                    style={{ top: 'auto', transform: 'none', position: 'absolute', right: '-4px' }}
                                />
                            )}
                        </div>
                    );
                })}
                {entries.length === 0 && (
                    <div className={`p-3 text-center italic text-xs ${subText}`}>Empty</div>
                )}
            </div>
        </div>
    );
};

const NODE_TYPES = {
    objectNode: ObjectNode
};

/**
 * Layout helper using 'dagre'
 */
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 200 });

    nodes.forEach((node) => {
        const content = node.data.content as Record<string, any>;
        const count = content ? Object.keys(content).length : 0;
        const estimatedHeight = 40 + (Math.max(1, count) * 33);

        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: estimatedHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const content = node.data.content as Record<string, any>;
        const count = content ? Object.keys(content).length : 0;
        const estimatedHeight = 40 + (Math.max(1, count) * 33);

        const newNode = {
            ...node,
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
            position: {
                x: nodeWithPosition.x - NODE_WIDTH / 2,
                y: nodeWithPosition.y - estimatedHeight / 2,
            },
        };
        return newNode;
    });

    return { nodes: layoutedNodes, edges };
};

/* -------------------------------------------------------------------------------------------------
 * HELPER: Suggest Keys for Chips
 * -----------------------------------------------------------------------------------------------*/
const extractCommonKeys = (data: any): string[] => {
    // DFS to find the first array of objects and return its keys
    if (Array.isArray(data)) {
        if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
            return Object.keys(data[0]);
        }
        return [];
    }
    if (typeof data === 'object' && data !== null) {
        // Check immediate children
        for (const key in data) {
            if (Array.isArray(data[key])) {
                if (data[key].length > 0 && typeof data[key][0] === 'object' && data[key][0] !== null) {
                    return Object.keys(data[key][0]);
                }
            }
        }
    }
    return [];
};


/* -------------------------------------------------------------------------------------------------
 * MAIN COMPONENT
 * -----------------------------------------------------------------------------------------------*/
const JsonVisualizerContent = () => {
    const [jsonInput, setJsonInput] = useState(DEFAULT_JSON);
    const [filterQuery, setFilterQuery] = useState('');
    const [filteredDataPreview, setFilteredDataPreview] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [sortOrder, setSortOrder] = useState<'default' | 'asc' | 'desc'>('default');
    const [customSortKey, setCustomSortKey] = useState<string | null>(null);
    const [suggestedKeys, setSuggestedKeys] = useState<string[]>([]);

    // Theme State
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    // Load theme from local storage on mount
    useEffect(() => {
        const savedTheme = localStorage.getItem('json_vis_theme') as 'dark' | 'light';
        if (savedTheme) {
            setTheme(savedTheme);
        }
    }, []);

    // Loading State
    const [isLoading, setIsLoading] = useState(false);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const { fitView } = useReactFlow();

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

    // -- Processor: JSON to Graph Nodes --
    const processJson = useCallback((jsonStr: string, query: string, sort: 'default' | 'asc' | 'desc', activeSortKey: string | null, currentTheme: 'dark' | 'light') => {
        setIsLoading(true); // START LOADING

        // Use setTimeout to allow UI to render spinner before heavy calculation
        setTimeout(() => {
            try {
                let data = JSON.parse(jsonStr);
                setError(null);
                setFilteredDataPreview(null);

                // 0. Update Suggestions
                const keys = extractCommonKeys(data);
                setSuggestedKeys(keys);

                // 1. Apply Filter
                if (query && query.trim() !== '') {
                    let finalQuery = query.trim();
                    if (!finalQuery.startsWith('$')) {
                        if (!finalQuery.startsWith('[')) finalQuery = `$.${finalQuery}`;
                        else finalQuery = `$${finalQuery}`;
                    }
                    try {
                        const result = JSONPath({ path: finalQuery, json: data });
                        if (result.length === 1) data = result[0];
                        else data = result;
                        setFilteredDataPreview(data);
                    } catch (err: any) {
                        throw new Error(`Filter Error: ${err.message}`);
                    }
                }

                const rawNodes: Node[] = [];
                const rawEdges: Edge[] = [];

                // 2. Traverser
                const traverse = (obj: any, parentId: string | null, keyInParent: string | null, currentPath: string) => {
                    const uniqueId = parentId
                        ? `${parentId}-${keyInParent}-${Math.random().toString(36).substr(2, 5)}`
                        : 'root-' + Math.random().toString(36).substr(2, 5);

                    const isObject = typeof obj === 'object' && obj !== null;
                    const isArray = Array.isArray(obj);

                    if (!isObject) {
                        rawNodes.push({
                            id: uniqueId,
                            type: 'objectNode',
                            data: {
                                label: 'Root Value',
                                type: 'primitive',
                                content: { 'value': obj },
                                theme: currentTheme, // Pass theme to node
                                path: currentPath // Store Path
                            },
                            position: { x: 0, y: 0 }
                        });
                        return;
                    }

                    const content: Record<string, any> = {};

                    // --- SORTING LOGIC ---
                    if (isArray && activeSortKey) {
                        const sortedObj = [...obj].sort((a, b) => {
                            const valA = (typeof a === 'object' && a !== null) ? a[activeSortKey] : undefined;
                            const valB = (typeof b === 'object' && b !== null) ? b[activeSortKey] : undefined;

                            if (valA === undefined || valB === undefined) return 0;
                            if (valA < valB) return sort === 'desc' ? 1 : -1;
                            if (valA > valB) return sort === 'desc' ? -1 : 1;
                            return 0;
                        });

                        sortedObj.forEach((val: any, idx: number) => {
                            content[String(idx)] = val;
                        });

                    }
                    else {
                        let keys = Object.keys(obj);
                        if (!isArray) {
                            if (sort === 'asc') keys.sort();
                            if (sort === 'desc') keys.sort().reverse();
                        }
                        keys.forEach(k => {
                            content[k] = obj[k as keyof typeof obj];
                        });
                    }

                    // Add Node
                    rawNodes.push({
                        id: uniqueId,
                        type: 'objectNode',
                        data: {
                            label: keyInParent || 'ROOT',
                            type: isArray ? 'array' : 'object',
                            content: content,
                            theme: currentTheme, // Pass theme to node
                            path: currentPath // Store Path
                        },
                        position: { x: 0, y: 0 }
                    });

                    if (parentId) {
                        rawEdges.push({
                            id: `e-${parentId}-${uniqueId}`,
                            source: parentId,
                            target: uniqueId,
                            sourceHandle: keyInParent || undefined,
                            type: 'bezier',
                            animated: true,
                            style: { stroke: '#6366f1', strokeWidth: 2 },
                            markerEnd: {
                                type: MarkerType.ArrowClosed,
                                color: '#6366f1',
                            },
                        });
                    }

                    Object.keys(content).forEach(k => {
                        const val = content[k];
                        if (typeof val === 'object' && val !== null) {
                            // Calculate next path
                            let nextPath = currentPath;
                            if (currentPath === '$') {
                                nextPath = isArray ? `$[${k}]` : `$.${k}`;
                            } else {
                                nextPath = isArray ? `${currentPath}[${k}]` : `${currentPath}.${k}`;
                            }

                            traverse(val, uniqueId, k, nextPath);
                        }
                    });
                };

                traverse(data, null, null, '$');

                const layout = getLayoutedElements(rawNodes, rawEdges, 'LR');
                setNodes(layout.nodes);
                setEdges(layout.edges);

                setTimeout(() => {
                    fitView({ duration: 800, padding: 0.2 });
                    setIsLoading(false); // STOP LOADING
                }, 100);

            } catch (e: any) {
                setError(e.message); // Trigger Error Modal
                setIsLoading(false); // STOP LOADING ON ERROR
            }
        }, 100); // Small delay to let React render spinner
    }, [setNodes, setEdges, fitView]);

    useEffect(() => {
        processJson(jsonInput, filterQuery, sortOrder, customSortKey, theme);
        trackActivity({ action: "OPEN_TOOL", label: "JSON Visualizer CrackStyle" });
    }, []);

    // Re-process when theme changes to update node styles
    useEffect(() => {
        processJson(jsonInput, filterQuery, sortOrder, customSortKey, theme);
    }, [theme]);

    const handleVisualize = () => {
        processJson(jsonInput, filterQuery, sortOrder, customSortKey, theme);
        trackActivity({ action: "GENERATE_VISUALIZATION", label: `JSON Visualizer CrackStyle` });
    };

    // -- New Feature: Click Node to Filter --
    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        const path = node.data.path as string;
        if (path) {
            setFilterQuery(path);
            trackActivity({ action: "CLICK_NODE_TO_FILTER", label: path });
        }
    }, []);

    const toggleSort = () => {
        const nextSort = sortOrder === 'default' ? 'asc' : sortOrder === 'asc' ? 'desc' : 'default';
        setSortOrder(nextSort);
        trackActivity({ action: "TOGGLE_SORT_ORDER", label: nextSort });
        processJson(jsonInput, filterQuery, nextSort, customSortKey, theme);
    };

    const handleChipClick = (key: string) => {
        const newKey = customSortKey === key ? null : key;
        setCustomSortKey(newKey);
        const nextSort = newKey ? 'asc' : sortOrder;
        setSortOrder(nextSort);

        trackActivity({ action: "CLICK_SORT_CHIP", label: `${key} (Active: ${!!newKey})` });
        processJson(jsonInput, filterQuery, nextSort, newKey, theme);
    };

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        localStorage.setItem('json_vis_theme', nextTheme);
        trackActivity({ action: "TOGGLE_THEME", label: nextTheme });
    };

    const [isPanelOpen, setIsPanelOpen] = useState(true);

    const togglePanel = () => {
        const newState = !isPanelOpen;
        setIsPanelOpen(newState);
        trackActivity({ action: "TOGGLE_EDITOR_PANEL", label: newState ? "OPEN" : "CLOSED" });
        // Resize graph after transition to ensure fit view works if needed, though split reuse might not trigger it automatically
        setTimeout(() => fitView({ duration: 300 }), 300);
    };

    const [isChipsOpen, setIsChipsOpen] = useState(false);

    // Styling Maps
    const containerClass = theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : 'bg-gray-50 text-gray-900';
    const headerClass = theme === 'dark' ? 'border-zinc-800 bg-zinc-900/50 glass' : 'border-gray-200 bg-white/50 blur-sm';
    const buttonClass = theme === 'dark' ? 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100' : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-gray-200';
    const inputContainerClass = theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-gray-200';
    const inputTextClass = theme === 'dark' ? 'text-zinc-200 placeholder:text-zinc-600' : 'text-gray-800 placeholder:text-gray-400';
    const chipActive = theme === 'dark' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-indigo-100 border-indigo-400 text-indigo-700';
    const chipInactive = theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50';

    return (
        <div className={`flex flex-col h-screen transition-colors duration-300 ${containerClass}`}>

            {/* Error Modal */}
            <ErrorModal
                isOpen={!!error}
                onClose={() => setError(null)}
                title="JSON Parsing / Filter Error"
                message={error || ''}
                theme={theme}
            />

            {/* Header */}
            <header className={`flex-none px-6 py-4 border-b flex flex-col gap-4 z-10 ${headerClass}`}>
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <a
                            href="/"
                            onClick={(e) => {
                                e.preventDefault();
                                trackActivity({ action: "CLICK_BACK", label: "JSON Visualizer" });
                                window.location.href = "/";
                            }}
                            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${buttonClass}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="m12 19-7-7 7-7" />
                                <path d="M19 12H5" />
                            </svg>
                            Back
                        </a>
                        <div>
                            <h1 className={`text-xl font-semibold flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-100' : 'text-gray-900'}`}>
                                <Activity className="w-5 h-5 text-indigo-500" />
                                JSON Visualizer
                            </h1>
                            <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-gray-500'}`}>Smart Graph + Custom Sorting</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={toggleTheme}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors border ${buttonClass}`}
                            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4 text-orange-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
                        </button>

                        <button
                            onClick={toggleSort}
                            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors border ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'}`}
                            title="Toggle Key Sort Order (A-Z / Z-A)"
                        >
                            {sortOrder === 'asc' && <ArrowDownZA className="w-4 h-4 text-emerald-500" />}
                            {sortOrder === 'desc' && <ArrowUpAZ className="w-4 h-4 text-rose-500" />}
                            {sortOrder === 'default' && <div className="text-xs opacity-60">Default</div>}
                            <span className="hidden sm:inline">Sort Order</span>
                        </button>

                        <button
                            onClick={handleVisualize}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            Visualize
                        </button>
                    </div>
                </div>

                {/* Filter & Chips Bar */}
                <div className="flex flex-col gap-2">
                    {/* Search Input */}
                    <div className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${inputContainerClass}`}>

                        {/* Toggle Advanced Chips Button */}
                        <button
                            onClick={() => setIsChipsOpen(!isChipsOpen)}
                            className={`p-1 rounded hover:bg-black/10 transition-colors ${isChipsOpen ? 'rotate-90' : ''}`}
                            title="Toggle Advanced Sorting Options"
                        >
                            <ArrowRight className={`w-3 h-3 ${theme === 'dark' ? 'text-zinc-500' : 'text-gray-400'}`} />
                        </button>

                        <Filter className="w-4 h-4 opacity-50" />
                        <input
                            type="text"
                            placeholder="Filter Query (e.g. store.book[*]) or Click a Node"
                            className={`bg-transparent border-none outline-none text-sm flex-1 font-mono ${inputTextClass}`}
                            value={filterQuery}
                            onChange={(e) => setFilterQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleVisualize()}
                        />
                        {filterQuery && (
                            <button onClick={() => {
                                setFilterQuery('');
                                trackActivity({ action: "CLEAR_FILTER", label: "JSON Visualizer" });
                                setTimeout(handleVisualize, 0);
                            }} className="opacity-50 hover:opacity-100">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        <div className="group relative">
                            <AlertCircle className="w-4 h-4 opacity-40 hover:opacity-100 cursor-help" />
                            <div className={`absolute right-0 top-8 w-64 p-3 rounded-lg shadow-xl text-xs z-[100] border pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-gray-200 text-gray-600'}`}>
                                <p className="font-bold mb-1">Filter Helper:</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>Click any <strong>Graph Node</strong> to auto-fill path.</li>
                                    <li>Use <strong>$</strong> for root.</li>
                                    <li>Use <strong>[*]</strong> for arrays.</li>
                                    <li>Example: <code className="bg-black/20 px-1 rounded">$.store.book[*].author</code></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Feature: Common Keys Chips for Custom Sorting (Collapsible) */}
                    {suggestedKeys.length > 0 && isChipsOpen && (
                        <div className="flex items-center gap-2 flex-wrap text-xs animate-in slide-in-from-top-2 duration-200 pl-8">
                            <span className="font-medium flex items-center gap-1 opacity-60">
                                <Tag className="w-3 h-3" /> Sort Array By:
                            </span>
                            {suggestedKeys.map(key => (
                                <button
                                    key={key}
                                    onClick={() => handleChipClick(key)}
                                    className={`px-2 py-1 rounded-full border transition-all ${customSortKey === key ? chipActive : chipInactive
                                        }`}
                                >
                                    {key}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Editor Panel - Collapsible */}
                <div
                    className={`border-r flex flex-col z-10 transition-all duration-300 ease-in-out relative ${theme === 'dark' ? 'border-zinc-800 bg-zinc-950' : 'border-gray-200 bg-gray-50'}`}
                    style={{ width: isPanelOpen ? '33.333%' : '0px', overflow: 'hidden' }}
                >
                    <div className="flex-1 relative min-w-[300px]"> {/* min-w prevents editor squashing animation */}
                        <Editor
                            height="100%"
                            defaultLanguage="json"
                            theme={theme === 'dark' ? "vs-dark" : "light"}
                            value={jsonInput}
                            onChange={(val) => setJsonInput(val || "")}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                            }}
                        />
                    </div>
                </div>

                {/* Toggle Button */}
                <button
                    onClick={togglePanel}
                    className={`absolute z-30 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-12 rounded-r-md border-y border-r shadow-lg transition-all ${isPanelOpen ? 'left-[33.333%]' : 'left-0'
                        } ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-400' : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-500'}`}
                    aria-label={isPanelOpen ? "Close Editor" : "Open Editor"}
                >
                    {isPanelOpen ? <ArrowDown className="w-4 h-4 rotate-90" /> : <ArrowRight className="w-4 h-4" />}
                </button>

                {/* Graph Panel */}
                <div className={`flex-1 h-full relative flex flex-col ${theme === 'dark' ? 'bg-zinc-950/50' : 'bg-gray-100/50'}`}>

                    {/* LOADING OVERLAY */}
                    {isLoading && (
                        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                            <div className={`p-4 rounded-xl shadow-2xl flex flex-col items-center gap-3 ${theme === 'dark' ? 'bg-zinc-900 border border-zinc-700' : 'bg-white border border-gray-200'}`}>
                                <div className="w-8 h-8 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-gray-600'}`}>Rendering Graph...</span>
                            </div>
                        </div>
                    )}

                    {filteredDataPreview && (
                        <div className={`border-b px-4 py-2 text-xs flex items-center gap-2 ${theme === 'dark' ? 'bg-indigo-900/10 border-indigo-500/20 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                            <Filter className="w-3 h-3" />
                            Viewing filtered results provided by query: <span className="font-mono opacity-80 px-1 rounded bg-black/5">{filterQuery}</span>
                        </div>
                    )}
                    <div className="flex-1 relative">
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeClick={onNodeClick}
                            nodeTypes={NODE_TYPES}
                            fitView
                            minZoom={0.1}
                            maxZoom={2}
                            attributionPosition="bottom-right"
                            connectionLineType={ConnectionLineType.Bezier}
                        >
                            <Background color={theme === 'dark' ? "#27272a" : "#e5e7eb"} gap={20} variant={BackgroundVariant.Dots} />
                            <Controls className={`${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 fill-zinc-400 text-zinc-400' : 'bg-white border-gray-200 fill-gray-500 text-gray-500'}`} />
                            <MiniMap
                                nodeColor={theme === 'dark' ? "#3f3f46" : "#d1d5db"}
                                maskColor={theme === 'dark' ? "rgba(0,0,0, 0.4)" : "rgba(255,255,255, 0.4)"}
                                className={`${theme === 'dark' ? 'bg-zinc-900 border border-zinc-800' : 'bg-white border border-gray-200'}`}
                            />
                        </ReactFlow>
                    </div>
                </div>
            </div>
        </div>
    );
};

const JsonVisualizer = () => {
    return (
        <ReactFlowProvider>
            <JsonVisualizerContent />
        </ReactFlowProvider>
    );
};

export default JsonVisualizer;
