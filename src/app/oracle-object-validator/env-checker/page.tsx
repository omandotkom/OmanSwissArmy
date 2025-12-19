"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, FileSpreadsheet, Database, Settings2, CheckCircle2, Play, X, Download, FileDiff, ListChecks } from "lucide-react";
import * as XLSX from "xlsx";
import { DiffEditor } from "@monaco-editor/react";
import ConnectionManager from "@/components/ConnectionManager";
import { OracleConnection, getAllConnections } from "@/services/connection-storage";

interface ExcelRow {
    [key: string]: any;
}

interface SheetData {
    name: string;
    data: ExcelRow[];
    headers: string[];
}

interface OwnerMapping {
    [ownerName: string]: {
        env1: OracleConnection | null;
        env2: OracleConnection | null;
    }
}

export default function ObjectDBEnvChecker() {
    const [file, setFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [sheets, setSheets] = useState<SheetData[]>([]);
    const [activeTab, setActiveTab] = useState<number>(0);
    const [selectedRows, setSelectedRows] = useState<{ [sheetName: string]: Set<number> }>({});
    const [filters, setFilters] = useState<{ [key: string]: string }>({});

    // Comparison State
    const [isComparing, setIsComparing] = useState(false);
    const [comparisonResults, setComparisonResults] = useState<any[] | null>(null);
    const [showResults, setShowResults] = useState(false);
    const [showIssuedOnly, setShowIssuedOnly] = useState(false);

    // Owner & Connection Logic
    const [detectedOwners, setDetectedOwners] = useState<string[]>([]);
    const [ownerMappings, setOwnerMappings] = useState<OwnerMapping>({});
    const [env1Keyword, setEnv1Keyword] = useState("");
    const [env2Keyword, setEnv2Keyword] = useState("");
    const [isAutoMapping, setIsAutoMapping] = useState(false);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        // Initialize Worker
        workerRef.current = new Worker(new URL('./auto-mapping.worker.ts', import.meta.url));
        workerRef.current.onmessage = (event: MessageEvent<OwnerMapping>) => {
            setOwnerMappings(event.data);
            setIsAutoMapping(false);
        };
        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    // Auto-mapping State
    const [availableConnections, setAvailableConnections] = useState<any[]>([]);

    // Computed: Active Owners based on Selection
    const requiredOwners = useMemo(() => {
        const owners = new Set<string>();
        sheets.forEach(sheet => {
            const selections = selectedRows[sheet.name];
            if (selections && selections.size > 0) {
                selections.forEach(rowIndex => {
                    const row = sheet.data[rowIndex];
                    // Handle various possible cases for OWNER key
                    const owner = row['OWNER'] || row['owner'] || row['Owner'];
                    if (owner) {
                        owners.add(String(owner).toUpperCase().trim());
                    }
                });
            }
        });
        return Array.from(owners).sort();
    }, [sheets, selectedRows]);

    useEffect(() => {
        // Load connections for auto-mapping
        const load = async () => {
            try {
                const conns = await getAllConnections();
                setAvailableConnections(conns);
            } catch (e) {
                console.error("Failed to load connections", e);
            }
        };
        load();
    }, []);

    const findBestMatches = (owner: string, connections: OracleConnection[], preferredKeyword: string = "") => {
        const candidates = connections.filter(c => {
            const cName = c.name.toUpperCase();
            const cUser = c.username.toUpperCase();
            const oName = owner.toUpperCase();

            // Heuristic 1: Username exact match
            if (cUser === oName) return true;
            // Heuristic 2: Username contains owner
            if (cUser.includes(oName)) return true;
            // Heuristic 3: Name contains owner
            if (cName.includes(oName)) return true;

            return false;
        });

        // Sort by quality of match
        return candidates.sort((a, b) => {
            const oName = owner.toUpperCase();
            const keyword = preferredKeyword.toUpperCase().trim();

            let scoreA = (a.username.toUpperCase() === oName ? 100 : 0) +
                (a.username.toUpperCase().includes(oName) ? 50 : 0) +
                (a.name.toUpperCase().includes(oName) ? 20 : 0);

            let scoreB = (b.username.toUpperCase() === oName ? 100 : 0) +
                (b.username.toUpperCase().includes(oName) ? 50 : 0) +
                (b.name.toUpperCase().includes(oName) ? 20 : 0);

            // Boost score if keyword matches
            if (keyword) {
                if (a.name.toUpperCase().includes(keyword) || a.host.toUpperCase().includes(keyword)) {
                    scoreA += 500;
                }
                if (b.name.toUpperCase().includes(keyword) || b.host.toUpperCase().includes(keyword)) {
                    scoreB += 500;
                }
            }

            return scoreB - scoreA;
        });
    };

    const applyAutoMapping = (ownersList: string[]) => {
        if (!workerRef.current) return;
        setIsAutoMapping(true);
        workerRef.current.postMessage({
            owners: ownersList,
            connections: availableConnections,
            env1Keyword,
            env2Keyword
        });
    };

    // Re-run auto-mapping when keywords change or owners change
    useEffect(() => {
        if (detectedOwners.length > 0 && availableConnections.length > 0) {
            applyAutoMapping(detectedOwners);
        }
    }, [env1Keyword, env2Keyword, detectedOwners, availableConnections]);

    // ... (existing code)

    // Connection Check State
    type CheckStatus = { id: string; name: string; host: string; status: 'pending' | 'testing' | 'success' | 'error'; message?: string };
    const [connectionCheckStatus, setConnectionCheckStatus] = useState<CheckStatus[] | null>(null);

    const handleCompare = async () => {
        if (!isReadyToCheck) return;
        setIsComparing(true);
        setComparisonResults(null);
        setConnectionCheckStatus(null);

        try {
            // 1. Identify involved connections based on OwnerMappings
            // 1. Identify involved connections based on OwnerMappings
            const uniqueConns = new Map<string, OracleConnection>();
            // Use requiredOwners instead of detectedOwners to only check relevant connections
            requiredOwners.forEach(owner => {
                const map = ownerMappings[owner];
                if (map?.env1) uniqueConns.set(map.env1.id, map.env1);
                if (map?.env2) uniqueConns.set(map.env2.id, map.env2);
            });

            const checks: CheckStatus[] = Array.from(uniqueConns.values()).map(c => ({
                id: c.id,
                name: c.name,
                host: c.host,
                status: 'pending'
            }));

            if (checks.length > 0) {
                setConnectionCheckStatus(checks);

                // 2. Run Checks
                let allPassed = true;
                for (let i = 0; i < checks.length; i++) {
                    const check = checks[i];
                    const conn = uniqueConns.get(check.id);

                    // Update to testing
                    setConnectionCheckStatus(prev => prev?.map((c, idx) => idx === i ? { ...c, status: 'testing' } : c) || null);

                    try {
                        const res = await fetch('/api/oracle/test-connection', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(conn)
                        });
                        const data = await res.json();

                        if (res.ok) {
                            setConnectionCheckStatus(prev => prev?.map((c, idx) => idx === i ? { ...c, status: 'success', message: 'OK' } : c) || null);
                        } else {
                            allPassed = false;
                            setConnectionCheckStatus(prev => prev?.map((c, idx) => idx === i ? { ...c, status: 'error', message: data.error || 'Failed' } : c) || null);
                        }
                    } catch (err) {
                        allPassed = false;
                        setConnectionCheckStatus(prev => prev?.map((c, idx) => idx === i ? { ...c, status: 'error', message: 'Network Error' } : c) || null);
                    }
                }

                if (!allPassed) {
                    // Stop if any connection failed
                    setIsComparing(false);
                    return;
                }
                // Wait a bit to show green success
                await new Promise(r => setTimeout(r, 1000));
                setConnectionCheckStatus(null); // Close checks
            }

            const uniqueItemsMap = new Map<string, any>();

            // Extract items from all sheets
            sheets.forEach(sheet => {
                const selections = selectedRows[sheet.name];
                sheet.data.forEach((row, rowIndex) => {
                    // Skip if not selected
                    if (!selections || !selections.has(rowIndex)) return;

                    // Normalize keys (handle case sensitivity if needed)
                    // Common variations: "Object Name", "OBJECT NAME", "Object Type", etc.
                    const owner = String(row['OWNER'] || row['owner'] || row['Owner'] || '').trim();
                    const name = String(row['OBJECT_NAME'] || row['object_name'] || row['Object Name'] || row['OBJECT NAME'] || row['NAME'] || row['name'] || row['Name'] || '').trim();
                    let type = String(row['OBJECT_TYPE'] || row['object_type'] || row['Object Type'] || row['OBJECT TYPE'] || row['TYPE'] || row['type'] || row['Type'] || '').trim();

                    // Fallback to Sheet Name if Type is missing
                    if (!type) {
                        let sheetType = sheet.name.toUpperCase().trim();
                        // Basic Singularization
                        if (sheetType.endsWith('S') && !sheetType.endsWith('SS')) {
                            sheetType = sheetType.slice(0, -1);
                        }
                        // Handle "BODIES" -> "BODY"
                        if (sheetType.endsWith('BODIE')) {
                            sheetType = sheetType.replace('BODIE', 'BODY');
                        }
                        // Normalize Spaces to Underscores (e.g. PACKAGE BODY)
                        sheetType = sheetType.replace(/\s+/g, '_');

                        type = sheetType;
                    }

                    if (owner && name && type) {
                        // Create a unique key for deduplication
                        const uniqueKey = `${owner.toUpperCase()}|${name.toUpperCase()}|${type.toUpperCase()}`;
                        if (!uniqueItemsMap.has(uniqueKey)) {
                            uniqueItemsMap.set(uniqueKey, { owner, name, type });
                        }
                    }
                });
            });

            const allItems = Array.from(uniqueItemsMap.values());

            console.log("Extracted items for validation:", allItems);

            if (allItems.length === 0) {
                // Diagnose why
                const hasSelections = sheets.some(s => selectedRows[s.name]?.size > 0);

                if (!hasSelections) {
                    setAlertModal({ title: "No Selection", message: "Please select at least one row to validate." });
                } else {
                    const missingColumns = new Set<string>();
                    // Check headers of the first sheet that has data
                    const firstSheet = sheets.find(s => s.data.length > 0);
                    if (firstSheet && firstSheet.data.length > 0) {
                        const firstRow = firstSheet.data[0];
                        const hasOwner = firstRow['OWNER'] || firstRow['owner'] || firstRow['Owner'];
                        const hasName = firstRow['OBJECT_NAME'] || firstRow['object_name'] || firstRow['Object Name'] || firstRow['OBJECT NAME'] || firstRow['NAME'] || firstRow['name'] || firstRow['Name'];

                        if (!hasOwner) missingColumns.add("OWNER");
                        if (!hasName) missingColumns.add("OBJECT_NAME");
                    }

                    if (missingColumns.size > 0) {
                        const msg = Array.from(missingColumns).map(c => `- ${c}`).join("\n");
                        setAlertModal({ title: "Missing Columns", message: `Missing required columns in Excel:\n\n${msg}\n\nPlease check your headers.`, type: 'error' });
                    } else {
                        setAlertModal({ title: "Invalid Data", message: "Selected rows do not contain valid data. Ensure cells are not empty.", type: 'error' });
                    }
                }
                setIsComparing(false);
                return;
            }

            // Initialize results with WAITING status
            const initialResults = allItems.map((item, idx) => ({
                id: idx, // Assign Temporary ID
                item,
                status: 'WAITING',
                error: '',
            }));

            setComparisonResults(initialResults);
            setShowResults(true);

            // Start Concurrent Processing
            processValidationQueue(initialResults);

        } catch (error) {
            console.error("Comparison failed", error);
            setAlertModal({ title: "Comparison Error", message: "Comparison failed. Check console for details.", type: 'error' });
            setConnectionCheckStatus(null);
        } finally {
            // Processing happens async
        }
    };

    const processValidationQueue = async (initialItems: any[]) => {
        const BATCH_SIZE = 5;
        const MAX_CONCURRENCY = 20;

        // Group items by Owner for connection efficiency
        const itemsByOwner: Record<string, any[]> = {};
        initialItems.forEach(r => {
            const owner = r.item.owner.toUpperCase();
            if (!itemsByOwner[owner]) itemsByOwner[owner] = [];
            itemsByOwner[owner].push(r);
        });

        // Create tasks (batches)
        const tasks: { owner: string; items: any[] }[] = [];
        // Use requiredOwners to ensure we only process relevant owners
        requiredOwners.forEach(owner => {
            const ownerItems = itemsByOwner[owner.toUpperCase()];
            if (!ownerItems) return;

            for (let i = 0; i < ownerItems.length; i += BATCH_SIZE) {
                tasks.push({
                    owner: owner,
                    items: ownerItems.slice(i, i + BATCH_SIZE)
                });
            }
        });

        let taskIndex = 0;
        let completedTasks = 0;
        let activeRequests = 0;

        const runNextTask = async () => {
            if (taskIndex >= tasks.length) return;

            const currentTask = tasks[taskIndex++];
            activeRequests++;

            // Mark items as CHECKING
            setComparisonResults(prev => {
                if (!prev) return null;
                const newRes = [...prev];
                currentTask.items.forEach(taskItem => {
                    const idx = newRes.findIndex(r => r.id === taskItem.id);
                    if (idx !== -1) newRes[idx] = { ...newRes[idx], status: 'CHECKING' };
                });
                return newRes;
            });

            try {
                const mapping = ownerMappings[currentTask.owner];
                if (mapping?.env1 && mapping?.env2) {
                    const res = await fetch('/api/oracle/validate-objects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            items: currentTask.items.map(r => r.item),
                            env1: mapping.env1,
                            env2: mapping.env2
                        })
                    });
                    const data = await res.json();

                    setComparisonResults(prev => {
                        if (!prev) return null;
                        const newRes = [...prev];
                        if (res.ok) {
                            data.results.forEach((apiResult: any) => {
                                const idx = newRes.findIndex(r =>
                                    r.item.owner === apiResult.item.owner &&
                                    r.item.name === apiResult.item.name &&
                                    r.item.type === apiResult.item.type
                                );
                                if (idx !== -1) {
                                    newRes[idx] = {
                                        ...newRes[idx],
                                        status: apiResult.status,
                                        error: apiResult.status === 'DIFF' ? '' : '',
                                        item: apiResult.item
                                    };
                                }
                            });
                        } else {
                            currentTask.items.forEach(taskItem => {
                                const idx = newRes.findIndex(r => r.id === taskItem.id);
                                if (idx !== -1) newRes[idx] = { ...newRes[idx], status: 'ERROR', error: data.error };
                            });
                        }
                        return newRes;
                    });
                } else {
                    setComparisonResults(prev => {
                        if (!prev) return null;
                        const newRes = [...prev];
                        currentTask.items.forEach(taskItem => {
                            const idx = newRes.findIndex(r => r.id === taskItem.id);
                            if (idx !== -1) newRes[idx] = { ...newRes[idx], status: 'ERROR', error: 'Missing Connections' };
                        });
                        return newRes;
                    });
                }
            } catch (err) {
                setComparisonResults(prev => {
                    if (!prev) return null;
                    const newRes = [...prev];
                    currentTask.items.forEach(taskItem => {
                        const idx = newRes.findIndex(r => r.id === taskItem.id);
                        if (idx !== -1) newRes[idx] = { ...newRes[idx], status: 'ERROR', error: 'Network Error' };
                    });
                    return newRes;
                });
            } finally {
                activeRequests--;
                completedTasks++;

                if (completedTasks === tasks.length) {
                    setIsComparing(false);
                } else {
                    runNextTask();
                }
            }
        };

        for (let i = 0; i < MAX_CONCURRENCY && i < tasks.length; i++) {
            runNextTask();
        }
    };


    // Connection Manager Interaction State
    const [isConnManagerOpen, setIsConnManagerOpen] = useState(false);
    const [selectingForOwner, setSelectingForOwner] = useState<string | null>(null);
    const [selectingForEnv, setSelectingForEnv] = useState<"env1" | "env2" | null>(null);

    const openConnManager = (owner: string, env: "env1" | "env2") => {
        setSelectingForOwner(owner);
        setSelectingForEnv(env);
        setIsConnManagerOpen(true);
    };

    const handleConnSelect = (conn: OracleConnection) => {
        if (selectingForOwner && selectingForEnv) {
            setOwnerMappings(prev => ({
                ...prev,
                [selectingForOwner]: {
                    ...prev[selectingForOwner],
                    [selectingForEnv]: conn
                }
            }));
        }
        setSelectingForOwner(null);
        setSelectingForEnv(null);
        setIsConnManagerOpen(false);
    };

    // Diff Viewer State
    const [diffData, setDiffData] = useState<{ item: any, ddl1: string, ddl2: string, env1Name: string, env2Name: string } | null>(null);
    const [isFetchingDiff, setIsFetchingDiff] = useState(false);

    const handleViewDiff = async (resultItem: any) => {
        if (isFetchingDiff) return;
        const owner = resultItem?.item?.owner;
        const mapping = ownerMappings[owner];

        if (!mapping?.env1 || !mapping?.env2) {
            setAlertModal({ title: "Configuration Error", message: "Connection details missing for this item." });
            return;
        }

        setIsFetchingDiff(true);
        try {
            // Force fetch DDL
            const res = await fetch('/api/oracle/validate-objects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: [resultItem.item],
                    env1: mapping.env1,
                    env2: mapping.env2,
                    fetchDDL: true // Request DDL
                })
            });
            const data = await res.json();

            if (res.ok && data.results && data.results.length > 0) {
                const resData = data.results[0];
                setDiffData({
                    item: resultItem.item,
                    ddl1: resData.ddl1 || '-- Source Object Missing or Empty',
                    ddl2: resData.ddl2 || '-- Target Object Missing or Empty',
                    env1Name: mapping.env1?.name || 'Environment 1',
                    env2Name: mapping.env2?.name || 'Environment 2'
                });
            } else {
                setAlertModal({ title: "Fetch Failed", message: "Failed to fetch DDL: " + (data.error || "Unknown Error"), type: 'error' });
            }
        } catch (e) {
            console.error("Diff fetch error", e);
            setAlertModal({ title: "Error", message: "Network error while fetching Diff.", type: 'error' });
        } finally {
            setIsFetchingDiff(false);
        }
    };

    // Alert State
    const [alertModal, setAlertModal] = useState<{ title: string; message: string; type?: 'error' | 'success' } | null>(null);

    // Compile / Sync State
    const [compileModal, setCompileModal] = useState<{
        item: any,
        direction: 'source_to_target' | 'target_to_source',
        sourceName: string,
        targetName: string,
        ddl: string,
        targetEnv: OracleConnection
    } | null>(null);
    const [isCompiling, setIsCompiling] = useState(false);

    const initiateCompile = async (item: any, direction: 'source_to_target' | 'target_to_source') => {
        const owner = item.owner;
        const mapping = ownerMappings[owner];

        if (!mapping?.env1 || !mapping?.env2) {
            setAlertModal({ title: "Incomplete Configuration", message: "Missing connection details for this environment." });
            return;
        }

        // We need the DDL. If we are in Diff Viewer, we might have it in `diffData`.
        // If coming from Table, we might not have it.
        // For safety, let's use what we have in diffData if available and matching.

        let ddl = '';
        let sourceName = '';
        let targetName = '';
        let targetEnv = null;

        if (diffData && diffData.item === item) {
            if (direction === 'source_to_target') {
                ddl = diffData.ddl1;
                sourceName = diffData.env1Name;
                targetName = diffData.env2Name;
                targetEnv = mapping.env2;
            } else {
                ddl = diffData.ddl2;
                sourceName = diffData.env2Name;
                targetName = diffData.env1Name;
                targetEnv = mapping.env1;
            }
        } else {
            // If triggered from table (not implemented yet, but good to have logic ready)
            setAlertModal({ title: "Action Required", message: "Please open Diff Viewer to compile." });
            return;
        }

        if (!ddl || ddl.startsWith('--')) {
            setAlertModal({ title: "Invalid DDL", message: "Source DDL is empty or invalid. Cannot compile." });
            return;
        }

        setCompileModal({
            item,
            direction,
            sourceName,
            targetName,
            ddl,
            targetEnv
        });
    };

    const executeCompile = async () => {
        if (!compileModal) return;
        setIsCompiling(true);
        try {
            const res = await fetch('/api/oracle/execute-ddl', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetEnv: compileModal.targetEnv,
                    ddl: compileModal.ddl,
                    objectType: compileModal.item.type
                })
            });
            const data = await res.json();

            if (res.ok) {
                setAlertModal({ title: "Success", message: "Object compiled successfully!", type: 'success' });
                setCompileModal(null);
                // Trigger Rescan
                await handleRescan(compileModal.item);
            } else {
                setAlertModal({ title: "Compilation Failed", message: (data.error || "Unknown Error") + "\n\n" + (data.details || ""), type: 'error' });
            }
        } catch (e) {
            console.error("Compile error", e);
            setAlertModal({ title: "Error", message: "Network error during compilation.", type: 'error' });
        } finally {
            setIsCompiling(false);
        }
    };

    const handleRescan = async (item: any) => {
        // Validation logic for single item
        const owner = item.owner;
        const mapping = ownerMappings[owner];
        if (!mapping?.env1 || !mapping?.env2) return;

        // Set status to CHECKING
        setComparisonResults(prev => {
            if (!prev) return null;
            const newRes = [...prev];
            const idx = newRes.findIndex(r => r.item === item); // Reference match if from same list
            if (idx !== -1) {
                newRes[idx] = { ...newRes[idx], status: 'CHECKING' };
            }
            return newRes;
        });

        try {
            const res = await fetch('/api/oracle/validate-objects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: [item],
                    env1: mapping.env1,
                    env2: mapping.env2,
                    fetchDDL: !!diffData // If diff viewer is open, fetch DDL to update it too?
                })
            });
            const data = await res.json();

            if (res.ok && data.results && data.results.length > 0) {
                const resItem = data.results[0];
                setComparisonResults(prev => {
                    if (!prev) return null;
                    const newRes = [...prev];
                    // Find index again (safer)
                    const idx = newRes.findIndex(r =>
                        r.item.owner === item.owner &&
                        r.item.name === item.name &&
                        r.item.type === item.type
                    );

                    if (idx !== -1) {
                        newRes[idx] = {
                            ...newRes[idx],
                            status: resItem.status,
                            error: resItem.status === 'DIFF' ? '' : '',
                            item: resItem.item
                        };
                    }
                    return newRes;
                });

                // If Diff Viewer is open for this item, update it!
                if (diffData && diffData.item.owner === item.owner && diffData.item.name === item.name) {
                    setDiffData(prev => ({
                        ...prev!,
                        ddl1: resItem.ddl1 || prev!.ddl1,
                        ddl2: resItem.ddl2 || prev!.ddl2
                    }));
                }
            }
        } catch (e) {
            console.error("Rescan failed", e);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadedFile = e.target.files?.[0];
        if (!uploadedFile) return;

        const validTypes = [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ];
        if (!validTypes.includes(uploadedFile.type)) {
            setAlertModal({ title: "Invalid File", message: "Invalid file type. Please upload an Excel file.", type: 'error' });
            return;
        }

        setFile(uploadedFile);
        setIsLoading(true);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: "binary" });

                const loadedSheets: SheetData[] = [];
                const initialSelections: { [sheetName: string]: Set<number> } = {};
                const ownersSet = new Set<string>();

                wb.SheetNames.forEach((wsname) => {
                    const ws = wb.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json<ExcelRow>(ws, { defval: "" });

                    if (data.length > 0) {
                        const headers = Object.keys(data[0]);
                        loadedSheets.push({
                            name: wsname,
                            data: data,
                            headers: headers,
                        });
                        initialSelections[wsname] = new Set();
                    }

                    // Scan for OWNER
                    data.forEach(row => {
                        if (row['OWNER']) {
                            ownersSet.add(String(row['OWNER']).toUpperCase().trim());
                        }
                    });
                });

                // Initialize Mapping
                // Initialize Mapping
                setSheets(loadedSheets);
                setSelectedRows(initialSelections);
                setDetectedOwners(Array.from(ownersSet).sort());
                // ownerMappings will be set by useEffect
                setActiveTab(0);



            } catch (err) {
                console.error("Error parsing excel", err);
                alert("Failed to parse Excel file.");
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(uploadedFile);
    };

    // Filter & Selection Handlers
    const handleFilterChange = (header: string, value: string) => {
        setFilters((prev) => ({
            ...prev,
            [`${sheets[activeTab].name}-${header}`]: value,
        }));
    };

    const getFilteredData = () => {
        if (!sheets[activeTab]) return [];
        const currentSheetName = sheets[activeTab].name;
        const data = sheets[activeTab].data;

        return data.filter(row => {
            return sheets[activeTab].headers.every(header => {
                const filterValue = filters[`${currentSheetName}-${header}`]?.toLowerCase();
                if (!filterValue) return true;
                const cellValue = String(row[header] || "").toLowerCase();
                return cellValue.includes(filterValue);
            });
        });
    };

    const filteredData = getFilteredData();

    const toggleRowSelection = (sheetName: string, rowIndex: number) => {
        const newSelection = new Set(selectedRows[sheetName]);
        if (newSelection.has(rowIndex)) {
            newSelection.delete(rowIndex);
        } else {
            newSelection.add(rowIndex);
        }
        setSelectedRows({ ...selectedRows, [sheetName]: newSelection });
    };

    const toggleSelectAll = (sheetName: string) => {
        const currentSheet = sheets.find((s) => s.name === sheetName);
        if (!currentSheet) return;

        const currentFiltered = getFilteredData();
        if (currentFiltered.length === 0) return;

        // Check if ALL filtered rows are currently selected
        const allFilteredAreSelected = currentFiltered.every(row => {
            const originalIndex = currentSheet.data.indexOf(row);
            return selectedRows[sheetName]?.has(originalIndex);
        });

        const newSelection = new Set(selectedRows[sheetName]);

        if (allFilteredAreSelected) {
            currentFiltered.forEach(row => {
                const idx = currentSheet.data.indexOf(row);
                newSelection.delete(idx);
            });
        } else {
            currentFiltered.forEach(row => {
                const idx = currentSheet.data.indexOf(row);
                newSelection.add(idx);
            });
        }

        setSelectedRows({ ...selectedRows, [sheetName]: newSelection });
    };

    const isAllSelected = (sheetName: string) => {
        const currentFiltered = getFilteredData();
        if (currentFiltered.length === 0) return false;
        return currentFiltered.every(row => {
            const originalIndex = sheets[activeTab].data.indexOf(row);
            return selectedRows[sheetName]?.has(originalIndex);
        });
    };

    const handleExportExcel = () => {
        if (!comparisonResults || comparisonResults.length === 0) return;

        const dataToExport = comparisonResults.map(res => ({
            Owner: res?.item?.owner || '',
            ObjectName: res?.item?.name || '',
            Type: res?.item?.type || '',
            Status: res?.status || 'UNKNOWN',
            Details: res?.error || (res?.status === 'DIFF' ? 'Content mismatch found' : '')
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Validation Results");
        XLSX.writeFile(wb, "Oracle_Validation_Results.xlsx");
    };

    // Validation: Ready to Check?
    // Validation: Ready to Check?
    // Only require mappings for owners that are actually selected (requiredOwners)
    const isReadyToCheck =
        file &&
        requiredOwners.length > 0 &&
        requiredOwners.every(owner => ownerMappings[owner]?.env1 && ownerMappings[owner]?.env2);

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Link href="/oracle-object-validator" className="p-2 rounded-full hover:bg-zinc-800 transition-colors">
                            <ArrowLeft className="w-6 h-6" />
                        </Link>
                        <div>
                            <h1 className="text-3xl font-light tracking-wide flex items-center gap-2">
                                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                                Object DB Env Checker
                            </h1>
                            <p className="text-zinc-500 text-sm mt-1">Validate and compare DB objects across environments (ignoring whitespace)</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsConnManagerOpen(true)}
                        className="flex items-center gap-2 text-zinc-400 hover:text-blue-400 transition-colors bg-zinc-900 px-4 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700"
                    >
                        <Settings2 className="w-4 h-4" />
                        Manage Connections
                    </button>
                </div>

                {/* Upload Section (Shown if no file) */}
                {!file && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 mb-8 text-center border-dashed border-2 hover:border-emerald-500/50 transition-colors">
                        <div className="flex flex-col items-center justify-center">
                            <div className="bg-zinc-800 p-4 rounded-full mb-6 relative">
                                <FileSpreadsheet className="w-12 h-12 text-zinc-400" />
                                <div className="absolute -bottom-1 -right-1 bg-emerald-600 rounded-full p-1">
                                    <CheckCircle2 className="w-4 h-4 text-white" />
                                </div>
                            </div>
                            <label htmlFor="file-upload" className="cursor-pointer group relative">
                                <span className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-full font-medium transition-all inline-flex items-center gap-2 shadow-lg shadow-emerald-900/20 text-lg">
                                    <Upload className="w-5 h-5" />
                                    Upload Object List (.xlsx)
                                </span>
                                <input
                                    id="file-upload"
                                    type="file"
                                    accept=".xlsx, .xls"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                            </label>
                            <p className="mt-4 text-zinc-500">Supports standard Oracle Object List format</p>
                        </div>
                    </div>
                )}

                {/* Connection Mapping Section (Shown after upload and selection) */}
                {!isLoading && file && requiredOwners.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-medium flex items-center gap-2">
                                <Database className="w-5 h-5 text-purple-500" />
                                Environment Mapping
                                <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-full font-normal">
                                    {requiredOwners.length} Active Owner(s)
                                </span>
                            </h2>

                            <button
                                onClick={() => {
                                    setFile(null);
                                    setSheets([]);
                                    setDetectedOwners([]);
                                    setOwnerMappings({});
                                }}
                                className="text-xs text-red-500 hover:bg-zinc-800 px-3 py-1 rounded transition-colors"
                            >
                                Reset File
                            </button>
                        </div>

                        {/* Keyword-based Preference Control */}
                        <div className="flex gap-4 mb-6 bg-zinc-950/50 p-4 rounded-lg border border-zinc-800/50">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Env 1 Preference (Keyword)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. PROD, MASTER"
                                    value={env1Keyword}
                                    onChange={(e) => setEnv1Keyword(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                                <p className="text-[10px] text-zinc-600 mt-1">Boosts connections containing this text.</p>
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Env 2 Preference (Keyword)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. DEV, SIT, QC"
                                    value={env2Keyword}
                                    onChange={(e) => setEnv2Keyword(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                                />
                                <p className="text-[10px] text-zinc-600 mt-1">Boosts connections containing this text.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-12 gap-4 mb-2 px-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                            <div className="col-span-2">Object Owner</div>
                            <div className="col-span-5">Environment 1 (Reference)</div>
                            <div className="col-span-5">Environment 2 (Target)</div>
                        </div>

                        <div className="space-y-3">
                            {requiredOwners.map(owner => (
                                <div key={owner} className="grid grid-cols-12 gap-4 items-center bg-zinc-950/50 p-3 rounded-lg border border-zinc-800/50">
                                    <div className="col-span-2 font-mono text-sm text-yellow-500 font-bold truncate" title={owner}>
                                        {owner}
                                    </div>

                                    {/* Env 1 Selector */}
                                    <div className="col-span-5">
                                        {isAutoMapping ? (
                                            <div className="w-full h-10 bg-zinc-800/50 rounded-md animate-pulse border border-zinc-800" />
                                        ) : (
                                            <button
                                                onClick={() => openConnManager(owner, "env1")}
                                                className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all flex justify-between items-center group ${ownerMappings[owner]?.env1
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                                                    : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                                                    }`}
                                            >
                                                <div className="truncate flex flex-col">
                                                    <span className="font-medium">{ownerMappings[owner]?.env1?.name || "Select Environment 1..."}</span>
                                                    {ownerMappings[owner]?.env1 && (
                                                        <span className="text-[10px] text-zinc-500">{ownerMappings[owner]?.env1?.username}@{ownerMappings[owner]?.env1?.host}</span>
                                                    )}
                                                </div>
                                                <Settings2 className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Env 2 Selector */}
                                    <div className="col-span-5">
                                        {isAutoMapping ? (
                                            <div className="w-full h-10 bg-zinc-800/50 rounded-md animate-pulse border border-zinc-800" />
                                        ) : (
                                            <button
                                                onClick={() => openConnManager(owner, "env2")}
                                                className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-all flex justify-between items-center group ${ownerMappings[owner]?.env2
                                                    ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                                                    : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                                                    }`}
                                            >
                                                <div className="truncate flex flex-col">
                                                    <span className="font-medium">{ownerMappings[owner]?.env2?.name || "Select Environment 2..."}</span>
                                                    {ownerMappings[owner]?.env2 && (
                                                        <span className="text-[10px] text-zinc-500">{ownerMappings[owner]?.env2?.username}@{ownerMappings[owner]?.env2?.host}</span>
                                                    )}
                                                </div>
                                                <Settings2 className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Loading State */}
                {isLoading && (
                    <div className="text-center py-12">
                        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-zinc-400 animate-pulse">Parsing object list...</p>
                    </div>
                )}

                {/* Data Preview */}
                {!isLoading && sheets.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl mb-24">
                        {/* Tabs */}
                        <div className="flex overflow-x-auto border-b border-zinc-800 bg-zinc-950/50">
                            {sheets.map((sheet, idx) => (
                                <button
                                    key={sheet.name}
                                    onClick={() => setActiveTab(idx)}
                                    className={`px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors ${activeTab === idx
                                        ? "bg-zinc-800 text-white border-b-2 border-emerald-500"
                                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                                        }`}
                                >
                                    {sheet.name} <span className="ml-2 bg-zinc-700 text-xs px-2 py-0.5 rounded-full text-zinc-300">{sheet.data.length}</span>
                                </button>
                            ))}
                        </div>

                        {/* Table Content */}
                        <div className="p-0 overflow-x-auto">
                            <div className="min-w-full inline-block align-middle">
                                <div className="overflow-hidden">
                                    <table className="min-w-full divide-y divide-zinc-800">
                                        <thead className="bg-zinc-950/50">
                                            <tr>
                                                <th scope="col" className="px-6 py-3 text-left w-12 align-top">
                                                    <div className="flex items-center pt-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={isAllSelected(sheets[activeTab].name)}
                                                            onChange={() => toggleSelectAll(sheets[activeTab].name)}
                                                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                                                        />
                                                        <span className="ml-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">All</span>
                                                    </div>
                                                </th>
                                                {sheets[activeTab].headers.map((header) => (
                                                    <th
                                                        key={header}
                                                        scope="col"
                                                        className="px-6 py-3 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider whitespace-nowrap"
                                                    >
                                                        <div className="flex flex-col gap-2">
                                                            <span>{header}</span>
                                                            <input
                                                                type="text"
                                                                placeholder={`Filter...`}
                                                                className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] rounded px-2 py-1 focus:outline-none focus:border-emerald-500 w-full font-normal normal-case"
                                                                value={filters[`${sheets[activeTab].name}-${header}`] || ""}
                                                                onChange={(e) => handleFilterChange(header, e.target.value)}
                                                            />
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800 bg-zinc-900/50">
                                            {filteredData.map((row) => {
                                                const originalIndex = sheets[activeTab].data.indexOf(row);
                                                return (
                                                    <tr key={originalIndex} className={selectedRows[sheets[activeTab].name]?.has(originalIndex) ? "bg-emerald-900/10" : "hover:bg-zinc-800/50 transition-colors"}>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedRows[sheets[activeTab].name]?.has(originalIndex)}
                                                                onChange={() => toggleRowSelection(sheets[activeTab].name, originalIndex)}
                                                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                                                            />
                                                        </td>
                                                        {sheets[activeTab].headers.map((header) => (
                                                            <td key={`${originalIndex}-${header}`} className="px-6 py-4 whitespace-nowrap text-sm text-zinc-300">
                                                                {row[header]}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredData.length === 0 && (
                                        <div className="p-8 text-center text-zinc-500 text-sm">
                                            No data matches your filter.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Start Validation Button (Floating) */}
                {!isLoading && isReadyToCheck && (
                    <div className="fixed bottom-8 right-8 z-40 animate-in zoom-in duration-300">
                        <button
                            onClick={handleCompare}
                            disabled={isComparing}
                            className={`bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-emerald-900/40 flex items-center gap-3 transition-transform hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed`}
                        >
                            {isComparing ? (
                                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                            ) : (
                                <Play className="w-5 h-5 fill-current" />
                            )}
                            {isComparing ? 'COMPARING...' : 'START COMPARISON'}
                        </button>
                    </div>
                )}

                {/* Results Modal */}
                {showResults && comparisonResults && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-6xl h-[85vh] flex flex-col shadow-2xl">
                            <div className="bg-zinc-950 rounded-t-xl border-b border-zinc-800 flex flex-col">
                                <div className="p-4 flex justify-between items-center">
                                    <div className="flex flex-col gap-1">
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            <CheckCircle2 className="text-emerald-500" /> Validation Results
                                        </h2>
                                        {comparisonResults && comparisonResults.length > 0 && (
                                            <div className="text-xs text-zinc-500 font-mono">
                                                Progress: {comparisonResults.filter(r => r.status !== 'WAITING' && r.status !== 'CHECKING').length} / {comparisonResults.length}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => setShowIssuedOnly(!showIssuedOnly)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border ${showIssuedOnly
                                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30'
                                                : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                                                }`}
                                        >
                                            <ListChecks className="w-4 h-4" /> Issued Only
                                        </button>
                                        <button
                                            onClick={handleExportExcel}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 hover:text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                                        >
                                            <Download className="w-4 h-4" /> Export
                                        </button>
                                        <button onClick={() => setShowResults(false)} className="text-zinc-400 hover:text-white p-2 hover:bg-zinc-800 rounded-full transition-colors">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                                {comparisonResults && comparisonResults.length > 0 && (
                                    <div className="h-1 w-full bg-zinc-900 relative">
                                        <div
                                            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                                            style={{
                                                width: `${(comparisonResults.filter(r => r.status !== 'WAITING' && r.status !== 'CHECKING').length / comparisonResults.length) * 100}%`
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 overflow-auto p-0">
                                <table className="w-full text-left text-sm text-zinc-300">
                                    <thead className="bg-zinc-950 text-zinc-400 uppercase text-xs sticky top-0 z-10 shadow-sm font-bold tracking-wider">
                                        <tr>
                                            <th className="p-4 bg-zinc-950">Owner</th>
                                            <th className="p-4 bg-zinc-950">Object Name</th>
                                            <th className="p-4 bg-zinc-950">Type</th>
                                            <th className="p-4 bg-zinc-950">Status</th>
                                            <th className="p-4 bg-zinc-950">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800 bg-zinc-900">
                                        {comparisonResults.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-zinc-500">
                                                    No results to display. Either no objects matched the owners, or the backend returned no data.
                                                    <br />
                                                    Please verify your Excel content and Connection Mappings.
                                                </td>
                                            </tr>
                                        ) : (
                                            comparisonResults
                                                .filter(res => !showIssuedOnly || res.status !== 'MATCH')
                                                .map((res, idx) => (
                                                    <tr key={idx} className="hover:bg-zinc-800/50 transition-colors">
                                                        <td className="p-4 text-yellow-500 font-mono font-medium">{res?.item?.owner || '-'}</td>
                                                        <td className="p-4 font-mono font-bold text-white">{res?.item?.name || '-'}</td>
                                                        <td className="p-4 text-zinc-500 font-medium">{res?.item?.type || '-'}</td>
                                                        <td className="p-4">
                                                            <span
                                                                onClick={(e) => {
                                                                    if (res?.status === 'DIFF') {
                                                                        e.stopPropagation();
                                                                        handleViewDiff(res);
                                                                    }
                                                                }}
                                                                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${res?.status === 'DIFF' ? 'cursor-pointer hover:bg-orange-500/20 active:scale-95' : 'cursor-default'
                                                                    } ${res?.status === 'MATCH' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                        res?.status === 'DIFF' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                                                            res?.status === 'WAITING' ? 'bg-orange-900/20 text-orange-200 border-orange-500/30' :
                                                                                res?.status === 'CHECKING' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30 animate-pulse' :
                                                                                    res?.status?.includes('MISSING') ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                                        'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                                    }`}>
                                                                {res?.status || 'UNKNOWN'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-xs font-mono text-zinc-500 truncate max-w-xs">{res?.error || (res?.status === 'DIFF' ? 'Content mismatch found' : '')}</td>
                                                    </tr>
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-4 border-t border-zinc-800 flex justify-between items-center bg-zinc-950 rounded-b-xl">
                                <div className="text-xs text-zinc-500">
                                    Total: {comparisonResults.length} |
                                    Match: {comparisonResults.filter(r => r.status === 'MATCH').length} |
                                    Diff: {comparisonResults.filter(r => r.status === 'DIFF').length}
                                </div>
                                <button onClick={() => setShowResults(false)} className="px-6 py-2 bg-zinc-800 rounded-lg text-zinc-300 hover:bg-zinc-700 font-medium transition-colors">Close</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Connection Check Progress Modal */}
                {connectionCheckStatus && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                {connectionCheckStatus.some(c => c.status === 'testing' || c.status === 'pending') ? (
                                    <div className="w-8 h-8 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
                                ) : connectionCheckStatus.some(c => c.status === 'error') ? (
                                    <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center">
                                        <X className="w-5 h-5" />
                                    </div>
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                )}
                                <div>
                                    <h3 className="font-bold text-lg text-white">Pre-flight Connection Check</h3>
                                    <p className="text-zinc-500 text-xs">Verifying database access before validation...</p>
                                </div>
                            </div>

                            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                {connectionCheckStatus.map((chk, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-md bg-zinc-900 flex items-center justify-center text-zinc-400">
                                                <Database className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-zinc-200">{chk.name}</div>
                                                <div className="text-xs text-zinc-500">{chk.host}</div>
                                            </div>
                                        </div>
                                        <div className="text-xs font-bold">
                                            {chk.status === 'pending' && <span className="text-zinc-600">WAITING</span>}
                                            {chk.status === 'testing' && <span className="text-blue-400 animate-pulse">TESTING...</span>}
                                            {chk.status === 'success' && <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>}
                                            {chk.status === 'error' && <span className="text-red-500 flex items-center gap-1">FAILED</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {connectionCheckStatus.some(c => c.status === 'error') && (
                                <div className="mt-6 flex justify-end">
                                    <button
                                        onClick={() => {
                                            setConnectionCheckStatus(null);
                                            setIsComparing(false);
                                        }}
                                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium"
                                    >
                                        Cancel & Fix
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Diff Viewer Modal */}
                {diffData && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
                        <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-[95vw] h-[90vh] flex flex-col shadow-2xl">
                            {/* Header */}
                            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900 rounded-t-xl">
                                <div>
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                        <FileDiff className="text-orange-500" />
                                        Diff Viewer: {diffData.item.owner}.{diffData.item.name}
                                    </h2>
                                    <span className="text-xs text-zinc-500 uppercase font-mono mt-1 block">{diffData.item.type}</span>
                                </div>
                                <button onClick={() => setDiffData(null)} className="text-zinc-400 hover:text-white p-2 hover:bg-zinc-800 rounded-full transition-colors">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            {/* Content - Monaco Diff Editor */}
                            <div className="flex-1 overflow-hidden relative group">
                                <DiffEditor
                                    height="100%"
                                    original={diffData.ddl1}
                                    modified={diffData.ddl2}
                                    language="sql"
                                    theme="vs-dark"
                                    options={{
                                        readOnly: true,
                                        renderSideBySide: true,
                                        minimap: { enabled: false },
                                        scrollBeyondLastLine: false,
                                        wordWrap: "on",
                                        originalEditable: false,
                                    }}
                                />
                                {/* Overlay Labels with Actions */}
                                <div className="absolute top-0 left-0 w-1/2 p-2 pointer-events-none flex justify-between px-8 z-10">
                                    <div className="pointer-events-auto">
                                        <button
                                            onClick={() => initiateCompile(diffData.item, 'source_to_target')}
                                            className="bg-zinc-800/80 hover:bg-emerald-600/80 text-emerald-400 hover:text-white text-xs px-3 py-1.5 rounded backdrop-blur-sm border border-emerald-500/20 shadow-sm flex items-center gap-2 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            Push to Target <ArrowLeft className="w-3 h-3 rotate-180" />
                                        </button>
                                    </div>
                                    <span className="bg-zinc-800/80 text-emerald-400 text-xs px-2 py-1 rounded backdrop-blur-sm border border-emerald-500/20 shadow-sm">
                                        Source: {diffData.env1Name}
                                    </span>
                                </div>
                                <div className="absolute top-0 right-0 w-1/2 p-2 pointer-events-none flex justify-between px-8 z-10 flex-row-reverse">
                                    <div className="pointer-events-auto">
                                        <button
                                            onClick={() => initiateCompile(diffData.item, 'target_to_source')}
                                            className="bg-zinc-800/80 hover:bg-blue-600/80 text-blue-400 hover:text-white text-xs px-3 py-1.5 rounded backdrop-blur-sm border border-blue-500/20 shadow-sm flex items-center gap-2 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <ArrowLeft className="w-3 h-3" /> Push to Source
                                        </button>
                                    </div>
                                    <span className="bg-zinc-800/80 text-blue-400 text-xs px-2 py-1 rounded backdrop-blur-sm border border-blue-500/20 shadow-sm">
                                        Target: {diffData.env2Name}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Compilation Confirmation Modal */}
                {compileModal && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in duration-200">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg p-6 shadow-2xl">
                            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                <Database className="w-5 h-5 text-orange-500" /> Confirm Compilation
                            </h3>
                            <p className="text-zinc-400 text-sm mb-6">
                                You are about to compile/overwrite an object in the database.
                                <br />
                                <span className="text-red-400 font-bold block mt-2">
                                    ACTION: {compileModal.direction === 'source_to_target' ? 'PUSH TO TARGET' : 'PUSH TO SOURCE'}
                                </span>
                            </p>

                            <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 mb-6 text-sm font-mono space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Source (Code):</span>
                                    <span className="text-emerald-400">{compileModal.sourceName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-zinc-500">Target (Execute):</span>
                                    <span className="text-blue-400">{compileModal.targetName}</span>
                                </div>
                                <div className="flex justify-between border-t border-zinc-800 pt-2 mt-2">
                                    <span className="text-zinc-500">Object:</span>
                                    <span className="text-white">{compileModal.item.owner}.{compileModal.item.name}</span>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setCompileModal(null)}
                                    disabled={isCompiling}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeCompile}
                                    disabled={isCompiling}
                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-orange-900/20"
                                >
                                    {isCompiling && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                                    {isCompiling ? 'Compiling...' : 'Confirm & Compile'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                {/* Loading Overlay for Diff Fetch */}
                {isFetchingDiff && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm cursor-wait">
                        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in duration-200">
                            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                            <div className="text-sm font-medium text-white">Fetching raw DDL from database...</div>
                        </div>
                    </div>
                )}
                <ConnectionManager
                    isOpen={isConnManagerOpen}
                    onClose={() => setIsConnManagerOpen(false)}
                    onSelect={selectingForOwner ? handleConnSelect : undefined}
                />

                {/* Custom Alert Modal */}
                {alertModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in zoom-in duration-200">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-6 shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                {(alertModal.type === 'error' || !alertModal.type) && <X className="w-5 h-5 text-red-500" />}
                                {alertModal.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                {alertModal.title || 'Alert'}
                            </h3>
                            <p className="text-zinc-400 text-sm mb-6 whitespace-pre-line leading-relaxed">
                                {alertModal.message}
                            </p>
                            <div className="flex justify-end">
                                <button
                                    onClick={() => setAlertModal(null)}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium text-sm"
                                >
                                    OK, Got it
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
