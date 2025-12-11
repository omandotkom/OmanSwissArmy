"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, LogOut, Terminal, PowerOff, AlertCircle } from "lucide-react";
import { UserBadge } from "@/components/UserBadge";
import { ProjectSelector } from "@/components/ProjectSelector";
import { CheckCircle2, Search } from "lucide-react";

interface PodMetric {
    name: string;
    cpu: string;
    memory: string;
}

interface IdlePod extends PodMetric {
    isIdle: boolean;
    cpuValue: number; // millicores
}

export default function IdlePodFinderPage() {
    // Auth & Project
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [projects, setProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState("");
    const [checkingLogin, setCheckingLogin] = useState(true);
    const [loginCommand, setLoginCommand] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [loginError, setLoginError] = useState("");

    // Data
    const [loading, setLoading] = useState(false);
    const [pods, setPods] = useState<IdlePod[]>([]);
    const [error, setError] = useState("");
    const [threshold, setThreshold] = useState(5); // 5m default

    useEffect(() => { checkLoginStatus(); }, []);

    const checkLoginStatus = async () => {
        setCheckingLogin(true);
        try {
            const res = await fetch('/api/oc/projects');
            if (res.ok) {
                setIsLoggedIn(true);
                const data = await res.json();
                setProjects(Array.from(new Set(data.projects as string[])));
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

    useEffect(() => {
        if (selectedProject) fetchPods();
    }, [selectedProject]);

    const fetchPods = async () => {
        setLoading(true);
        setError("");
        setPods([]);
        try {
            const res = await fetch(`/api/oc/infra-analysis?namespace=${selectedProject}`);
            const data = await res.json();

            if (res.ok) {
                const rawPods: PodMetric[] = data.pods || [];
                const processed = rawPods.map(p => {
                    // Normalize CPU: "1m", "500m", "1.5"
                    let val = 0;
                    if (p.cpu.endsWith('m')) val = parseInt(p.cpu.replace('m', ''));
                    else val = parseFloat(p.cpu) * 1000;

                    return {
                        ...p,
                        cpuValue: val,
                        isIdle: val <= threshold
                    };
                }).sort((a, b) => a.cpuValue - b.cpuValue); // Sort lowest first

                setPods(processed);
            } else {
                setError(data.error || "Failed to fetch metrics");
            }
        } catch (e) {
            setError("Analysis failed. Metrics server might be down.");
        } finally {
            setLoading(false);
        }
    };

    const idleCount = pods.filter(p => p.cpuValue <= threshold).length;

    if (checkingLogin) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>;

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent mb-2">Idle Pod Finder</h1>
                        <p className="text-slate-400">Identify unused resources to save cost.</p>
                    </div>
                    <form onSubmit={handleLogin} className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Login Command</label>
                            <textarea
                                value={loginCommand}
                                onChange={(e) => setLoginCommand(e.target.value)}
                                placeholder="oc login --token=... --server=..."
                                className="w-full h-32 bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 font-mono text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                                required
                            />
                        </div>
                        {loginError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">{loginError}</div>}
                        <button type="submit" disabled={isLoggingIn} className="w-full py-3 bg-teal-600 hover:bg-teal-500 rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-white shadow-lg">
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
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent">
                            Idle Pod Finder
                        </h1>
                        <p className="text-slate-400 text-sm">Detect inactive workloads based on CPU usage.</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {isLoggedIn && <UserBadge />}
                    <button
                        onClick={() => { setIsLoggedIn(false); setLoginCommand(''); }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-500/50 rounded-lg text-slate-400 hover:text-red-400 transition-all"
                    >
                        <LogOut size={16} /> Disconnect
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="md:col-span-1 space-y-4">
                    <ProjectSelector
                        projects={projects}
                        selectedProject={selectedProject}
                        onSelect={setSelectedProject}
                        placeholder="Select Project"
                    />

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-400">Idle Threshold (CPU)</label>
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-1.5 flex gap-1">
                            {[1, 5, 10, 20].map(v => (
                                <button
                                    key={v}
                                    onClick={() => { setThreshold(v); if (pods.length) fetchPods(); }}
                                    className={`flex-1 text-xs py-1.5 rounded-md transition-all ${threshold === v ? 'bg-teal-500/20 text-teal-400 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
                                >
                                    {v}m
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-slate-500">Pods using less than {threshold}m CPU are considered idle.</p>
                    </div>
                </div>

                <div className="md:col-span-3">
                    {selectedProject && (
                        <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden min-h-[400px]">
                            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    <Search size={20} className="text-teal-400" /> Analysis Results
                                </h3>
                                {!loading && pods.length > 0 && (
                                    <div className="flex gap-4 text-sm">
                                        <div className="flex items-center gap-2 text-teal-400">
                                            <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse"></div>
                                            {idleCount} Idle Pods
                                        </div>
                                        <div className="text-slate-500">
                                            {pods.length - idleCount} Active
                                        </div>
                                    </div>
                                )}
                            </div>

                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-[300px] gap-4">
                                    <RefreshCw className="animate-spin text-teal-500" size={32} />
                                    <p className="text-slate-400 animate-pulse">Analyzing pod metrics...</p>
                                </div>
                            ) : error ? (
                                <div className="p-8 text-center text-red-400">
                                    <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
                                    {error}
                                </div>
                            ) : pods.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-[300px] text-slate-500">
                                    <p>Select a project to begin analysis.</p>
                                </div>
                            ) : (
                                <div className="max-h-[600px] overflow-y-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-950/50 text-xs uppercase text-slate-500 sticky top-0 backdrop-blur-sm z-10">
                                            <tr>
                                                <th className="p-3">Status</th>
                                                <th className="p-3">Pod Name</th>
                                                <th className="p-3">CPU Usage</th>
                                                <th className="p-3">Memory</th>
                                                <th className="p-3 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {pods.map((pod, idx) => (
                                                <tr key={idx} className={`hover:bg-slate-800/50 transition-colors group ${pod.cpuValue <= threshold ? 'bg-teal-500/5' : ''}`}>
                                                    <td className="p-3">
                                                        {pod.cpuValue <= threshold ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-400 border border-teal-500/20">
                                                                IDLE
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-400">
                                                                ACTIVE
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 font-mono text-sm text-slate-300">{pod.name}</td>
                                                    <td className="p-3 font-mono text-sm text-slate-300">
                                                        <span className={pod.cpuValue <= threshold ? "text-teal-400 font-bold" : ""}>
                                                            {pod.cpu}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 font-mono text-sm text-slate-500">{pod.memory}</td>
                                                    <td className="p-3 text-right">
                                                        {/* Phase 1: Just show button, disabled or alert */}
                                                        {pod.cpuValue <= threshold && (
                                                            <button
                                                                className="p-2 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-all"
                                                                title="Coming Soon: Shutdown Idle Pod"
                                                                onClick={() => alert("Shutdown feature is coming in Phase 2! Safety first.")}
                                                            >
                                                                <PowerOff size={16} />
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
                    )}
                </div>
            </div>
        </div>
    );
}
