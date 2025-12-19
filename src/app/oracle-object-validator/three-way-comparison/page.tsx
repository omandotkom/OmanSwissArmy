"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Database, FileSpreadsheet, Upload, X, Eye, ListChecks, Play, Code2, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import { DiffEditor } from "@monaco-editor/react";
import { useToast, ToastContainer } from "@/components/ui/toast";
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
    const { toasts, addToast, removeToast } = useToast();
    const reportUploadRef = useRef<HTMLInputElement>(null);
    const [missingConnModal, setMissingConnModal] = useState<{ owner: string } | null>(null);
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
    const [previewPage, setPreviewPage] = useState(1);
    const [isLoadingPreview, setIsLoadingPreview] = useState(false);
    const [showIssuedOnly, setShowIssuedOnly] = useState(false);

    // Diff Viewer State
    const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
    const [diffContent, setDiffContent] = useState<{ master: string, slave: string, patch: string, title: string }>({ master: '', slave: '', patch: '', title: '' });
    const [isLoadingDiff, setIsLoadingDiff] = useState(false);
    const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);

    const [jobLogs, setJobLogs] = useState<string[]>([]);
    const [totalProgress, setTotalProgress] = useState(0);
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getAllConnections().then(setAvailableConnections);
    }, []);

    // -------------------------------------------------------------------------
    // Auto-Mapping Logic (Ported from Env Checker)
    // -------------------------------------------------------------------------
    const [env1Keyword, setEnv1Keyword] = useState("");
    const [env2Keyword, setEnv2Keyword] = useState("");
    const [isAutoMapping, setIsAutoMapping] = useState(false);
    const workerRef = useRef<Worker | null>(null);

    // Initialize Worker
    useEffect(() => {
        workerRef.current = new Worker(new URL('./auto-mapping.worker.ts', import.meta.url));
        workerRef.current.onmessage = (event: MessageEvent<any>) => {
            // Worker returns { owner: { env1, env2 } }
            // We need to map env1 -> master, env2 -> slave
            const rawMapping = event.data;
            const mapped: Record<string, OwnerMapValue> = {};

            Object.keys(rawMapping).forEach(owner => {
                mapped[owner] = {
                    master: rawMapping[owner].env1,
                    slave: rawMapping[owner].env2
                };
            });

            setOwnerMappings(mapped);
            setIsAutoMapping(false);
        };
        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    const applyAutoMapping = (ownersList: string[]) => {
        if (!workerRef.current) return;
        setIsAutoMapping(true);
        workerRef.current.postMessage({
            owners: ownersList,
            connections: availableConnections,
            env1Keyword, // Acts as Master Preference
            env2Keyword  // Acts as Slave Preference
        });
    };

    // Trigger Auto-Mapping when dependencies change
    useEffect(() => {
        const ownersList = Array.from(excelOwners);
        if (ownersList.length > 0 && availableConnections.length > 0) {
            applyAutoMapping(ownersList);
        }
    }, [env1Keyword, env2Keyword, excelOwners, availableConnections]);

    // -------------------------------------------------------------------------
    // End Auto-Mapping Logic
    // -------------------------------------------------------------------------

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

                setOwnerMappings({}); // Will be populated by Auto-Mapping Effect

            } catch (err) {
                console.error("Excel parse error", err);
                alert("Failed to parse Excel.");
            } finally {
                setIsParsingExcel(false);
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    const handleReportUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const content = evt.target?.result as string;
            if (!content) return;

            try {
                const lines = content.split('\n').filter(l => l.trim().length > 0);
                if (lines.length === 0) {
                    addToast("File is empty", "error");
                    return;
                }

                const headers = lines[0].split(',').map(h => h.trim());
                const requiredHeaders = ['OWNER', 'OBJECT_NAME', 'OBJECT_TYPE', 'CONCLUSION', 'CONCLUSION_TYPE'];
                const isValid = requiredHeaders.every(h => headers.includes(h));

                if (!isValid) {
                    addToast("Invalid Report File. Missing required columns.", "error");
                    return;
                }

                // Parse rows
                const rows = lines.slice(1).map(line => {
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
                setShowIssuedOnly(false);
                setPreviewPage(1);
                setViewModalOpen(true);
                addToast("Report Loaded Successfully", "success");

            } catch (err) {
                console.error("Parse Error", err);
                addToast("Failed to parse report file", "error");
            }
        };
        reader.readAsText(file);
        // Reset input
        e.target.value = '';
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

    const handleDownloadExcel = async () => {
        if (!jobId) return;
        setIsGeneratingExcel(true);
        try {
            const response = await fetch(`/api/oracle/three-way-stream?jobId=${jobId}&download=true`);
            const blob = await response.blob();
            const text = await blob.text();

            const workbook = XLSX.read(text, { type: "string" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Make it neat: Auto-calculate column widths
            const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:A1");
            const colWidths: any[] = [];

            // Simple heuristic scanning first 500 rows for speed + header
            for (let C = range.s.c; C <= range.e.c; ++C) {
                let maxLen = 10; // min width
                // Check header
                const cellAddr = XLSX.utils.encode_cell({ c: C, r: range.s.r });
                const cell = worksheet[cellAddr];
                if (cell && cell.v) maxLen = Math.max(maxLen, String(cell.v).length + 2);

                // Check first 1000 rows content
                for (let R = range.s.r + 1; R <= Math.min(range.e.r, 1000); ++R) {
                    const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
                    const cellVal = worksheet[cellRef];
                    if (cellVal && cellVal.v) {
                        maxLen = Math.max(maxLen, String(cellVal.v).length + 1);
                    }
                }
                colWidths.push({ wch: maxLen });
            }
            worksheet['!cols'] = colWidths;

            // Write File
            XLSX.writeFile(workbook, `Analysis_Report_${jobId}.xlsx`);

        } catch (e) {
            console.error("Excel generation error", e);
            alert("Failed to generate Excel file.");
        } finally {
            setIsGeneratingExcel(false);
        }
    };

    const fetchPreviewData = async () => {
        if (!jobId) return;
        setViewModalOpen(true);
        setIsLoadingPreview(true);
        setPreviewData([]);
        setShowIssuedOnly(false);
        setPreviewPage(1); // Reset to page 1

        try {
            const response = await fetch(`/api/oracle/three-way-stream?jobId=${jobId}&download=true`);
            if (!response.body) throw new Error("No body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let csvText = '';

            // Read FULL Content for client-side pagination
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                csvText += decoder.decode(value, { stream: true });
            }

            const lines = csvText.split('\n').filter(l => l.trim().length > 0);
            if (lines.length === 0) return;

            const headers = lines[0].split(',').map(h => h.trim());

            // Parse ALL rows
            const rows = lines.slice(1).map(line => {
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
            addToast("Failed to load preview", "error");
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
            addToast("Invalid Object Identifiers", "error");
            return;
        }

        let currentMapping = ownerMappings[owner];

        if (!currentMapping || !currentMapping.master || !currentMapping.slave) {
            setMissingConnModal({ owner });
            return;
        }

        setIsDiffModalOpen(true);
        setIsLoadingDiff(true);
        setDiffContent({ master: '', slave: '', patch: '', title: `${owner}.${name} (${type})` });

        try {
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
            if (data.error) throw new Error(data.error);

            setDiffContent({
                master: data.masterDDL,
                slave: data.slaveDDL,
                patch: data.patchScript || '-- No Generated Patch',
                title: `${owner}.${name} (${type})`
            });

        } catch (e: any) {
            addToast("Failed to fetch DDL: " + e.message, "error");
            setDiffContent(prev => ({ ...prev, master: 'Error fetching DDL', slave: 'Error fetching DDL', patch: 'Error fetching DDL' }));
        } finally {
            setIsLoadingDiff(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
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
                    <button
                        onClick={() => reportUploadRef.current?.click()}
                        className="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors border border-zinc-700"
                    >
                        <FileText className="h-4 w-4" />
                        Upload Existing Report
                    </button>
                    <input
                        type="file"
                        ref={reportUploadRef}
                        onChange={handleReportUpload}
                        accept=".csv"
                        className="hidden"
                    />
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

                        {/* Keyword Preferences */}
                        {excelOwners.size > 0 && (
                            <div className="flex gap-4 mb-4 bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Master Preference (Keyword)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. PROD, MASTER"
                                        value={env1Keyword}
                                        onChange={(e) => setEnv1Keyword(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Slave Preference (Keyword)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. DEV, QC, SIT"
                                        value={env2Keyword}
                                        onChange={(e) => setEnv2Keyword(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        )}

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
                                                    {isAutoMapping ? (
                                                        <div className="w-full h-8 bg-zinc-800/50 rounded animate-pulse" />
                                                    ) : (
                                                        <button
                                                            onClick={() => { setSelectingForOwner(owner); setSelectingForType('MASTER'); setIsConnManagerOpen(true); }}
                                                            className={`text-xs px-2 py-1.5 rounded w-full text-left truncate border ${ownerMappings[owner]?.master ? 'bg-blue-900/20 text-blue-300 border-blue-500/30' : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500'}`}
                                                        >
                                                            {ownerMappings[owner]?.master ? `${ownerMappings[owner].master!.name} (${ownerMappings[owner].master!.host})` : 'Select Master'}
                                                        </button>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    {isAutoMapping ? (
                                                        <div className="w-full h-8 bg-zinc-800/50 rounded animate-pulse" />
                                                    ) : (
                                                        <button
                                                            onClick={() => { setSelectingForOwner(owner); setSelectingForType('SLAVE'); setIsConnManagerOpen(true); }}
                                                            className={`text-xs px-2 py-1.5 rounded w-full text-left truncate border ${ownerMappings[owner]?.slave ? 'bg-purple-900/20 text-purple-300 border-purple-500/30' : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:border-zinc-500'}`}
                                                        >
                                                            {ownerMappings[owner]?.slave ? `${ownerMappings[owner].slave!.name} (${ownerMappings[owner].slave!.host})` : 'Select Slave'}
                                                        </button>
                                                    )}
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
                            {/* Progress Bar (Activity Based) */}
                            <div className="w-full bg-zinc-800 rounded-full h-4 overflow-hidden relative border border-zinc-700">
                                <div
                                    className={`h-full bg-gradient-to-r from-transparent via-blue-500 to-transparent w-1/2 absolute top-0 bottom-0 ${jobStatus !== 'COMPLETED' ? 'animate-shimmer' : 'hidden'}`}
                                    style={{
                                        backgroundImage: 'linear-gradient(90deg, transparent, #3b82f6, transparent)'
                                    }}
                                />
                                {jobStatus === 'COMPLETED' && (
                                    <div className="h-full bg-emerald-600 w-full" />
                                )}
                                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-md">
                                    {jobStatus === 'COMPLETED'
                                        ? `Successfully scan ${jobProgress?.processed?.toLocaleString() || 0} objects`
                                        : `Scanning ${jobProgress?.processed?.toLocaleString() || 0} objects...`
                                    }
                                </div>
                            </div>

                            {/* Stats */}
                            {jobProgress && (
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Processed: <strong className="text-white">{jobProgress.processed.toLocaleString()}</strong></span>
                                    <span>Issues: <strong className="text-orange-400">{(jobProgress.diffs + jobProgress.missing + jobProgress.new + (jobProgress.ghosts || 0)).toLocaleString()}</strong></span>
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
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
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
                                        <div className="text-2xl font-bold text-zinc-400">{jobProgress?.ghosts?.toLocaleString()}</div>
                                        <div className="text-xs text-zinc-500 uppercase">Ghost Objects</div>
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
                                        onClick={handleDownloadExcel}
                                        disabled={isGeneratingExcel}
                                        className={`flex items-center justify-center gap-2 px-8 py-4 rounded-full font-bold shadow-lg transition-all ${isGeneratingExcel ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105 shadow-emerald-900/20'}`}
                                    >
                                        {isGeneratingExcel ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" /> Mengonversi ke excel...
                                            </>
                                        ) : (
                                            <>
                                                <FileSpreadsheet className="w-5 h-5" /> Download Excel Report
                                            </>
                                        )}
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

            {/* Missing Connection Setup Modal */}
            {missingConnModal && (
                <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
                    <div className="w-full max-w-md bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl p-6">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Database className="text-amber-500" /> Required Connectons
                        </h3>
                        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                            To compare objects for owner <span className="text-emerald-400 font-mono font-bold bg-emerald-950/30 px-1 rounded">{missingConnModal.owner}</span>,
                            you need to configure both Master and Slave connections.
                        </p>

                        <div className="space-y-4">
                            {/* Master */}
                            <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${ownerMappings[missingConnModal.owner]?.master
                                ? 'border-zinc-800 bg-zinc-900/50'
                                : 'border-amber-500/30 bg-amber-500/10'
                                }`}>
                                <div>
                                    <div className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                        Master (Prod)
                                        {ownerMappings[missingConnModal.owner]?.master && <span className="text-xs text-emerald-500">✓ Ready</span>}
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-1">
                                        {ownerMappings[missingConnModal.owner]?.master?.name || "Not Selected"}
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectingForOwner(missingConnModal.owner);
                                        setSelectingForType('MASTER');
                                        setIsConnManagerOpen(true);
                                    }}
                                    className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${ownerMappings[missingConnModal.owner]?.master
                                        ? 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                                        : 'bg-amber-500 text-black border-amber-600 hover:bg-amber-400 shadow-lg shadow-amber-900/20'
                                        }`}
                                >
                                    {ownerMappings[missingConnModal.owner]?.master ? 'Change' : 'Select Master'}
                                </button>
                            </div>

                            {/* Slave */}
                            <div className={`flex items-center justify-between p-3 rounded-lg border transition-all ${ownerMappings[missingConnModal.owner]?.slave
                                ? 'border-zinc-800 bg-zinc-900/50'
                                : 'border-amber-500/30 bg-amber-500/10'
                                }`}>
                                <div>
                                    <div className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                                        Slave (Dev)
                                        {ownerMappings[missingConnModal.owner]?.slave && <span className="text-xs text-emerald-500">✓ Ready</span>}
                                    </div>
                                    <div className="text-xs text-zinc-500 mt-1">
                                        {ownerMappings[missingConnModal.owner]?.slave?.name || "Not Selected"}
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectingForOwner(missingConnModal.owner);
                                        setSelectingForType('SLAVE');
                                        setIsConnManagerOpen(true);
                                    }}
                                    className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${ownerMappings[missingConnModal.owner]?.slave
                                        ? 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                                        : 'bg-amber-500 text-black border-amber-600 hover:bg-amber-400 shadow-lg shadow-amber-900/20'
                                        }`}
                                >
                                    {ownerMappings[missingConnModal.owner]?.slave ? 'Change' : 'Select Slave'}
                                </button>
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-zinc-800">
                            <button
                                onClick={() => setMissingConnModal(null)}
                                className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const m = ownerMappings[missingConnModal.owner];
                                    if (m?.master && m?.slave) {
                                        setMissingConnModal(null);
                                        addToast("Configuration saved. You can now view the diff.", "success");
                                    } else {
                                        addToast("Please select both Master and Slave connections.", "error");
                                    }
                                }}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${ownerMappings[missingConnModal.owner]?.master && ownerMappings[missingConnModal.owner]?.slave
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'
                                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                                    }`}
                            >
                                Done & Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Connection Manager Modal */}
            {isConnManagerOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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
                                        {(showIssuedOnly
                                            ? previewData.filter(row => {
                                                const c = String(row['CONCLUSION'] || '');
                                                return !c.includes("Sudah Sync") && !c.includes("Tidak ada perubahan");
                                            })
                                            : previewData
                                        ).slice((previewPage - 1) * 200, previewPage * 200).map((row, idx) => (
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
                                                                <span className="hidden group-hover:inline absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-2 text-blue-500 flex gap-1">
                                                                    <button title="View Diff" onClick={(e) => { e.stopPropagation(); handleViewDiff(row); }} className="p-1 hover:bg-zinc-800 rounded">
                                                                        <Eye className="w-4 h-4" />
                                                                    </button>
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
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                                    disabled={previewPage === 1}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
                                >
                                    Previous
                                </button>
                                <span className="text-sm text-zinc-400">
                                    Page <span className="text-white font-bold">{previewPage}</span> of <span className="text-white font-bold">{
                                        Math.ceil(
                                            (showIssuedOnly
                                                ? previewData.filter(row => {
                                                    const c = String(row['CONCLUSION'] || '');
                                                    return !c.includes("Sudah Sync") && !c.includes("Tidak ada perubahan");
                                                }).length
                                                : previewData.length
                                            ) / 200
                                        ) || 1
                                    }</span>
                                </span>
                                <button
                                    onClick={() => setPreviewPage(p => Math.min(Math.ceil(
                                        (showIssuedOnly
                                            ? previewData.filter(row => {
                                                const c = String(row['CONCLUSION'] || '');
                                                return !c.includes("Sudah Sync") && !c.includes("Tidak ada perubahan");
                                            }).length
                                            : previewData.length
                                        ) / 200
                                    ), p + 1))}
                                    disabled={previewPage >= Math.ceil(
                                        (showIssuedOnly
                                            ? previewData.filter(row => {
                                                const c = String(row['CONCLUSION'] || '');
                                                return !c.includes("Sudah Sync") && !c.includes("Tidak ada perubahan");
                                            }).length
                                            : previewData.length
                                        ) / 200
                                    )}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-xs text-zinc-500 hidden md:inline">
                                    Total {
                                        (showIssuedOnly
                                            ? previewData.filter(row => {
                                                const c = String(row['CONCLUSION'] || '');
                                                return !c.includes("Sudah Sync") && !c.includes("Tidak ada perubahan");
                                            }).length
                                            : previewData.length
                                        ).toLocaleString()
                                    } rows loaded.
                                </span>
                                <button onClick={() => setViewModalOpen(false)} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm font-medium">
                                    Close Preview
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Diff Viewer Modal With Patch Script */}
            {isDiffModalOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full h-full max-w-[95vw] max-h-[95vh] bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between border-b border-zinc-800 p-4 bg-zinc-900/50 rounded-t-xl shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Code2 className="text-orange-500" /> Diff Viewer: <span className="text-zinc-400 font-mono text-base">{diffContent.title}</span>
                                </h3>
                            </div>
                            <div className="flex gap-2">
                                <button className="p-2 bg-blue-900/40 text-blue-200 hover:bg-blue-800 rounded text-xs font-semibold flex items-center gap-1"
                                    onClick={() => {
                                        const blob = new Blob([diffContent.patch], { type: 'text/sql' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = `PATCH_${diffContent.title.replace(/[^a-zA-Z0-9]/g, '_')}.sql`;
                                        a.click();
                                    }}>
                                    <FileSpreadsheet className="w-3 h-3" /> Download Patch Script
                                </button>
                                <button onClick={() => setIsDiffModalOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 relative bg-[#1e1e1e] flex flex-col">
                            {isLoadingDiff && (
                                <div className="absolute inset-0 z-10 bg-zinc-900/50 flex items-center justify-center">
                                    <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
                                </div>
                            )}

                            <div className="flex-1 relative">
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

                            {/* Patch Script Preview (Bottom Pane) */}
                            {diffContent.patch && (
                                <div className="h-[30%] border-t border-zinc-700 bg-zinc-900 flex flex-col">
                                    <div className="px-4 py-1 bg-zinc-950 text-xs text-green-500 font-bold border-b border-zinc-800 flex justify-between">
                                        <span>AUTO-GENERATED PATCH SCRIPT (SLAVE -&gt; MASTER)</span>
                                        <span>{diffContent.patch.includes("SMART") ? "✨ Smart Alter" : "Standard Replace"}</span>
                                    </div>
                                    <textarea
                                        readOnly
                                        value={diffContent.patch}
                                        className="w-full h-full bg-[#1e1e1e] text-zinc-300 font-mono text-xs p-4 resize-none focus:outline-none"
                                    />
                                </div>
                            )}
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
