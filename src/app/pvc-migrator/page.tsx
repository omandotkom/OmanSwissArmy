
'use client';

import React, { useState, useEffect } from 'react';
import { ProjectSelector } from '@/components/ProjectSelector';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

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

export default function PvcMigratorPage() {
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
    const [deploymentVolumeName, setDeploymentVolumeName] = useState(''); // Need to identify volume name, might need user input or auto-detect

    useEffect(() => {
        fetchProjects();
    }, []);

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
        }
    };

    const confirmDelete = () => {
        setDeleteOldPvc(true);
        setShowConfirmModal(false);
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
            { action: 'COPY_DATA', label: 'Copying Data (rsync/cp)' },
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
                } else {
                    updateLastLog('success');
                }
            }

        } catch (e: any) {
            console.error(e);
            updateLastLog('error');
            // Add a specific error log entry so user sees it in the timeline
            addLog(`FAILED: ${e.message}`, 'error');
            alert(`Migration Failed: ${e.message}`);
        } finally {
            setIsMigrating(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 relative">
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

            <div className="flex items-center gap-4">
                <Link href="/" className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors text-white">
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
                    OpenShift PVC Migration Wizard
                </h1>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center space-x-4 mb-8">
                {[1, 2, 3].map(i => (
                    <div key={i} className={`flex items-center ${step >= i ? 'text-blue-600' : 'text-gray-400'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${step >= i ? 'border-blue-600 bg-blue-100' : 'border-gray-300'}`}>
                            {i}
                        </div>
                        <span className="ml-2 font-medium">
                            {i === 1 ? 'Select Source' : i === 2 ? 'Configure' : 'Migrate'}
                        </span>
                        {i < 3 && <div className="w-12 h-0.5 bg-gray-300 ml-4" />}
                    </div>
                ))}
            </div>

            {/* STEP 1: SELECT SOURCE */}
            {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="w-1/3">
                        <label className="block text-sm font-medium mb-2">Project / Namespace</label>
                        <ProjectSelector
                            projects={projects}
                            onSelect={setProject}
                            selectedProject={project}
                            isLoading={loadingProjects}
                        />
                    </div>

                    {project && (
                        <div className="bg-white/5 p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
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
                                            <tr key={pvc.name} className="hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                                                <td className="p-3 font-mono text-sm">{pvc.name}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-xs ${pvc.status === 'Bound' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                        {pvc.status}
                                                    </span>
                                                </td>
                                                <td className="p-3">{pvc.capacity}</td>
                                                <td className="p-3 text-gray-500">{pvc.storageClass}</td>
                                                <td className="p-3">
                                                    <button
                                                        onClick={() => { handlePvcSelect(pvc); setStep(2); }}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-all shadow-lg shadow-blue-500/30"
                                                    >
                                                        Select
                                                    </button>
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
                        <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-gray-800">
                            <h3 className="text-lg font-semibold mb-4 text-gray-500">Source Configuration</h3>
                            <div className="space-y-3 font-mono text-sm">
                                <div className="flex justify-between"><span>Namespace:</span> <span className="font-bold text-zinc-300">{project}</span></div>
                                <div className="flex justify-between"><span>Name:</span> <span>{selectedPvc.name}</span></div>
                                <div className="flex justify-between"><span>Capacity:</span> <span>{selectedPvc.capacity}</span></div>
                                <div className="flex justify-between"><span>Old Class:</span> <span>{selectedPvc.storageClass}</span></div>
                                <div className="mt-4 pt-4 border-t border-gray-700">
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
                        <div className="p-6 bg-white dark:bg-gray-900 rounded-xl border border-blue-500/30 shadow-xl shadow-blue-500/10">
                            <h3 className="text-lg font-semibold mb-4 text-blue-500">Target Configuration</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">New Storage Class</label>
                                    <select
                                        className="w-full bg-transparent border border-gray-600 rounded-lg p-2"
                                        value={targetSc}
                                        onChange={(e) => setTargetSc(e.target.value)}
                                    >
                                        <option value="">Select Storage Class...</option>
                                        {scList.map(sc => <option key={sc} value={sc}>{sc}</option>)}
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
                                            onClick={() => setVerifyMethod('SIZE')}
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
                                            onClick={() => setVerifyMethod('CHECKSUM')}
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

                                <div className={`p-4 border rounded-lg transition-colors ${deleteOldPvc ? 'bg-red-500/10 border-red-500' : 'bg-gray-100 dark:bg-white/5 border-gray-600'}`}>
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
                        <button onClick={() => setStep(1)} className="px-6 py-2 text-gray-500 hover:text-white transition-colors">Back</button>
                        <button
                            disabled={!targetSc || !deploymentVolumeName}
                            onClick={() => setStep(3)}
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
                            <button onClick={() => setStep(2)} className="px-6 py-2 text-gray-500">Cancel</button>
                        )}
                        <button
                            onClick={startMigration}
                            disabled={isMigrating || logs.length > 0}
                            className={`px-8 py-3 rounded-xl font-bold text-white shadow-xl transition-all
                                ${isMigrating ? 'bg-gray-600 cursor-wait' :
                                    logs.some(l => l.status === 'success') ? 'bg-green-600' : 'bg-red-600 hover:bg-red-700'}`}
                        >
                            {isMigrating ? 'Migrating...' : logs.length > 0 ? 'Migration Completed' : 'START MIGRATION'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
