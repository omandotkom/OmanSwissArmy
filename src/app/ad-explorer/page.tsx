"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Folder, File, User, Users, Server, ChevronRight, ChevronDown, Database, Search, Loader2, Info, ArrowLeft, Eye, EyeOff, X, Lock, Unlock, AlertTriangle, Save, Book, Trash2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import { trackActivity } from "@/lib/tracker";
import { LdapConnection, saveLdapConnection, getAllLdapConnections, deleteLdapConnection } from '@/services/connection-storage';

// Helper to convert Windows FileTime (100-nanosecond intervals since Jan 1, 1601 UTC) to Date
const formatAdTimestamp = (val: any): string => {
    if (!val || val === '0' || val === 0) return '-';
    try {
        // Handle if it's high/low int object or string
        const longVal = BigInt(val.toString());
        if (longVal === BigInt(0)) return '-';
        if (longVal >= BigInt("9223372036854775807")) return 'Never'; // Max value often means never/forever

        // Windows ticks to Unix millis: (ticks - 116444736000000000) / 10000
        const unixMillis = Number((longVal - BigInt("116444736000000000")) / BigInt(10000));
        return new Date(unixMillis).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
    } catch (e) {
        return String(val);
    }
};

const isAccountLocked = (attrs: any): boolean => {
    if (!attrs || !attrs.lockoutTime) return false;
    try {
        const val = BigInt(attrs.lockoutTime.toString());
        // 0 = Not Locked, Max Val = Never/Not Applicable
        return val !== BigInt(0) && val < BigInt("9223372036854775807");
    } catch {
        return false;
    }
};

interface LdapNodeProps {
    dn: string;
    name: string;
    type: string;
    isContainer: boolean;
    level: number;
    onSelect: (node: any) => void;
    onExpand: (dn: string) => void;
    expandedConf: Record<string, boolean>;
    childrenNodes: Record<string, any[]>;
    loadingNodes: Record<string, boolean>;
}

const EntryIcon = ({ type, isContainer }: { type: string, isContainer: boolean }) => {
    if (type === 'User') return <User className="w-4 h-4 text-blue-400" />;
    if (type === 'Group') return <Users className="w-4 h-4 text-green-400" />;
    if (type === 'Computer') return <Server className="w-4 h-4 text-gray-400" />;
    if (type === 'OU') return <Folder className="w-4 h-4 text-yellow-400" />;
    if (isContainer) return <Folder className="w-4 h-4 text-yellow-500 fill-yellow-600/30" />;
    return <File className="w-4 h-4 text-zinc-500" />;
};

