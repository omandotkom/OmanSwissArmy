"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, RotateCcw, Languages } from "lucide-react";
import { convertNumberToWords } from "@/lib/numberToWords";

export default function NumberToWordsPage() {
    const [inputNumber, setInputNumber] = useState<string>("");
    const [language, setLanguage] = useState<"id" | "en">("id");
    const [copied, setCopied] = useState(false);

    const result = useMemo(() => {
        if (!inputNumber) return "";
        try {
            const num = parseFloat(inputNumber);
            if (isNaN(num)) return "Invalid Number";

            const words = convertNumberToWords(num, language);

            // Format currency based on language
            let formattedCurrency = "";
            if (language === "id") {
                formattedCurrency = new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                }).format(num);
            } else {
                formattedCurrency = new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                }).format(num);
            }

            return `${words} - (${formattedCurrency})`;
        } catch (error) {
            return "Error converting number";
        }
    }, [inputNumber, language]);

    const handleCopy = () => {
        if (!result) return;
        navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleClear = () => {
        setInputNumber("");
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/50 px-6 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="flex items-center justify-center rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <h1 className="text-xl font-light tracking-wide text-zinc-200">
                        Number to Words
                    </h1>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center p-6 md:p-12">
                <div className="w-full max-w-3xl space-y-8">

                    {/* Controls Card */}
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:p-8 shadow-xl backdrop-blur-sm">
                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Input Area */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-zinc-400 ml-1">
                                    Enter Number
                                </label>
                                <div className="relative group">
                                    <input
                                        type="number"
                                        value={inputNumber}
                                        onChange={(e) => setInputNumber(e.target.value)}
                                        placeholder="e.g. 123456789"
                                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-lg text-zinc-100 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                    />
                                    {inputNumber && (
                                        <button
                                            onClick={handleClear}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-full transition-colors"
                                            title="Clear"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Language Selection */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-zinc-400 ml-1">
                                    Target Language
                                </label>
                                <div className="grid grid-cols-2 gap-3 p-1 bg-zinc-950/50 rounded-xl border border-zinc-800">
                                    <button
                                        onClick={() => setLanguage("id")}
                                        className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${language === "id"
                                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                                            }`}
                                    >
                                        <span className="text-lg">🇮🇩</span> Indonesia
                                    </button>
                                    <button
                                        onClick={() => setLanguage("en")}
                                        className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-all ${language === "en"
                                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                            : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                                            }`}
                                    >
                                        <span className="text-lg">🇺🇸</span> English
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Result Card */}
                    <div className="relative group rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 p-6 md:p-10 shadow-2xl min-h-[200px] flex flex-col justify-center items-center text-center transition-all hover:border-zinc-700">
                        {/* Background Text Overlay for decoration */}
                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none opacity-[0.03]">
                            <Languages className="w-64 h-64" />
                        </div>

                        {!result ? (
                            <div className="text-zinc-600 italic">
                                Result will appear here...
                            </div>
                        ) : (
                            <div className="relative z-10 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <p className="text-2xl md:text-3xl font-light leading-relaxed tracking-wide text-zinc-100">
                                    "{result}"
                                </p>
                            </div>
                        )}

                        {/* Copy Button */}
                        {result && (
                            <div className="absolute top-4 right-4 animate-in fade-in duration-300">
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-indigo-500 hover:text-white hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="h-3.5 w-3.5" />
                                            <span>Copied</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-3.5 w-3.5" />
                                            <span>Copy Text</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                </div>
            </main>
        </div>
    );
}
