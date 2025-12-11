'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Folder,
    File,
    ArrowLeft,
    RefreshCw,
    Eye,
    Database,
    Server,
    Home,
    Terminal,
    LogOut,
    Download,
    Filter,
    Search,
    X,
    FileSpreadsheet,
    Trash2
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import * as XLSX from 'xlsx';
import { UserBadge } from "@/components/UserBadge";

interface FileItem {
    name: string;
    isDirectory: boolean;
    size: string;
    lastModified: string;
    permissions: string;
}

interface VolumeMount {
    name: string;
    mountPath: string;
    claimName?: string;
    storageClass?: string;
}

interface PodInfo {
    name: string;
    status: string;
    mounts: VolumeMount[];
}

interface PvcInfo {
    name: string;
    status: string;
    capacity: string;
    storageClass: string;
    accessModes: string[];
}

interface SearchResult {
    namespace: string;
    podName: string;
    pvcName: string;
    status: string;
    storageClass: string;
}

export default function PvcBrowserPage() {
    const searchParams = useSearchParams();
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [checkingLogin, setCheckingLogin] = useState(true);

    // Auto-Load from URL
    useEffect(() => {
        if (isLoggedIn && searchParams) {
            const prj = searchParams.get('project');
            const pod = searchParams.get('pod');
            const path = searchParams.get('path');

            if (prj) {
                setSelectedProject(prj);
                if (pod) {
                    setSelectedPodName(pod);
                    const targetPath = path || '/';
                    setCurrentPath(targetPath);
                    // We need a slight delay or ensure logic allows fetching efficiently
                    setTimeout(() => fetchFiles(prj, pod, targetPath), 500);
                }
            }
        }
    }, [isLoggedIn]);

    // Login State
    const [loginCommand, setLoginCommand] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Data State
    const [projects, setProjects] = useState<string[]>([]);
    const [pods, setPods] = useState<PodInfo[]>([]);
    const [availableStorageClasses, setAvailableStorageClasses] = useState<string[]>([]);

    // Selection State
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedStorageClass, setSelectedStorageClass] = useState('');
    const [selectedPodName, setSelectedPodName] = useState('');
    const [currentPod, setCurrentPod] = useState<PodInfo | null>(null);
    const [currentPath, setCurrentPath] = useState('/');

    // File & PVC Info State
    const [files, setFiles] = useState<FileItem[]>([]);
    const [pvcInfo, setPvcInfo] = useState<PvcInfo | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [previewContent, setPreviewContent] = useState<string | null>(null);

    // Search/Finder State
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [searchLogs, setSearchLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Delete State
    const [deleteItem, setDeleteItem] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!deleteItem) return;
        setIsDeleting(true);
        try {
            const fullPath = (currentPath === '/' ? '' : currentPath) + '/' + deleteItem;
            const res = await fetch('/api/oc/delete-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    namespace: selectedProject,
                    pod: selectedPodName,
                    path: fullPath
                })
            });
            const data = await res.json();
            if (res.ok) {
                // Refresh
                fetchFiles(selectedProject, selectedPodName, currentPath);
                setDeleteItem(null);
            } else {
                setError(data.error);
                setDeleteItem(null);
            }
        } catch (e) { setError('Delete failed'); }
        finally { setIsDeleting(false); }
    };

    // Filtered Pods Logic
    const filteredPods = pods.filter(pod => {
        if (!selectedStorageClass) return true;
        return pod.mounts.some(m => m.storageClass === selectedStorageClass);
    });

    useEffect(() => {
        checkLoginStatus();
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [searchLogs]);

    const checkLoginStatus = async () => {
        setCheckingLogin(true);
        try {
            const res = await fetch('/api/oc/projects');
            if (res.ok) {
                setIsLoggedIn(true);
                const data = await res.json();
                // Deduplicate projects just in case
                const uniqueProjects = Array.from(new Set(data.projects as string[]));
                setProjects(uniqueProjects);
            } else {
                setIsLoggedIn(false);
            }
        } catch (e) {
            setIsLoggedIn(false);
        } finally {
            setCheckingLogin(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        setIsLoggingIn(true);
        try {
            const res = await fetch('/api/oc/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: loginCommand })
            });
            const data = await res.json();
            if (res.ok) {
                setIsLoggedIn(true);
                fetchProjects();
            } else {
                setLoginError(data.error);
            }
        } catch (err) {
            setLoginError('Server error');
        } finally {
            setIsLoggingIn(false);
        }
    };

    useEffect(() => {
        if (selectedProject) {
            fetchPods(selectedProject);
            setSelectedPodName('');
            setSelectedStorageClass('');
            setCurrentPod(null);
            setFiles([]);
            setCurrentPath('/');
            setPvcInfo(null);
        }
    }, [selectedProject]);

    useEffect(() => {
        if (selectedProject && selectedPodName) {
            fetchFiles(selectedProject, selectedPodName, currentPath);
        }
    }, [selectedProject, selectedPodName, currentPath]);

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/oc/projects');
            const data = await res.json();
            if (res.ok) setProjects(data.projects || []);
            else setError(data.error);
        } catch (err: any) { setError('Failed to fetch projects'); }
        finally { setLoading(false); }
    };

    const fetchPods = async (project: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/oc/pods?namespace=${project}`);
            const data = await res.json();
            if (res.ok) {
                const podsData: PodInfo[] = data.pods || [];
                setPods(podsData);
                const scSet = new Set<string>();
                podsData.forEach(pod => {
                    pod.mounts.forEach(m => {
                        if (m.storageClass) scSet.add(m.storageClass);
                    });
                });
                setAvailableStorageClasses(Array.from(scSet).sort());

                // Auto-select first pod for better UX
                if (podsData.length > 0) {
                    setSelectedPodName(podsData[0].name);
                }
            } else setError(data.error);
        } catch (err) { setError('Failed to fetch pods'); }
        finally { setLoading(false); }
    };

    const fetchFiles = async (project: string, pod: string, path: string) => {
        setLoading(true);
        setError('');
        try {
            const encodedPath = encodeURIComponent(path);
            const res = await fetch(`/api/oc/files?namespace=${project}&pod=${pod}&path=${encodedPath}`);
            const data = await res.json();
            if (res.ok) setFiles(data.files || []);
            else {
                setError(data.error);
                setFiles([]);
            }
        } catch (err) { setError('Failed to fetch files'); }
        finally { setLoading(false); }
    };

    const fetchPvcInfo = async (pvcName: string) => {
        try {
            const res = await fetch(`/api/oc/pvc?namespace=${selectedProject}&pvcName=${pvcName}`);
            const data = await res.json();
            if (res.ok) setPvcInfo(data.pvc);
        } catch (e) {
            console.error("Failed to fetch PVC info", e);
        }
    };

    const handleSearchStorage = async () => {
        setIsSearching(true);
        setSearchResults([]);
        setSearchLogs([]);
        setShowSearchModal(true);

        const sc = 'px-sc';

        try {
            // Client-side iteration for realtime feedback
            for (const project of projects) {
                setSearchLogs(prev => [...prev, `Executing: oc get pods -n ${project} -o json (# Searching PVC with SC ${sc})...`]);

                const res = await fetch(`/api/oc/search-sc-target?project=${project}&sc=${sc}`);
                const data = await res.json();

                if (res.ok && data.results && data.results.length > 0) {
                    setSearchResults(prev => [...prev, ...data.results]);
                    setSearchLogs(prev => [...prev, `> Found ${data.results.length} related pods in ${project}`]);
                }
            }
            setSearchLogs(prev => [...prev, 'Done.']);

        } catch (e) {
            setError("Search failed");
            setSearchLogs(prev => [...prev, 'Error: Search failed']);
        } finally {
            setIsSearching(false);
        }
    };

    const handleExportExcel = () => {
        if (searchResults.length === 0) return;

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(searchResults);
        XLSX.utils.book_append_sheet(wb, ws, "px-sc-finder");
        XLSX.writeFile(wb, "px-sc-storage-finder.xlsx");
    };

    const handlePodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const podName = e.target.value;
        setSelectedPodName(podName);
        const pod = pods.find(p => p.name === podName) || null;
        setCurrentPod(pod);
        setPvcInfo(null);

        if (pod && pod.mounts.length > 0) {
            let bestMount = pod.mounts[0];
            if (selectedStorageClass) {
                const matchingMount = pod.mounts.find(m => m.storageClass === selectedStorageClass);
                if (matchingMount) bestMount = matchingMount;
            }
            setCurrentPath(bestMount.mountPath);
            if (bestMount.claimName) fetchPvcInfo(bestMount.claimName);
        } else {
            setCurrentPath('/');
        }
    };

    const handleMountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newPath = e.target.value;
        setCurrentPath(newPath);
        const mount = currentPod?.mounts.find(m => m.mountPath === newPath);
        if (mount?.claimName) fetchPvcInfo(mount.claimName);
        else setPvcInfo(null);
    };

    const handleFolderClick = (folderName: string) => {
        const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
        setCurrentPath(newPath);
    };

    const handleFileView = async (fileName: string) => {
        const filePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
        const url = `/api/oc/read?namespace=${selectedProject}&pod=${selectedPodName}&path=${encodeURIComponent(filePath)}`;
        try {
            const res = await fetch(url);
            const text = await res.text();
            setPreviewContent(text);
        } catch (e) { alert('Failed to load file'); }
    };

    const goUp = () => {
        if (currentPath === '/') return;
        const parts = currentPath.split('/').filter(Boolean);
        parts.pop();
        const newPath = '/' + parts.join('/');
        setCurrentPath(newPath || '/');
    };

    if (checkingLogin) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading...</div>;

    if (!isLoggedIn) {
        // Login Form (Same as before)
        return (
            <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent mb-2">OpenShift Login</h1>
                        <p className="text-slate-400">Paste your login command from OpenShift Web Console</p>
                    </div>
                    <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-xl space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Login Command</label>
                            <textarea
                                value={loginCommand}
                                onChange={(e) => setLoginCommand(e.target.value)}
                                placeholder="oc login --token=... --server=..."
                                className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-300 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                required
                            />
                            <p className="text-xs text-slate-500">Copy command ini dari menu "Copy Login Command" di OpenShift Console Anda.</p>
                        </div>
                        {loginError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">{loginError}</div>}
                        <button type="submit" disabled={isLoggingIn} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                            {isLoggingIn ? <RefreshCw className="animate-spin" size={20} /> : <Terminal size={20} />}
                            {isLoggingIn ? 'Connecting...' : 'Connect to Cluster'}
                        </button>
                        <div className="flex justify-center">
                            <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">Back to Home</Link>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-slate-800 rounded-full transition-colors"><ArrowLeft size={24} /></Link>
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">PVC Browser</h1>
                        <p className="text-slate-400">Connected to OpenShift</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {isLoggedIn && <UserBadge />}
                    <button onClick={() => setIsLoggedIn(false)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700">
                        <LogOut size={16} /> Disconnect
                    </button>
                </div>
            </div>

            {/* Custom Features Card */}
            <div className="bg-slate-800/10 border border-slate-700/50 p-6 rounded-xl mb-6">
                <h2 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
                    <Database size={20} className="text-purple-400" />
                    Custom Features
                </h2>
                <div className="flex gap-4">
                    <button
                        onClick={handleSearchStorage}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors shadow-lg shadow-purple-900/20"
                    >
                        <Search size={18} />
                        px-sc Storage Finder
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-6 mb-8 bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300"><Database size={16} /> Project</label>
                        <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                            <option value="">-- Select Project --</option>
                            {Array.from(new Set(projects)).map((p, i) => <option key={`${p}-${i}`} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300"><Filter size={16} /> Filter Storage Class</label>
                        <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50" value={selectedStorageClass} onChange={(e) => { setSelectedStorageClass(e.target.value); setSelectedPodName(''); }} disabled={!selectedProject || availableStorageClasses.length === 0}>
                            <option value="">-- All Storage Classes --</option>
                            {availableStorageClasses.map((sc, i) => <option key={`${sc}-${i}`} value={sc}>{sc}</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300"><Server size={16} /> Pod {selectedStorageClass && <span className="text-xs text-blue-400">(Filtered)</span>}</label>
                        <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50" value={selectedPodName} onChange={handlePodChange} disabled={!selectedProject}>
                            <option value="">-- Select Pod --</option>
                            {filteredPods.map((pod, i) => <option key={`${pod.name}-${i}`} value={pod.name}>{pod.name} ({pod.status})</option>)}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">Mount Point (PVC)</label>
                        <select className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50" disabled={!currentPod} onChange={handleMountChange} value={currentPod?.mounts.some(m => m.mountPath === currentPath) ? currentPath : ''}>
                            <option value="/">/ (Root)</option>
                            {currentPod?.mounts.map(m => <option key={m.mountPath} value={m.mountPath}>{m.name} ({m.mountPath}){m.claimName ? (m.storageClass ? ` [${m.storageClass}]` : ' [PVC]') : ''}</option>)}
                            {!currentPod?.mounts.some(m => m.mountPath === currentPath) && currentPath !== '/' && <option value={currentPath}>Custom Path</option>}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">Path</label>
                        <div className="flex gap-2">
                            <input type="text" value={currentPath} onChange={(e) => setCurrentPath(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-400 font-mono text-sm" />
                            <button onClick={goUp} disabled={currentPath === '/'} className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg disabled:opacity-50 transition-colors" title="Go Up"><ArrowLeft size={18} className="rotate-90" /></button>
                        </div>
                    </div>
                </div>

                {pvcInfo && (
                    <div className="bg-slate-900/50 border border-blue-500/30 rounded-lg p-4 flex flex-wrap gap-6 items-center text-sm">
                        <div className="flex items-center gap-2"><span className="text-slate-400">Name:</span><span className="text-blue-300 font-bold">{pvcInfo.name}</span></div>
                        <div className="flex items-center gap-2"><span className="text-slate-400">Class:</span><span className="text-white font-mono">{pvcInfo.storageClass}</span></div>
                        <div className="flex items-center gap-2"><span className="text-slate-400">Size:</span><span className="text-white font-mono font-bold bg-blue-500/20 px-2 py-1 rounded">{pvcInfo.capacity}</span></div>
                        <div className="flex items-center gap-2"><span className="text-slate-400">Status:</span><span className={`px-2 py-0.5 rounded text-xs font-bold ${pvcInfo.status === 'Bound' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{pvcInfo.status}</span></div>
                    </div>
                )}
            </div>

            {/* File List ... existing implementation ... */}

            <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-xl">
                {/* Header with Breadcrumb */}
                <div className="p-4 border-b border-slate-700 bg-slate-800/80 flex justify-between items-center text-sm font-mono overflow-x-auto whitespace-nowrap scrollbar-hide">
                    <div className="flex items-center gap-1 text-slate-400">
                        <Home size={16} className="text-blue-500 mr-2 cursor-pointer hover:text-blue-400 mb-0.5" onClick={() => setCurrentPath('/')} />
                        <span className="cursor-pointer hover:text-blue-400 hover:underline" onClick={() => setCurrentPath('/')}>root</span>

                        {currentPath.split('/').filter(Boolean).map((part, index, arr) => {
                            const path = '/' + arr.slice(0, index + 1).join('/');
                            const isLast = index === arr.length - 1;
                            return (
                                <div key={index} className="flex items-center">
                                    <span className="mx-1 text-slate-600">/</span>
                                    <span
                                        className={`${isLast ? 'text-slate-200 font-bold' : 'cursor-pointer hover:text-blue-400 hover:underline'}`}
                                        onClick={() => !isLast && setCurrentPath(path)}
                                    >
                                        {part}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {/* Small Loading Indicator */}
                    {loading && <RefreshCw size={16} className="animate-spin text-blue-400 ml-4 hidden md:block" />}
                </div>

                <div className="min-h-[400px] relative">
                    {/* Loading Overlay */}
                    {loading && (
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-20 transition-all duration-300">
                            <div className="flex flex-col items-center gap-3 animate-in zoom-in fade-in duration-300 p-6 bg-slate-800/80 rounded-2xl border border-slate-700/50 shadow-2xl">
                                <RefreshCw size={32} className="animate-spin text-blue-500" />
                                <p className="text-slate-300 font-medium">Fetching file list...</p>
                            </div>
                        </div>
                    )}

                    {!selectedPodName ? (
                        <div className="flex flex-col items-center justify-center h-[400px] text-slate-400">
                            <Server size={48} className="mb-4 opacity-30" />
                            <p>Please select a Pod to start browsing</p>
                            {selectedProject && pods.length === 0 && <p className="text-red-400 text-sm mt-2 font-mono">(No active pods found in this project)</p>}
                        </div>
                    ) : (files.length === 0 && !loading) && (
                        <div className="flex flex-col items-center justify-center h-[400px] text-slate-500">
                            <Folder size={48} className="mb-4 opacity-50" />
                            <p>Directory is empty</p>
                        </div>
                    )}

                    {files.length > 0 && (
                        <table className={`w-full text-left text-slate-300 transition-opacity duration-300 ${loading ? 'opacity-30' : 'opacity-100'}`}>
                            <thead className="bg-slate-900/50 text-xs uppercase tracking-wider text-slate-400">
                                <tr>
                                    <th className="p-4">Name</th><th className="p-4 w-32">Size</th><th className="p-4 w-48">Last Modified</th><th className="p-4 w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {files.map((file, idx) => (
                                    <tr key={`${file.name}-${idx}`} className="hover:bg-slate-700/30 transition-colors group">
                                        <td className="p-4">
                                            <div className={`flex items-center gap-3 cursor-pointer ${file.isDirectory ? 'text-blue-400 font-medium' : 'text-slate-300'}`} onClick={() => file.isDirectory ? handleFolderClick(file.name) : handleFileView(file.name)}>
                                                {file.isDirectory ? <Folder size={20} fill="currentColor" className="opacity-20 text-blue-500" /> : <File size={20} />}<span>{file.name}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 font-mono text-sm text-slate-500">{file.size}</td><td className="p-4 text-sm text-slate-500">{file.lastModified}</td>
                                        <td className="p-4">
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {!file.isDirectory && (
                                                    <>
                                                        <button onClick={(e) => { e.stopPropagation(); handleFileView(file.name); }} className="p-1 hover:text-blue-400" title="View"><Eye size={18} /></button>
                                                        <a href={`/api/oc/read?namespace=${selectedProject}&pod=${selectedPodName}&path=${encodeURIComponent((currentPath === '/' ? '' : currentPath) + '/' + file.name)}&download=true`} target="_blank" rel="noreferrer" className="p-1 hover:text-green-400" title="Download" onClick={(e) => e.stopPropagation()}><Download size={18} /></a>
                                                    </>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); setDeleteItem(file.name); }} className="p-1 hover:text-red-500" title="Delete"><Trash2 size={18} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {previewContent !== null && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-50">
                    <div className="bg-slate-900 w-full max-w-4xl h-[80vh] flex flex-col rounded-xl border border-slate-700 shadow-2xl">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center"><h3 className="font-bold text-lg">File Preview</h3><button onClick={() => setPreviewContent(null)} className="text-slate-400 hover:text-white">Close</button></div>
                        <div className="flex-1 p-4 overflow-auto"><pre className="font-mono text-sm text-slate-300 whitespace-pre-wrap">{previewContent}</pre></div>
                    </div>
                </div>
            )}

            {/* Search Result Modal */}
            {showSearchModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-50">
                    <div className="bg-slate-900 w-full max-w-5xl h-[85vh] flex flex-col rounded-xl border border-slate-700 shadow-2xl transition-all">
                        <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl">
                            <h3 className="font-bold text-lg flex items-center gap-2"><Search size={20} className="text-purple-400" /> px-sc Storage Finder</h3>
                            <div className="flex items-center gap-2">
                                {searchResults.length > 0 && (
                                    <button onClick={handleExportExcel} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors">
                                        <FileSpreadsheet size={16} /> Export Excel
                                    </button>
                                )}
                                <button onClick={() => setShowSearchModal(false)} className="text-slate-400 hover:text-white p-2 hover:bg-slate-700 rounded-lg transition-colors"><X size={24} /></button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col">
                            {/* Terminal Logs */}
                            <div className="h-48 bg-black/90 p-4 font-mono text-xs text-green-400 overflow-y-auto border-b border-slate-700 relative">
                                <div className="absolute top-2 right-2 text-slate-600 bg-slate-900 px-2 rounded">Execution Logs</div>
                                {searchLogs.map((log, i) => (
                                    <div key={i} className="mb-1">{log}</div>
                                ))}
                                <div ref={logsEndRef} />
                            </div>

                            {/* Results Table */}
                            <div className="flex-1 overflow-y-auto p-0 bg-slate-900">
                                {searchResults.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                        {isSearching ? <RefreshCw size={32} className="animate-spin mb-4 text-purple-500" /> : <Database size={48} className="mb-4 opacity-30" />}
                                        <p>{isSearching ? 'Scanning cluster...' : 'No workloads found.'}</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-left text-slate-300">
                                        <thead className="bg-slate-800/95 sticky top-0 text-xs uppercase tracking-wider text-slate-400 shadow-sm z-10">
                                            <tr>
                                                <th className="p-4">Namespace</th>
                                                <th className="p-4">Pod Name</th>
                                                <th className="p-4">PVC Name</th>
                                                <th className="p-4">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {searchResults.map((res, idx) => (
                                                <tr key={idx} className="hover:bg-slate-800/30 transition-colors animate-fade-in-up">
                                                    <td className="p-4 text-blue-400 font-medium">{res.namespace}</td>
                                                    <td className="p-4 font-mono text-sm">{res.podName}</td>
                                                    <td className="p-4 font-mono text-sm text-gray-400">{res.pvcName}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${res.status === 'Running' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                            {res.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteItem && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-[60]">
                    <div className="bg-slate-900 w-full max-w-md p-6 rounded-xl border border-red-500/50 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-3 text-red-500">
                            <div className="p-3 bg-red-500/20 rounded-full"><Trash2 size={24} /></div>
                            <h3 className="font-bold text-xl">Delete File?</h3>
                        </div>
                        <p className="text-slate-300">
                            Are you sure you want to delete <span className="font-mono font-bold text-white">{deleteItem}</span>?
                            <br /><span className="text-sm text-slate-500 mt-2 block">This action is permanent and cannot be undone.</span>
                        </p>
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setDeleteItem(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex items-center gap-2"
                                disabled={isDeleting}
                            >
                                {isDeleting ? <RefreshCw className="animate-spin" size={16} /> : <Trash2 size={16} />}
                                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
