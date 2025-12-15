'use client';

import React, { useState, useEffect } from 'react';
import {
    Folder, File, ArrowLeft, RefreshCw, Download, Cloud, LogOut, Database,
    ChevronRight, HardDrive, BarChart2, AlertCircle, Plus, Save, Trash2,
    Settings, X, Edit2, Server, Eye, FileCode, FileImage, FileVideo, Music, FileText
} from 'lucide-react';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
    getAllS3Connections,
    saveS3Connection,
    deleteS3Connection,
    S3ConnectionProfile
} from '@/services/connection-storage';

// --- Types ---

interface Bucket {
    Name: string;
    CreationDate: string;
    isManual?: boolean;
}

interface S3FileItem {
    name: string;
    key: string;
    lastModified?: string;
    size: number;
    isDirectory: boolean;
}

interface BucketUsage {
    totalSize: number;
    objectCount: number;
    fileTypeStats?: Record<string, { count: number, size: number }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];


// --- Components ---

const Modal = ({ title, isOpen, onClose, children, className = "max-w-md" }: { title: string, isOpen: boolean, onClose: () => void, children: React.ReactNode, className?: string }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className={`bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full ${className} overflow-hidden animate-in zoom-in-95 duration-200`}>
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
                    <h3 className="font-semibold text-slate-200">{title}</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default function S3BrowserPage() {
    // --- State: Connection Manager ---
    const [profiles, setProfiles] = useState<S3ConnectionProfile[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

    // Form State
    const [formName, setFormName] = useState('');
    const [formConfig, setFormConfig] = useState({ endpoint: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' });
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    // --- State: Active Session ---
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Browser Data
    const [buckets, setBuckets] = useState<Bucket[]>([]);
    const [selectedBucket, setSelectedBucket] = useState('');
    const [currentPrefix, setCurrentPrefix] = useState('');
    const [files, setFiles] = useState<S3FileItem[]>([]);
    const [browsingLoading, setBrowsingLoading] = useState(false);

    // Analytics
    const [usageLoading, setUsageLoading] = useState(false);
    const [bucketUsage, setBucketUsage] = useState<BucketUsage | null>(null);
    const [showAnalysisModal, setShowAnalysisModal] = useState(false);

    // --- Modals State ---
    const [showAddBucketModal, setShowAddBucketModal] = useState(false);
    const [newBucketName, setNewBucketName] = useState('');

    const [showCapacityModal, setShowCapacityModal] = useState(false);
    const [capacityInput, setCapacityInput] = useState('');

    // --- State: Preview ---
    const [previewData, setPreviewData] = useState<{ name: string, type: 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'office' | 'unsupported', url: string, content?: string } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // --- Effects ---

    // Load Profiles from IndexedDB
    useEffect(() => {
        loadProfiles();
    }, []);

    const loadProfiles = async () => {
        try {
            const data = await getAllS3Connections();
            setProfiles(data);
        } catch (e) {
            console.error("Failed to load profiles:", e);
        }
    };

    // --- Actions: Connection Manager ---

    const handleSaveProfile = async () => {
        if (!formName || !formConfig.accessKeyId || !formConfig.secretAccessKey) {
            setError('Please fill in Name, Access Key, and Secret Key.');
            return;
        }

        // Cari profile lama jika sedang edit untuk preserve manualBuckets & capacities
        let existingProfile = null;
        if (isEditingProfile && activeProfileId) {
            existingProfile = profiles.find(p => p.id === activeProfileId);
        }

        const newProfile: S3ConnectionProfile = {
            id: existingProfile ? existingProfile.id : crypto.randomUUID(),
            name: formName,
            config: { ...formConfig },
            manualBuckets: existingProfile ? existingProfile.manualBuckets : [],
            capacities: existingProfile ? existingProfile.capacities : {},
            lastUsed: Date.now()
        };

        try {
            await saveS3Connection(newProfile);
            await loadProfiles();

            setFormName('');
            setFormConfig({ endpoint: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' });
            setIsEditingProfile(false);
            setActiveProfileId(null);
            setError('');
        } catch (e) {
            setError('Failed to save to database');
        }
    };

    const handleDeleteProfile = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm('Delete this connection profile?')) {
            await deleteS3Connection(id);
            await loadProfiles();
        }
    };

    const handleLoadProfile = (profile: S3ConnectionProfile) => {
        setFormName(profile.name);
        setFormConfig(profile.config);
        setActiveProfileId(profile.id);
        setIsEditingProfile(true);
    };

    const handleConnect = async (profileId?: string) => {
        setIsLoading(true);
        setError('');

        // Determine which config to use
        let configToUse = formConfig;
        let profileToUse = profiles.find(p => p.id === profileId);

        if (profileId && profileToUse) {
            configToUse = profileToUse.config;
            setActiveProfileId(profileId);

            // Update last used
            const updatedProfile = { ...profileToUse, lastUsed: Date.now() };
            await saveS3Connection(updatedProfile);
            await loadProfiles();
        }

        try {
            const res = await fetch('/api/s3/buckets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configToUse)
            });
            const data = await res.json();

            // Prepare session
            let initialBuckets: Bucket[] = [];
            if (profileToUse) {
                initialBuckets = profileToUse.manualBuckets || [];
            }

            if (res.ok) {
                const fetched: Bucket[] = data.buckets || [];
                const merged = [...initialBuckets, ...fetched.filter(b => !initialBuckets.find(mb => mb.Name === b.Name))];
                setBuckets(merged);
                setIsConnected(true);
            } else {
                console.warn("Listing failed:", data.error);
                if (initialBuckets.length > 0) {
                    setBuckets(initialBuckets);
                    setIsConnected(true);
                } else if (data.error && (data.error.includes('AccessDenied') || data.error.includes('Forbidden'))) {
                    setIsConnected(true);
                    setTimeout(() => alert("Connected, but 'ListAllMyBuckets' was denied.\nPlease add known buckets manually via the (+) button."), 500);
                } else {
                    setError(data.error || 'Connection Failed');
                }
            }

        } catch (err: any) {
            setError(err.message || 'Network Error');
        } finally {
            setIsLoading(false);
        }
    };

    // --- Actions: Browser ---

    const handleAddManualBucket = async () => {
        if (!newBucketName) return;

        if (buckets.find(b => b.Name === newBucketName)) {
            setSelectedBucket(newBucketName);
            setShowAddBucketModal(false);
            setNewBucketName('');
            handleBucketSelect(newBucketName);
            return;
        }

        const newBucket: Bucket = { Name: newBucketName, CreationDate: new Date().toISOString(), isManual: true };
        const newBuckets = [newBucket, ...buckets];
        setBuckets(newBuckets);

        // Save to Profile in DB
        if (activeProfileId) {
            const profile = profiles.find(p => p.id === activeProfileId);
            if (profile) {
                const updatedProfile = { ...profile, manualBuckets: [...(profile.manualBuckets || []), newBucket] };
                await saveS3Connection(updatedProfile);
                await loadProfiles();
            }
        }

        setShowAddBucketModal(false);
        setNewBucketName('');
        handleBucketSelect(newBucketName);
    };

    const handleDisconnect = () => {
        setIsConnected(false);
        setBuckets([]);
        setFiles([]);
        setSelectedBucket('');
        setBucketUsage(null);
        setActiveProfileId(null);
        setIsEditingProfile(false);
        setFormName('');
        setFormConfig({ endpoint: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' });
    };

    const fetchFiles = async (bucket: string, prefix: string) => {
        setBrowsingLoading(true);
        try {
            const profile = profiles.find(p => p.id === activeProfileId);
            const cfg = profile ? profile.config : formConfig;

            const res = await fetch('/api/s3/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...cfg, bucketName: bucket, prefix })
            });
            const data = await res.json();
            if (res.ok) {
                setFiles(data.files || []);
            } else {
                setFiles([]);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setBrowsingLoading(false);
        }
    };

    const handleBucketSelect = (bucketName: string) => {
        setSelectedBucket(bucketName);
        setCurrentPrefix('');
        setBucketUsage(null);
        fetchFiles(bucketName, '');
    };

    // ... File Op Helpers ...
    const handleFolderClick = (folderName: string) => {
        const newPrefix = currentPrefix + folderName + '/';
        setCurrentPrefix(newPrefix);
        fetchFiles(selectedBucket, newPrefix);
    };

    const handleUpLevel = () => {
        if (!currentPrefix) return;
        const p = currentPrefix.replace(/\/$/, '');
        const lastSlash = p.lastIndexOf('/');
        const newPrefix = lastSlash === -1 ? '' : p.substring(0, lastSlash + 1);
        setCurrentPrefix(newPrefix);
        fetchFiles(selectedBucket, newPrefix);
    };

    const handleDownload = async (fileKey: string) => {
        const profile = profiles.find(p => p.id === activeProfileId);
        const cfg = profile ? profile.config : formConfig;

        try {
            const res = await fetch('/api/s3/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...cfg, bucketName: selectedBucket, key: fileKey })
            });
            const data = await res.json();
            if (res.ok && data.url) window.open(data.url, '_blank');
            else alert('Download failed');
        } catch (e) { alert('Error'); }
    };

    const calculateUsage = async () => {
        if (!selectedBucket) return;
        setUsageLoading(true);
        const profile = profiles.find(p => p.id === activeProfileId);
        const cfg = profile ? profile.config : formConfig;

        try {
            const res = await fetch('/api/s3/usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...cfg, bucketName: selectedBucket })
            });
            const data = await res.json();
            if (res.ok) {
                setBucketUsage(data);
                setShowAnalysisModal(true); // Auto show analysis after calc
            }
            else alert('Calc failed: ' + data.error);
        } catch (e) { alert('Error'); } finally { setUsageLoading(false); }
    };

    const handleSaveCapacity = async () => {
        const gb = parseFloat(capacityInput);
        if (isNaN(gb)) return;

        if (activeProfileId) {
            const profile = profiles.find(p => p.id === activeProfileId);
            if (profile) {
                const updatedProfile = {
                    ...profile,
                    capacities: { ...(profile.capacities || {}), [selectedBucket]: gb * 1024 * 1024 * 1024 }
                };
                await saveS3Connection(updatedProfile);
                await loadProfiles();
            }
        }
        setShowCapacityModal(false);
    };

    // Get Capacity for current view
    const getCurrentCapacity = () => {
        const profile = profiles.find(p => p.id === activeProfileId);
        if (profile && profile.capacities && profile.capacities[selectedBucket]) {
            return profile.capacities[selectedBucket];
        }
        return 0;
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // --- Helpers: Preview ---

    const getFileType = (fileName: string): 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'code' | 'office' | 'unsupported' => {
        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image';
        if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
        if (['mp3', 'wav', 'aac', 'flac'].includes(ext)) return 'audio';
        if (['pdf'].includes(ext)) return 'pdf';
        if (['docx', 'xlsx', 'xls'].includes(ext)) return 'office';
        if (['txt', 'log', 'csv', 'md', 'env', 'gitignore'].includes(ext)) return 'text';
        if (['json', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bat', 'py', 'go', 'java', 'c', 'cpp', 'h'].includes(ext)) return 'code';
        return 'unsupported';
    };

    const handlePreview = async (fileKey: string, fileName: string) => {
        const type = getFileType(fileName);
        if (type === 'unsupported') {
            if (!confirm(`Preview for .${fileName.split('.').pop()} might not be supported or correct. Try anyway?`)) return;
        }

        setPreviewLoading(true);
        const profile = profiles.find(p => p.id === activeProfileId);
        const cfg = profile ? profile.config : formConfig;

        try {
            // Get Presigned URL (for download button in preview)
            const res = await fetch('/api/s3/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...cfg, bucketName: selectedBucket, key: fileKey })
            });
            const data = await res.json();

            if (res.ok && data.url) {
                let content = undefined;

                // For Text/Code/Office, fetch the actual content via backend proxy to avoid CORS/SSL
                if (type === 'text' || type === 'code' || type === 'office' || type === 'unsupported') {
                    try {
                        // Use proxy endpoint
                        const contentReq = await fetch('/api/s3/content', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...cfg, bucketName: selectedBucket, key: fileKey })
                        });

                        if (!contentReq.ok) throw new Error("Failed to fetch file content from proxy");

                        if (type === 'office') {
                            const arrayBuffer = await contentReq.arrayBuffer();
                            const ext = fileName.split('.').pop()?.toLowerCase() || '';

                            if (ext === 'docx') {
                                const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                                content = result.value; // The generated HTML
                            } else if (ext === 'xlsx' || ext === 'xls') {
                                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                                const sheetName = workbook.SheetNames[0];
                                const worksheet = workbook.Sheets[sheetName];
                                content = XLSX.utils.sheet_to_html(worksheet);
                            }
                        } else {
                            content = await contentReq.text();
                        }

                    } catch (e) {
                        console.error(e);
                        alert("Could not load content for preview (CORS/Network limit). Downloading instead?");
                        window.open(data.url, '_blank');
                        setPreviewLoading(false);
                        return;
                    }
                }

                setPreviewData({
                    name: fileName,
                    type: type === 'unsupported' ? 'text' : type, // Fallback unsupported to text view
                    url: data.url,
                    content: content
                });
            } else {
                alert('Preview unable to generate URL');
            }
        } catch (e) {
            console.error(e);
            alert('Error generating preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const closePreview = () => setPreviewData(null);

    // --- Render ---

    if (!isConnected) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex p-6 gap-6">
                {/* Left Panel: Saved Connections */}
                <div className="w-1/3 flex flex-col gap-4">
                    <div className="mb-2">
                        <Link href="/" className="mb-4 inline-block text-slate-500 hover:text-white flex items-center gap-2"><ArrowLeft size={16} /> Back to Dashboard</Link>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">S3 Browser</h1>
                        <p className="text-slate-400 text-sm">Connection Manager (IndexedDB Encrypted)</p>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                        {profiles.slice().sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0)).map(profile => (
                            <div key={profile.id} onClick={() => handleConnect(profile.id)} className="group bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-orange-500/50 hover:bg-slate-800 transition-all cursor-pointer relative">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-orange-500/10 rounded-lg text-orange-400"><Server size={18} /></div>
                                        <h3 className="font-bold text-slate-200">{profile.name}</h3>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); handleLoadProfile(profile); }} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><Edit2 size={14} /></button>
                                        <button onClick={(e) => handleDeleteProfile(profile.id, e)} className="p-1.5 hover:bg-red-900/50 rounded text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                <div className="text-xs text-slate-500 space-y-1">
                                    <p className="truncate">{profile.config.endpoint || 'AWS Standard'}</p>
                                    <p>{profile.config.region}</p>
                                </div>
                            </div>
                        ))}
                        {profiles.length === 0 && (
                            <div className="p-8 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-600">
                                <Cloud size={32} className="mx-auto mb-2 opacity-50" />
                                <p>No saved connections</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Form */}
                <div className="flex-1 flex items-center justify-center bg-slate-900/50 rounded-2xl border border-slate-800 p-8">
                    <div className="w-full max-w-md space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold text-slate-200">{isEditingProfile ? 'Edit Connection' : 'New Connection'}</h2>
                            {isEditingProfile && <button onClick={() => { setIsEditingProfile(false); setFormName(''); setFormConfig({ endpoint: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' }); }} className="text-xs text-slate-400 hover:text-white">Cancel Edit</button>}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Connection Name</label>
                                <input type="text" placeholder="e.g., EPROC-DEV Bucket" value={formName} onChange={e => setFormName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Endpoint</label>
                                    <input type="text" placeholder="s3.amazonaws.com" value={formConfig.endpoint} onChange={e => setFormConfig({ ...formConfig, endpoint: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Region</label>
                                    <input type="text" placeholder="us-east-1" value={formConfig.region} onChange={e => setFormConfig({ ...formConfig, region: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Access Key ID</label>
                                <input type="text" value={formConfig.accessKeyId} onChange={e => setFormConfig({ ...formConfig, accessKeyId: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Secret Access Key</label>
                                <input type="password" value={formConfig.secretAccessKey} onChange={e => setFormConfig({ ...formConfig, secretAccessKey: e.target.value })} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                            </div>
                        </div>

                        {error && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-xs">{error}</div>}

                        <div className="flex gap-3 pt-2">
                            <Link href="/" className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition-colors">Back</Link>
                            <button onClick={handleSaveProfile} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                                <Save size={18} /> Save Profile
                            </button>
                            <button onClick={() => handleConnect()} disabled={isLoading} className="flex-1 py-3 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white rounded-lg font-medium transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">
                                {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <Cloud size={18} />} Connect
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ... (Browser Rendering - Sama seperti sebelumnya, hanya bagian atas sudah diganti) ...
    // Untuk mempersingkat context window, saya gunakan code sebelumnya untuk bagian Browser,
    // tapi pastikan 'currentProfile' diambil dengan benar.

    const currentProfile = profiles.find(p => p.id === activeProfileId);
    const currentCap = getCurrentCapacity();
    const usagePercent = bucketUsage && currentCap > 0 ? Math.min(100, (bucketUsage.totalSize / currentCap) * 100) : 0;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col h-screen">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={handleDisconnect} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><ArrowLeft size={24} /></button>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">S3 Browser</h1>
                        <div className="text-slate-400 text-xs flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            {currentProfile ? currentProfile.name : 'Guest Session'}
                            <span className="text-slate-600">|</span>
                            {currentProfile?.config.endpoint || 'AWS'}
                        </div>
                    </div>
                </div>
                <button onClick={handleDisconnect} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700 text-sm">
                    <LogOut size={16} /> Disconnect
                </button>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 bg-slate-900 rounded-xl border border-slate-800 flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2"><HardDrive size={16} /> BUCKETS</h2>
                        <button onClick={() => setShowAddBucketModal(true)} className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors" title="Add Bucket Manually">
                            <Plus size={16} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
                        {buckets.map(b => (
                            <button
                                key={b.Name}
                                onClick={() => handleBucketSelect(b.Name || '')}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate flex items-center gap-2 transition-colors ${selectedBucket === b.Name ? 'bg-orange-600/20 text-orange-400 border border-orange-500/30' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'} ${b.isManual ? 'italic' : ''}`}
                            >
                                <Database size={14} /> {b.Name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* File Explorer */}
                <div className="flex-1 bg-slate-900 rounded-xl border border-slate-800 flex flex-col relative">
                    {!selectedBucket ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-500">
                                <Cloud size={40} />
                            </div>
                            <p className="font-medium">Select a bucket to browse</p>
                        </div>
                    ) : (
                        <>
                            {/* Toolbar */}
                            <div className="shrink-0 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="font-bold text-xl text-slate-200">{selectedBucket}</span>
                                        {bucketUsage ? (
                                            <div className="flex items-center gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 shadow-inner">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Storage</span>
                                                    <span className="text-xs text-slate-200 font-mono">{formatSize(bucketUsage.totalSize)}</span>
                                                </div>
                                                <div className="w-px h-6 bg-slate-800"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Objects</span>
                                                    <span className="text-xs text-slate-200 font-mono">{bucketUsage.objectCount.toLocaleString()}</span>
                                                </div>
                                                <div className="w-px h-6 bg-slate-800"></div>
                                                <button onClick={() => setShowAnalysisModal(true)} className="p-1 hover:bg-slate-800 rounded text-blue-400 hover:text-blue-300 transition-colors" title="View Analysis">
                                                    <BarChart2 size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={calculateUsage} disabled={usageLoading} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-300 border border-slate-700 transition-colors" title="Analyzes file types distribution, counts, and sizes with visual charts">
                                                {usageLoading ? (
                                                    <>
                                                        <RefreshCw className="animate-spin" size={14} /> <span className="animate-pulse">Analyzing files...</span>
                                                    </>
                                                ) : (
                                                    <><BarChart2 size={14} /> Analyze Content</>
                                                )}
                                            </button>
                                        )}
                                    </div>

                                    {/* Capacity Visualizer */}
                                    <button onClick={() => { setCapacityInput(currentCap > 0 ? (currentCap / 1024 / 1024 / 1024).toString() : ''); setShowCapacityModal(true); }} className="group relative">
                                        {currentCap > 0 && bucketUsage ? (
                                            <div className="w-48">
                                                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500 mb-1">
                                                    <span>Usage {usagePercent.toFixed(1)}%</span>
                                                    <span>Limit {formatSize(currentCap)}</span>
                                                </div>
                                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                    <div className={`h-full transition-all duration-500 ${usagePercent > 90 ? 'bg-red-500' : usagePercent > 75 ? 'bg-orange-500' : 'bg-green-500'}`} style={{ width: `${usagePercent}%` }}></div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors text-slate-500 hover:text-slate-300">
                                                <Settings size={14} />
                                                <span className="text-xs font-medium">Set Capacity</span>
                                            </div>
                                        )}
                                    </button>
                                </div>

                                {/* Breadcrumb */}
                                <div className="px-4 py-2 bg-slate-800/30 border-t border-slate-800 flex items-center gap-1 text-sm overflow-x-auto">
                                    <button onClick={() => fetchFiles(selectedBucket, '')} className="p-1 hover:bg-slate-700/50 rounded text-slate-400 hover:text-white font-medium transition-colors">root</button>
                                    {currentPrefix.split('/').filter(Boolean).map((part, i, arr) => (
                                        <React.Fragment key={i}>
                                            <ChevronRight size={14} className="text-slate-600" />
                                            <span className={`px-1 rounded ${i === arr.length - 1 ? 'text-slate-200 font-bold' : 'text-slate-400'}`}>{part}</span>
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>

                            {/* File List */}
                            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-800">
                                {browsingLoading ? (
                                    <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
                                        <RefreshCw className="animate-spin text-orange-500" size={24} />
                                        <span className="text-sm">Loading files...</span>
                                    </div>
                                ) : (
                                    <table className="w-full text-left text-sm border-separate border-spacing-y-1">
                                        <thead className="text-xs text-slate-500 font-bold uppercase tracking-wider sticky top-0 bg-slate-900 z-10">
                                            <tr>
                                                <th className="px-4 py-2 bg-slate-900">Name</th>
                                                <th className="px-4 py-2 w-32 bg-slate-900">Size</th>
                                                <th className="px-4 py-2 w-48 bg-slate-900">Modified</th>
                                                <th className="px-4 py-2 w-16 text-right bg-slate-900"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentPrefix && (
                                                <tr onClick={handleUpLevel} className="group cursor-pointer">
                                                    <td colSpan={4} className="px-4 py-2 bg-slate-800/20 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700">
                                                        <div className="flex items-center gap-2 text-slate-400">
                                                            <ArrowLeft size={16} className="rotate-90" /> Back
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            {files.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="text-center py-12 text-slate-600 italic">Folder is empty</td>
                                                </tr>
                                            )}
                                            {files.map(file => (
                                                <tr key={file.key} className="group hover:bg-slate-800/80 transition-colors">
                                                    <td className="px-4 py-2 rounded-l-lg border-y border-l border-transparent group-hover:border-slate-700">
                                                        {file.isDirectory ? (
                                                            <div onClick={() => handleFolderClick(file.name)} className="flex items-center gap-2 cursor-pointer text-blue-400 font-medium hover:text-blue-300">
                                                                <Folder size={18} className="fill-blue-500/20" /> {file.name}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-3 text-slate-300">
                                                                <File size={18} className="text-slate-500" />
                                                                <span className="truncate max-w-sm">{file.name}</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 font-mono text-xs text-slate-400 border-y border-transparent group-hover:border-slate-700">{file.isDirectory ? '-' : formatSize(file.size)}</td>
                                                    <td className="px-4 py-2 text-slate-500 text-xs border-y border-transparent group-hover:border-slate-700">{file.lastModified ? new Date(file.lastModified).toLocaleDateString() : '-'}</td>
                                                    <td className="px-4 py-2 text-right rounded-r-lg border-y border-r border-transparent group-hover:border-slate-700">
                                                        {!file.isDirectory && (
                                                            <>
                                                                <button onClick={() => handlePreview(file.key, file.name)} disabled={previewLoading} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors mr-1" title="Preview">
                                                                    {previewLoading ? <RefreshCw className="animate-spin" size={16} /> : <Eye size={16} />}
                                                                </button>
                                                                <button onClick={() => handleDownload(file.key)} className="p-1.5 text-slate-500 hover:text-green-400 hover:bg-slate-700 rounded transition-colors" title="Download">
                                                                    <Download size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* --- Modals --- */}

            <Modal title="Add Bucket Manually" isOpen={showAddBucketModal} onClose={() => setShowAddBucketModal(false)}>
                <div className="space-y-4">
                    <p className="text-sm text-slate-400">Enter the exact name of the bucket you want to access.</p>
                    <input
                        type="text"
                        placeholder="my-bucket-name"
                        value={newBucketName}
                        onChange={(e) => setNewBucketName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-orange-500 outline-none"
                    />
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={() => setShowAddBucketModal(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                        <button onClick={handleAddManualBucket} className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg">Add Bucket</button>
                    </div>
                </div>
            </Modal>

            <Modal title="Set Visual Capacity" isOpen={showCapacityModal} onClose={() => setShowCapacityModal(false)}>
                <div className="space-y-4">
                    <p className="text-sm text-slate-400">Set a visual limit for <strong>{selectedBucket}</strong> in GB. (0 = Unlimited)</p>
                    <div className="relative">
                        <input
                            type="number"
                            step="0.1"
                            placeholder="0"
                            value={capacityInput}
                            onChange={(e) => setCapacityInput(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-200 focus:ring-2 focus:ring-orange-500 outline-none pr-12"
                        />
                        <span className="absolute right-4 top-3.5 text-slate-500 font-bold">GB</span>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={() => setShowCapacityModal(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                        <button onClick={handleSaveCapacity} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg">Save Limit</button>
                    </div>
                </div>
            </Modal>

            {/* Preview Modal */}
            {
                previewData && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
                                <div className="flex items-center gap-3">
                                    {previewData.type === 'image' && <FileImage className="text-purple-400" size={20} />}
                                    {previewData.type === 'video' && <FileVideo className="text-blue-400" size={20} />}
                                    {previewData.type === 'audio' && <Music className="text-pink-400" size={20} />}
                                    {(previewData.type === 'code' || previewData.type === 'text') && <FileCode className="text-green-400" size={20} />}
                                    {previewData.type === 'office' && <FileText className="text-blue-500" size={20} />}
                                    <h3 className="font-semibold text-slate-200 truncate max-w-md">{previewData.name}</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <a href={previewData.url} target="_blank" rel="noreferrer" download className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg flex items-center gap-2 transition-colors">
                                        <Download size={14} /> Download
                                    </a>
                                    <button onClick={closePreview} className="text-slate-500 hover:text-white p-1 hover:bg-slate-800 rounded transition-colors">
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-auto bg-slate-950 flex items-center justify-center relative">
                                {previewData.type === 'image' && (
                                    <img src={previewData.url} alt={previewData.name} className="max-w-full max-h-full object-contain" />
                                )}

                                {previewData.type === 'video' && (
                                    <video controls autoPlay className="max-w-full max-h-full">
                                        <source src={previewData.url} />
                                        Your browser does not support the video tag.
                                    </video>
                                )}

                                {previewData.type === 'audio' && (
                                    <div className="p-12 flex flex-col items-center justify-center bg-slate-900 rounded-2xl border border-slate-800">
                                        <Music size={64} className="text-slate-700 mb-6 animate-pulse" />
                                        <audio controls autoPlay className="w-full min-w-[300px]">
                                            <source src={previewData.url} />
                                            Your browser does not support the audio element.
                                        </audio>
                                    </div>
                                )}

                                {previewData.type === 'pdf' && (
                                    <iframe src={previewData.url} className="w-full h-full border-none" title="PDF Preview"></iframe>
                                )}

                                {(previewData.type === 'text' || previewData.type === 'code') && (
                                    <div className="w-full h-full overflow-auto p-0 text-left">
                                        <pre className="p-4 text-xs sm:text-sm font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                            <code>{previewData.content}</code>
                                        </pre>
                                    </div>
                                )}

                                {previewData.type === 'office' && (
                                    <div className="w-full h-full overflow-auto p-8 bg-white text-slate-900">
                                        <div
                                            className="prose max-w-none"
                                            dangerouslySetInnerHTML={{ __html: previewData.content || '' }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Analysis Modal */}
            <Modal title={`Content Analysis: ${selectedBucket}`} isOpen={showAnalysisModal} onClose={() => setShowAnalysisModal(false)} className="max-w-[50%]">
                <div className="space-y-6">
                    {bucketUsage && bucketUsage.fileTypeStats ? (
                        <>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={Object.entries(bucketUsage.fileTypeStats)
                                                .map(([type, stats]) => ({ name: type, value: stats.count, size: stats.size }))
                                                .sort((a, b) => b.value - a.value)
                                                .slice(0, 10)
                                            }
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                            label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }: any) => {
                                                const RADIAN = Math.PI / 180;
                                                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                                const x = cx + radius * Math.cos(-(midAngle || 0) * RADIAN);
                                                const y = cy + radius * Math.sin(-(midAngle || 0) * RADIAN);
                                                return (percent || 0) > 0.05 ? (
                                                    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={10}>
                                                        {`${((percent || 0) * 100).toFixed(0)}%`}
                                                    </text>
                                                ) : null;
                                            }}
                                        >
                                            {Object.entries(bucketUsage.fileTypeStats)
                                                .map(([type], index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))
                                            }
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                                            formatter={(value: any, name: any, props: any) => [
                                                `${Number(value).toLocaleString()} files (${formatSize(props.payload.size)})`,
                                                String(name).toUpperCase()
                                            ]}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
                                <table className="w-full text-left text-xs">
                                    <thead className="text-slate-500 font-bold border-b border-slate-800 uppercase sticky top-0 bg-slate-900">
                                        <tr>
                                            <th className="pb-2">Type</th>
                                            <th className="pb-2 text-right">Count</th>
                                            <th className="pb-2 text-right">Size</th>
                                            <th className="pb-2 text-right">%</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                        {Object.entries(bucketUsage.fileTypeStats)
                                            .sort(([, a], [, b]) => b.count - a.count)
                                            .map(([type, stats], idx) => (
                                                <tr key={type} className="hover:bg-slate-800/50">
                                                    <td className="py-2 flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                                        .{type}
                                                    </td>
                                                    <td className="py-2 text-right font-mono">{stats.count.toLocaleString()}</td>
                                                    <td className="py-2 text-right font-mono">{formatSize(stats.size)}</td>
                                                    <td className="py-2 text-right text-slate-500">
                                                        {((stats.count / bucketUsage.objectCount) * 100).toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                    <tfoot className="border-t border-slate-700 font-bold text-slate-200">
                                        <tr>
                                            <td className="py-2 pt-3">TOTAL</td>
                                            <td className="py-2 pt-3 text-right">{bucketUsage.objectCount.toLocaleString()}</td>
                                            <td className="py-2 pt-3 text-right">{formatSize(bucketUsage.totalSize)}</td>
                                            <td className="py-2 pt-3 text-right">100%</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12 text-slate-500">
                            <p>No analysis data available.</p>
                        </div>
                    )}
                </div>
            </Modal>


        </div >
    );
}
