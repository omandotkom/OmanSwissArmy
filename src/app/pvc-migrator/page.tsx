'use client';

import React, { useState, useEffect } from 'react';
import { ProjectSelector } from '@/components/ProjectSelector';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Terminal, LogOut, GitBranch, Search, CheckCircle, AlertTriangle, Save, Copy, Folder, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { UserBadge } from "@/components/UserBadge";
import { trackActivity } from "@/lib/tracker";
import { useToast, ToastContainer } from "@/components/ui/toast";

import Editor, { DiffEditor } from "@monaco-editor/react";

// --- FILE EXPLORER COMPONENTS ---
interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
}

const buildFileTree = (paths: string[]): FileNode[] => {
    const root: FileNode[] = [];
    const addPath = (parts: string[], currentLevel: FileNode[], fullPath: string) => {
        if (parts.length === 0) return;
        const part = parts[0];
        const isFile = parts.length === 1;

        let existing = currentLevel.find(n => n.name === part);
        if (!existing) {
            existing = {
                name: part,
                path: isFile ? fullPath : '', // Only leaf nodes need full path tracking for now
                type: isFile ? 'file' : 'folder',
                children: isFile ? undefined : []
            };
            currentLevel.push(existing);
        }

        if (!isFile && existing.children) {
            addPath(parts.slice(1), existing.children, fullPath);
        }
    };

    paths.forEach(p => addPath(p.split('/'), root, p));

    // Sort directories first
    const sortNodes = (nodes: FileNode[]) => {
        nodes.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'folder' ? -1 : 1;
        });
        nodes.forEach(n => {
            if (n.children) sortNodes(n.children);
        });
    };
    sortNodes(root);
    return root;
};

