"use client";

import { useState } from "react";
import Link from "next/link";

const WORDS = [
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
    "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
    "magna", "aliqua", "ut", "enim", "ad", "minim", "veniam", "quis", "nostrud",
    "exercitation", "ullamco", "laboris", "nisi", "ut", "aliquip", "ex", "ea",
    "commodo", "consequat", "duis", "aute", "irure", "dolor", "in", "reprehenderit",
    "in", "voluptate", "velit", "esse", "cillum", "dolore", "eu", "fugiat", "nulla",
    "pariatur", "excepteur", "sint", "occaecat", "cupidatat", "non", "proident",
    "sunt", "in", "culpa", "qui", "officia", "deserunt", "mollit", "anim", "id",
    "est", "laborum"
];

export default function LoremIpsum() {
    const [count, setCount] = useState(5);
    const [type, setType] = useState<"paragraphs" | "sentences" | "words">("paragraphs");
    const [text, setText] = useState("");

    const generate = () => {
        let result = [];

        if (type === "words") {
            for (let i = 0; i < count; i++) {
                result.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
            }
            setText(result.join(" "));
        } else if (type === "sentences") {
            for (let i = 0; i < count; i++) {
                const sentenceLength = Math.floor(Math.random() * 10) + 5;
                let sentence = [];
                for (let j = 0; j < sentenceLength; j++) {
                    sentence.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
                }
                // Capitalize first letter and add period
                let s = sentence.join(" ");
                s = s.charAt(0).toUpperCase() + s.slice(1) + ".";
                result.push(s);
            }
            setText(result.join(" "));
        } else {
            // Paragraphs
            for (let i = 0; i < count; i++) {
                const numSentences = Math.floor(Math.random() * 5) + 3;
                let paragraph = [];
                for (let k = 0; k < numSentences; k++) {
                    const sentenceLength = Math.floor(Math.random() * 10) + 5;
                    let sentence = [];
                    for (let j = 0; j < sentenceLength; j++) {
                        sentence.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
                    }
                    let s = sentence.join(" ");
                    s = s.charAt(0).toUpperCase() + s.slice(1) + ".";
                    paragraph.push(s);
                }
                result.push(paragraph.join(" "));
            }
            setText(result.join("\n\n"));
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(text);
        alert("Copied!");
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Lorem Ipsum Generator</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">

                <div className="flex flex-col md:flex-row gap-4 p-6 rounded-xl bg-zinc-900 border border-zinc-800 items-end">
                    <div className="flex-1 flex flex-col gap-2 w-full">
                        <label className="text-sm font-medium text-zinc-400">Count</label>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={count}
                            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                        />
                    </div>

                    <div className="flex-1 flex flex-col gap-2 w-full">
                        <label className="text-sm font-medium text-zinc-400">Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as any)}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                        >
                            <option value="paragraphs">Paragraphs</option>
                            <option value="sentences">Sentences</option>
                            <option value="words">Words</option>
                        </select>
                    </div>

                    <button
                        onClick={generate}
                        className="px-8 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-bold hover:bg-white transition-all w-full md:w-auto"
                    >
                        Generate
                    </button>
                </div>

                {text && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium text-zinc-400">Result</h2>
                            <button
                                onClick={copyToClipboard}
                                className="text-xs text-blue-400 hover:text-blue-300"
                            >
                                Copy Text
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={text}
                            className="h-[400px] w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-6 font-serif text-lg leading-relaxed text-zinc-300 focus:outline-none focus:border-zinc-600"
                        />
                    </div>
                )}

            </div>
        </div>
    );
}
