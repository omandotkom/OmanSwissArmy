"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Database,
    ArrowLeft,
    Ghost,
    HardDrive,
    Filter,
    RefreshCw,
    Terminal,
    LogOut,
    AlertTriangle,
    FileCode,
    Lock,
    Search,
    Info,
    CheckCircle,
    XCircle,
    Clock,
    Tag,
    ShieldAlert,
    FolderOpen,
    Eye
} from "lucide-react";
import { UserBadge } from "@/components/UserBadge";
import { ProjectSelector } from "@/components/ProjectSelector";

type Tab = 'pvc' | 'configmap' | 'secret';

interface PvcAnalysis {
    name: string;
    status: string;
    capacity: string;
    storageClass: string;
    accessModes: string[];
    volumemode: string;
    mountedBy: string[];
    scanCandidate: { podName: string, mountPath: string } | null;
    isZombie: boolean;
    realUsage?: { size: string, used: string, avail: string, percentage: string };
    scanError?: string;
    rwoRisk?: boolean;
    // New Fields
    age: string;
    volumeName: string;
    reclaimPolicy: string;
    fileSystem: string;
    conditions: string[];
}

interface ConfigMapAnalysis {
    name: string;
    keys: number;
    mountedBy: string[];
    isUnused: boolean;
    age: string;
}

interface SecretAnalysis {
    name: string;
    type: string;
    keys: number;
    mountedBy: string[];
    isUnused: boolean;
    age: string;
}

