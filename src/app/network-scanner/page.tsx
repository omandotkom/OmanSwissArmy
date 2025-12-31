"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, Server, Globe, Wifi, ShieldCheck, ShieldAlert, Activity } from "lucide-react";
import Link from "next/link";
import { trackActivity } from "@/lib/tracker";

interface ScanResult {
    port: number;
    status: 'open' | 'closed';
    service?: string;
}

export default function NetworkScannerPage() {
    const [target, setTarget] = useState("localhost");
    const [results, setResults] = useState<ScanResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [scanSummary, setScanSummary] = useState<{ open: number, closed: number } | null>(null);

    const handleScan = async () => {
        if (!target) return;

        setIsLoading(true);
        setResults([]);
        setScanSummary(null);

        trackActivity({ action: "NETWORK_SCAN", label: target });

        try {
            const res = await fetch("/api/network/scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target })
            });

            const data = await res.json();
            if (data.results) {
                // Filter hanya yang open dulu supaya rapi, atau tampilkan semua? 
                // Better show all but sort Open first
                const sorted = data.results.sort((a: ScanResult, b: ScanResult) => {
                    return (a.status === 'open' ? -1 : 1);
                });

                setResults(sorted);

                const openCount = data.results.filter((r: ScanResult) => r.status === 'open').length;
                const closedCount = data.results.length - openCount;
                setScanSummary({ open: openCount, closed: closedCount });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 px-6 py-4 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center gap-4">
                    <Link
                        href="/"
                        onClick={() => trackActivity({ action: "NAVIGATE_BACK", label: "From Network Scanner" })}
                        className="flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Tools
                    </Link>
                    <div className="h-4 w-px bg-zinc-800" />
                    <h1 className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
                        <Server className="h-5 w-5 text-blue-500" />
                        Network & Port Scanner
                    </h1>
                </div>
            </header>

            <main className="mx-auto w-full max-w-4xl p-6">
                <div className="grid gap-8">
                    {/* Input Section */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-sm">
                        <label className="mb-2 block text-sm font-medium text-zinc-400">
                            Target Host / IP Address
                        </label>
                        <div className="flex gap-4">
                            <div className="relative flex-1">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <Globe className="h-4 w-4 text-zinc-500" />
                                </div>
                                <input
                                    type="text"
                                    value={target}
                                    onChange={(e) => setTarget(e.target.value)}
                                    placeholder="e.g., localhost, 192.168.1.1, example.com"
                                    className="block w-full rounded-md border border-zinc-700 bg-zinc-900 pl-10 pr-3 py-2.5 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                                />
                            </div>
                            <button
                                onClick={handleScan}
                                disabled={isLoading || !target}
                                className="flex items-center gap-2 rounded-md bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Scanning...
                                    </>
                                ) : (
                                    <>
                                        <Activity className="h-4 w-4" />
                                        Start Scan
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-zinc-500">
                            Scans common top ports (21, 22, 80, 443, 3306, etc.) using TCP Connect.
                        </p>
                    </div>

                    {/* Results Section */}
                    {scanSummary && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-lg border border-green-900/30 bg-green-900/10 p-4 flex items-center gap-3">
                                <div className="p-2 bg-green-500/10 rounded-full">
                                    <ShieldCheck className="h-5 w-5 text-green-500" />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-green-400">{scanSummary.open}</div>
                                    <div className="text-xs text-green-500/80 uppercase font-semibold tracking-wider">Open Ports</div>
                                </div>
                            </div>
                            <div className="rounded-lg border border-red-900/30 bg-red-900/10 p-4 flex items-center gap-3">
                                <div className="p-2 bg-red-500/10 rounded-full">
                                    <ShieldAlert className="h-5 w-5 text-red-500" />
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-red-400">{scanSummary.closed}</div>
                                    <div className="text-xs text-red-500/80 uppercase font-semibold tracking-wider">Closed / Blocked</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
                            <div className="border-b border-zinc-800 bg-zinc-900/80 px-6 py-3">
                                <h3 className="text-sm font-medium text-zinc-300">Scan Results for <span className="text-blue-400 mono">{target}</span></h3>
                            </div>
                            <div className="max-h-[500px] overflow-y-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="sticky top-0 bg-zinc-900 text-xs font-semibold uppercase text-zinc-500">
                                        <tr>
                                            <th className="px-6 py-3">Port</th>
                                            <th className="px-6 py-3">Service</th>
                                            <th className="px-6 py-3 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {results.map((r) => (
                                            <tr key={r.port} className={`group hover:bg-zinc-800/50 transition-colors ${r.status === 'open' ? 'bg-green-900/5' : ''}`}>
                                                <td className="px-6 py-3 font-mono text-zinc-300">
                                                    {r.port}
                                                </td>
                                                <td className="px-6 py-3 text-zinc-400">
                                                    {r.service}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${r.status === 'open'
                                                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                                        : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                                        }`}>
                                                        {r.status === 'open' && <span className="relative flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                        </span>}
                                                        {r.status.toUpperCase()}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
