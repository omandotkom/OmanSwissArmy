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

export default function DeployOracleDB() {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sheets, setSheets] = useState<SheetData[]>([]);
    const [activeTab, setActiveTab] = useState<number>(0);
    const [selectedRows, setSelectedRows] = useState<{ [sheetName: string]: Set<number> }>({});
    const [filters, setFilters] = useState<{ [key: string]: string }>({});

    // Connection Manager Interaction State
    const [isConnManagerOpen, setIsConnManagerOpen] = useState(false);
    const [selectingFor, setSelectingFor] = useState<"source" | "target" | null>(null);
    const [sourceConn, setSourceConn] = useState<OracleConnection | null>(null);
    const [targetConn, setTargetConn] = useState<OracleConnection | null>(null);

    const openConnManager = (type: "source" | "target") => {
        setSelectingFor(type);
        setIsConnManagerOpen(true);
    };

    const handleConnSelect = (conn: OracleConnection) => {
        if (selectingFor === "source") {
            setSourceConn(conn);
        } else {
            setTargetConn(conn);
        }
        setSelectingFor(null);
        setIsConnManagerOpen(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        // Validate file type
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
                });

                setSheets(loadedSheets);
                setSelectedRows(initialSelections);
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

        const newSelection = new Set(selectedRows[sheetName]);

        const allFilteredAreSelected = currentFiltered.every(row => {
            const originalIndex = currentSheet.data.indexOf(row);
            return newSelection.has(originalIndex);
        });

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
        const currentSelection = selectedRows[sheetName];
        if (!currentSelection) return false;

        return currentFiltered.every(row => {
            const originalIndex = sheets[activeTab].data.indexOf(row);
            return currentSelection.has(originalIndex);
        });
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center mb-8">
                    <Link href="/" className="mr-4 p-2 rounded-full hover:bg-zinc-800 transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <h1 className="text-3xl font-light tracking-wide">Deploy Oracle Object DB</h1>
                </div>

                {/* Configurations Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">

                    {/* Database Selection Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                            <Database className="w-5 h-5 text-blue-500" />
                            Database Connections
                        </h2>

                        <div className="flex items-center gap-4">
                            {/* Source DB */}
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-400 mb-2">SOURCE (Development)</label>
                                <button
                                    onClick={() => openConnManager("source")}
                                    className="w-full bg-zinc-950 border border-zinc-700 hover:border-blue-500 rounded-lg p-3 text-left transition-all group relative"
                                >
                                    {sourceConn ? (
                                        <div>
                                            <div className="font-medium text-zinc-200">{sourceConn.name}</div>
                                            <div className="text-xs text-zinc-500">{sourceConn.username}@{sourceConn.host}</div>
                                        </div>
                                    ) : (
                                        <span className="text-zinc-500 italic">Select Source DB...</span>
                                    )}
                                    <div className="absolute top-3 right-3 text-zinc-600 group-hover:text-blue-500">
                                        <Settings2 className="w-4 h-4" />
                                    </div>
                                </button>
                            </div>

                            <ArrowRight className="w-6 h-6 text-zinc-600 mt-6" />

                            {/* Target DB */}
                            <div className="flex-1">
                                <label className="block text-xs font-medium text-zinc-400 mb-2">TARGET (QA/Prod)</label>
                                <button
                                    onClick={() => openConnManager("target")}
                                    className="w-full bg-zinc-950 border border-zinc-700 hover:border-green-500 rounded-lg p-3 text-left transition-all group relative"
                                >
                                    {targetConn ? (
                                        <div>
                                            <div className="font-medium text-zinc-200">{targetConn.name}</div>
                                            <div className="text-xs text-zinc-500">{targetConn.username}@{targetConn.host}</div>
                                        </div>
                                    ) : (
                                        <span className="text-zinc-500 italic">Select Target DB...</span>
                                    )}
                                    <div className="absolute top-3 right-3 text-zinc-600 group-hover:text-green-500">
                                        <Settings2 className="w-4 h-4" />
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* File Upload Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                        <div className="bg-zinc-800 p-3 rounded-full mb-3">
                            <FileSpreadsheet className="w-6 h-6 text-zinc-400" />
                        </div>
                        <label htmlFor="file-upload" className="cursor-pointer group relative w-full max-w-xs">
                            <span className="bg-blue-600 hover:bg-blue-500 text-white w-full py-2 rounded-lg font-medium transition-all inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">
                                <Upload className="w-4 h-4" />
                                {file ? "Change Excel File" : "Upload Object List (.xlsx)"}
                            </span>
                            <input
                                id="file-upload"
                                type="file"
                                accept=".xlsx, .xls"
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                        </label>
                        {file && <p className="mt-3 text-zinc-400 text-sm">Selected: <span className="text-zinc-200 font-medium">{file.name}</span></p>}
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="text-center py-12">
                        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-zinc-400 animate-pulse">Parsing data...</p>
                    </div>
                )}

                {/* Data Preview */}
                {!isLoading && sheets.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
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
                                                // Find original index for selection logic
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
                {!isLoading && sheets.length > 0 && sourceConn && targetConn && (
                    <div className="fixed bottom-8 right-8 z-40">
                        <button className="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-green-900/40 flex items-center gap-3 transition-transform hover:scale-105 active:scale-95">
                            <Database className="w-5 h-5" />
                            START DEPLOYMENT
                        </button>
                    </div>
                )}

                <ConnectionManager
                    isOpen={isConnManagerOpen}
                    onClose={() => setIsConnManagerOpen(false)}
                    onSelect={handleConnSelect}
                />
            </div>
        </div>
    );
}
