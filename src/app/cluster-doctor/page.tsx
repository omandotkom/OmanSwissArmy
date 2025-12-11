"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
    Activity,
    ArrowLeft,
    Stethoscope,
    AlertCircle,
    CheckCircle,
    Terminal,
    LogOut,
    RefreshCw,
    Cpu,
    MemoryStick,
    Box,
    ServerCrash,
    BarChart3
} from "lucide-react";
import { UserBadge } from "@/components/UserBadge";

interface Quota {
    name: string;
    used: string;
    hard: string;
    type: 'cpu' | 'memory' | 'other';
    isCritical: boolean;
}

interface PendingPod {
    name: string;
    startTime: string;
    events: { reason: string; message: string; count: number }[];
}

interface InfraIssue {
    pod: string;
    message: string;
    severity: 'warning' | 'critical';
}

// New Interfaces for Infra Analysis
interface NodeMetric {
    name: string;
    cpuCores: string;
    cpuPercent: string;
    memoryBytes: string;
    memoryPercent: string;
}

interface PodMetric {
    name: string;
    cpu: string;
    memory: string;
}

export default function ClusterDoctorPage() {
    // Auth & Project
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [projects, setProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState("");
    const [checkingLogin, setCheckingLogin] = useState(true);
    const [loginCommand, setLoginCommand] = useState("");
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Analysis
    const [loading, setLoading] = useState(false);
    const [quotas, setQuotas] = useState<Quota[]>([]);
    const [pendingPods, setPendingPods] = useState<PendingPod[]>([]);
    const [infraIssues, setInfraIssues] = useState<InfraIssue[]>([]);

    // Infra Analysis State
    const [infraLoading, setInfraLoading] = useState(false);
    const [nodes, setNodes] = useState<NodeMetric[]>([]);
    const [topPods, setTopPods] = useState<PodMetric[]>([]);
    const [nodeError, setNodeError] = useState("");
    const [showInfra, setShowInfra] = useState(false);

    const [error, setError] = useState("");

    // --- Auth Logic (Standard) ---
    useEffect(() => { checkLoginStatus(); }, []);

    const checkLoginStatus = async () => {
        setCheckingLogin(true);
        try {
            const res = await fetch('/api/oc/projects');
            if (res.ok) {
                setIsLoggedIn(true);
                const data = await res.json();
                setProjects(data.projects || []);
            } else { setIsLoggedIn(false); }
        } catch (e) { setIsLoggedIn(false); } finally { setCheckingLogin(false); }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoggingIn(true);
        try {
            const res = await fetch('/api/oc/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: loginCommand })
            });
            if (res.ok) { setIsLoggedIn(true); checkLoginStatus(); }
        } catch (e) { } finally { setIsLoggingIn(false); }
    };
    // ----------------------------

    useEffect(() => {
        if (selectedProject) {
            diagnose();
            // Reset infra check state when project changes
            setShowInfra(false);
            setNodes([]);
            setTopPods([]);
        }
    }, [selectedProject]);

    const diagnose = async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/oc/doctor?namespace=${selectedProject}`);
            const data = await res.json();
            if (res.ok) {
                setQuotas(data.quotas || []);
                setPendingPods(data.pendingPods || []);
                setInfraIssues(data.infraIssues || []);
            } else {
                setError(data.error);
            }
        } catch (e) {
            setError("Diagnosis failed");
        } finally {
            setLoading(false);
        }
    };

    const performInfraAnalysis = async () => {
        setInfraLoading(true);
        setShowInfra(true); // Reveal the section
        try {
            const res = await fetch(`/api/oc/infra-analysis?namespace=${selectedProject}`);
            const data = await res.json();
            if (res.ok) {
                setNodes(data.nodes || []);
                setNodeError(data.nodeError || ""); // If permissions denied, we show this
                setTopPods(data.pods || []);
            }
        } catch (e) {
            console.error("Infra check failed");
        } finally {
            setInfraLoading(false);
        }
    };

    if (checkingLogin) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading Doctor...</div>;

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-red-400 to-pink-600 bg-clip-text text-transparent mb-2">Cluster Doctor</h1>
                        <p className="text-slate-400">Diagnose slow builds and stuck pods.</p>
                    </div>
                    <form onSubmit={handleLogin} className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Login Command</label>
                            <textarea
                                value={loginCommand}
                                onChange={(e) => setLoginCommand(e.target.value)}
                                placeholder="oc login --token=... --server=..."
                                className="w-full h-32 bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 font-mono text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none"
                                required
                            />
                        </div>
                        <button type="submit" disabled={isLoggingIn} className="w-full py-3 bg-red-600 hover:bg-red-500 rounded-lg font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-white shadow-lg">
                            {isLoggingIn ? <RefreshCw className="animate-spin" size={20} /> : <Terminal size={20} />}
                            {isLoggingIn ? 'Connecting...' : 'Connect'}
                        </button>
                        <div className="flex justify-center">
                            <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">Back to Home</Link>
                        </div>
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
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 to-pink-500 bg-clip-text text-transparent flex items-center gap-3">
                            <Stethoscope size={32} /> Cluster Doctor
                        </h1>
                        <p className="text-slate-400 text-sm">Why is my build stuck?</p>
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

            {/* Project Select */}
            <div className="mb-8">
                <select
                    className="w-full md:w-1/3 bg-slate-900 border border-slate-800 rounded-xl p-3 focus:ring-2 focus:ring-red-500/50 outline-none transition-all text-slate-200"
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                >
                    <option value="">-- Select Project to Diagnose --</option>
                    {projects.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>

            {/* Content */}
            {selectedProject && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* 0. INFRA/CRI ALERTS (CRITICAL) */}
                    {infraIssues.length > 0 && (
                        <div className="bg-red-500/10 border border-red-500 rounded-xl p-6 animate-pulse">
                            <h2 className="text-xl font-bold text-red-500 mb-4 flex items-center gap-2">
                                <ServerCrash size={28} /> INFRASTRUCTURE STRESS DETECTED
                            </h2>
                            <p className="text-red-400 mb-4">
                                The OpenShift Nodes are experiencing high load or instability (CRI-O/System Load). <br />
                                This is NOT an issue with your code. The build pauses because the server is overwhelmed.
                            </p>
                            <div className="bg-red-950/50 border border-red-900/50 rounded-lg p-4 max-h-40 overflow-y-auto">
                                {infraIssues.map((issue, idx) => (
                                    <div key={idx} className="text-sm font-mono text-red-300 mb-2 border-b border-red-900/30 pb-2 last:border-0">
                                        <span className="font-bold text-red-500">[{issue.pod}]</span> {issue.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 1. RESOURCE QUOTAS */}
                    <section>
                        <h2 className="text-xl font-semibold text-slate-200 mb-4 flex items-center gap-2">
                            <Activity className="text-blue-400" /> Resource Quotas
                        </h2>
                        {loading ? (
                            <div className="p-8 bg-slate-900 rounded-xl animate-pulse text-slate-500">Checking vitals...</div>
                        ) : quotas.length === 0 ? (
                            <div className="p-6 bg-slate-900 rounded-xl border border-slate-800 text-slate-400 italic">No Quotas defined (Unlimited).</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {quotas.map((q, idx) => (
                                    <div key={idx} className={`p-4 rounded-xl border ${q.isCritical ? 'bg-red-500/10 border-red-500/50' : 'bg-slate-900 border-slate-800'} relative overflow-hidden`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                {q.type === 'cpu' && <Cpu size={18} className="text-cyan-400" />}
                                                {q.type === 'memory' && <MemoryStick size={18} className="text-purple-400" />}
                                                {q.type === 'other' && <Box size={18} className="text-slate-400" />}
                                                <span className="font-medium text-slate-200 text-sm truncate max-w-[150px]" title={q.name}>{q.name}</span>
                                            </div>
                                            {q.isCritical && <AlertCircle size={18} className="text-red-500 animate-pulse" />}
                                        </div>
                                        <div className="mt-4">
                                            <div className="flex justify-between text-xs mb-1 font-mono">
                                                <span className={q.isCritical ? "text-red-400 font-bold" : "text-slate-400"}>{q.used}</span>
                                                <span className="text-slate-500">/ {q.hard}</span>
                                            </div>
                                            {/* Simple visual bar logic requires parsing units, omitting for speed now due to k8s unit variety */}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* 2. PENDING PODS ANALYSIS */}
                    <section>
                        <h2 className="text-xl font-semibold text-slate-200 mb-4 flex items-center gap-2">
                            <AlertCircle className="text-amber-400" /> Stuck / Pending Pods
                        </h2>
                        {loading ? (
                            <div className="p-8 bg-slate-900 rounded-xl animate-pulse text-slate-500">Scanning for patients...</div>
                        ) : pendingPods.length === 0 ? (
                            <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 text-green-400">
                                <CheckCircle size={24} />
                                No stuck pods found! Your cluster seems healthy.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {pendingPods.map((pod) => (
                                    <div key={pod.name} className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
                                        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-4">
                                            <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                                <Box className="text-slate-500" /> {pod.name}
                                            </h3>
                                            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-bold border border-yellow-500/20">PENDING</span>
                                        </div>

                                        <div className="space-y-2">
                                            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Diagnosis (Recent Events):</h4>
                                            {pod.events.length > 0 ? (
                                                <div className="bg-black/30 rounded-lg p-4 space-y-3 font-mono text-sm max-h-60 overflow-y-auto">
                                                    {pod.events.map((e, i) => (
                                                        <div key={i} className="flex gap-3 text-slate-300">
                                                            <span className={`shrink-0 font-bold ${e.reason === 'FailedScheduling' ? 'text-red-400' : 'text-blue-400'}`}>{e.reason}:</span>
                                                            <span>{e.message}</span>
                                                            {e.count > 1 && <span className="bg-slate-700 px-1.5 rounded text-[10px] h-fit">x{e.count}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-slate-500 italic">No events found. This is unusual (maybe freshly created?).</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* 3. INFRA ANALYSIS (ON DEMAND) */}
                    <section className="pt-8 border-t border-slate-800">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
                                <BarChart3 className="text-violet-500" /> Infrastructure Analysis
                            </h2>
                            {!showInfra && (
                                <button
                                    onClick={performInfraAnalysis}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold transition-all border border-slate-700 hover:border-violet-500"
                                >
                                    Start Deep Scan (Check Nodes)
                                </button>
                            )}
                        </div>

                        {showInfra && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                                {infraLoading ? (
                                    <div className="p-8 bg-slate-900 rounded-xl animate-pulse text-slate-500">Fetching metrics from metrics-server and Nodes...</div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                                        {/* NODE METRICS */}
                                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                                            <h3 className="font-bold text-lg mb-4 text-violet-400 flex items-center justify-between">
                                                <span>Cluster Nodes Load</span>
                                                {nodeError && <span className="text-xs text-red-500 bg-red-500/10 px-2 py-1 rounded border border-red-500/20">Access Denied</span>}
                                            </h3>

                                            {nodeError ? (
                                                <div className="p-4 bg-slate-950 rounded text-sm text-slate-500 italic">
                                                    {nodeError} <br />
                                                    <span className="text-xs mt-2 block opacity-70">You cannot see which Node is overloaded without Admin rights.</span>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {nodes.map(node => {
                                                        const cpuP = parseInt(node.cpuPercent.replace('%', ''));
                                                        const memP = parseInt(node.memoryPercent.replace('%', ''));
                                                        return (
                                                            <div key={node.name} className="bg-slate-950 p-4 rounded-lg">
                                                                <div className="flex justify-between text-sm mb-2 font-mono">
                                                                    <span className="font-bold text-slate-300">{node.name}</span>
                                                                </div>
                                                                {/* CPU Bar */}
                                                                <div className="mb-2">
                                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                                        <span>CPU</span>
                                                                        <span className={cpuP > 80 ? 'text-red-400' : 'text-slate-400'}>{node.cpuPercent} ({node.cpuCores})</span>
                                                                    </div>
                                                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                        <div style={{ width: node.cpuPercent }} className={`h-full ${cpuP > 80 ? 'bg-red-500' : 'bg-cyan-500'}`}></div>
                                                                    </div>
                                                                </div>
                                                                {/* Memory Bar */}
                                                                <div>
                                                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                                        <span>Memory</span>
                                                                        <span className={memP > 80 ? 'text-red-400' : 'text-slate-400'}>{node.memoryPercent} ({node.memoryBytes})</span>
                                                                    </div>
                                                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                                        <div style={{ width: node.memoryPercent }} className={`h-full ${memP > 80 ? 'bg-red-500' : 'bg-purple-500'}`}></div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* TOP PODS */}
                                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                                            <h3 className="font-bold text-lg mb-4 text-violet-400">Top Pods in {selectedProject}</h3>
                                            {topPods.length === 0 ? (
                                                <div className="text-slate-500 italic text-sm">No metrics available.</div>
                                            ) : (
                                                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                                    {topPods.map((pod, i) => (
                                                        <div key={i} className="flex items-center justify-between text-sm bg-slate-950 p-3 rounded border border-slate-900 hover:border-slate-700">
                                                            <div className="font-mono text-slate-300 truncate w-1/2" title={pod.name}>
                                                                {pod.name}
                                                            </div>
                                                            <div className="flex gap-4 font-mono text-xs">
                                                                <span className="text-cyan-400">{pod.cpu}</span>
                                                                <span className="text-purple-400">{pod.memory}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                </div>
            )}
        </div>
    );
}
