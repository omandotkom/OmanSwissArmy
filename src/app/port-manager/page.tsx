
"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search, RefreshCw, XCircle, CheckCircle, Activity, Server, Hash, ShieldAlert } from "lucide-react";

export default function PortManagerPage() {
    const [port, setPort] = useState("");
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<any>(null);
    const [killLoading, setKillLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const checkPort = (targetPort: string) => {
        if (!targetPort) return;
        setLoading(true);
        setResult(null);
        setMessage(null);
        setProgress(0);

        const worker = new Worker(new URL('./port-scan.worker.ts', import.meta.url));

        worker.onmessage = (e) => {
            const { type, value, data, error } = e.data;

            if (type === 'progress') {
                setProgress(value);
            } else if (type === 'result') {
                setResult(data);
                setLoading(false);
                worker.terminate();
            } else if (type === 'error') {
                setMessage({ type: 'error', text: error });
                setLoading(false);
                worker.terminate();
            }
        };

        worker.postMessage({ port: targetPort, checkUrl: '/api/system/port-manager/check' });
    };

    const confirmKillProcess = () => {
        if (!result || !result.pid) return;
        setShowConfirmModal(true);
    };

    const performKill = async () => {
        setShowConfirmModal(false);
        if (!result || !result.pid) return;

        setKillLoading(true);
        try {
            const res = await fetch('/api/system/port-manager/kill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pid: result.pid })
            });
            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', text: "Process terminated successfully." });
                // Re-check port after 1 second
                setTimeout(() => checkPort(port), 1000);
            } else {
                setMessage({ type: 'error', text: data.error || "Failed to terminate process" });
            }
        } catch (err) {
            setMessage({ type: 'error', text: "An error occurred while terminating process." });
        } finally {
            setKillLoading(false);
        }
    };

    const commonPorts = ["3000", "8080", "8000", "5432", "1521", "27017"];

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans p-6 flex flex-col items-center relative">
            {/* Header */}
            <div className="w-full max-w-2xl mb-8 flex items-center justify-between">
                <Link href="/" className="flex items-center text-zinc-400 hover:text-white transition-colors">
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Back to Tools
                </Link>
                <h1 className="text-xl font-light tracking-wide text-zinc-200">Port Manager</h1>
            </div>

            <main className="w-full max-w-2xl relative z-10">
                {/* Search Card */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 shadow-xl backdrop-blur-sm">
                    <div className="flex flex-col gap-6">
                        <div className="text-center mb-2">
                            <Activity className="w-12 h-12 text-indigo-500 mx-auto mb-4 opacity-80" />
                            <h2 className="text-2xl font-semibold text-white">Check & Manage Ports</h2>
                            <p className="text-zinc-500 mt-2">Find out what's listening on a port and free it up.</p>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="h-5 w-5 text-zinc-500" />
                            </div>
                            <input
                                type="number"
                                placeholder="Enter Port Number (e.g. 3000)"
                                className="block w-full pl-12 pr-4 py-4 bg-zinc-950 border border-zinc-700 rounded-xl text-lg text-white placeholder-zinc-600 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                value={port}
                                onChange={(e) => setPort(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && checkPort(port)}
                            />
                            <button
                                onClick={() => checkPort(port)}
                                disabled={loading || !port}
                                className="absolute right-2 top-2 bottom-2 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg font-medium transition-colors flex items-center"
                            >
                                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : "Check"}
                            </button>
                        </div>

                        {/* Progress Bar */}
                        {loading && (
                            <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                ></div>
                                <div className="text-center text-xs text-zinc-500 mt-1">Scanning Port... {progress}%</div>
                            </div>
                        )}

                        {/* Quick Picks */}
                        <div className="flex flex-wrap gap-2 justify-center">
                            {commonPorts.map(p => (
                                <button
                                    key={p}
                                    onClick={() => { setPort(p); checkPort(p); }}
                                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full text-xs transition-colors border border-zinc-700"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Result Message */}
                {message && (
                    <div className={`mt-6 p-4 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${message.type === 'success'
                        ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400'
                        : 'bg-red-900/20 border-red-800 text-red-400'}`}>
                        {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <ShieldAlert className="w-5 h-5 flex-shrink-0" />}
                        <p>{message.text}</p>
                    </div>
                )}

                {/* Status Card */}
                {result && (
                    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {result.status === 'free' ? (
                            <div className="bg-emerald-900/10 border border-emerald-900/30 rounded-xl p-8 text-center flex flex-col items-center">
                                <div className="w-16 h-16 bg-emerald-900/20 rounded-full flex items-center justify-center mb-4">
                                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                                </div>
                                <h3 className="text-xl font-medium text-emerald-400">Port {port} is Available</h3>
                                <p className="text-zinc-500 mt-2">No processes are correctly listening on this port.</p>
                            </div>
                        ) : (
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
                                <div className="bg-rose-900/20 border-b border-rose-900/30 p-4 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                                    <span className="text-rose-400 font-medium">Port {port} is In Use</span>
                                </div>

                                <div className="p-6 grid gap-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                                            <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
                                                <Server className="w-4 h-4" /> Process Name
                                            </div>
                                            <div className="text-lg font-mono text-white truncate" title={result.processName}>
                                                {result.processName}
                                            </div>
                                        </div>
                                        <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                                            <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
                                                <Hash className="w-4 h-4" /> PID
                                            </div>
                                            <div className="text-lg font-mono text-purple-400">
                                                {result.pid}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-zinc-950/50 p-4 rounded-lg border border-zinc-800/50">
                                        <div className="text-sm text-zinc-500">Protocol: <span className="text-zinc-300 ml-1">{result.protocol}</span></div>

                                        <button
                                            onClick={confirmKillProcess}
                                            disabled={killLoading}
                                            className="px-4 py-2 bg-rose-600/90 hover:bg-rose-500 text-white text-sm font-medium rounded-lg transition-all shadow-lg hover:shadow-rose-900/20 flex items-center gap-2"
                                        >
                                            {killLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                                            Kill Process
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Confirmation Modal */}
            {showConfirmModal && result && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-sm shadow-2xl transform scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mb-4">
                                <ShieldAlert className="w-6 h-6 text-amber-500" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">Kill Process?</h3>
                            <p className="text-zinc-400 text-sm mb-6">
                                Are you sure you want to terminate <span className="text-white font-mono font-medium">{result.processName}</span> (PID: {result.pid})?
                                <br />This action cannot be undone.
                            </p>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={performKill}
                                    className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors shadow-lg shadow-red-900/20"
                                >
                                    Yes, Create Chaos
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
