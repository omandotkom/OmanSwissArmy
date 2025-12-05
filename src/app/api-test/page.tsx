"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";
import { saveRequest, getAllRequests, deleteRequest, ApiRequest } from "@/lib/db";
import { useToast, ToastContainer } from "@/components/ui/toast";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

export default function ApiTest() {
    const [requestId, setRequestId] = useState<string>(crypto.randomUUID());
    const [requestName, setRequestName] = useState("New Request");
    const [url, setUrl] = useState("");
    const [method, setMethod] = useState<HttpMethod>("GET");
    const [mode, setMode] = useState<"server" | "client">("server");
    const [headers, setHeaders] = useState("{\n  \"Content-Type\": \"application/json\"\n}");
    const [body, setBody] = useState("");
    const [response, setResponse] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<"body" | "headers">("body");
    const [savedRequests, setSavedRequests] = useState<ApiRequest[]>([]);

    const { toasts, addToast, removeToast } = useToast();

    useEffect(() => {
        loadSavedRequests();
    }, []);

    const loadSavedRequests = async () => {
        try {
            const requests = await getAllRequests();
            setSavedRequests(requests);
        } catch (error) {
            console.error("Failed to load requests", error);
            addToast("Failed to load requests", "error");
        }
    };

    const handleSave = async () => {
        try {
            const requestData: ApiRequest = {
                id: requestId,
                name: requestName,
                url,
                method,
                mode,
                headers,
                body,
                response,
                createdAt: Date.now(),
            };
            await saveRequest(requestData);
            await loadSavedRequests();
            addToast("Request saved successfully!", "success");
        } catch (error) {
            console.error("Failed to save request", error);
            addToast("Failed to save request", "error");
        }
    };

    const handleLoadRequest = (req: ApiRequest) => {
        setRequestId(req.id);
        setRequestName(req.name);
        setUrl(req.url);
        setMethod(req.method as HttpMethod);
        setMode(req.mode);
        setHeaders(req.headers);
        setBody(req.body);
        setResponse(req.response);
    };

    const handleDeleteRequest = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this request?")) {
            await deleteRequest(id);
            await loadSavedRequests();
            if (requestId === id) {
                // Reset if deleted current
                setRequestId(crypto.randomUUID());
                setRequestName("New Request");
                setUrl("");
                setResponse(null);
            }
            addToast("Request deleted", "success");
        }
    };

    const handleNewRequest = () => {
        setRequestId(crypto.randomUUID());
        setRequestName("New Request");
        setUrl("");
        setMethod("GET");
        setBody("");
        setResponse(null);
    };

    const handleSend = async () => {
        if (!url) return;
        setLoading(true);
        setResponse(null);
        const startTime = performance.now();

        try {
            let parsedHeaders = {};
            try {
                parsedHeaders = JSON.parse(headers);
            } catch (e) {
                addToast("Invalid Headers JSON", "error");
                setLoading(false);
                return;
            }

            let resStatus = 0;
            let resStatusText = "";
            let resHeaders = {};
            let resData: any = null;

            if (mode === "server") {
                // Server Mode (Proxy)
                const res = await fetch("/api/proxy", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        url,
                        method,
                        headers: parsedHeaders,
                        body: body || undefined,
                    }),
                });

                const data = await res.json();
                resStatus = data.status || res.status;
                resStatusText = data.statusText || res.statusText;
                resHeaders = data.headers || {};
                resData = data.data || data;

            } else {
                // Client Mode (Direct)
                const options: RequestInit = {
                    method,
                    headers: parsedHeaders,
                };

                if (body && !["GET", "HEAD"].includes(method)) {
                    options.body = body;
                }

                const res = await fetch(url, options);
                resStatus = res.status;
                resStatusText = res.statusText;

                const text = await res.text();
                try {
                    resData = JSON.parse(text);
                } catch {
                    resData = text;
                }

                const h: Record<string, string> = {};
                res.headers.forEach((v, k) => (h[k] = v));
                resHeaders = h;
            }

            const endTime = performance.now();
            setResponse({
                status: resStatus,
                statusText: resStatusText,
                headers: resHeaders,
                data: resData,
                time: Math.round(endTime - startTime),
            });

        } catch (err: any) {
            setResponse({
                error: err.message,
                status: 0,
                statusText: "Error",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-zinc-950 p-6 font-sans text-zinc-100">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            <div className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-light tracking-wide text-zinc-200">API Test</h1>
                <Link
                    href="/"
                    className="rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-zinc-800 hover:text-white hover:border-zinc-700"
                >
                    Back to Home
                </Link>
            </div>

            {/* Saved Requests List */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-medium text-zinc-400">Saved Requests</h2>
                    <button
                        onClick={handleNewRequest}
                        className="text-xs text-blue-400 hover:text-blue-300"
                    >
                        + New Request
                    </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800">
                    {savedRequests.map((req) => (
                        <div
                            key={req.id}
                            onClick={() => handleLoadRequest(req)}
                            className={`flex-shrink-0 cursor-pointer rounded-lg border px-3 py-2 text-sm transition-all ${requestId === req.id
                                    ? "bg-zinc-800 border-zinc-600 text-white"
                                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className={`font-bold text-xs ${req.method === "GET" ? "text-green-400" :
                                        req.method === "POST" ? "text-blue-400" :
                                            req.method === "DELETE" ? "text-red-400" : "text-yellow-400"
                                    }`}>{req.method}</span>
                                <span className="truncate max-w-[100px]">{req.name}</span>
                                <button
                                    onClick={(e) => handleDeleteRequest(e, req.id)}
                                    className="ml-1 text-zinc-600 hover:text-red-400"
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    ))}
                    {savedRequests.length === 0 && (
                        <div className="text-sm text-zinc-600 italic">No saved requests yet.</div>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-6 lg:flex-row">
                {/* Left Panel: Request Config */}
                <div className="flex flex-1 flex-col gap-4">

                    {/* Request Name & Save */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Request Name"
                            value={requestName}
                            onChange={(e) => setRequestName(e.target.value)}
                            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                        />
                        <button
                            onClick={handleSave}
                            className="rounded-lg bg-zinc-800 px-4 py-2 font-medium text-zinc-300 transition-all hover:bg-zinc-700 hover:text-white"
                        >
                            Save
                        </button>
                    </div>

                    {/* URL & Method */}
                    <div className="flex gap-2">
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value as HttpMethod)}
                            className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 font-bold text-zinc-200 focus:outline-none focus:border-zinc-600"
                        >
                            {["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="Enter request URL"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-2 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading}
                            className="rounded-lg bg-zinc-100 px-6 py-2 font-bold text-zinc-900 transition-all hover:bg-white disabled:opacity-50"
                        >
                            {loading ? "Sending..." : "Send"}
                        </button>
                    </div>

                    {/* Mode Selection */}
                    <div className="flex items-center gap-4 rounded-lg bg-zinc-900/50 p-3 border border-zinc-800/50">
                        <span className="text-sm font-medium text-zinc-400">Request Mode:</span>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="mode"
                                value="server"
                                checked={mode === "server"}
                                onChange={() => setMode("server")}
                                className="accent-zinc-100"
                            />
                            <span className="text-sm text-zinc-300">Server (Proxy)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="mode"
                                value="client"
                                checked={mode === "client"}
                                onChange={() => setMode("client")}
                                className="accent-zinc-100"
                            />
                            <span className="text-sm text-zinc-300">Client (Browser)</span>
                        </label>
                    </div>

                    {/* Tabs: Body & Headers */}
                    <div className="flex flex-col flex-grow rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
                        <div className="flex border-b border-zinc-800">
                            <button
                                onClick={() => setActiveTab("body")}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "body" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                            >
                                Request Body
                            </button>
                            <button
                                onClick={() => setActiveTab("headers")}
                                className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "headers" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                            >
                                Headers (JSON)
                            </button>
                        </div>

                        <div className="flex-grow min-h-[300px] relative">
                            {activeTab === "body" ? (
                                <Editor
                                    height="100%"
                                    defaultLanguage="json"
                                    theme="vs-dark"
                                    value={body}
                                    onChange={(val) => setBody(val || "")}
                                    options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 16 } }}
                                />
                            ) : (
                                <Editor
                                    height="100%"
                                    defaultLanguage="json"
                                    theme="vs-dark"
                                    value={headers}
                                    onChange={(val) => setHeaders(val || "")}
                                    options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 16 } }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel: Response */}
                <div className="flex flex-1 flex-col gap-4">
                    <div className="flex items-center justify-between rounded-lg bg-zinc-900 p-3 border border-zinc-800">
                        <span className="font-medium text-zinc-400">Response</span>
                        {response && (
                            <div className="flex gap-4 text-sm">
                                <span className={`${response.status >= 200 && response.status < 300 ? "text-green-400" : "text-red-400"}`}>
                                    Status: {response.status} {response.statusText}
                                </span>
                                <span className="text-zinc-400">Time: {response.time ? `${response.time}ms` : "-"}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-grow rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden min-h-[500px] relative">
                        {response ? (
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                theme="vs-dark"
                                value={JSON.stringify(response.data, null, 2)}
                                options={{
                                    readOnly: true,
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    padding: { top: 16 },
                                    scrollBeyondLastLine: false
                                }}
                            />
                        ) : (
                            <div className="flex h-full items-center justify-center text-zinc-600">
                                Response will appear here
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
