"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Database, Plus, Trash2, Play, Code2, Eye, ListChecks, FileSpreadsheet, X, Upload } from "lucide-react";
import * as XLSX from "xlsx"; // For download
import { DiffEditor } from "@monaco-editor/react";
import { useToast, ToastContainer } from "@/components/ui/toast";
import ConnectionManager from "@/components/ConnectionManager";
import { OracleConnection, getAllConnections } from "@/services/connection-storage";

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

    useEffect(() => {
        getAllConnections().then(setAvailableConnections);
    }, []);

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
        setNewOwnerInput("");
    };

    const removeOwner = (owner: string) => {
        const next = new Set(targetOwners);
        next.delete(owner);
        setTargetOwners(next);

        // Clean mapping
        const nextMap = { ...ownerMappings };
        delete nextMap[owner];
        setOwnerMappings(nextMap);
    };

    const handleConnSelect = (conn: OracleConnection) => {
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
        setViewModalOpen(true);
        setIsLoadingPreview(true);
        setPreviewData([]);
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
        setDiffContent({ master: '', slave: '', patch: '', title: `${owner}.${name} (${type})` });

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


    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link href="/oracle-object-validator" className="group rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white flex items-center gap-2">
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
                            <ConnectionManager isOpen={true} onClose={() => setIsConnManagerOpen(false)} onSelect={handleConnSelect} />
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
                                <button
                                    onClick={() => {
                                        setShowIssuedOnly(!showIssuedOnly);
                                        setPreviewPage(1);
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
                                <button onClick={() => setViewModalOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
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
                                        <thead className="bg-zinc-900 text-zinc-400 sticky top-0">
                                            <tr>
                                                {previewData.length > 0 && Object.keys(previewData[0]).map(h => (
                                                    <th key={h} className="p-3 border-b border-zinc-800 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                                            {(showIssuedOnly
                                                ? previewData.filter(row => {
                                                    const c = String(row['CONCLUSION'] || '');
                                                    return !c.includes("Match") && c !== 'Match';
                                                })
                                                : previewData
                                            ).slice((previewPage - 1) * 100, previewPage * 100).map((row, idx) => (
                                                <tr key={idx} className="hover:bg-zinc-900/50">
                                                    {Object.entries(row).map(([key, val]: [string, any], cIdx) => (
                                                        <td key={cIdx} className="p-3 border-b border-zinc-800/50 whitespace-nowrap">
                                                            {key === 'CONCLUSION' && String(val).includes("Mismatch") ? (
                                                                <button onClick={() => handleViewDiff(row)} className="text-blue-400 hover:underline flex gap-1 items-center">
                                                                    {String(val)} <Eye className="w-3 h-3" />
                                                                </button>
                                                            ) : String(val)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </div>
                        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-between items-center text-sm text-zinc-400">
                            <div>
                                Total Rows: <span className="text-white font-bold">
                                    {showIssuedOnly
                                        ? previewData.filter(row => { const c = String(row['CONCLUSION'] || ''); return !c.includes("Match") && c !== 'Match'; }).length
                                        : previewData.length}
                                </span>
                            </div>
                            <div className="flex gap-2 items-center">
                                <button
                                    onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
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
                                        const filteredLen = showIssuedOnly
                                            ? previewData.filter(row => { const c = String(row['CONCLUSION'] || ''); return !c.includes("Match") && c !== 'Match'; }).length
                                            : previewData.length;
                                        setPreviewPage(p => Math.min(Math.ceil(filteredLen / 100), p + 1));
                                    }}
                                    disabled={(previewPage * 100) >= (showIssuedOnly
                                        ? previewData.filter(row => { const c = String(row['CONCLUSION'] || ''); return !c.includes("Match") && c !== 'Match'; }).length
                                        : previewData.length)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${(previewPage * 100) >= (showIssuedOnly
                                        ? previewData.filter(row => { const c = String(row['CONCLUSION'] || ''); return !c.includes("Match") && c !== 'Match'; }).length
                                        : previewData.length)
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
                                        const blob = new Blob([diffContent.patch], { type: 'text/sql' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `PATCH.sql`;
                                        a.click();
                                    }}>
                                    <FileSpreadsheet className="w-3 h-3" /> Download Patch
                                </button>
                                <button onClick={() => setIsDiffModalOpen(false)}><X className="text-zinc-400 hover:text-white" /></button>
                            </div>
                        </div>
                        <div className="flex-1 relative bg-[#1e1e1e] flex flex-col">
                            <div className="flex-1 relative">
                                <DiffEditor
                                    height="100%" theme="vs-dark"
                                    original={diffContent.master} modified={diffContent.slave}
                                    language="sql" options={{ readOnly: true, renderSideBySide: true }}
                                />
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
        </div>
    );
}
