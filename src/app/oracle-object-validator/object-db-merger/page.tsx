"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileSpreadsheet, Loader2, Download, AlertTriangle, CheckCircle2, Trash2, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";

interface MergedObject {
    key: string;
    data: any; // Full row data
    sourceFile: string;
    sheetName: string;
}

interface DuplicateReport {
    key: string;
    files: string[];
    count: number;
}

interface FileWithMeta {
    id: string;
    file: File;
    summary: string; // e.g., "TABLE (10), PROCEDURE (5)"
    isLoadingSummary: boolean;
}

export default function ObjectDBMergerPage() {
    const [fileList, setFileList] = useState<FileWithMeta[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState("");

    // Results
    const [mergedData, setMergedData] = useState<Map<string, MergedObject[]>>(new Map());
    const [duplicates, setDuplicates] = useState<DuplicateReport[]>([]);
    const [showReport, setShowReport] = useState(false);

    const scanFileSummary = async (fileObj: FileWithMeta) => {
        try {
            const buffer = await fileObj.file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });

            const summaryParts: string[] = [];

            wb.SheetNames.forEach(sheet => {
                const ws = wb.Sheets[sheet];
                // Fast estimation using range if available, else json parse
                let count = 0;
                if (ws['!ref']) {
                    const range = XLSX.utils.decode_range(ws['!ref']);
                    // Simple row count estimate (end row - start row). 
                    // Assuming header exists, subtract 1.
                    const totalRows = (range.e.r - range.s.r) + 1;
                    if (totalRows > 1) count = totalRows - 1;
                } else {
                    // Fallback
                    const json = XLSX.utils.sheet_to_json(ws);
                    count = json.length;
                }

                if (count > 0) {
                    summaryParts.push(`${sheet} ${count}`); // e.g. "PROCEDURE 20"
                }
            });

            const summaryStr = summaryParts.join(", ");

            setFileList(prev => prev.map(f => f.id === fileObj.id ? { ...f, summary: summaryStr, isLoadingSummary: false } : f));

        } catch (e) {
            console.error("Summary scan failed", e);
            setFileList(prev => prev.map(f => f.id === fileObj.id ? { ...f, summary: "Failed to scan", isLoadingSummary: false } : f));
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const rawFiles = Array.from(e.target.files);

            // Filter duplicates by name from existing list
            const existingNames = new Set(fileList.map(f => f.file.name));
            const uniqueFiles = rawFiles.filter(f => !existingNames.has(f.name));

            const newFileObjs: FileWithMeta[] = uniqueFiles.map(f => ({
                id: uuidv4(),
                file: f,
                summary: "",
                isLoadingSummary: true
            }));

            // Append to state
            setFileList(prev => [...prev, ...newFileObjs]);

            // Start scanning for summaries immediately
            newFileObjs.forEach(f => scanFileSummary(f));

            // Reset results
            setMergedData(new Map());
            setDuplicates([]);
            setShowReport(false);
            setProgress(0);
            setStatusMessage("");
        }
        e.target.value = "";
    };

    const removeFile = (id: string) => {
        setFileList(prev => prev.filter(f => f.id !== id));
    };

    const processFiles = async () => {
        if (fileList.length === 0) return;

        setIsProcessing(true);
        setProgress(0);
        setStatusMessage("Initializing merger...");

        setMergedData(new Map());
        setDuplicates([]);

        const globalTracker = new Map<string, Set<string>>();
        const tempMergedData = new Map<string, MergedObject[]>();

        const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

        try {
            for (let i = 0; i < fileList.length; i++) {
                const { file } = fileList[i];
                setStatusMessage(`Processing file ${i + 1} of ${fileList.length}: ${file.name}`);

                await new Promise<void>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        try {
                            const data = e.target?.result;
                            const workbook = XLSX.read(data, { type: 'binary' });

                            for (const sheetName of workbook.SheetNames) {
                                const ws = workbook.Sheets[sheetName];
                                const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

                                if (json.length === 0) continue;

                                const firstRow = json[0];
                                const keys = Object.keys(firstRow);
                                const findKey = (targets: string[]) => keys.find(k => targets.includes(k.trim().toUpperCase()));

                                const ownerKey = findKey(['OWNER']);
                                const nameKey = findKey(['OBJECT_NAME', 'OBJECT NAME', 'NAME', 'OBJECTNAME']);
                                const typeKey = findKey(['OBJECT_TYPE', 'OBJECT TYPE', 'TYPE']);
                                const defaultType = sheetName.trim().toUpperCase();

                                if (!tempMergedData.has(defaultType)) {
                                    tempMergedData.set(defaultType, []);
                                }

                                for (const row of json) {
                                    const owner = ownerKey ? String(row[ownerKey] || '').trim().toUpperCase() : '';
                                    const name = nameKey ? String(row[nameKey] || '').trim().toUpperCase() : '';
                                    const type = typeKey ? String(row[typeKey] || '').trim().toUpperCase() : defaultType;

                                    if (owner && name) {
                                        const key = `${owner}|${name}|${type}`;

                                        if (!globalTracker.has(key)) {
                                            globalTracker.set(key, new Set());

                                            // Group by Type (Sheet Name)
                                            // Ensure we check if TYPE is different from Sheet?? 
                                            // Usually we group by the found Type or default to Sheet name.
                                            // The user wants to merge "DB Objects". Usually organized by Type sheets.
                                            // Let's use the explicit 'type' found as the target sheet, passing logic:
                                            const targetSheet = type || defaultType;

                                            if (!tempMergedData.has(targetSheet)) {
                                                tempMergedData.set(targetSheet, []);
                                            }

                                            // STORE FULL ROW DATA HERE
                                            tempMergedData.get(targetSheet)?.push({
                                                key,
                                                data: row, // <--- CRITICAL: Storing full row
                                                sourceFile: file.name,
                                                sheetName: targetSheet
                                            });
                                        }
                                        globalTracker.get(key)?.add(file.name);
                                    }
                                }
                                await yieldToMain();
                            }
                            resolve();
                        } catch (err) {
                            reject(err);
                        }
                    };
                    reader.readAsBinaryString(file);
                });

                setProgress(Math.round(((i + 1) / fileList.length) * 100));
                await yieldToMain();
            }

            setStatusMessage("Validating for duplicates...");
            const duplicateReport: DuplicateReport[] = [];

            globalTracker.forEach((fileSet, key) => {
                if (fileSet.size > 1) {
                    duplicateReport.push({
                        key: key.replace(/\|/g, '.'),
                        files: Array.from(fileSet),
                        count: fileSet.size
                    });
                }
            });

            setMergedData(tempMergedData);
            setDuplicates(duplicateReport);
            setStatusMessage("Processing Completed!");
            setShowReport(true);

        } catch (error) {
            console.error(error);
            setStatusMessage("Error during processing.");
            alert("An error occurred while merging files.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = async () => {
        if (mergedData.size === 0) {
            alert("No data to download.");
            return;
        }

        try {
            // 1. Fetch Template
            const response = await fetch('/OBJ_DB_TEMPLATE.xlsx');
            if (!response.ok) throw new Error("Template file not found. Ensure OBJ_DB_TEMPLATE.xlsx is in public folder.");
            const arrayBuffer = await response.arrayBuffer();

            // 2. Load Template Workbook
            const wb = XLSX.read(arrayBuffer, { type: 'array' });

            const sortedSheets = Array.from(mergedData.keys()).sort();
            console.log("Processing sheets:", sortedSheets);

            sortedSheets.forEach(sheetName => {
                const objects = mergedData.get(sheetName) || [];
                const rawRows = objects.map(item => item.data);

                if (rawRows.length === 0) return;

                console.log(`Sheet: ${sheetName}, Rows: ${rawRows.length}`);

                const ws = wb.Sheets[sheetName];
                if (ws) {
                    // ROBUST STRATEGY: Key-Independent Array Mapping (AoA)
                    // This aligns the data exactly to the columns present in the Template.

                    if (!ws['!ref']) {
                        // Completely empty
                        console.warn(`Sheet ${sheetName} is empty in template. Writing generic headers.`);
                        XLSX.utils.sheet_add_json(ws, rawRows, { origin: "A1" });
                        return;
                    }

                    // SMART APPEND LOGIC:
                    // The template likely has hundreds of "formatted but empty" rows.
                    // We must find the REAL last row of data (the headers).
                    const range = XLSX.utils.decode_range(ws['!ref']);

                    // Scan for headers in the first few rows (usually Row 0)
                    // We assume headers are at Row 0.
                    const headerRange = { ...range, e: { ...range.e, r: 0 } }; // Force read only first row
                    const headerData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, range: headerRange });
                    const headers = (headerData && headerData.length > 0) ? headerData[0] : [];

                    if (!headers || headers.length === 0) {
                        console.warn(`Sheet ${sheetName} has range but no headers. Appending raw.`);
                        // If we can't find headers, we can't map. 
                        // We just append at the bottom of the "Range".
                        // CAUTION: If range is huge (ghost rows), data will be hidden at bottom.
                        const nextRow = range.e.r + 1;
                        XLSX.utils.sheet_add_json(ws, rawRows, { origin: { r: nextRow, c: 0 }, skipHeader: true });

                        return;
                    }

                    // Map Data to Matrix based on Headers found in Template
                    const dataMatrix = rawRows.map(row => {
                        const rowKeys = Object.keys(row);
                        return headers.map(colHeader => {
                            // 1. Exact Match
                            if (row[colHeader] !== undefined) return row[colHeader];

                            // 2. Fuzzy Match (handle spaces/underscores/case)
                            const normalizedHeader = String(colHeader).replace(/[_\s]/g, '').toUpperCase();
                            const foundKey = rowKeys.find(k => k.replace(/[_\s]/g, '').toUpperCase() === normalizedHeader);

                            return foundKey ? row[foundKey] : "";
                        });
                    });

                    // DETERMINE START ROW:
                    // We know headers are at Row 0 (index 0).
                    // We should write data starting at Row 1 (index 1).
                    // We IGNORE existing "ghost" rows in the range if they are empty.
                    // To be safe, let's Append at Row 1 (overwriting empty formatted cells).
                    const appendRow = 1;

                    console.log(`Overwriting ${dataMatrix.length} rows to ${sheetName} at row ${appendRow + 1} (ignoring potential ghost rows)`);
                    XLSX.utils.sheet_add_aoa(ws, dataMatrix, { origin: { r: appendRow, c: 0 } });

                } else {
                    // Sheet not in template, create new
                    console.warn(`Sheet ${sheetName} not found in template. Creating new.`);
                    const newWs = XLSX.utils.json_to_sheet(rawRows);
                    XLSX.utils.book_append_sheet(wb, newWs, sheetName.substring(0, 31));
                }
            });

            // 4. Download
            const now = new Date();
            const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
            XLSX.writeFile(wb, `Merged_Object_DB_${timestamp}.xlsx`);

        } catch (e) {
            console.error("Download failed", e);
            alert("Failed to process template or download file. Check console (F12) for details.");
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
            <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link href="/oracle-object-validator" className="group flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100">
                            <ArrowLeft className="h-4 w-4" /> Back
                        </Link>
                        <h1 className="text-xl font-semibold">Object DB Merger</h1>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-4xl px-6 py-12">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 shadow-xl">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-full mb-4">
                            <FileSpreadsheet className="w-8 h-8 text-blue-500" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Merge Object DB Files</h2>
                        <p className="text-zinc-400">Upload multiple Excel files to combine them into a single, validated dataset.</p>
                    </div>

                    {/* File Drop Area */}
                    <div className="relative group cursor-pointer mb-6">
                        <input
                            type="file"
                            multiple
                            accept=".xlsx, .xls"
                            onChange={handleFileSelect}
                            disabled={isProcessing}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                        />
                        <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isProcessing ? 'border-zinc-700 bg-zinc-900/30' : 'border-zinc-700 hover:border-blue-500 hover:bg-zinc-800/50'}`}>
                            <Upload className="mx-auto h-10 w-10 text-zinc-500 mb-3 group-hover:text-blue-400" />
                            <p className="font-medium text-zinc-300">
                                {fileList.length > 0
                                    ? `Add more files...`
                                    : "Click or Drag Excel files here"}
                            </p>
                            <p className="text-xs text-zinc-500 mt-1">Supports .xlsx, .xls</p>
                        </div>
                    </div>

                    {/* File List */}
                    {fileList.length > 0 && (
                        <div className="mb-6 space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {fileList.map((item, i) => (
                                <div key={item.id} className="flex flex-col text-sm bg-zinc-950 p-3 rounded border border-zinc-800 group transition-colors hover:border-zinc-700">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-zinc-900 rounded text-green-500 border border-zinc-800">
                                                <FileSpreadsheet className="w-4 h-4" />
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="truncate font-medium text-zinc-200">{item.file.name}</span>
                                                <span className="text-zinc-500 text-xs text-left">{(item.file.size / 1024).toFixed(1)} KB</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeFile(item.id)}
                                            className="text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-all p-2 rounded-lg"
                                            title="Remove file"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* File Summary Label */}
                                    <div className="mt-2 pl-[3.25rem] text-xs">
                                        {item.isLoadingSummary ? (
                                            <div className="flex items-center gap-2 text-zinc-500">
                                                <Loader2 className="w-3 h-3 animate-spin" /> Scanning content...
                                            </div>
                                        ) : (
                                            <div className="text-zinc-400 font-mono break-words leading-relaxed">
                                                {item.summary || "No objects found"}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-center">
                        <button
                            onClick={processFiles}
                            disabled={fileList.length === 0 || isProcessing}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2"
                        >
                            {isProcessing ? <Loader2 className="animate-spin w-5 h-5" /> : <Download className="w-5 h-5" />}
                            {isProcessing ? "Merging in progress..." : "Merge All Files"}
                        </button>
                    </div>

                    {/* Progress Bar */}
                    {isProcessing && (
                        <div className="mt-6 space-y-2 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex justify-between text-xs text-zinc-400">
                                <span>{statusMessage}</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Completion Report Modal */}
            {showReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="p-6 border-b border-zinc-800 bg-zinc-950/50 rounded-t-xl">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                <CheckCircle2 className="text-emerald-500" /> Merge Complete
                            </h2>
                            <p className="text-sm text-zinc-400 mt-1">
                                Successfully merged <span className="text-white font-mono">{Array.from(mergedData.values()).reduce((a, b) => a + b.length, 0)}</span> objects from {fileList.length} files.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {duplicates.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-orange-400 bg-orange-900/20 p-3 rounded-lg border border-orange-900/50">
                                        <AlertTriangle className="w-5 h-5" />
                                        <span className="font-bold">Found {duplicates.length} Duplicate Objects</span>
                                    </div>
                                    <div className="border border-zinc-800 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-zinc-950 text-zinc-500 uppercase text-xs">
                                                <tr>
                                                    <th className="p-3">Object</th>
                                                    <th className="p-3">Found In</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800">
                                                {duplicates.map((dup, idx) => (
                                                    <tr key={idx} className="bg-zinc-900/50">
                                                        <td className="p-3 font-mono text-zinc-300">
                                                            {dup.key}
                                                        </td>
                                                        <td className="p-3 text-zinc-500 text-xs">
                                                            {dup.files.join(", ")}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-zinc-500">
                                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
                                    No duplicates found across files.
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-zinc-800 bg-zinc-950/50 rounded-b-xl flex justify-end gap-3">
                            <button
                                onClick={() => setShowReport(false)}
                                className="px-4 py-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={handleDownload}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold shadow-lg shadow-emerald-900/20 flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" /> Download Merged DB
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