const FileTreeItem = ({ node, changedFiles, onSelect, activePath }: { node: FileNode, changedFiles: Set<string>, onSelect: (path: string) => void, activePath: string }) => {
    const [isOpen, setIsOpen] = useState(true); // Default open for better visibility
    const isChanged = node.type === 'file' && changedFiles.has(node.path);
    const isActive = node.type === 'file' && node.path === activePath;
    const hasChangedChild = node.type === 'folder' && node.children?.some(c => c.type === 'file' && changedFiles.has(c.path) || (c.type === 'folder' && /* deep check needed but simple for now */ true)); // Simple check

    if (node.type === 'folder') {
        return (
            <div className="pl-2">
                <div
                    className="flex items-center gap-1 py-1 cursor-pointer hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Folder size={14} className="text-blue-400" />
                    <span className="text-xs truncate">{node.name}</span>
                </div>
                {isOpen && node.children && (
                    <div className="border-l border-gray-700 ml-1.5">
                        {node.children.map((child, idx) => (
                            <FileTreeItem key={idx} node={child} changedFiles={changedFiles} onSelect={onSelect} activePath={activePath} />
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div
            onClick={() => onSelect(node.path)}
            className={`flex items-center gap-2 py-1 pl-6 text-xs cursor-pointer transition-colors ${isActive ? 'bg-blue-600/20 text-blue-300 border-r-2 border-blue-500' : 'hover:bg-white/5 text-gray-500'} ${isChanged ? 'text-yellow-400 font-medium' : ''}`}
        >
            <FileText size={14} />
            <span className="truncate">{node.name}</span>
            {isChanged && <span className="w-2 h-2 rounded-full bg-yellow-500 ml-auto mr-2" title="Has Changes"></span>}
        </div>
    );
};
// ----------------------------

interface PvcItem {
    name: string;
    status: string;
    capacity: string;
    storageClass: string;
    accessModes: string[];
}

interface LogEntry {
    step: string;
    status: 'pending' | 'running' | 'success' | 'error';
    message: string;
}

interface ScanMatch {
    file: string;
    line: number;
    content: string;
    type: 'PVC_NAME' | 'STORAGE_CLASS';
    contextId: number;
    selected: boolean;
    newContent?: string; // Calculated on frontend
}

export default function PvcMigratorPage() {
    // Toast
    const { toasts, addToast, removeToast } = useToast();

    // Auth State
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [checkingLogin, setCheckingLogin] = useState(true);
    const [loginCommand, setLoginCommand] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    // Global State
    const [project, setProject] = useState<string>('');
    const [projects, setProjects] = useState<string[]>([]);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [step, setStep] = useState<number>(1);

    // Step 1 State
    const [pvcs, setPvcs] = useState<PvcItem[]>([]);
    const [selectedPvc, setSelectedPvc] = useState<PvcItem | null>(null);
    const [loadingPvcs, setLoadingPvcs] = useState(false);

    // Step 2 State (Config)
    const [targetSc, setTargetSc] = useState('');
    const [migrationStrategy, setMigrationStrategy] = useState<'new-name' | 'same-name'>('new-name');
    const [targetPvcName, setTargetPvcName] = useState('');
    const [scList, setScList] = useState<string[]>([]);
    const [deployments, setDeployments] = useState<{ deploymentName: string, volumeName: string }[]>([]);
    const [loadingDeps, setLoadingDeps] = useState(false);
    const [deleteOldPvc, setDeleteOldPvc] = useState(false);
    const [verifyMethod, setVerifyMethod] = useState<'SIZE' | 'CHECKSUM'>('SIZE');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [activePod, setActivePod] = useState('');

    // Step 3 State (Execution)
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isMigrating, setIsMigrating] = useState(false);
    const [deploymentVolumeName, setDeploymentVolumeName] = useState('');

    // Git State
    const [repoUrl, setRepoUrl] = useState('');
    const [baseBranch, setBaseBranch] = useState('main');
    const [gitUser, setGitUser] = useState('');
    const [gitEmail, setGitEmail] = useState('');

    // Load saved git details
    useEffect(() => {
        const savedUrl = localStorage.getItem('pvc_git_url');
        if (savedUrl) setRepoUrl(savedUrl);

        const savedUser = localStorage.getItem('pvc_git_user');
        if (savedUser) setGitUser(savedUser);

        const savedEmail = localStorage.getItem('pvc_git_email');
        if (savedEmail) setGitEmail(savedEmail);
    }, []);

    // Load saved git details
    useEffect(() => {
        const savedUrl = localStorage.getItem('pvc_git_url');
        if (savedUrl) setRepoUrl(savedUrl);

        const savedUser = localStorage.getItem('pvc_git_user');
        if (savedUser) setGitUser(savedUser);

        const savedEmail = localStorage.getItem('pvc_git_email');
        if (savedEmail) setGitEmail(savedEmail);
    }, []);

    // Save on change
    useEffect(() => { localStorage.setItem('pvc_git_url', repoUrl) }, [repoUrl]);
    useEffect(() => { localStorage.setItem('pvc_git_user', gitUser) }, [gitUser]);
    useEffect(() => { localStorage.setItem('pvc_git_email', gitEmail) }, [gitEmail]);

    const [branchMode, setBranchMode] = useState<'new' | 'existing'>('new');
    const [isScanning, setIsScanning] = useState(false);
    const [scanMatches, setScanMatches] = useState<ScanMatch[]>([]);
    const [scanPath, setScanPath] = useState('');
    const [fileList, setFileList] = useState<string[]>([]);
    const [newBranchName, setNewBranchName] = useState('');
    const [isPushing, setIsPushing] = useState(false);
    const [pushResult, setPushResult] = useState<{ success: boolean, branch?: string, message?: string } | null>(null);

    // Cleanup Logic
    const cleanupTempResources = async (dir: string) => {
        if (!dir) return;
        try {
            await fetch('/api/git/cleanup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempDir: dir }),
                keepalive: true
            });
            console.log('Cleaned up temp dir:', dir);
        } catch (e) {
            console.error('Cleanup failed:', e);
        }
    };

    // Cleanup on Unmount or Change
    useEffect(() => {
        return () => {
            if (scanPath) cleanupTempResources(scanPath);
        };
    }, [scanPath]);

    // Editor State
    const [activeFile, setActiveFile] = useState('');
    const [fileContent, setFileContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [modifiedContent, setModifiedContent] = useState('');
    const [showDiff, setShowDiff] = useState(false);
    const [isLoadingFile, setIsLoadingFile] = useState(false);

    const handleFileSelect = async (path: string) => {
        if (!path || path === activeFile) return;
        setActiveFile(path);
        setIsLoadingFile(true);
        setFileContent('Loading...');
        setOriginalContent('');
        setModifiedContent('');
        setShowDiff(false);

        const fileMatches = scanMatches.filter(m => m.file === path);

        trackActivity({ action: "GITOPS_VIEW_FILE", label: path, details: { changes: fileMatches.length } });

        try {
            // Fetch ORIGINAL content from temp repo
            const res = await fetch('/api/git/read-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tempDir: scanPath, relativePath: path })
            });
            const data = await res.json();

            if (data.content) {
                const rawText = data.content;

                if (fileMatches.length > 0) {
                    // GENERATE MODIFIED CONTENT
                    const lines = rawText.split(/\r?\n/);
                    let changed = false;

                    fileMatches.forEach(m => {
                        const idx = m.line - 1;
                        if (idx >= 0 && idx < lines.length && m.newContent !== undefined) {
                            lines[idx] = m.newContent;
                            changed = true;
                        }
                    });

                    if (changed) {
                        const finalText = lines.join('\n');
                        setOriginalContent(rawText);
                        setModifiedContent(finalText);
                        setShowDiff(true);
                        setFileContent(finalText); // Fallback
                    } else {
                        setFileContent(rawText);
                    }
                } else {
                    setFileContent(rawText);
                }
            } else {
                setFileContent('Error loading file');
            }
        } catch (e) {
            setFileContent('Error loading file');
        } finally {
            setIsLoadingFile(false);
        }
    };

    useEffect(() => {
        checkLoginStatus();
    }, []);

    const checkLoginStatus = async () => {
        setCheckingLogin(true);
        try {
            const res = await fetch('/api/oc/projects');
            if (res.ok) {
                setIsLoggedIn(true);
                fetchProjects();
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
                trackActivity({ action: "LOGIN_SUCCESS", label: "OpenShift Login Success" });
            } else {
                setLoginError(data.error);
                trackActivity({ action: "LOGIN_FAILED", label: "OpenShift Login Failed", details: { error: data.error } });
            }
        } catch (err) {
            setLoginError('Server error');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const fetchProjects = async () => {
        setLoadingProjects(true);
        try {
            const res = await fetch('/api/oc/projects');
            const data = await res.json();
            if (data.projects) setProjects(data.projects);
        } catch (e) {
            console.error("Failed to fetch projects", e);
        } finally {
            setLoadingProjects(false);
        }
    }

    // Fetch PVCs when project changes
    useEffect(() => {
        if (!project) return;
        fetchPvcs();
        fetchStorageClasses();
    }, [project]);

    const fetchPvcs = async () => {
        setLoadingPvcs(true);
        try {
            const res = await fetch(`/api/oc/pvcs?namespace=${project}`);
            const data = await res.json();
            if (data.pvcs) {
                setPvcs(data.pvcs);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingPvcs(false);
        }
    };

    const fetchStorageClasses = async () => {
        setScList(['ocs-storagecluster-cephfs', 'gp2', 'standard', 'px-sc']);
    };

    const handlePvcSelect = async (pvc: PvcItem) => {
        trackActivity({ action: "SELECT_PVC", label: pvc.name, details: { capacity: pvc.capacity, sc: pvc.storageClass } });
        setSelectedPvc(pvc);
        setTargetPvcName(`${pvc.name}-new`);
        setDeleteOldPvc(false); // Reset

        // Check usage
        setLoadingDeps(true);
        try {
            const res = await fetch('/api/oc/migration', {
                method: 'POST',
                body: JSON.stringify({ action: 'FIND_DEPLOYMENT', namespace: project, pvcName: pvc.name })
            });
            const data = await res.json();
            // Handle new enhanced format
            const deps = data.deployments || [];
            setDeployments(deps);

            // Auto-detect Volume Name
            if (deps.length > 0) {
                setDeploymentVolumeName(deps[0].volumeName);
            } else {
                setDeploymentVolumeName('');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingDeps(false);
        }
    };

    const handleDeleteCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        if (checked) {
            setShowConfirmModal(true);
        } else {
            setDeleteOldPvc(false);
            trackActivity({ action: "TOGGLE_DELETE_PVC", label: "Unchecked" });
        }
    };

    const confirmDelete = () => {
        setDeleteOldPvc(true);
        setShowConfirmModal(false);
        trackActivity({ action: "CONFIRM_DELETE_PVC", label: "User Confirmed Danger Action" });
    };

    const cancelDelete = () => {
        setDeleteOldPvc(false);
        setShowConfirmModal(false);
    };

    const handleEmergencyCleanup = async () => {
        if (!activePod && !targetPvcName) return;

        const confirm = window.confirm("Confirm Emergency Cleanup?\n\nThis will delete:\n1. The temporary migration pod\n2. The NEW target PVC (if created)\n\nOnly do this if the migration failed and you want to retry from scratch.");
        if (!confirm) return;

        try {
            addLog('🚨 Starting Emergency Cleanup...', 'running');

            // Delete Pod
            if (activePod) {
                addLog(`Deleting Pod: ${activePod}...`, 'running');
                await fetch('/api/oc/migration', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'CLEANUP_POD',
                        namespace: project,
                        podName: activePod
                    })
                });
                setActivePod(''); // Clear after delete
                trackActivity({ action: "EMERGENCY_CLEANUP", label: "Deleted Pod", details: { pod: activePod } });
            }

            // Delete New PVC
            if (targetPvcName) {
                addLog(`Deleting Target PVC: ${targetPvcName}...`, 'running');
                // We use DELETE_OLD_PVC action type but point it to the NEW PVC name
                await fetch('/api/oc/migration', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'DELETE_OLD_PVC',
                        namespace: project,
                        pvcName: targetPvcName
                    })
                });
            }

            addLog('✅ Emergency Cleanup Completed. You can retry migration now.', 'success');
            setIsMigrating(false); // Reset UI state force
        } catch (e: any) {
            addLog(`Cleanup Failed: ${e.message}`, 'error');
            alert(`Cleanup Failed: ${e.message}`);
        }
    };

    const addLog = (msg: string, status: LogEntry['status'] = 'running') => {
        setLogs(prev => [...prev, { step: msg, status: status, message: msg }]);
    };

    const updateLastLog = (status: LogEntry['status']) => {
        setLogs(prev => {
            const newLogs = [...prev];
            if (newLogs.length > 0) {
                newLogs[newLogs.length - 1].status = status;
            }
            return newLogs;
        });
    }

    const startMigration = async () => {
        trackActivity({
            action: "START_MIGRATION",
            label: `${selectedPvc?.name} -> ${targetPvcName}`,
            details: {
                strategy: migrationStrategy,
                verifyMethod,
                deleteOldPvc,
                targetSc
            }
        });
        if (!selectedPvc || deployments.length === 0) {
            alert('Please select a PVC and ensure it is attached to a deployment (for now deployment auto-update logic requires it)');
            return;
        }

        setIsMigrating(true);
        const startTime = Date.now(); // Start timer

        const depName = deployments[0].deploymentName; // Fix: Extract name from object
        const migrationPodName = `migrator-k-${Date.now()}`;
        setActivePod(migrationPodName); // Track for cleanup

        const volName = deploymentVolumeName || 'gass-app-logs';

        const steps = [
            { action: 'CHECK_HPA', label: 'Checking for Auto-Scalers (HPA)' },
            { action: 'PREPARE_DESTINATION', label: 'Creating Destination PVC' },
            { action: 'SCALE', replicas: 0, label: 'Scaling Down Application' },
            { action: 'START_MIGRATION_POD', label: 'Starting Migration Pod' },
            { action: 'CHECK_CAPABILITIES', label: 'Auditing Pod Capabilities (Root/Rsync)' },
            { action: 'COPY_DATA', label: 'Copying Data' },
            { action: 'VERIFY_DATA', label: `Verifying Data (${verifyMethod} Method)` },
            { action: 'SWITCH_VOLUME', label: 'Updating Deployment Configuration' },
            { action: 'SCALE', replicas: 1, label: 'Scaling Up Application' },
            { action: 'CLEANUP_POD', label: 'Cleaning Migration Resources' },
        ];

        if (deleteOldPvc) {
            steps.push({ action: 'DELETE_OLD_PVC', label: 'Deleting Old PVC (User Confirmed)' });
        }

        try {
            setLogs([]);
            for (const step of steps) {
                addLog(step.label, 'running');

                const payload: any = {
                    action: step.action,
                    namespace: project,
                    pvcName: selectedPvc.name,
                    targetPvcName: targetPvcName,
                    storageClass: targetSc,
                    deploymentName: depName,
                    podName: migrationPodName,
                    volName: volName,
                    capacity: selectedPvc.capacity,
                };

                if (step.action === 'SCALE') payload.replicas = step.replicas;
                if (step.action === 'VERIFY_DATA') payload.method = verifyMethod;

                const res = await fetch('/api/oc/migration', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                if (!res.ok) throw new Error((await res.json()).error);

                const json = await res.json();

                // If the step returned a specific audit strategy, log it explicitly
                if (step.action === 'CHECK_CAPABILITIES' && json.strategy) {
                    updateLastLog('success'); // Mark audit as done
                    // Add the new line for strategy
                    addLog(`📋 Planning migration : ${json.strategy}`, 'success');
                } else if (json.message) {
                    // Update the running log with the server message if provided
                    setLogs(prev => {
                        const newLogs = [...prev];
                        if (newLogs.length > 0) {
                            newLogs[newLogs.length - 1].message = json.message;
                            newLogs[newLogs.length - 1].status = 'success';
                        }
                        return newLogs;
                    });
                } else {
                    updateLastLog('success');
                }

                // Helper to format duration
                const formatDuration = (ms: number) => {
                    const sec = Math.floor(ms / 1000);
                    const min = Math.floor(sec / 60);
                    const s = sec % 60;
                    return min > 0 ? `${min}m ${s}s` : `${s}s`;
                };

                // If this is the LAST step (CLEANUP_POD), we are done!
                const isLastStep = step.action === 'CLEANUP_POD' || (deleteOldPvc && step.action === 'DELETE_OLD_PVC');
                if (isLastStep) {
                    const duration = formatDuration(Date.now() - startTime);
                    updateLastLog('success'); // Mark cleanup as success
                    addLog(`🎉 Migration Completed Successfully in ${duration}!`, 'success');
                    addLog(`IMPORTANT: Update your Git/YAML Deployment config to use PVC '${targetPvcName}' to prevent rollback!`, 'pending');
                    trackActivity({ action: "MIGRATION_SUCCESS", label: "Migration Completed", details: { duration } });
                } else {
                    updateLastLog('success');
                }
            }

        } catch (e: any) {
            console.error(e);
            updateLastLog('error');
            // Add a specific error log entry so user sees it in the timeline
            addLog(`FAILED: ${e.message}`, 'error');
            addToast(`Migration Failed: ${e.message}`, 'error');
            trackActivity({ action: "MIGRATION_FAILED", label: e.message });
        } finally {
            setIsMigrating(false);
        }
    };

    // ----- STEP 4: GITOPS LOGIC -----

    const handleScanRepo = async () => {
        if (!repoUrl) return;
        setIsScanning(true);
        setScanMatches([]);
        trackActivity({ action: "GITOPS_SCAN_START", label: repoUrl }); // TRACKING ADDED
        try {
            const res = await fetch('/api/git/ops-pvc-scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repoUrl,
                    branch: baseBranch,
                    oldPvcName: selectedPvc?.name,
                    oldStorageClass: selectedPvc?.storageClass
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Pre-calculate new content for UI
            const matchesWithFixes = (data.matches || []).map((m: any) => {
                let newContent = m.content;
                // Replace logic
                if (m.type === 'PVC_NAME') {
                    newContent = m.content.replace(selectedPvc?.name, targetPvcName);
                } else if (m.type === 'STORAGE_CLASS') {
                    // Replace old class with new class
                    // Need to be careful to only replace the value part? Simple replace should be safe if the string is distinctive
                    // Assuming standard yaml: 'storageClass: old' -> 'storageClass: new'
                    newContent = m.content.replace(selectedPvc?.storageClass, targetSc);
                }
                return { ...m, selected: true, newContent };
            });

            setScanMatches(matchesWithFixes);
            if (data.tempDir) setScanPath(data.tempDir);
            if (data.allFiles) setFileList(data.allFiles);
            trackActivity({ action: "GITOPS_SCAN_SUCCESS", label: `Found ${matchesWithFixes.length} matches` }); // TRACKING ADDED

            if (matchesWithFixes.length === 0) {
                addToast("Scan complete. No matches found.", "error");
            } else {
                addToast(`Scan complete. Found ${matchesWithFixes.length} matches.`);
            }
        } catch (e: any) {
            addToast(`Scan failed: ${e.message}`, 'error');
            trackActivity({ action: "GITOPS_SCAN_FAILED", label: e.message }); // TRACKING ADDED
        } finally {
            setIsScanning(false);
        }
    };

    const handlePushFixes = async () => {
        const fixesToPush = scanMatches.filter(m => m.selected).map(m => ({
            file: m.file,
            line: m.line,
            type: m.type,
            originalContent: m.content,
            newContent: m.newContent
        }));

        if (fixesToPush.length === 0) return;

        setIsPushing(true);
        trackActivity({ action: "GITOPS_PUSH_START", label: `Committing ${fixesToPush.length} changes` }); // TRACKING ADDED
        try {
            const res = await fetch('/api/git/ops-pvc-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repoUrl,
                    baseBranch,
                    fixes: fixesToPush,
                    branch: newBranchName || undefined, // Send if set
                    branchMode, // 'new' or 'existing'
                    authorName: gitUser || 'Oman Swiss Army Bot',
                    authorEmail: gitEmail || 'bot@omansmissarmy.tool',
                    message: `chore: migrate PVC ${selectedPvc?.name} to ${targetPvcName} (${targetSc})`
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setPushResult({
                success: true,
                branch: data.branch,
                message: data.message
            });
            trackActivity({ action: "GITOPS_PUSH_SUCCESS", label: "Push Completed", details: { branch: data.branch } }); // TRACKING ADDED
        } catch (e: any) {
            setPushResult({ success: false, message: e.message });
            trackActivity({ action: "GITOPS_PUSH_FAILED", label: e.message }); // TRACKING ADDED
        } finally {
            setIsPushing(false);
        }
    };

    // INSPECT PVC LOGIC
    const handleInspectPvc = async (pvc: any) => {
        addToast("Finding active pod...", "success");
        try {
            const res = await fetch('/api/oc/migration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'FIND_ACTIVE_POD',
                    namespace: project,
                    pvcName: pvc.name
                })
            });
            const data = await res.json();

            if (res.ok && data.found) {
                const url = `/pvc-browser?project=${project}&pod=${data.podName}&path=${encodeURIComponent(data.mountPath)}`;
                window.open(url, '_blank');
                trackActivity({ action: "INSPECT_PVC_SUCCESS", label: pvc.name, details: { pod: data.podName } });
            } else {
                addToast(data.message || "No active pod found mounting this PVC.", "error");
                trackActivity({ action: "INSPECT_PVC_NO_POD", label: pvc.name });
            }
        } catch (e) {
            addToast("Failed to inspect PVC", "error");
        }
    };

    if (checkingLogin) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading...</div>;

    if (!isLoggedIn) {
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

    // DEV: Bypass Logic
    const isDev = process.env.NODE_ENV === 'development';
    const handleDevJump = () => {
        // Prompt 1: OLD PVC (Search Anchor)
        const testPvcName = window.prompt("1. Enter OLD PVC Name (Anchor to search in Git):", "gass-app-logs");
        if (!testPvcName) return;

        // Prompt 2: NEW PVC (Replacement)
        const newPvcName = window.prompt("2. Enter NEW PVC Name (Replacement):", `${testPvcName}-new`);
        if (!newPvcName) return;

        // Prompt 3: NEW Storage Class
        const newScName = window.prompt("3. Enter NEW Storage Class:", "ocs-storagecluster-cephfs");
        if (!newScName) return;

        setProject('dev-project');
        // Use the input names
        setSelectedPvc({ name: testPvcName, status: 'Bound', capacity: '10Gi', storageClass: 'gp2', accessModes: ['RWO'] });
        setTargetPvcName(newPvcName);
        setTargetSc(newScName);
        setStep(4);
        trackActivity({ action: "DEV_BYPASS_GITOPS", label: "Jumped to Step 4" });
    };

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 p-8 space-y-8 relative">
            <ToastContainer toasts={toasts} removeToast={removeToast} />
            {/* DEV BUTTON */}
            {isDev && (
                <div className="absolute top-4 right-4 z-50">
                    <button
                        onClick={handleDevJump}
                        className="px-3 py-1 bg-purple-900/50 border border-purple-500 text-purple-200 text-xs rounded hover:bg-purple-800 transition-colors"
                    >
                        🐛 DEV: Jump to GitOps
                    </button>
                </div>
            )}
            {/* Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-red-500/50 rounded-2xl max-w-lg w-full p-8 shadow-2xl shadow-red-900/20 transform scale-100 animate-in zoom-in-95 duration-200">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                                <span className="text-3xl">⚠️</span>
                            </div>

                            <h3 className="text-2xl font-bold text-white mb-2">Danger Zone</h3>
                            <p className="text-zinc-400 mb-8 leading-relaxed">
                                Are you sure you want to <span className="text-red-400 font-bold">AUTOMATICALLY DELETE</span> the original PVC after migration?
                                <br /><br />
                                <span className="bg-red-500/10 text-red-400 px-2 py-1 rounded text-sm border border-red-500/20">
                                    This action is IRREVERSIBLE
                                </span>
                                <br /><br />
                                If the migration has data corruption issues, you will not have a backup to restore from.
                            </p>

                            <div className="flex w-full gap-4">
                                <button
                                    onClick={cancelDelete}
                                    className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-900/30 transition-all hover:scale-105"
                                >
                                    Yes, Delete It
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/"
                        onClick={() => trackActivity({ action: "CLICK_BACK", label: "Back to Home Header" })}
                        className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors text-white"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
                        OpenShift PVC Migration Wizard
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                    <UserBadge />
                    <button onClick={() => { setIsLoggedIn(false); trackActivity({ action: "CLICK_DISCONNECT", label: "Disconnect Auth" }); }} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors border border-slate-700">
                        <LogOut size={16} /> Disconnect
                    </button>
                </div>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center space-x-4 mb-8">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className={`flex items-center ${step >= i ? 'text-blue-600' : 'text-gray-400'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= i ? 'border-blue-600 bg-blue-100' : 'border-gray-600'}`}>
                            {i}
                        </div>
                        <span className="ml-2 font-medium">
                            {i === 1 ? 'Select Source' : i === 2 ? 'Configure' : i === 3 ? 'Migrate' : 'Update Repo'}
                        </span>
                        {i < 4 && <div className="w-12 h-0.5 bg-gray-600 ml-4" />}
                    </div>
                ))}
            </div>

            {/* STEP 1: SELECT SOURCE */}
            {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="w-full max-w-2xl">
                        <label className="block text-sm font-medium mb-2">Project / Namespace</label>
                        <ProjectSelector
                            projects={projects}
                            onSelect={(p) => { setProject(p); trackActivity({ action: "SELECT_PROJECT", label: p }); }}
                            selectedProject={project}
                            isLoading={loadingProjects}
                        />
                    </div>

                    {project && (
                        <div className="bg-white/5 p-6 rounded-xl border border-gray-800 shadow-sm">
                            <h2 className="text-xl font-semibold mb-4">Available PVCs</h2>
                            {loadingPvcs ? (
                                <div className="text-center py-8 text-gray-500">Loading PVCs...</div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-gray-700">
                                            <th className="p-3">Name</th>
                                            <th className="p-3">Status</th>
                                            <th className="p-3">Capacity</th>
                                            <th className="p-3">StorageClass</th>
                                            <th className="p-3">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pvcs.map(pvc => (
                                            <tr key={pvc.name} className="hover:bg-white/5 transition-colors">
                                                <td className="p-3 font-mono text-sm">{pvc.name}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-xs ${pvc.status === 'Bound' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                        {pvc.status}
                                                    </span>
                                                </td>
                                                <td className="p-3">{pvc.capacity}</td>
                                                <td className="p-3 text-gray-500">{pvc.storageClass}</td>
                                                <td className="p-3 flex items-center gap-2">
                                                    <button
                                                        onClick={() => { handlePvcSelect(pvc); setStep(2); trackActivity({ action: "CLICK_PVC_SELECT", label: pvc.name }); }}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all shadow-lg shadow-blue-500/30"
                                                    >
                                                        Select
                                                    </button>
                                                    {pvc.status === 'Bound' && (
                                                        <button
                                                            onClick={() => handleInspectPvc(pvc)}
                                                            className="p-2 bg-zinc-700 hover:bg-zinc-600 text-blue-300 rounded-lg transition-colors border border-zinc-600"
                                                            title="Inspect Content (PVC Browser)"
                                                        >
                                                            <Search size={16} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* STEP 2: CONFIGURE */}
            {step === 2 && selectedPvc && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="grid grid-cols-2 gap-8">
                        {/* Source Info */}
                        <div className="p-6 bg-white/5 rounded-xl border border-gray-800">
                            <h3 className="text-lg font-semibold mb-4 text-gray-500">Source Configuration</h3>
                            <div className="space-y-3 font-mono text-sm">
                                <div className="flex justify-between"><span>Namespace:</span> <span className="font-bold text-zinc-300">{project}</span></div>
                                <div className="flex justify-between"><span>Name:</span> <span>{selectedPvc.name}</span></div>
                                <div className="flex justify-between"><span>Capacity:</span> <span>{selectedPvc.capacity}</span></div>
                                <div className="flex justify-between"><span>Old Class:</span> <span>{selectedPvc.storageClass}</span></div>
                                <div className="mt-4 pt-4 border-t border-gray-800">
                                    <span className="block mb-2 text-gray-400">Attached Deployments:</span>
                                    {loadingDeps ? (
                                        <div className="animate-pulse h-4 bg-gray-700 rounded w-1/2"></div>
                                    ) : (
                                        deployments.length > 0 ? (
                                            deployments.map(d => <div key={d.deploymentName} className="text-yellow-500">⚠️ {d.deploymentName}</div>)
                                        ) : (
                                            <div className="text-green-500">No active deployments found</div>
                                        )
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Target Config */}
                        <div className="p-6 bg-gray-900 rounded-xl border border-blue-500/30 shadow-xl shadow-blue-500/10">
                            <h3 className="text-lg font-semibold mb-4 text-blue-500">Target Configuration</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">New Storage Class</label>
                                    <select
                                        className="w-full bg-transparent border border-gray-600 rounded-lg p-2 text-white"
                                        value={targetSc}
                                        onChange={(e) => { setTargetSc(e.target.value); trackActivity({ action: "CHANGE_TARGET_SC", label: e.target.value }); }}
                                    >
                                        <option value="" className="text-black">Select Storage Class...</option>
                                        {scList.map(sc => <option key={sc} value={sc} className="text-black">{sc}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1">Target PVC Name</label>
                                    <input
                                        type="text"
                                        value={targetPvcName}
                                        onChange={(e) => setTargetPvcName(e.target.value)}
                                        className="w-full bg-transparent border border-gray-600 rounded-lg p-2 font-mono"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Recommended: {selectedPvc.name}-new</p>
                                </div>

                                <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                                    <h4 className="font-bold text-yellow-600 text-sm mb-1">⚠️ Requirement</h4>
                                    <p className="text-xs text-yellow-700/80">
                                        Please specify the <strong>Volume Name</strong> inside the Deployment YAML that corresponds to this PVC.
                                    </p>
                                    <input
                                        type="text"
                                        placeholder="e.g. gass-app-logs (Volume Name in spec)"
                                        value={deploymentVolumeName}
                                        onChange={(e) => setDeploymentVolumeName(e.target.value)}
                                        className="mt-2 w-full bg-transparent border border-yellow-600/50 rounded-lg p-2 font-mono text-sm"
                                    />
                                </div>

                                {/* VERIFICATION OPTIONS */}
                                <div>
                                    <label className="block text-sm font-medium mb-2">Verification Method</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div
                                            onClick={() => { setVerifyMethod('SIZE'); trackActivity({ action: "SELECT_VERIFY_METHOD", label: "SIZE (Quick)" }); }}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${verifyMethod === 'SIZE' ? 'bg-blue-500/20 border-blue-500 ring-1 ring-blue-500' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <input type="radio" checked={verifyMethod === 'SIZE'} readOnly className="text-blue-500" />
                                                <span className="font-bold text-sm">Quick Verify (Count)</span>
                                            </div>
                                            <p className="text-xs text-gray-400"><strong>Checks:</strong> File Count & Directory Structure Paths.</p>
                                            <div className="mt-2 text-xs flex gap-2">
                                                <span className="text-green-500">✅ Fast</span>
                                                <span className="text-yellow-500">⚠️ Less Precise</span>
                                            </div>
                                        </div>

                                        <div
                                            onClick={() => { setVerifyMethod('CHECKSUM'); trackActivity({ action: "SELECT_VERIFY_METHOD", label: "CHECKSUM (Deep)" }); }}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${verifyMethod === 'CHECKSUM' ? 'bg-blue-500/20 border-blue-500 ring-1 ring-blue-500' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <input type="radio" checked={verifyMethod === 'CHECKSUM'} readOnly className="text-blue-500" />
                                                <span className="font-bold text-sm">Deep Verify (Diff)</span>
                                            </div>
                                            <p className="text-xs text-gray-400"><strong>Checks:</strong> Byte-by-byte File Content Integrity.</p>
                                            <div className="mt-2 text-xs flex gap-2">
                                                <span className="text-green-500">✅ 100% Secure</span>
                                                <span className="text-red-500">❌ Very Slow</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={`p-4 border rounded-lg transition-colors ${deleteOldPvc ? 'bg-red-500/10 border-red-500' : 'bg-white/5 border-gray-600'}`}>
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={deleteOldPvc}
                                            onChange={handleDeleteCheckbox}
                                            className="mt-1 w-5 h-5 text-red-600 rounded focus:ring-red-500"
                                        />
                                        <div className="flex-1">
                                            <span className={`block font-bold text-sm ${deleteOldPvc ? 'text-red-500' : 'text-gray-400'}`}>
                                                Delete Old PVC after Migration
                                            </span>
                                            <p className="text-xs text-gray-500 mt-1">
                                                If checked, the original PVC <strong>{selectedPvc.name}</strong> will be PERMANENTLY deleted after success.
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between pt-4">
                        <button onClick={() => { setStep(1); trackActivity({ action: "STEP_BACK", label: "Back to Step 1" }); }} className="px-6 py-2 text-gray-500 hover:text-white transition-colors">Back</button>
                        <button
                            disabled={!targetSc || !deploymentVolumeName}
                            onClick={() => { setStep(3); trackActivity({ action: "STEP_NEXT", label: "Review & Migrate Info", details: { targetPvcName, targetSc } }); }}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg shadow-lg"
                        >
                            Next: Review & Migrate
                        </button>
                    </div>
                </div>
            )}

            {/* STEP 3: MIGRATE */}
            {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-black/40 rounded-xl p-6 border border-gray-800 font-mono text-sm h-96 overflow-y-auto">
                        {logs.length === 0 && (
                            <div className="text-gray-500 text-center mt-32">
                                Ready to start migration.<br />
                                This will cause downtime for <strong>{deployments.map(d => d.deploymentName).join(', ')}</strong>.
                            </div>
                        )}
                        {logs.map((log, idx) => (
                            <div key={idx} className="flex items-center space-x-3 mb-2">
                                {log.status === 'running' && <span className="animate-spin">⏳</span>}
                                {log.status === 'success' && <span className="text-green-500">✅</span>}
                                {log.status === 'error' && <span className="text-red-500">❌</span>}
                                <span className={log.status === 'error' ? 'text-red-400' : 'text-gray-300'}>
                                    {log.message}
                                </span>
                            </div>
                        ))}

                        {/* Emergency Cleanup Button - Only shows on error */}
                        {logs.some(l => l.status === 'error') && (
                            <div className="mt-8 pt-4 border-t border-red-900/50">
                                <h4 className="text-red-400 font-bold mb-2">Build Failed? Clean Up Resources</h4>
                                <button
                                    onClick={handleEmergencyCleanup}
                                    className="px-4 py-2 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-200 rounded-lg flex items-center gap-2 transition-colors"
                                >
                                    <span>🚨</span> Emergency Cleanup (Delete Pod & New PVC)
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end space-x-4">
                        {!isMigrating && logs.length === 0 && (
                            <button onClick={() => { setStep(2); trackActivity({ action: "CANCEL_STEP_3", label: "Back to Config" }); }} className="px-6 py-2 text-gray-500 hover:text-white transition-colors">Cancel</button>
                        )}

                        {/* Go to Step 4 Button (Appears after success) */}
                        {logs.some(l => l.message.includes('Migration Completed')) && (
                            <button
                                onClick={() => setStep(4)}
                                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-xl transition-all flex items-center gap-2"
                            >
                                <GitBranch size={20} />
                                Next: Update Git Repo
                            </button>
                        )}

                        {/* Start Button */}
                        {!logs.some(l => l.message.includes('Migration Completed')) && (
                            <button
                                onClick={startMigration}
                                disabled={isMigrating || logs.length > 0}
                                className={`px-8 py-3 rounded-xl font-bold text-white shadow-xl transition-all
                                    ${isMigrating ? 'bg-gray-600 cursor-wait' :
                                        logs.some(l => l.status === 'success') ? 'bg-green-600' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                                {isMigrating ? 'Migrating...' : logs.length > 0 ? 'Migration Completed' : 'START MIGRATION'}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* STEP 4: GITOPS UPDATE */}
            {step === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="bg-slate-800/50 p-6 rounded-xl border border-indigo-500/30">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                                <GitBranch className="text-indigo-400" size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Update Deployment Repository</h3>
                                <p className="text-gray-400 text-sm">
                                    Sync the changes to your GitOps repository to prevent rollback on next deployment.
                                    <br />
                                    We will find occurances of <strong>{selectedPvc?.name}</strong> and update them to <strong>{targetPvcName}</strong> (and update storage class to <strong>{targetSc}</strong>).
                                </p>
                            </div>
                        </div>

                        {/* Input Form */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Git Repository URL</label>
                                <input
                                    type="text"
                                    value={repoUrl}
                                    onChange={e => setRepoUrl(e.target.value)}
                                    placeholder="https://gitlab.com/company/repo.git"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Base Branch</label>
                                <input
                                    type="text"
                                    value={baseBranch}
                                    onChange={e => setBaseBranch(e.target.value)}
                                    placeholder="main"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm font-mono"
                                />
                            </div>
                        </div>

                        {/* Author Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 pt-4 border-t border-slate-700/50">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Git Author Name</label>
                                <input
                                    type="text"
                                    value={gitUser}
                                    onChange={e => setGitUser(e.target.value)}
                                    placeholder="e.g. John Doe"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Git Author Email</label>
                                <input
                                    type="text"
                                    value={gitEmail}
                                    onChange={e => setGitEmail(e.target.value)}
                                    placeholder="e.g. john@company.com"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
                                />
                            </div>
                        </div>

                        {/* Scan Button */}
                        {scanMatches.length === 0 && !pushResult && (
                            <button
                                onClick={handleScanRepo}
                                disabled={isScanning || !repoUrl}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                {isScanning ? <RefreshCw className="animate-spin" size={18} /> : <Search size={18} />}
                                {isScanning ? 'Cloning & Scanning...' : 'Scan Repository'}
                            </button>
                        )}

                        {/* Results Area */}
                        {(fileList.length > 0 || scanMatches.length > 0) && !pushResult && (
                            <div className="flex flex-col md:flex-row gap-6 h-[600px]">
                                {/* LEFT: FILE EXPLORER */}
                                <div className="w-full md:w-64 shrink-0 flex flex-col bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                                    <div className="p-3 bg-slate-800 border-b border-slate-700 text-xs font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                                        Explorer
                                        <span className="bg-slate-700 text-slate-300 px-1.5 rounded">{fileList.length} files</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2">
                                        {/* Render Tree */}
                                        {(() => {
                                            const tree = buildFileTree(fileList);
                                            const changedSet = new Set(scanMatches.map(m => m.file));
                                            return tree.map((node, i) => (
                                                <FileTreeItem
                                                    key={i}
                                                    node={node}
                                                    changedFiles={changedSet}
                                                    onSelect={handleFileSelect}
                                                    activePath={activeFile}
                                                />
                                            ));
                                        })()}
                                    </div>
                                </div>

                                {/* RIGHT: EDITOR / CHANGES */}
                                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                    {scanPath && (
                                        <div className="flex items-center gap-2 p-2 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-gray-500 overflow-hidden shrink-0">
                                            <span className="shrink-0 text-gray-600">Scan Source:</span>
                                            <span className="truncate flex-1">{scanPath}</span>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(scanPath);
                                                    trackActivity({ action: "GITOPS_COPY_PATH", label: "Copied Scan Path" });
                                                    addToast("Path copied to clipboard!");
                                                }}
                                                className="p-1 hover:text-white transition-colors"
                                                title="Copy Path"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        </div>
                                    )}

                                    {/* Replacement Plan Legend */}
                                    <div className="grid grid-cols-2 gap-4 bg-indigo-900/20 p-4 rounded-lg border border-indigo-500/20 text-sm shrink-0">
                                        <div>
                                            <div className="text-xs text-indigo-300 uppercase font-bold tracking-wider mb-2">Replacements Strategy</div>
                                            <div className="space-y-2 font-mono">
                                                <div>
                                                    <span className="text-gray-500 text-xs block">PVC Name:</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-red-400 bg-red-900/20 px-1 rounded line-through decoration-red-500">{selectedPvc?.name}</span>
                                                        <span className="text-gray-500">➔</span>
                                                        <span className="text-green-400 bg-green-900/20 px-1 rounded font-bold">{targetPvcName}</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <span className="text-gray-500 text-xs block">Storage Class:</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-red-400 bg-red-900/20 px-1 rounded line-through decoration-red-500">{selectedPvc?.storageClass}</span>
                                                        <span className="text-gray-500">➔</span>
                                                        <span className="text-green-400 bg-green-900/20 px-1 rounded font-bold">{targetSc}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-400 border-l border-indigo-500/20 pl-4 flex flex-col justify-center">
                                            <p>
                                                <span className="text-indigo-400 font-bold">INFO:</span> We use smart contextual search. The Storage Class will only be replaced if it appears near the PVC Name (within 15 lines).
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex-1 bg-black/30 rounded-lg border border-gray-700 overflow-hidden flex flex-col relative">
                                        <div className="p-2 bg-slate-800 border-b border-gray-700 text-xs font-bold text-gray-400 flex justify-between items-center">
                                            <span>
                                                {activeFile ? activeFile : 'SELECT A FILE TO VIEW'}
                                                {activeFile && scanMatches.some(m => m.file === activeFile) && <span className="ml-2 text-yellow-500 text-[10px]">(MODIFIED PREVIEW)</span>}
                                            </span>
                                            {activeFile && (
                                                <span className="text-[10px] uppercase">{activeFile.split('.').pop()?.toUpperCase()}</span>
                                            )}
                                        </div>

                                        <div className="flex-1 relative">
                                            {activeFile ? (
                                                isLoadingFile ? (
                                                    <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                                                        <RefreshCw className="animate-spin mb-2" />
                                                    </div>
                                                ) : (
                                                    showDiff ? (
                                                        <DiffEditor
                                                            height="100%"
                                                            language={activeFile.endsWith('.json') ? 'json' : (activeFile.endsWith('.ts') ? 'typescript' : 'yaml')}
                                                            original={originalContent}
                                                            modified={modifiedContent}
                                                            theme="vs-dark"
                                                            options={{
                                                                padding: { top: 16 },
                                                                minimap: { enabled: false },
                                                                fontSize: 12,
                                                                readOnly: true,
                                                                scrollBeyondLastLine: false,
                                                                renderSideBySide: true, // Side by side diff
                                                            }}
                                                        />
                                                    ) : (
                                                        <Editor
                                                            height="100%"
                                                            defaultLanguage="yaml"
                                                            language={activeFile.endsWith('.json') ? 'json' : (activeFile.endsWith('.ts') ? 'typescript' : 'yaml')}
                                                            value={fileContent}
                                                            theme="vs-dark"
                                                            options={{
                                                                padding: { top: 16 },
                                                                minimap: { enabled: false },
                                                                fontSize: 12,
                                                                readOnly: true,
                                                                scrollBeyondLastLine: false,
                                                            }}
                                                        />
                                                    )
                                                )
                                            ) : (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                                                    <Search size={48} className="mb-4 opacity-20" />
                                                    <p>Select a file from the explorer to preview changes</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-3 shrink-0 border-t border-slate-700 pt-3">
                                        <div className="flex flex-col gap-2 mb-1">
                                            <span className="text-[10px] text-gray-500 font-bold uppercase">Push Strategy</span>
                                            <div className="flex items-center gap-6">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${branchMode === 'new' ? 'border-blue-500 bg-blue-500/20' : 'border-gray-600 group-hover:border-gray-500'}`}>
                                                        {branchMode === 'new' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                                    </div>
                                                    <input
                                                        type="radio"
                                                        name="branchMode"
                                                        className="hidden"
                                                        checked={branchMode === 'new'}
                                                        onChange={() => { setBranchMode('new'); setNewBranchName(''); }}
                                                    />
                                                    <span className={`text-sm ${branchMode === 'new' ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}>Create New Branch (PR)</span>
                                                </label>

                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${branchMode === 'existing' ? 'border-yellow-500 bg-yellow-500/20' : 'border-gray-600 group-hover:border-gray-500'}`}>
                                                        {branchMode === 'existing' && <div className="w-2 h-2 rounded-full bg-yellow-500" />}
                                                    </div>
                                                    <input
                                                        type="radio"
                                                        name="branchMode"
                                                        className="hidden"
                                                        checked={branchMode === 'existing'}
                                                        onChange={() => { setBranchMode('existing'); setNewBranchName(baseBranch); }}
                                                    />
                                                    <span className={`text-sm ${branchMode === 'existing' ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}>
                                                        Direct Commit to <span className="font-mono text-yellow-500">{baseBranch || 'Branch'}</span>
                                                    </span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="flex-1 relative">
                                                <input
                                                    type="text"
                                                    value={newBranchName}
                                                    onChange={e => setNewBranchName(e.target.value)}
                                                    placeholder={branchMode === 'new' ? `migrate-${selectedPvc?.name || 'pvc'}-${Date.now().toString().slice(-4)}` : baseBranch}
                                                    className={`w-full bg-slate-900 border rounded-lg p-2 text-sm font-mono text-white placeholder-gray-600 focus:ring-1 outline-none transition-colors ${branchMode === 'existing' ? 'border-yellow-600/50 focus:ring-yellow-500' : 'border-slate-600 focus:ring-blue-500'}`}
                                                />
                                                {branchMode === 'new' && !newBranchName && (
                                                    <span className="absolute right-3 top-2.5 text-xs text-gray-600 pointer-events-none italic">Auto-generated name</span>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setScanMatches([]); // Reset to scan again
                                                    setFileList([]);
                                                    setActiveFile('');
                                                    setScanPath(''); // Triggers cleanup via useEffect
                                                    trackActivity({ action: "GITOPS_RESCAN", label: "Reset Scan" });
                                                }}
                                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors text-gray-300"
                                            >
                                                Rescan
                                            </button>
                                            <button
                                                onClick={handlePushFixes}
                                                disabled={isPushing || scanMatches.filter(m => m.selected).length === 0}
                                                className={`px-6 py-2 rounded-lg font-bold shadow-lg transition-colors flex items-center justify-center gap-2 text-white ${isPushing || scanMatches.filter(m => m.selected).length === 0 ? 'bg-slate-700 cursor-not-allowed opacity-50' : (branchMode === 'existing' ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-green-600 hover:bg-green-500')}`}
                                            >
                                                {isPushing ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                                                {isPushing ? 'Pushing...' : (branchMode === 'existing' ? 'Commit Directly' : 'Push Branch')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Success View */}
                        {pushResult && (
                            <div className={`p-6 rounded-xl border ${pushResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} flex flex-col items-center text-center space-y-4`}>
                                {pushResult.success ? (
                                    <>
                                        <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center text-green-400">
                                            <CheckCircle size={28} />
                                        </div>
                                        <h4 className="text-xl font-bold text-white">Update Pushed Successfully!</h4>
                                        <p className="text-gray-300">
                                            Changes have been pushed to branch: <br />
                                            <span className="font-mono text-green-300 bg-slate-900 px-2 py-1 rounded mt-2 inline-block">{pushResult.branch}</span>
                                        </p>
                                        <div className="pt-4">
                                            <a href={repoUrl.replace('.git', '') + '/merge_requests/new'} target="_blank" className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium inline-flex items-center gap-2">
                                                Create Pull Request ↗
                                            </a>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-red-400">
                                            <AlertTriangle size={28} />
                                        </div>
                                        <h4 className="text-xl font-bold text-white">Push Failed</h4>
                                        <p className="text-red-300">{pushResult.message}</p>
                                        <button onClick={() => setPushResult(null)} className="text-sm text-gray-400 underline">Try Again</button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
