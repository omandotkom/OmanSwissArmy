"use client";

import { useState } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";

export default function JwtDecoder() {
    const [token, setToken] = useState("");
    const [header, setHeader] = useState("");
    const [payload, setPayload] = useState("");
    const [error, setError] = useState<string | null>(null);

    const decodeJwt = (jwt: string) => {
        setError(null);
        if (!jwt) {
            setHeader("");
            setPayload("");
            return;
        }

        const parts = jwt.split(".");
        if (parts.length !== 3) {
            setError("Invalid JWT format. Must have 3 parts.");
            return;
        }

        try {
            const decode = (str: string) => {
                const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
                const jsonPayload = decodeURIComponent(
                    atob(base64)
                        .split("")
                        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                        .join("")
                );
                return JSON.stringify(JSON.parse(jsonPayload), null, 2);
            };

            setHeader(decode(parts[0]));
            setPayload(decode(parts[1]));
        } catch (e) {
            setError("Failed to decode JWT. Invalid Base64 or JSON.");
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">JWT Decoder</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row h-[80vh]">
                {/* Input */}
                <div className="flex flex-1 flex-col gap-4">
                    <h2 className="text-lg font-medium text-zinc-400">Encoded Token</h2>
                    <textarea
                        className="flex-1 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
                        placeholder="Paste your JWT here..."
                        value={token}
                        onChange={(e) => {
                            setToken(e.target.value);
                            decodeJwt(e.target.value);
                        }}
                    />
                    {error && <div className="text-red-400 text-sm">{error}</div>}
                </div>

                {/* Output */}
                <div className="flex flex-1 flex-col gap-4">
                    <div className="flex flex-1 flex-col gap-2">
                        <h2 className="text-lg font-medium text-zinc-400">Header</h2>
                        <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                theme="vs-dark"
                                value={header}
                                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, padding: { top: 16 } }}
                            />
                        </div>
                    </div>
                    <div className="flex flex-[2] flex-col gap-2">
                        <h2 className="text-lg font-medium text-zinc-400">Payload</h2>
                        <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                theme="vs-dark"
                                value={payload}
                                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, padding: { top: 16 } }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
