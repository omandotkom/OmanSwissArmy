"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Database, Plus, Trash2, Play, Code2, Eye, ListChecks, FileSpreadsheet, X, Upload } from "lucide-react";
import * as XLSX from "xlsx"; // For download
import { DiffEditor } from "@monaco-editor/react";
import { useToast, ToastContainer } from "@/components/ui/toast";
import ConnectionManager from "@/components/ConnectionManager";
import { OracleConnection, getAllConnections } from "@/services/connection-storage";
import { trackActivity } from "@/lib/tracker";
import { useDebounce } from "@/hooks/useDebounce";
import { useMemo } from "react";

interface OwnerMapValue {
    master: OracleConnection | null;
    slave: OracleConnection | null;
}

export default function TwoWayComparisonPage() {
    const { toasts, addToast, removeToast } = useToast();
    const [missingConnModal, setMissingConnModal] = useState<{ owner: string } | null>(null);

    // Core State: List of Schemas to Scan
    // In Three-Way, this came from Excel. Here, user adds them manually.
    const [targetOwners, setTargetOwners] = useState<Set<string>>(new Set());
    const [newOwnerInput, setNewOwnerInput] = useState("");

    // Connections
    const [availableConnections, setAvailableConnections] = useState<OracleConnection[]>([]);
    const [ownerMappings, setOwnerMappings] = useState<Record<string, OwnerMapValue>>({});

    // Connection Manager UI
    const [isConnManagerOpen, setIsConnManagerOpen] = useState(false);
    const [selectingForOwner, setSelectingForOwner] = useState<string | null>(null);
    const [selectingForType, setSelectingForType] = useState<'MASTER' | 'SLAVE' | null>(null);

    // Job State
    const [jobStatus, setJobStatus] = useState<'IDLE' | 'STARTING' | 'RUNNING' | 'COMPLETED' | 'ERROR'>('IDLE');
    const [jobProgress, setJobProgress] = useState<any>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobLogs, setJobLogs] = useState<string[]>([]);
    const [totalProgress, setTotalProgress] = useState(0);
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Preview & Diff State
    const [isViewModalOpen, setViewModalOpen] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [previewPage, setPreviewPage] = useState(1);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [showIssuedOnly, setShowIssuedOnly] = useState(false);
    const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
    const [diffContent, setDiffContent] = useState<{ master: string, slave: string, patch: string, title: string }>({ master: '', slave: '', patch: '', title: '' });
    const [isLoadingDiff, setIsLoadingDiff] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);

    // Filters
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const debouncedFilters = useDebounce(columnFilters, 300);

    // Compilation State
    const [currentDiffObject, setCurrentDiffObject] = useState<{ owner: string, name: string, type: string } | null>(null);
    const [compileModal, setCompileModal] = useState<{
        direction: 'master_to_slave' | 'slave_to_master',
        sourceName: string,
        targetName: string,
        ddl: string,
        targetEnv: OracleConnection
    } | null>(null);
    const [isCompiling, setIsCompiling] = useState(false);

    // -- PREFERENCES --
    const [masterKeyword, setMasterKeyword] = useState("");
    const [slaveKeyword, setSlaveKeyword] = useState("");

    // Optimized Filtering with Memoization
    const filteredData = useMemo(() => {
        return previewData.filter(row => {
            // 1. Issued Only Filter
            if (showIssuedOnly) {
                const c = String(row['CONCLUSION'] || '');
                if (c.includes("Match") || c === 'Match') return false;
            }
            // 2. Column Filters (Debounced)
            return Object.keys(debouncedFilters).every(key => {
                const filterVal = debouncedFilters[key]?.toLowerCase();
                if (!filterVal) return true;
                const cellVal = String(row[key] || '').toLowerCase();
                return cellVal.includes(filterVal);
            });
        });
    }, [previewData, showIssuedOnly, debouncedFilters]);

    useEffect(() => {
        getAllConnections().then(setAvailableConnections);
    }, []);

    // Auto-Mapping Logic
    useEffect(() => {
        if (availableConnections.length === 0 || targetOwners.size === 0) return;

        setOwnerMappings(prev => {
            const next = { ...prev };
            let changed = false;

            targetOwners.forEach(owner => {
                const oName = owner.toUpperCase();

                // Helper to score connection
                const findBest = (keyword: string) => {
                    const kw = keyword.toUpperCase().trim();
                    const candidates = availableConnections.filter(c => {
                        const cName = c.name.toUpperCase();
                        const cUser = c.username.toUpperCase();
                        // Heuristic: Must somewhat relate to Owner or be a generic DB
                        return cUser === oName || cUser.includes(oName) || cName.includes(oName);
                    });

                    if (candidates.length === 0) return null;

                    return candidates.sort((a, b) => {
                        let scoreA = (a.username.toUpperCase() === oName ? 100 : 0) +
                            (a.username.toUpperCase().includes(oName) ? 50 : 0) +
                            (a.name.toUpperCase().includes(oName) ? 20 : 0);
                        let scoreB = (b.username.toUpperCase() === oName ? 100 : 0) +
                            (b.username.toUpperCase().includes(oName) ? 50 : 0) +
                            (b.name.toUpperCase().includes(oName) ? 20 : 0);

                        if (kw) {
                            if (a.name.toUpperCase().includes(kw) || a.host.toUpperCase().includes(kw)) scoreA += 500;
                            if (b.name.toUpperCase().includes(kw) || b.host.toUpperCase().includes(kw)) scoreB += 500;
                        }
                        return scoreB - scoreA;
                    })[0];
                };

                const bestMaster = findBest(masterKeyword);
                const bestSlave = findBest(slaveKeyword);

                // Initialize object if missing
                if (!next[owner]) next[owner] = { master: null, slave: null };

                if (bestMaster && next[owner].master?.id !== bestMaster.id) {
                    next[owner] = { ...next[owner], master: bestMaster };
                    changed = true;
                }
                if (bestSlave && next[owner].slave?.id !== bestSlave.id) {
                    next[owner] = { ...next[owner], slave: bestSlave };
                    changed = true;
                }
            });

            return changed ? next : prev;
        });

    }, [availableConnections, targetOwners, masterKeyword, slaveKeyword]);

    // Auto-scroll logs
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [jobLogs]);

    // Poll Job Status
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (jobStatus === 'STARTING' || jobStatus === 'RUNNING') {
            interval = setInterval(async () => {
                if (!jobId) return;
                try {
                    const res = await fetch(`/api/oracle/two-way-stream?jobId=${jobId}`);
                    const data = await res.json();

                    if (data && data.status) {
                        setJobStatus(data.status);
                        setJobProgress(data.summary);
                        setJobLogs(data.logs || []);
                        setTotalProgress(data.progress || 0);

                        if (data.status === 'COMPLETED' || data.status === 'ERROR') {
                            clearInterval(interval);
                        }
                    }
                } catch (e) {
                    console.error("Poll error", e);
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [jobStatus, jobId]);

    const addOwner = () => {
        const val = newOwnerInput.trim().toUpperCase();
        if (!val) return;
        if (targetOwners.has(val)) {
            addToast("Owner already added", "error");
            return;
        }
        setTargetOwners(prev => new Set(prev).add(val));

        trackActivity({
            action: 'TWO_WAY_SCHEMA_ADD',
            label: 'Add Schema',
            details: `Schema: ${val}`
        });

        setNewOwnerInput("");
    };

    const removeOwner = (owner: string) => {
        trackActivity({
            action: 'TWO_WAY_SCHEMA_REMOVE',
            label: 'Remove Schema',
            details: `Schema: ${owner}`
        });

        const next = new Set(targetOwners);
        next.delete(owner);
        setTargetOwners(next);

        // Clean mapping
        const nextMap = { ...ownerMappings };
        delete nextMap[owner];
        setOwnerMappings(nextMap);
    };

    const handleConnSelect = (conn: OracleConnection) => {
        trackActivity({
            action: 'TWO_WAY_SELECT_CONN',
            label: conn.name,
            details: `For: ${selectingForOwner} | Type: ${selectingForType}`
        });

        if (selectingForOwner && selectingForType) {
            setOwnerMappings(prev => ({
                ...prev,
                [selectingForOwner]: {
                    ...prev[selectingForOwner],
                    [selectingForType === 'MASTER' ? 'master' : 'slave']: conn
                }
            }));
        }
        setIsConnManagerOpen(false);
        setSelectingForOwner(null);
        setSelectingForType(null);
    };

    const startAnalysisJob = async () => {
        const owners = Array.from(targetOwners);
        if (owners.length === 0) {
            addToast("Please add at least one schema to scan", "error");
            return;
        }

        trackActivity({
            action: 'TWO_WAY_JOB_START',
            label: 'Start Comparison',
            details: `Schemas: ${owners.length}`
        });

        const missingConfig = owners.some(o => !ownerMappings[o]?.master || !ownerMappings[o]?.slave);
        if (missingConfig) {
            addToast("All listed owners must have both Master and Slave connections connected.", "error");
            return;
        }

        setJobStatus('STARTING');
        setJobProgress({ processed: 0, diffs: 0, missing: 0, new: 0 });
        setTotalProgress(0);
        setJobLogs([]);
        setJobId(null);

        try {
            const res = await fetch('/api/oracle/two-way-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ownerMappings })
            });
            const data = await res.json();
            if (data.jobId) {
                setJobId(data.jobId);
            } else {
                addToast("Failed to start job: " + data.error, "error");
                setJobStatus('IDLE');
            }
        } catch (e) {
            console.error("Start job error", e);
            addToast("Network error starting job", "error");
            setJobStatus('IDLE');
        }
    };

    // --- Reuse Three-Way View Logic ---

    const handleDownloadExcel = async () => {
        if (!jobId) return;
        setIsGeneratingExcel(true);
        trackActivity({
            action: 'TWO_WAY_DOWNLOAD_EXCEL',
            label: 'Download Excel',
            details: `JobId: ${jobId}`
        });
        try {
            const response = await fetch(`/api/oracle/two-way-stream?jobId=${jobId}&download=true`);
            const blob = await response.blob();
            const text = await blob.text();

            const workbook = XLSX.read(text, { type: "string" });
            XLSX.writeFile(workbook, `TwoWay_Analysis_${jobId}.xlsx`);
        } catch (e) {
            addToast("Failed to download", "error");
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    const fetchPreviewData = async () => {
        if (!jobId) return;
        trackActivity({
            action: 'TWO_WAY_VIEW_REPORT',
            label: 'View Report Preview',
            details: `JobId: ${jobId}`
        });

        setViewModalOpen(true);
        setIsLoadingPreview(true);
        setPreviewData([]);
        setColumnFilters({});
        setPreviewPage(1);

        try {
            const response = await fetch(`/api/oracle/two-way-stream?jobId=${jobId}&download=true`);
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) return;

            let csvText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                csvText += decoder.decode(value, { stream: true });
            }

            const lines = csvText.split('\n').filter(l => l.trim().length > 0);
            const headers = lines[0].split(',').map(h => h.trim());

            const rows = lines.slice(1).map(line => {
                const safeValues: string[] = [];
                let current = '';
                let inQuote = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') { inQuote = !inQuote; continue; }
                    if (char === ',' && !inQuote) { safeValues.push(current); current = ''; }
                    else current += char;
                }
                safeValues.push(current);

                const obj: any = {};
                headers.forEach((h, i) => obj[h] = safeValues[i]?.replace(/^"|"$/g, ''));
                return obj;
            });

            setPreviewData(rows);
        } catch (e) {
            addToast("Failed to load preview", "error");
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const handleViewDiff = async (row: any) => {
        const owner = row['OWNER'];
        const name = row['OBJECT_NAME'];
        const type = row['OBJECT_TYPE'];

        const currentMapping = ownerMappings[owner];
        if (!currentMapping?.master || !currentMapping?.slave) {
            addToast("Missing connection info for this owner", "error");
            return;
        }

        setIsDiffModalOpen(true);
        setIsLoadingDiff(true);
        setCurrentDiffObject({ owner, name, type });
        setDiffContent({ master: '', slave: '', patch: '', title: `${owner}.${name} (${type})` });

        trackActivity({
            action: 'TWO_WAY_VIEW_DIFF',
            label: `View Diff ${name}`,
            details: `Owner: ${owner} | Type: ${type}`
        });

        try {
            // Reuse the existing Diff Fetcher from Three-Way (it is generic enough!)
            const res = await fetch('/api/oracle/fetch-ddl-diff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    master: currentMapping.master,
                    slave: currentMapping.slave,
                    object: { owner, name, type }
                })
            });
            const data = await res.json();

            setDiffContent({
                master: data.masterDDL || '-- Error',
                slave: data.slaveDDL || '-- Error',
                patch: data.patchScript || '-- No Patch',
                title: `${owner}.${name} (${type})`
            });
        } catch (e) {
            addToast("Failed to fetch diff", "error");
        } finally {
            setIsLoadingDiff(false);
        }
    };

    const initiateCompile = (direction: 'master_to_slave' | 'slave_to_master') => {
        trackActivity({
            action: 'TWO_WAY_COMPILE_INIT',
            label: 'Init Compile',
            details: `Direction: ${direction}`
        });

        if (!currentDiffObject) return;
        const { owner, type } = currentDiffObject;
        if (type === 'TABLE') return; // Restriction

        const mapping = ownerMappings[owner];
        if (!mapping?.master || !mapping?.slave) return;

        let ddl = '';
        let targetEnv = null;
        let sourceName = '';
        let targetName = '';

        if (direction === 'master_to_slave') {
            ddl = diffContent.master;
            targetEnv = mapping.slave;
            sourceName = mapping.master!.name;
            targetName = mapping.slave!.name;
        } else {
            ddl = diffContent.slave;
            targetEnv = mapping.master;
            sourceName = mapping.slave!.name;
            targetName = mapping.master!.name;
        }

        if (!ddl || ddl.startsWith('-- Error') || ddl.startsWith('-- No Patch')) {
            addToast("Invalid DDL content. Cannot compile.", "error");
            return;
        }

        setCompileModal({ direction, sourceName, targetName, ddl, targetEnv: targetEnv! });
    };

    const executeCompile = async () => {
        if (!compileModal || !currentDiffObject) return;
        setIsCompiling(true);
        try {
            const res = await fetch('/api/oracle/execute-ddl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetEnv: compileModal.targetEnv,
                    ddl: compileModal.ddl,
                    objectType: currentDiffObject.type // Important for handling PACKAGE BODY vs PACKAGE
                })
            });
            const data = await res.json();

            if (res.ok) {
                addToast("Object compiled successfully!", "success");
                setCompileModal(null);

                trackActivity({
                    action: 'TWO_WAY_COMPILE_SUCCESS',
                    label: `Compiled ${currentDiffObject.name}`,
                    details: `Direction: ${compileModal.direction}`
                });

                // Refresh Diff
                // Reuse handleViewDiff but we need 'row'. Constructing dummy row
                if (currentDiffObject) {
                    handleViewDiff({
                        OWNER: currentDiffObject.owner,
                        OBJECT_NAME: currentDiffObject.name,
                        OBJECT_TYPE: currentDiffObject.type
                    });
                }

            } else {
                addToast(`Compilation Failed: ${data.error}`, "error");
            }
        } catch (e: any) {
            addToast("Network Error during compilation", "error");
        } finally {
            setIsCompiling(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link href="/oracle-object-validator" onClick={() => trackActivity({ action: 'CLICK_BACK', label: 'Back from Two-Way' })} className="group rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white flex items-center gap-2">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Link>
                        <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-100">
                            <Database className="h-6 w-6 text-emerald-500" />
                            Two-Way Comparison (Full Schema Sync)
                        </h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 py-8">

                {/* Setup Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                    {/* 1. Schema List Input */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 lg:col-span-1">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
                            <Plus className="text-emerald-500" /> 1. Define Schemas
                        </h2>
                        <div className="flex gap-2 mb-4">
                            <input
                                value={newOwnerInput}
                                onChange={(e) => setNewOwnerInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addOwner()}
                                placeholder="Schema Name (e.g. APPS)"
                                className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:border-emerald-500 outline-none uppercase placeholder:normal-case"
                            />
                            <button onClick={addOwner} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded px-3">
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {Array.from(targetOwners).length === 0 && (
                                <div className="text-zinc-500 text-sm italic text-center py-4">No schemas added.</div>
                            )}
                            {Array.from(targetOwners).map(owner => (
                                <div key={owner} className="flex justify-between items-center p-3 bg-zinc-950 rounded border border-zinc-800">
                                    <span className="font-mono text-emerald-400 font-bold">{owner}</span>
                                    <button onClick={() => removeOwner(owner)} className="text-red-500 hover:text-red-400">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 2. Connection Mapping (Reused Logic) */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 lg:col-span-2 flex flex-col">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
                            <Database className="text-blue-500" /> 2. Connection Mapping
                        </h2>

                        {/* Keyword Preference Inputs */}
                        <div className="flex gap-4 mb-4 bg-zinc-950 px-4 py-3 rounded-lg border border-zinc-800/80">
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Master Preference (Keyword)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. PROD"
                                    value={masterKeyword}
                                    onChange={(e) => setMasterKeyword(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Slave Preference (Keyword)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. DR"
                                    value={slaveKeyword}
                                    onChange={(e) => setSlaveKeyword(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:border-purple-500 outline-none"
                                />
                            </div>
                        </div>

                        {targetOwners.size === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-zinc-500 italic border border-zinc-800/50 rounded-lg bg-zinc-950/30 p-8">
                                Add Schema first to configure connections.
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto max-h-[300px] border border-zinc-800 rounded-lg bg-zinc-950/30">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-zinc-900 font-semibold text-zinc-400 sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 border-b border-zinc-800">Owner</th>
                                            <th className="p-3 border-b border-zinc-800">Master (Source)</th>
                                            <th className="p-3 border-b border-zinc-800">Slave (Target)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {Array.from(targetOwners).map(owner => (
                                            <tr key={owner} className="hover:bg-zinc-800/30">
                                                <td className="p-3 font-mono text-emerald-400 font-bold">{owner}</td>
                                                <td className="p-3">
                                                    <button
                                                        onClick={() => { setSelectingForOwner(owner); setSelectingForType('MASTER'); setIsConnManagerOpen(true); }}
                                                        className={`text-xs px-2 py-1.5 rounded w-full text-left truncate border ${ownerMappings[owner]?.master ? 'bg-blue-900/20 text-blue-300 border-blue-500/30' : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500'}`}
                                                    >
                                                        {ownerMappings[owner]?.master ? `${ownerMappings[owner].master!.name} (${ownerMappings[owner].master!.host})` : 'Select Master'}
                                                    </button>
                                                </td>
                                                <td className="p-3">
                                                    <button
                                                        onClick={() => { setSelectingForOwner(owner); setSelectingForType('SLAVE'); setIsConnManagerOpen(true); }}
                                                        className={`text-xs px-2 py-1.5 rounded w-full text-left truncate border ${ownerMappings[owner]?.slave ? 'bg-purple-900/20 text-purple-300 border-purple-500/30' : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500'}`}
                                                    >
                                                        {ownerMappings[owner]?.slave ? `${ownerMappings[owner].slave!.name} (${ownerMappings[owner].slave!.host})` : 'Select Slave'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Monitor & Progress (Copied from Three Way) */}
                {(jobStatus !== 'IDLE') && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 min-h-[200px] flex flex-col items-center justify-center text-center">
                        <h2 className="text-2xl font-bold text-white mb-4">
                            {jobStatus === 'STARTING' && "Initializing Job..."}
                            {jobStatus === 'RUNNING' && "Scanning & Comparing..."}
                            {jobStatus === 'COMPLETED' && "Comparison Completed!"}
                            {jobStatus === 'ERROR' && "Process Failed"}
                        </h2>

                        <div className="w-full max-w-2xl space-y-4 mb-6">
                            <div className="w-full bg-zinc-800 rounded-full h-4 overflow-hidden relative border border-zinc-700">
                                <div className={`h-full bg-gradient-to-r from-transparent via-blue-500 to-transparent w-1/2 absolute top-0 bottom-0 ${jobStatus !== 'COMPLETED' ? 'animate-shimmer' : 'hidden'}`} />
                                {jobStatus === 'COMPLETED' && <div className="h-full bg-emerald-600 w-full" />}
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-md">
                                    {jobStatus === 'COMPLETED' ? `Scanned ${jobProgress?.processed || 0} objects` : `Scanning... (${jobProgress?.processed || 0})`}
                                </div>
                            </div>

                            {/* Terminal */}
                            <div ref={logContainerRef} className="bg-black/80 backdrop-blur font-mono text-left text-xs p-3 rounded-lg border border-zinc-800 h-40 overflow-y-auto shadow-inner">
                                {jobLogs.map((log, i) => (
                                    <div key={i} className="text-green-400/90 whitespace-pre-wrap break-all border-l-2 border-transparent hover:border-zinc-700 pl-1">{log}</div>
                                ))}
                            </div>
                        </div>

                        {jobStatus === 'COMPLETED' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="text-2xl font-bold text-white">{jobProgress?.processed}</div>
                                        <div className="text-xs text-zinc-500">Total Objects</div>
                                    </div>
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="text-2xl font-bold text-red-500">{jobProgress?.missing}</div>
                                        <div className="text-xs text-zinc-500">Missing in Target</div>
                                    </div>
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="text-2xl font-bold text-blue-500">{jobProgress?.new}</div>
                                        <div className="text-xs text-zinc-500">Extra in Target</div>
                                    </div>
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="text-2xl font-bold text-orange-400">{jobProgress?.diffs}</div>
                                        <div className="text-xs text-zinc-500">Content Mismatch</div>
                                    </div>
                                </div>

                                <div className="flex gap-4 justify-center">
                                    <button onClick={fetchPreviewData} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2">
                                        <Eye className="w-4 h-4" /> View Report
                                    </button>
                                    <button onClick={handleDownloadExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2">
                                        <FileSpreadsheet className="w-4 h-4" /> Download Excel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {jobStatus === 'IDLE' && targetOwners.size > 0 && (
                    <div className="mt-8 flex justify-center">
                        <button onClick={startAnalysisJob} className="bg-emerald-600 hover:bg-emerald-500 hover:scale-105 text-white px-8 py-4 rounded-full font-bold shadow-lg transition-all flex items-center gap-2">
                            <Play className="fill-current w-5 h-5" /> Start Comparison
                        </button>
                    </div>
                )}

            </main>

            {/* Modals */}
            {isConnManagerOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl">
                        <div className="p-4 flex justify-between border-b border-zinc-800">
                            <h3 className="text-white font-bold">Select Connection</h3>
                            <button onClick={() => setIsConnManagerOpen(false)}><X className="text-zinc-500" /></button>
                        </div>
                        <div className="p-4">
                            <ConnectionManager
                                isOpen={true}
                                onClose={() => setIsConnManagerOpen(false)}
                                onSelect={handleConnSelect}
                            />
                        </div>
                    </div>
                </div>
            )}

            {isViewModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full h-full max-w-[95vw] max-h-[90vh] bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col">
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 rounded-t-xl">
                            <div>
                                <h3 className="text-xl font-bold text-white flex gap-2 items-center"><ListChecks className="text-blue-500" /> Report Preview</h3>
                                <div className="text-xs text-zinc-500 mt-1 flex flex-col gap-0.5 ml-8 font-mono">
                                    {Object.keys(ownerMappings).length > 0 ? (
                                        <>
                                            <span>MASTER: <span className="text-zinc-300 font-bold">{Array.from(new Set(Object.values(ownerMappings).map(m => m.master?.name).filter(Boolean))).join(', ') || 'Unknown'}</span></span>
                                            <span>SLAVE : <span className="text-zinc-300 font-bold">{Array.from(new Set(Object.values(ownerMappings).map(m => m.slave?.name).filter(Boolean))).join(', ') || 'Unknown'}</span></span>
                                        </>
                                    ) : (
                                        <span className="italic text-zinc-600">Source: External Report</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {Object.keys(columnFilters).some(k => columnFilters[k]) && (
                                    <button
                                        onClick={() => {
                                            setColumnFilters({});
                                            trackActivity({ action: "TWO_WAY_CLEAR_FILTERS", label: "Preview Modal" });
                                        }}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white flex items-center gap-2"
                                    >
                                        <X className="w-3 h-3" /> Clear Filters
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        const newVal = !showIssuedOnly;
                                        setShowIssuedOnly(newVal);
                                        setPreviewPage(1);
                                        trackActivity({
                                            action: 'TWO_WAY_TOGGLE_FILTER',
                                            label: 'Toggle Preview Filter',
                                            details: `ShowIssuedOnly: ${newVal}`
                                        });
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border ${showIssuedOnly
                                        ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30'
                                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                                        }`}
                                >
                                    {showIssuedOnly ? (
                                        <>
                                            <ListChecks className="w-4 h-4" /> Show All Objects
                                        </>
                                    ) : (
                                        <>
                                            <ListChecks className="w-4 h-4" /> Show Issued Only
                                        </>
                                    )}
                                </button>
                                <button onClick={() => {
                                    setViewModalOpen(false);
                                    trackActivity({ action: "TWO_WAY_CLOSE_PREVIEW", label: "Preview Modal" });
                                }} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-0">
                            {isLoadingPreview ? (
                                <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
                            ) : (
                                <>
                                    <table className="w-full text-left text-sm border-collapse">
                                        <thead className="bg-zinc-900 text-zinc-400 sticky top-0 z-10 shadow-lg">
                                            <tr>
                                                {previewData.length > 0 && Object.keys(previewData[0]).map(h => (
                                                    <th key={h} className="p-3 border-b border-zinc-800 font-semibold min-w-[150px] align-top">
                                                        <div className="flex flex-col gap-2">
                                                            <span className="flex items-center justify-between">
                                                                {h}
                                                                {columnFilters[h] && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                                                            </span>
                                                            <input
                                                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs font-normal text-zinc-300 focus:border-blue-500 outline-none placeholder:text-zinc-700"
                                                                placeholder={`Filter...`}
                                                                value={columnFilters[h] || ''}
                                                                onChange={e => {
                                                                    setColumnFilters(prev => ({ ...prev, [h]: e.target.value }));
                                                                    setPreviewPage(1);
                                                                }}
                                                                onBlur={(e) => {
                                                                    if (e.target.value) {
                                                                        trackActivity({
                                                                            action: "TWO_WAY_FILTER_COLUMN",
                                                                            label: h,
                                                                            details: `Value: ${e.target.value}`
                                                                        });
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                                            {filteredData
                                                .slice((previewPage - 1) * 100, previewPage * 100)
                                                .map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-zinc-900/50">
                                                        {Object.entries(row).map(([key, val]: [string, any], cIdx) => (
                                                            <td key={cIdx} className="p-3 border-b border-zinc-800/50 whitespace-nowrap">
                                                                {key === 'CONCLUSION' && (String(val).includes("Mismatch") || String(val).includes("Missing") || String(val).includes("Extra")) ? (
                                                                    <button onClick={() => handleViewDiff(row)} className="text-blue-400 hover:underline flex gap-1 items-center">
                                                                        {String(val)} <Eye className="w-3 h-3" />
                                                                    </button>
                                                                ) : String(val)}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                        </tbody>
                                        {filteredData.length === 0 && (
                                            <tbody>
                                                <tr>
                                                    <td colSpan={100} className="p-8 text-center text-zinc-500 italic">
                                                        No results match filters
                                                    </td>
                                                </tr>
                                            </tbody>
                                        )}
                                    </table>
                                </>
                            )}
                        </div>
                        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-between items-center text-sm text-zinc-400">
                            <div>
                                Total Rows: <span className="text-white font-bold">{filteredData.length}</span>
                            </div>
                            <div className="flex gap-2 items-center">
                                <button
                                    onClick={() => {
                                        setPreviewPage(p => Math.max(1, p - 1));
                                        trackActivity({ action: "TWO_WAY_PAGINATION", label: "Previous", details: `Page: ${previewPage - 1}` });
                                    }}
                                    disabled={previewPage === 1}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${previewPage === 1
                                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                                        }`}
                                >
                                    Previous
                                </button>
                                <span className="text-white font-mono px-2">Page {previewPage}</span>
                                <button
                                    onClick={() => {
                                        setPreviewPage(p => Math.min(Math.ceil(filteredData.length / 100), p + 1));
                                        trackActivity({ action: "TWO_WAY_PAGINATION", label: "Next", details: `Page: ${previewPage + 1}` });
                                    }}
                                    disabled={(previewPage * 100) >= filteredData.length}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${(previewPage * 100) >= filteredData.length
                                        ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                                        }`}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isDiffModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col">
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 rounded-t-xl">
                            <h3 className="text-xl font-bold text-white flex gap-2"><Code2 className="text-orange-500" /> Diff: {diffContent.title}</h3>
                            <div className="flex gap-3">
                                <button className="p-2 bg-blue-900/40 text-blue-200 hover:bg-blue-800 rounded text-xs font-semibold flex items-center gap-1"
                                    onClick={() => {
                                        trackActivity({
                                            action: 'TWO_WAY_DOWNLOAD_PATCH',
                                            label: 'Download Patch',
                                            details: `Title: ${diffContent.title}`
                                        });
                                        const blob = new Blob([diffContent.patch], { type: 'text/sql' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `PATCH.sql`;
                                        a.click();
                                    }}>
                                    <FileSpreadsheet className="w-3 h-3" /> Download Patch
                                </button>
                                <button onClick={() => {
                                    setIsDiffModalOpen(false);
                                    trackActivity({ action: "TWO_WAY_CLOSE_DIFF", label: "Diff Modal" });
                                }}><X className="text-zinc-400 hover:text-white" /></button>
                            </div>
                        </div>
                        <div className="flex-1 relative bg-[#1e1e1e] flex flex-col group">
                            <div className="flex-1 relative">
                                <DiffEditor
                                    height="100%" theme="vs-dark"
                                    original={diffContent.master} modified={diffContent.slave}
                                    language="sql" options={{ readOnly: true, renderSideBySide: true }}
                                />
                                {/* Overlay Buttons for Compilation */}
                                {currentDiffObject && (
                                    <>
                                        <div className="absolute top-0 left-0 w-1/2 p-2 pointer-events-none flex justify-between px-8 z-10">
                                            <div className="pointer-events-auto">
                                                {currentDiffObject.type !== 'TABLE' && (
                                                    <button
                                                        onClick={() => initiateCompile('master_to_slave')}
                                                        className="bg-zinc-800/80 hover:bg-emerald-600/80 text-emerald-400 hover:text-white text-xs px-3 py-1.5 rounded backdrop-blur-sm border border-emerald-500/20 shadow-sm flex items-center gap-2 transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        Push to Slave <ArrowLeft className="w-3 h-3 rotate-180" />
                                                    </button>
                                                )}
                                            </div>
                                            <span className="bg-zinc-800/80 text-emerald-400 text-xs px-2 py-1 rounded backdrop-blur-sm border border-emerald-500/20 shadow-sm">
                                                MASTER: {currentDiffObject ? ownerMappings[currentDiffObject.owner]?.master?.name : ''}
                                            </span>
                                        </div>
                                        <div className="absolute top-0 right-0 w-1/2 p-2 pointer-events-none flex justify-between px-8 z-10 flex-row-reverse">
                                            <div className="pointer-events-auto">
                                                {currentDiffObject.type !== 'TABLE' && (
                                                    <button
                                                        onClick={() => initiateCompile('slave_to_master')}
                                                        className="bg-zinc-800/80 hover:bg-blue-600/80 text-blue-400 hover:text-white text-xs px-3 py-1.5 rounded backdrop-blur-sm border border-blue-500/20 shadow-sm flex items-center gap-2 transition-all opacity-0 group-hover:opacity-100"
                                                    >
                                                        <ArrowLeft className="w-3 h-3" /> Push to Master
                                                    </button>
                                                )}
                                            </div>
                                            <span className="bg-zinc-800/80 text-blue-400 text-xs px-2 py-1 rounded backdrop-blur-sm border border-blue-500/20 shadow-sm">
                                                SLAVE: {currentDiffObject ? ownerMappings[currentDiffObject.owner]?.slave?.name : ''}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                            {diffContent.patch && (
                                <div className="h-[25%] border-t border-zinc-700 bg-zinc-900 flex flex-col">
                                    <div className="px-4 py-1 bg-zinc-950 text-xs text-green-500 font-bold border-b border-zinc-800">PATCH SCRIPT</div>
                                    <textarea readOnly value={diffContent.patch} className="w-full h-full bg-[#1e1e1e] text-zinc-300 font-mono text-xs p-4 resize-none outline-none" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Simulated Loading Modal for DDL Fetching */}
            {isLoadingDiff && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full">
                        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                        <h3 className="text-lg font-bold text-white">Fetching Object DDL...</h3>
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 animate-progress-indeterminate"></div>
                        </div>
                        <p className="text-xs text-zinc-500 text-center">Querying Master & Slave databases simultaneously...</p>
                    </div>
                </div>
            )}

            {/* Compilation Confirmation Modal */}
            {compileModal && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in duration-200">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-6 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            <Database className="w-5 h-5 text-orange-500" /> Confirm Compilation
                        </h3>
                        <p className="text-zinc-400 text-sm mb-6">
                            You are about to compile/overwrite an object in the database.
                            <br />
                            <span className="text-red-400 font-bold block mt-2">
                                ACTION: {compileModal.direction === 'master_to_slave' ? 'PUSH TO SLAVE' : 'PUSH TO MASTER'}
                            </span>
                        </p>

                        <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 mb-6 text-sm font-mono space-y-2">
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Source (Code):</span>
                                <span className="text-emerald-400">{compileModal.sourceName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-zinc-500">Target (Execute):</span>
                                <span className="text-blue-400">{compileModal.targetName}</span>
                            </div>
                            <div className="flex justify-between border-t border-zinc-800 pt-2 mt-2">
                                <span className="text-zinc-500">Object:</span>
                                <span className="text-white">{currentDiffObject?.owner}.{currentDiffObject?.name}</span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setCompileModal(null)}
                                disabled={isCompiling}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeCompile}
                                disabled={isCompiling}
                                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-orange-900/20"
                            >
                                {isCompiling && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                {isCompiling ? 'Compiling...' : 'Confirm & Compile'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
