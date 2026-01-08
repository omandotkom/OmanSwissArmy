"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
    ArrowLeft,
    Ghost,
    HardDrive,
    Search,
    RefreshCw,
    Download,
    AlertTriangle,
    CheckCircle,
    Terminal,
    Eye,
    Trash2
} from "lucide-react";
import { UserBadge } from "@/components/UserBadge";
import { trackActivity } from "@/lib/tracker";

interface ZombiePVC {
    namespace: string;
    name: string;
    capacity: string;
    storageClass: string;
    status: string;
    age: string;
    volumeName: string;
}

interface ScanSummary {
    totalScanned: number;
    totalMounted: number;
    totalZombies: number;
    totalWastedSize: string;
    worstNamespace: { name: string, sizeStr: string };
}

export default function PvcHunterPage() {
    const router = useRouter();

    // -- Auth State --
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loginCommand, setLoginCommand] = useState("");
    const [loginError, setLoginError] = useState("");
    const [checkingLogin, setCheckingLogin] = useState(true);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // -- App State --
    const [isScanning, setIsScanning] = useState(false);
    const [hasScanned, setHasScanned] = useState(false);
    const [zombies, setZombies] = useState<ZombiePVC[]>([]);
    const [summary, setSummary] = useState<ScanSummary | null>(null);
    const [error, setError] = useState("");
    const [logs, setLogs] = useState<string[]>([]);
    const [scanProgress, setScanProgress] = useState(0);

    // -- Filter State --
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState<'size-desc' | 'size-asc' | 'date-desc'>('size-desc');

    // -- Initial Load --
    useEffect(() => {
        checkLoginStatus();
    }, []);

    const checkLoginStatus = async () => {
        setCheckingLogin(true);
        try {
            const res = await fetch('/api/oc/projects');
            if (res.ok) {
                setIsLoggedIn(true);
            } else {
                setIsLoggedIn(false);
            }
        } catch (e) { setIsLoggedIn(false); }
        finally { setCheckingLogin(false); }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError("");
        setIsLoggingIn(true);
        try {
            const res = await fetch('/api/oc/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: loginCommand })
            });
            if (res.ok) {
                setIsLoggedIn(true);
                trackActivity({ action: "LOGIN_SUCCESS", label: "PVC Hunter" });
            } else {
                const d = await res.json();
                setLoginError(d.error || 'Login failed');
            }
        } catch (e) { setLoginError("Network error"); }
        finally { setIsLoggingIn(false); }
    };

    // -- Core Logic --
    // -- Core Logic --
    const startScan = async () => {
        setIsScanning(true);
        setError("");
        setZombies([]);
        setSummary(null);
        setLogs(["Fetching project list..."]);
        setScanProgress(0);
        setHasScanned(false);

        try {
            // 1. Get Projects
            const projRes = await fetch('/api/oc/projects');
            if (!projRes.ok) throw new Error("Failed to fetch projects");
            const projData = await projRes.json();
            const projects = projData.projects || [];

            setLogs(prev => [...prev, `Found ${projects.length} projects. Starting scan...`]);

            let totalZombies = 0;
            let totalScanned = 0;
            let totalWastedBytes = 0;
            let currentZombies: ZombiePVC[] = [];
            const nsStats: { [key: string]: number } = {};

            // 2. Scan each project
            // We'll do batches of 3 to speed it up but not kill the server
            const batchSize = 3;
            for (let i = 0; i < projects.length; i += batchSize) {
                const batch = projects.slice(i, i + batchSize);

                const promises = batch.map(async (prj: string) => {
                    try {
                        const res = await fetch(`/api/oc/scan-project-zombies?project=${prj}`);
                        const data = await res.json();
                        if (res.ok && data.zombies) {
                            return { project: prj, zombies: data.zombies, scanned: data.scannedCount };
                        }
                    } catch (e) { console.error(e); }
                    return { project: prj, zombies: [], scanned: 0 };
                });

                const results = await Promise.all(promises);

                // Process batch results
                results.forEach(res => {
                    if (!res) return;
                    totalScanned += res.scanned;

                    if (res.zombies.length > 0) {
                        // Add to main list
                        currentZombies = [...currentZombies, ...res.zombies];
                        setZombies(prev => [...prev, ...res.zombies]); // Incremental update
                        totalZombies += res.zombies.length;

                        // Calculate stats
                        res.zombies.forEach((z: any) => {
                            totalWastedBytes += (z.capacityBytes || 0);
                            nsStats[z.namespace] = (nsStats[z.namespace] || 0) + (z.capacityBytes || 0);
                        });
                    }
                });

                const currentCount = Math.min(i + batchSize, projects.length);
                const percent = Math.round((currentCount / projects.length) * 100);
                setScanProgress(percent);

                setLogs(prev => {
                    const newLog = `(${percent}%) Scanned ${currentCount}/${projects.length} projects... (Found ${totalZombies} zombies so far)`;
                    // Keep log size small, remove old entries if needed
                    return [newLog, ...prev.slice(0, 5)];
                });
            }

            // 3. Finalize Summary
            let worstNs = { name: '-', size: 0, sizeStr: '0 B' };
            Object.keys(nsStats).forEach(ns => {
                if (nsStats[ns] > worstNs.size) {
                    worstNs = { name: ns, size: nsStats[ns], sizeStr: formatBytes(nsStats[ns]) };
                }
            });

            setSummary({
                totalScanned,
                totalMounted: totalScanned - totalZombies, // Rough estimate
                totalZombies,
                totalWastedSize: formatBytes(totalWastedBytes),
                worstNamespace: worstNs
            });

            setHasScanned(true);
            setLogs(prev => ["Scan Complete.", ...prev]);
            trackActivity({ action: "GLOBAL_PVC_SCAN", label: "Success", details: { count: totalZombies } });

        } catch (e: any) {
            setError(e.message);
            setLogs(prev => [`Error: ${e.message}`, ...prev]);
        } finally {
            setIsScanning(false);
            setScanProgress(100);
        }
    };

    // Helper needed for formatBytes inside the component since we removed the API summary logic
    function formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    const handleExport = () => {
        if (zombies.length === 0) return;
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(zombies);
        XLSX.utils.book_append_sheet(wb, ws, "ZombiePVCs");
        XLSX.writeFile(wb, "global_zombie_pvcs_report.xlsx");
        trackActivity({ action: "EXPORT_ZOMBIE_REPORT" });
    };

    const handleInspect = (namespace: string, pvcName: string) => {
        // Redirect to PVC Analyzer with pre-selected project
        // Note: PVC Analyzer needs to be updated to auto-scroll or highlight, 
        // but for now bringing user to the dash is good enough.
        // Or we can use the dedicated Inspect API if we want to be fancy later.
        router.push(`/pvc-analyzer?project=${namespace}&search=${pvcName}`);
    };

    // -- Filtering & Sorting --

    // Helper for size parsing (simplified)
    const getBytes = (sizeStr: string) => {
        const val = parseFloat(sizeStr);
        if (sizeStr.includes('Ti')) return val * 1024 * 1024 * 1024 * 1024;
        if (sizeStr.includes('Gi')) return val * 1024 * 1024 * 1024;
        if (sizeStr.includes('Mi')) return val * 1024 * 1024;
        return val;
    };

    const filteredZombies = zombies
        .filter(z =>
            z.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            z.namespace.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            if (sortOrder === 'size-desc') return getBytes(b.capacity) - getBytes(a.capacity);
            if (sortOrder === 'size-asc') return getBytes(a.capacity) - getBytes(b.capacity);
            // Default newest first
            return new Date(b.age).getTime() - new Date(a.age).getTime();
        });

    // -- Render --

    if (checkingLogin) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Initializing Hunter...</div>;

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-lg space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="text-center">
                        <div className="mx-auto w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
                            <Ghost size={32} />
                        </div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent mb-2">Global Zombie Hunter</h1>
                        <p className="text-slate-400">Scan entire cluster for unused Persistent Volumes.</p>
                        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-500 text-xs text-left">
                            <strong className="block mb-1 flex items-center gap-2"><AlertTriangle size={12} /> Admin Rights Required</strong>
                            Allows 'oc get pvc -A' and 'oc get pods -A'. Please login with cluster-admin or equivalent.
                        </div>
                    </div>

                    <form onSubmit={handleLogin} className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">OpenShift Login Command</label>
                            <textarea
                                value={loginCommand}
                                onChange={(e) => setLoginCommand(e.target.value)}
                                placeholder="oc login --token=... --server=..."
                                className="w-full h-24 bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 font-mono text-xs focus:ring-2 focus:ring-red-500 outline-none resize-none"
                                required
                            />
                        </div>
                        {loginError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">{loginError}</div>}
                        <button type="submit" disabled={isLoggingIn} className="w-full py-3 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-white shadow-lg shadow-red-900/20">
                            {isLoggingIn ? <RefreshCw className="animate-spin" size={20} /> : <Terminal size={20} />}
                            {isLoggingIn ? 'Authenticating...' : 'Connect & Prepare'}
                        </button>
                    </form>
                    <div className="text-center">
                        <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">Cancel</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent flex items-center gap-3">
                            Global Zombie Hunter <span className="text-xs font-normal text-slate-500 border border-slate-700 px-2 py-0.5 rounded bg-slate-900 ml-2">BETA</span>
                        </h1>
                        <p className="text-slate-400 text-sm">Detect Unused Volumes Across All Namespaces</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <UserBadge />
                    <button onClick={() => { setIsLoggedIn(false); setLoginCommand(''); }} className="text-slate-500 hover:text-white text-sm">Logout</button>
                </div>
            </div>

            {/* Main Action Area */}
            {!hasScanned && !isScanning && (
                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-slate-800 relative group cursor-pointer" onClick={startScan}>
                        <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping opacity-20 group-hover:opacity-40"></div>
                        <Ghost size={48} className="text-red-500 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-200 mb-2">Ready to Hunt?</h2>
                    <p className="text-slate-500 max-w-md text-center mb-8">This will scan all namespaces in the cluster to identify Persistent Volume Claims (PVCs) that are NOT mounted by any Pods.</p>

                    <button
                        onClick={startScan}
                        className="px-8 py-4 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-xl font-bold text-lg shadow-xl shadow-red-900/20 hover:shadow-red-900/40 transition-all transform hover:-translate-y-1"
                    >
                        START GLOBAL SCAN
                    </button>
                </div>
            )}

            {/* Scanning State */}
            {isScanning && (
                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in duration-500">
                    <div className="w-full max-w-lg mb-8">
                        <div className="flex justify-between text-sm text-slate-400 mb-2">
                            <span>Scanning Cluster...</span>
                            <span className="text-white font-mono">{scanProgress}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden shadow-inner border border-slate-700">
                            <div
                                className="bg-gradient-to-r from-red-600 to-orange-500 h-full transition-all duration-300 ease-out relative"
                                style={{ width: `${scanProgress}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                            </div>
                        </div>
                    </div>

                    <div className="w-full max-w-lg bg-slate-900 rounded-lg p-4 border border-slate-800 font-mono text-xs text-green-400 h-48 overflow-y-auto shadow-2xl">
                        {logs.map((log, i) => <div key={i} className="mb-1 opacity-80 border-b border-slate-800/50 pb-1 last:border-0">&gt; {log}</div>)}
                    </div>
                </div>
            )}

            {/* Results Dashboard */}
            {hasScanned && summary && (
                <div className="animate-in fade-in slide-in-from-bottom-8 duration-500 space-y-6">

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-lg">
                            <div className="flex items-center gap-3 mb-2 text-slate-400 text-sm font-medium uppercase tracking-wider">
                                <Ghost size={16} /> Total Zombies
                            </div>
                            <div className="text-3xl font-bold text-red-500">{summary.totalZombies} <span className="text-sm font-normal text-slate-500">Vol</span></div>
                            <div className="text-xs text-slate-500 mt-1">From {summary.totalScanned} Total PVCs</div>
                        </div>

                        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-lg">
                            <div className="flex items-center gap-3 mb-2 text-slate-400 text-sm font-medium uppercase tracking-wider">
                                <HardDrive size={16} /> Wasted Storage
                            </div>
                            <div className="text-3xl font-bold text-orange-400">{summary.totalWastedSize}</div>
                            <div className="text-xs text-slate-500 mt-1">Unused capacity</div>
                        </div>

                        <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-lg md:col-span-2">
                            <div className="flex items-center gap-3 mb-2 text-slate-400 text-sm font-medium uppercase tracking-wider">
                                <AlertTriangle size={16} /> Worst Namespace
                            </div>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-xl font-bold text-slate-200 truncate max-w-[200px]">{summary.worstNamespace.name}</div>
                                    <div className="text-xs text-slate-500">Top offender by size</div>
                                </div>
                                <div className="text-2xl font-bold text-slate-300">{summary.worstNamespace.sizeStr}</div>
                            </div>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-4 flex-1">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search namespace or PVC name..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-red-500 outline-none"
                                />
                            </div>
                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value as any)}
                                className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-2 outline-none"
                            >
                                <option value="size-desc">Sort by Size (Biggest)</option>
                                <option value="size-asc">Sort by Size (Smallest)</option>
                                <option value="date-desc">Sort by Date (Newest)</option>
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => { startScan(); trackActivity({ action: "GLOBAL_PVC_RESCAN", label: "Manual Rescan" }); }} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
                                <RefreshCw size={16} /> Rescan
                            </button>
                            <button onClick={handleExport} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg shadow-green-900/20 transition-colors">
                                <Download size={16} /> Export Report
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-3">
                            <AlertTriangle size={20} />
                            {error}
                        </div>
                    )}

                    {/* Table */}
                    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="p-4 font-medium">Namespace</th>
                                        <th className="p-4 font-medium">PVC Details</th>
                                        <th className="p-4 font-medium">Capacity</th>
                                        <th className="p-4 font-medium">Storage Class</th>
                                        <th className="p-4 font-medium">Age</th>
                                        <th className="p-4 font-medium text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {filteredZombies.map((pvc, i) => (
                                        <tr key={i} className="hover:bg-slate-800/30 transition-colors group">
                                            <td className="p-4">
                                                <div className="font-medium text-slate-300">{pvc.namespace}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="font-medium text-red-200 flex items-center gap-2">
                                                    <Ghost size={14} className="text-red-500/70" /> {pvc.name}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1 font-mono truncate max-w-[200px]" title={pvc.volumeName}>{pvc.volumeName}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs font-mono border border-slate-700">{pvc.capacity}</span>
                                            </td>
                                            <td className="p-4 text-xs text-slate-400">{pvc.storageClass}</td>
                                            <td className="p-4 text-xs text-slate-500">
                                                {new Date(pvc.age).toLocaleDateString()}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => {
                                                        trackActivity({ action: "GLOBAL_PVC_INSPECT", label: pvc.name, details: { namespace: pvc.namespace } });
                                                        handleInspect(pvc.namespace, pvc.name);
                                                    }}
                                                    className="p-1.5 hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 rounded transition-colors"
                                                    title="Inspect in Analyzer"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredZombies.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="p-12 text-center text-slate-500">
                                                No zombies found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center bg-slate-950/30">
                            <div>Showing {filteredZombies.length} items</div>
                            {filteredZombies.length > 50 && <div>(Displaying top results)</div>}
                        </div>
                    </div>


                </div>
            )}
        </div>
    );
}
