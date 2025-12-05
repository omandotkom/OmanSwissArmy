"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CronGenerator() {
    const [cron, setCron] = useState("* * * * *");
    const [schedule, setSchedule] = useState({
        minute: "*",
        hour: "*",
        day: "*",
        month: "*",
        week: "*"
    });

    useEffect(() => {
        setCron(`${schedule.minute} ${schedule.hour} ${schedule.day} ${schedule.month} ${schedule.week}`);
    }, [schedule]);

    const handleChange = (field: keyof typeof schedule, value: string) => {
        setSchedule(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Cron Expression Generator</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col gap-8 max-w-3xl mx-auto w-full">

                {/* Result */}
                <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-zinc-900 border border-zinc-800">
                    <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Cron Expression</span>
                    <div className="text-5xl font-mono font-bold text-blue-400 tracking-wider">{cron}</div>
                    <div className="text-zinc-400 text-sm mt-2">
                        minute hour day(month) month day(week)
                    </div>
                </div>

                {/* Controls */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    {[
                        { label: "Minute", field: "minute", options: ["*", "*/5", "*/15", "*/30", "0", "30"] },
                        { label: "Hour", field: "hour", options: ["*", "*/2", "*/4", "0", "12", "9-17"] },
                        { label: "Day", field: "day", options: ["*", "1", "15", "1,15", "L"] },
                        { label: "Month", field: "month", options: ["*", "*/3", "1", "6", "12"] },
                        { label: "Week", field: "week", options: ["*", "0", "1-5", "6,0"] },
                    ].map((item) => (
                        <div key={item.field} className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-zinc-400">{item.label}</label>
                            <input
                                type="text"
                                value={schedule[item.field as keyof typeof schedule]}
                                onChange={(e) => handleChange(item.field as keyof typeof schedule, e.target.value)}
                                className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600 font-mono text-center"
                            />
                            <div className="flex flex-wrap gap-1 justify-center">
                                {item.options.map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => handleChange(item.field as keyof typeof schedule, opt)}
                                        className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
