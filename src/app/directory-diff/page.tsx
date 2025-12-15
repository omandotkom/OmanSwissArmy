"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { DiffEditor } from "@monaco-editor/react";
import {
    ArrowLeft,
    Folder,
    File as FileIcon,
    ChevronRight,
    ChevronDown,
    Play,
    Loader2,
    CheckCircle2,
    AlertCircle,
    FileText,
    Binary
} from "lucide-react";

// --- Types ---

type FileEntry = {
    path: string;
    file: File;
    content?: string;
    isBinary?: boolean;
};

type DiffStatus = "same" | "modified" | "added" | "removed";

type DiffResult = {
    path: string;
    status: DiffStatus;
    left?: FileEntry;
    right?: FileEntry;
};

type TreeNode = {
    name: string;
    path: string;
    type: "file" | "folder";
    status?: DiffStatus; // For files, or derived for folders
    children?: Record<string, TreeNode>;
    diffResult?: DiffResult;
};

// --- Helpers ---

const isBinaryFile = async (file: File): Promise<boolean> => {
    // 1. Check extension
    // const binaryExtensions = [".png", ".jpg", ".jpeg", ".gif", ".pdf", ".exe", ".bin", ".zip", ".tar", ".gz", ".ico", ".webp", ".mp4", ".mp3", ".wav"];
    // if (binaryExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) return true;

    // 2. Content check (read first chunk)
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result instanceof ArrayBuffer) {
                const arr = new Uint8Array(reader.result);
                // Look for null bytes in the first 1024 bytes
                for (let i = 0; i < Math.min(arr.length, 1024); i++) {
                    if (arr[i] === 0) {
                        resolve(true);
                        return;
                    }
                }
                resolve(false);
            } else {
                resolve(false);
            }
        };
        reader.onerror = () => resolve(false);
        reader.readAsArrayBuffer(file.slice(0, 1024));
    });
};

const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
};

// --- Components ---

const StatusIcon = ({ status }: { status?: DiffStatus }) => {
    switch (status) {
        case "added": return <span className="text-green-500 text-xs font-bold font-mono">[+]</span>;
        case "removed": return <span className="text-red-500 text-xs font-bold font-mono">[-]</span>;
        case "modified": return <span className="text-yellow-500 text-xs font-bold font-mono">[~]</span>;
        case "same": return null; // <CheckCircle2 className="h-3 w-3 text-zinc-600" />;
        default: return null;
    }
};

const FileTreeItem = ({
    node,
    level,
    onSelect,
    selectedPath
}: {
    node: TreeNode;
    level: number;
    onSelect: (node: TreeNode) => void;
    selectedPath: string | null;
}) => {
    const [isOpen, setIsOpen] = useState(false); // Folders start collapsed
    const isSelected = node.path === selectedPath;

    // Auto-expand if a child is selected (simple version: just expand all if needed, or manage state better)
    // For now, simpler is better.

    const handleClick = () => {
        if (node.type === "folder") {
            setIsOpen(!isOpen);
        } else {
            onSelect(node);
        }
    };

    // Color coding based on status
    let textColor = "text-zinc-400";
    if (node.status === "added") textColor = "text-green-400";
    if (node.status === "removed") textColor = "text-red-400";
    if (node.status === "modified") textColor = "text-yellow-400";

    return (
        <div className="select-none">
            <div
                className={`flex items-center gap-2 py-1 px-2 cursor-pointer whitespace-nowrap transition-colors ${isSelected ? "bg-indigo-500/20" : "hover:bg-zinc-900"}`}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={handleClick}
            >
                <div className="flex items-center justify-center w-4 h-4 text-zinc-600 shrink-0">
                    {node.type === "folder" && (
                        isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                    )}
                </div>

                {node.type === "folder" ? (
                    <Folder className={`h-4 w-4 shrink-0 ${node.status === "modified" ? "text-yellow-500/50" : "text-blue-400/70"}`} />
                ) : (
                    <FileIcon className={`h-4 w-4 shrink-0 ${textColor}`} />
                )}

                <span className={`text-sm truncate ${textColor}`}>
                    {node.name}
                </span>

                <div className="ml-auto">
                    <StatusIcon status={node.status} />
                </div>
            </div>

            {isOpen && node.children && (
                <div>
                    {Object.values(node.children)
                        .sort((a, b) => {
                            if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
                            return a.name.localeCompare(b.name);
                        })
                        .map((child) => (
                            <FileTreeItem
                                key={child.path}
                                node={child}
                                level={level + 1}
                                onSelect={onSelect}
                                selectedPath={selectedPath}
                            />
                        ))}
                </div>
            )}
        </div>
    );
};

