"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Database, CheckCircle2, Play, Table as TableIcon, Settings2, RefreshCw, X, Search, ChevronRight, ArrowRightLeft, Loader2 } from "lucide-react";
import { OracleConnection, getAllConnections } from "@/services/connection-storage";
import ConnectionManager from "@/components/ConnectionManager";

interface TableInfo {
    name: string;
    type: string;
}

interface ColumnInfo {
    name: string;
    type: string;
    length: number;
    nullable: string;
}

interface ComparisonResult {
    status: 'MATCH' | 'DIFF' | 'ERROR';
    stats: {
        sourceTotal?: number;
        targetTotal?: number;
        sourceOnlyCount?: number;
        targetOnlyCount?: number;
    };
    diffs: {
        type: string;
        data: Record<string, unknown>;
        count: number;
    }[];
    error?: string;
}

type CheckStatus = { id: string; name: string; host: string; status: 'pending' | 'testing' | 'success' | 'error'; message?: string };

function EnvDataCheckerContent() {
    const [connections, setConnections] = useState<OracleConnection[]>([]);

    // Connection Selection State
    const [sourceConnId, setSourceConnId] = useState<string>("");
    const [targetConnId, setTargetConnId] = useState<string>("");

    // Connection Manager Modal
    const [isConnManagerOpen, setIsConnManagerOpen] = useState(false);
    const [selectingConnType, setSelectingConnType] = useState<'SOURCE' | 'TARGET' | null>(null);

    const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
    const [isLoadingTables, setIsLoadingTables] = useState(false);

    // Connection Check State
    const [connectionCheckStatus, setConnectionCheckStatus] = useState<CheckStatus[] | null>(null);

    // Selection State
    const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
    const [tableColumns, setTableColumns] = useState<Map<string, ColumnInfo[]>>(new Map());
    const [selectedColumns, setSelectedColumns] = useState<Map<string, Set<string>>>(new Map());

    // UI State
    const [activeTable, setActiveTable] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const [isComparing, setIsComparing] = useState(false);
    const [results, setResults] = useState<Map<string, ComparisonResult>>(new Map());
    const [showResults, setShowResults] = useState(false);
    const [viewingDiff, setViewingDiff] = useState<{ table: string, result: ComparisonResult } | null>(null);

    useEffect(() => {
        getAllConnections().then(setConnections);
    }, []);

    const sourceConn = connections.find(c => c.id === sourceConnId);
    const targetConn = connections.find(c => c.id === targetConnId);

    const openConnectionManager = (type: 'SOURCE' | 'TARGET') => {
        setSelectingConnType(type);
        setIsConnManagerOpen(true);
    };

    const handleConnectionSelect = (conn: OracleConnection) => {
        if (!selectingConnType) return;

        // Update connections list just in case
        getAllConnections().then(setConnections);

        if (selectingConnType === 'SOURCE') {
            if (conn.id === targetConnId) {
                alert("Source and Target cannot be the same connection.");
                return;
            }
            setSourceConnId(conn.id);
            setAvailableTables([]);
            setSelectedTables(new Set());
        } else {
            if (conn.id === sourceConnId) {
                alert("Target and Source cannot be the same connection.");
                return;
            }
            setTargetConnId(conn.id);
        }
        setIsConnManagerOpen(false);
    };

    const handleFetchTables = async () => {
        if (!sourceConn) return;

        // 1. Prepare Connection Checks
        const checks: CheckStatus[] = [{
            id: sourceConn.id,
            name: sourceConn.name,
            host: sourceConn.host,
            status: 'testing'
        }];

        if (targetConn) {
            checks.push({
                id: targetConn.id,
                name: targetConn.name,
                host: targetConn.host,
                status: 'testing'
            });
        }

        setConnectionCheckStatus(checks);

        try {
            // Run checks in parallel
            const checkPromises = checks.map(async (check) => {
                const conn = check.id === sourceConn.id ? sourceConn : targetConn!;
                try {
                    const res = await fetch('/api/oracle/test-connection', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(conn)
                    });
                    if (!res.ok) {
                        const data = await res.json();
                        return { ...check, status: 'error', message: data.error || 'Failed' } as CheckStatus;
                    }
                    return { ...check, status: 'success' } as CheckStatus;
                } catch (e) {
                    return { ...check, status: 'error', message: "Network Error" } as CheckStatus;
                }
            });

            const results = await Promise.all(checkPromises);
            setConnectionCheckStatus(results);

            // If any failed, stop here
            if (results.some(r => r.status === 'error')) {
                return;
            }

            await new Promise(r => setTimeout(r, 800)); // Small delay for UX
            setConnectionCheckStatus(null);

            // 2. Fetch Tables
            setIsLoadingTables(true);
            const res = await fetch('/api/oracle/list-objects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connection: sourceConn })
            });
            const data = await res.json();
            if (res.ok) {
                // Filter only tables
                const tables = data.objects.filter((o: { type: string }) => o.type === 'TABLE');
                setAvailableTables(tables);
            } else {
                alert("Failed to fetch tables: " + data.error);
            }
        } catch (error) {
            console.error(error);
            // This global catch might be redundant given the inner try-catch, but safe to keep
            setConnectionCheckStatus(prev => prev?.map(c => ({ ...c, status: 'error', message: "Unexpected Error" })) || null);
        } finally {
            setIsLoadingTables(false);
        }
    };

    const handleTableClick = async (tableName: string) => {
        setActiveTable(tableName);
        // Fetch Columns if not already fetched
        if (!tableColumns.has(tableName)) {
            await fetchColumns(tableName);
        }
    };

    const handleSelectionToggle = (tableName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSet = new Set(selectedTables);
        if (newSet.has(tableName)) {
            newSet.delete(tableName);
        } else {
            newSet.add(tableName);
            // Fetch Columns if not already fetched
            if (!tableColumns.has(tableName)) {
                fetchColumns(tableName);
            }
        }
        setSelectedTables(newSet);
    };

    const fetchColumns = async (tableName: string) => {
        if (!sourceConn) return;
        try {
            const res = await fetch('/api/oracle/get-columns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connection: sourceConn, tableName })
            });
            const data = await res.json();
            if (res.ok) {
                setTableColumns(prev => new Map(prev).set(tableName, data.columns));
                // Default select all
                const allCols = new Set<string>(data.columns.map((c: { name: string }) => c.name));
                setSelectedColumns(prev => new Map(prev).set(tableName, allCols));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleColumnToggle = (tableName: string, colName: string) => {
        const currentSet = selectedColumns.get(tableName) || new Set();
        const newSet = new Set(currentSet);
        if (newSet.has(colName)) {
            newSet.delete(colName);
        } else {
            newSet.add(colName);
        }
        setSelectedColumns(prev => new Map(prev).set(tableName, newSet));
    };

    const handleCompare = async () => {
        if (!sourceConn || !targetConn || selectedTables.size === 0) return;
        setIsComparing(true);
        setResults(new Map());
        setShowResults(true);

        const tables = Array.from(selectedTables);

        // Sequential for now to avoid overwhelming DB? 
        // Or Parallel with limit? Let's do batches of 2.
        const BATCH_SIZE = 2;

        for (let i = 0; i < tables.length; i += BATCH_SIZE) {
            const batch = tables.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (tbl) => {
                try {
                    const cols = Array.from(selectedColumns.get(tbl) || []);
                    if (cols.length === 0) {
                        setResults(prev => new Map(prev).set(tbl, { status: 'ERROR', stats: {}, diffs: [], error: 'No columns selected' }));
                        return;
                    }

                    const res = await fetch('/api/oracle/compare-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sourceConn,
                            targetConn,
                            tableName: tbl,
                            columns: cols
                        })
                    });
                    const data = await res.json();

                    if (res.ok) {
                        setResults(prev => new Map(prev).set(tbl, {
                            status: data.status,
                            stats: data.stats,
                            diffs: data.diffs
                        }));
                    } else {
                        setResults(prev => new Map(prev).set(tbl, {
                            status: 'ERROR',
                            stats: {},
                            diffs: [],
                            error: data.error
                        }));
                    }
                } catch (e: unknown) {
                    const errorMessage = e instanceof Error ? e.message : "Unknown error";
                    setResults(prev => new Map(prev).set(tbl, {
                        status: 'ERROR',
                        stats: {},
                        diffs: [],
                        error: errorMessage
                    }));
                }
            }));
        }
        setIsComparing(false);
    };

    const filteredTables = availableTables.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
            <div className="max-w-7xl mx-auto h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Link href="/oracle-object-validator" className="p-2 rounded-full hover:bg-zinc-800 transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-light tracking-wide flex items-center gap-2">
                            <Database className="w-8 h-8 text-blue-500" />
                            Env Data Checker
                        </h1>
                        <p className="text-zinc-500 text-sm">Compare table content between environments</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
                    {/* Left Column: Connections & Table List */}
                    <div className="flex flex-col gap-4 bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 h-full min-h-0">
                        <div className="space-y-3 shrink-0">
                            <div>
                                <label className="text-xs text-zinc-500 font-bold uppercase block mb-1">Source Environment</label>
                                <button
                                    onClick={() => openConnectionManager('SOURCE')}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-left flex justify-between items-center hover:bg-zinc-900 transition-colors"
                                >
                                    {sourceConn ? (
                                        <span className="truncate">{sourceConn.name} ({sourceConn.host})</span>
                                    ) : (
                                        <span className="text-zinc-500 italic">Select Source...</span>
                                    )}
                                    <ArrowRightLeft className="w-4 h-4 text-zinc-500" />
                                </button>
                            </div>
                            <div>
                                <label className="text-xs text-zinc-500 font-bold uppercase block mb-1">Target Environment</label>
                                <button
                                    onClick={() => openConnectionManager('TARGET')}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-sm text-left flex justify-between items-center hover:bg-zinc-900 transition-colors"
                                >
                                    {targetConn ? (
                                        <span className="truncate">{targetConn.name} ({targetConn.host})</span>
                                    ) : (
                                        <span className="text-zinc-500 italic">Select Target...</span>
                                    )}
                                    <ArrowRightLeft className="w-4 h-4 text-zinc-500" />
                                </button>
                            </div>

                            <button
                                onClick={handleFetchTables}
                                disabled={!sourceConn || isLoadingTables}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded p-2 text-sm font-medium flex items-center justify-center gap-2"
                            >
                                {isLoadingTables ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TableIcon className="w-4 h-4" />}
                                Fetch Tables
                            </button>
                        </div>

                        {/* Search */}
                        <div className="relative shrink-0">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Search tables..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded pl-9 p-2 text-sm focus:border-blue-500 outline-none"
                            />
                        </div>

                        {/* Table List */}
                        <div className="flex-1 overflow-y-auto space-y-1 pr-2 min-h-0">
                            {filteredTables.map(tbl => (
                                <div
                                    key={tbl.name}
                                    className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition-colors ${activeTable === tbl.name ? 'bg-blue-900/30 border border-blue-500/30' : 'hover:bg-zinc-800'
                                        }`}
                                    onClick={() => handleTableClick(tbl.name)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedTables.has(tbl.name)}
                                        onChange={() => { }}
                                        onClick={(e) => handleSelectionToggle(tbl.name, e)}
                                        className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-offset-zinc-900"
                                    />
                                    <span className={`flex-1 truncate font-mono ${selectedTables.has(tbl.name) ? 'text-white' : 'text-zinc-400'}`}>
                                        {tbl.name}
                                    </span>
                                    {activeTable === tbl.name && <ChevronRight className="w-4 h-4 text-blue-500" />}
                                </div>
                            ))}
                            {availableTables.length === 0 && !isLoadingTables && (
                                <div className="text-center text-zinc-600 text-sm py-4">No tables found</div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Column Config */}
                    <div className="col-span-2 bg-zinc-900/50 p-6 rounded-xl border border-zinc-800 flex flex-col h-full min-h-0">
                        {activeTable ? (
                            <>
                                <div className="flex justify-between items-center mb-4 shrink-0">
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <TableIcon className="text-blue-500" />
                                        {activeTable}
                                    </h2>
                                    <span className="text-xs font-mono text-zinc-500">
                                        {selectedColumns.get(activeTable)?.size || 0} columns selected
                                    </span>
                                </div>

                                <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-lg bg-zinc-950/50 min-h-0">
                                    {!tableColumns.has(activeTable) ? (
                                        <div className="flex justify-center items-center h-full text-zinc-500 gap-2">
                                            <RefreshCw className="animate-spin w-5 h-5" /> Loading Columns...
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-4">
                                            {tableColumns.get(activeTable)?.map(col => (
                                                <label
                                                    key={col.name}
                                                    className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-zinc-900 transition-colors ${selectedColumns.get(activeTable)?.has(col.name)
                                                        ? 'border-blue-500/30 bg-blue-500/10'
                                                        : 'border-transparent opacity-60'
                                                        }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedColumns.get(activeTable)?.has(col.name)}
                                                        onChange={() => handleColumnToggle(activeTable, col.name)}
                                                        className="rounded border-zinc-600 bg-zinc-800 text-blue-500"
                                                    />
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-mono truncate text-zinc-300" title={col.name}>{col.name}</span>
                                                        <span className="text-[10px] text-zinc-500">{col.type}({col.length})</span>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-6 flex justify-end shrink-0">
                                    <button
                                        onClick={handleCompare}
                                        disabled={!targetConn || !selectedTables.has(activeTable) || isComparing}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                                    >
                                        <Play className="w-5 h-5 fill-current" />
                                        Compare Selected Tables
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                                <Settings2 className="w-16 h-16 mb-4 opacity-20" />
                                <p>Select a table to configure columns</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ConnectionManager
                isOpen={isConnManagerOpen}
                onClose={() => setIsConnManagerOpen(false)}
                onSelect={handleConnectionSelect}
            />

            {/* Connection Check Progress Modal */}
            {connectionCheckStatus && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <div className="flex items-center gap-3 mb-6">
                            {connectionCheckStatus.some(c => c.status === 'testing' || c.status === 'pending') ? (
                                <div className="w-8 h-8 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
                            ) : connectionCheckStatus.some(c => c.status === 'error') ? (
                                <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center">
                                    <X className="w-5 h-5" />
                                </div>
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                            )}
                            <div>
                                <h3 className="font-bold text-lg text-white">Connection Check</h3>
                                <p className="text-zinc-500 text-xs">Verifying database access...</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {connectionCheckStatus.map((chk, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-md bg-zinc-900 flex items-center justify-center text-zinc-400">
                                            <Database className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-zinc-200">{chk.name}</div>
                                            <div className="text-xs text-zinc-500">{chk.host}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs font-bold">
                                        {chk.status === 'pending' && <span className="text-zinc-600">WAITING</span>}
                                        {chk.status === 'testing' && <span className="text-blue-400 animate-pulse">TESTING...</span>}
                                        {chk.status === 'success' && <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>}
                                        {chk.status === 'error' && <span className="text-red-500 flex items-center gap-1">FAILED</span>}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {connectionCheckStatus.some(c => c.status === 'error') && (
                            <div className="mt-6 flex justify-end">
                                <button
                                    onClick={() => {
                                        setConnectionCheckStatus(null);
                                    }}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium"
                                >
                                    Cancel & Fix
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Results Modal */}
            {showResults && !viewingDiff && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-950 rounded-t-xl">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <CheckCircle2 className="text-emerald-500" /> Comparison Results
                                </h2>
                                <div className="text-xs text-zinc-500 font-mono">
                                    Progress: {results.size} / {selectedTables.size}
                                </div>
                            </div>
                            <button onClick={() => setShowResults(false)} className="p-2 hover:bg-zinc-800 rounded-full">
                                <X className="w-5 h-5 text-zinc-400" />
                            </button>
                        </div>

                        {/* Connection Info Bar */}
                        <div className="flex items-center gap-6 px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-xs font-mono">
                            <div className="flex items-center gap-2">
                                <span className="text-zinc-500 uppercase font-bold">Source:</span>
                                <span className="text-blue-400">{sourceConn?.name} ({sourceConn?.host})</span>
                            </div>
                            <div className="w-px h-4 bg-zinc-700" />
                            <div className="flex items-center gap-2">
                                <span className="text-zinc-500 uppercase font-bold">Target:</span>
                                <span className="text-emerald-400">{targetConn?.name} ({targetConn?.host})</span>
                            </div>
                        </div>
                        {selectedTables.size > 0 && (
                            <div className="h-1 w-full bg-zinc-900 relative">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                                    style={{
                                        width: `${(results.size / selectedTables.size) * 100}%`
                                    }}
                                />
                            </div>
                        )}

                        <div className="flex-1 overflow-auto p-4">
                            <table className="w-full text-left text-sm text-zinc-300">
                                <thead className="bg-zinc-950 text-zinc-500 uppercase text-xs sticky top-0">
                                    <tr>
                                        <th className="p-3">Table</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3">Source Rows</th>
                                        <th className="p-3">Target Rows</th>
                                        <th className="p-3">Diff Count</th>
                                        <th className="p-3">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800">
                                    {Array.from(selectedTables).map(tbl => {
                                        const res = results.get(tbl);
                                        if (!res) return (
                                            <tr key={tbl}>
                                                <td className="p-3 font-mono">{tbl}</td>
                                                <td className="p-3 text-zinc-500 italic">Waiting...</td>
                                                <td colSpan={4}></td>
                                            </tr>
                                        );

                                        return (
                                            <tr key={tbl} className="hover:bg-zinc-800/30">
                                                <td className="p-3 font-mono font-medium text-white">{tbl}</td>
                                                <td className="p-3">
                                                    {res.status === 'DIFF' ? (
                                                        <button
                                                            onClick={() => setViewingDiff({ table: tbl, result: res })}
                                                            className="px-3 py-1 rounded-full text-xs font-bold bg-orange-900/30 text-orange-400 border border-orange-500/30 hover:bg-orange-500 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                                                        >
                                                            DIFF <Search className="w-3 h-3" />
                                                        </button>
                                                    ) : (
                                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${res.status === 'MATCH' ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30' :
                                                            'bg-red-900/30 text-red-400 border border-red-500/30'
                                                            }`}>
                                                            {res.status}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3">{res.stats?.sourceTotal ?? '-'}</td>
                                                <td className="p-3">{res.stats?.targetTotal ?? '-'}</td>
                                                <td className="p-3 font-bold text-orange-400">
                                                    {(res.stats?.sourceOnlyCount || 0) + (res.stats?.targetOnlyCount || 0) > 0
                                                        ? (res.stats?.sourceOnlyCount || 0) + (res.stats?.targetOnlyCount || 0)
                                                        : '-'
                                                    }
                                                </td>
                                                <td className="p-3 text-xs font-mono text-zinc-500 max-w-xs truncate">
                                                    {res.error ? res.error :
                                                        res.status === 'MATCH' ? 'Data identical' :
                                                            `${res.stats.sourceOnlyCount} in Src only, ${res.stats.targetOnlyCount} in Tgt only`
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Data Diff Viewer Modal */}
            {viewingDiff && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950 animate-in fade-in slide-in-from-bottom-4">
                    <div className="w-full h-full flex flex-col">
                        {/* Header */}
                        <div className="flex justify-between items-center p-4 border-b border-zinc-800 bg-zinc-900">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setViewingDiff(null)}
                                    className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                                >
                                    <ArrowLeft className="w-6 h-6" />
                                </button>
                                <div>
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                        <TableIcon className="text-blue-500" />
                                        Diff Viewer: {viewingDiff.table}
                                    </h2>
                                    <div className="flex items-center gap-3 text-xs font-mono mt-1 text-zinc-400">
                                        <span>{sourceConn?.name} vs {targetConn?.name}</span>
                                    </div>
                                    <div className="flex gap-4 text-xs font-mono mt-1">
                                        <span className="flex items-center gap-1 text-red-400">
                                            <div className="w-2 h-2 bg-red-500/50 rounded-full" />
                                            Source Only: {viewingDiff.result.stats.sourceOnlyCount}
                                        </span>
                                        <span className="flex items-center gap-1 text-green-400">
                                            <div className="w-2 h-2 bg-green-500/50 rounded-full" />
                                            Target Only: {viewingDiff.result.stats.targetOnlyCount}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setViewingDiff(null)}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm"
                            >
                                Close Viewer
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-auto bg-zinc-950">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead className="bg-zinc-900/90 text-zinc-500 uppercase text-xs font-bold sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                                    <tr>
                                        <th className="p-3 border-b border-zinc-800 w-10">Origin</th>
                                        {tableColumns.get(viewingDiff.table)?.filter(c => selectedColumns.get(viewingDiff.table)?.has(c.name)).map(col => (
                                            <th key={col.name} className="p-3 border-b border-zinc-800 whitespace-nowrap">
                                                {col.name}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/50">
                                    {viewingDiff.result.diffs.map((diff, idx) => (
                                        <tr key={idx} className={`font-mono text-xs hover:opacity-80 transition-opacity ${diff.type === 'SOURCE_ONLY'
                                            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-100'
                                            : 'bg-green-500/10 hover:bg-green-500/20 text-green-100'
                                            }`}>
                                            <td className="p-3 border-r border-white/5 font-bold whitespace-nowrap">
                                                {diff.type === 'SOURCE_ONLY' ? 'SRC' : 'TGT'}
                                            </td>
                                            {tableColumns.get(viewingDiff.table)?.filter(c => selectedColumns.get(viewingDiff.table)?.has(c.name)).map(col => (
                                                <td key={col.name} className="p-3 border-r border-white/5 whitespace-nowrap max-w-xs truncate">
                                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                    {String((diff.data as any)[col.name] ?? '')}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {viewingDiff.result.diffs.length === 0 && (
                                        <tr>
                                            <td colSpan={100} className="p-8 text-center text-zinc-500">
                                                No differences to display.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function EnvDataChecker() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-500"><Loader2 className="animate-spin w-8 h-8" /></div>}>
            <EnvDataCheckerContent />
        </Suspense>
    );
}
