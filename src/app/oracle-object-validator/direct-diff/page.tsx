
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Database, Search, ArrowRightLeft, AlertCircle, CheckCircle2, X, Plus, Layers, MousePointer2, Minus, Play, Trash2 } from "lucide-react";
import { DiffEditor } from "@monaco-editor/react";
import ConnectionManager from "@/components/ConnectionManager";
import { OracleConnection, getAllConnections } from "@/services/connection-storage";

interface DBObject {
    name: string;
    type: string;
    owner?: string; // Optional because initial fetch might not have it, but selection will
}

export default function DirectObjectDiffPage() {
    // Connection State
    const [connections, setConnections] = useState<OracleConnection[]>([]);
    const [sourceConn, setSourceConn] = useState<OracleConnection | null>(null);
    const [targetConns, setTargetConns] = useState<OracleConnection[]>([]); // Multi-target support

    // UI State for Connection Manager
    const [isConnManagerOpen, setIsConnManagerOpen] = useState(false);
    const [selectingFor, setSelectingFor] = useState<'SOURCE' | 'TARGET_ADD'>('SOURCE');

    // Selection State
    const [schemaList, setSchemaList] = useState<string[]>([]);
    const [selectedSchema, setSelectedSchema] = useState("");
    const [isFetchingSchemas, setIsFetchingSchemas] = useState(false);

    const [objectList, setObjectList] = useState<DBObject[]>([]);
    const [selectedObject, setSelectedObject] = useState<DBObject | null>(null);
    const [isFetchingObjects, setIsFetchingObjects] = useState(false);

    // Filter State for Comboboxes
    const [schemaSearch, setSchemaSearch] = useState("");
    const [objectSearch, setObjectSearch] = useState("");

    // Comparison State
    const [activeTargetIndex, setActiveTargetIndex] = useState<number>(0);
    const [diffResult, setDiffResult] = useState<{ ddl1: string, ddl2: string, status: string } | null>(null);
    const [isComparing, setIsComparing] = useState(false);
    const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);

    // -- NEW STATE FOR MULTI MODE --
    const [mode, setMode] = useState<'SINGLE' | 'MULTI'>('SINGLE');
    const [multiSelection, setMultiSelection] = useState<DBObject[]>([]);
    const [batchResults, setBatchResults] = useState<any[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null); // To track active item in batch view

    useEffect(() => {
        getAllConnections().then(setConnections);
    }, []);

    // Fetch Schemas when Source changes
    useEffect(() => {
        if (!sourceConn) {
            setSchemaList([]);
            return;
        }
        setIsFetchingSchemas(true);
        fetch('/api/oracle/meta/schemas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection: sourceConn })
        })
            .then(res => res.json())
            .then(data => {
                if (data.schemas) setSchemaList(data.schemas);
                else alert("Failed to fetch schemas: " + (data.error || "Unknown"));
            })
            .catch(err => alert("Network Error: " + err.message))
            .finally(() => setIsFetchingSchemas(false));
    }, [sourceConn]);

    // Fetch Objects when Schema changes
    useEffect(() => {
        if (!sourceConn || !selectedSchema) {
            setObjectList([]);
            return;
        }
        setIsFetchingObjects(true);
        fetch('/api/oracle/meta/objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection: sourceConn, owner: selectedSchema })
        })
            .then(res => res.json())
            .then(data => {
                if (data.objects) setObjectList(data.objects);
            })
            .catch(err => console.error(err))
            .finally(() => setIsFetchingObjects(false));
    }, [selectedSchema, sourceConn]);

    const handleConnSelect = (conn: OracleConnection) => {
        if (selectingFor === 'SOURCE') {
            setSourceConn(conn);
            // Reset downstream selections
            setSelectedSchema("");
            setSelectedObject(null);
            setDiffResult(null);
            setBatchResults([]);
            setMultiSelection([]);
        } else {
            // TARGET_ADD
            if (!targetConns.find(c => c.id === conn.id)) {
                setTargetConns(prev => [...prev, conn]);
            }
        }
        setIsConnManagerOpen(false);
    };

    const removeTarget = (index: number) => {
        setTargetConns(prev => prev.filter((_, i) => i !== index));
        if (activeTargetIndex >= index && activeTargetIndex > 0) {
            setActiveTargetIndex(prev => prev - 1);
        }
        setDiffResult(null);
    };

    const runComparison = useCallback(async () => {
        if (!sourceConn || targetConns.length === 0) return;

        // Single Mode Checks
        if (mode === 'SINGLE' && (!selectedSchema || !selectedObject)) return;
        // Multi Mode Checks
        if (mode === 'MULTI' && multiSelection.length === 0) return;

        const targetConn = targetConns[activeTargetIndex];
        setIsComparing(true);
        setDiffResult(null);
        setBatchResults([]); // Clear previous batch

        try {
            // Construct Items Payload
            let itemsToCompare: any[] = [];

            if (mode === 'SINGLE' && selectedObject) {
                itemsToCompare = [{
                    owner: selectedSchema,
                    name: selectedObject.name,
                    type: selectedObject.type
                }];
            } else if (mode === 'MULTI') {
                itemsToCompare = multiSelection.map(s => ({
                    owner: s.owner || selectedSchema, // Fallback if owner not stamped (should not happen with new logic)
                    name: s.name,
                    type: s.type
                }));
            }

            const res = await fetch('/api/oracle/validate-objects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: itemsToCompare,
                    env1: sourceConn,
                    env2: targetConn,
                    fetchDDL: true
                })
            });
            const data = await res.json();

            if (data.results && data.results.length > 0) {
                if (mode === 'SINGLE') {
                    const r = data.results[0];
                    setDiffResult({
                        ddl1: r.ddl1 || '-- Source Object Empty/Missing',
                        ddl2: r.ddl2 || '-- Target Object Empty/Missing',
                        status: r.status
                    });
                } else {
                    // MULTI MODE
                    setBatchResults(data.results);
                    // Automatically select the first diff if available, else first item
                    /* 
                       Logic: In Batch view, we render the list. 
                       We can set diffResult to the first item initially so the right pane isn't empty.
                    */
                    const first = data.results[0];
                    setDiffResult({
                        ddl1: first.ddl1 || '-- Source Object Empty/Missing',
                        ddl2: first.ddl2 || '-- Target Object Empty/Missing',
                        status: first.status
                    });
                    setSelectedBatchId(`${first.item.owner}-${first.item.name}-${first.item.type}`);
                }
            } else {
                if (mode === 'MULTI') {
                    // Empty result for some reason
                    alert("No results returned for batch.");
                } else {
                    alert("No result returned from internal API");
                }
            }

        } catch (e: any) {
            alert("Comparison Error: " + e.message);
        } finally {
            setIsComparing(false);
        }
    }, [sourceConn, targetConns, activeTargetIndex, selectedSchema, selectedObject, mode, multiSelection]);

    // Auto-run comparison when Object changes (SINGLE ONLY)
    useEffect(() => {
        if (mode === 'SINGLE' && selectedObject) {
            runComparison();
        }
    }, [selectedObject, activeTargetIndex, mode, runComparison]);
    // Note: We do NOT auto-run for Multi mode on selection change, user must click 'Compare Selected'

    const toggleMultiSelect = (obj: DBObject) => {
        setMultiSelection(prev => {
            // Check existence
            const exists = prev.find(p => p.name === obj.name && p.type === obj.type);
            if (exists) return prev.filter(p => p.name !== obj.name || p.type !== obj.type);
            // Add with current OWNER
            return [...prev, { ...obj, owner: selectedSchema }];
        });
    };

    // Filter Logic
    const filteredSchemas = schemaList.filter(s => s.toUpperCase().includes(schemaSearch.toUpperCase()));
    const filteredObjects = objectList.filter(o =>
        o.name.toUpperCase().includes(objectSearch.toUpperCase()) ||
        o.type.toUpperCase().includes(objectSearch.toUpperCase())
    );

    return (
        <div className="flex h-screen flex-col bg-zinc-950 font-sans text-zinc-100 overflow-hidden">
            {/* Header */}
            <header className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/oracle-object-validator" className="text-zinc-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-lg font-bold flex items-center gap-2">
                        <ArrowRightLeft className="text-emerald-500" />
                        Direct Object Diff
                    </h1>
                </div>

            </header>

            <main className="flex-1 flex overflow-hidden">
                {/* Sidebar / Config Panel */}
                <aside className="w-[350px] shrink-0 border-r border-zinc-800 bg-zinc-950/50 flex flex-col overflow-hidden">
                    <div className="p-4 space-y-6 overflow-y-auto flex-1 flex flex-col">

                        {/* 1. Source Connection */}
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase mb-2 block">Source Connection</label>
                            <button
                                onClick={() => { setSelectingFor('SOURCE'); setIsConnManagerOpen(true); }}
                                className={`w-full text-left px-3 py-3 rounded-lg border text-sm flex justify-between items-center ${sourceConn ? 'bg-zinc-900 border-emerald-500/50 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}
                            >
                                {sourceConn ? (
                                    <div className="truncate">
                                        <div className="font-bold">{sourceConn.name}</div>
                                        <div className="text-xs opacity-70">{sourceConn.username}@{sourceConn.host}</div>
                                    </div>
                                ) : "Select Source DB"}
                                <Database className="w-4 h-4 opacity-50" />
                            </button>
                        </div>

                        {/* 2. Target Connections */}
                        <div>
                            <label className="text-xs font-bold text-zinc-500 uppercase mb-2 block flex justify-between">
                                Targets
                                <span className="text-zinc-600">{targetConns.length} selected</span>
                            </label>
                            {targetConns.length === 0 ? (
                                <button
                                    onClick={() => {
                                        setSelectingFor('TARGET_ADD');
                                        setIsConnManagerOpen(true);
                                    }}
                                    className="w-full text-left text-sm text-zinc-500 italic p-3 border border-dashed border-zinc-800 rounded hover:bg-zinc-900 hover:text-zinc-300 hover:border-zinc-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Database className="w-4 h-4" /> Click to add Target
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    {targetConns.map((conn, idx) => (
                                        <div
                                            key={idx}
                                            className={`group relative flex items-center justify-between p-3 rounded-lg border transition-all ${activeTargetIndex === idx
                                                ? 'bg-blue-900/20 border-blue-500/50 text-blue-200'
                                                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                                        >
                                            <div
                                                className="flex-1 cursor-pointer min-w-0 text-left"
                                                onClick={() => { setActiveTargetIndex(idx); setDiffResult(null); }}
                                            >
                                                <div className="font-bold text-sm truncate">{conn.name}</div>
                                                <div className="text-xs opacity-70 truncate">{conn.username}@{conn.host}</div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); removeTarget(idx); }}
                                                className="ml-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded text-zinc-500 hover:text-red-400 transition-opacity"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* 3. Schema Selection */}
                        <div className="relative">
                            <label className="text-xs font-bold text-zinc-500 uppercase mb-2 block">Schema (Owner)</label>
                            {isFetchingSchemas ? (
                                <div className="text-xs text-zinc-500 animate-pulse">Loading schemas...</div>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        placeholder="Search Schema..."
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-t-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                                        value={schemaSearch}
                                        onChange={e => setSchemaSearch(e.target.value)}
                                        disabled={!sourceConn}
                                    />
                                    <div className="h-24 overflow-y-auto bg-zinc-900 border border-t-0 border-zinc-700 rounded-b-lg">
                                        {filteredSchemas.map(schema => (
                                            <div
                                                key={schema}
                                                onClick={() => setSelectedSchema(schema)}
                                                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-zinc-800 ${selectedSchema === schema ? 'bg-emerald-900/30 text-emerald-400 font-bold' : 'text-zinc-300'}`}
                                            >
                                                {schema}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 4. Object Selection with Tabs */}
                        <div className="relative flex-1 min-h-[300px] flex flex-col">
                            {/* Mode Tabs */}
                            <div className="flex border-b border-zinc-800 mb-2 relative">
                                <button
                                    onClick={() => setMode('SINGLE')}
                                    className={`flex-1 pb-2 text-xs font-bold uppercase flex justify-center items-center gap-2 transition-all ${mode === 'SINGLE' ? 'text-emerald-500 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <MousePointer2 className="w-3 h-3" /> Single
                                </button>
                                <button
                                    onClick={() => setMode('MULTI')}
                                    className={`flex-1 pb-2 text-xs font-bold uppercase flex justify-center items-center gap-2 transition-all ${mode === 'MULTI' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <Layers className="w-3 h-3" /> Multiple
                                    {multiSelection.length > 0 && <span className="bg-blue-600 text-white px-1.5 rounded-full text-[9px]">{multiSelection.length}</span>}
                                </button>
                                {mode === 'MULTI' && multiSelection.length > 0 && (
                                    <button
                                        onClick={() => {
                                            setMultiSelection([]);
                                            setBatchResults([]);
                                            setDiffResult(null);
                                            setSelectedBatchId(null);
                                        }}
                                        className="absolute right-0 top-0 p-1 text-zinc-500 hover:text-red-400 transition-colors"
                                        title="Clear Selection"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {isFetchingObjects ? (
                                <div className="text-xs text-zinc-500 animate-pulse">Loading objects...</div>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        placeholder="Search Object..."
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-t-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                                        value={objectSearch}
                                        onChange={e => setObjectSearch(e.target.value)}
                                        disabled={!selectedSchema}
                                    />
                                    <div className="flex-1 overflow-y-auto bg-zinc-900 border border-t-0 border-zinc-700 rounded-b-lg">
                                        {filteredObjects.length === 0 && selectedSchema && (
                                            <div className="p-2 text-xs text-zinc-500 text-center">No objects found</div>
                                        )}
                                        {filteredObjects.map((obj, i) => {
                                            const isSelectedMulti = multiSelection.some(m => m.name === obj.name && m.type === obj.type);
                                            const isSelectedSingle = selectedObject?.name === obj.name && selectedObject?.type === obj.type;

                                            return (
                                                <div
                                                    key={i}
                                                    onClick={() => mode === 'SINGLE' && setSelectedObject(obj)}
                                                    className={`group px-3 py-2 text-sm max-w-[282px] border-b border-zinc-800/50 flex items-center justify-between
                                                        ${mode === 'SINGLE'
                                                            ? (isSelectedSingle ? 'bg-emerald-900/30 text-emerald-400 cursor-default' : 'text-zinc-300 cursor-pointer hover:bg-zinc-800')
                                                            : (isSelectedMulti ? 'bg-blue-900/20 text-blue-300' : 'text-zinc-300 hover:bg-zinc-800')
                                                        }
                                                    `}
                                                >
                                                    <div className="flex flex-col truncate flex-1 min-w-0">
                                                        <span className="font-bold truncate" title={obj.name}>{obj.name}</span>
                                                        <span className="text-[10px] opacity-60 uppercase">{obj.type}</span>
                                                    </div>

                                                    {/* Multi Mode Action Button */}
                                                    {mode === 'MULTI' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleMultiSelect(obj); }}
                                                            className={`p-1 rounded-full transition-all ml-2 shrink-0 ${isSelectedMulti
                                                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white'
                                                                : 'bg-blue-600/20 text-blue-500 hover:bg-blue-600 hover:text-white'
                                                                }`}
                                                        >
                                                            {isSelectedMulti ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Action Button */}
                        {mode === 'SINGLE' ? (
                            <button
                                onClick={runComparison}
                                disabled={isComparing || !selectedObject || targetConns.length === 0}
                                className={`w-full py-3 shrink-0 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${isComparing
                                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105'}`}
                            >
                                {isComparing ? 'Comparing...' : 'Refresh Diff'}
                            </button>
                        ) : (
                            <button
                                onClick={runComparison}
                                disabled={multiSelection.length === 0 || targetConns.length === 0 || isComparing}
                                className={`w-full py-3 shrink-0 rounded-lg font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${multiSelection.length === 0 || isComparing
                                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105'}`}
                            >
                                {isComparing ? 'Comparing...' : (
                                    <>
                                        <Play className="w-4 h-4 fill-current" /> Compare Selected {multiSelection.length > 0 ? `(${multiSelection.length})` : ''}
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </aside>

                {/* Batch Result Sidebar (Visible only in MULTI mode with results) */}
                {mode === 'MULTI' && batchResults.length > 0 && (
                    <aside className="w-[300px] shrink-0 border-r border-zinc-700 bg-[#18181b] flex flex-col overflow-hidden">
                        <div className="p-3 border-b border-zinc-700 bg-zinc-900 font-bold text-xs uppercase text-zinc-400 flex justify-between items-center">
                            Batch Results
                            <span className="bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded text-[10px]">{batchResults.length} Items</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {batchResults.map((res, idx) => {
                                const itemKey = `${res.item.owner}-${res.item.name}-${res.item.type}`;
                                const isSelected = selectedBatchId === itemKey;
                                const isMatch = res.status === 'MATCH';

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => {
                                            setDiffResult({
                                                ddl1: res.ddl1 || '-- Source Object Empty/Missing',
                                                ddl2: res.ddl2 || '-- Target Object Empty/Missing',
                                                status: res.status
                                            });
                                            setSelectedBatchId(itemKey);
                                            // OPEN POPUP FOR MULTI MODE
                                            setIsDiffModalOpen(true);
                                        }}
                                        className={`p-3 rounded border cursor-pointer transition-all flex flex-col gap-1 ${isSelected
                                            ? 'border-blue-500 bg-blue-900/10'
                                            : 'border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-sm truncate w-40" title={res.item.name}>{res.item.name}</span>
                                            {isMatch ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                            ) : (
                                                <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="opacity-60 uppercase">{res.item.type}</span>
                                            <span className={isMatch ? 'text-emerald-500' : 'text-orange-500'}>{res.status}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </aside>
                )}

                {/* Main Content: Diff Viewer */}
                <div className="flex-1 flex flex-col bg-[#1e1e1e] relative">
                    {mode === 'SINGLE' ? (
                        isComparing ? (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
                                <div className="w-12 h-12 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
                                <div className="text-zinc-400 font-medium animate-pulse">Fetching & Comparing DDL...</div>
                            </div>
                        ) : diffResult ? (
                            <div className="flex-1 flex flex-col relative">
                                {/* Status Bar */}
                                <div className={`p-2 text-center text-sm font-bold border-b border-white/10 ${diffResult.status === 'MATCH' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-orange-900/30 text-orange-400'}`}>
                                    Status: {diffResult.status}
                                    {targetConns.length > 1 && (
                                        <span className="ml-4 text-xs font-normal text-zinc-400 opacity-80">
                                            Comparing with Target {activeTargetIndex + 1}: {targetConns[activeTargetIndex].name}
                                        </span>
                                    )}
                                </div>

                                <div className="flex-1 relative">
                                    <DiffEditor
                                        height="100%"
                                        theme="vs-dark"
                                        original={diffResult.ddl1}
                                        modified={diffResult.ddl2}
                                        language="sql"
                                        options={{ readOnly: true, renderSideBySide: true, scrollBeyondLastLine: false }}
                                    />
                                    {/* Headers Overlay */}
                                    <div className="absolute top-0 left-0 w-1/2 p-2 pointer-events-none z-10">
                                        <span className="bg-zinc-800/90 text-zinc-300 px-2 py-1 rounded text-xs border border-zinc-700 shadow-sm backdrop-blur">
                                            Source: {sourceConn?.name}
                                        </span>
                                    </div>
                                    <div className="absolute top-0 right-0 w-1/2 p-2 pointer-events-none z-10 flex justify-end">
                                        <span className="bg-zinc-800/90 text-zinc-300 px-2 py-1 rounded text-xs border border-zinc-700 shadow-sm backdrop-blur">
                                            Target: {targetConns[activeTargetIndex]?.name}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 gap-4">
                                <Search className="w-16 h-16 opacity-20" />
                                <p className="text-sm">Select Source, Target(s), Schema and Object to visualize Diff.</p>
                            </div>
                        )
                    ) : (
                        // MULTI MODE MAIN AREA (Placeholder)
                        <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                            <Layers className="w-16 h-16 mb-4 opacity-20" />
                            <p className="text-lg font-bold">Batch Comparison Mode</p>
                            <p className="text-sm opacity-60 max-w-md text-center mt-2">
                                Select items from the sidebar to view their differences in a detailed popup window.
                            </p>
                        </div>
                    )}
                </div>
            </main>

            {/* DIFF MODAL (For Multi Mode) */}
            {mode === 'MULTI' && isDiffModalOpen && diffResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-[#1e1e1e] w-full h-full max-w-[95vw] max-h-[95vh] rounded-xl shadow-2xl flex flex-col border border-zinc-700 overflow-hidden text-zinc-100">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700 bg-zinc-900">
                            <div className="flex items-center gap-4">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <span className={diffResult.status === 'MATCH' ? 'text-emerald-500' : 'text-orange-500'}>
                                        {diffResult.status}
                                    </span>
                                    <span className="text-zinc-400 font-normal">Reviewing Diff</span>
                                </h2>
                                <div className="text-xs text-zinc-400 px-3 py-1 bg-zinc-800 rounded border border-zinc-700 font-mono">
                                    {selectedBatchId}
                                </div>
                            </div>
                            <button
                                onClick={() => setIsDiffModalOpen(false)}
                                className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Modal Body: Diff Editor */}
                        <div className="flex-1 relative bg-zinc-950">
                            <DiffEditor
                                height="100%"
                                language="sql"
                                theme="vs-dark"
                                original={diffResult.ddl1}
                                modified={diffResult.ddl2}
                                options={{
                                    readOnly: true,
                                    renderSideBySide: true,
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                }}
                            />
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-3 border-t border-zinc-700 bg-zinc-900 flex justify-end">
                            <button
                                onClick={() => setIsDiffModalOpen(false)}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-medium transition-colors text-sm border border-zinc-700 shadow-sm"
                            >
                                Close (Esc)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConnectionManager
                isOpen={isConnManagerOpen}
                onClose={() => setIsConnManagerOpen(false)}
                onSelect={handleConnSelect}
            />
        </div>
    );
}
