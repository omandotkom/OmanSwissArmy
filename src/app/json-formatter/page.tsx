"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Editor, { OnMount } from "@monaco-editor/react";

export default function JsonFormatter() {
    const [jsonInput, setJsonInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const editorRef = useRef<any>(null);

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        editorRef.current = editor;
    };

    const handleFormat = () => {
        if (!jsonInput.trim()) {
            setError("Please enter some JSON to format.");
            return;
        }
        try {
            const parsed = JSON.parse(jsonInput);
            const formatted = JSON.stringify(parsed, null, 2);
            setJsonInput(formatted);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">JSON Formatter</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-grow flex-col gap-4">
                <div className="relative h-[75vh] w-full overflow-hidden rounded-xl border border-zinc-800 shadow-sm bg-zinc-900">
                    <Editor
                        height="100%"
                        defaultLanguage="json"
                        theme="vs-dark"
                        value={jsonInput}
                        onChange={(value) => {
                            setJsonInput(value || "");
                            if (error) setError(null);
                        }}
                        onMount={handleEditorDidMount}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            formatOnPaste: true,
                            formatOnType: true,
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            padding: { top: 16, bottom: 16 },
                        }}
                    />
                </div>

                {error && (
                    <div className="rounded-xl bg-red-900/20 p-4 text-red-200 border border-red-900/50">
                        <p className="font-medium mb-1">Error:</p>
                        <p className="font-mono text-sm opacity-90">{error}</p>
                    </div>
                )}

                <button
                    onClick={handleFormat}
                    className="w-full rounded-xl bg-zinc-100 py-3 text-lg font-medium text-zinc-900 shadow-sm transition-all hover:bg-white hover:shadow-md active:scale-[0.99]"
                >
                    Format JSON
                </button>
            </div>
        </div>
    );
}
