"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function ChmodCalculator() {
    const [permissions, setPermissions] = useState({
        owner: { read: true, write: true, execute: true },
        group: { read: true, write: false, execute: true },
        public: { read: true, write: false, execute: true },
    });
    const [octal, setOctal] = useState("755");
    const [symbolic, setSymbolic] = useState("-rwxr-xr-x");

    useEffect(() => {
        calculate();
    }, [permissions]);

    const calculate = () => {
        const getVal = (p: any) => (p.read ? 4 : 0) + (p.write ? 2 : 0) + (p.execute ? 1 : 0);
        const o = getVal(permissions.owner);
        const g = getVal(permissions.group);
        const p = getVal(permissions.public);

        setOctal(`${o}${g}${p}`);

        const getSym = (p: any) => `${p.read ? "r" : "-"}${p.write ? "w" : "-"}${p.execute ? "x" : "-"}`;
        setSymbolic(`-${getSym(permissions.owner)}${getSym(permissions.group)}${getSym(permissions.public)}`);
    };

    const toggle = (role: "owner" | "group" | "public", type: "read" | "write" | "execute") => {
        setPermissions(prev => ({
            ...prev,
            [role]: { ...prev[role], [type]: !prev[role][type] }
        }));
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Chmod Calculator</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-8 max-w-3xl mx-auto w-full">

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {(["owner", "group", "public"] as const).map((role) => (
                        <div key={role} className="flex flex-col gap-4 p-6 rounded-xl bg-zinc-900 border border-zinc-800">
                            <h2 className="text-lg font-bold capitalize text-zinc-300">{role}</h2>
                            <div className="flex flex-col gap-3">
                                {(["read", "write", "execute"] as const).map((type) => (
                                    <label key={type} className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={permissions[role][type]}
                                            onChange={() => toggle(role, type)}
                                            className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-zinc-900"
                                        />
                                        <span className="text-zinc-400 capitalize group-hover:text-zinc-200 transition-colors">{type}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Result */}
                <div className="flex flex-col gap-4 p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                    <div className="flex flex-col md:flex-row gap-8 justify-center items-center">
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Octal</span>
                            <span className="text-5xl font-mono font-bold text-blue-400">{octal}</span>
                        </div>
                        <div className="h-12 w-px bg-zinc-800 hidden md:block"></div>
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Symbolic</span>
                            <span className="text-3xl font-mono font-bold text-green-400">{symbolic}</span>
                        </div>
                    </div>

                    <div className="mt-4 p-4 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-center text-zinc-300">
                        chmod {octal} filename.txt
                    </div>
                </div>

            </div>
        </div>
    );
}
