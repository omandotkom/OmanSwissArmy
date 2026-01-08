"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";
import { trackActivity } from "@/lib/tracker";
import { Loader2, Link as LinkIcon, Upload, FileUp, Download, ArrowLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useToast, ToastContainer } from "@/components/ui/toast";

export default function MarkdownPreview() {
    const { toasts, addToast, removeToast } = useToast();
    const [markdown, setMarkdown] = useState("# Hello World\n\nWrite some **markdown** here!\n\n- Item 1\n- Item 2\n\n```js\nconsole.log('Code block');\n```");
    const [urlInput, setUrlInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [showEditor, setShowEditor] = useState(true);

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

    const handleUrlFetch = async () => {
        if (!urlInput.trim()) return;
        setIsLoading(true);
        trackActivity({ action: "MD_FETCH_URL", label: "Fetch Markdown from URL", details: urlInput });

        try {
            const res = await fetch('/api/fetch-url-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urlInput })
            });
            const data = await res.json();

            if (res.ok && data.content) {
                setMarkdown(data.content);
                addToast("Content loaded successfully", "success");
            } else {
                addToast(data.error || "Failed to load content", "error");
            }
        } catch (e: any) {
            addToast("Network error fetching content", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = (file: File) => {
        if (!file) return;
        if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
            addToast("Please upload a .md or .txt file", "error");
            return;
        }

        trackActivity({ action: "MD_UPLOAD_FILE", label: "Upload Markdown File", details: file.name });

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result;
            if (typeof content === 'string') {
                setMarkdown(content);
                addToast(`Loaded ${file.name}`, "success");
            }
        };
        reader.readAsText(file);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        handleFileUpload(file);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-light tracking-wide text-zinc-200">Markdown Previewer</h1>
                    <button
                        onClick={() => setShowEditor(!showEditor)}
                        className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title={showEditor ? "Hide Editor" : "Show Editor"}
                    >
                        {showEditor ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
                    </button>
                </div>
                <Link
                    href="/"
                    onClick={() => trackActivity({ action: "CLICK_BACK", label: "Markdown Preview" })}
                    className="group rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700 flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" /> Back to Home
                </Link>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-[85vh]">

                {/* Editor Section */}
                {showEditor && (
                    <div className="flex flex-1 flex-col gap-2 relative transition-all duration-300">
                        <div className="flex justify-between items-end">
                            <h2 className="text-sm font-medium text-zinc-400">Input</h2>

                            {/* Toolbar */}
                            <div className="flex gap-2">
                                <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                                    <LinkIcon className="w-4 h-4 text-zinc-500 ml-2" />
                                    <input
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                        placeholder="Paste URL..."
                                        className="bg-transparent border-none text-xs text-white focus:ring-0 w-32 focus:w-64 transition-all outline-none"
                                        onKeyDown={(e) => e.key === 'Enter' && handleUrlFetch()}
                                    />
                                    <button
                                        onClick={handleUrlFetch}
                                        disabled={isLoading}
                                        className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
                                    >
                                        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                    </button>
                                </div>

                                <label className="cursor-pointer flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white text-zinc-400 px-3 py-1.5 rounded-lg text-xs transition-colors">
                                    <Upload className="w-3 h-3" /> Upload File
                                    <input type="file" className="hidden" accept=".md,.txt" onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} />
                                </label>
                            </div>
                        </div>

                        <div
                            className={`flex-1 overflow-hidden rounded-xl border transition-colors relative ${isDragging ? 'border-emerald-500 bg-emerald-900/10' : 'border-zinc-800 bg-zinc-900'}`}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                        >
                            {isDragging && (
                                <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm pointer-events-none">
                                    <div className="flex flex-col items-center gap-4 text-emerald-400 animate-bounce">
                                        <FileUp className="w-12 h-12" />
                                        <span className="text-lg font-bold">Drop Markdown File Here</span>
                                    </div>
                                </div>
                            )}
                            <Editor
                                height="100%"
                                defaultLanguage="markdown"
                                theme="vs-dark"
                                value={markdown}
                                onChange={(val) => setMarkdown(val || "")}
                                options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 16 }, wordWrap: "on" }}
                            />
                        </div>
                        <div className="text-xs text-zinc-500 text-center mt-1">
                            Tips: Drag & drop a .md file directly into the editor
                        </div>
                    </div>
                )}

                {/* Preview Section */}
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
