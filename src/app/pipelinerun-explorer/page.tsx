'use client';

import React, { useState, useEffect, Suspense } from 'react';
import {
    Play,
    CheckCircle,
    XCircle,
    Clock,
    RotateCcw,
    Terminal,
    ArrowRight,
    Search,
    RefreshCw,
    LogOut,
    ArrowLeft,
    ScrollText,
    ExternalLink,
    Box,
    Trash2,
    AlertTriangle,
    Filter,
    X,
    Calendar,
    AlertOctagon
} from 'lucide-react';
import Link from 'next/link';
import { UserBadge } from "@/components/UserBadge";
import { ProjectSelector } from "@/components/ProjectSelector";
import { trackActivity } from "@/lib/tracker";

interface PipelineRunSummary {
    name: string;
    status: string;
    startTime: string;
    completionTime: string;
    duration: string;
    pipeline: string;
    startedBy: string;
    pvcClaims: string[];
}

interface StepState {
    terminated?: {
        reason: string;
        exitCode: number;
        startedAt: string;
        finishedAt: string;
    };
    running?: {
        startedAt: string;
    };
    waiting?: {
        reason: string;
    };
}

// Full PR Details
interface PipelineRunDetails {
    metadata: {
        name: string;
        namespace: string;
        creationTimestamp: string;
        labels: Record<string, string>;
        annotations?: Record<string, string>;
    };
    status: {
        conditions: { type: string; status: string; reason: string; message: string }[];
        startTime: string;
        completionTime: string;
        taskRuns: Record<string, {
            pipelineTaskName: string;
            status: {
                podName: string;
                conditions: { status: string; reason: string }[];
                steps: { name: string; terminated?: any; running?: any; waiting?: any }[];
                startTime: string;
                completionTime: string;
            };
        }>;
    };
    spec: {
        params: { name: string; value: string }[];
    }
}

