"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Database, FileSpreadsheet, Upload, X, Eye, ListChecks, Play, Code2 } from "lucide-react";
import * as XLSX from "xlsx";
import { DiffEditor } from "@monaco-editor/react";
import ConnectionManager from "@/components/ConnectionManager";
import { OracleConnection, getAllConnections } from "@/services/connection-storage";

interface ExcelRow {
    [key: string]: any;
}

interface OwnerMapValue {
    master: OracleConnection | null;
    slave: OracleConnection | null;
}

export default function ThreeWayComparisonPage() {
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [isParsingExcel, setIsParsingExcel] = useState(false);
    const [excelData, setExcelData] = useState<any[]>([]); // { owner, name, type }
    const [excelOwners, setExcelOwners] = useState<Set<string>>(new Set());

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

    // Preview Logic state
    const [isViewModalOpen, setViewModalOpen] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);

    // Diff Viewer State
    const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
    const [diffContent, setDiffContent] = useState<{ master: string, slave: string, title: string }>({ master: '', slave: '', title: '' });
    const [isLoadingDiff, setIsLoadingDiff] = useState(false);

    const [jobLogs, setJobLogs] = useState<string[]>([]);
    const [totalProgress, setTotalProgress] = useState(0);
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getAllConnections().then(setAvailableConnections);
    }, []);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [jobLogs]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (jobStatus === 'STARTING' || jobStatus === 'RUNNING') {
            interval = setInterval(async () => {
                if (!jobId) return;
                try {
                    const res = await fetch(`/api/oracle/three-way-stream?jobId=${jobId}`);
                    const data = await res.json();

                    // Route returns the job object directly
                    if (data && data.status) {
                        setJobStatus(data.status);
                        setJobProgress(data.summary);
                        setJobLogs(data.logs || []);
                        if (typeof data.progress === 'number') setTotalProgress(data.progress);

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

    const findBestMatches = (owner: string, conns: OracleConnection[]) => {
        return conns.filter(c => c.username.toUpperCase() === owner || c.username.toUpperCase().includes(owner));
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

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        setExcelFile(uploadedFile);
        setIsParsingExcel(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: "binary" });
                const owners = new Set<string>();
                const parsedItems: any[] = [];

                wb.SheetNames.forEach(sheetName => {
                    const ws = wb.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: "" });

                    if (data.length > 0) {
                        const firstRow = data[0];
                        const keys = Object.keys(firstRow);

                        const findKey = (targets: string[]) => {
                            return keys.find(k => targets.includes(k.trim().toUpperCase()));
                        };

                        const ownerKey = findKey(['OWNER']);
                        const nameKey = findKey(['OBJECT_NAME', 'OBJECT NAME', 'NAME', 'OBJECT_NAME', 'OBJECTNAME']);
                        const typeKey = findKey(['OBJECT_TYPE', 'OBJECT TYPE', 'TYPE', 'OBJECTTYPE']);

                        // Fallback: If no TYPE column, use Sheet Name (e.g. "PROCEDURE", "TABLE")
                        // Normalize Sheet Name: remove plurals if strictly needed, but roughly singulars are used in your file
                        const defaultType = sheetName.trim().toUpperCase();

                        data.forEach(row => {
                            const owner = ownerKey ? String(row[ownerKey] || '').trim().toUpperCase() : '';
                            const name = nameKey ? String(row[nameKey] || '').trim().toUpperCase() : '';

                            // Use column value if exists, else use Sheet Name
                            let type = typeKey ? String(row[typeKey] || '').trim().toUpperCase() : defaultType;

                            if (owner && name) {
                                // Basic cleanup for type if it comes from Sheet Name commonly associated with plurals or junk
                                // But effectively "PROCEDURE" sheet -> "PROCEDURE" type is perfect.
                                parsedItems.push({ owner, name, type });
                                owners.add(owner);
                            }
                        });
                    }
                });

                if (parsedItems.length === 0) {
                    alert("No objects found in Excel. Please check column headers (OWNER, OBJECT_NAME, OBJECT_TYPE).");
                }

                setExcelData(parsedItems);
                setExcelOwners(owners);

                const newMapping: Record<string, OwnerMapValue> = {};
                owners.forEach(owner => {
                    const matches = findBestMatches(owner, availableConnections);
                    let m: OracleConnection | null = null;
                    let s: OracleConnection | null = null;

                    if (matches.length >= 1) {
                        const prod = matches.find(c => c.name.toUpperCase().includes('PROD') || c.name.toUpperCase().includes('MASTER'));
                        const dev = matches.find(c => c.name.toUpperCase().includes('DEV') || c.name.toUpperCase().includes('UAT') || c.name.toUpperCase().includes('SLAVE') || c.name.toUpperCase().includes('NON'));

                        if (prod) m = prod;
                        if (dev) s = dev;

                        if (!m && matches.length > 0) m = matches[0];
                        if (!s && matches.length > 1) s = matches[1];

                        if (m?.id === s?.id) s = null;
                    }

                    newMapping[owner] = { master: m, slave: s };
                });
                setOwnerMappings(newMapping);

            } catch (err) {
                console.error("Excel parse error", err);
                alert("Failed to parse Excel.");
            } finally {
                setIsParsingExcel(false);
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    const startAnalysisJob = async () => {
        const owners = Array.from(excelOwners);
        const missingConfig = owners.some(o => !ownerMappings[o]?.master || !ownerMappings[o]?.slave);
        if (missingConfig) {
            if (!confirm("Some owners are missing connections. Proceed?")) return;
        }

        setJobStatus('STARTING');
        setJobProgress({ processed: 0, diffs: 0, missing: 0, new: 0 }); // Init
        setTotalProgress(0);
        setJobLogs([]);
        setJobId(null);

        try {
            const res = await fetch('/api/oracle/three-way-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ excelData, ownerMappings })
            });
            const data = await res.json();
            if (data.jobId) {
                setJobId(data.jobId);
            } else {
                alert("Failed to start job: " + data.error);
                setJobStatus('IDLE');
            }
        } catch (e) {
            console.error("Start job error", e);
            alert("Network error starting job");
            setJobStatus('IDLE');
        }
    };

    const downloadReport = () => {
        if (!jobId) return;
        window.open(`/api/oracle/three-way-stream?jobId=${jobId}&download=true`, '_blank');
    };

    const fetchPreviewData = async () => {
        if (!jobId) return;
        setViewModalOpen(true);
        setIsLoadingPreview(true);
        setPreviewData([]);

        try {
            const response = await fetch(`/api/oracle/three-way-stream?jobId=${jobId}&download=true`);
            if (!response.body) throw new Error("No body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let csvText = '';

            let bytesRead = 0;
            const MAX_PREVIEW_BYTES = 500 * 1024; // 500KB for ~300 rows

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                csvText += decoder.decode(value, { stream: true });
                bytesRead += value.length;

                if (bytesRead > MAX_PREVIEW_BYTES) {
                    await reader.cancel();
                    break;
                }
            }

            const lines = csvText.split('\n').filter(l => l.trim().length > 0);
            const headers = lines[0].split(',').map(h => h.trim());

            const rows = lines.slice(1, 301).map(line => {
                const safeValues: string[] = [];
                let current = '';
                let inQuote = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') { inQuote = !inQuote; continue; }
                    if (char === ',' && !inQuote) {
                        safeValues.push(current); current = '';
                    } else {
                        current += char;
                    }
                }
                safeValues.push(current);

                const obj: any = {};
                headers.forEach((h, i) => {
                    obj[h] = safeValues[i]?.replace(/^"|"$/g, '');
                });
                return obj;
            });

            setPreviewData(rows);

        } catch (e) {
            console.error("Preview error", e);
            alert("Failed to load preview");
        } finally {
            setIsLoadingPreview(false);
        }
    };

    const handleViewDiff = async (row: any) => {
        // Row keys are likely uppercase: OWNER, OBJECT_NAME, OBJECT_TYPE, etc. based on CSV header
        const owner = row['OWNER'];
        const name = row['OBJECT_NAME'];
        const type = row['OBJECT_TYPE'];

        if (!owner || !name || !type) {
            alert("Invalid Object Identifiers");
            return;
        }

        const mapping = ownerMappings[owner];
        if (!mapping || !mapping.master || !mapping.slave) {
            alert(`No complete connection mapping found for owner ${owner}`);
            return;
        }

        setIsDiffModalOpen(true);
        setIsLoadingDiff(true);
        setDiffContent({ master: '', slave: '', title: `${owner}.${name} (${type})` });

        try {
            const res = await fetch('/api/oracle/fetch-ddl-diff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    master: mapping.master,
                    slave: mapping.slave,
                    object: { owner, name, type }
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setDiffContent({
                master: data.masterDDL,
                slave: data.slaveDDL,
                title: `${owner}.${name} (${type})`
            });

        } catch (e: any) {
            alert("Failed to fetch DDL: " + e.message);
            setDiffContent(prev => ({ ...prev, master: 'Error fetching DDL', slave: 'Error fetching DDL' }));
        } finally {
            setIsLoadingDiff(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
            <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/oracle-object-validator"
                            className="group flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                            Back
                        </Link>
                        <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-100">
                            <Database className="h-6 w-6 text-purple-500" />
                            Three Way Comparison (Large Data Support)
                        </h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* Excel Upload */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 relative overflow-hidden lg:col-span-1">
                        {isParsingExcel && (
                            <div className="absolute inset-0 z-20 bg-zinc-900/80 flex items-center justify-center rounded-xl">
                                <Loader2 className="h-8 w-8 animate-spin text-green-500" />
                            </div>
                        )}
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <FileSpreadsheet className="text-green-500" /> 1. Object DB (Excel)
                        </h2>
                        <div className="space-y-4">
                            <div className="relative group cursor-pointer">
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className="border-2 border-dashed border-zinc-700 rounded-lg p-6 text-center transition-colors group-hover:border-blue-500 group-hover:bg-zinc-800/50">
                                    <Upload className="mx-auto h-8 w-8 text-zinc-500 mb-2 group-hover:text-blue-400" />
                                    {excelFile ? (
                                        <p className="text-sm text-green-400 font-medium">{excelFile.name}</p>
                                    ) : (
                                        <p className="text-sm text-zinc-400">Click or Drag Excel file here</p>
                                    )}
                                </div>
                            </div>
                            {excelData.length > 0 && (
                                <div className="text-xs text-zinc-500 font-mono">
                                    Parsed {excelData.length} items. Owners: {Array.from(excelOwners).join(", ")}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Connection Mapping */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 lg:col-span-2 flex flex-col">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Database className="text-blue-500" /> 2. Connection Mapping (Per Owner)
                        </h2>

                        {excelOwners.size === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-zinc-500 italic border border-zinc-800/50 rounded-lg bg-zinc-950/30 p-8">
                                Upload Excel to configure connection mappings.
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto max-h-[300px] border border-zinc-800 rounded-lg bg-zinc-950/30 mb-4">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-zinc-900 font-semibold text-zinc-400 sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 border-b border-zinc-800">Owner</th>
                                            <th className="p-3 border-b border-zinc-800">Master (Higher Environment)</th>
                                            <th className="p-3 border-b border-zinc-800">Slave (Lower Environment)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {Array.from(excelOwners).map(owner => (
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

                {/* Processing Monitor */}
                {(jobStatus !== 'IDLE') && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 min-h-[200px] flex flex-col items-center justify-center text-center">
                        <h2 className="text-2xl font-bold text-white mb-4">
                            {jobStatus === 'STARTING' && "Initializing Job..."}
                            {jobStatus === 'RUNNING' && "Analyzing Object Metadata..."}
                            {jobStatus === 'COMPLETED' && "Analysis Completed!"}
                            {jobStatus === 'ERROR' && "Analysis Failed"}
                        </h2>

                        {/* Progress Bar & Logs */}
                        <div className="w-full max-w-2xl space-y-4 mb-6">
                            {/* Progress Bar */}
                            <div className="w-full bg-zinc-800 rounded-full h-4 overflow-hidden relative border border-zinc-700">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300 ease-out"
                                    style={{ width: `${totalProgress}%` }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-md">
                                    {totalProgress}%
                                </div>
                            </div>

                            {/* Stats */}
                            {jobProgress && (
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Processed: <strong className="text-white">{jobProgress.processed.toLocaleString()}</strong></span>
                                    <span>Issues: <strong className="text-orange-400">{(jobProgress.diffs + jobProgress.missing + jobProgress.new).toLocaleString()}</strong></span>
                                </div>
                            )}

                            {/* Terminal / Logs */}
                            <div
                                ref={logContainerRef}
                                className="bg-black/80 backdrop-blur font-mono text-left text-xs p-3 rounded-lg border border-zinc-800 h-40 overflow-y-auto shadow-inner"
                            >
                                <div className="space-y-1">
                                    {jobLogs.length === 0 && <span className="text-zinc-600 italic">Waiting for logs...</span>}
                                    {jobLogs.map((log, i) => (
                                        <div key={i} className="text-green-400/90 whitespace-pre-wrap break-all border-l-2 border-transparent hover:border-zinc-700 pl-1">
                                            {log}
                                        </div>
                                    ))}
                                    {jobStatus === 'RUNNING' && (
                                        <div className="animate-pulse text-green-500/50">_</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {jobStatus === 'COMPLETED' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="text-2xl font-bold text-white">{jobProgress?.processed?.toLocaleString()}</div>
                                        <div className="text-xs text-zinc-500 uppercase">Total Objects</div>
                                    </div>
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="text-2xl font-bold text-orange-400">{jobProgress?.diffs?.toLocaleString()}</div>
                                        <div className="text-xs text-zinc-500 uppercase">Differences</div>
                                    </div>
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="text-2xl font-bold text-red-400">{jobProgress?.missing?.toLocaleString()}</div>
                                        <div className="text-xs text-zinc-500 uppercase">Source Missing</div>
                                    </div>
                                    <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="text-2xl font-bold text-blue-400">{jobProgress?.new?.toLocaleString()}</div>
                                        <div className="text-xs text-zinc-500 uppercase">New in Slave</div>
                                    </div>
                                </div>

                                {jobProgress?.debug && (
                                    <div className="text-xs text-zinc-600 bg-zinc-950/50 p-3 rounded border border-zinc-900 grid grid-cols-3 gap-4">
                                        <div>Master DB Rows: <span className="text-zinc-400">{jobProgress.debug.masterRows}</span></div>
                                        <div>Slave DB Rows: <span className="text-zinc-400">{jobProgress.debug.slaveRows}</span></div>
                                        <div>Excel Rows (Mapped): <span className="text-zinc-400">{jobProgress.debug.excelRows}</span></div>
                                    </div>
                                )}

                                <div className="flex flex-col gap-3 mx-auto w-full max-w-md">
                                    <button
                                        onClick={() => fetchPreviewData()}
                                        className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-3 rounded-full font-bold shadow-lg transition-all hover:scale-105 border border-zinc-700"
                                    >
                                        <Eye className="w-5 h-5" /> View Report (Preview)
                                    </button>

                                    <button
                                        onClick={downloadReport}
                                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-emerald-900/20 transition-all hover:scale-105"
                                    >
                                        <FileSpreadsheet className="w-5 h-5" /> Download Full Report (.csv)
                                    </button>
                                </div>
                                <p className="text-xs text-zinc-500">
                                    The result is in CSV format, compatible with Microsoft Excel.
                                </p>
                            </div>
                        )}

                        {jobStatus === 'ERROR' && (
                            <div className="text-red-400 bg-red-900/20 p-4 rounded-lg border border-red-900/50">
                                Error: {jobProgress?.error || "Unknown Error occurred."}
                            </div>
                        )}
                    </div>
                )}

                {jobStatus === 'IDLE' && excelData.length === 0 && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 text-center text-zinc-400">
                        <Database className="mx-auto h-12 w-12 text-zinc-600 mb-4" />
                        <h3 className="text-lg font-medium text-zinc-300">Ready to Analyze Large Datasets</h3>
                        <p className="max-w-md mx-auto mt-2">
                            This tool uses streaming technology to handle millions of objects without crashing your browser.
                            Upload an Excel file (Object DB) and map connections to start.
                        </p>
                    </div>
                )}

                {/* Start Button */}
                {jobStatus === 'IDLE' && excelData.length > 0 && (
                    <div className="mt-8 flex justify-center">
                        <button
                            onClick={startAnalysisJob}
                            className={`flex items-center gap-3 px-8 py-4 rounded-full font-bold text-lg shadow-xl shadow-green-900/20 transition-all ${true
                                ? 'bg-green-600 hover:bg-green-500 hover:scale-105 text-white'
                                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                }`}
                        >
                            <Play className="fill-current w-6 h-6" /> Start Deep Analysis
                        </button>
                    </div>
                )}

            </main>

            {/* Connection Manager Modal */}
            {isConnManagerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
                            <h3 className="text-lg font-semibold text-white">Select Connection for {selectingForOwner} ({selectingForType})</h3>
                            <button onClick={() => setIsConnManagerOpen(false)} className="text-zinc-500 hover:text-white">
                                <X className="h-5 w-5" />
                            </button>
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

            {/* Preview Modal */}
            {isViewModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full h-full max-w-[95vw] max-h-[90vh] bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between border-b border-zinc-800 p-4 bg-zinc-900/50 rounded-t-xl">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <ListChecks className="text-blue-500" /> Report Preview
                                </h3>
                                <p className="text-xs text-zinc-500">Showing first 300 rows of analysis result.</p>
                            </div>
                            <button onClick={() => setViewModalOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-0">
                            {isLoadingPreview ? (
                                <div className="h-full flex flex-col items-center justify-center gap-4">
                                    <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
                                    <p className="text-zinc-500">Fetching report preview...</p>
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm border-collapse min-w-max">
                                    <thead className="bg-zinc-900 text-zinc-400 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            {previewData.length > 0 && Object.keys(previewData[0]).map((header) => (
                                                <th key={header} className="p-3 border-b border-zinc-800 font-semibold whitespace-nowrap">
                                                    {header.replace(/_/g, ' ')}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                                        {previewData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-zinc-900/50 transition-colors">
                                                {Object.entries(row).map(([key, val]: [string, any], cIdx) => {
                                                    const isConclusion = key === 'CONCLUSION';
                                                    const isDiffable = isConclusion && String(val).includes("Terdapat perubahan");
                                                    return (
                                                        <td
                                                            key={cIdx}
                                                            className={`p-3 border-b border-zinc-800/50 whitespace-nowrap ${isDiffable ? 'cursor-pointer hover:bg-zinc-800 hover:text-blue-400 group relative' : ''}`}
                                                            title={String(val)}
                                                            onClick={() => isDiffable && handleViewDiff(row)}
                                                        >
                                                            {isDiffable && (
                                                                <span className="hidden group-hover:inline absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-2 text-blue-500">
                                                                    <Eye className="w-4 h-4" />
                                                                </span>
                                                            )}
                                                            {val === 'YES' ? <span className="text-emerald-500 font-bold text-xs bg-emerald-900/20 px-2 py-0.5 rounded">YES</span> :
                                                                val === 'NO' ? <span className="text-zinc-600 text-xs">NO</span> :
                                                                    String(val)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 rounded-b-xl flex justify-between items-center">
                            <div className="text-xs text-zinc-500">
                                * This is a partial preview. Download the full CSV for comprehensive analysis.
                            </div>
                            <button onClick={() => setViewModalOpen(false)} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm font-medium">
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Diff Viewer Modal */}
            {isDiffModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between border-b border-zinc-800 p-4 bg-zinc-900/50 rounded-t-xl shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Code2 className="text-orange-500" /> Diff Viewer: <span className="text-zinc-400 font-mono text-base">{diffContent.title}</span>
                                </h3>
                            </div>
                            <button onClick={() => setIsDiffModalOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 relative bg-[#1e1e1e]">
                            {isLoadingDiff && (
                                <div className="absolute inset-0 z-10 bg-zinc-900/50 flex items-center justify-center">
                                    <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
                                </div>
                            )}
                            <DiffEditor
                                height="100%"
                                theme="vs-dark"
                                original={diffContent.master}
                                modified={diffContent.slave}
                                language="sql"
                                options={{
                                    readOnly: true,
                                    renderSideBySide: true,
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    fontSize: 12
                                }}
                            />
                        </div>
                        <div className="p-2 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500 flex justify-between px-4">
                            <span>Left: Master (Source)</span>
                            <span>Right: Slave (Target) - If different, this reflects currently deployed code.</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
