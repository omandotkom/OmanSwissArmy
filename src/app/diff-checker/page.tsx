"use client";

import { useState } from "react";
import Link from "next/link";
import { DiffEditor, Editor } from "@monaco-editor/react";

const ArrowLeft = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
)
const Split = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="12" x2="12" y1="3" y2="21" /></svg>
)
const Columns = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><path d="M12 3v18" /></svg>
)
const Code2 = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" /></svg>
)
const Play = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="5 3 19 12 5 21 5 3" /></svg>
)
const Edit3 = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
)

const LANGUAGES = [
    { id: "plaintext", label: "Plain Text" },
    { id: "json", label: "JSON" },
    { id: "javascript", label: "JavaScript" },
    { id: "typescript", label: "TypeScript" },
    { id: "html", label: "HTML" },
    { id: "css", label: "CSS" },
    { id: "sql", label: "SQL" },
    { id: "xml", label: "XML" },
];

export default function DiffChecker() {
    const [original, setOriginal] = useState("");
    const [modified, setModified] = useState("");
    const [isDiffMode, setIsDiffMode] = useState(false);
    const [language, setLanguage] = useState("plaintext");
    const [inlineDiff, setInlineDiff] = useState(false);

    return (
        <div className="flex h-screen flex-col bg-zinc-950 font-sans text-zinc-100 overflow-hidden">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-900 bg-zinc-950/50 px-6 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="flex items-center justify-center rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <h1 className="text-xl font-light tracking-wide text-zinc-200">Diff Checker</h1>

                    <div className="hidden h-6 w-px bg-zinc-800 md:block" />

                    <div className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-zinc-500" />
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            className="bg-transparent text-sm font-medium text-zinc-400 outline-none transition-colors hover:text-zinc-200"
                        >
                            {LANGUAGES.map((lang) => (
                                <option key={lang.id} value={lang.id} className="bg-zinc-900">
                                    {lang.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {isDiffMode ? (
                        <>
                            <button
                                onClick={() => setInlineDiff(!inlineDiff)}
                                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white"
                                title={inlineDiff ? "Switch to Split View" : "Switch to Inline View"}
                            >
                                {inlineDiff ? <Columns className="h-4 w-4" /> : <Split className="h-4 w-4" />}
                                <span className="hidden sm:inline">{inlineDiff ? "Split View" : "Inline View"}</span>
                            </button>
                            <button
                                onClick={() => setIsDiffMode(false)}
                                className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-400 transition-all hover:bg-indigo-500/20 hover:text-indigo-300"
                            >
                                <Edit3 className="h-4 w-4" />
                                <span>Edit Text</span>
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setIsDiffMode(true)}
                            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 active:scale-95"
                        >
                            <Play className="h-4 w-4 fill-current" />
                            <span>Compare</span>
                        </button>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden relative">
                {isDiffMode ? (
                    <div className="h-full w-full opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]">
                        <DiffEditor
                            height="100%"
                            theme="vs-dark"
                            original={original}
                            modified={modified}
                            language={language}
                            options={{
                                renderSideBySide: !inlineDiff,
                                enableSplitViewResizing: true,
                                fontSize: 14,
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                readOnly: true,
                            }}
                        />
                    </div>
                ) : (
                    <div className="flex h-full flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-zinc-900">
                        {/* Original Editor */}
                        <div className="flex flex-1 flex-col overflow-hidden opacity-0 animate-[fadeIn_0.3s_ease-out_forwards]">
                            <div className="flex items-center justify-between bg-zinc-950 px-4 py-2 border-b border-zinc-900">
                                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Original</span>
                                <div className="text-xs text-zinc-600">Paste your code here</div>
                            </div>
                            <Editor
                                height="100%"
                                theme="vs-dark"
                                language={language}
                                value={original}
                                onChange={(val) => setOriginal(val || "")}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    padding: { top: 16 },
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                }}
                            />
                        </div>

                        {/* Modified Editor */}
                        <div className="flex flex-1 flex-col overflow-hidden opacity-0 animate-[fadeIn_0.3s_delay-75ms_ease-out_forwards]">
                            <div className="flex items-center justify-between bg-zinc-950 px-4 py-2 border-b border-zinc-900">
                                <span className="text-xs font-medium uppercase tracking-wider text-indigo-400">Modified</span>
                                <div className="text-xs text-zinc-600">Paste new version here</div>
                            </div>
                            <Editor
                                height="100%"
                                theme="vs-dark"
                                language={language}
                                value={modified}
                                onChange={(val) => setModified(val || "")}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    padding: { top: 16 },
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                }}
                            />
                        </div>
                    </div>
                )}
            </main>

            {/* Keyframes for animation */}
            <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
}
