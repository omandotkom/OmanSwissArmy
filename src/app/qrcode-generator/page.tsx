"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function QrCodeGenerator() {
    const [text, setText] = useState("");
    const [qrUrl, setQrUrl] = useState("");

    const generate = () => {
        if (!text) {
            setQrUrl("");
            return;
        }
        // Using a reliable public API for QR codes (Zero Dependency)
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
        setQrUrl(url);
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">QR Code Generator</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full items-center">

                <div className="w-full flex flex-col gap-4 p-6 rounded-xl bg-zinc-900 border border-zinc-800">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Content (URL or Text)</label>
                        <input
                            type="text"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && generate()}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="https://example.com"
                        />
                    </div>
                    <button
                        onClick={generate}
                        className="w-full py-3 rounded-lg bg-zinc-100 font-bold text-zinc-900 hover:bg-white transition-all"
                    >
                        Generate QR Code
                    </button>
                </div>

                {qrUrl && (
                    <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-white border border-zinc-800">
                        <Image src={qrUrl} alt="QR Code" width={300} height={300} />
                        <a
                            href={qrUrl}
                            download="qrcode.png"
                            target="_blank"
                            className="text-sm text-zinc-900 font-medium hover:underline"
                        >
                            Download / Open Image
                        </a>
                    </div>
                )}

            </div>
        </div>
    );
}
