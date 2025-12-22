'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Database, Table, Search, Play, Download, Trash2,
    Upload, FileCode, AlertCircle, RefreshCw, ChevronRight,
    ArrowLeft, Save, Lock, X
} from 'lucide-react';
import Link from 'next/link';

// Kita import type-nya saja jika memungkinkan
// import initSqlJs from 'sql.js'; 

interface QueryResult {
    columns: string[];
    values: any[][];
}

interface DBTable {
    name: string;
    rowCount: number;
    type: 'table' | 'view';
    columns?: string[];
    expanded?: boolean;
}

const PasswordModal = ({ isOpen, onClose, onSubmit, error }: { isOpen: boolean, onClose: () => void, onSubmit: (pw: string) => void, error: string | null }) => {
    const [pw, setPw] = useState('');
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                    <h3 className="font-bold text-slate-200 flex items-center gap-2"><Lock size={16} className="text-orange-500" /> Database Encrypted</h3>
                    <button onClick={onClose}><X size={18} className="text-slate-500 hover:text-white" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-400">This database appears to be password protected. Please enter the password to unlock it.</p>
                    <input
                        type="password"
                        placeholder="Enter Password"
                        autoFocus
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onSubmit(pw)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    {error && <p className="text-xs text-red-400 bg-red-900/20 p-2 rounded">{error}</p>}
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                        <button onClick={() => onSubmit(pw)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium">Unlock</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function SQLiteBrowserPage() {
    const [db, setDb] = useState<any>(null);
    const [tables, setTables] = useState<DBTable[]>([]);
    const [isDbLoaded, setIsDbLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>('');

    // Proxy / Password State
    const [currentFile, setCurrentFile] = useState<File | null>(null);
    const [isEncryptedMode, setIsEncryptedMode] = useState(false);
    const [dbPassword, setDbPassword] = useState<string>('');
    const [showPwModal, setShowPwModal] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);

    // Query State
    const [query, setQuery] = useState<string>('SELECT * FROM sqlite_master WHERE type="table";');
    const [result, setResult] = useState<QueryResult | null>(null);
    const [executionTime, setExecutionTime] = useState<number>(0);
    const [activeTable, setActiveTable] = useState<string | null>(null);

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Cleanup on unmount
        return () => {
            if (db && !isEncryptedMode) {
                // db.close(); 
            }
        };
    }, []);

    const initSQL = async () => {
        try {
            // @ts-ignore
            const initSqlJs = (await import('sql.js')).default;
            const SQL = await initSqlJs({
                // Use local WASM file for offline support & speed (Fallback to CDN if not found)
                locateFile: (file: string) => `/wasm/sql-wasm.wasm`
            });
            return SQL;
        } catch (err) {
            console.error("Failed to load SQL.js", err);
            setError("Failed to load SQLite engine. Please check internet connection or static resources.");
            return null;
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setError(null);
        setFileName(file.name);
        setCurrentFile(file);
        setResult(null);
        setIsEncryptedMode(false);
        setDbPassword('');
        setTables([]);

        try {
            const SQL = await initSQL();
            if (!SQL) throw new Error("SQL Engine not ready");

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const Uints = new Uint8Array(e.target?.result as ArrayBuffer);
                    const newDb = new SQL.Database(Uints);

                    // Try a dummy select to verify integrity immediately
                    newDb.exec("SELECT count(*) FROM sqlite_master");

                    setDb(newDb);
                    setIsDbLoaded(true);
                    loadTables(newDb);
                    setIsLoading(false);
                } catch (innerErr: any) {
                    console.error("Client-side Load Error:", innerErr);

                    // If header mismatch or format error, assume ENCRYPTED
                    if (innerErr.message && (innerErr.message.includes("header") || innerErr.message.includes("format") || innerErr.message.includes("encrypt"))) {

                        setIsLoading(false);
                        setShowPwModal(true); // Trigger Password Flow
                        setPwError("Database requires password (or is corrupted).");

                    } else {
                        setError("Error opening database locally: " + innerErr.message);
                        setIsLoading(false);
                    }
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err: any) {
            setError(err.message);
            setIsLoading(false);
        }
    };

    // --- Proxy Handlers ---

    const handlePasswordSubmit = async (password: string) => {
        setPwError(null);
        setIsLoading(true);

        const fd = new FormData();
        if (currentFile) fd.append('file', currentFile);
        fd.append('password', password);
        fd.append('mode', 'check');

        try {
            const res = await fetch('/api/sqlite-proxy', {
                method: 'POST',
                body: fd
            });
            const data = await res.json();

            if (res.ok && data.success) {
                // Success!
                setDbPassword(password);
                setIsEncryptedMode(true);
                setIsDbLoaded(true);
                setTables((data.tables || []).map((t: any) => ({ ...t, expanded: false, columns: [] })));
                setShowPwModal(false);
                setQuery('SELECT * FROM sqlite_master WHERE type="table";');
            } else {
                setPwError(data.error || 'Invalid Password');
            }
        } catch (e: any) {
            setPwError(e.message || 'Network Error');
        } finally {
            setIsLoading(false);
        }
    };

    const loadTables = (database: any) => {
        try {
            const res = database.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'");
            if (res.length > 0) {
                const tableList: DBTable[] = res[0].values.map((row: any[]) => ({
                    name: row[0],
                    type: row[1] as 'table' | 'view',
                    rowCount: 0,
                    columns: [],
                    expanded: false
                }));
                // Fetch columns immediately for Client Side (WASM) as it's fast
                tableList.forEach(t => {
                    try {
                        const colRes = database.exec(`PRAGMA table_info("${t.name}")`);
                        if (colRes.length > 0) {
                            t.columns = colRes[0].values.map((c: any[]) => `${c[1]} (${c[2]})`);
                        }
                    } catch (e) { }
                });
                setTables(tableList);
            } else {
                setTables([]);
            }
        } catch (e) { console.error(e); }
    };

    const fetchColumnsForProxy = async (tableName: string) => {
        if (!currentFile) return;

        const fd = new FormData();
        fd.append('file', currentFile);
        fd.append('password', dbPassword);
        fd.append('query', `PRAGMA table_info("${tableName}")`); // Safe pragma
        fd.append('mode', 'query');

        try {
            const res = await fetch('/api/sqlite-proxy', { method: 'POST', body: fd });
            const data = await res.json();
            if (res.ok && data.success && data.result) {
                // PRAGMA result: cid, name, type, ...
                const nameIndex = data.result.columns.indexOf('name');
                const typeIndex = data.result.columns.indexOf('type');

                if (nameIndex >= 0) {
                    const cols = data.result.values.map((c: any[]) => `${c[nameIndex]} (${typeIndex >= 0 ? c[typeIndex] : '?'})`);
                    setTables(prev => prev.map(t => t.name === tableName ? { ...t, columns: cols } : t));
                }
            }
        } catch (e) { console.error(e); }
    };

    const toggleTableExpand = async (tableName: string) => {
        // Optimistic toggle
        setTables(prev => prev.map(t => t.name === tableName ? { ...t, expanded: !t.expanded } : t));

        const target = tables.find(t => t.name === tableName);
        // If Proxy Mode and no columns yet, fetch them
        if (isEncryptedMode && target && (!target.columns || target.columns.length === 0) && !target.expanded) {
            await fetchColumnsForProxy(tableName);
        }
    };

    const runQuery = async (sql: string = query) => {
        setError(null);
        const startTime = performance.now();

        if (isEncryptedMode) {
            // --- PROXY EXECUTION ---
            if (!currentFile) return;
            setIsLoading(true); // Show local loading for proxy request

            const fd = new FormData();
            fd.append('file', currentFile);
            fd.append('password', dbPassword);
            fd.append('query', sql);
            fd.append('mode', 'query');

            try {
                const res = await fetch('/api/sqlite-proxy', {
                    method: 'POST',
                    body: fd
                });
                const data = await res.json();

                if (res.ok && data.success && data.result) {
                    setResult(data.result);
                } else {
                    console.error(data.error);
                    setError(data.error || "Query failed on server");
                    setResult(null);
                }
            } catch (e: any) {
                setError(e.message);
            } finally {
                const endTime = performance.now();
                setExecutionTime(endTime - startTime);
                setIsLoading(false);
            }

        } else {
            // --- CLIENT SIDE WASM EXECUTION ---
            if (!db) return;
            try {
                const res = db.exec(sql);
                const endTime = performance.now();
                setExecutionTime(endTime - startTime);

                if (res.length > 0) {
                    setResult({
                        columns: res[0].columns,
                        values: res[0].values
                    });
                } else {
                    setResult({ columns: [], values: [] });
                }
            } catch (err: any) {
                setError(err.message);
                setResult(null);
            }
        }
    };

    const handleTableClick = (tableName: string) => {
        setActiveTable(tableName);
        const sql = `SELECT * FROM "${tableName}" LIMIT 100`;
        setQuery(sql);
        runQuery(sql);
    };

    const handleDownloadResult = () => {
        if (!result || result.values.length === 0) return;

        // CSV Generation
        const headers = result.columns.join(',');
        const rows = result.values.map(row =>
            row.map(cell => {
                if (cell === null) return 'NULL';
                if (typeof cell === 'string') return `"${cell.replace(/"/g, '""')}"`;
                return cell;
            }).join(',')
        );
        const csvContent = [headers, ...rows].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `result_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportDB = () => {
        if (isEncryptedMode) {
            alert("Exporting entire encrypted DB back is not yet supported in this version.");
            return;
        }
        if (!db) return;
        const data = db.export();
        const blob = new Blob([data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || "database.sqlite";
        a.click();
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col h-screen overflow-hidden">
            <PasswordModal
                isOpen={showPwModal}
                onClose={() => { setShowPwModal(false); setFileName(''); setCurrentFile(null); }}
                onSubmit={handlePasswordSubmit}
                error={pwError}
            />

            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-2">
                            <Database size={20} className="text-blue-500" /> SQLite Browser
                        </h1>
                        <p className="text-xs text-slate-400">
                            {isEncryptedMode ? <span className="text-orange-400 flex items-center gap-1 font-bold"><Lock size={12} /> Secure Session (Decrypted via Proxy)</span> : 'Client-side Viewer (WASM)'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isDbLoaded && (
                        <>
                            <span className="text-sm text-slate-400 px-3 py-1 bg-slate-800 rounded-lg border border-slate-700">
                                {fileName} ({tables.length} tables)
                            </span>
                            {!isEncryptedMode && (
                                <button onClick={handleExportDB} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors">
                                    <Save size={16} /> Export DB
                                </button>
                            )}
                        </>
                    )}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors border border-slate-700"
                    >
                        <Upload size={16} /> {isDbLoaded ? 'Open Another File' : 'Open Database'}
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".db,.sqlite,.sqlite3"
                        className="hidden"
                    />
                </div>
            </div>

            {/* Main Content */}
            {!isDbLoaded ? (
                // Empty State
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div
                        className="w-full max-w-xl h-64 border-2 border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center bg-slate-900/50 hover:bg-slate-900 hover:border-blue-500/50 transition-all cursor-pointer group"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform">
                            {isLoading ? <RefreshCw className="animate-spin text-blue-500" size={32} /> : <Database size={32} className="text-blue-400" />}
                        </div>
                        <h3 className="text-xl font-bold text-slate-200 mb-2">Drag & Drop or Click to Open</h3>
                        <p className="text-slate-500">Supports .db, .sqlite, .sqlite3 files</p>
                        <p className="text-xs text-slate-600 mt-4">
                            Auto-detects password protected files (SQLCipher/wxSQLite3)
                        </p>
                    </div>
                    {error && (
                        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 flex items-center gap-3">
                            <AlertCircle size={20} /> {error}
                        </div>
                    )}
                </div>
            ) : (
                // Workspace
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar: Tables */}
                    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
                        <div className="p-4 border-b border-slate-800">
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                Database Objects
                                <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">{tables.length}</span>
                            </h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {tables.map(table => (
                                <div key={table.name} className="flex flex-col">
                                    <div className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer group ${activeTable === table.name ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleTableExpand(table.name); }}
                                            className="p-1 mr-1 text-slate-500 hover:text-white rounded hover:bg-slate-700/50 transition-colors"
                                        >
                                            <ChevronRight size={14} className={`transition-transform duration-200 ${table.expanded ? 'rotate-90' : ''}`} />
                                        </button>
                                        <div className="flex-1 flex items-center gap-2 overflow-hidden" onClick={() => handleTableClick(table.name)}>
                                            {table.type === 'view' ? <Search size={14} className="opacity-50 shrink-0" /> : <Table size={14} className="shrink-0" />}
                                            <span className="truncate">{table.name}</span>
                                        </div>
                                    </div>
                                    {table.expanded && (
                                        <div className="ml-5 pl-3 border-l-2 border-slate-800/50 my-1 space-y-1 animate-in slide-in-from-top-2 duration-200">
                                            {table.columns && table.columns.length > 0 ? (
                                                table.columns.map((col, idx) => (
                                                    <div key={idx} className="text-[10px] text-slate-500 font-mono truncate flex items-center gap-1.5 px-2 py-0.5 hover:text-slate-300">
                                                        <div className="w-1 h-1 bg-slate-600 rounded-full shrink-0"></div>
                                                        {col}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-[10px] text-slate-600 italic px-2">Loading columns...</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Main Area: Query & Results */}
                    <div className="flex-1 flex flex-col bg-slate-950 min-w-0">
                        {/* Query Editor */}
                        <div className="h-48 border-b border-slate-800 flex flex-col">
                            <div className="p-2 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                                <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><FileCode size={14} /> SQL QUERY EDITOR</span>
                                <div className="flex gap-2">
                                    <button onClick={() => setQuery('')} className="p-1 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded">Clear</button>
                                    <button
                                        onClick={() => runQuery()}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded shadow-lg shadow-green-900/20 transition-all hover:scale-105"
                                    >
                                        {isLoading ? <RefreshCw className="animate-spin" size={12} /> : <Play size={12} fill="currentColor" />} RUN
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 relative">
                                <textarea
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="w-full h-full bg-[#1e1e1e] text-slate-200 p-4 font-mono text-sm resize-none focus:outline-none"
                                    spellCheck={false}
                                    placeholder="SELECT * FROM table..."
                                />
                            </div>
                        </div>

                        {/* Result Area */}
                        <div className="flex-1 flex flex-col min-h-0 relative">
                            {/* Toolbar */}
                            <div className="p-2 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="font-bold text-slate-500">RESULTS</span>
                                    {result && (
                                        <>
                                            <span className="text-slate-400">{result.values.length} rows used</span>
                                            <span className="text-slate-600">|</span>
                                            <span className="text-slate-400 text-[10px] font-mono">{executionTime.toFixed(2)}ms</span>
                                        </>
                                    )}
                                </div>
                                {result && result.values.length > 0 && (
                                    <button onClick={handleDownloadResult} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 px-2 py-1 rounded transition-colors">
                                        <Download size={12} /> Export CSV
                                    </button>
                                )}
                            </div>

                            {/* Grid / Error */}
                            <div className="flex-1 overflow-auto bg-slate-950 p-4">
                                {error && (
                                    <div className="p-4 bg-red-900/20 border border-red-500/20 rounded-lg text-red-200 mb-4 font-mono text-sm">
                                        SQL Error: {error}
                                    </div>
                                )}

                                {result ? (
                                    result.values.length > 0 ? (
                                        <div className="border border-slate-800 rounded-lg overflow-hidden inline-block min-w-full align-middle">
                                            <table className="min-w-full text-left text-sm whitespace-nowrap">
                                                <thead className="bg-slate-900 text-slate-400 font-bold">
                                                    <tr>
                                                        <th className="px-4 py-2 w-12 border-b border-r border-slate-800">#</th>
                                                        {result.columns.map((col, i) => (
                                                            <th key={i} className="px-4 py-2 border-b border-r border-slate-800 last:border-r-0 min-w-[100px]">{col}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800/50">
                                                    {result.values.map((row, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                                                            <td className="px-4 py-1.5 text-slate-600 bg-slate-900/20 text-xs border-r border-slate-800">{idx + 1}</td>
                                                            {row.map((cell, cIdx) => (
                                                                <td key={cIdx} className="px-4 py-1.5 text-slate-300 border-r border-slate-800/50 last:border-r-0 max-w-xs truncate" title={String(cell)}>
                                                                    {cell === null ? <span className="text-red-500/50 italic">NULL</span> : String(cell)}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-slate-500 italic">No results returned.</div>
                                    )
                                ) : (
                                    !error && (
                                        <div className="flex flex-col items-center justify-center h-full opacity-20">
                                            <Database size={64} />
                                            <p className="mt-4 text-lg">Waiting for query...</p>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
