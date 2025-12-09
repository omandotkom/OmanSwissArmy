"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";

export default function MetaTagGenerator() {
    const [meta, setMeta] = useState({
        title: "",
        description: "",
        keywords: "",
        author: "",
        ogImage: "",
        ogUrl: "",
        twitterCard: "summary_large_image"
    });

    const generatedCode = `
<!-- Primary Meta Tags -->
<title>${meta.title}</title>
<meta name="title" content="${meta.title}" />
<meta name="description" content="${meta.description}" />
<meta name="keywords" content="${meta.keywords}" />
<meta name="author" content="${meta.author}" />

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content="${meta.ogUrl}" />
<meta property="og:title" content="${meta.title}" />
<meta property="og:description" content="${meta.description}" />
<meta property="og:image" content="${meta.ogImage}" />

<!-- Twitter -->
<meta property="twitter:card" content="${meta.twitterCard}" />
<meta property="twitter:url" content="${meta.ogUrl}" />
<meta property="twitter:title" content="${meta.title}" />
<meta property="twitter:description" content="${meta.description}" />
<meta property="twitter:image" content="${meta.ogImage}" />
    `.trim();

    const handleChange = (field: keyof typeof meta, value: string) => {
        setMeta(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">Meta Tag Generator</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-[85vh]">

                {/* Form */}
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-2">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Page Title</label>
                        <input
                            type="text"
                            value={meta.title}
                            onChange={(e) => handleChange("title", e.target.value)}
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="My Awesome Website"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Description</label>
                        <textarea
                            value={meta.description}
                            onChange={(e) => handleChange("description", e.target.value)}
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600 resize-none h-24"
                            placeholder="A brief description of your page..."
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Keywords (comma separated)</label>
                        <input
                            type="text"
                            value={meta.keywords}
                            onChange={(e) => handleChange("keywords", e.target.value)}
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="seo, tools, web"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Author</label>
                        <input
                            type="text"
                            value={meta.author}
                            onChange={(e) => handleChange("author", e.target.value)}
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="John Doe"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Image URL (OG Image)</label>
                        <input
                            type="text"
                            value={meta.ogImage}
                            onChange={(e) => handleChange("ogImage", e.target.value)}
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="https://example.com/image.jpg"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-zinc-400">Website URL</label>
                        <input
                            type="text"
                            value={meta.ogUrl}
                            onChange={(e) => handleChange("ogUrl", e.target.value)}
                            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600"
                            placeholder="https://example.com"
                        />
                    </div>
                </div>

                {/* Preview */}
                <div className="flex flex-1 flex-col gap-2">
                    <h2 className="text-sm font-medium text-zinc-400">Generated HTML</h2>
                    <div className="flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                        <Editor
                            height="100%"
                            defaultLanguage="html"
                            theme="vs-dark"
                            value={generatedCode}
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, padding: { top: 16 }, wordWrap: "on" }}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}
