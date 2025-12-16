'use client';

import React, { useState } from 'react';
import { useSqlReview } from '@/hooks/useSqlReview';
import Editor from '@monaco-editor/react';
import { Bot, Bug, Shield, Activity, ChevronRight, Loader2, Database } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function SqlReviewPage() {
    const {
        reviewSql,
        result,
        isReady,
        progress,
        statusMessage,
        isLoading: isAiThinking,
        error: aiError
    } = useSqlReview();

    // Local State
    const [spName, setSpName] = useState('');
    const [spOwner, setSpOwner] = useState('APPS'); // Default owner
    const [fetchedCode, setFetchedCode] = useState('');
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Function to fetch DDL from Oracle
    const handleFetchDDL = async () => {
        if (!spName) return;
        setIsFetching(true);
        setFetchError(null);
        setFetchedCode('');

        try {
            // Kita asumsikan user sudah login / ada koneksi tersimpan (hardcoded dev credential for demo logic)
            // Di production ini harusnya ambil dari Context / Session
            const dummyConnection = {
                username: "APPS",
                password: "APPS_PASSWORD", // Ganti dengan logic auth yang benar
                host: "localhost",
                port: 1521,
                serviceName: "ORCL"
            };

            const res = await fetch('/api/oracle/get-ddl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connection: dummyConnection,
                    owner: spOwner,
                    name: spName,
                    type: 'PROCEDURE' // Bisa dibuat dropdown nanti
                })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to fetch');

            setFetchedCode(data.ddl);
        } catch (err: any) {
            setFetchError(err.message);
            // Untuk demo testing jika API gagal, kita kasih dummy code biar user bisa coba AI
            setFetchedCode(`-- CONTOH PROCEDURE (API ERROR)\nCREATE OR REPLACE PROCEDURE check_balance(p_user_id IN NUMBER) AS\n  v_bal NUMBER;\nBEGIN\n  -- Potensi SQL Injection\n  EXECUTE IMMEDIATE 'SELECT balance FROM users WHERE id = ' || p_user_id INTO v_bal;\n  \n  -- Menggunakan loop yang tidak perlu\n  FOR i IN 1..1000 LOOP\n    NULL;\n  END LOOP;\nEND;`);
        } finally {
            setIsFetching(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8 text-slate-900 font-sans">

            {/* Header */}
            <header className="mb-8 flex items-center gap-3">
                <div className="p-3 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20">
                    <Bot className="w-8 h-8 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-transparent">
                        AI Code Reviewer
                    </h1>
                    <p className="text-slate-500 text-sm">Powered by Qwen2.5-Coder (Private & Offline)</p>
                </div>
            </header>

            {/* AI Model Loading State (Global Warning) */}
            {!isReady && (
                <div className="mb-8 bg-white p-6 rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden">
                    <div className="flex items-center gap-4 mb-3 relative z-10">
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        <h3 className="font-semibold text-blue-900">{statusMessage || "Preparing Your AI..."}</h3>
                        <span className="ml-auto text-sm font-mono text-blue-600">{progress}%</span>
                    </div>
                    {/* Progress Bar Track */}
                    <div className="h-2 bg-blue-50 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-blue-400 mt-2">
                        Memuat model AI ke dalam memori komputer Anda. Ini hanya terjadi sekali.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">

                {/* Left Column: Input Source */}
                <div className="flex flex-col gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-700 font-semibold border-b pb-4 mb-2">
                        <Database className="w-5 h-5" />
                        <h2>Source Code</h2>
                    </div>

                    {/* Controls */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Owner (e.g APPS)"
                            className="w-1/4 px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition"
                            value={spOwner}
                            onChange={e => setSpOwner(e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder="Stored Procedure Name..."
                            className="flex-1 px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition"
                            value={spName}
                            onChange={e => setSpName(e.target.value)}
                        />
                        <button
                            onClick={handleFetchDDL}
                            disabled={isFetching}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2 disabled:opacity-50"
                        >
                            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fetch"}
                        </button>
                    </div>

                    {/* Editor Area */}
                    <div className="flex-1 border rounded-lg overflow-hidden relative group">
                        {fetchError && (
                            <div className="absolute top-0 left-0 w-full bg-red-50 text-red-600 text-xs p-2 border-b border-red-100 z-10">
                                {fetchError} (Using dummy data for demo)
                            </div>
                        )}
                        <Editor
                            height="100%"
                            defaultLanguage="sql"
                            value={fetchedCode}
                            theme="light"
                            options={{
                                readOnly: true,
                                minimap: { enabled: false },
                                fontSize: 13,
                                scrollBeyondLastLine: false
                            }}
                        />
                    </div>

                    {/* Calculate Button */}
                    <button
                        onClick={() => reviewSql(fetchedCode)}
                        disabled={!isReady || !fetchedCode || isAiThinking}
                        className={`
                            py-4 rounded-xl font-bold text-lg shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-3
                            ${(!isReady || !fetchedCode)
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-[1.02] transform'
                            }
                        `}
                    >
                        {isAiThinking ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                Analyzing Logic...
                            </>
                        ) : (
                            <>
                                <Bot className="w-6 h-6" />
                                Start AI Code Review
                            </>
                        )}
                    </button>
                </div>

                {/* Right Column: AI Analysis Result */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                    <div className="flex items-center gap-2 text-slate-700 font-semibold border-b pb-4 mb-2">
                        <Activity className="w-5 h-5 text-indigo-500" />
                        <h2>AI Analysis Report</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        {!result && !isAiThinking && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                                    <Shield className="w-8 h-8 opacity-50" />
                                </div>
                                <p>Select an SP and click Review to start</p>
                            </div>
                        )}

                        {isAiThinking && (
                            <div className="space-y-4 animate-pulse p-4">
                                <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                                <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                                <div className="h-32 bg-slate-50 rounded-lg"></div>
                                <div className="h-4 bg-slate-100 rounded w-5/6"></div>
                            </div>
                        )}

                        {result && (
                            <div className="prose prose-sm prose-slate max-w-none">
                                {/* Markdown Renderer for AI Output */}
                                <ReactMarkdown
                                    components={{
                                        ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-2 my-4" {...props} />,
                                        li: ({ node, ...props }) => <li className="text-slate-700" {...props} />,
                                        strong: ({ node, ...props }) => <span className="font-bold text-indigo-900 bg-indigo-50 px-1 rounded" {...props} />,
                                        h1: ({ node, ...props }) => <h3 className="text-xl font-bold text-slate-900 mt-6 mb-3 border-b pb-2" {...props} />,
                                        h2: ({ node, ...props }) => <h4 className="text-lg font-bold text-slate-800 mt-5 mb-2" {...props} />,
                                        h3: ({ node, ...props }) => <h5 className="text-md font-bold text-indigo-700 mt-4 mb-1" {...props} />,
                                        p: ({ node, ...props }) => <p className="mb-4 leading-relaxed" {...props} />
                                    }}
                                >
                                    {result}
                                </ReactMarkdown>
                            </div>
                        )}

                        {aiError && (
                            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 flex items-start gap-3">
                                <Bug className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-bold">Analysis Failed</h4>
                                    <p className="text-sm">{aiError}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
