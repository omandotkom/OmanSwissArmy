"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Database, FileSpreadsheet, FolderInput, Download, AlertCircle, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import * as XLSX from "xlsx";
import ConnectionManager from "@/components/ConnectionManager";
import { OracleConnection } from "@/services/connection-storage";

// Types
interface ExcelRow {
    [key: string]: any;
}

interface SheetData {
    name: string;
    data: ExcelRow[];
    headers: string[];
}

interface OwnerMapping {
    [ownerName: string]: OracleConnection | null;
}

interface BackupItem {
    id: string; // unique key
    owner: string;
    name: string;
    type: string;
    conn: OracleConnection;
    status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
    message?: string;
}

export default function OracleObjectLocalBackup() {
    // --- Step State ---
    const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Mode Selection, 2: Configuration, 3: Processing
    const [mode, setMode] = useState<'ALL' | 'EXCEL' | null>(null);

    // --- Mode: ALL OBJECTS State ---
    const [selectedConns, setSelectedConns] = useState<OracleConnection[]>([]);
    const [isFetchingObjects, setIsFetchingObjects] = useState(false);

    // --- Mode: EXCEL State ---
    const [file, setFile] = useState<File | null>(null);
    const [detectedOwners, setDetectedOwners] = useState<string[]>([]);
    const [ownerMappings, setOwnerMappings] = useState<OwnerMapping>({});
    const [excelItems, setExcelItems] = useState<any[]>([]); // Parsed items from Excel
    const [isParsingExcel, setIsParsingExcel] = useState(false);

    // --- Connection Manager Modal ---
    const [isConnManagerOpen, setIsConnManagerOpen] = useState(false);
    const [selectingForOwner, setSelectingForOwner] = useState<string | null>(null); // If null, selecting for "ALL" mode

    // --- Execution State ---
    const [backupQueue, setBackupQueue] = useState<BackupItem[]>([]);
    const [processingStatus, setProcessingStatus] = useState<{ total: number, success: number, failed: number }>({ total: 0, success: 0, failed: 0 });
    const [isBackupRunning, setIsBackupRunning] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0); // in seconds
    const [concurrency, setConcurrency] = useState(5);
    const [log, setLog] = useState<string[]>([]);

    // Timer Logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isBackupRunning) {
            interval = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isBackupRunning]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // -------------------------------------------------------------------------
    // STEP 1: Mode Selection Logic
    // -------------------------------------------------------------------------
    const handleModeSelect = (selectedMode: 'ALL' | 'EXCEL') => {
        setMode(selectedMode);
        setStep(2);
    };

    // -------------------------------------------------------------------------
    // STEP 2: Configuration Logic (ALL)
    // -------------------------------------------------------------------------
    const handleSelectConn = (conn: OracleConnection) => {
        if (mode === 'ALL') {
            if (selectedConns.some(c => c.id === conn.id)) {
                setIsConnManagerOpen(false);
                setTimeout(() => {
                    setAlertModal({ title: "Duplicate Connection", message: `Connection '${conn.name}' is already selected.`, type: 'error' });
                }, 300);
                return;
            }
            setSelectedConns(prev => [...prev, conn]);
            setIsConnManagerOpen(false);
        } else if (mode === 'EXCEL' && selectingForOwner) {
            setOwnerMappings(prev => ({ ...prev, [selectingForOwner]: conn }));
            setSelectingForOwner(null);
            setIsConnManagerOpen(false);
        }
    };

    const handleRemoveConn = (connId: string) => {
        setSelectedConns(prev => prev.filter(c => c.id !== connId));
    };

    // -------------------------------------------------------------------------
    // STEP 2: Configuration Logic (EXCEL)
    // -------------------------------------------------------------------------
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        setIsParsingExcel(true);
        setFile(uploadedFile);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: "binary" });
                const ownersSet = new Set<string>();
                const allItems: any[] = [];

                wb.SheetNames.forEach((wsname) => {
                    const ws = wb.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: "" });

                    if (data.length === 0) return;

                    data.forEach(row => {
                        // Normalize keys (handle case sensitivity if needed)
                        // Common variations: "Object Name", "OBJECT NAME", "Object Type", etc.
                        const owner = String(row['OWNER'] || row['owner'] || row['Owner'] || '').trim().toUpperCase();
                        const name = String(row['OBJECT_NAME'] || row['object_name'] || row['Object Name'] || row['OBJECT NAME'] || row['NAME'] || row['name'] || row['Name'] || '').trim();
                        let type = String(row['OBJECT_TYPE'] || row['object_type'] || row['Object Type'] || row['OBJECT TYPE'] || row['TYPE'] || row['type'] || row['Type'] || '').trim().toUpperCase();

                        // Fallback to Sheet Name if Type is missing
                        if (!type) {
                            let sheetType = wsname.toUpperCase().trim();
                            // Basic Singularization
                            if (sheetType.endsWith('S') && !sheetType.endsWith('SS')) {
                                sheetType = sheetType.slice(0, -1);
                            }
                            // Handle "BODIES" -> "BODY"
                            if (sheetType.endsWith('BODIE')) {
                                sheetType = sheetType.replace('BODIE', 'BODY');
                            }
                            // Normalize Spaces to Underscores (e.g. PACKAGE BODY)
                            sheetType = sheetType.replace(/\s+/g, '_');

                            type = sheetType;
                        }

                        if (owner && name) {
                            ownersSet.add(owner);
                            allItems.push({ owner, name, type });
                        }
                    });
                });

                const ownersList = Array.from(ownersSet).sort();
                const initialMapping: OwnerMapping = {};
                ownersList.forEach(o => initialMapping[o] = null);

                setDetectedOwners(ownersList);
                setOwnerMappings(initialMapping);
                setExcelItems(allItems);

            } catch (err) {
                console.error(err);
                alert("Failed to parse Excel.");
            } finally {
                setIsParsingExcel(false);
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    // -------------------------------------------------------------------------
    // STEP 3: Execution Logic
    // -------------------------------------------------------------------------

    // --- UI State ---
    const [alertModal, setAlertModal] = useState<{ title: string; message: string; type?: 'error' | 'success' } | null>(null);
    const [isCheckingConnection, setIsCheckingConnection] = useState(false);

    // Prepare Queue
    const prepareBackup = async () => {
        let items: BackupItem[] = [];

        if (mode === 'ALL') {
            if (selectedConns.length === 0) return;

            setIsCheckingConnection(true);
            setIsFetchingObjects(true);

            try {
                for (const conn of selectedConns) {
                    // 1. Check Connection
                    const testRes = await fetch('/api/oracle/test-connection', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(conn)
                    });
                    if (!testRes.ok) {
                        const data = await testRes.json();
                        throw new Error(`Connection [${conn.name}] Failed: ${data.error || "Unknown Error"}`);
                    }

                    // 2. Fetch Objects
                    const res = await fetch('/api/oracle/list-objects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ connection: conn })
                    });

                    const data = await res.json();
                    if (!res.ok) throw new Error(`Fetch objects for [${conn.name}] Failed: ${data.error}`);

                    const connItems = data.objects.map((obj: any, idx: number) => ({
                        id: `all-${conn.id}-${idx}`,
                        owner: conn.username,
                        name: obj.name,
                        type: obj.type,
                        conn: conn,
                        status: 'PENDING'
                    }));
                    items = [...items, ...connItems];
                }

            } catch (error: any) {
                setIsCheckingConnection(false);
                setIsFetchingObjects(false);
                setAlertModal({ title: "Error", message: error.message, type: 'error' });
                return;
            } finally {
                setIsCheckingConnection(false);
                setIsFetchingObjects(false);
            }
        } else {
            // Excel Mode
            // 1. Validate mappings
            const missingOwners = detectedOwners.filter(o => !ownerMappings[o]);
            if (missingOwners.length > 0) {
                setAlertModal({ title: "Missing Connections", message: `Please map connection for owners: ${missingOwners.join(', ')}`, type: 'error' });
                return;
            }

            // 2. Test ALL connections first? Or assume they are OK?
            // User requested check logic. Let's check unique connections involved.
            const uniqueConns = new Set(Object.values(ownerMappings).filter(c => c !== null) as OracleConnection[]);
            const connsToCheck = Array.from(uniqueConns);

            setIsCheckingConnection(true);
            try {
                for (const conn of connsToCheck) {
                    const testRes = await fetch('/api/oracle/test-connection', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(conn)
                    });
                    if (!testRes.ok) throw new Error(`Connection to ${conn.name} failed.`);
                }
            } catch (error: any) {
                setIsCheckingConnection(false);
                setAlertModal({ title: "Connection Verification Failed", message: error.message, type: 'error' });
                return;
            }
            setIsCheckingConnection(false);

            items = excelItems.map((item, idx) => ({
                id: `ex-${idx}`,
                owner: item.owner,
                name: item.name,
                type: item.type,
                conn: ownerMappings[item.owner]!, // Safe assertion after check
                status: 'PENDING'
            }));
        }

        if (items.length === 0) {
            setAlertModal({ title: "No Objects", message: "No objects found to backup.", type: 'error' });
            return;
        }

        setBackupQueue(items);
        setProcessingStatus({ total: items.length, success: 0, failed: 0 });
        setStep(3);
    };

    const startBackup = async () => {
        // 1. Get Directory Handle
        let dirHandle: any = null;
        try {
            // @ts-ignore
            if (window.showDirectoryPicker) {
                // @ts-ignore
                dirHandle = await window.showDirectoryPicker();
            } else {
                alert("Your browser does not support backing up directly to a folder. We will try to download files individually (Not Recommended for large batches). Please use Chrome or Edge.");
                return; // Or implement ZIP fallback here
            }
        } catch (err) {
            // User cancelled
            return;
        }

        setIsBackupRunning(true);
        setElapsedTime(0);
        const queue = [...backupQueue];
        // Use state concurrency
        let active = 0;
        let index = 0;
        let completed = 0;

        const processItem = async (idx: number) => {
            const item = queue[idx];
            // Update UI to Processing
            setBackupQueue(prev => {
                const newQ = [...prev];
                newQ[idx].status = 'PROCESSING';
                return newQ;
            });

            try {
                // Fetch DDL using dedicated API
                const res = await fetch('/api/oracle/get-ddl', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        connection: item.conn,
                        owner: item.owner,
                        name: item.name,
                        type: item.type
                    })
                });

                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Failed to fetch");

                const ddl = json.ddl;
                if (!ddl) throw new Error("DDL is empty");

                // Write to File
                if (dirHandle) {
                    const safeName = `${item.owner}.${item.type.replace(/\s+/g, '_')}.${item.name}.sql`.toUpperCase();

                    const fileHandle = await dirHandle.getFileHandle(safeName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(ddl);
                    await writable.close();
                }

                // Success
                setBackupQueue(prev => {
                    const newQ = [...prev];
                    newQ[idx].status = 'SUCCESS';
                    return newQ;
                });
                setProcessingStatus(prev => ({ ...prev, success: prev.success + 1 }));

            } catch (err: any) {
                console.error(err);
                setBackupQueue(prev => {
                    const newQ = [...prev];
                    newQ[idx].status = 'ERROR';
                    newQ[idx].message = err.message || "Unknown Error";
                    return newQ;
                });
                setProcessingStatus(prev => ({ ...prev, failed: prev.failed + 1 }));
            } finally {
                active--;
                completed++;
                checkNext();
            }
        };

        const checkNext = () => {
            if (completed === queue.length) {
                setIsBackupRunning(false);
                return;
            }
            while (active < concurrency && index < queue.length) {
                active++;
                processItem(index);
                index++;
            }
        };

        checkNext();
    };

    const handleExportReport = () => {
        // 1. Prepare Data
        const metadata = [
            ["Date Export", new Date().toLocaleString()],
            ["Success Count", processingStatus.success],
            ["Failure Count", processingStatus.failed],
            [], // Empty Row 1
            [], // Empty Row 2
            []  // Empty Row 3
        ];

        const headers = ["Status", "Object Name", "Type", "Owner", "Message"];

        const dataRows = backupQueue.map(item => [
            item.status,
            item.name,
            item.type,
            item.owner,
            item.message || ""
        ]);

        const wsData = [...metadata, headers, ...dataRows];

        // 2. Create Sheet
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // 3. Styling (Simple column width)
        ws['!cols'] = [
            { wch: 15 }, // Status
            { wch: 30 }, // Name
            { wch: 20 }, // Type
            { wch: 20 }, // Owner
            { wch: 50 }  // Message
        ];

        // 4. Save File
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Backup Report");
        XLSX.writeFile(wb, `Backup_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // -------------------------------------------------------------------------
    // RENDER HELPERS
    // -------------------------------------------------------------------------
    const renderStep1 = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-12">
            <button
                onClick={() => handleModeSelect('ALL')}
                className="group relative flex flex-col items-center p-8 bg-zinc-900 border border-zinc-800 rounded-2xl hover:bg-zinc-800 hover:border-blue-600 transition-all text-center"
            >
                <Database className="w-16 h-16 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold text-zinc-100 mb-2">All Objects (Schema)</h3>
                <p className="text-zinc-400 text-sm">Connect to a database and backup ALL objects belonging to the user.</p>
            </button>

            <button
                onClick={() => handleModeSelect('EXCEL')}
                className="group relative flex flex-col items-center p-8 bg-zinc-900 border border-zinc-800 rounded-2xl hover:bg-zinc-800 hover:border-green-600 transition-all text-center"
            >
                <FileSpreadsheet className="w-16 h-16 text-green-500 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold text-zinc-100 mb-2">By Object List (Excel)</h3>
                <p className="text-zinc-400 text-sm">Upload an Excel file containing list of specific objects to backup.</p>
            </button>
        </div>
    );

    const renderStep2All = () => (
        <div className="max-w-3xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Database className="w-5 h-5 text-blue-500" />
                    Select Source Databases
                </h2>
                <button
                    onClick={() => { setSelectingForOwner(null); setIsConnManagerOpen(true); }}
                    className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                >
                    + Add Connection
                </button>
            </div>

            <div className="mb-8 space-y-4">
                {selectedConns.length === 0 ? (
                    <div className="p-8 border-2 border-dashed border-zinc-700 rounded-xl flex flex-col items-center justify-center text-zinc-400">
                        <Database className="w-10 h-10 mb-2 opacity-30" />
                        <p>No connections selected.</p>
                        <p className="text-sm">Click "Add Connection" to start.</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {selectedConns.map((conn, idx) => (
                            <div key={conn.id} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex justify-between items-center group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold border border-blue-500/20">
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <p className="font-bold text-zinc-200">{conn.name}</p>
                                        <p className="text-sm text-zinc-500">{conn.username}@{conn.host}:{conn.port}/{conn.serviceName}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemoveConn(conn.id)}
                                    className="text-sm text-red-500 hover:text-red-400 opacity-60 hover:opacity-100 px-3 py-1 transition-all border border-transparent hover:border-red-900 rounded"
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex justify-end">
                <button
                    onClick={prepareBackup}
                    disabled={selectedConns.length === 0 || isFetchingObjects || isCheckingConnection}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ArrowRight className="w-4 h-4" />
                    Next: Preview Objects
                </button>
            </div>
        </div>
    );

    const renderStep2Excel = () => (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">1. Upload List</h2>
                {!file ? (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-zinc-700 border-dashed rounded-lg cursor-pointer bg-zinc-950 hover:bg-zinc-900/50 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <FileSpreadsheet className="w-8 h-8 mb-3 text-zinc-400" />
                            <p className="mb-2 text-sm text-zinc-500"><span className="font-semibold">Click to upload</span> Excel file</p>
                        </div>
                        <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFileUpload} />
                    </label>
                ) : (
                    <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                        <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-6 h-6 text-green-500" />
                            <div>
                                <p className="text-sm font-medium text-zinc-200">{file.name}</p>
                                <p className="text-xs text-zinc-500">{excelItems.length} objects found</p>
                            </div>
                        </div>
                        <button onClick={() => { setFile(null); setExcelItems([]); setDetectedOwners([]); }} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                )}
            </div>

            {detectedOwners.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                    <h2 className="text-lg font-semibold mb-4">2. Map Owners to Connections</h2>
                    <div className="space-y-2">
                        {detectedOwners.map(owner => (
                            <div key={owner} className="flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                                <span className="font-mono text-yellow-500 font-bold">{owner}</span>
                                <button
                                    onClick={() => { setSelectingForOwner(owner); setIsConnManagerOpen(true); }}
                                    className={`px-4 py-2 rounded text-sm border flex items-center gap-2 ${ownerMappings[owner] ? "border-zinc-700 bg-zinc-900 text-zinc-200" : "border-zinc-700 border-dashed text-zinc-500 hover:text-zinc-300"}`}
                                >
                                    <Database className="w-3 h-3" />
                                    {ownerMappings[owner]?.name || "Select Connection..."}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex justify-end">
                <button
                    onClick={prepareBackup}
                    disabled={!file || detectedOwners.some(o => !ownerMappings[o])}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ArrowRight className="w-4 h-4" />
                    Next: Preview Objects
                </button>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">Ready to Backup</h2>
                    <p className="text-zinc-400 text-sm flex gap-4">
                        <span>Total Objects: <span className="text-white font-mono">{processingStatus.total}</span></span>
                        {(isBackupRunning || elapsedTime > 0) && (
                            <span>Elapsed Time: <span className="text-blue-400 font-mono">{formatTime(elapsedTime)}</span></span>
                        )}
                    </p>
                </div>
                {!isBackupRunning && processingStatus.success === 0 && processingStatus.failed === 0 ? (
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                            <label className="text-xs text-zinc-500 mb-1">Max Threads</label>
                            <input
                                type="number"
                                min="1"
                                max="50"
                                value={concurrency}
                                onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                                className={`w-16 bg-zinc-950 border rounded px-2 py-1 text-center text-sm font-mono focus:outline-none focus:ring-1 ${concurrency > 10 ? 'border-yellow-600 text-yellow-500 focus:ring-yellow-500' : 'border-zinc-700 text-zinc-300 focus:ring-blue-500'}`}
                            />
                            {concurrency > 10 && (
                                <span className="text-[10px] text-yellow-500 mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> High load warning
                                </span>
                            )}
                        </div>
                        <button
                            onClick={startBackup}
                            className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center gap-2 animate-pulse"
                        >
                            <FolderInput className="w-5 h-5" />
                            Select Folder & Start Backup
                        </button>
                    </div>
                ) : (
                    !isBackupRunning && (processingStatus.success > 0 || processingStatus.failed > 0) && (
                        <button
                            onClick={handleExportReport}
                            className="bg-zinc-100 hover:bg-zinc-200 text-zinc-900 px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-transform active:scale-95"
                        >
                            <Download className="w-5 h-5" />
                            Export Report
                        </button>
                    )
                )}
            </div>

            {/* Progress Bar */}
            {(isBackupRunning || processingStatus.success > 0 || processingStatus.failed > 0) && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-zinc-400">Progress</span>
                        <span className="text-zinc-200 font-mono">
                            {Math.round(((processingStatus.success + processingStatus.failed) / processingStatus.total) * 100)}%
                        </span>
                    </div>
                    <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                        <div
                            className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${((processingStatus.success + processingStatus.failed) / processingStatus.total) * 100}%` }}
                        ></div>
                    </div>
                    <div className="flex gap-4 mt-4 text-sm">
                        <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle2 className="w-4 h-4" /> {processingStatus.success} Success
                        </div>
                        <div className="flex items-center gap-2 text-red-400">
                            <AlertCircle className="w-4 h-4" /> {processingStatus.failed} Failed
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left text-sm text-zinc-400">
                        <thead className="bg-zinc-950 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 font-medium">Status</th>
                                <th className="px-6 py-3 font-medium">Object Name</th>
                                <th className="px-6 py-3 font-medium">Type</th>
                                <th className="px-6 py-3 font-medium">Owner</th>
                                <th className="px-6 py-3 font-medium">Message</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {backupQueue.map(item => (
                                <tr key={item.id} className="hover:bg-zinc-800/30">
                                    <td className="px-6 py-3">
                                        {item.status === 'PENDING' && <span className="text-zinc-600">Pending</span>}
                                        {item.status === 'PROCESSING' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                                        {item.status === 'SUCCESS' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                        {item.status === 'ERROR' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                    </td>
                                    <td className="px-6 py-3 text-zinc-200 font-mono">{item.name}</td>
                                    <td className="px-6 py-3">{item.type}</td>
                                    <td className="px-6 py-3">{item.owner}</td>
                                    <td className="px-6 py-3 text-red-400 text-xs truncate max-w-[200px]">{item.message}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="group flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100">
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                            Back
                        </Link>
                        <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
                            <Database className="w-6 h-6 text-purple-500" />
                            Oracle Object Local Backup
                        </h1>
                    </div>
                </div>
            </header>

            <main className="p-8">
                {step === 1 && renderStep1()}
                {step === 2 && (
                    <div className="mb-4">
                        <button onClick={() => setStep(1)} className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 mb-4 text-sm">
                            <ArrowLeft className="w-3 h-3" /> Change Mode
                        </button>
                        {mode === 'ALL' ? renderStep2All() : renderStep2Excel()}
                    </div>
                )}
                {step === 3 && (
                    <div className="mb-4">
                        {!isBackupRunning && (
                            <button onClick={() => { setStep(2); setBackupQueue([]); setProcessingStatus({ total: 0, success: 0, failed: 0 }); }} className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 mb-4 text-sm">
                                <ArrowLeft className="w-3 h-3" /> Back to Config
                            </button>
                        )}
                        {renderStep3()}
                    </div>
                )}
            </main>

            <ConnectionManager
                isOpen={isConnManagerOpen}
                onClose={() => setIsConnManagerOpen(false)}
                onSelect={handleSelectConn}
            />

            {/* Alert Modal */}
            {alertModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            {alertModal.type === 'error' ? (
                                <AlertCircle className="w-8 h-8 text-red-500" />
                            ) : (
                                <CheckCircle2 className="w-8 h-8 text-green-500" />
                            )}
                            <h3 className="text-xl font-semibold text-white">{alertModal.title}</h3>
                        </div>
                        <p className="text-zinc-300 mb-6 whitespace-pre-line">{alertModal.message}</p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setAlertModal(null)}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2 rounded-lg font-medium transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading Modal */}
            {(isCheckingConnection || isFetchingObjects) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="flex flex-col items-center">
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
                        <h3 className="text-xl font-light text-zinc-200">
                            {isCheckingConnection ? "Verifying Connections..." : "Fetching Object List..."}
                        </h3>
                    </div>
                </div>
            )}
        </div>
    );
}
