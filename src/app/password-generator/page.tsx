"use client";

import { useState } from "react";
import Link from "next/link";

export default function PasswordGenerator() {
    const [password, setPassword] = useState("");
    const [length, setLength] = useState(16);
    const [options, setOptions] = useState({
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true
    });
    const [strength, setStrength] = useState("");

    const generate = () => {
        const charset = {
            uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            lowercase: "abcdefghijklmnopqrstuvwxyz",
            numbers: "0123456789",
            symbols: "!@#$%^&*()_+~`|}{[]:;?><,./-="
        };

        let chars = "";
        if (options.uppercase) chars += charset.uppercase;
        if (options.lowercase) chars += charset.lowercase;
        if (options.numbers) chars += charset.numbers;
        if (options.symbols) chars += charset.symbols;

        if (!chars) {
            setPassword("");
            setStrength("");
            return;
        }

        let pass = "";
        for (let i = 0; i < length; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setPassword(pass);
        calculateStrength(pass);
    };

    const calculateStrength = (pass: string) => {
        let score = 0;
        if (pass.length > 8) score++;
        if (pass.length > 12) score++;
        if (/[A-Z]/.test(pass)) score++;
        if (/[0-9]/.test(pass)) score++;
        if (/[^A-Za-z0-9]/.test(pass)) score++;

        if (score < 3) setStrength("Weak");
        else if (score < 5) setStrength("Medium");
        else setStrength("Strong");
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(password);
        alert("Copied!");
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Password Generator</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">

                {/* Result */}
                <div className="flex flex-col gap-2">
                    <div className="relative">
                        <input
                            type="text"
                            readOnly
                            value={password}
                            className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-6 py-4 text-2xl font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 text-center tracking-wider"
                            placeholder="Generator Result"
                        />
                        <button
                            onClick={copyToClipboard}
                            disabled={!password}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-0 transition-opacity"
                        >
                            COPY
                        </button>
                    </div>
                    {strength && (
                        <div className="flex justify-center">
                            <span className={`text-sm font-bold uppercase tracking-wider px-3 py-1 rounded-full ${strength === "Strong" ? "bg-green-900/50 text-green-400" :
                                    strength === "Medium" ? "bg-yellow-900/50 text-yellow-400" :
                                        "bg-red-900/50 text-red-400"
                                }`}>
                                {strength}
                            </span>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-6 p-6 rounded-xl bg-zinc-900 border border-zinc-800">

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between">
                            <label className="text-sm font-medium text-zinc-400">Length</label>
                            <span className="text-sm font-bold text-zinc-200">{length}</span>
                        </div>
                        <input
                            type="range"
                            min="6"
                            max="64"
                            value={length}
                            onChange={(e) => setLength(parseInt(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {(["uppercase", "lowercase", "numbers", "symbols"] as const).map((opt) => (
                            <label key={opt} className="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={options[opt]}
                                    onChange={() => setOptions(prev => ({ ...prev, [opt]: !prev[opt] }))}
                                    className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
                                />
                                <span className="text-zinc-400 capitalize group-hover:text-zinc-200 transition-colors">{opt}</span>
                            </label>
                        ))}
                    </div>

                    <button
                        onClick={generate}
                        className="w-full py-3 rounded-lg bg-blue-600 font-bold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                    >
                        Generate Password
                    </button>
                </div>

            </div>
        </div>
    );
}
