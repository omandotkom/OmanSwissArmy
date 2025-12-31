
"use client";

import { useState, useEffect } from "react";
import { RefreshCcw, AlertTriangle, CheckCircle, ExternalLink, XCircle, Download } from "lucide-react";
import Link from "next/link";

interface UpdateCheckerProps {
    currentVersion: string;
}

export default function UpdateChecker({ currentVersion }: UpdateCheckerProps) {
    const [status, setStatus] = useState<'checking' | 'available' | 'uptodate' | 'failed'>('checking');
    const [latestVersion, setLatestVersion] = useState<string>('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        checkUpdate();
    }, []);

    const checkUpdate = async () => {
        setStatus('checking');
        try {
            // Fetch latest release dari GitHub API public
            const res = await fetch('https://api.github.com/repos/omandotkom/OmanSwissArmy/releases/latest');

            if (!res.ok) {
                // Rate limit atau repo not found
                throw new Error(`GitHub API Error: ${res.status}`);
            }

            const data = await res.json();
            const remoteVersionTag = data.tag_name || ''; // misal "v1.5.0" atau "1.5.0"

            // Bersihkan 'v' prefix jika ada untuk komparasi
            const cleanRemote = remoteVersionTag.replace(/^v/, '');
            const cleanCurrent = currentVersion.replace(/^v/, '');

            setLatestVersion(cleanRemote);

            if (cleanRemote && cleanRemote !== cleanCurrent) {
                // Sederhana: jika string beda, berarti update (asumsi selalu naik ke atas)
                // Kalau mau complex semver compare bisa, tapi ini cukup untuk sekarang.
                // Masalah: kalau current lebih tinggi (dev version) dia bakal dikira update avail. 
                // Kita anggap repo selalu source of truth production. 

                // Cek primitive semver compare
                if (isNewer(cleanRemote, cleanCurrent)) {
                    setStatus('available');
                } else {
                    setStatus('uptodate');
                }
            } else {
                setStatus('uptodate');
            }

        } catch (error) {
            console.error("Failed to check update:", error);
            setStatus('failed');
            setErrorMsg("Could not reach GitHub server.");
        }
    };

    // Helper semver sederhana
    const isNewer = (remote: string, current: string) => {
        const rParts = remote.split('.').map(Number);
        const cParts = current.split('.').map(Number);

        for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
            const r = rParts[i] || 0;
            const c = cParts[i] || 0;
            if (r > c) return true;
            if (r < c) return false;
        }
        return false;
    };

    return (
        <div className="flex flex-col items-center justify-center p-8 text-center h-full">
            {status === 'checking' && (
                <div className="flex flex-col items-center animate-pulse text-zinc-500">
                    <RefreshCcw className="w-12 h-12 mb-4 animate-spin" />
                    <p>Checking for updates...</p>
                </div>
            )}

            {status === 'uptodate' && (
                <div className="flex flex-col items-center text-zinc-400">
                    <CheckCircle className="w-16 h-16 mb-4 text-green-500" />
                    <h2 className="text-xl font-medium text-zinc-200 mb-2">You are up to date!</h2>
                    <p className="text-sm">Current version: <span className="font-mono text-zinc-300">v{currentVersion}</span></p>
                    <button
                        onClick={checkUpdate}
                        className="mt-6 text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                        Check Again
                    </button>
                </div>
            )}

            {status === 'failed' && (
                <div className="flex flex-col items-center text-zinc-500">
                    <XCircle className="w-16 h-16 mb-4 text-zinc-700" />
                    <h2 className="text-lg font-medium text-zinc-400 mb-2">Failed to check updates</h2>
                    <p className="text-xs">{errorMsg}</p>
                    <button
                        onClick={checkUpdate}
                        className="mt-6 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors text-zinc-300"
                    >
                        Try Again
                    </button>
                </div>
            )}

            {status === 'available' && (
                <div className="w-full max-w-lg bg-orange-950/20 border border-orange-500/30 rounded-xl p-6 text-left">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-orange-500/10 rounded-full shrink-0">
                            <Download className="w-6 h-6 text-orange-500" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-orange-400 mb-1">Update Available</h3>
                            <div className="text-sm text-zinc-300 space-y-1 mb-4">
                                <p>Your version: <span className="font-mono text-zinc-400">v{currentVersion}</span></p>
                                <p>New version: <span className="font-mono text-orange-300 font-bold">v{latestVersion}</span></p>
                            </div>

                            <div className="p-3 bg-black/40 rounded border border-orange-500/10 text-xs font-mono text-zinc-400 mb-4">
                                To Update, open your <span className="text-orange-300">Oman Swiss Army Runner Tool</span> &rarr; Update
                            </div>

                            <Link
                                href="https://github.com/omandotkom/OmanSwissArmy/releases"
                                target="_blank"
                                className="inline-flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 hover:underline"
                            >
                                Build Changelogs <ExternalLink className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