// --- Main Page ---

export default function DirectoryDiffPage() {
    const [leftFiles, setLeftFiles] = useState<File[]>([]);
    const [rightFiles, setRightFiles] = useState<File[]>([]);
    const [isComparing, setIsComparing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false); // New state for file processing
    const [progress, setProgress] = useState(0);
    const [currentScannedFile, setCurrentScannedFile] = useState<string>("");
    const [diffTree, setDiffTree] = useState<TreeNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
    const [diffStats, setDiffStats] = useState({ same: 0, modified: 0, added: 0, removed: 0 });

    const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>, side: "left" | "right") => {
        if (e.target.files && e.target.files.length > 0) {
            setIsProcessing(true); // Show loader immediately

            // Use setTimeout to yield to the main thread so React can render the spinner
            // before the heavy filtering/processing starts.
            const fileList = e.target.files;
            setTimeout(() => {
                const files = Array.from(fileList);
                // Ignore dotfiles files (optional, but good for .git)
                const filtered = files.filter(f => !f.webkitRelativePath.includes("/.") && !f.name.startsWith("."));

                if (side === "left") setLeftFiles(filtered);
                else setRightFiles(filtered);

                // Reset state
                setDiffTree(null);
                setSelectedNode(null);
                setProgress(0);
                setIsProcessing(false); // Hide loader
            }, 100);
        }
    };

    const startComparison = async () => {
        setIsComparing(true);
        setProgress(0);
        setCurrentScannedFile("Initializing...");
        setDiffTree(null);
        setSelectedNode(null);

        // 1. Map files by relative path
        const leftMap = new Map<string, File>();
        const rightMap = new Map<string, File>();

        // We assume the first folder name in webkitRelativePath might differ if users selected folders with different names.
        // Usually we want to compare the CONTENTS relative to the root.
        // relativePath typically is "FolderName/SubFolder/File.txt"
        // We will strip the top-level folder name to compare contents broadly.

        const normalizePath = (p: string) => {
            const parts = p.split("/");
            return parts.slice(1).join("/"); // Remove root folder name
        };

        leftFiles.forEach(f => leftMap.set(normalizePath(f.webkitRelativePath), f));
        rightFiles.forEach(f => rightMap.set(normalizePath(f.webkitRelativePath), f));

        const allPaths = new Set([...leftMap.keys(), ...rightMap.keys()]);
        const total = allPaths.size;
        let processed = 0;

        const results: DiffResult[] = [];
        const stats = { same: 0, modified: 0, added: 0, removed: 0 };

        // Process in chunks to avoid freezing UI
        const pathsArray = Array.from(allPaths);
        const CHUNK_SIZE = 10;

        for (let i = 0; i < pathsArray.length; i += CHUNK_SIZE) {
            const chunk = pathsArray.slice(i, i + CHUNK_SIZE);

            // Visual feedback
            if (chunk.length > 0) {
                setCurrentScannedFile(chunk[0]);
            }

            await Promise.all(chunk.map(async (path) => {
                const leftFile = leftMap.get(path);
                const rightFile = rightMap.get(path);

                if (leftFile && !rightFile) {
                    results.push({ path, status: "removed", left: { path, file: leftFile } });
                    stats.removed++;
                } else if (!leftFile && rightFile) {
                    results.push({ path, status: "added", right: { path, file: rightFile } });
                    stats.added++;
                } else if (leftFile && rightFile) {
                    // exists in both. Compare!
                    // Binary Check
                    const [leftIsBinary, rightIsBinary] = await Promise.all([
                        isBinaryFile(leftFile),
                        isBinaryFile(rightFile)
                    ]);

                    if (leftIsBinary || rightIsBinary) {
                        // If either is binary, we can only compare size/lastModified or full binary content?
                        // Requirement says "ignore binary files". We can treat them as "skipped" or just "same" if size matches?
                        // Let's mark as same for now to "ignore" showing diff, or create a 'binary' status.
                        // But if user wants to know if they changed? 
                        // Let's just strictly ignore content diff for binary.
                        // We will mark them as 'same' (or skip) unless size differs?
                        if (leftFile.size !== rightFile.size) {
                            results.push({
                                path,
                                status: "modified",
                                left: { path, file: leftFile, isBinary: true },
                                right: { path, file: rightFile, isBinary: true }
                            });
                            stats.modified++;
                        } else {
                            // Assume same
                            results.push({ path, status: "same" });
                            stats.same++;
                        }
                    } else {
                        // Text comparison
                        const [leftContent, rightContent] = await Promise.all([
                            readFileContent(leftFile),
                            readFileContent(rightFile)
                        ]);

                        if (leftContent !== rightContent) {
                            results.push({
                                path,
                                status: "modified",
                                left: { path, file: leftFile, content: leftContent },
                                right: { path, file: rightFile, content: rightContent }
                            });
                            stats.modified++;
                        } else {
                            results.push({ path, status: "same", left: { path, file: leftFile, content: leftContent }, right: { path, file: rightFile, content: rightContent } });
                            stats.same++;
                        }
                    }
                }
            }));

            processed += chunk.length;
            setProgress(Math.round((processed / total) * 100));

            // Yield to main thread
            await new Promise(r => setTimeout(r, 0));
        }

        setCurrentScannedFile("Building Tree...");

        // Build Tree
        const root: TreeNode = { name: "root", path: "", type: "folder", children: {} };

        results.forEach(res => {
            const parts = res.path.split("/");
            let current = root;

            parts.forEach((part, idx) => {
                const isFile = idx === parts.length - 1;
                const currentPath = parts.slice(0, idx + 1).join("/");

                if (!current.children) current.children = {};

                if (!current.children[part]) {
                    current.children[part] = {
                        name: part,
                        path: currentPath,
                        type: isFile ? "file" : "folder",
                        children: isFile ? undefined : {},
                        status: isFile ? res.status : undefined // Folder status derived later?
                    };
                }

                if (isFile) {
                    current.children[part].diffResult = res;
                    current.children[part].status = res.status;
                }

                current = current.children[part];
            });
        });

        // Propagate status up to folders (optional visualization enhancement)
        const propagateStatus = (node: TreeNode): DiffStatus | undefined => {
            if (node.type === "file") return node.status;

            let hasModified = false;
            let hasAdded = false;
            let hasRemoved = false;

            if (node.children) {
                Object.values(node.children).forEach(child => {
                    const childStatus = propagateStatus(child);
                    if (childStatus === "modified") hasModified = true;
                    if (childStatus === "added") hasAdded = true;
                    if (childStatus === "removed") hasRemoved = true;
                });
            }

            if (hasModified) node.status = "modified";
            else if (hasAdded && hasRemoved) node.status = "modified"; // mixed
            else if (hasAdded) node.status = "added"; // all added (or mixed with same)
            else if (hasRemoved) node.status = "removed"; // all removed
            else node.status = "same";

            return node.status;
        }
        propagateStatus(root);

        setDiffTree(root);
        setDiffStats(stats);
        setIsComparing(false);
    };

    return (
        <div className="flex h-screen flex-col bg-zinc-950 font-sans text-zinc-100 overflow-hidden relative">
            {/* Header */}
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-900 bg-zinc-950/50 px-6 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        className="flex items-center justify-center rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <h1 className="text-xl font-light tracking-wide text-zinc-200">Directory Comparator</h1>
                </div>
            </header>

            <div className={`flex flex-1 flex-col overflow-hidden transition-all duration-300 ${isComparing ? "blur-sm scale-[0.98] opacity-50 pointer-events-none" : ""}`}>
                {/* Inputs Area */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end border-b border-zinc-900 bg-zinc-900/20">
                    {/* Left Input */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-zinc-400">Original / Left Directory</label>
                        <div className="relative group">
                            <div className="flex items-center w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
                                <Folder className="mr-2 h-4 w-4 opacity-50" />
                                <span className="truncate">
                                    {leftFiles.length > 0 ? `${leftFiles[0].webkitRelativePath.split("/")[0]} (${leftFiles.length} files)` : "No folder selected"}
                                </span>
                            </div>
                            <input
                                type="file"
                                // @ts-ignore
                                webkitdirectory=""
                                directory=""
                                multiple
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e) => handleFilesChange(e, "left")}
                            />
                        </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex justify-center pb-1">
                        <button
                            onClick={startComparison}
                            disabled={leftFiles.length === 0 || rightFiles.length === 0 || isComparing}
                            className={`flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-all
                                ${leftFiles.length === 0 || rightFiles.length === 0
                                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                    : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 active:scale-95"
                                }`}
                        >
                            <Play className="h-4 w-4 fill-current" />
                            <span>Compare</span>
                        </button>
                    </div>

                    {/* Right Input */}
                    <div className="space-y-2 text-right">
                        <label className="text-sm font-medium text-zinc-400">Modified / Right Directory</label>
                        <div className="relative group">
                            <div className="flex items-center justify-end w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
                                <span className="truncate">
                                    {rightFiles.length > 0 ? `${rightFiles[0].webkitRelativePath.split("/")[0]} (${rightFiles.length} files)` : "No folder selected"}
                                </span>
                                <Folder className="ml-2 h-4 w-4 opacity-50" />
                            </div>
                            <input
                                type="file"
                                // @ts-ignore
                                webkitdirectory=""
                                directory=""
                                multiple
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e) => handleFilesChange(e, "right")}
                            />
                        </div>
                    </div>
                </div>

                {/* Progress Bar */}
                {isComparing && (
                    <div className="h-1 w-full bg-zinc-900">
                        <div
                            className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}

                {/* Stats */}
                {!isComparing && diffTree && (
                    <div className="flex gap-4 px-4 py-2 border-b border-zinc-900 bg-zinc-900/30 text-xs">
                        <span className="flex items-center gap-1 text-zinc-400">
                            Results:
                        </span>
                        <span className="flex items-center gap-1 text-green-400">
                            <span className="font-bold">{diffStats.added}</span> Added
                        </span>
                        <span className="flex items-center gap-1 text-red-400">
                            <span className="font-bold">{diffStats.removed}</span> Removed
                        </span>
                        <span className="flex items-center gap-1 text-yellow-400">
                            <span className="font-bold">{diffStats.modified}</span> Modified
                        </span>
                        <span className="flex items-center gap-1 text-zinc-500">
                            <span className="font-bold">{diffStats.same}</span> Unchanged
                        </span>
                    </div>
                )}

                {/* Main Content Areas */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Tree View (Left) */}
                    <div className="w-1/3 min-w-[250px] max-w-[400px] border-r border-zinc-900 bg-zinc-950/30 overflow-y-auto">
                        {!diffTree ? (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-8 text-center">
                                <Folder className="h-12 w-12 mb-4 opacity-20" />
                                <p className="text-sm">Select folders and click Compare to view the file tree.</p>
                            </div>
                        ) : (
                            <div className="py-2">
                                {Object.values(diffTree.children || {})
                                    .sort((a, b) => {
                                        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
                                        return a.name.localeCompare(b.name);
                                    })
                                    .map(node => (
                                        <FileTreeItem
                                            key={node.path}
                                            node={node}
                                            level={0}
                                            onSelect={setSelectedNode}
                                            selectedPath={selectedNode?.path ?? null}
                                        />
                                    ))}
                            </div>
                        )}
                    </div>

                    {/* Diff Viewer (Right) */}
                    <div className="flex-1 bg-[#1e1e1e] relative overflow-hidden flex flex-col">
                        {!selectedNode ? (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                <FileText className="h-12 w-12 mb-4 opacity-20" />
                                <p className="text-sm">Select a file to view differences</p>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900 text-xs">
                                    <div className="font-mono text-zinc-300">{selectedNode.path}</div>
                                    <div className="flex gap-2">
                                        <StatusIcon status={selectedNode.status} />
                                        <span className="uppercase">{selectedNode.status}</span>
                                    </div>
                                </div>
                                <div className="flex-1 relative">
                                    {(selectedNode.type === "file") && (
                                        (selectedNode.diffResult?.left?.isBinary || selectedNode.diffResult?.right?.isBinary) ? (
                                            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                                <Binary className="h-12 w-12 mb-4 opacity-20" />
                                                <p className="text-sm">Binary file detected. Content comparison ignored.</p>
                                                {selectedNode.status === "modified" && <p className="text-xs text-yellow-500 mt-2">File size changed</p>}
                                            </div>
                                        ) : (
                                            <DiffEditor
                                                height="100%"
                                                theme="vs-dark"
                                                original={selectedNode.diffResult?.left?.content || ""}
                                                modified={selectedNode.diffResult?.right?.content || ""}
                                                language="plaintext" // We could auto-detect based on extension
                                                options={{
                                                    readOnly: true,
                                                    minimap: { enabled: false },
                                                    scrollBeyondLastLine: false,
                                                    renderSideBySide: true
                                                }}
                                            />
                                        )
                                    )}
                                    {selectedNode.type === "folder" && (
                                        <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                            <Folder className="h-12 w-12 mb-4 opacity-20" />
                                            <p className="text-sm">Folder selected</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Processing / Scanning Overlay */}
            {(isComparing || isProcessing) && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-md p-6 bg-zinc-950 rounded-xl border border-zinc-800 shadow-2xl flex flex-col gap-4">
                        <div className="flex items-center gap-3 border-b border-zinc-900 pb-4">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <Loader2 className="animate-spin h-6 w-6 text-indigo-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-zinc-100">
                                    {isProcessing ? "Processing Files..." : "Comparing Directories..."}
                                </h3>
                                <p className="text-xs text-zinc-500">
                                    {isProcessing ? "Analyzing structure and filtering files" : "Scanning and analyzing file differences"}
                                </p>
                            </div>
                        </div>

                        {isComparing ? (
                            <div>
                                <div className="flex justify-between text-xs text-zinc-400 mb-2 font-medium">
                                    <span>Progress</span>
                                    <span>{progress}%</span>
                                </div>
                                <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            // Indeterminate bar for processing
                            <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden relative">
                                <div className="absolute inset-y-0 bg-indigo-500 w-1/3 animate-[shimmer_1s_infinite] shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                                <style jsx>{`
                                    @keyframes shimmer {
                                        0% { left: -35%; }
                                        100% { left: 100%; }
                                    }
                                `}</style>
                            </div>
                        )}

                        {isComparing && (
                            <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                                <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1 font-semibold">Current File</p>
                                <p className="text-xs text-zinc-300 truncate font-mono">
                                    {currentScannedFile || "Initializing..."}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// Basic CSS for tree structure
