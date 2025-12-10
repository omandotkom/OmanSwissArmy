"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileSpreadsheet, Database, ArrowRight, Settings2 } from "lucide-react";
import * as XLSX from "xlsx";
import ConnectionManager from "@/components/ConnectionManager";
import { OracleConnection } from "@/services/connection-storage";

interface ExcelRow {
    [key: string]: any;
}

interface SheetData {
    name: string;
    data: ExcelRow[];
    headers: string[];
}

interface OwnerMapping {
    [ownerName: string]: {
        source: OracleConnection | null;
        target: OracleConnection | null;
    }
}

export default function DeployOracleDB() {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sheets, setSheets] = useState<SheetData[]>([]);
    const [activeTab, setActiveTab] = useState<number>(0);
    const [selectedRows, setSelectedRows] = useState<{ [sheetName: string]: Set<number> }>({});
    const [filters, setFilters] = useState<{ [key: string]: string }>({});

    // Owner & Connection Logic
    const [detectedOwners, setDetectedOwners] = useState<string[]>([]);
    const [ownerMappings, setOwnerMappings] = useState<OwnerMapping>({});

    // Connection Manager Interaction State
    const [isConnManagerOpen, setIsConnManagerOpen] = useState(false);
    const [selectingForOwner, setSelectingForOwner] = useState<string | null>(null);
    const [selectingForType, setSelectingForType] = useState<"source" | "target" | null>(null);

    const openConnManager = (owner: string, type: "source" | "target") => {
        setSelectingForOwner(owner);
        setSelectingForType(type);
        setIsConnManagerOpen(true);
    };

    const handleConnSelect = (conn: OracleConnection) => {
        if (selectingForOwner && selectingForType) {
            setOwnerMappings(prev => ({
                ...prev,
                [selectingForOwner]: {
                    ...prev[selectingForOwner],
                    [selectingForType]: conn
                }
            }));
        }
        setSelectingForOwner(null);
        setSelectingForType(null);
        setIsConnManagerOpen(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        const validTypes = [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ];
        if (!validTypes.includes(uploadedFile.type)) {
            alert("Invalid file type. Please upload an Excel file.");
            return;
        }

        setFile(uploadedFile);
        setIsLoading(true);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: "binary" });

                const loadedSheets: SheetData[] = [];
                const initialSelections: { [sheetName: string]: Set<number> } = {};
                const ownersSet = new Set<string>();

                wb.SheetNames.forEach((wsname) => {
                    const ws = wb.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: "" });

                    if (data.length > 0) {
                        const headers = Object.keys(data[0]);
                        loadedSheets.push({
                            name: wsname,
                            data: data,
                            headers: headers,
                        });
                        initialSelections[wsname] = new Set();
                    }

                    // Scan for OWNER
                    data.forEach(row => {
                        if (row['OWNER']) {
                            ownersSet.add(String(row['OWNER']).toUpperCase().trim());
                        }
                    });
                });

                // Initialize Mapping
                const ownersList = Array.from(ownersSet).sort();
                const initialMapping: OwnerMapping = {};
                ownersList.forEach(owner => {
                    initialMapping[owner] = { source: null, target: null };
                });

                setSheets(loadedSheets);
                setSelectedRows(initialSelections);
                setDetectedOwners(ownersList);
                setOwnerMappings(initialMapping);
                setActiveTab(0);

            } catch (err) {
                console.error("Error parsing excel", err);
                alert("Failed to parse Excel file.");
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    // Filter & Selection Handlers
    const handleFilterChange = (header: string, value: string) => {
        setFilters((prev) => ({
            ...prev,
            [`${sheets[activeTab].name}-${header}`]: value,
        }));
    };

    const getFilteredData = () => {
        if (!sheets[activeTab]) return [];
        const currentSheetName = sheets[activeTab].name;
        const data = sheets[activeTab].data;

        return data.filter(row => {
            return sheets[activeTab].headers.every(header => {
                const filterValue = filters[`${currentSheetName}-${header}`]?.toLowerCase();
                if (!filterValue) return true;
                const cellValue = String(row[header] || "").toLowerCase();
                return cellValue.includes(filterValue);
            });
        });
    };

    const filteredData = getFilteredData();

    const toggleRowSelection = (sheetName: string, rowIndex: number) => {
        const newSelection = new Set(selectedRows[sheetName]);
        if (newSelection.has(rowIndex)) {
            newSelection.delete(rowIndex);
        } else {
            newSelection.add(rowIndex);
        }
        setSelectedRows({ ...selectedRows, [sheetName]: newSelection });
    };

    const toggleSelectAll = (sheetName: string) => {
        const currentSheet = sheets.find((s) => s.name === sheetName);
        if (!currentSheet) return;

        const currentFiltered = getFilteredData();
        if (currentFiltered.length === 0) return;

        // Check if ALL filtered rows are currently selected
        const allFilteredAreSelected = currentFiltered.every(row => {
            const originalIndex = currentSheet.data.indexOf(row);
            return selectedRows[sheetName]?.has(originalIndex);
        });

        const newSelection = new Set(selectedRows[sheetName]);

        if (allFilteredAreSelected) {
            currentFiltered.forEach(row => {
                const idx = currentSheet.data.indexOf(row);
                newSelection.delete(idx);
            });
        } else {
            currentFiltered.forEach(row => {
                const idx = currentSheet.data.indexOf(row);
                newSelection.add(idx);
            });
        }

        setSelectedRows({ ...selectedRows, [sheetName]: newSelection });
    };

    const isAllSelected = (sheetName: string) => {
        const currentFiltered = getFilteredData();
        if (currentFiltered.length === 0) return false;
        return currentFiltered.every(row => {
            const originalIndex = sheets[activeTab].data.indexOf(row);
            return selectedRows[sheetName]?.has(originalIndex);
        });
    };

    // Validation: Ready to Deploy?
    const isReadyToDeploy =
        file &&
        detectedOwners.length > 0 &&
        detectedOwners.every(owner => ownerMappings[owner]?.source && ownerMappings[owner]?.target);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center">
                        <Link href="/" className="mr-4 p-2 rounded-full hover:bg-zinc-800 transition-colors">
                            <ArrowLeft className="w-6 h-6" />
                        </Link>
                        <h1 className="text-3xl font-light tracking-wide">Deploy Oracle Object DB</h1>
                    </div>
                    <button
                        onClick={() => setIsConnManagerOpen(true)}
                        className="flex items-center gap-2 text-zinc-400 hover:text-blue-400 transition-colors bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700"
                    >
                        <Settings2 className="w-4 h-4" />
                        Manage Connections
                    </button>
                </div>

                {/* Upload Section (Shown if no file) */}
                {!file && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 mb-8 text-center border-dashed border-2 hover:border-blue-500/50 transition-colors">
                        <div className="flex flex-col items-center justify-center">
                            <div className="bg-zinc-800 p-4 rounded-full mb-6">
                                <FileSpreadsheet className="w-12 h-12 text-zinc-400" />
                            </div>
                            <label htmlFor="file-upload" className="cursor-pointer group relative">
                                <span className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-full font-medium transition-all inline-flex items-center gap-2 shadow-lg shadow-blue-900/20 text-lg">
                                    <Upload className="w-5 h-5" />
                                    Upload Object List Input (.xlsx)
                                </span>
                                <input
                                    id="file-upload"
                                    type="file"
                                    accept=".xlsx, .xls"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                            </label>
                            <p className="mt-4 text-zinc-500">Supports standard Oracle Object List format</p>
                        </div>
                    </div>
                )}

                {/* Connection Mapping Section (Shown after upload) */}
                {!isLoading && file && detectedOwners.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-medium flex items-center gap-2">
                                <Database className="w-5 h-5 text-purple-500" />
                                Connection Mapping
                                <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full font-normal">
                                    {detectedOwners.length} Owner(s) Detected
                                </span>
                            </h2>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setFile(null);
                                        setSheets([]);
                                        setDetectedOwners([]);
                                        setOwnerMappings({});
                                    }}
                                    className="text-xs text-red-500 hover:bg-zinc-800 px-3 py-1 rounded transition-colors"
                                >
                                    Reset File
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-12 gap-4 mb-2 px-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                            <div className="col-span-2">Object Owner</div>
                            <div className="col-span-5">Source Connection (Dev)</div>
                            <div className="col-span-5">Target Connection (Deploy To)</div>
                        </div>

                        <div className="space-y-3">
                            {detectedOwners.map(owner => (
                                <div key={owner} className="grid grid-cols-12 gap-4 items-center bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/50">
                                    <div className="col-span-2 font-mono text-sm text-yellow-500 font-bold truncate" title={owner}>
                                        {owner}
                                    </div>

                                    {/* Source Selector */}
                                    <div className="col-span-5">
                                        <button
                                            onClick={() => openConnManager(owner, "source")}
                                            className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all flex justify-between items-center group ${ownerMappings[owner]?.source
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                                                    : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                                                }`}
                                        >
                                            <div className="truncate flex flex-col">
                                                <span className="font-medium">{ownerMappings[owner]?.source?.name || "Select Source DB..."}</span>
                                                {ownerMappings[owner]?.source && (
                                                    <span className="text-[10px] text-zinc-500">{ownerMappings[owner]?.source?.username}@{ownerMappings[owner]?.source?.host}</span>
                                                )}
                                            </div>
                                            <Settings2 className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                        </button>
                                    </div>

                                    {/* Target Selector */}
                                    <div className="col-span-5">
                                        <button
                                            onClick={() => openConnManager(owner, "target")}
                                            className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all flex justify-between items-center group ${ownerMappings[owner]?.target
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                                                    : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                                                }`}
                                        >
                                            <div className="truncate flex flex-col">
                                                <span className="font-medium">{ownerMappings[owner]?.target?.name || "Select Target DB..."}</span>
                                                {ownerMappings[owner]?.target && (
                                                    <span className="text-[10px] text-zinc-500">{ownerMappings[owner]?.target?.username}@{ownerMappings[owner]?.target?.host}</span>
                                                )}
                                            </div>
                                            <Settings2 className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Loading State */}
                {isLoading && (
                    <div className="text-center py-12">
                        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-zinc-400 animate-pulse">Parsing data...</p>
                    </div>
                )}

                {/* Data Preview */}
                {!isLoading && sheets.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl mb-24">
                        {/* Tabs */}
                        <div className="flex overflow-x-auto border-b border-zinc-800 bg-zinc-950/50">
                            {sheets.map((sheet, idx) => (
                                <button
                                    key={sheet.name}
                                    onClick={() => setActiveTab(idx)}
                                    className={`px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === idx
                                            ? "bg-zinc-800 text-white border-b-2 border-blue-500"
                                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                        }`}
                                >
                                    {sheet.name} <span className="ml-2 bg-zinc-700 text-xs px-2 py-0.5 rounded-full text-zinc-300">{sheet.data.length}</span>
                                </button>
                            ))}
                        </div>

                        {/* Table Content */}
                        <div className="p-0 overflow-x-auto">
                            <div className="min-w-full inline-block align-middle">
                                <div className="overflow-hidden">
                                    <table className="min-w-full divide-y divide-zinc-800">
                                        <thead className="bg-zinc-950/50">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left w-12 align-top">
                                                    <div className="flex items-center pt-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={isAllSelected(sheets[activeTab].name)}
                                                            onChange={() => toggleSelectAll(sheets[activeTab].name)}
                                                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
                                                        />
                                                        <span className="ml-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">All</span>
                                                    </div>
                                                </th>
                                                {sheets[activeTab].headers.map((header) => (
                                                    <th
                                                        key={header}
                                                        scope="col"
                                                        className="px-6 py-3 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap"
                                                    >
                                                        <div className="flex flex-col gap-2">
                                                            <span>{header}</span>
                                                            <input
                                                                type="text"
                                                                placeholder={`Filter...`}
                                                                className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-blue-500 w-full font-normal normal-case"
                                                                value={filters[`${sheets[activeTab].name}-${header}`] || ""}
                                                                onChange={(e) => handleFilterChange(header, e.target.value)}
                                                            />
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800 bg-zinc-900/50">
                                            {filteredData.map((row) => {
                                                const originalIndex = sheets[activeTab].data.indexOf(row);
                                                return (
                                                    <tr key={originalIndex} className={selectedRows[sheets[activeTab].name]?.has(originalIndex) ? "bg-blue-900/10" : "hover:bg-zinc-800/50 transition-colors"}>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedRows[sheets[activeTab].name]?.has(originalIndex)}
                                                                onChange={() => toggleRowSelection(sheets[activeTab].name, originalIndex)}
                                                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
                                                            />
                                                        </td>
                                                        {sheets[activeTab].headers.map((header) => (
                                                            <td key={`${originalIndex}-${header}`} className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">
                                                                {row[header]}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredData.length === 0 && (
                                        <div className="p-8 text-center text-zinc-500 text-sm">
                                            No data matches your filter.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Deploy Button (Floating) */}
                {!isLoading && isReadyToDeploy && (
                    <div className="fixed bottom-8 right-8 z-40 animate-in zoom-in duration-300">
                        <button className="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-green-900/40 flex items-center gap-3 transition-transform hover:scale-105 active:scale-95">
                            <Database className="w-5 h-5" />
                            START DEPLOYMENT
                        </button>
                    </div>
                )}

                {/* Global Connection Manager Modal */}
                <ConnectionManager
                    isOpen={isConnManagerOpen}
                    onClose={() => setIsConnManagerOpen(false)}
                    onSelect={selectingForOwner ? handleConnSelect : undefined}
                />
            </div>
        </div>
    );
}
