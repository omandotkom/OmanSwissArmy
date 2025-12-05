"use client";

import { useState } from "react";
import Link from "next/link";

export default function StringCounter() {
    const [text, setText] = useState("");

    const stats = {
        characters: text.length,
        charactersNoSpaces: text.replace(/\s/g, "").length,
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        lines: text ? text.split(/\n/).length : 0,
        paragraphs: text.trim() ? text.split(/\n\s*\n/).filter(p => p.trim()).length : 0
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">String Length Counter</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full h-[80vh]">

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-blue-400">{stats.characters}</span>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Characters</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-green-400">{stats.words}</span>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Words</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-purple-400">{stats.lines}</span>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Lines</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-yellow-400">{stats.paragraphs}</span>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Paragraphs</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-pink-400">{stats.charactersNoSpaces}</span>
                        <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1 text-center">Chars (No Space)</span>
                    </div>
                </div>

                {/* Input */}
                <div className="flex flex-1 flex-col gap-2 min-h-0">
                    <h2 className="text-sm font-medium text-zinc-400">Input Text</h2>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="flex-1 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-6 font-mono text-base text-zinc-300 focus:outline-none focus:border-zinc-600"
                        placeholder="Type or paste your text here..."
                    />
                </div>

            </div>
        </div>
    );
}
