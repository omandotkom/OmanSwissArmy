"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Search, Sparkles, BrainCircuit, Loader2, AlertTriangle, Settings, X, Database, Bot, FileUp, RefreshCcw, Info, Heart } from "lucide-react";
import { toolGroups } from "@/data/tools";
import { useAiSearch } from "@/hooks/useAiSearch";
import ConnectionManager from "@/components/ConnectionManager";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAiMode, setIsAiMode] = useState(false);
  type ToolItem = {
    href: string;
    title: string;
    description: string;
    dependency?: string;
    platforms?: string[];
  };

  type ToolGroup = {
    name: string;
    items: ToolItem[];
  };

  const [dependencies, setDependencies] = useState<{ oc: boolean; ai: boolean; platform?: string }>({ oc: true, ai: true });

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSetting, setActiveSetting] = useState("connection-manager");

  useEffect(() => {
    // Check system dependencies on load
    fetch('/api/system/dependencies')
      .then(res => res.json())
      .then(data => {
        setDependencies(data);
        if (!data.ai && isAiMode) {
          setIsAiMode(false);
        }
      })
      .catch(err => console.error("Failed to check dependencies:", err));
  }, []);

  // AI Search Hook
  const {
    search: aiSearch,
    results: aiResults,
    isReady: aiReady,
    isLoading: aiLoading, // This is model loading mainly
    progress: aiProgress
  } = useAiSearch();

  // Debounce AI Search to avoid excessive computation
  useEffect(() => {
    if (isAiMode && searchQuery.trim()) {
      const timeoutId = setTimeout(() => {
        aiSearch(searchQuery);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, isAiMode]);

  // Determine which groups to display
  let displayedGroups: ToolGroup[] = [];

  if (isAiMode && searchQuery.trim()) {
    // AI Mode: Show flat list of results
    if (aiResults.length > 0) {
      displayedGroups = [{
        name: "✨ AI Best Matches",
        items: aiResults.map((r: any) => r.item)
      }];
    }
  } else {
    // Standard Regex Mode
    displayedGroups = toolGroups.map((group: any) => {
      const filteredItems = group.items.filter((item: ToolItem) => {
        try {
          const regex = new RegExp(searchQuery, 'i');
          return (
            regex.test(item.title) ||
            regex.test(item.description) ||
            regex.test(item.href)
          );
        } catch (e) {
          const lowerQuery = searchQuery.toLowerCase();
          return (
            item.title.toLowerCase().includes(lowerQuery) ||
            item.description.toLowerCase().includes(lowerQuery) ||
            item.href.toLowerCase().includes(lowerQuery)
          );
        }
      });
      return { ...group, items: filteredItems };
    }).filter((group: ToolGroup) => group.items.length > 0);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-zinc-950 p-6 font-sans text-zinc-100 relative">
      <div className="absolute top-6 right-6 z-10">
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-full transition-all"
          title="Settings"
        >
          <Settings className="w-6 h-6" />
        </button>
      </div>

      <main className="w-full max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-light tracking-wide text-zinc-200">
            Oman Swiss Army Tool
          </h1>
          <p className="mt-2 text-zinc-500">
            A collection of developer utilities for your daily needs.
          </p>

          <div className="mt-8 relative max-w-lg mx-auto flex flex-col gap-3">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {isAiMode ? (
                  <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
                ) : (
                  <Search className="h-5 w-5 text-zinc-500" />
                )}
              </div>
              <input
                type="text"
                placeholder={isAiMode ? "Ask AI: 'tools for fixing db spaces'..." : "Search tools (e.g., 'json', 'decoder')..."}
                className={`block w-full pl-10 pr-3 py-2 border rounded-lg leading-5 bg-zinc-900 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:ring-1 transition-all shadow-sm ${isAiMode
                  ? "border-indigo-900/50 focus:ring-indigo-500 focus:border-indigo-500"
                  : "border-zinc-800 focus:ring-indigo-500 focus:border-indigo-500"
                  }`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* AI Toggle & Status */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => !dependencies.ai ? null : setIsAiMode(!isAiMode)}
                disabled={!dependencies.ai}
                title={!dependencies.ai ? "AI Model libraries are not available" : ""}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border ${!dependencies.ai
                  ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed opacity-50"
                  : isAiMode
                    ? "bg-indigo-900/30 border-indigo-500/50 text-indigo-300"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
              >
                <BrainCircuit className="h-3.5 w-3.5" />
                {isAiMode ? "AI Search Active" : "Enable AI Search"}
              </button>

              {isAiMode && !aiReady && (
                <div className="flex items-center gap-2 text-xs text-yellow-500/80 animate-pulse">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading Model ({Math.round(aiProgress || 0)}%)...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {displayedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
            {isAiMode ? (
              <BrainCircuit className="h-12 w-12 mb-4 opacity-20 text-indigo-500" />
            ) : (
              <Search className="h-12 w-12 mb-4 opacity-20" />
            )}
            <p>No tools found matching "{searchQuery}"</p>
            {isAiMode && <p className="text-xs mt-2 opacity-50">AI is trying its best...</p>}
          </div>
        ) : (
          displayedGroups.map((group) => (
            <section key={group.name} className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="mb-6 flex items-center text-xl font-semibold text-zinc-400">
                <span className="mr-4 h-px flex-1 bg-zinc-800"></span>
                {group.name}
                <span className="ml-4 h-px flex-1 bg-zinc-800"></span>
              </h2>
              <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map((tool) => {
                  const isOcMissing = tool.dependency === 'oc' && !dependencies.oc;
                  const isAiMissing = tool.dependency === 'ai' && !dependencies.ai;
                  const isPlatformMissing = !!(tool.platforms && dependencies.platform && !tool.platforms.includes(dependencies.platform));

                  const isDisabled = isOcMissing || isAiMissing || isPlatformMissing;
                  const missingLabel = isPlatformMissing
                    ? "OS Not Supported"
                    : isOcMissing
                      ? "OC Binary Missing"
                      : isAiMissing
                        ? "AI Model Missing"
                        : "";

                  const CardContent = (
                    <button
                      disabled={isDisabled}
                      className={`group relative flex h-full w-full flex-col items-start justify-start overflow-hidden rounded-xl border p-6 text-left shadow-sm transition-all duration-300 ${isDisabled
                        ? "bg-zinc-900/30 border-zinc-800 cursor-not-allowed opacity-60"
                        : isAiMode
                          ? "bg-zinc-900/50 border-indigo-900/30 hover:bg-indigo-900/20 hover:border-indigo-500/50 hover:shadow-md active:scale-[0.98]"
                          : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 hover:shadow-md active:scale-[0.98]"
                        }`}
                    >
                      <div className="flex w-full justify-between items-start mb-1">
                        <span className={`text-lg font-medium transition-colors duration-300 ${isDisabled
                          ? "text-zinc-500"
                          : isAiMode ? "text-indigo-200 group-hover:text-white" : "text-zinc-300 group-hover:text-white"
                          }`}>
                          {tool.title}
                        </span>
                        {isDisabled && (
                          <AlertTriangle className="h-5 w-5 text-amber-500/80" />
                        )}
                      </div>

                      <div className={`max-h-0 opacity-0 transition-all duration-300 ease-out ${isDisabled ? "max-h-20 opacity-100 mt-2" : "group-hover:max-h-20 group-hover:opacity-100 group-hover:mt-2"}`}>
                        <p className={`text-sm leading-relaxed ${isDisabled ? "text-amber-500/80" : "text-zinc-400"}`}>
                          {isDisabled ? `Unavailable: ${missingLabel}` : tool.description}
                        </p>
                      </div>

                      {/* Always show description in AI mode for better context visibility */}
                      {isAiMode && !isDisabled && (
                        <p className="mt-2 text-sm text-zinc-500 leading-relaxed group-hover:hidden">
                          {tool.description}
                        </p>
                      )}
                    </button>
                  );

                  if (isDisabled) {
                    return (
                      <div key={tool.href} className="block w-full" title={`Unavailable: ${missingLabel}`}>
                        {CardContent}
                      </div>
                    );
                  }

                  return (
                    <Link key={tool.href} href={tool.href} className="block w-full">
                      {CardContent}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-5xl h-[85vh] flex overflow-hidden shadow-2xl relative">

            {/* Panel 1: Settings Navigation (Sidebar) */}
            <div className="w-64 border-r border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0">
              <div className="p-4 border-b border-zinc-800 flex items-center gap-2 bg-zinc-900/50">
                <Settings className="w-4 h-4 text-zinc-400" />
                <span className="font-semibold text-zinc-200 text-sm">Preferences</span>
              </div>
              <div className="flex-1 p-2 space-y-1 overflow-y-auto">
                <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Services
                </div>
                <button
                  onClick={() => setActiveSetting("connection-manager")}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${activeSetting === "connection-manager"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-transparent"
                    }`}
                >
                  <Database className="w-4 h-4" />
                  Oracle Connections
                </button>
                <button
                  onClick={() => setActiveSetting("ai-models")}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${activeSetting === "ai-models"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-transparent"
                    }`}
                >
                  <Bot className="w-4 h-4" />
                  AI Models
                </button>

                <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-4">
                  System
                </div>
                <button
                  onClick={() => setActiveSetting("export")}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${activeSetting === "export"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-transparent"
                    }`}
                >
                  <FileUp className="w-4 h-4" />
                  Export
                </button>
                <button
                  onClick={() => setActiveSetting("update")}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${activeSetting === "update"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-transparent"
                    }`}
                >
                  <RefreshCcw className="w-4 h-4" />
                  Update
                </button>
                <button
                  onClick={() => setActiveSetting("about")}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${activeSetting === "about"
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-transparent"
                    }`}
                >
                  <Info className="w-4 h-4" />
                  About
                </button>
              </div>

              <div className="p-4 border-t border-zinc-800 text-xs text-zinc-600 text-center">
                v{process.env.NEXT_PUBLIC_APP_VERSION}-beta
              </div>
            </div>

            {/* Panel 2: Content */}
            <div className="flex-1 flex flex-col bg-zinc-950 relative min-w-0">
              {/* Header for Content Panel */}
              <div className="h-14 px-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/30 shrink-0">
                <h3 className="font-medium text-zinc-200 capitalize">
                  {activeSetting.replace(/-/g, " ")}
                </h3>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden relative">
                {activeSetting === "connection-manager" && (
                  <ConnectionManager
                    isOpen={true}
                    onClose={() => { }}
                    embedded={true}
                  />
                )}

                {(activeSetting === "ai-models" || activeSetting === "export" || activeSetting === "update") && (
                  <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-zinc-900/20">
                    <Sparkles className="w-12 h-12 mb-4 opacity-20" />
                    <h4 className="text-xl font-medium text-zinc-400 mb-2">Coming Soon</h4>
                    <p className="text-sm">This feature is currently under development.</p>
                  </div>
                )}

                {activeSetting === "about" && (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-zinc-900/20">
                    <div className="p-4 bg-zinc-900 rounded-full mb-6 border border-zinc-800 shadow-xl">
                      <BrainCircuit className="w-12 h-12 text-blue-500" />
                    </div>
                    <h1 className="text-3xl font-light tracking-wide text-zinc-100 mb-2">
                      Oman Swiss Army Tool
                    </h1>
                    <div className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-mono text-zinc-500 mb-6">
                      v{process.env.NEXT_PUBLIC_APP_VERSION}-beta
                    </div>
                    <p className="text-zinc-400 max-w-md leading-relaxed mb-12">
                      A comprehensive suite of developer utilities designed to streamline your daily workflow, from database management to code utilities.
                    </p>

                    <div className="flex items-center gap-2 text-zinc-500 text-sm animate-pulse">
                      <span>Created by Oman with</span>
                      <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