export default function PvcAnalyzerPage() {
    const router = useRouter();
    // Auth & Project State
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [projects, setProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState("");
    const [checkingLogin, setCheckingLogin] = useState(true);
    const [loginCommand, setLoginCommand] = useState("");
    const [loginError, setLoginError] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Data State
    const [activeTab, setActiveTab] = useState<Tab>('pvc');
    const [loading, setLoading] = useState(false);
    const [pvcs, setPvcs] = useState<PvcAnalysis[]>([]);
    const [cms, setCms] = useState<ConfigMapAnalysis[]>([]);
    const [secrets, setSecrets] = useState<SecretAnalysis[]>([]);
    const [error, setError] = useState("");
    const [isScanningUsage, setIsScanningUsage] = useState(false);

    // New State for Inspect
    const [inspecting, setInspecting] = useState<string | null>(null);

    // Filters
    const [statusFilter, setStatusFilter] = useState("All");
    const [scFilter, setScFilter] = useState("All");
    const [mountedFilter, setMountedFilter] = useState("All");
    const [nameFilter, setNameFilter] = useState("");

    // --- Inspect Function ---

    const handleInspect = async (pvcName: string) => {
        setInspecting(pvcName);
        try {
            const res = await fetch('/api/oc/inspect-pvc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ namespace: selectedProject, pvcName })
            });

            if (!res.ok) throw new Error((await res.json()).error);

            const data = await res.json();
            // Redirect to Browser with new pod
            router.push(`/pvc-browser?project=${selectedProject}&pod=${data.podName}&path=${data.mountPath}`);

        } catch (e: any) {
            alert(`Failed to inspect: ${e.message}`);
            setInspecting(null);
        }
    };

    // --- Auth Functions (Same as before) ---
    useEffect(() => { checkLoginStatus(); }, []);

    const checkLoginStatus = async () => {
        setCheckingLogin(true);
        try {
            const res = await fetch('/api/oc/projects');
            if (res.ok) {
                setIsLoggedIn(true);
                const data = await res.json();
                const uniqueProjects = Array.from(new Set(data.projects as string[]));
                setProjects(uniqueProjects);
            } else { setIsLoggedIn(false); }
        } catch (e) { setIsLoggedIn(false); } finally { setCheckingLogin(false); }
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
            if (res.ok) { setIsLoggedIn(true); checkLoginStatus(); }
            else { const d = await res.json(); setLoginError(d.error || 'Login failed'); }
        } catch (e) { setLoginError("Network error"); } finally { setIsLoggingIn(false); }
    };

    // --- Data Fetching ---
    useEffect(() => {
        if (selectedProject) fetchData();
    }, [selectedProject]);

    const fetchData = async () => {
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
                setError(data.error);
            }
        } catch (e) { setError("Failed to fetch data"); } finally { setLoading(false); }
    };

    // Stats Calculation
    const stats = {
        totalPvc: pvcs.length,
        zombiePvc: pvcs.filter(p => p.isZombie).length,
        totalCm: cms.length,
        unusedCm: cms.filter(c => c.isUnused).length,
        totalSecret: secrets.length,
        unusedSecret: secrets.filter(s => s.isUnused).length,
        rwoRisks: pvcs.filter(p => p.rwoRisk).length
    };

    // --- Actions ---
    const scanUsage = async () => {
        setIsScanningUsage(true);
        const candidates = pvcs.filter(p => p.scanCandidate && p.status === 'Bound');

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
                            return { ...p, scanError: data.error || 'Error' };
                        }
                    }
                    return p;
                }));

            } catch (e) {
                setPvcs(prev => prev.map(p => {
                    if (p.name === pvc.name) return { ...p, scanError: 'Fetch failed' };
                    return p;
                }));
            }
        }
        setIsScanningUsage(false);
    };

    // --- Filter Logic ---
    const filterItems = (items: any[], type: Tab) => {
        return items.filter(item => {
            if (nameFilter && !item.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;

            const isUnused = type === 'pvc' ? (item as PvcAnalysis).isZombie : (item as any).isUnused;
            const mountCount = (item.mountedBy || []).length;

            if (mountedFilter === "Mounted" && mountCount === 0) return false;
            if (mountedFilter === "Unmounted" && mountCount > 0) return false;
            if (mountedFilter === "Zombie" && !isUnused) return false;

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

    // --- Render ---
    if (checkingLogin) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>;

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent mb-2">Cluster Analyzer</h1>
                        <p className="text-slate-400">Identify orphans, zombies, and misconfigurations.</p>
                    </div>
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
                {/* Tab Switcher */}
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
                    {isLoggedIn && <UserBadge />}
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
                <div className="md:col-span-1">
                    <ProjectSelector
                        projects={projects}
                        selectedProject={selectedProject}
                        onSelect={setSelectedProject}
                        placeholder="Choose Project"
                    />
                </div>                {/* Stats Cards */}
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
                        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
                            <div className="p-3 bg-red-500/20 rounded-lg text-red-500">
                                <Ghost size={24} />
                            </div>
                            <div>
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

            {/* Legend / Dictionary */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-8 flex flex-wrap gap-6 text-sm">
                <div className="flex items-start gap-3 max-w-sm">
                    <div className="p-2 bg-red-500/10 text-red-400 rounded-lg shrink-0 mt-0.5">
                        <Ghost size={18} />
                    </div>
                    <div>
                        <div className="font-semibold text-slate-200">Zombie / Orphan</div>
                        <p className="text-slate-400 text-xs mt-1">
                            Barang (PVC, ConfigMap, Secret) yang ada tapi <b>gak ada yang make</b> (Unmounted). Cuma menuh-menuhin gudang & buang-buang kuota. Cek dulu sebelum dihapus!
                        </p>
                    </div>
                </div>
                {activeTab === 'pvc' && (
                    <div className="flex items-start gap-3 max-w-sm">
                        <div className="p-2 bg-orange-500/10 text-orange-400 rounded-lg shrink-0 mt-0.5">
                            <AlertTriangle size={18} />
                        </div>
                        <div>
                            <div className="font-semibold text-slate-200">RWO Risk</div>
                            <p className="text-slate-400 text-xs mt-1">
                                Bahaya laten! Storage tipe <b>Single-User (RWO)</b> tapi dipake rame-rame (&gt;1 Pod). Biasanya aman pas jalan, tapi pas <b>redeploy/rolling update</b> bakal stuck karena rebutan disk.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">{error}</div>}

            {selectedProject && (
                <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="text"
                                    placeholder={`Search ${activeTab}...`}
                                    value={nameFilter}
                                    onChange={(e) => setNameFilter(e.target.value)}
                                    className="pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-orange-500/50 outline-none w-64"
                                />
                            </div>

                            <div className="h-8 w-px bg-slate-800 mx-2"></div>

                            <div className="flex items-center gap-2">
                                <Filter size={16} className="text-slate-500" />
                                <select
                                    className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-2 outline-none"
                                    value={mountedFilter}
                                    onChange={(e) => setMountedFilter(e.target.value)}
                                >
                                    <option value="All">All Usage</option>
                                    <option value="Mounted">Mounted</option>
                                    <option value="Unmounted">Unmounted</option>
                                    <option value="Zombie">Zombies / Orphans</option>
                                </select>

                                {activeTab === 'pvc' && (
                                    <select
                                        className="bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-2 outline-none"
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                    >
                                        <option value="All">All Status</option>
                                        <option value="Bound">Bound</option>
                                        <option value="Pending">Pending</option>
                                        <option value="Lost">Lost</option>
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {activeTab === 'pvc' && (
                                <button
                                    onClick={scanUsage}
                                    disabled={loading || isScanningUsage}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50 border border-slate-700 hover:border-slate-600"
                                >
                                    {isScanningUsage ? <RefreshCw className="animate-spin" size={16} /> : <HardDrive size={16} />}
                                    {isScanningUsage ? 'Scanning...' : 'Scan Disk Usage'}
                                </button>
                            )}
                            <button
                                onClick={fetchData}
                                disabled={loading}
                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all border border-slate-700 hover:border-slate-600 disabled:opacity-50"
                                title="Refresh Data"
                            >
                                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider">
                                    <th className="p-4 font-medium">Name</th>
                                    {activeTab === 'pvc' ? (
                                        <>
                                            <th className="p-4 font-medium">Status</th>
                                            <th className="p-4 font-medium">Age & Policy</th>
                                            <th className="p-4 font-medium">Capacity & Usage</th>
                                            <th className="p-4 font-medium">Class & Volume</th>
                                            <th className="p-4 font-medium">File System</th>
                                            <th className="p-4 font-medium">Mounted By</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="p-4 font-medium">Age</th>
                                            <th className="p-4 font-medium">Keys</th>
                                            <th className="p-4 font-medium">Mounted By</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {loading ? (
                                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading resources...</td></tr>
                                ) : activeTab === 'pvc' ? (
                                    displayedPvcs.map((pvc, i) => (
                                        <tr key={i} className={`hover:bg-slate-800/50 transition-colors group ${pvc.isZombie ? 'bg-red-500/5' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${pvc.isZombie ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                        <Database size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-slate-200 flex items-center gap-2">
                                                            {pvc.name}
                                                            {pvc.scanCandidate && (
                                                                <Link
                                                                    href={`/pvc-browser?project=${selectedProject}&pod=${pvc.scanCandidate.podName}&path=${pvc.scanCandidate.mountPath}`}
                                                                    className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 p-1 rounded-md transition-colors"
                                                                    title="Browse Files"
                                                                >
                                                                    <FolderOpen size={14} />
                                                                </Link>
                                                            )}
                                                            {pvc.isZombie && (
                                                                <button
                                                                    onClick={() => handleInspect(pvc.name)}
                                                                    disabled={!!inspecting}
                                                                    className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 p-1 rounded-md transition-colors disabled:opacity-50"
                                                                    title="Inspect Zombie PVC (Spawns temporary pod)"
                                                                >
                                                                    {inspecting === pvc.name ? <RefreshCw className="animate-spin" size={14} /> : <Eye size={14} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                        {pvc.isZombie && <div className="text-[10px] font-bold text-red-500 uppercase bg-red-500/10 px-1.5 py-0.5 rounded w-fit mt-1">Zombie</div>}
                                                        {/* RWO Risk Badge */}
                                                        {pvc.rwoRisk && (
                                                            <div className="flex items-center gap-1 text-[10px] font-bold text-red-500 uppercase bg-red-500/10 px-1.5 py-0.5 rounded w-fit mt-1 animate-pulse">
                                                                <AlertTriangle size={10} /> RWO Risk
                                                            </div>
                                                        )}
                                                        {/* Conditions Badge */}
                                                        {pvc.conditions.length > 0 && (
                                                            <div className="flex gap-1 mt-1">
                                                                {pvc.conditions.map(c => <span key={c} className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1 rounded">{c}</span>)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${pvc.status === 'Bound' ? 'bg-green-500/10 text-green-400' :
                                                        pvc.status === 'Pending' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'
                                                    }`}>
                                                    {pvc.status}
                                                </span>
                                            </td>
                                            {/* AGE & POLICY */}
                                            <td className="p-4">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5 text-sm text-slate-300">
                                                        <Clock size={14} className="text-slate-500" /> {pvc.age}
                                                    </div>
                                                    <div className={`text-xs px-2 py-0.5 rounded-full w-fit ${pvc.reclaimPolicy === 'Delete' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                            pvc.reclaimPolicy === 'Retain' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'text-slate-500'
                                                        }`}>
                                                        {pvc.reclaimPolicy}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-sm font-mono text-slate-300 mb-1">{pvc.capacity}</div>
                                                {/* Usage Bar logic */}
                                                {pvc.realUsage ? (
                                                    <div className="w-32">
                                                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                                                            <span>{pvc.realUsage.used}</span>
                                                            <span>{pvc.realUsage.percentage}</span>
                                                        </div>
                                                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                            <div
                                                                style={{ width: pvc.realUsage.percentage }}
                                                                className={`h-full ${parseInt(pvc.realUsage.percentage) > 85 ? 'bg-red-500' : 'bg-green-500'}`}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                ) : pvc.scanError ? (
                                                    <div className="text-[10px] text-red-400 max-w-[120px] truncate" title={pvc.scanError}>{pvc.scanError}</div>
                                                ) : (
                                                    <div className="text-[10px] text-slate-600 italic">Not scanned</div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="text-sm text-slate-300">{pvc.storageClass}</div>
                                                <div className="flex gap-1 mt-1">
                                                    {pvc.accessModes.map(m => (
                                                        <span key={m} title={m} className={`text-[10px] px-1.5 py-0.5 rounded border ${m === 'ReadWriteOnce' ? 'border-blue-500/30 text-blue-400' : 'border-purple-500/30 text-purple-400'}`}>
                                                            {m === 'ReadWriteOnce' ? 'RWO' : 'RWX'}
                                                        </span>
                                                    ))}
                                                </div>
                                                {pvc.volumeName && <div className="text-[10px] text-slate-500 mt-1 truncate max-w-[150px] font-mono" title={pvc.volumeName}>{pvc.volumeName}</div>}
                                            </td>
                                            <td className="p-4">
                                                <div className="text-sm font-mono text-cyan-400">
                                                    {pvc.fileSystem && pvc.fileSystem !== 'Unknown' ? (
                                                        pvc.fileSystem
                                                    ) : (
                                                        <span
                                                            className="text-slate-600 italic cursor-help decoration-dotted underline decoration-slate-700"
                                                            title="Waduh, akses lu kurang sakti bre. Cuma user selevel Dewa (Cluster Reader/Admin) yang bisa liat info ini."
                                                        >
                                                            Unknown
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {pvc.mountedBy.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {pvc.mountedBy.slice(0, 2).map(pod => (
                                                            <div key={pod} className="flex items-center gap-1.5 text-xs text-slate-400">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                                                <span className="truncate max-w-[150px]" title={pod}>{pod}</span>
                                                            </div>
                                                        ))}
                                                        {pvc.mountedBy.length > 2 && (
                                                            <div className="text-[10px] text-slate-500 pl-3">+{pvc.mountedBy.length - 2} more</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-600 italic">Unmounted</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : activeTab === 'configmap' ? (
                                    displayedCms.map((cm, i) => (
                                        <tr key={i} className={`hover:bg-slate-800/50 transition-colors ${cm.isUnused ? 'bg-amber-500/5' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${cm.isUnused ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-400'}`}>
                                                        <FileCode size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-slate-200">{cm.name}</div>
                                                        {cm.isUnused && <span className="text-[10px] font-bold text-amber-500 uppercase bg-amber-500/10 px-1.5 py-0.5 rounded">Orphan</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            {/* AGE */}
                                            <td className="p-4"><div className="flex items-center gap-1 text-sm text-slate-400"><Clock size={14} /> {cm.age}</div></td>
                                            <td className="p-4 text-slate-300 font-mono text-sm">{cm.keys} keys</td>
                                            <td className="p-4">
                                                {cm.mountedBy.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {cm.mountedBy.slice(0, 2).map(pod => (
                                                            <div key={pod} className="flex items-center gap-1.5 text-xs text-slate-400">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                                <span className="truncate max-w-[150px]" title={pod}>{pod}</span>
                                                            </div>
                                                        ))}
                                                        {cm.mountedBy.length > 2 && <div className="text-[10px] text-slate-500 pl-3">+{cm.mountedBy.length - 2} more</div>}
                                                    </div>
                                                ) : <span className="text-xs text-slate-600 italic">Unused</span>}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    displayedSecrets.map((s, i) => (
                                        <tr key={i} className={`hover:bg-slate-800/50 transition-colors ${s.isUnused ? 'bg-amber-500/5' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${s.isUnused ? 'bg-amber-500/20 text-amber-500' : 'bg-purple-500/20 text-purple-400'}`}>
                                                        <Lock size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-slate-200">{s.name}</div>
                                                        <div className="text-[10px] text-slate-500">{s.type}</div>
                                                        {s.isUnused && <span className="text-[10px] font-bold text-amber-500 uppercase bg-amber-500/10 px-1.5 py-0.5 rounded">Orphan</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            {/* AGE */}
                                            <td className="p-4"><div className="flex items-center gap-1 text-sm text-slate-400"><Clock size={14} /> {s.age}</div></td>
                                            <td className="p-4 text-slate-300 font-mono text-sm">{s.keys} keys</td>
                                            <td className="p-4">
                                                {s.mountedBy.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {s.mountedBy.slice(0, 2).map(pod => (
                                                            <div key={pod} className="flex items-center gap-1.5 text-xs text-slate-400">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                                                                <span className="truncate max-w-[150px]" title={pod}>{pod}</span>
                                                            </div>
                                                        ))}
                                                        {s.mountedBy.length > 2 && <div className="text-[10px] text-slate-500 pl-3">+{s.mountedBy.length - 2} more</div>}
                                                    </div>
                                                ) : <span className="text-xs text-slate-600 italic">Unused</span>}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
                        <div>Showing {activeTab === 'pvc' ? displayedPvcs.length : activeTab === 'configmap' ? displayedCms.length : displayedSecrets.length} items</div>
                    </div>
                </div>
            )}
        </div>
    );
}
