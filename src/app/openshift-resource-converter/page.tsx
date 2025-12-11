"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Cpu, HardDrive, Copy, Check, Info } from "lucide-react";

export default function OpenShiftResourceConverter() {
    const [cpuInput, setCpuInput] = useState<string>("1000m");
    const [memoryInput, setMemoryInput] = useState<string>("1Gi");
    const [copied, setCopied] = useState<string | null>(null);

    // CPU State
    const [cpuMillis, setCpuMillis] = useState<number>(1000);
    const [cpuCores, setCpuCores] = useState<number>(1);

    // Memory State
    const [memBytes, setMemBytes] = useState<number>(1073741824);
    const [memMi, setMemMi] = useState<number>(1024);
    const [memGi, setMemGi] = useState<number>(1);

    // Handle CPU Input Change
    useEffect(() => {
        const val = cpuInput.trim();
        if (!val) {
            setCpuMillis(0);
            setCpuCores(0);
            return;
        }

        let millis = 0;
        if (val.endsWith("m")) {
            millis = parseFloat(val.replace("m", ""));
        } else {
            millis = parseFloat(val) * 1000;
        }

        if (!isNaN(millis)) {
            setCpuMillis(millis);
            setCpuCores(millis / 1000);
        }
    }, [cpuInput]);

    // Handle Memory Input Change
    useEffect(() => {
        const val = memoryInput.trim();
        // Default to bytes if no unit
        // Units: Ki, Mi, Gi, Ti, Pi, Ei (Power of 2 - 1024)
        // Units: m, k, M, G, T, P, E (Power of 10 - 1000) - Kubernetes uses 1000 for these but 1024 for Ki/Mi/Gi usually in requests?
        // Actually K8s defines: 
        // Ki = 1024, Mi = 1024^2
        // m = 0.001 (rarely used for mem), k = 1000, M = 1000^2

        // Simplification for user intent: usually they mean Mi or Gi

        const parseMemory = (input: string) => {
            const regex = /^([0-9.]+)([a-zA-Z]*)$/;
            const match = input.match(regex);

            if (!match) return 0;

            const num = parseFloat(match[1]);
            const unit = match[2];

            const base1024 = 1024;
            const base1000 = 1000;

            switch (unit) {
                case 'Ki': return num * base1024;
                case 'Mi': return num * Math.pow(base1024, 2);
                case 'Gi': return num * Math.pow(base1024, 3);
                case 'Ti': return num * Math.pow(base1024, 4);
                // Decimal
                case 'k': return num * base1000;
                case 'M': return num * Math.pow(base1000, 2);
                case 'G': return num * Math.pow(base1000, 3);
                case 'T': return num * Math.pow(base1000, 4);
                // Default usually bytes if empty, but sometimes people type "1" meaning 1Gi? No, usually precise.
                case '': return num;
                default: return num;
            }
        };

        const bytes = parseMemory(val);
        setMemBytes(bytes);
        setMemMi(bytes / Math.pow(1024, 2));
        setMemGi(bytes / Math.pow(1024, 3));

    }, [memoryInput]);

    const copyToClipboard = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans selection:bg-indigo-500/30">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
                    <Link
                        href="/"
                        className="p-2 rounded-full hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 to-indigo-400 bg-clip-text text-transparent">
                            OpenShift Resource Converter
                        </h1>
                        <p className="text-slate-400 mt-1">
                            Convert CPU and Memory units for Kubernetes/OpenShift manifests instantly.
                        </p>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">

                    {/* CPU Card */}
                    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 hover:border-red-500/30 transition-all duration-300 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-red-500/20"></div>

                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="p-3 bg-red-500/20 rounded-xl text-red-400">
                                <Cpu className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-semibold">CPU / Compute</h2>
                        </div>

                        <div className="space-y-6 relative z-10">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">Input (e.g., 500m, 2)</label>
                                <input
                                    type="text"
                                    value={cpuInput}
                                    onChange={(e) => setCpuInput(e.target.value)}
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 outline-none transition-all placeholder:text-slate-600"
                                    placeholder="Type CPU value..."
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <ResultBox label="Millicores (m)" value={`${cpuMillis}m`} onCopy={() => copyToClipboard(`${cpuMillis}m`, 'cpu-m')} copied={copied === 'cpu-m'} />
                                <ResultBox label="Cores" value={`${cpuCores}`} onCopy={() => copyToClipboard(`${cpuCores}`, 'cpu-core')} copied={copied === 'cpu-core'} />
                            </div>

                            <div className="bg-slate-950/30 rounded-lg p-4 text-xs text-slate-500 flex gap-2">
                                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <p>1 Core = 1000m (millicores). Usually generally recommended to treat 1 Core as 1 vCPU on cloud providers.</p>
                            </div>
                        </div>
                    </div>

                    {/* Memory Card */}
                    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 hover:border-indigo-500/30 transition-all duration-300 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-indigo-500/20"></div>

                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                                <HardDrive className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-semibold">Memory / RAM</h2>
                        </div>

                        <div className="space-y-6 relative z-10">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-2">Input (e.g., 512Mi, 1Gi)</label>
                                <input
                                    type="text"
                                    value={memoryInput}
                                    onChange={(e) => setMemoryInput(e.target.value)}
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 outline-none transition-all placeholder:text-slate-600"
                                    placeholder="Type Memory value..."
                                />
                            </div>

                            <div className="grid gap-3">
                                <ResultBox label="Gibibytes (Gi)" value={`${memGi.toFixed(2).replace(/\.00$/, '')}Gi`} onCopy={() => copyToClipboard(`${memGi.toFixed(2).replace(/\.00$/, '')}Gi`, 'mem-gi')} copied={copied === 'mem-gi'} />
                                <ResultBox label="Mebibytes (Mi)" value={`${memMi.toFixed(0)}Mi`} onCopy={() => copyToClipboard(`${memMi.toFixed(0)}Mi`, 'mem-mi')} copied={copied === 'mem-mi'} />
                                <ResultBox label="Bytes" value={`${memBytes}`} onCopy={() => copyToClipboard(`${memBytes}`, 'mem-bytes')} copied={copied === 'mem-bytes'} />
                            </div>

                            <div className="bg-slate-950/30 rounded-lg p-4 text-xs text-slate-500 flex gap-2">
                                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <p>OpenShift/K8s uses powers of 2 (Ki, Mi, Gi) by default. 1Gi = 1024Mi. 1G = 1000M.</p>
                            </div>
                        </div>

                    </div>

                </div>

            </div>
        </div>
    );
}

function ResultBox({ label, value, onCopy, copied }: { label: string, value: string, onCopy: () => void, copied: boolean }) {
    return (
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 transition-colors group/box">
            <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{label}</span>
                <div className="text-lg font-mono text-slate-200 mt-0.5">{value}</div>
            </div>
            <button
                onClick={onCopy}
                className="p-2 rounded-md hover:bg-slate-700 text-slate-400 hover:text-indigo-400 transition-all opacity-0 group-hover/box:opacity-100 focus:opacity-100"
                title="Copy value"
            >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
        </div>
    )
}
