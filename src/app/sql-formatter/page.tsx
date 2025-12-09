"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Fallback formatter since npm install failed
const formatSql = (sql: string) => {
    let formatted = sql
        .replace(/\s+/g, " ")
        .trim();

    const keywords = [
        "SELECT", "FROM", "WHERE", "AND", "OR", "ORDER BY", "GROUP BY",
        "HAVING", "LIMIT", "INSERT INTO", "UPDATE", "DELETE FROM",
        "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN", "JOIN",
        "UNION", "VALUES", "SET", "CREATE TABLE", "DROP TABLE", "ALTER TABLE",
        "ON"
    ];

    // Add newlines before keywords
    keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, "gi");
        formatted = formatted.replace(regex, (match) => `\n${match.toUpperCase()}`);
    });

    // Handle commas and parentheses for basic structure
    formatted = formatted
        .replace(/\s*,\s*/g, ",\n")
        .replace(/\(\s*/g, " (\n")
        .replace(/\s*\)/g, "\n)");

    // Apply indentation
    const lines = formatted.split("\n");
    let indentLevel = 0;
    const indent = "  ";

    return lines.map(line => {
        line = line.trim();
        if (!line) return "";

        // Decrease indent for closing parenthesis
        if (line.startsWith(")")) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        const currentIndent = indent.repeat(indentLevel);
        const result = currentIndent + line;

        // Increase indent for opening parenthesis
        if (line.endsWith("(")) {
            indentLevel++;
        }

        return result;
    }).join("\n");
};

export default function SqlFormatter() {
    const [sqlInput, setSqlInput] = useState("");
    const [error, setError] = useState<string | null>(null);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

    const handleEditorDidMount: OnMount = (editor) => {
        editorRef.current = editor;
    };

    const handleFormat = () => {
        if (!sqlInput.trim()) {
            setError("Please enter some SQL to format.");
            return;
        }
        try {
            // Use the fallback formatter
            const formatted = formatSql(sqlInput);
            setSqlInput(formatted);
            setError(null);
        } catch (err) {
            const error = err as Error;
            setError(error.message);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">SQL Formatter</h1>
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
                        defaultLanguage="sql"
                        theme="vs-dark"
                        value={sqlInput}
                        onChange={(value) => {
                            setSqlInput(value || "");
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
                    Format SQL
                </button>
            </div>
        </div>
    );
}
