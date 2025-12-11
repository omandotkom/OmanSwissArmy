"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Database,
    HardDrive,
    AlertTriangle,
    CheckCircle,
    Search,
    RefreshCw,
    Terminal,
    LogOut,
    Ghost,
    Filter,
    X,
    FilterX,
    Play,
    FileText,
    Lock
} from "lucide-react";

// Types
interface PvcAnalysis {
    name: string;
    status: string;
    capacity: string;
    storageClass: string;
    accessModes: string[];
    mountedBy: string[];
    isZombie: boolean;
    rwoRisk: boolean;
    scanCandidate?: { podName: string; mountPath: string };
    realUsage?: { used: string; avail: string; percentage: string };
    scanError?: string;
}

interface ConfigMapAnalysis {
    name: string;
    keys: number;
    mountedBy: string[];
    isUnused: boolean;
}

interface SecretAnalysis {
    name: string;
    type: string;
    keys: number;
    mountedBy: string[];
    isUnused: boolean;
}

type Tab = 'pvc' | 'configmap' | 'secret';

export default function PvcAnalyzerPage() {
    // Auth & Project State
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [projects, setProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState("");
    const [checkingLogin, setCheckingLogin] = useState(true);
    const [loginCommand, setLoginCommand] = useState("");
    const [loginError, setLoginError] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Analysis State
    const [loading, setLoading] = useState(false);
    const [pvcs, setPvcs] = useState<PvcAnalysis[]>([]);
    const [cms, setCms] = useState<ConfigMapAnalysis[]>([]);
    const [secrets, setSecrets] = useState<SecretAnalysis[]>([]);
    const [error, setError] = useState("");
    const [isScanningUsage, setIsScanningUsage] = useState(false);

    // UI State
    const [activeTab, setActiveTab] = useState<Tab>('pvc');

    // Column Filters (Shared/Generic)
    const [nameFilter, setNameFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [scFilter, setScFilter] = useState("All");
    const [mountedFilter, setMountedFilter] = useState("All"); // All, Mounted, Unmounted

    // Unique values for dropdowns (PVC only for now)
    const uniqueStatuses = Array.from(new Set(pvcs.map(p => p.status))).sort();
    const uniqueSCs = Array.from(new Set(pvcs.map(p => p.storageClass))).sort();

    // Stats
    const stats = {
        totalPvc: pvcs.length,
        totalCm: cms.length,
        totalSecret: secrets.length,
        zombiePvc: pvcs.filter(p => p.isZombie).filter(p => p.status === 'Bound').length,
        rwoRisks: pvcs.filter(p => p.rwoRisk).length,
        unusedCm: cms.filter(c => c.isUnused).length,
        unusedSecret: secrets.filter(s => s.isUnused && s.type !== 'kubernetes.io/service-account-token').length // Check SA tokens
    };

    // --- Auth Logic (Duplicated from PVC Browser) ---
    useEffect(() => {
        checkLoginStatus();
    }, []);

    const checkLoginStatus = async () => {
        setCheckingLogin(true);
        try {
            const res = await fetch('/api/oc/projects');
            if (res.ok) {
                setIsLoggedIn(true);
                const data = await res.json();
                setProjects(data.projects || []);
            } else {
                setIsLoggedIn(false);
            }
        } catch (e) {
            setIsLoggedIn(false);
        } finally {
            setCheckingLogin(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        setIsLoggingIn(true);
        try {
            const res = await fetch('/api/oc/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: loginCommand })
            });
            const data = await res.json();
            if (res.ok) {
                setIsLoggedIn(true);
                checkLoginStatus(); // Refetch projects
            } else {
                setLoginError(data.error);
            }
        } catch (err) {
            setLoginError('Server error');
        } finally {
            setIsLoggingIn(false);
        }
    };
    // ------------------------------------------------

    useEffect(() => {
        if (selectedProject) {
            fetchAnalysis();
            // Reset filters on project change
            setNameFilter("");
            setStatusFilter("All");
            setScFilter("All");
            setMountedFilter("All");
        } else {
            setPvcs([]);
            setCms([]);
            setSecrets([]);
        }
    }, [selectedProject]);

    const fetchAnalysis = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/oc/pvcs?namespace=${selectedProject}`);
            const data = await res.json();
            if (res.ok) {
                setPvcs(data.pvcs || []);
                setCms(data.configMaps || []);
                setSecrets(data.secrets || []);
            } else {
                setError(data.error || "Failed to fetch analysis");
            }
        } catch (e) {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    };

    // Logic: Sequentially Scan Usage
    const handleScanUsage = async () => {
        setIsScanningUsage(true);

        // Filter PVCs that are capable of being scanned (have a candidate pod)
        const candidates = pvcs.filter(p => !p.realUsage && p.scanCandidate);

        // Process one by one to avoid overwhelming the cluster API
        for (const pvc of candidates) {
            if (!pvc.scanCandidate) continue;

            try {
                const res = await fetch('/api/oc/pvc-usage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        namespace: selectedProject,
                        podName: pvc.scanCandidate.podName,
                        mountPath: pvc.scanCandidate.mountPath
                    })
                });

                const contentType = res.headers.get("content-type");
                let data;
                if (contentType && contentType.includes("application/json")) {
                    data = await res.json();
                } else {
                    data = { error: "Non-JSON response" };
                }

                setPvcs(prev => prev.map(p => {
                    if (p.name === pvc.name) {
                        if (data.usage) {
                            return { ...p, realUsage: data.usage, scanError: undefined };
                        } else {
                            return { ...p, scanError: data.error || 'Unknown error' };
                        }
                    }
                    return p;
                }));

            } catch (e) {
                console.error("Scan error for", pvc.name, e);
                setPvcs(prev => prev.map(p => {
                    if (p.name === pvc.name) return { ...p, scanError: 'Fetch failed' };
                    return p;
                }));
            }
        }

        setIsScanningUsage(false);
    };

    // Filter Logic
    const filterItems = (items: any[], type: Tab) => {
        return items.filter(item => {
            if (nameFilter && !item.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;

            // Mounted Filter
            const isUnused = type === 'pvc' ? (item as PvcAnalysis).isZombie : (item as any).isUnused;
            const mountCount = (item.mountedBy || []).length;

            if (mountedFilter === "Mounted" && mountCount === 0) return false;
            if (mountedFilter === "Unmounted" && mountCount > 0) return false;
            if (mountedFilter === "Zombie" && !isUnused) return false; // For CM/Secret 'Zombie' means unused

            // PVC Specific Filters
            if (type === 'pvc') {
                const p = item as PvcAnalysis;
                if (statusFilter !== "All" && p.status !== statusFilter) return false;
                if (scFilter !== "All" && p.storageClass !== scFilter) return false;
            }

            return true;
        });
    };

    const displayedPvcs = filterItems(pvcs, 'pvc') as PvcAnalysis[];
    const displayedCms = filterItems(cms, 'configmap') as ConfigMapAnalysis[];
    const displayedSecrets = filterItems(secrets, 'secret') as SecretAnalysis[];

    const clearFilters = () => {
        setNameFilter("");
        setStatusFilter("All");
        setScFilter("All");
        setMountedFilter("All");
    };

    const hasActiveFilters = nameFilter || statusFilter !== "All" || scFilter !== "All" || mountedFilter !== "All";

    if (checkingLogin) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>;

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent mb-2">Cluster Analyzer</h1>
                        <p className="text-slate-400">Identify orphans, zombies, and misconfigurations.</p>
                    </div>
                    {/* Login Form Omitted for Brevity - assume same as before */}
                    <form onSubmit={handleLogin} className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Login Command</label>
                            <textarea
                                value={loginCommand}
                                onChange={(e) => setLoginCommand(e.target.value)}
                                placeholder="oc login --token=... --server=..."
                                className="w-full h-32 bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 font-mono text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                                required
                            />
                            <p className="text-xs text-slate-500">Copy command ini dari menu "Copy Login Command" di OpenShift Console Anda.</p>
                        </div>
                        {loginError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">{loginError}</div>}
                        <button type="submit" disabled={isLoggingIn} className="w-full py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-white shadow-lg">
                            {isLoggingIn ? <RefreshCw className="animate-spin" size={20} /> : <Terminal size={20} />}
                            {isLoggingIn ? 'Connecting...' : 'Connect to Cluster'}
                        </button>
                    </form>
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
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
                            Cluster Analyzer
                        </h1>
                        <p className="text-slate-400 text-sm">Detect Unused Volumes, Secrets & ConfigMaps</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
                        {['pvc', 'configmap', 'secret'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as Tab)}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === tab ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                            >
                                {tab === 'pvc' && 'Persistent Volumes'}
                                {tab === 'configmap' && 'ConfigMaps'}
                                {tab === 'secret' && 'Secrets'}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={() => { setIsLoggedIn(false); setLoginCommand(''); }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-500/50 rounded-lg text-slate-400 hover:text-red-400 transition-all"
                    >
                        <LogOut size={16} /> Disconnect
                    </button>
                </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="md:col-span-1 space-y-2">
                    <label className="text-sm font-medium text-slate-400 block ml-1">Select Project</label>
                    <select
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 focus:ring-2 focus:ring-orange-500/50 outline-none transition-all text-slate-200"
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                    >
                        <option value="">-- Choose Project --</option>
                        {projects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>

                {/* Stats Cards */}
                {selectedProject && (
                    <>
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
                            <div className="p-3 bg-blue-500/20 rounded-lg text-blue-400">
                                <Database size={24} />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-white">{loading ? '...' : (activeTab === 'pvc' ? stats.totalPvc : activeTab === 'configmap' ? stats.totalCm : stats.totalSecret)}</div>
                                <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Total {activeTab.toUpperCase()}</div>
                            </div>
                        </div>
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center gap-4 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div className="p-3 bg-red-500/20 rounded-lg text-red-500 z-10">
                                <Ghost size={24} />
                            </div>
                            <div className="z-10">
                                <div className="text-2xl font-bold text-white">
                                    {loading ? '...' : (activeTab === 'pvc' ? stats.zombiePvc : activeTab === 'configmap' ? stats.unusedCm : stats.unusedSecret)}
                                </div>
                                <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Orphans / Zombies</div>
                            </div>
                        </div>
                        {activeTab === 'pvc' && (
                            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
                                <div className="p-3 bg-orange-500/20 rounded-lg text-orange-400">
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-white">{loading ? '...' : stats.rwoRisks}</div>
                                    <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider">RWO Risk</div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
                    <AlertTriangle size={20} />
                    {error}
                </div>
            )}

            {/* Main Content */}
            {selectedProject && !loading && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                        {/* Table Header with Filters */}
                        <div className="bg-slate-800/50 border-b border-slate-800 p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <h3 className="font-semibold text-slate-300 text-lg flex items-center gap-2">
                                        {activeTab === 'pvc' && <HardDrive size={18} className="text-blue-400" />}
                                        {activeTab === 'configmap' && <FileText size={18} className="text-purple-400" />}
                                        {activeTab === 'secret' && <Lock size={18} className="text-amber-400" />}
                                        {activeTab === 'pvc' ? 'Volume Analysis' : activeTab === 'configmap' ? 'ConfigMap Analysis' : 'Secret Analysis'}
                                    </h3>

                                    {activeTab === 'pvc' && (
                                        <button
                                            onClick={handleScanUsage}
                                            disabled={isScanningUsage}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-xs font-bold uppercase tracking-wide transition-all shadow-lg hover:shadow-blue-500/20"
                                        >
                                            {isScanningUsage ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                                            {isScanningUsage ? 'Scanning Usage...' : 'Scan Disk Usage'}
                                        </button>
                                    )}
                                </div>

                                {hasActiveFilters && (
                                    <button onClick={clearFilters} className="text-xs flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors">
                                        <FilterX size={12} /> Clear Filters
                                    </button>
                                )}
                            </div>

                            {/* Dynamic Filter Row */}
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 text-sm">
                                <div className="md:col-span-1">
                                    <input
                                        type="text"
                                        placeholder="Filter Name..."
                                        value={nameFilter}
                                        onChange={(e) => setNameFilter(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 focus:ring-1 focus:ring-orange-500 outline-none"
                                    />
                                </div>

                                {activeTab === 'pvc' ? (
                                    <>
                                        <div>
                                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 focus:ring-1 focus:ring-orange-500 outline-none">
                                                <option value="All">All Statuses</option>
                                                {uniqueStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex items-center text-slate-500 px-3 py-2 text-xs italic">
                                            Usage {isScanningUsage && <RefreshCw size={12} className="ml-2 animate-spin text-blue-500" />}
                                        </div>
                                        <div>
                                            <select value={scFilter} onChange={(e) => setScFilter(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 focus:ring-1 focus:ring-orange-500 outline-none">
                                                <option value="All">All Classes</option>
                                                {uniqueSCs.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                    </>
                                ) : (
                                    <div className="col-span-3 text-slate-500 flex items-center px-4 italic text-xs">
                                        Detecting mounted {activeTab}s across all pods in {selectedProject}.
                                    </div>
                                )}

                                <div>
                                    <select value={mountedFilter} onChange={(e) => setMountedFilter(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-300 focus:ring-1 focus:ring-orange-500 outline-none">
                                        <option value="All">All Mounts</option>
                                        <option value="Mounted">Mounted</option>
                                        <option value="Unmounted">Unmounted</option>
                                        <option value="Zombie">🧟 Orphans/Zombies</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* TABLE CONTENT */}
                        <table className="w-full text-left border-collapse table-fixed">
                            <thead>
                                <tr className="bg-slate-800/30 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800/50">
                                    <th className="p-4 font-semibold w-3/12">Name</th>
                                    {activeTab === 'pvc' && <th className="p-4 font-semibold w-1/12">Status</th>}
                                    {activeTab === 'pvc' && <th className="p-4 font-semibold w-3/12">Capacity & Usage</th>}
                                    {activeTab === 'pvc' && <th className="p-4 font-semibold w-2/12">Class & Mode</th>}
                                    {activeTab !== 'pvc' && <th className="p-4 font-semibold w-2/12">Keys / Type</th>}
                                    <th className="p-4 font-semibold w-3/12">Mounted By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {/* PVC ROWS */}
                                {activeTab === 'pvc' && displayedPvcs.map((pvc) => (
                                    <tr key={pvc.name} className={`group transition-colors ${pvc.isZombie ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-slate-800/30'}`}>
                                        <td className="p-4 align-top">
                                            <div className="font-medium text-slate-200 break-words text-sm">{pvc.name}</div>
                                            {pvc.isZombie && <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white shadow-sm">ZOMBIE <Ghost size={10} /></span>}
                                            {pvc.rwoRisk && <div className="mt-1 flex items-center gap-1 text-red-400 text-xs font-bold animate-pulse"><AlertTriangle size={12} /> RWO Risk</div>}
                                        </td>
                                        <td className="p-4 align-top">
                                            <StatusBadge status={pvc.status} />
                                        </td>
                                        <td className="p-4 align-top">
                                            <div className="font-mono text-slate-300 text-sm mb-1">{pvc.capacity}</div>
                                            {pvc.realUsage ? (
                                                <div className="w-full">
                                                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${parseInt(pvc.realUsage.percentage) > 85 ? 'bg-red-500' : 'bg-green-500'}`}
                                                            style={{ width: pvc.realUsage.percentage }}
                                                        ></div>
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                                        <span>{pvc.realUsage.used}</span>
                                                        <span>{pvc.realUsage.percentage}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                pvc.scanError ? <span className="text-[10px] text-red-500 italic block leading-tight">Err: {pvc.scanError}</span> : null
                                            )}
                                        </td>
                                        <td className="p-4 text-slate-400 text-sm align-top">
                                            <div className="break-words">{pvc.storageClass}</div>
                                            <div className="text-[10px] text-slate-500 mt-1">{pvc.accessModes.join(', ')}</div>
                                        </td>
                                        <td className="p-4 align-top">
                                            <MountedList items={pvc.mountedBy} />
                                        </td>
                                    </tr>
                                ))}

                                {/* CONFIGMAP ROWS */}
                                {activeTab === 'configmap' && displayedCms.map((cm) => (
                                    <tr key={cm.name} className={`group transition-colors ${cm.isUnused ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'hover:bg-slate-800/30'}`}>
                                        <td className="p-4 align-top font-medium text-slate-200 text-sm">{cm.name}</td>
                                        <td className="p-4 text-slate-400 text-sm">{cm.keys} keys</td>
                                        <td className="p-4 align-top"><MountedList items={cm.mountedBy} /></td>
                                    </tr>
                                ))}

                                {/* SECRET ROWS */}
                                {activeTab === 'secret' && displayedSecrets.map((s) => (
                                    <tr key={s.name} className={`group transition-colors ${s.isUnused ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'hover:bg-slate-800/30'}`}>
                                        <td className="p-4 align-top font-medium text-slate-200 text-sm">{s.name}</td>
                                        <td className="p-4 text-slate-400 text-sm">
                                            <div className="text-slate-300">{s.keys} keys</div>
                                            <div className="text-[10px] text-slate-600 truncate max-w-[150px]">{s.type}</div>
                                        </td>
                                        <td className="p-4 align-top"><MountedList items={s.mountedBy} /></td>
                                    </tr>
                                ))}

                                {/* Empty State */}
                                {((activeTab === 'pvc' && displayedPvcs.length === 0) ||
                                    (activeTab === 'configmap' && displayedCms.length === 0) ||
                                    (activeTab === 'secret' && displayedSecrets.length === 0)) && (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-slate-500">
                                                No {activeTab}s found matching current filters.
                                            </td>
                                        </tr>
                                    )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {loading && (
                <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-500">
                    <RefreshCw className="animate-spin text-orange-500 mb-4" size={40} />
                    <p className="text-slate-400 animate-pulse">Analyzing cluster resources...</p>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'Bound') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-400 border border-green-500/20"><CheckCircle size={12} /> Bound</span>;
    if (status === 'Pending') return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"><AlertTriangle size={12} /> Pending</span>;
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-700 text-slate-300">{status}</span>;
}

function MountedList({ items }: { items: string[] }) {
    if (items.length === 0) return <span className="text-slate-600 italic text-sm">Not mounted</span>;
    return (
        <div className="flex flex-col gap-1">
            {items.map(pod => (
                <span key={pod} className="bg-slate-800 border border-slate-700 text-slate-300 px-2 py-1 rounded text-xs font-mono break-all inline-block">
                    {pod}
                </span>
            ))}
        </div>
    );
}
