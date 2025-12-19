"use client";

import { useState, useEffect } from "react";
import {
    X, Plus, RefreshCw, Trash2, Edit2, Database, Eye, EyeOff, Save, Download, Upload, Lock, Unlock, Search, CheckCircle2, Activity
} from "lucide-react";
import {
    getAllConnections, saveConnection, deleteConnection, OracleConnection,
    getEncryptedExportData, importEncryptedData
} from "@/services/connection-storage";
import { v4 as uuidv4 } from "uuid";

interface ConnectionManagerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect?: (conn: OracleConnection) => void; // Optional: if used for selection
    embedded?: boolean;
}

type CheckStatus = { id: string; name: string; host: string; status: 'pending' | 'testing' | 'success' | 'error'; message?: string };

import { useToast, ToastContainer } from "@/components/ui/toast";

export default function ConnectionManager({ isOpen, onClose, onSelect, embedded = false }: ConnectionManagerProps) {
    const [connections, setConnections] = useState<OracleConnection[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    // Toast Hook
    const { toasts, addToast, removeToast } = useToast();

    const filteredConnections = connections.filter(conn =>
        conn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conn.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conn.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Form State
    const [formData, setFormData] = useState<OracleConnection>({
        id: "",
        name: "",
        host: "",
        port: "1521",
        serviceName: "",
        username: "",
        password: "",
        color: "blue"
    });

    useEffect(() => {
        if (isOpen) {
            loadConnections();
        }
    }, [isOpen]);

    const loadConnections = async () => {
        setIsLoading(true);
        try {
            const data = await getAllConnections();
            setConnections(data);
        } catch (error) {
            console.error("Failed to load connections", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Test Connection State
    const [isTesting, setIsTesting] = useState(false);

    const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
    const [checkAllStatus, setCheckAllStatus] = useState<CheckStatus[] | null>(null);
    const [checkAllSort, setCheckAllSort] = useState<'default' | 'success' | 'failed'>('default');

    const checkAllSummary = checkAllStatus ? {
        total: checkAllStatus.length,
        success: checkAllStatus.filter(c => c.status === 'success').length,
        failed: checkAllStatus.filter(c => c.status === 'error').length,
        running: checkAllStatus.some(c => c.status === 'pending' || c.status === 'testing')
    } : null;

    const sortedCheckAllStatus = checkAllStatus ? [...checkAllStatus].sort((a, b) => {
        if (checkAllSort === 'success') {
            if (a.status === 'success' && b.status !== 'success') return -1;
            if (a.status !== 'success' && b.status === 'success') return 1;
        }
        if (checkAllSort === 'failed') {
            if (a.status === 'error' && b.status !== 'error') return -1;
            if (a.status !== 'error' && b.status === 'error') return 1;
        }
        return 0;
    }) : null;

    const resetForm = () => {
        setFormData({
            id: "",
            name: "",
            host: "",
            port: "1521",
            serviceName: "",
            username: "",
            password: "",
            color: "blue"
        });
        setIsEditing(false);
        setShowPassword(false);
        setTestResult(null);
    };

    const performSave = async (shouldReset = true) => {
        const idToUse = formData.id || uuidv4();
        const connToSave = {
            ...formData,
            id: idToUse
        };
        await saveConnection(connToSave);
        await loadConnections();

        if (shouldReset) {
            resetForm();
        } else {
            // If not resetting, we should at least update local state to have the ID so it's now in "Edit Mode"
            setFormData(prev => ({ ...prev, id: idToUse }));
            setIsEditing(true); // Switch to edit mode visually if not already
        }
        return connToSave;
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/oracle/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (res.ok) {
                setTestResult({ success: true, message: data.message });
                // Auto Save on Success
                await performSave(false);
                addToast("Connection successful and saved!", "success");
            } else {
                setTestResult({ success: false, error: data.error });
            }
        } catch (error) {
            setTestResult({ success: false, error: "Network or Server Error" });
        } finally {
            setIsTesting(false);
        }
    };

    const handleCheckAll = async () => {
        if (connections.length === 0) return;

        // Initialize statuses
        const initialStatuses: CheckStatus[] = connections.map(c => ({
            id: c.id,
            name: c.name,
            host: c.host,
            status: 'pending'
        }));
        setCheckAllStatus(initialStatuses);
        setCheckAllSort('default');

        // Use a slight delay to allow UI to render modal
        await new Promise(r => setTimeout(r, 100));

        // Function to update single status
        const updateStatus = (id: string, status: CheckStatus['status'], message?: string) => {
            setCheckAllStatus(prev => prev ? prev.map(item => item.id === id ? { ...item, status, message } : item) : null);
        };

        // Run checks with concurrency limit of 5
        const CONCURRENT_LIMIT = 5;
        for (let i = 0; i < connections.length; i += CONCURRENT_LIMIT) {
            const batch = connections.slice(i, i + CONCURRENT_LIMIT);
            await Promise.all(batch.map(async (conn) => {
                updateStatus(conn.id, 'testing');
                try {
                    const res = await fetch('/api/oracle/test-connection', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(conn)
                    });
                    if (res.ok) {
                        updateStatus(conn.id, 'success');
                    } else {
                        const data = await res.json();
                        updateStatus(conn.id, 'error', data.error);
                    }
                } catch (e) {
                    updateStatus(conn.id, 'error', "Network/Server Error");
                }
            }));
        }
    };

    const handleEdit = (conn: OracleConnection) => {
        setFormData({ ...conn, password: conn.password || "" });
        setIsEditing(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this connection?")) {
            await deleteConnection(id);
            loadConnections();
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        await performSave(true);
    };

    const handleImportSQLDev = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const json = JSON.parse(evt.target?.result as string);
                // SQL Developer Export Format usually has a structure related to references
                // We need to parse it loosely as structure might vary by version

                let count = 0;
                const potentialConns = json.connections || json; // adjust based on actual format

                if (Array.isArray(potentialConns)) {
                    for (const c of potentialConns) {
                        // Mapping logic (adjust based on sample provided later if needed)
                        // This is a "best guess" mapping for common SQL Dev JSON
                        const newConn: OracleConnection = {
                            id: uuidv4(),
                            name: c.name || c.ConnectionName || "Imported Connection",
                            host: c.info?.hostname || c.hostname || "localhost",
                            port: c.info?.port || c.port || "1521",
                            serviceName: c.info?.sid || c.sid || c.serviceName || "ORCL",
                            username: c.info?.user || c.user || c.username || "",
                            password: "", // Passwords are encrypted/missing in export
                            color: "gray"
                        };
                        await saveConnection(newConn);
                        count++;
                    }
                }

                loadConnections();
                alert(`Imported ${count} connections. Please update their passwords manually.`);
            } catch (err) {
                console.error("Import failed", err);
                alert("Failed to parse SQL Developer JSON.");
            }
        };

        reader.readAsText(file);
    };

    const handleSuperExport = async () => {
        try {
            const encryptedData = await getEncryptedExportData();
            const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `oman_connections_${new Date().toISOString().split('T')[0]}.conn`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Super Export failed", err);
            alert("Failed to export connections.");
        }
    };

    const handleSuperImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const content = evt.target?.result as string;
                const count = await importEncryptedData(content);
                alert(`Successfully imported ${count} connections securely.`);
                loadConnections();
            } catch (err) {
                console.error("Super Import failed", err);
                alert("Failed to import. Invalid file or corruption.");
            }
        };
        reader.readAsText(file);
    };

    if (!isOpen && !embedded) return null;

    const content = (
        <div className={`bg-zinc-900 border border-zinc-800 rounded-xl flex overflow-hidden shadow-2xl relative z-50 ${embedded ? "w-full h-full border-0 rounded-none shadow-none" : "w-full max-w-4xl h-[80vh]"}`}>
            {/* Left Sidebar: List */}
            <div className="w-1/3 border-r border-zinc-800 flex flex-col bg-zinc-950/50">
                <div className="p-4 border-b border-zinc-800">
                    <div className="flex flex-col gap-3 mb-3">
                        <h2 className="font-semibold text-zinc-200">Connections</h2>
                        <div className="flex flex-wrap gap-2 text-zinc-400">
                            {/* Super Import */}
                            <label className="cursor-pointer p-2 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-lg text-orange-500 hover:text-orange-400 transition-colors flex-1 flex justify-center" title="Super Import (.conn)">
                                <Download className="w-4 h-4" />
                                <input type="file" accept=".conn" className="hidden" onChange={handleSuperImport} />
                            </label>

                            {/* Super Export */}
                            <button onClick={handleSuperExport} className="p-2 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-lg text-orange-500 hover:text-orange-400 transition-colors flex-1 flex justify-center" title="Super Export (.conn)">
                                <Lock className="w-4 h-4" />
                            </button>

                            <label className="cursor-pointer p-2 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-colors flex-1 flex justify-center" title="Import JSON">
                                <Download className="w-4 h-4" />
                                <input type="file" accept=".json" className="hidden" onChange={handleImportSQLDev} />
                            </label>
                            <button onClick={resetForm} className="p-2 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-green-400 transition-colors flex-1 flex justify-center" title="New Connection">
                                <Plus className="w-4 h-4" />
                            </button>
                            <button onClick={handleCheckAll} className="p-2 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-colors flex-1 flex justify-center" title="Check All Connections">
                                <Activity className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {/* Search Input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search connections..."
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-blue-500"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {isLoading ? (
                        <div className="text-center text-zinc-500 py-4">Loading...</div>
                    ) : filteredConnections.length === 0 ? (
                        <div className="text-center text-zinc-500 py-4 text-sm">
                            {searchQuery ? "No matches found." : "No connections saved."}
                        </div>
                    ) : (
                        filteredConnections.map(conn => (
                            <div
                                key={conn.id}
                                onClick={() => handleEdit(conn)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all group relative ${formData.id === conn.id
                                    ? "bg-zinc-800 border-blue-500/50"
                                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-medium text-zinc-300 truncate">{conn.name}</span>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(conn.id); }}
                                            className="text-zinc-500 hover:text-red-500 p-1"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                                <div className="text-xs text-zinc-500 flex items-center gap-1">
                                    <span className="max-w-[120px] truncate">{conn.username}@{conn.host}</span>
                                </div>
                                {onSelect && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onSelect(conn); onClose(); }}
                                        className="absolute right-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        Select
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right Content: Form */}
            <div className="flex-1 flex flex-col">
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                    <h3 className="text-lg font-light">
                        {formData.id ? "Edit Connection" : "New Connection"}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Connection Name</label>
                            <input
                                type="text"
                                required
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none transition-colors"
                                placeholder="e.g. DEV Eproc Phase 3"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <label className="block text-xs font-medium text-zinc-400 mb-1">Hostname / IP</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none transition-colors"
                                    placeholder="10.x.x.x"
                                    value={formData.host}
                                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1">Port</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none transition-colors"
                                    value={formData.port}
                                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Service Name / SID</label>
                            <input
                                type="text"
                                required
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none transition-colors"
                                placeholder="ORCL"
                                value={formData.serviceName}
                                onChange={(e) => setFormData({ ...formData, serviceName: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-zinc-400 mb-1">Username</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none transition-colors"
                                    placeholder="APPS_USER"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                />
                            </div>
                            <div className="relative">
                                <label className="block text-xs font-medium text-zinc-400 mb-1">Password</label>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:border-blue-500 focus:outline-none transition-colors"
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-[29px] text-zinc-500 hover:text-zinc-300"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-zinc-800 mt-auto">
                        {formData.id && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-4 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 transition-colors font-medium text-sm"
                            >
                                Cancel
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isTesting}
                            className={`px-4 py-2 rounded-lg font-medium transition-all shadow-lg flex items-center gap-2 ${testResult?.success ? "bg-green-600/20 text-green-400 border border-green-500/50"
                                : testResult?.error ? "bg-red-600/20 text-red-400 border border-red-500/50"
                                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                                }`}
                        >
                            {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {isTesting ? "Testing..." : "Test Connection"}
                        </button>
                        <button
                            type="submit"
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            Save Connection
                        </button>
                    </div>
                    {testResult && (
                        <div className={`mt-2 text-xs text-center ${testResult.success ? "text-green-400" : "text-red-400"}`}>
                            {testResult.success ? testResult.message : testResult.error}
                        </div>
                    )}
                </form>
            </div>

            {/* Connection Check Progress Modal (Overlay) */}
            {checkAllSummary && sortedCheckAllStatus && (
                <div className="absolute inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm rounded-xl">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl max-h-[80vh] flex flex-col">
                        <div className="flex items-center gap-3 mb-4 shrink-0">
                            {checkAllSummary.running ? (
                                <div className="w-8 h-8 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
                            ) : checkAllSummary.failed > 0 ? (
                                <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center">
                                    <X className="w-5 h-5" />
                                </div>
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                            )}
                            <div>
                                <h3 className="font-bold text-lg text-white">
                                    {checkAllSummary.running ? "Checking Connections..." : `Done check ${checkAllSummary.total} connections`}
                                </h3>
                                <p className="text-zinc-500 text-xs">
                                    {checkAllSummary.running ? `Verifying ${checkAllSummary.total} connections` : "Check process completed"}
                                </p>
                            </div>
                        </div>

                        {/* Stats & Sort */}
                        <div className="flex flex-col gap-2 mb-4 bg-zinc-950/50 p-3 rounded-lg border border-zinc-800 shrink-0">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-zinc-400">Total Connection: <span className="text-zinc-200 font-bold">{checkAllSummary.total}</span></span>
                                <span className="text-green-500">Successfull: <span className="font-bold">{checkAllSummary.success}</span></span>
                                <span className="text-red-500">Failed: <span className="font-bold">{checkAllSummary.failed}</span></span>
                            </div>
                            {!checkAllSummary.running && (
                                <div className="flex gap-2 pt-2 border-t border-zinc-800/50 mt-2">
                                    <button
                                        onClick={() => setCheckAllSort('default')}
                                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded border transition-colors ${checkAllSort === 'default' ? 'bg-zinc-800 text-zinc-200 border-zinc-700' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800'}`}
                                    >
                                        Default
                                    </button>
                                    <button
                                        onClick={() => setCheckAllSort('success')}
                                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded border transition-colors ${checkAllSort === 'success' ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800'}`}
                                    >
                                        Sort Success
                                    </button>
                                    <button
                                        onClick={() => setCheckAllSort('failed')}
                                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded border transition-colors ${checkAllSort === 'failed' ? 'bg-red-900/30 text-red-400 border-red-800' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:bg-zinc-800'}`}
                                    >
                                        Sort Failed
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 flex-1 overflow-y-auto min-h-0 pr-2">
                            {sortedCheckAllStatus.map((chk, idx) => (
                                <div key={chk.id || idx} className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800 transition-all">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 rounded-md bg-zinc-900 flex items-center justify-center text-zinc-400 shrink-0">
                                            <Database className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium text-zinc-200 truncate">{chk.name}</div>
                                            <div className="text-xs text-zinc-500 truncate">{chk.host}</div>
                                        </div>
                                    </div>
                                    <div className="text-xs font-bold shrink-0 pl-2">
                                        {chk.status === 'pending' && <span className="text-zinc-600">WAITING</span>}
                                        {chk.status === 'testing' && <span className="text-blue-400 animate-pulse">TESTING...</span>}
                                        {chk.status === 'success' && <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>}
                                        {chk.status === 'error' && <span className="text-red-500 flex items-center gap-1">FAILED</span>}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex justify-end shrink-0">
                            <button
                                onClick={() => setCheckAllStatus(null)}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium"
                            >
                                {checkAllSummary.running ? 'Cancel' : 'Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    if (embedded) {
        return (
            <div className="w-full h-full flex flex-col">
                <div className="relative z-[60]">
                    <ToastContainer toasts={toasts} removeToast={removeToast} />
                </div>
                {content}
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            {/* Render ToastContainer on top */}
            <div className="relative z-[60]">
                <ToastContainer toasts={toasts} removeToast={removeToast} />
            </div>
            {content}
        </div>
    );
}
