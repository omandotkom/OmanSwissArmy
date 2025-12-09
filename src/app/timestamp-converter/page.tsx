"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

export default function TimestampConverter() {
    const [now, setNow] = useState(0);
    const [timestamp, setTimestamp] = useState<string>("");
    const [dateStr, setDateStr] = useState<string>("");
    const [format, setFormat] = useState<"seconds" | "milliseconds">("seconds");

    const handleTimestampChange = useCallback((val: string, fmt = format) => {
        setTimestamp(val);
        const ts = parseInt(val);
        if (!isNaN(ts)) {
            const date = new Date(fmt === "seconds" ? ts * 1000 : ts);
            const iso = date.toISOString().slice(0, 19);
            setDateStr(iso);
        } else {
            setDateStr("");
        }
    }, [format]);

    const handleDateChange = useCallback((val: string) => {
        setDateStr(val);
        const date = new Date(val);
        if (!isNaN(date.getTime())) {
            const ts = format === "seconds" ? Math.floor(date.getTime() / 1000) : date.getTime();
            setTimestamp(ts.toString());
        } else {
            setTimestamp("");
        }
    }, [format]);

    useEffect(() => {
        const initialNow = Math.floor(Date.now() / 1000);
        setNow(initialNow);
        
        const initialTs = initialNow.toString();
        setTimestamp(initialTs);
        const date = new Date(initialNow * 1000);
        const iso = date.toISOString().slice(0, 19);
        setDateStr(iso);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Math.floor(Date.now() / 1000));
        }, 1000);
        
        return () => clearInterval(interval);
    }, []);

    const toggleFormat = () => {
        const newFormat = format === "seconds" ? "milliseconds" : "seconds";
        setFormat(newFormat);
        if (dateStr) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                const ts = newFormat === "seconds" ? Math.floor(date.getTime() / 1000) : date.getTime();
                setTimestamp(ts.toString());
            }
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Unix Timestamp Converter</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">

                {/* Current Time */}
                <div className="flex flex-col items-center justify-center p-6 rounded-xl bg-zinc-900 border border-zinc-800">
                    <span className="text-zinc-400 text-sm mb-2">Current Unix Timestamp</span>
                    <span className="text-4xl font-mono font-bold text-blue-400">{now}</span>
                </div>

                <div className="flex flex-col gap-6 p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                    {/* Format Toggle */}
                    <div className="flex justify-end">
                        <button
                            onClick={toggleFormat}
                            className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                        >
                            Switch to {format === "seconds" ? "Milliseconds" : "Seconds"}
                        </button>
                    </div>

                    {/* Timestamp Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Unix Timestamp ({format})</label>
                        <input
                            type="number"
                            value={timestamp}
                            onChange={(e) => handleTimestampChange(e.target.value)}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder={`e.g. ${now}`}
                        />
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center text-zinc-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                    </div>

                    {/* Date Input */}
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Date & Time (ISO 8601)</label>
                        <input
                            type="text"
                            value={dateStr}
                            onChange={(e) => handleDateChange(e.target.value)}
                            className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-4 py-3 font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="YYYY-MM-DDTHH:mm:ss"
                        />
                        <div className="text-xs text-zinc-500 text-right">
                            {dateStr ? new Date(dateStr).toUTCString() : "Invalid Date"}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
