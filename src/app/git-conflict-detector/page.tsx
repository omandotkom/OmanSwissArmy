
"use client";

import React, { useState, useEffect } from "react";
import { ArrowRight, CheckCircle, AlertTriangle, GitMerge, FileWarning, Search, FolderOpen } from "lucide-react";

export default function GitConflictDetectorPage() {
    const [repoPath, setRepoPath] = useState(""); // Default to empty, will use server default if empty
    const [branches, setBranches] = useState<string[]>([]);
    const [sourceBranch, setSourceBranch] = useState("");
    const [targetBranch, setTargetBranch] = useState("");
    const [isLoadingBranches, setIsLoadingBranches] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [result, setResult] = useState<{ hasConflicts: boolean; conflictingFiles: string[]; detailedConflicts?: { file: string, content: string }[]; message: string } | null>(null);
    const [error, setError] = useState("");
    const [selectedConflict, setSelectedConflict] = useState<{ file: string; content: string } | null>(null);

    // Fetch branches on load or when path changes (debounced?)
    const fetchBranches = async (path: string) => {
        setIsLoadingBranches(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (path) params.append("path", path);

            const res = await fetch(`/api/git/branches?${params.toString()}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch branches");
            }

            setBranches(data.branches || []);
            // Set defaults if available
            if (data.branches.length > 0) {
                // Try to be smart about defaults
                // Source: current checked out branch or first one
                // Target: main/master/develop
                if (!sourceBranch) setSourceBranch(data.branches[0]);

                const commonTargets = ['main', 'master', 'develop', 'dev'];
                const bestTarget = data.branches.find((b: string) => commonTargets.includes(b)) || data.branches[0];
                if (!targetBranch) setTargetBranch(bestTarget);
            }
        } catch (err: any) {
            setError(err.message);
            setBranches([]);
        } finally {
            setIsLoadingBranches(false);
        }
    };

    useEffect(() => {
        fetchBranches(repoPath);
    }, []); // Run once on mount with default path

    const handleCheck = async () => {
        setIsChecking(true);
        setResult(null);
        setError("");
        try {
            const res = await fetch("/api/git/simulate-merge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceBranch,
                    targetBranch,
                    repoPath
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to simulate merge");
            }

            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsChecking(false);
        }
    };

    return (
        <div className="container mx-auto p-8 max-w-4xl min-h-screen text-slate-200">
            <header className="mb-8">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 flex items-center gap-3">
                    <GitMerge className="text-blue-400" />
                    Git Conflict Detector <span className="text-sm border border-blue-500/50 text-blue-400 px-2 py-0.5 rounded-full bg-blue-500/10">Beta</span>
                </h1>
                <p className="text-slate-400 mt-2">
                    Simulate a merge between two branches to detect conflicts early without modifying your repository.
                </p>
            </header>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">

                {/* Repo Selection */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-400">Repository Path (Optional)</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Enter absolute path to local repo (leave empty for current project)"
                                value={repoPath}
                                onChange={(e) => setRepoPath(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                            />
                        </div>
                        <button
                            onClick={() => fetchBranches(repoPath)}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-700 hover:text-white"
                        >
                            Load Branches
                        </button>
                    </div>
                </div>

                {/* Branch Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center relative">
                    {/* Source */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-blue-400">Source Branch (Feature)</label>
                        <div className="relative">
                            <select
                                value={sourceBranch}
                                onChange={(e) => setSourceBranch(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 px-4 appearance-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                disabled={isLoadingBranches}
                            >
                                <option value="">Select Branch...</option>
                                {branches.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            {isLoadingBranches && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>}
                        </div>
                    </div>

                    {/* Arrow Icon in Middle (Desktop) */}
                    <div className="hidden md:flex justify-center pt-6">
                        <ArrowRight className="text-slate-600 w-8 h-8" />
                    </div>

                    {/* Target */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-purple-400">Target Branch (base/main)</label>
                        <div className="relative">
                            <select
                                value={targetBranch}
                                onChange={(e) => setTargetBranch(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 px-4 appearance-none focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                disabled={isLoadingBranches}
                            >
                                <option value="">Select Branch...</option>
                                {branches.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Action Button */}
                <button
                    onClick={handleCheck}
                    disabled={isChecking || !sourceBranch || !targetBranch}
                    className={`w-full py-4 rounded-lg font-bold text-lg shadow-lg flex items-center justify-center gap-3 transition-all ${isChecking
                        ? "bg-slate-700 cursor-not-allowed text-slate-400"
                        : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white hover:shadow-blue-500/25"
                        }`}
                >
                    {isChecking ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Analyzing...
                        </>
                    ) : (
                        <>
                            <Search className="w-5 h-5" />
                            Analyze Conflicts
                        </>
                    )}
                </button>
            </div>

            {/* Results */}
            {result && (
                <div className={`mt-8 p-6 rounded-xl border animate-in fade-in slide-in-from-bottom-4 duration-500 ${result.hasConflicts
                    ? "bg-red-500/5 border-red-500/20"
                    : "bg-green-500/5 border-green-500/20"
                    }`}>
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full ${result.hasConflicts ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-400"
                            }`}>
                            {result.hasConflicts ? <FileWarning className="w-8 h-8" /> : <CheckCircle className="w-8 h-8" />}
                        </div>

                        <div className="flex-1">
                            <h2 className={`text-xl font-bold mb-2 ${result.hasConflicts ? "text-red-400" : "text-green-400"
                                }`}>
                                {result.hasConflicts ? "Conflicts Detected" : "Safe to Merge"}
                            </h2>
                            <p className="text-slate-300 mb-4">{result.message}</p>

                            {result.hasConflicts && result.conflictingFiles.length > 0 && (
                                <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
                                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Conflicting Files ({result.conflictingFiles.length})</h3>
                                    <ul className="space-y-2">
                                        {result.conflictingFiles.map((file, idx) => (
                                            <li key={idx} className="flex flex-col gap-2 p-2 rounded hover:bg-slate-900 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <span className="flex items-center gap-2 text-red-300/80 font-mono text-sm leading-relaxed">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 mt-1.5"></span>
                                                        {file}
                                                    </span>
                                                    {result.detailedConflicts?.find((d) => d.file === file) && (
                                                        <button
                                                            onClick={() => {
                                                                const detail = result.detailedConflicts?.find((d) => d.file === file);
                                                                if (detail) {
                                                                    setSelectedConflict({ file, content: detail.content });
                                                                }
                                                            }}
                                                            className="text-xs bg-red-500/20 text-red-300 px-3 py-1.5 rounded hover:bg-red-500/30 transition-colors border border-red-500/20 font-medium"
                                                        >
                                                            View Conflict
                                                        </button>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {!result.hasConflicts && (
                                <div className="text-slate-400 text-sm">
                                    The simulation was successful. You can proceed with merging
                                    <span className="text-blue-400 mx-1">{sourceBranch}</span>
                                    into
                                    <span className="text-purple-400 mx-1">{targetBranch}</span>.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Conflict Detail Modal */}
            {selectedConflict && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900 sticky top-0">
                            <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                                <FileWarning className="w-5 h-5 text-red-500" />
                                Conflict Details: <span className="text-slate-400 font-mono text-sm">{selectedConflict.file}</span>
                            </h3>
                            <button onClick={() => setSelectedConflict(null)} className="text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-lg transition-colors">
                                <span className="text-xl">✕</span>
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-0 bg-[#0d1117] font-mono text-xs text-slate-300">
                            <div className="p-4 min-w-full inline-block">
                                {selectedConflict.content.split('\n').map((line, i) => {
                                    let className = "block py-0.5 px-4 -mx-4 border-l-4 border-transparent hover:bg-slate-800/30";

                                    if (line.startsWith('<<<<<<<')) {
                                        className += " bg-blue-500/20 text-blue-300 font-bold border-blue-500 mt-4 pt-2";
                                        line = line.replace('<<<<<<<', '📍 Current Branch (Ours):');
                                    }
                                    else if (line.startsWith('=======')) {
                                        className += " bg-yellow-500/20 text-yellow-300 font-bold border-yellow-500 my-2 py-1 flex justify-center tracking-widest";
                                        line = "VS";
                                    }
                                    else if (line.startsWith('>>>>>>>')) {
                                        className += " bg-purple-500/20 text-purple-300 font-bold border-purple-500 mb-4 pb-2";
                                        line = line.replace('>>>>>>>', '📍 Incoming Branch (Theirs):');
                                    }
                                    else if (line.startsWith('+')) {
                                        // Usually green in diffs, but in conflict context, it depends on which side.
                                        // Standard merge format doesn't prefix all lines with +/- like unified diff.
                                        // However, `git merge-tree` output is a bit raw.
                                        // Let's keep it simple.
                                    }

                                    return <span key={i} className={className}>{line}</span>
                                })}
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end">
                            <button
                                onClick={() => setSelectedConflict(null)}
                                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
