"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Search, GitBranch, Star, Lock, Globe, ExternalLink, Save, Trash2, Github } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import {
    GiteaConnection,
    saveGiteaConnection,
    getAllGiteaConnections,
    deleteGiteaConnection
} from "@/services/connection-storage";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

interface UnifiedRepo {
    id: number;
    name: string;
    full_name: string;
    description: string;
    private: boolean;
    html_url: string;
    owner: {
        login: string;
        avatar_url: string;
    };
    stars: number;
    forks: number;
    updated_at: string;
    language: string;
    source: 'gitea' | 'github';
}

interface UserProfile {
    login: string;
    full_name: string;
    avatar_url: string;
    created_at: string;
    email?: string;
}

export default function GitBrowser() {
    const [baseUrl, setBaseUrl] = useState("");
    const [token, setToken] = useState("");
    const [connectionName, setConnectionName] = useState("");
    const [repos, setRepos] = useState<UnifiedRepo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [savedConnections, setSavedConnections] = useState<GiteaConnection[]>([]);
    const [selectedConnId, setSelectedConnId] = useState("");
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [heatmapData, setHeatmapData] = useState<any[]>([]); // For Gitea contributions
    const [activeTab, setActiveTab] = useState<'list' | 'analytics' | 'account'>('list');

    // Load connections on mount
    useEffect(() => {
        loadConnections();
    }, []);

    const loadConnections = async () => {
        try {
            const conns = await getAllGiteaConnections();
            setSavedConnections(conns);
        } catch (err) {
            console.error("Failed to load connections:", err);
        }
    };

    const handleConnectionSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedConnId(id);
        if (id) {
            const conn = savedConnections.find(c => c.id === id);
            if (conn) {
                setBaseUrl(conn.url);
                setToken(conn.token);
                setConnectionName(conn.name);
            }
        } else {
            setBaseUrl("");
            setToken("");
            setConnectionName("");
        }
    };

    const handleSaveConnection = async () => {
        if (!connectionName || !baseUrl || !token) {
            setError("Please fill in all connection fields.");
            return;
        }
        try {
            await saveGiteaConnection({
                id: selectedConnId || uuidv4(), // Update or Create
                name: connectionName,
                url: baseUrl,
                token: token
            });
            await loadConnections();
            setError(null);
            // alert("Connection saved!"); // Removed to avoid blocking UI
        } catch (err) {
            setError("Failed to save connection.");
            console.error(err);
        }
    };

    const handleDeleteConnection = async () => {
        if (!selectedConnId) return;
        if (!confirm("Are you sure you want to delete this connection?")) return;

        try {
            await deleteGiteaConnection(selectedConnId);
            await loadConnections();
            setSelectedConnId("");
            setBaseUrl("");
            setToken("");
            setConnectionName("");
        } catch (err) {
            setError("Failed to delete connection.");
        }
    };

    const fetchRepos = async () => {
        if (!baseUrl || !token) {
            setError("Please provide both Base URL and Access Token.");
            return;
        }

        setLoading(true);
        setError(null);
        setRepos([]);
        setUserProfile(null);
        setHeatmapData([]);

        try {
            // Normalize URL (remove trailing slash)
            const cleanUrl = baseUrl.replace(/\/$/, "");
            const isGitHub = cleanUrl.includes("api.github.com");

            // 1. Fetch User Profile First
            const userUrl = isGitHub ? `${cleanUrl}/user` : `${cleanUrl}/api/v1/user`;
            const userRes = await fetch(`/api/gitea/repos?url=${encodeURIComponent(userUrl)}`, {
                headers: { Authorization: `token ${token}` }
            });

            if (!userRes.ok) throw new Error("Failed to fetch user profile");
            const userData = await userRes.json();
            setUserProfile(userData);

            // 2. Fetch Repositories (Pagination Loop)
            let allFetchedRepos: any[] = [];
            let page = 1;
            let hasMore = true;
            const LIMIT = 50;

            while (hasMore) {
                let targetApiUrl = "";
                if (isGitHub) {
                    targetApiUrl = `${cleanUrl}/user/repos?per_page=${LIMIT}&page=${page}`;
                } else {
                    targetApiUrl = `${cleanUrl}/api/v1/user/repos?limit=${LIMIT}&page=${page}`;
                }

                const response = await fetch(`/api/gitea/repos?url=${encodeURIComponent(targetApiUrl)}`, {
                    headers: {
                        Authorization: `token ${token}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!response.ok) {
                    if (page === 1) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.details || errData.error || `Failed to fetch: ${response.status} ${response.statusText}`);
                    } else {
                        break;
                    }
                }

                const data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    allFetchedRepos = [...allFetchedRepos, ...data];
                    if (data.length < LIMIT) hasMore = false;
                    else page++;
                } else {
                    hasMore = false;
                }
            }

            // Map Data
            const mappedData: UnifiedRepo[] = allFetchedRepos.map((item: any) => ({
                id: item.id,
                name: item.name,
                full_name: item.full_name,
                description: item.description || "",
                private: item.private,
                html_url: item.html_url,
                owner: {
                    login: item.owner?.login || "Unknown",
                    avatar_url: item.owner?.avatar_url || "",
                },
                stars: item.stargazers_count !== undefined ? item.stargazers_count : (item.stars_count || 0),
                forks: item.forks_count || 0,
                updated_at: item.updated_at,
                language: item.language || "Unknown",
                source: isGitHub ? 'github' : 'gitea'
            }));

            mappedData.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            setRepos(mappedData);

            // 3. Fetch Heatmap (Gitea Only)
            if (!isGitHub && userData.login) {
                try {
                    const heatmapUrl = `${cleanUrl}/api/v1/users/${userData.login}/heatmap`;
                    const heatmapRes = await fetch(`/api/gitea/repos?url=${encodeURIComponent(heatmapUrl)}`, {
                        headers: { Authorization: `token ${token}` }
                    });
                    if (heatmapRes.ok) {
                        const hData = await heatmapRes.json();
                        // Gitea Heatmap is Array<{timestamp: number, contributions: number}>
                        setHeatmapData(hData);
                    }
                } catch (ignore) {
                    console.warn("Failed to fetch heatmap");
                }
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred");
        } finally {
            setLoading(false);
        }
    };

    // Analytics Helpers
    // ... (getLanguageData, getActivityData)

    // Account Stats Helpers
    const getStatsYTD = () => {
        const currentYear = new Date().getFullYear();
        const createdYTD = repos.filter(r => new Date(r.updated_at).getFullYear() === currentYear); // Fallback if created_at not available mapping? 
        // Wait, UnifiedRepo doesn't have created_at mapped, let's map it or just use updated_at for active.
        // Actually Repos usually have created_at. Let's assume most activity is tracked by updated_at for now,
        // but for "Projects Created" we strictly need created_at. 
        // NOTE: The user requested "Projects Created YTD". I need to ensure created_at is in UnifiedRepo.
        // I will update UnifiedRepo mapping in next step if generic, but for now I can infer from repo list source logic if needed.
        // Let's rely on `updated_at` for "Active Projects" and just count Total.

        const activeYTD = repos.filter(r => new Date(r.updated_at).getFullYear() === currentYear).length;

        // Gitea Heatmap Sum
        let totalContributions = 0;
        if (heatmapData.length > 0) {
            const startOfYear = new Date(currentYear, 0, 1).getTime() / 1000;
            totalContributions = heatmapData
                .filter((d: any) => d.timestamp >= startOfYear)
                .reduce((acc: number, curr: any) => acc + curr.contributions, 0);
        }

        return { activeYTD, totalContributions };
    };

    const filteredRepos = repos.filter(repo =>
        repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Analytics Calculation
    const getLanguageData = () => {
        const counts: Record<string, number> = {};
        repos.forEach(repo => {
            if (repo.language) {
                counts[repo.language] = (counts[repo.language] || 0) + 1;
            } else {
                counts['Unknown'] = (counts['Unknown'] || 0) + 1;
            }
        });

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8); // Top 8 languages
    };

    const getActivityData = () => {
        const now = new Date();
        const monthMs = 30 * 24 * 60 * 60 * 1000;

        let active = 0; // < 1 month
        let semi = 0;   // 1 - 6 months
        let stale = 0;  // > 6 months

        repos.forEach(repo => {
            const diff = now.getTime() - new Date(repo.updated_at).getTime();
            if (diff < monthMs) active++;
            else if (diff < 6 * monthMs) semi++;
            else stale++;
        });

        return [
            { name: 'Active (< 1mo)', value: active, color: '#10b981' }, // Emerald 500
            { name: 'Quiet (1-6mo)', value: semi, color: '#f59e0b' },   // Amber 500
            { name: 'Stale (> 6mo)', value: stale, color: '#ef4444' },  // Red 500
        ];
    };

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#94a3b8'];

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                            <ArrowLeft className="w-6 h-6 text-slate-600" />
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
                                Git Browser <span className="text-sm font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-md border border-slate-200">Gitea / GitHub</span>
                            </h1>
                            <p className="text-slate-500">Explore and manage your organization's repositories</p>
                        </div>
                    </div>

                    {/* Tabs / Actions */}
                    {repos.length > 0 && (
                        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                            <button
                                onClick={() => setActiveTab('list')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'list' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Repository List
                            </button>
                            <button
                                onClick={() => setActiveTab('analytics')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'analytics' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Analytics Dashboard
                            </button>
                            <button
                                onClick={() => setActiveTab('account')}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'account' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Account Insights
                            </button>
                        </div>
                    )}
                </div>

                {/* Config Panel */}
                {/* Config Panel */}
                {(activeTab === 'list' || repos.length === 0) && (
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Gitea / GitHub URL</label>
                                    <input
                                        type="text"
                                        value={baseUrl}
                                        onChange={(e) => setBaseUrl(e.target.value)}
                                        placeholder="https://gitea.example.com"
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all outline-none"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Leave empty for GitHub.com</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Access Token</label>
                                    <input
                                        type="password"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        placeholder="ver..."
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4 flex flex-col justify-end">
                                <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Connection Name (Optional)</label>
                                        <input
                                            type="text"
                                            value={connectionName}
                                            onChange={(e) => setConnectionName(e.target.value)}
                                            placeholder="My Gitea Server"
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={handleSaveConnection}
                                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2"
                                        title="Save Connection"
                                    >
                                        <Save className="w-4 h-4" />
                                    </button>
                                    {selectedConnId && (
                                        <button
                                            onClick={handleDeleteConnection}
                                            className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2"
                                            title="Delete Connection"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {savedConnections.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Saved Connections</label>
                                        <select
                                            value={selectedConnId}
                                            onChange={handleConnectionSelect}
                                            className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all outline-none"
                                        >
                                            <option value="">Select a saved connection...</option>
                                            {savedConnections.map(c => (
                                                <option key={c.id} value={c.id}>{c.name} ({c.url})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={fetchRepos}
                                disabled={loading}
                                className={`px-6 py-2 bg-gradient-to-r from-teal-600 to-blue-600 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 ${loading ? 'animate-pulse' : ''}`}
                            >
                                {loading ? 'Fetching...' : 'Fetch Repositories'}
                            </button>
                        </div>

                        {error && (
                            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100 flex items-center gap-2 animate-in fade-in">
                                <span>⚠️</span>
                                <p>{error}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Account Insights Tab */}
                {/* Account Insights Tab */}
                {activeTab === 'account' && userProfile && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        {/* Profile Header */}
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
                            <img src={userProfile.avatar_url} alt="Profile" className="w-24 h-24 rounded-full border-4 border-slate-50 shadow-sm" />
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">{userProfile.full_name || userProfile.login}</h2>
                                <p className="text-slate-500">@{userProfile.login}</p>
                                <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                                    <span className="bg-slate-100 px-3 py-1 rounded-full">{userProfile.email || "No public email"}</span>
                                    <span>Joined {new Date(userProfile.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* YTD Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                <h3 className="text-slate-500 text-sm font-medium">Projects Active (YTD)</h3>
                                <div className="flex items-end gap-2 mt-2">
                                    <span className="text-4xl font-bold text-teal-600">{getStatsYTD().activeYTD}</span>
                                    <span className="text-sm text-slate-400 mb-1">projects</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">Updated in {new Date().getFullYear()}</p>
                            </div>

                            {/* Gitea Only: Total Contributions */}
                            {heatmapData.length > 0 && (
                                <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                    <h3 className="text-slate-500 text-sm font-medium">Contributions (YTD)</h3>
                                    <div className="flex items-end gap-2 mt-2">
                                        <span className="text-4xl font-bold text-blue-600">{getStatsYTD().totalContributions}</span>
                                        <span className="text-sm text-slate-400 mb-1">actions</span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">Commits, PRs, etc.</p>
                                </div>
                            )}

                            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                <h3 className="text-slate-500 text-sm font-medium">Total Projects</h3>
                                <div className="flex items-end gap-2 mt-2">
                                    <span className="text-4xl font-bold text-slate-800">{repos.length}</span>
                                    <span className="text-sm text-slate-400 mb-1">repos</span>
                                </div>
                            </div>
                        </div>

                        {/* Heatmap Visualization (Simple) */}
                        {heatmapData.length > 0 && (
                            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                <h3 className="text-lg font-bold text-slate-800 mb-4">Contribution Activity (Last 12 Months)</h3>
                                <div className="h-32 flex items-end gap-[2px]">
                                    {heatmapData.slice(-60).map((d: any, i: number) => (
                                        <div
                                            key={i}
                                            className="bg-teal-500 rounded-t-sm hover:bg-teal-600 transition-colors"
                                            style={{
                                                height: `${Math.min(d.contributions * 10, 100)}%`,
                                                width: '100%',
                                                opacity: Math.max(0.2, d.contributions / 5)
                                            }}
                                            title={`${new Date(d.timestamp * 1000).toLocaleDateString()}: ${d.contributions} contributions`}
                                        />
                                    ))}
                                </div>
                                <p className="text-xs text-slate-400 mt-2 text-center">Last 60 days activity trend</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Analytics View */}
                {/* Analytics View */}
                {activeTab === 'analytics' && repos.length > 0 && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                <h3 className="text-slate-500 text-sm font-medium">Total Repositories</h3>
                                <p className="text-4xl font-bold text-slate-800 mt-2">{repos.length}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                <h3 className="text-slate-500 text-sm font-medium">Total Stars</h3>
                                <div className="flex items-center gap-2 mt-2">
                                    <Star className="text-amber-400 w-6 h-6 fill-amber-400" />
                                    <p className="text-4xl font-bold text-slate-800">
                                        {repos.reduce((acc, curr) => acc + (curr.stars || 0), 0)}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                <h3 className="text-slate-500 text-sm font-medium">Active (Last 30 days)</h3>
                                <p className="text-4xl font-bold text-teal-600 mt-2">
                                    {getActivityData().find(d => d.name.includes('Active'))?.value}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Language Chart */}
                            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm pb-12">
                                <h3 className="text-lg font-bold text-slate-800 mb-6">Language Distribution</h3>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={getLanguageData()}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {getLanguageData().map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Activity Chart */}
                            <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                                <h3 className="text-lg font-bold text-slate-800 mb-6">Repository Activity</h3>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={getActivityData()}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                                            <RechartsTooltip
                                                cursor={{ fill: '#F1F5F9' }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            />
                                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                {getActivityData().map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Top Repos */}
                        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Top 5 Popular Repositories</h3>
                            <div className="overflow-hidden">
                                <table className="w-full text-left text-sm text-slate-600">
                                    <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3 rounded-l-lg">Repository</th>
                                            <th className="px-4 py-3">Language</th>
                                            <th className="px-4 py-3">Stars</th>
                                            <th className="px-4 py-3 rounded-r-lg">Last Updated</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {[...repos].sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 5).map(repo => (
                                            <tr key={repo.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-slate-900">{repo.name}</td>
                                                <td className="px-4 py-3">{repo.language || '-'}</td>
                                                <td className="px-4 py-3 text-amber-500 font-bold">{repo.stars}</td>
                                                <td className="px-4 py-3">{new Date(repo.updated_at).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Repositories List View */}
                {/* Repositories List View */}
                {activeTab === 'list' && repos.length > 0 && (
                    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800">
                                Repositories <span className="text-sm font-normal text-slate-500 ml-2">({repos.length} found)</span>
                            </h2>
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search repositories..."
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {filteredRepos.map((repo) => (
                                <div key={repo.id} className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                                    {/* Source Badge */}
                                    <div className={`absolute top-0 right-0 p-2 rounded-bl-xl ${repo.source === 'github' ? 'bg-black text-white' : 'bg-teal-600 text-white'}`}>
                                        {repo.source === 'github' ? <Github className="w-4 h-4" /> : <GitBranch className="w-4 h-4" />}
                                    </div>

                                    <div className="flex justify-between items-start mb-4 pr-8">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={repo.owner.avatar_url}
                                                alt={repo.owner.login}
                                                className="w-10 h-10 rounded-full border border-slate-200"
                                            />
                                            <div>
                                                <a
                                                    href={repo.html_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1 hover:underline"
                                                    title={repo.full_name}
                                                >
                                                    {repo.name}
                                                </a>
                                                <div className="flex items-center text-xs text-slate-500 gap-1">
                                                    {repo.private ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                                                    <span>{repo.owner.login}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-slate-600 text-sm mb-4 line-clamp-2 h-10">
                                        {repo.description || "No description provided."}
                                    </p>

                                    <div className="flex items-center justify-between text-sm text-slate-500 pt-4 border-t border-slate-50">
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-1" title="Stars">
                                                <Star className="w-4 h-4 text-amber-400" />
                                                <span>{repo.stars}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title="Forks">
                                                <GitBranch className="w-4 h-4" />
                                                <span>{repo.forks}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <a
                                                    href={repo.html_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                    Open
                                                </a>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {repo.language && (
                                                <span className="text-xs bg-slate-100 px-2 py-1 rounded-full text-slate-600">
                                                    {repo.language}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {filteredRepos.length === 0 && (
                            <div className="text-center py-12 text-slate-500">
                                No repositories found matching your search.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

