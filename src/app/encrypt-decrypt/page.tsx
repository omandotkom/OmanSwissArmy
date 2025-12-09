"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Lock, Unlock, ShieldCheck } from "lucide-react";
import CryptoJS from "crypto-js";

type Algorithm = "AES" | "DES" | "TripleDES" | "Rabbit" | "RC4";

export default function EncryptDecryptPage() {
    const [input, setInput] = useState("");
    const [secretKey, setSecretKey] = useState("");
    const [output, setOutput] = useState("");
    const [algorithm, setAlgorithm] = useState<Algorithm>("AES");
    const [mode, setMode] = useState<"encrypt" | "decrypt">("encrypt");
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState("");

    const handleProcess = () => {
        setError("");
        if (!input) return;
        if (!secretKey) {
            setError("Please enter a secret key.");
            return;
        }

        try {
            let result = "";
            if (mode === "encrypt") {
                switch (algorithm) {
                    case "AES":
                        result = CryptoJS.AES.encrypt(input, secretKey).toString();
                        break;
                    case "DES":
                        result = CryptoJS.DES.encrypt(input, secretKey).toString();
                        break;
                    case "TripleDES":
                        result = CryptoJS.TripleDES.encrypt(input, secretKey).toString();
                        break;
                    case "Rabbit":
                        result = CryptoJS.Rabbit.encrypt(input, secretKey).toString();
                        break;
                    case "RC4":
                        result = CryptoJS.RC4.encrypt(input, secretKey).toString();
                        break;
                }
            } else {
                // Decrypt
                let bytes;
                switch (algorithm) {
                    case "AES":
                        bytes = CryptoJS.AES.decrypt(input, secretKey);
                        break;
                    case "DES":
                        bytes = CryptoJS.DES.decrypt(input, secretKey);
                        break;
                    case "TripleDES":
                        bytes = CryptoJS.TripleDES.decrypt(input, secretKey);
                        break;
                    case "Rabbit":
                        bytes = CryptoJS.Rabbit.decrypt(input, secretKey);
                        break;
                    case "RC4":
                        bytes = CryptoJS.RC4.decrypt(input, secretKey);
                        break;
                }
                if (bytes) {
                    result = bytes.toString(CryptoJS.enc.Utf8);
                }
                if (!result) {
                    setError("Decryption failed. Wrong key or invalid text.");
                }
            }
            setOutput(result);
        } catch (err) {
            setError("An error occurred during processing. Please check your input.");
            console.error(err);
        }
    };

    const copyToClipboard = () => {
        if (!output) return;
        navigator.clipboard.writeText(output);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
            <div className="container mx-auto max-w-5xl p-6">
                <div className="mb-8 flex items-center gap-4">
                    <Link
                        href="/"
                        className="rounded-full bg-zinc-900 p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                        <ArrowLeft className="h-6 w-6" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-indigo-500/10 rounded-xl">
                            <ShieldCheck className="h-8 w-8 text-indigo-500" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-light text-zinc-100">Encrypt / Decrypt</h1>
                            <p className="text-zinc-400 text-sm mt-1">
                                Securely encrypt and decrypt text using standard algorithms.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                    {/* Sidebar / Configuration */}
                    <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 h-fit space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-2">Algorithm</label>
                            <div className="grid grid-cols-1 gap-2">
                                {(["AES", "DES", "TripleDES", "Rabbit", "RC4"] as Algorithm[]).map((algo) => (
                                    <button
                                        key={algo}
                                        onClick={() => setAlgorithm(algo)}
                                        className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${algorithm === algo
                                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-lg shadow-indigo-900/20"
                                                : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                                            }`}
                                    >
                                        <span className="font-medium">{algo}</span>
                                        {algorithm === algo && <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-zinc-800">
                            <label className="block text-sm font-medium text-zinc-400 mb-2">Secret Key</label>
                            <input
                                type="text"
                                value={secretKey}
                                onChange={(e) => setSecretKey(e.target.value)}
                                placeholder="Enter your secret password"
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all placeholder:text-zinc-600"
                            />
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Mode Switcher */}
                        <div className="flex bg-zinc-900/50 p-1 rounded-xl border border-zinc-800">
                            <button
                                onClick={() => { setMode("encrypt"); setOutput(""); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === "encrypt"
                                        ? "bg-indigo-600 text-white shadow-lg"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                                    }`}
                            >
                                <Lock className="h-4 w-4" />
                                Encrypt
                            </button>
                            <button
                                onClick={() => { setMode("decrypt"); setOutput(""); }}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === "decrypt"
                                        ? "bg-emerald-600 text-white shadow-lg"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                                    }`}
                            >
                                <Unlock className="h-4 w-4" />
                                Decrypt
                            </button>
                        </div>

                        {/* Input Area */}
                        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden group focus-within:ring-1 focus-within:ring-zinc-700 transition-all">
                            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Input Text</span>
                            </div>
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={mode === "encrypt" ? "Type text to encrypt..." : "Paste ciphertext to decrypt..."}
                                className="w-full h-40 bg-zinc-950 p-4 font-mono text-sm text-zinc-300 resize-none focus:outline-none"
                            />
                        </div>

                        <button
                            onClick={handleProcess}
                            className={`w-full py-4 rounded-xl font-medium text-lg shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2 ${mode === "encrypt"
                                    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20"
                                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20"
                                }`}
                        >
                            {mode === "encrypt" ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                            {mode === "encrypt" ? "Encrypt Message" : "Decrypt Message"}
                        </button>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                {error}
                            </div>
                        )}

                        {/* Output Area */}
                        <div className={`bg-zinc-900 rounded-2xl border transition-all overflow-hidden ${output ? 'border-zinc-700 shadow-xl' : 'border-zinc-800 opacity-50'}`}>
                            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Result</span>
                                <button
                                    onClick={copyToClipboard}
                                    disabled={!output}
                                    className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                            <div className="p-4 min-h-[100px] bg-zinc-950 font-mono text-sm text-zinc-300 break-all">
                                {output || <span className="text-zinc-700 italic">Result will appear here...</span>}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
