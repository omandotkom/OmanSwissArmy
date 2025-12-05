"use client";

import { useState } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";

// Simple diff implementation since npm install failed
const simpleDiff = (text1: string, text2: string) => {
    const lines1 = text1.split("\n");
    const lines2 = text2.split("\n");
    const result = [];

    let i = 0, j = 0;

    while (i < lines1.length || j < lines2.length) {
        if (i < lines1.length && j < lines2.length && lines1[i] === lines2[j]) {
            result.push({ value: lines1[i] + "\n", added: false, removed: false });
            i++;
            j++;
        } else {
            if (i < lines1.length) {
                result.push({ value: lines1[i] + "\n", added: false, removed: true });
                i++;
            }
            if (j < lines2.length) {
                result.push({ value: lines2[j] + "\n", added: true, removed: false });
                j++;
            }
        }
    }
    return result;
};

export default function DiffChecker() {
    const [original, setOriginal] = useState("");
    const [modified, setModified] = useState("");
    const [diffResult, setDiffResult] = useState<any[]>([]);

    const handleCompare = () => {
        const diff = simpleDiff(original, modified);
        setDiffResult(diff);
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Diff Checker</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-6 h-[85vh]">

                <div className="flex flex-1 gap-4 min-h-0">
                    {/* Original */}
                    <div className="flex flex-1 flex-col gap-2">
                        <h2 className="text-sm font-medium text-zinc-400">Original Text</h2>
                        <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                            <Editor
                                height="100%"
                                theme="vs-dark"
                                value={original}
                                onChange={(val) => setOriginal(val || "")}
                                options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 16 } }}
                            />
                        </div>
                    </div>

                    {/* Modified */}
                    <div className="flex flex-1 flex-col gap-2">
                        <h2 className="text-sm font-medium text-zinc-400">Modified Text</h2>
                        <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                            <Editor
                                height="100%"
                                theme="vs-dark"
                                value={modified}
                                onChange={(val) => setModified(val || "")}
                                options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 16 } }}
                            />
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleCompare}
                    className="w-full py-3 rounded-lg bg-zinc-100 font-bold text-zinc-900 transition-all hover:bg-white"
                >
                    Compare Differences
                </button>

                {/* Result */}
                <div className="flex-1 flex flex-col gap-2 min-h-0">
                    <h2 className="text-sm font-medium text-zinc-400">Difference Result</h2>
                    <div className="flex-1 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm">
                        {diffResult.map((part, index) => (
                            <span
                                key={index}
                                className={`${part.added ? "bg-green-900/30 text-green-400" :
                                        part.removed ? "bg-red-900/30 text-red-400" :
                                            "text-zinc-400"
                                    }`}
                            >
                                {part.value}
                            </span>
                        ))}
                        {diffResult.length === 0 && <span className="text-zinc-600 italic">Click compare to see results...</span>}
                    </div>
                </div>

            </div>
        </div>
    );
}