function PipelineRunExplorerContent() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [checkingLogin, setCheckingLogin] = useState(true);
    const [projects, setProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState('');

    // Data State
    const [pipelineRuns, setPipelineRuns] = useState<PipelineRunSummary[]>([]);
    const [loadingRuns, setLoadingRuns] = useState(false);
    const [selectedRun, setSelectedRun] = useState<PipelineRunSummary | null>(null);
    const [runDetails, setRunDetails] = useState<PipelineRunDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Filter State
    const [filterStartedBy, setFilterStartedBy] = useState('');
    const [filterPvc, setFilterPvc] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    // Logs State
    const [logModal, setLogModal] = useState<{ open: boolean; pod: string; container: string; title: string }>({ open: false, pod: '', container: '', title: '' });
    const [logs, setLogs] = useState('');
    const [loadingLogs, setLoadingLogs] = useState(false);

    // Prune State
    const [pruneModalOpen, setPruneModalOpen] = useState(false);
    const [keepCount, setKeepCount] = useState(10);
    const [pruneDays, setPruneDays] = useState(30);
    const [isPruning, setIsPruning] = useState(false);
    const [pruneResult, setPruneResult] = useState<{ message: string; details?: any } | null>(null);
    const [pruneProgress, setPruneProgress] = useState<{ current: number; total: number; percent: number }>({ current: 0, total: 0, percent: 0 });
    const [pruneLogs, setPruneLogs] = useState<{ message: string; error?: boolean }[]>([]);

    // Login State
    const [loginCommand, setLoginCommand] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

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
                checkLoginStatus(); // Fetch projects
                trackActivity({ action: "LOGIN_SUCCESS", label: "PipelineRun Explorer" });
            } else {
                setLoginError(data.error);
            }
        } catch (err) {
            setLoginError('Server error');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const fetchPipelineRuns = async (project: string) => {
        if (!project) return;
        setLoadingRuns(true);
        setPipelineRuns([]);
        setSelectedRun(null);
        setRunDetails(null);
        try {
            const res = await fetch(`/api/oc/pipelineruns?namespace=${project}`);
            const data = await res.json();
            if (res.ok) {
                setPipelineRuns(data.pipelineRuns || []);
            }
        } catch (e) {
            console.error("Failed to fetch runs", e);
        } finally {
            setLoadingRuns(false);
        }
    };

    const fetchRunDetails = async (name: string) => {
        if (!selectedProject || !name) return;
        setLoadingDetails(true);
        try {
            const res = await fetch(`/api/oc/pipelinerun?namespace=${selectedProject}&name=${name}`);
            const data = await res.json();
            if (res.ok) {
                setRunDetails(data.details);
            }
        } catch (e) {
            console.error("Failed to fetch details", e);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleRunClick = (run: PipelineRunSummary) => {
        setSelectedRun(run);
        fetchRunDetails(run.name);
        trackActivity({ action: "VIEW_PIPELINERUN", label: run.name });
    };

    const handleViewLogs = async (pod: string, container: string, stepName: string) => {
        setLogModal({ open: true, pod, container, title: stepName });
        setLogs('');
        setLoadingLogs(true);
        try {
            const res = await fetch(`/api/oc/pod-logs?namespace=${selectedProject}&pod=${pod}&container=${container}`);
            const data = await res.json();
            if (res.ok) {
                setLogs(data.logs || 'No logs found.');
            } else {
                setLogs(`Error fetching logs: ${data.error}`);
            }
        } catch (e) {
            setLogs('Failed to fetch logs.');
        } finally {
            setLoadingLogs(false);
        }
        trackActivity({ action: "VIEW_LOGS", label: pod, details: { container } });
    };

    const handlePrune = async (options: { strategy?: string, statuses?: string[], days?: number, keepCount?: number } = {}) => {
        if (!selectedProject) return;
        setIsPruning(true);
        setPruneResult(null);
        setPruneLogs([]);
        setPruneProgress({ current: 0, total: 0, percent: 0 });

        const payload: any = { namespace: selectedProject };
        if (options.strategy) {
            payload.strategy = options.strategy;
            payload.statuses = options.statuses;
            payload.days = options.days;
        } else {
            // Default legacy behavior: keep count
            payload.keepCount = options.keepCount ?? keepCount;
        }

        try {
            const response = await fetch('/api/oc/prune-pipelineruns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.body) {
                setPruneResult({ message: 'Error: No response body' });
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'log') {
                            setPruneLogs(prev => [...prev, { message: data.message }]);
                        } else if (data.type === 'start') {
                            setPruneProgress({ current: 0, total: data.total, percent: 0 });
                        } else if (data.type === 'progress') {
                            const percent = Math.round((data.current / data.total) * 100);
                            setPruneProgress({ current: data.current, total: data.total, percent });
                            setPruneLogs(prev => [...prev.slice(-4), { message: data.log, error: data.error }]);
                        } else if (data.type === 'done') {
                            setPruneResult({ message: 'Pruning Complete', details: { success: data.success, failed: data.failed } });
                        } else if (data.type === 'error') {
                            setPruneResult({ message: `Error: ${data.message}` });
                        }
                    } catch (e) {
                        console.error('Error parsing stream chunks', e);
                    }
                }
            }

            trackActivity({ action: "PRUNE_PIPELINERUNS", label: selectedProject, details: payload });
            fetchPipelineRuns(selectedProject);

        } catch (e: any) {
            setPruneResult({ message: `Failed to prune: ${e.message}` });
        } finally {
            setIsPruning(false);
        }
    };

    // --- Filtering Logic ---
    const filteredRuns = pipelineRuns.filter(run => {
        // Filter by PVC
        if (filterPvc && (!run.pvcClaims || !run.pvcClaims.some(p => p.toLowerCase().includes(filterPvc.toLowerCase())))) {
            return false;
        }

        // Filter by Started By
        if (filterStartedBy && !run.startedBy.toLowerCase().includes(filterStartedBy.toLowerCase())) {
            return false;
        }

        // Filter by Status
        if (filterStatus && run.status.toLowerCase() !== filterStatus.toLowerCase()) {
            return false;
        }

        return true;
    });

    const uniqueStatuses = Array.from(new Set(pipelineRuns.map(r => r.status))).sort();

    // --- Render Helpers ---

    const getStatusColor = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'succeeded' || s === 'completed') return 'text-green-400';
        if (s === 'failed' || s === 'error') return 'text-red-400';
        if (s === 'running') return 'text-blue-400 animate-pulse';
        if (s === 'cancelled') return 'text-gray-400';
        return 'text-yellow-400';
    };

    const getStatusIcon = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'succeeded' || s === 'completed') return <CheckCircle size={16} className={getStatusColor(status)} />;
        if (s === 'failed' || s === 'error') return <XCircle size={16} className={getStatusColor(status)} />;
        if (s === 'running') return <RefreshCw size={16} className={getStatusColor(status)} />;
        return <Clock size={16} className={getStatusColor(status)} />;
    };

    if (checkingLogin) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading...</div>;

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent mb-2">OpenShift Login</h1>
                        <p className="text-slate-400">Connect to your cluster to view PipelineRuns</p>
                    </div>
                    <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Login Command</label>
                            <textarea
                                value={loginCommand}
                                onChange={(e) => setLoginCommand(e.target.value)}
                                placeholder="oc login --token=... --server=..."
                                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-300 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                required
                            />
                        </div>
                        {loginError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">{loginError}</div>}
                        <button type="submit" disabled={isLoggingIn} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                            {isLoggingIn ? <RefreshCw className="animate-spin" size={20} /> : <Terminal size={20} />}
                            {isLoggingIn ? 'Connecting...' : 'Connect to Cluster'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Process TaskRuns for display
    let sortedTaskRuns: any[] = [];
    if (runDetails?.status?.taskRuns) {
        sortedTaskRuns = Object.values(runDetails.status.taskRuns).sort((a: any, b: any) => {
            const tA = new Date(a.status?.startTime || 0).getTime();
            const tB = new Date(b.status?.startTime || 0).getTime();
            return tA - tB;
        });
    }

    const startedBy = runDetails?.metadata?.annotations?.['pipeline.openshift.io/started-by']
        || runDetails?.metadata?.labels?.['pipeline.openshift.io/started-by']
        || '-';

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col h-screen overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors"><ArrowLeft size={24} /></Link>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent flex items-center gap-2">
                            <Play size={24} className="text-blue-400" /> PipelineRun Explorer
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <UserBadge />
                    <button onClick={() => setIsLoggedIn(false)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-sm transition-colors border border-slate-700">
                        <LogOut size={14} /> Disconnect
                    </button>
                </div>
            </div>

            {/* Controls & Filters */}
            <div className="flex flex-col gap-4 mb-6 shrink-0 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-64">
                            <ProjectSelector
                                projects={projects}
                                selectedProject={selectedProject}
                                onSelect={(p) => { setSelectedProject(p); fetchPipelineRuns(p); }}
                                placeholder="Select Namespace"
                            />
                        </div>
                        <button
                            onClick={() => fetchPipelineRuns(selectedProject)}
                            disabled={!selectedProject || loadingRuns}
                            className="h-[38px] w-[38px] flex items-center justify-center bg-blue-600 hover:bg-blue-500 rounded-md text-white disabled:opacity-50 transition-colors"
                            title="Refresh Runs"
                        >
                            <RefreshCw size={18} className={loadingRuns ? "animate-spin" : ""} />
                        </button>
                    </div>
                    <div>
                        <button
                            onClick={() => setPruneModalOpen(true)}
                            disabled={!selectedProject}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-500 hover:text-red-400 rounded-lg border border-red-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Trash2 size={16} /> Prune Runs
                        </button>
                    </div>
                </div>

                {/* Filter Inputs */}
                {selectedProject && (
                    <div className="flex items-center gap-4 p-2 bg-slate-950/50 rounded-lg border border-slate-800/50 overflow-x-auto">
                        <div className="flex items-center gap-2 text-slate-500 text-sm font-medium px-2">
                            <Filter size={16} /> Filters:
                        </div>

                        {/* Started By Filter */}
                        <div className="relative group">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400" />
                            <input
                                type="text"
                                placeholder="Started By (user)..."
                                value={filterStartedBy}
                                onChange={(e) => setFilterStartedBy(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:border-blue-500 focus:outline-none w-48 transition-colors"
                            />
                            {filterStartedBy && <button onClick={() => setFilterStartedBy('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X size={12} /></button>}
                        </div>

                        {/* PVC Filter */}
                        <div className="relative group">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400" />
                            <input
                                type="text"
                                placeholder="PVC Name..."
                                value={filterPvc}
                                onChange={(e) => setFilterPvc(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:border-blue-500 focus:outline-none w-48 transition-colors"
                            />
                            {filterPvc && <button onClick={() => setFilterPvc('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X size={12} /></button>}
                        </div>

                        {/* Status Filter */}
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:border-blue-500 focus:outline-none transition-colors"
                        >
                            <option value="">All Statuses</option>
                            {uniqueStatuses.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>

                        {(filterStartedBy || filterPvc || filterStatus) && (
                            <button
                                onClick={() => { setFilterStartedBy(''); setFilterPvc(''); setFilterStatus(''); }}
                                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors ml-auto"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="flex gap-6 flex-1 overflow-hidden">
                {/* List Panel */}
                <div className="w-1/3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col">
                    <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                        <h2 className="font-semibold text-slate-300 flex items-center gap-2"><ScrollText size={18} /> Runs</h2>
                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{filteredRuns.length} / {pipelineRuns.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {loadingRuns ? (
                            <div className="flex justify-center items-center h-48 text-slate-500"><RefreshCw className="animate-spin mr-2" /> Loading...</div>
                        ) : filteredRuns.length === 0 ? (
                            <div className="flex justify-center items-center h-48 text-slate-500 italic">
                                {pipelineRuns.length > 0 ? 'No runs match filters' : 'No PipelineRuns found'}
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800">
                                {filteredRuns.map((run) => (
                                    <div
                                        key={run.name}
                                        onClick={() => handleRunClick(run)}
                                        className={`p-4 cursor-pointer transition-colors hover:bg-slate-800 ${selectedRun?.name === run.name ? 'bg-slate-800/80 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-sm text-slate-200 truncate pr-2" title={run.name}>{run.name}</span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${getStatusColor(run.status)} bg-slate-950`}>{run.status}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-slate-500 mb-1">
                                            <div className="flex items-center gap-1"><Clock size={10} /> {new Date(run.startTime).toLocaleString()}</div>
                                            <span>{run.duration}</span>
                                        </div>
                                        {/* Run Extra Info for easy scanning */}
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {run.startedBy && run.startedBy !== '-' && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-900/30 text-blue-300 rounded border border-blue-900/50 truncate max-w-[150px]">
                                                    {run.startedBy}
                                                </span>
                                            )}
                                            {run.pvcClaims && run.pvcClaims.length > 0 && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/30 text-amber-300 rounded border border-amber-900/50 truncate max-w-[150px]">
                                                    PVC: {run.pvcClaims.length}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Details Panel */}
                <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden relative">
                    {!selectedRun ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                            <Box size={48} className="mb-4 opacity-20" />
                            <p>Select a PipelineRun to view details</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            {/* Run Header */}
                            <div className="p-6 border-b border-slate-800 bg-slate-900/50 shrink-0">
                                <h2 className="text-xl font-bold text-white mb-2">{selectedRun.name}</h2>
                                <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                                    <div className="flex items-center gap-1">Status: {getStatusIcon(selectedRun.status)} <span className={getStatusColor(selectedRun.status)}>{selectedRun.status}</span></div>
                                    <div className="flex items-center gap-1">Pipeline: <span className="text-slate-200">{selectedRun.pipeline}</span></div>
                                    <div className="flex items-center gap-1">Duration: <span className="text-slate-200">{selectedRun.duration}</span></div>
                                    <div className="flex items-center gap-1">Started By: <span className="text-blue-300 font-medium px-2 py-0.5 bg-blue-500/10 rounded-full border border-blue-500/20">{startedBy}</span></div>
                                </div>
                            </div>

                            {/* Task Runs (Scrollable) */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {loadingDetails ? (
                                    <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-blue-500" size={32} /></div>
                                ) : !runDetails ? (
                                    <div className="text-center text-slate-500">Failed to load details</div>
                                ) : sortedTaskRuns.length === 0 ? (
                                    <div className="text-center text-slate-500">No tasks found for this run.</div>
                                ) : (
                                    sortedTaskRuns.map((taskRun: any, idx: number) => {
                                        const podName = taskRun.status?.podName;
                                        const status = taskRun.status?.conditions?.[0]?.reason || 'Unknown';

                                        return (
                                            <div key={idx} className="bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden">
                                                <div className="p-3 bg-slate-800/50 flex justify-between items-center border-b border-slate-800/50">
                                                    <div className="flex items-center gap-3">
                                                        {getStatusIcon(status)}
                                                        <span className="font-semibold text-slate-200">{taskRun.pipelineTaskName}</span>
                                                        <span className="text-xs text-slate-500 font-mono">({podName})</span>
                                                    </div>
                                                    <span className="text-xs text-slate-500">{taskRun.status?.completionTime ? ((new Date(taskRun.status.completionTime).getTime() - new Date(taskRun.status.startTime).getTime()) / 1000) + 's' : 'Running'}</span>
                                                </div>
                                                <div className="p-0">
                                                    <table className="w-full text-sm">
                                                        <tbody>
                                                            {taskRun.status?.steps?.map((step: any, sIdx: number) => {
                                                                // Determine Step Status
                                                                let stepStatus = 'Running';
                                                                let stepDuration = '';

                                                                if (step.terminated) {
                                                                    stepStatus = step.terminated.exitCode === 0 ? 'Completed' : 'Failed';
                                                                    if (step.terminated.startedAt && step.terminated.finishedAt) {
                                                                        stepDuration = ((new Date(step.terminated.finishedAt).getTime() - new Date(step.terminated.startedAt).getTime()) / 1000).toFixed(1) + 's';
                                                                    }
                                                                } else if (step.waiting) {
                                                                    stepStatus = 'Waiting';
                                                                }

                                                                const icon = stepStatus === 'Completed' ? <CheckCircle size={14} className="text-green-500" /> :
                                                                    stepStatus === 'Failed' ? <XCircle size={14} className="text-red-500" /> :
                                                                        stepStatus === 'Waiting' ? <Clock size={14} className="text-slate-500" /> :
                                                                            <RefreshCw size={14} className="text-blue-500 animate-spin" />;

                                                                return (
                                                                    <tr key={sIdx} className="border-b border-slate-800/30 last:border-0 hover:bg-slate-800/20">
                                                                        <td className="p-3 w-8">{icon}</td>
                                                                        <td className="p-3 font-medium text-slate-300">{step.name}</td>
                                                                        <td className="p-3 text-slate-500 text-xs text-right">{stepDuration}</td>
                                                                        <td className="p-3 w-24 text-right">
                                                                            <button
                                                                                onClick={() => handleViewLogs(podName, `step-${step.name}`, `${taskRun.pipelineTaskName} / ${step.name}`)}
                                                                                className="px-2 py-1 bg-slate-800 hover:bg-black hover:text-white text-slate-400 rounded text-xs transition-colors flex items-center gap-1 ml-auto border border-slate-700 hover:border-slate-500"
                                                                            >
                                                                                <Terminal size={12} /> Logs
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}

                                {/* Parameters Section */}
                                {runDetails?.spec?.params && (
                                    <div className="mt-8">
                                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Parameters</h3>
                                        <div className="grid grid-cols-1 gap-2">
                                            {runDetails.spec.params.map((p, i) => (
                                                <div key={i} className="flex gap-4 text-sm p-2 bg-slate-950 rounded border border-slate-800">
                                                    <span className="font-mono text-blue-400 min-w-[150px]">{p.name}</span>
                                                    <span className="text-slate-300 break-all">{p.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Logs Modal */}
            {logModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                            <h3 className="font-medium text-zinc-200 flex items-center gap-2">
                                <Terminal size={18} className="text-blue-400" />
                                {logModal.title}
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 font-mono px-2 py-1 bg-black rounded border border-slate-800">{logModal.pod}</span>
                                <button
                                    onClick={() => setLogModal({ ...logModal, open: false })}
                                    className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
                                >
                                    <XCircle size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto bg-black p-4 font-mono text-sm">
                            {loadingLogs ? (
                                <div className="flex justify-center items-center h-full text-slate-500 gap-2">
                                    <RefreshCw className="animate-spin" /> Fetching logs...
                                </div>
                            ) : (
                                <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed">{logs}</pre>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Prune Modal */}
            {pruneModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-6">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                                    <Trash2 className="text-red-500" size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Prune Pipeline Runs</h3>
                                    <p className="text-slate-400 text-xs">Free up PVC storage space by deleting old runs.</p>
                                </div>
                            </div>
                            <button onClick={() => setPruneModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {!pruneResult && !isPruning ? (
                            <div className="space-y-6">
                                {/* Info Box */}
                                <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex items-start gap-3">
                                    <AlertOctagon className="text-blue-400 shrink-0 mt-0.5" size={16} />
                                    <p className="text-xs text-slate-300 leading-relaxed">
                                        <strong>Warning:</strong> Delete operations are permanent. Please confirm your selection below before proceeding.
                                    </p>
                                </div>

                                {/* Option 1: Retention Policy */}
                                <div className="space-y-3 pb-4 border-b border-slate-800">
                                    <label className="text-sm font-semibold text-slate-200 block">1. Retention Policy</label>
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center justify-between text-xs text-slate-400">
                                                <span>Keep most recent</span>
                                                <span className="font-mono text-blue-400">{keepCount} runs</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="50"
                                                value={keepCount}
                                                onChange={(e) => setKeepCount(parseInt(e.target.value))}
                                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>
                                        <button
                                            onClick={() => handlePrune({ keepCount })}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition-colors whitespace-nowrap"
                                        >
                                            Prune Others
                                        </button>
                                    </div>
                                </div>

                                {/* Option 2: Instant Actions (Status) */}
                                <div className="space-y-3 pb-4 border-b border-slate-800">
                                    <label className="text-sm font-semibold text-slate-200 block">2. Quick Cleanup by Status</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => handlePrune({ strategy: 'by-status', statuses: ['Failed'] })}
                                            className="p-3 bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 rounded-lg flex items-center justify-between group transition-colors"
                                        >
                                            <span className="text-xs font-medium text-red-400 group-hover:text-red-300">Delete Failed</span>
                                            <Trash2 size={14} className="text-red-500/50 group-hover:text-red-400" />
                                        </button>
                                        <button
                                            onClick={() => handlePrune({ strategy: 'by-status', statuses: ['Cancelled'] })}
                                            className="p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-between group transition-colors"
                                        >
                                            <span className="text-xs font-medium text-slate-400 group-hover:text-slate-300">Delete Cancelled</span>
                                            <Trash2 size={14} className="text-slate-500/50 group-hover:text-slate-400" />
                                        </button>
                                        <button
                                            onClick={() => handlePrune({ strategy: 'by-status', statuses: ['PipelineRunTimeout'] })}
                                            className="p-3 bg-amber-950/20 hover:bg-amber-900/30 border border-amber-900/40 rounded-lg flex items-center justify-between group transition-colors col-span-2"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className="text-amber-500" />
                                                <span className="text-xs font-medium text-amber-400 group-hover:text-amber-300">Delete Timed Out (PipelineRunTimeout)</span>
                                            </div>
                                            <Trash2 size={14} className="text-amber-500/50 group-hover:text-amber-400" />
                                        </button>
                                    </div>
                                </div>

                                {/* Option 3: By Age */}
                                <div className="space-y-3">
                                    <label className="text-sm font-semibold text-slate-200 block">3. Cleanup by Age</label>
                                    <div className="flex items-center gap-3">
                                        <div className="relative flex-1">
                                            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                            <input
                                                type="number"
                                                min="1"
                                                value={pruneDays}
                                                onChange={(e) => setPruneDays(parseInt(e.target.value))}
                                                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 focus:border-blue-500 outline-none"
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">days</span>
                                        </div>
                                        <button
                                            onClick={() => handlePrune({ strategy: 'older-than', days: pruneDays })}
                                            className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium rounded-lg border border-red-600/30 transition-colors whitespace-nowrap"
                                        >
                                            Delete Older Runs
                                        </button>
                                    </div>
                                </div>

                            </div>
                        ) : isPruning ? (
                            <div className="space-y-4 pt-4">
                                <div className="text-center mb-4">
                                    <div className="text-3xl font-bold text-white mb-1">{pruneProgress.percent}%</div>
                                    <div className="text-xs text-slate-400">Processing {pruneProgress.current} of {pruneProgress.total} items</div>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-300 ease-out"
                                        style={{ width: `${pruneProgress.percent}%` }}
                                    />
                                </div>

                                {/* Live Log Window */}
                                <div className="bg-black/50 rounded-lg border border-slate-800 p-3 h-32 overflow-hidden flex flex-col justify-end font-mono text-xs">
                                    {pruneLogs.map((log, i) => (
                                        <div key={i} className={`truncate ${log.error ? 'text-red-400' : 'text-slate-400'}`}>
                                            {log.message}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className={`p-4 rounded-lg border ${pruneResult?.message.includes('Error') ? 'bg-red-500/10 border-red-500/50 text-red-200' : 'bg-green-500/10 border-green-500/50 text-green-200'}`}>
                                    <p className="text-sm font-medium">{pruneResult?.message}</p>
                                    {pruneResult?.details && (
                                        <div className="mt-2 text-xs opacity-80 grid gap-1">
                                            <div>Success: {pruneResult.details.success}</div>
                                            <div>Failed: {pruneResult.details.failed}</div>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => { setPruneModalOpen(false); setPruneResult(null); }}
                                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors font-medium"
                                >
                                    Close
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PipelineRunExplorerPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading Application...</div>}>
            <PipelineRunExplorerContent />
        </Suspense>
    );
}
