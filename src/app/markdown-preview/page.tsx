"use client";

import { useState } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";

export default function MarkdownPreview() {
    const [markdown, setMarkdown] = useState("# Hello World\n\nWrite some **markdown** here!\n\n- Item 1\n- Item 2\n\n```js\nconsole.log('Code block');\n```");

    // Simple Regex-based Markdown Parser (Zero Dependency)
    const parseMarkdown = (text: string) => {
        const html = text
            // Escape HTML
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            // Code Blocks
            .replace(/```(\w*)([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            // Inline Code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Headers
            .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-bold mb-4">$1</h1>')
            .replace(/^## (.*$)/gm, '<h2 class="text-2xl font-bold mb-3">$1</h2>')
            .replace(/^### (.*$)/gm, '<h3 class="text-xl font-bold mb-2">$1</h3>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 hover:underline" target="_blank">$1</a>')
            // Unordered Lists
            .replace(/^\s*-\s+(.*)$/gm, '<li class="ml-4 list-disc">$1</li>')
            // Blockquotes
            .replace(/^\> (.*$)/gm, '<blockquote class="border-l-4 border-zinc-600 pl-4 italic my-2">$1</blockquote>')
            // Line breaks
            .replace(/\n/g, '<br />');

        return html;
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Markdown Previewer</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-[85vh]">

                {/* Editor */}
                <div className="flex flex-1 flex-col gap-2">
                    <h2 className="text-sm font-medium text-zinc-400">Markdown Input</h2>
                    <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                        <Editor
                            height="100%"
                            defaultLanguage="markdown"
                            theme="vs-dark"
                            value={markdown}
                            onChange={(val) => setMarkdown(val || "")}
                            options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 16 }, wordWrap: "on" }}
                        />
                    </div>
                </div>

                {/* Preview */}
                <div className="flex flex-1 flex-col gap-2">
                    <h2 className="text-sm font-medium text-zinc-400">Live Preview</h2>
                    <div
                        className="flex-1 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6 prose prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: parseMarkdown(markdown) }}
                    />
                </div>

            </div>
        </div>
    );
}
