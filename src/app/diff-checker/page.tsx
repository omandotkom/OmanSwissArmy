"use client";

import { useState, useRef, useCallback } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { DiffEditor } from "@monaco-editor/react";

const ArrowLeft = (props: SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
)
const Split = (props: SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="12" x2="12" y1="3" y2="21" /></svg>
)
const Columns = (props: SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><path d="M12 3v18" /></svg>
)
const Code2 = (props: SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" /></svg>
)
const Search = (props: SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
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
    // Initialize with some default text to show usage
    const [original, setOriginal] = useState("");
    const [modified, setModified] = useState("");
    const [language, setLanguage] = useState("plaintext");
    const [inlineDiff, setInlineDiff] = useState(false);

    // Using refs to prevent state update loops if necessary, 
    // but simply updating state on content change is usually fine with Monaco.
    const diffEditorRef = useRef<any>(null);

    const handleDiffEditorDidMount = useCallback((editor: any) => {
        diffEditorRef.current = editor;

        // Make sure we capture edits from both sides to keep our state in sync
        const originalEditor = editor.getOriginalEditor();
        const modifiedEditor = editor.getModifiedEditor();

        originalEditor.onDidChangeModelContent(() => {
            setOriginal(originalEditor.getValue());
        });

        modifiedEditor.onDidChangeModelContent(() => {
            setModified(modifiedEditor.getValue());
        });
    }, []);

    const triggerFind = useCallback((isOriginal: boolean) => {
        if (!diffEditorRef.current) return;
        const editor = isOriginal
            ? diffEditorRef.current.getOriginalEditor()
            : diffEditorRef.current.getModifiedEditor();

        if (editor) {
            editor.focus();
            editor.trigger("source", "actions.find");
        }
    }, []);

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
                    <button
                        onClick={() => setInlineDiff(!inlineDiff)}
                        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white"
                        title={inlineDiff ? "Switch to Split View" : "Switch to Inline View"}
                    >
                        {inlineDiff ? <Columns className="h-4 w-4" /> : <Split className="h-4 w-4" />}
                        <span className="hidden sm:inline">{inlineDiff ? "Split View" : "Inline View"}</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden relative flex flex-col">
                <div className="flex items-center justify-between bg-zinc-950 border-b border-zinc-900 shrink-0">
                    <div className="flex w-full">
                        <div className="flex-1 flex items-center justify-between px-4 py-2 border-r border-zinc-900">
                            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Original</span>
                            <button
                                onClick={() => triggerFind(true)}
                                className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                                title="Find in Original (Ctrl+F)"
                            >
                                <Search className="h-4 w-4" />
                            </button>
                        </div>
                        {!inlineDiff && (
                            <div className="flex-1 flex items-center justify-between px-4 py-2">
                                <span className="text-xs font-medium uppercase tracking-wider text-indigo-400">Modified</span>
                                <button
                                    onClick={() => triggerFind(false)}
                                    className="p-1 rounded hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 transition-colors"
                                    title="Find in Modified (Ctrl+F)"
                                >
                                    <Search className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 w-full bg-[#1e1e1e]">
                    <DiffEditor
                        height="100%"
                        theme="vs-dark"
                        original={original}
                        modified={modified}
                        language={language}
                        onMount={handleDiffEditorDidMount}
                        options={{
                            renderSideBySide: !inlineDiff,
                            enableSplitViewResizing: true,
                            fontSize: 14,
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            readOnly: false,
                            originalEditable: true,
                        }}
                    />
                </div>
            </main>
        </div>
    );
}