const LdapTreeNode = ({ dn, name, type, isContainer, level, onSelect, onExpand, expandedConf, childrenNodes, loadingNodes }: LdapNodeProps) => {
    // ... (keep existing)
    const isExpanded = !!expandedConf[dn];
    const isLoading = !!loadingNodes[dn];
    const children = childrenNodes[dn] || [];

    const handleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        onExpand(dn);
        trackActivity({ action: "EXPAND_NODE", label: isExpanded ? "COLLAPSE" : "EXPAND", details: { dn } });
    };

    return (
        <div className="select-none text-zinc-200">
            <div
                className={`flex items-center py-1 px-2 hover:bg-zinc-800/80 cursor-pointer transition-colors ${level > 0 ? 'border-l border-zinc-800 ml-3' : ''}`}
                onClick={() => {
                    onSelect({ dn, name, type, attributes: {} });
                    trackActivity({ action: "SELECT_NODE", label: name, details: { dn, type } });
                }}
                style={{ paddingLeft: `${level * 0}px` }}
            >
                <div className="mr-1 cursor-pointer" onClick={handleExpand}>
                    {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    ) : isContainer ? (
                        isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />
                    ) : (
                        <span className="w-4 h-4 inline-block" />
                    )}
                </div>

                <EntryIcon type={type} isContainer={isContainer} />
                <span className="ml-2 text-sm truncate">{name}</span>
            </div>

            {isExpanded && (
                <div className="ml-2">
                    {children.length > 0 ? (
                        children.map((child: any) => (
                            <LdapTreeNode
                                key={child.dn}
                                dn={child.dn}
                                name={child.name}
                                type={child.type}
                                isContainer={child.isContainer}
                                level={level + 1}
                                onSelect={onSelect}
                                onExpand={onExpand}
                                expandedConf={expandedConf}
                                childrenNodes={childrenNodes}
                                loadingNodes={loadingNodes}
                            />
                        ))
                    ) : (
                        <div className="pl-8 py-1 text-xs text-zinc-500 italic">No items</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function ADExplorerPage() {
    const [config, setConfig] = useState({
        url: 'ldap://192.168.1.5:389',
        username: 'administrator@example.com',
        password: '',
        baseDN: 'DC=example,DC=com'
    });

    // Connection Manager State
    const [savedConnections, setSavedConnections] = useState<LdapConnection[]>([]);
    const [showSavedList, setShowSavedList] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadSavedConnections();
    }, []);

    const loadSavedConnections = async () => {
        try {
            const conns = await getAllLdapConnections();
            setSavedConnections(conns);
        } catch (e) {
            console.error("Failed to load connections", e);
        }
    };

    const handleSaveConnection = async () => {
        if (!saveName.trim()) return;

        // Check duplicate
        const exists = savedConnections.some(c => c.name.toLowerCase() === saveName.trim().toLowerCase());
        if (exists) {
            setSaveMessage({ type: 'error', text: 'Name already exists' });
            setTimeout(() => setSaveMessage(null), 3000);
            return;
        }

        setIsSaving(true);
        try {
            const newConn: LdapConnection = {
                id: uuidv4(),
                name: saveName.trim(),
                url: config.url,
                username: config.username,
                password: config.password,
                baseDN: config.baseDN
            };
            await saveLdapConnection(newConn);
            setSaveName('');
            await loadSavedConnections();
            setSaveMessage({ type: 'success', text: 'Saved!' });
            setTimeout(() => setSaveMessage(null), 3000);

            trackActivity({ action: "SAVE_CONNECTION", label: "AD Explorer", details: { name: newConn.name } });
        } catch (e) {
            console.error(e);
            setSaveMessage({ type: 'error', text: 'Failed to save' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadConnection = (conn: LdapConnection) => {
        setConfig({
            url: conn.url,
            username: conn.username,
            password: conn.password || '',
            baseDN: conn.baseDN
        });
        trackActivity({ action: "LOAD_CONNECTION", label: "AD Explorer", details: { name: conn.name } });
        setShowSavedList(false);
    };

    const handleDeleteConnection = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this connection?')) return;
        await deleteLdapConnection(id);
        await loadSavedConnections();
    };

    const [isConnected, setIsConnected] = useState(false);
    const [rootNodes, setRootNodes] = useState<any[]>([]);
    const [childrenMap, setChildrenMap] = useState<Record<string, any[]>>({});
    const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
    const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
    const [selectedNode, setSelectedNode] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [globalLoading, setGlobalLoading] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Password visibility logic
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [passwordTimer, setPasswordTimer] = useState<NodeJS.Timeout | null>(null);

    // Debounce search effect
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchQuery.trim()) {
                handleSearch();
            } else {
                setSearchResults([]);
            }
        }, 600);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const togglePasswordVisibility = () => {
        if (isPasswordVisible) {
            // Currently visible, hide it immediately and clear timer
            setIsPasswordVisible(false);
            if (passwordTimer) clearTimeout(passwordTimer);
            setPasswordTimer(null);
        } else {
            // Currently hidden, show it and set timer
            setIsPasswordVisible(true);
            const timer = setTimeout(() => {
                setIsPasswordVisible(false);
                setPasswordTimer(null);
            }, 60000); // 1 minute
            setPasswordTimer(timer);
        }
    };

    // Full attributes of selected node (fetched on select if needed, or taken from entry)
    // For simplicity, we assume the entry already has attributes from the browse call
    const [selectedAttributes, setSelectedAttributes] = useState<Record<string, any>>({});

    const handleConnect = async () => {
        setGlobalLoading(true);
        setError(null);

        let cleanUsername = config.username.trim();
        // Remove surrounding quotes if user copied from JSON/Config
        if ((cleanUsername.startsWith('"') && cleanUsername.endsWith('"')) ||
            (cleanUsername.startsWith("'") && cleanUsername.endsWith("'"))) {
            cleanUsername = cleanUsername.slice(1, -1);
        }
        // Handle common JSON/unicode escapes usually found in config files
        cleanUsername = cleanUsername.replace(/\\u0026/g, '&');

        trackActivity({ action: "CONNECT_LDAP", label: "Attempt", details: { url: config.url, baseDN: config.baseDN, username: cleanUsername } });
        try {
            const res = await fetch('/api/ad/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, username: cleanUsername, scope: 'one' }) // Use sanitized username
            });
            const json = await res.json();

            if (!res.ok) throw new Error(json.error || 'Connection failed');

            // Root is actually the BaseDN itself, but our API returns children of BaseDN.
            // So let's fake a Root Entry for the Base DN
            const rootEntry = {
                dn: config.baseDN,
                name: config.baseDN,
                type: 'Domain',
                isContainer: true,
                attributes: { distinguishedName: config.baseDN }
            };

            setRootNodes([rootEntry]);
            setChildrenMap({ [config.baseDN]: json.data });
            setExpandedMap({ [config.baseDN]: true }); // Auto expand root
            setIsConnected(true);

            // Update config with sanitized username so subsequent calls (like fetchChildren) use it
            if (cleanUsername !== config.username) {
                setConfig(prev => ({ ...prev, username: cleanUsername }));
            }

            trackActivity({ action: "CONNECT_LDAP", label: "Success" });
        } catch (err: any) {
            setError(err.message);
            trackActivity({ action: "CONNECT_LDAP", label: "Failed", details: { error: err.message } });
        } finally {
            setGlobalLoading(false);
        }
    };

    const fetchChildren = async (dn: string) => {
        if (childrenMap[dn]) return; // Already fetched

        setLoadingMap(prev => ({ ...prev, [dn]: true }));
        try {
            const res = await fetch('/api/ad/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, baseDN: dn, scope: 'one' })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            setChildrenMap(prev => ({ ...prev, [dn]: json.data }));
        } catch (err: any) {
            console.error("Failed to fetch node children:", err);
            // Optional: show toast
        } finally {
            setLoadingMap(prev => ({ ...prev, [dn]: false }));
        }
    };

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        trackActivity({ action: "SEARCH_LDAP", label: "Query", details: { query: searchQuery } });

        try {
            const filter = `(|(sAMAccountName=*${searchQuery}*)(cn=*${searchQuery}*)(name=*${searchQuery}*)(mail=*${searchQuery}*))`;
            const res = await fetch('/api/ad/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, scope: 'sub', filter })
            });
            const json = await res.json();

            if (!res.ok) throw new Error(json.error || 'Search failed');
            setSearchResults(json.data);
            trackActivity({ action: "SEARCH_LDAP", label: "Success", details: { count: json.data.length } });

        } catch (err: any) {
            console.error(err);
            trackActivity({ action: "SEARCH_LDAP", label: "Failed", details: { error: err.message } });
        } finally {
            setIsSearching(false);
        }
    };

    const onExpand = async (dn: string) => {
        const isExpanding = !expandedMap[dn];
        setExpandedMap(prev => ({ ...prev, [dn]: isExpanding }));

        if (isExpanding) {
            await fetchChildren(dn);
        }
    };

    const onSelect = (node: any) => {
        // When searching, we want to select from search results or tree
        // The node passed here already contains attributes from the API (which are the limited set)

        // If we selected from search results, that node is self-contained
        setSelectedNode(node);
        setSelectedAttributes(node.attributes || {});
    };

    return (
        <div className="flex h-screen bg-zinc-950 flex-col text-zinc-100">
            {/* Header */}
            <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-xl font-bold flex items-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
                        <Database className="w-6 h-6 mr-2 text-blue-400" />
                        AD Explorer
                    </h1>
                </div>
                {isConnected && (
                    <button
                        onClick={() => {
                            setIsConnected(false);
                            trackActivity({ action: "DISCONNECT_LDAP" });
                        }}
                        className="text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
                    >
                        Disconnect
                    </button>
                )}
            </header>

            <div className="flex-1 overflow-hidden flex">
                {/* Left Panel: Sidebar / Tree */}
                <div className="w-1/3 min-w-[300px] border-r border-zinc-800 bg-zinc-900 flex flex-col">
                    {!isConnected ? (
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-zinc-200">Connection Details</h2>
                                <button
                                    onClick={() => setShowSavedList(!showSavedList)}
                                    className={`p-1.5 rounded-md transition-colors ${showSavedList ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                                    title="Saved Connections"
                                >
                                    <Book className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Saved Connections List */}
                            {showSavedList && (
                                <div className="mb-6 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                    <div className="bg-zinc-900 px-3 py-2 border-b border-zinc-800 text-xs font-bold text-zinc-500 uppercase">
                                        Saved Profiles
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        {savedConnections.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-zinc-500">No saved connections</div>
                                        ) : (
                                            savedConnections.map(conn => (
                                                <div
                                                    key={conn.id}
                                                    className="px-3 py-2 hover:bg-zinc-800 flex items-center justify-between group cursor-pointer border-b border-zinc-800/50 last:border-0"
                                                    onClick={() => handleLoadConnection(conn)}
                                                >
                                                    <div className="overflow-hidden">
                                                        <div className="text-sm font-medium text-zinc-300 truncate">{conn.name}</div>
                                                        <div className="text-xs text-zinc-500 truncate">{conn.url}</div>
                                                    </div>
                                                    <button
                                                        onClick={(e) => handleDeleteConnection(e, conn.id)}
                                                        className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {error && (
                                <div className="mb-4 bg-red-900/20 border border-red-800 text-red-200 px-4 py-3 rounded text-sm">
                                    {error}
                                </div>
                            )}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">LDAP URL</label>
                                    <input
                                        type="text"
                                        value={config.url}
                                        onChange={e => setConfig({ ...config, url: e.target.value })}
                                        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-zinc-500"
                                        placeholder="ldap://hostname:389"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">Username / Bind DN</label>
                                    <input
                                        type="text"
                                        value={config.username}
                                        onChange={e => setConfig({ ...config, username: e.target.value })}
                                        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-zinc-500"
                                        placeholder="DOMAIN\User"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
                                    <div className="relative">
                                        <input
                                            type={isPasswordVisible ? "text" : "password"}
                                            value={config.password}
                                            onChange={e => setConfig({ ...config, password: e.target.value })}
                                            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={togglePasswordVisibility}
                                            className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200"
                                        >
                                            {isPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">Base DN</label>
                                    <input
                                        type="text"
                                        value={config.baseDN}
                                        onChange={e => setConfig({ ...config, baseDN: e.target.value })}
                                        className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-zinc-500"
                                        placeholder="DC=example,DC=com"
                                    />
                                </div>
                                <button
                                    onClick={handleConnect}
                                    disabled={globalLoading}
                                    className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex justify-center items-center"
                                >
                                    {globalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Connect'}
                                </button>

                                {/* Save Profile Form */}
                                <div className="pt-4 border-t border-zinc-800 mt-4">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={saveName}
                                            onChange={(e) => setSaveName(e.target.value)}
                                            placeholder="Profile Name (e.g. Prod AD)"
                                            className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-md px-3 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm placeholder-zinc-500"
                                        />
                                        <button
                                            onClick={handleSaveConnection}
                                            disabled={!saveName.trim() || isSaving}
                                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-md border border-zinc-700 transition-colors disabled:opacity-50"
                                            title="Save Connection"
                                        >
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {saveMessage && (
                                        <div className={`mt-2 text-xs font-medium px-2 py-1 rounded ${saveMessage.type === 'success' ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
                                            {saveMessage.text}
                                        </div>
                                    )}
                                </div>

                                {/* Tutorial Card */}
                                <div className="mt-6 bg-blue-900/20 border border-blue-800 rounded-lg p-4 text-sm text-blue-200 shadow-sm">
                                    <h3 className="font-semibold flex items-center mb-3 text-blue-300">
                                        <Info className="w-4 h-4 mr-2" />
                                        Panduan Koneksi LDAP
                                    </h3>
                                    <ul className="space-y-3 text-xs text-blue-200/80">
                                        <li className="flex flex-col gap-1">
                                            <span className="font-bold text-blue-300">LDAP URL</span>
                                            <span>Alamat IP atau Hostname server Domain Controller.</span>
                                            <code className="bg-blue-900/40 px-1 py-0.5 rounded border border-blue-700 w-fit text-blue-100">ldap://10.10.1.5:389</code>
                                        </li>
                                        <li className="flex flex-col gap-1">
                                            <span className="font-bold text-blue-300">Username</span>
                                            <span>Gunakan format domain backslash user atau UPN.</span>
                                            <div className="flex gap-1 flex-wrap">
                                                <code className="bg-blue-900/40 px-1 py-0.5 rounded border border-blue-700 text-blue-100">CORP\Administrator</code>
                                                <span className="opacity-70">atau</span>
                                                <code className="bg-blue-900/40 px-1 py-0.5 rounded border border-blue-700 text-blue-100">admin@corp.local</code>
                                            </div>
                                        </li>
                                        <li className="flex flex-col gap-1">
                                            <span className="font-bold text-blue-300">Base DN</span>
                                            <span>Titik awal pencarian (Root Directory). Biasanya sesuai nama domain.</span>
                                            <code className="bg-blue-900/40 px-1 py-0.5 rounded border border-blue-700 w-fit text-blue-100">DC=corp,DC=local</code>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Search Box Sticky Header */}
                            <div className="p-2 border-b border-zinc-800 bg-zinc-900 sticky top-0 z-10">
                                <form onSubmit={handleSearch} className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search user, group..."
                                        className="w-full bg-zinc-800 border border-zinc-700 text-sm text-zinc-100 rounded-md pl-8 pr-8 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none focus:border-blue-500 placeholder-zinc-500"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-2" />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchQuery('');
                                                setSearchResults([]);
                                            }}
                                            className="absolute right-2 top-2 text-zinc-500 hover:text-white"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </form>
                            </div>

                            <div className="flex-1 overflow-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                                {isSearching ? (
                                    <div className="flex justify-center items-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                    </div>
                                ) : searchQuery && searchResults.length > 0 ? (
                                    /* Search Results View */
                                    <div className="space-y-1">
                                        <div className="text-xs text-zinc-500 px-2 py-1 mb-2 uppercase tracking-wider font-semibold">
                                            Found {searchResults.length} results
                                        </div>
                                        {searchResults.map((entry) => {
                                            const locked = isAccountLocked(entry.attributes);
                                            return (
                                                <div
                                                    key={entry.dn}
                                                    className="flex items-center py-2 px-2 hover:bg-zinc-800 rounded cursor-pointer transition-colors"
                                                    onClick={() => onSelect(entry)}
                                                >
                                                    <div className="relative">
                                                        <EntryIcon type={entry.type} isContainer={entry.isContainer} />
                                                        {locked && <div className="absolute -top-1 -right-1 bg-zinc-900 rounded-full"><Lock className="w-3 h-3 text-red-500" /></div>}
                                                    </div>
                                                    <div className="ml-2 overflow-hidden">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`text-sm font-medium truncate ${locked ? 'text-red-400' : 'text-zinc-200'}`}>
                                                                {entry.name}
                                                            </div>
                                                            {locked && <span className="text-[10px] bg-red-900/30 text-red-400 px-1.5 py-0.5 rounded border border-red-900/50">LOCKED</span>}
                                                        </div>
                                                        <div className="text-xs text-zinc-500 truncate" title={entry.dn}>{entry.dn}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : searchQuery && searchResults.length === 0 ? (
                                    <div className="text-center py-8 text-zinc-500">
                                        <p>No results found for "{searchQuery}"</p>
                                    </div>
                                ) : (
                                    /* Tree View */
                                    rootNodes.map(node => (
                                        <LdapTreeNode
                                            key={node.dn}
                                            {...node}
                                            level={0}
                                            onSelect={onSelect}
                                            onExpand={onExpand}
                                            expandedConf={expandedMap}
                                            childrenNodes={childrenMap}
                                            loadingNodes={loadingMap}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Panel: Details */}
                <div className="flex-1 bg-zinc-950 flex flex-col overflow-hidden">
                    {selectedNode ? (
                        <div className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                            <div className="bg-zinc-900 shadow-lg rounded-lg p-6 mb-6 border border-zinc-800 relative">
                                {/* Account Lockout Status Header */}
                                {isAccountLocked(selectedAttributes) && (
                                    <div className="absolute top-0 left-0 right-0 bg-red-900/20 border-b border-red-900/30 text-red-400 px-6 py-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm font-bold animate-pulse">
                                            <Lock className="w-4 h-4" />
                                            ACCOUNT LOCKED
                                        </div>
                                    </div>
                                )}

                                <div className={`flex items-center mb-4 ${isAccountLocked(selectedAttributes) ? 'mt-8' : ''}`}>
                                    <div className="p-3 bg-blue-900/20 rounded-full mr-4 border border-blue-800/30">
                                        <EntryIcon type={selectedNode.type} isContainer={false} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-zinc-100">{selectedNode.name}</h2>
                                        <p className="text-zinc-500 text-sm break-all">{selectedNode.dn}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-zinc-950/50 rounded border border-zinc-800">
                                        <span className="block text-xs font-uppercase text-zinc-500 font-bold tracking-wider mb-1">TYPE</span>
                                        <span className="text-zinc-300 font-medium">{selectedNode.type}</span>
                                    </div>
                                    {/* Account Audit Card */}
                                    <div className="p-4 bg-zinc-950/50 rounded border border-zinc-800">
                                        <span className="block text-xs font-uppercase text-zinc-500 font-bold tracking-wider mb-1">LOGIN AUDIT</span>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Status</span>
                                                <span className={isAccountLocked(selectedAttributes) ? "text-red-400 font-bold" : "text-green-400 font-medium"}>
                                                    {isAccountLocked(selectedAttributes) ? "LOCKED" : "Active"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Failed Attempts</span>
                                                <span className="text-zinc-200">{selectedAttributes.badPwdCount || 0}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Last Bad Pwd</span>
                                                <span className="text-zinc-200 text-xs text-right">{formatAdTimestamp(selectedAttributes.badPasswordTime)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm mt-1 pt-1 border-t border-zinc-800">
                                                <span className="text-zinc-400">Lockout Time</span>
                                                <span className={`text-xs text-right ${isAccountLocked(selectedAttributes) ? "text-red-300" : "text-zinc-200"}`}>
                                                    {formatAdTimestamp(selectedAttributes.lockoutTime)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-zinc-900 shadow-lg rounded-lg overflow-hidden border border-zinc-800">
                                <div className="bg-zinc-800/50 px-6 py-3 border-b border-zinc-800">
                                    <h3 className="font-semibold text-zinc-300">Attributes</h3>
                                </div>
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="px-6 py-3 bg-zinc-900 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800 w-1/3">Attribute</th>
                                            <th className="px-6 py-3 bg-zinc-900 text-xs font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">Value</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {Object.entries(selectedAttributes).map(([key, value]) => (
                                            <tr key={key} className="hover:bg-zinc-800/40 transition-colors">
                                                <td className="px-6 py-3 font-medium text-zinc-400 text-sm font-mono">{key}</td>
                                                <td className="px-6 py-3 text-zinc-300 text-sm break-all">
                                                    {['lockoutTime', 'badPasswordTime', 'lastLogon', 'pwdLastSet', 'whenChanged'].includes(key) ? (
                                                        <div className="flex flex-col">
                                                            <span>{String(value)}</span>
                                                            <span className="text-xs text-zinc-500">{formatAdTimestamp(value)}</span>
                                                        </div>
                                                    ) : Array.isArray(value) ? (
                                                        <ul className="list-disc list-inside text-zinc-300">
                                                            {value.map((v, i) => <li key={i}>{String(v)}</li>)}
                                                        </ul>
                                                    ) : (
                                                        String(value)
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {Object.keys(selectedAttributes).length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="px-6 py-8 text-center text-zinc-600 italic">No attributes found</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
                            <Database className="w-16 h-16 mb-4 text-zinc-800" />
                            <p className="text-lg">Select an object from the tree to view details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
