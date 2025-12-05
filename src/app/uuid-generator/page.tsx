"use client";

import { useState } from "react";
import Link from "next/link";

export default function UuidGenerator() {
    const [count, setCount] = useState(1);
    const [uuids, setUuids] = useState<string[]>([]);

    const generate = () => {
        const newUuids = Array.from({ length: count }, () => crypto.randomUUID());
        setUuids(newUuids);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(uuids.join("\n"));
        alert("Copied to clipboard!");
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">UUID Generator</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">

                <div className="flex items-end gap-4 rounded-xl bg-zinc-900 p-6 border border-zinc-800">
                    <div className="flex-1 flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">How many UUIDs?</label>
                        <input
                            type="number"
                            min="1"
                            max="1000"
                            value={count}
                            onChange={(e) => setCount(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 text-zinc-200 focus:outline-none focus:border-zinc-600"
                        />
                    </div>
                    <button
                        onClick={generate}
                        className="h-[50px] px-8 rounded-lg bg-zinc-100 font-bold text-zinc-900 transition-all hover:bg-white hover:scale-105 active:scale-95"
                    >
                        Generate
                    </button>
                </div>

                {uuids.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-medium text-zinc-400">Result ({uuids.length})</h2>
                            <button
                                onClick={copyToClipboard}
                                className="text-sm text-blue-400 hover:text-blue-300"
                            >
                                Copy All
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={uuids.join("\n")}
                            className="h-[500px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
