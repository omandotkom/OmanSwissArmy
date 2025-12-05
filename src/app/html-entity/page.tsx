"use client";

import { useState } from "react";
import Link from "next/link";

export default function HtmlEntity() {
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");
    const [mode, setMode] = useState<"encode" | "decode">("encode");

    const handleConvert = (text: string, currentMode: "encode" | "decode") => {
        setInput(text);
        if (!text) {
            setOutput("");
            return;
        }

        if (currentMode === "encode") {
            setOutput(text.replace(/[\u00A0-\u9999<>\&]/g, (i) => '&#' + i.charCodeAt(0) + ';'));
        } else {
            const txt = document.createElement("textarea");
            txt.innerHTML = text;
            setOutput(txt.value);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">HTML Entity Encoder</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-6 h-[80vh]">

                <div className="flex justify-center">
                    <div className="flex items-center gap-4 rounded-lg bg-zinc-900/50 p-2 border border-zinc-800/50">
                        <button
                            onClick={() => { setMode("encode"); handleConvert(input, "encode"); }}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${mode === "encode" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                                }`}
                        >
                            Encode
                        </button>
                        <button
                            onClick={() => { setMode("decode"); handleConvert(input, "decode"); }}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${mode === "decode" ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                                }`}
                        >
                            Decode
                        </button>
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row gap-6 flex-1">
                    {/* Input */}
                    <div className="flex flex-1 flex-col gap-2">
                        <h2 className="text-lg font-medium text-zinc-400">Input</h2>
                        <textarea
                            className="flex-1 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
                            placeholder={mode === "encode" ? "Type text to encode..." : "Paste HTML entities to decode..."}
                            value={input}
                            onChange={(e) => handleConvert(e.target.value, mode)}
                        />
                    </div>

                    {/* Output */}
                    <div className="flex flex-1 flex-col gap-2">
                        <h2 className="text-lg font-medium text-zinc-400">Output</h2>
                        <textarea
                            readOnly
                            className="flex-1 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
                            placeholder="Result will appear here..."
                            value={output}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
