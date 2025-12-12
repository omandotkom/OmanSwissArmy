"use client";

import Link from "next/link";
import { ArrowLeft, Database, CheckCircle, Settings } from "lucide-react";

export default function OracleObjectValidatorPage() {
    const features = [
        {
            href: "/oracle-object-validator/env-checker",
            title: "Object DB Env Checker",
            description: "Compare Oracle DB objects across different environments. Easily compare and compile objects, with features for Excel reporting and whitespace-agnostic validation.",
            icon: <CheckCircle className="h-6 w-6 text-emerald-400" />,
        },
        // Future features can be added here
    ];

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="group flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                            Back
                        </Link>
                        <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-100">
                            <Database className="h-6 w-6 text-blue-500" />
                            Oracle Object DB Validator
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Connection Manager Button could go here or inside the specific feature */}
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl flex-1 p-6">
                <div className="mb-8 max-w-3xl">
                    <h2 className="text-3xl font-light text-zinc-100">Select a Validator Tool</h2>
                    <p className="mt-2 text-zinc-400">
                        Choose a tool to validate and compare your Oracle Database objects.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature) => (
                        <Link key={feature.title} href={feature.href} className="group relative block h-full">
                            <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-900 hover:shadow-xl hover:shadow-blue-500/10 active:scale-[0.98]">
                                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-inset ring-zinc-700 transition-colors group-hover:bg-zinc-800/80 group-hover:text-blue-400">
                                    {feature.icon}
                                </div>

                                <h3 className="mb-2 text-lg font-semibold text-zinc-100 transition-colors group-hover:text-blue-400">
                                    {feature.title}
                                </h3>

                                <p className="text-sm leading-relaxed text-zinc-400">
                                    {feature.description}
                                </p>

                                <div className="absolute right-6 top-6 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                    <ArrowLeft className="h-5 w-5 rotate-180 text-zinc-500" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </main>
        </div>
    );
}
