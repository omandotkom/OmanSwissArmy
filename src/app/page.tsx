"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Search, Sparkles, BrainCircuit, Loader2 } from "lucide-react";
import { toolGroups } from "@/data/tools";
import { useAiSearch } from "@/hooks/useAiSearch";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAiMode, setIsAiMode] = useState(false);

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
  type ToolItem = {
    href: string;
    title: string;
    description: string;
  };

  type ToolGroup = {
    name: string;
    items: ToolItem[];
  };

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
    displayedGroups = toolGroups.map((group: ToolGroup) => {
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
    <div className="flex min-h-screen flex-col items-center justify-start bg-zinc-950 p-6 font-sans text-zinc-100">
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
                onClick={() => setIsAiMode(!isAiMode)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 border ${isAiMode
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
                {group.items.map((tool) => (
                  <Link key={tool.href} href={tool.href} className="block w-full">
                    <button className={`group relative flex h-full w-full flex-col items-start justify-start overflow-hidden rounded-xl border p-6 text-left shadow-sm transition-all duration-300 hover:shadow-md active:scale-[0.98] ${isAiMode
                      ? "bg-zinc-900/50 border-indigo-900/30 hover:bg-indigo-900/20 hover:border-indigo-500/50"
                      : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700"
                      }`}>
                      <span className={`mb-1 text-lg font-medium transition-colors duration-300 ${isAiMode ? "text-indigo-200 group-hover:text-white" : "text-zinc-300 group-hover:text-white"}`}>
                        {tool.title}
                      </span>
                      <div className="max-h-0 opacity-0 transition-all duration-300 ease-out group-hover:max-h-20 group-hover:opacity-100 group-hover:mt-2">
                        <p className="text-sm text-zinc-400 leading-relaxed">
                          {tool.description}
                        </p>
                      </div>

                      {/* Always show description in AI mode for better context visibility */}
                      {isAiMode && (
                        <p className="mt-2 text-sm text-zinc-500 leading-relaxed group-hover:hidden">
                          {tool.description}
                        </p>
                      )}
                    </button>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
