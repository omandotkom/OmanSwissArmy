
"use client";

import React, { useState, useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    Edge,
    Node,
    ReactFlowProvider,
    BackgroundVariant,
    useReactFlow,
    Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { ArrowLeft, Database, Search, GitBranch, RefreshCcw, Layers } from 'lucide-react';
import Link from 'next/link';
import ConnectionManager from "@/components/ConnectionManager";
import { OracleConnection } from "@/services/connection-storage";
import { trackActivity } from "@/lib/tracker";
import { parseScheduleToIndonesian } from "@/lib/schedule-parser";
import { useToast, ToastContainer } from "@/components/ui/toast";

interface JobItem {
    OWNER: string;
    JOB_NAME: string;
    JOB_TYPE: string;
    JOB_ACTION: string;
    REPEAT_INTERVAL: string;
    STATE: string;
    COMMENTS: string;
}

const nodeWidth = 220;
const nodeHeight = 80;

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: 'LR' });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);

        // Dagre center coords -> ReactFlow top-left
        return {
            ...node,
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

export default function OracleJobVisualizer() {
    return (
        <ReactFlowProvider>
            <JobVisualizerContent />
        </ReactFlowProvider>
    );
}

function JobVisualizerContent() {
    // --- State ---
    const [connection, setConnection] = useState<OracleConnection | null>(null);
    const [isConnManagerOpen, setIsConnManagerOpen] = useState(false);

    // Data
    const [jobs, setJobs] = useState<JobItem[]>([]);
    const [filteredJobs, setFilteredJobs] = useState<JobItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);
    const [search, setSearch] = useState("");

    // Graph
    // We maintain raw nodes/edges in a simple state to merge updates, then layout them.
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [isGraphLoading, setIsGraphLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState("");

    const { fitView } = useReactFlow();
    const { addToast, toasts, removeToast } = useToast();

    // --- Actions ---

    const handleSelectConnection = async (conn: OracleConnection) => {
        setConnection(conn);
        setIsConnManagerOpen(false);
        setJobs([]);
        setFilteredJobs([]);
        setNodes([]);
        setEdges([]);
        setSelectedJob(null);

        setIsLoading(true);
        try {
            const res = await fetch('/api/oracle/job-visualizer/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connection: conn })
            });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            setJobs(data.jobs);
            setFilteredJobs(data.jobs);
            trackActivity({ action: "JOB_VISUALIZER_LOAD_JOBS", label: conn.name });

        } catch (err: any) {
            addToast(err.message || "Failed to list jobs", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = (term: string) => {
        setSearch(term);
        const lower = term.toLowerCase();
        setFilteredJobs(jobs.filter(j =>
            j.JOB_NAME?.toLowerCase().includes(lower) ||
            j.JOB_ACTION?.toLowerCase().includes(lower)
        ));
    };

    const handleSelectJob = async (job: JobItem) => {
        setSelectedJob(job);
        setIsGraphLoading(true);
        setLoadingProgress("Parsing job action...");

        // Reset Graph
        setNodes([]);
        setEdges([]);

        // Local accumulators for incremental update
        let currentNodes: Node[] = [];
        let currentEdges: Edge[] = [];

        // 1. Add Center Job Node
        const jobNodeId = `JOB:${job.JOB_NAME}`;
        const jobNode: Node = {
            id: jobNodeId,
            type: 'default',
            data: { label: `JOB: ${job.JOB_NAME}` },
            position: { x: 0, y: 0 },
            style: {
                background: '#1e3a8a',
                color: '#e4e4e7',
                border: '1px solid #3b82f6',
                width: nodeWidth,
                fontSize: 12,
                fontWeight: 'bold'
            }
        };
        currentNodes = [jobNode];
        setNodes(currentNodes); // Show Job Node immediately

        try {
            // 2. Parse Job Action to get Roots
            const parseRes = await fetch('/api/oracle/job-visualizer/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connection: connection,
                    owner: job.OWNER,
                    jobType: job.JOB_TYPE,
                    jobAction: job.JOB_ACTION
                })
            });

            const parseData = await parseRes.json();
            if (!parseRes.ok) throw new Error(parseData.error);

            const roots = parseData.roots || [];
            if (roots.length === 0) {
                throw new Error("No Objects found in Job Action");
            }

            setLoadingProgress(`Found ${roots.length} roots. Tracing...`);

            // 3. Parallel Trace for each root
            let completed = 0;
            const tracePromises = roots.map(async (root: { owner: string, name: string }) => {
                try {
                    const traceRes = await fetch('/api/oracle/job-visualizer/deps', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            connection: connection,
                            rootOwner: root.owner,
                            rootName: root.name
                        })
                    });
                    const traceData = await traceRes.json();

                    if (traceRes.ok && traceData.nodes) {
                        const newNodesRaw = traceData.nodes;
                        const newEdgesRaw = traceData.edges;

                        // Transform & Merge Nodes
                        newNodesRaw.forEach((n: any) => {
                            if (!currentNodes.some(ex => ex.id === n.id)) {
                                currentNodes.push({
                                    id: n.id,
                                    type: 'default',
                                    data: { label: `${n.label}\n(${n.fullType})` },
                                    position: { x: 0, y: 0 },
                                    style: {
                                        background: n.type === 'ROOT' || n.fullType === 'ROOT_PROC' ? '#1e3a8a' : '#18181b', // Dark blue for direct calls
                                        color: '#e4e4e7',
                                        border: '1px solid #3f3f46',
                                        width: nodeWidth,
                                        fontSize: 12
                                    }
                                });
                            }
                        });

                        // Transform & Merge Edges
                        newEdgesRaw.forEach((e: any) => {
                            if (!currentEdges.some(ex => ex.id === e.id)) {
                                currentEdges.push({
                                    ...e,
                                    type: 'smoothstep',
                                    animated: true,
                                    style: { stroke: '#52525b' }
                                });
                            }
                        });

                        // Add Edge from JOB -> Root
                        const rootId = `${root.owner}.${root.name}`;
                        const linkId = `${jobNodeId}->${rootId}`;
                        if (!currentEdges.some(e => e.id === linkId)) {
                            currentEdges.push({
                                id: linkId,
                                source: jobNodeId,
                                target: rootId,
                                animated: true,
                                style: { stroke: '#3b82f6', strokeWidth: 2 }
                            });
                        }

                        // Incremental Layout Update!
                        const layouted = getLayoutedElements([...currentNodes], [...currentEdges]);
                        setNodes(layouted.nodes);
                        setEdges(layouted.edges);

                        // Fit view if it's the first batch or periodically?
                        // Too much jumping if we fit view every time. Let user scroll.
                    }
                } catch (e) {
                    console.error("Error tracing root", root, e);
                } finally {
                    completed++;
                    setLoadingProgress(`Tracing... ${completed}/${roots.length}`);
                }
            });

            await Promise.all(tracePromises);

            // Final fit view
            setTimeout(() => fitView(), 100);

            trackActivity({ action: "JOB_VISUALIZER_VIEW_DEPS", label: job.JOB_NAME });

        } catch (err: any) {
            addToast(err.message || "Failed to visualize job", "error");
        } finally {
            setIsGraphLoading(false);
            setLoadingProgress("");
        }
    };

    return (
        <div className="h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-hidden">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* Header */}
            <div className="h-14 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/" onClick={() => trackActivity({ action: "CLICK_BACK", label: "Job Visualizer" })} className="text-zinc-400 hover:text-zinc-200 transition-colors">
                        <ArrowLeft size={18} />
                    </Link>
                    <h1 className="text-lg font-semibold flex items-center gap-2">
                        <GitBranch className="text-blue-500" size={20} />
                        Oracle Job Visualizer
                    </h1>
                </div>

                <button
                    onClick={() => setIsConnManagerOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-sm transition-colors"
                >
                    <Database size={14} className={connection ? "text-green-500" : "text-zinc-400"} />
                    {connection ? `${connection.username}@${connection.serviceName}` : "Select Connection"}
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex overflow-hidden">

                {/* Left Sidebar: Job List */}
                <div className="w-96 border-r border-zinc-800 bg-zinc-950 flex flex-col shrink-0">
                    <div className="p-4 border-b border-zinc-900">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-zinc-500" size={14} />
                            <input
                                type="text"
                                placeholder="Search Job / Action..."
                                value={search}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {isLoading ? (
                            <div className="flex justify-center p-8 text-zinc-500 animate-pulse">Loading Jobs...</div>
                        ) : filteredJobs.length === 0 ? (
                            <div className="text-center p-8 text-zinc-500 text-sm">
                                {connection ? "No jobs found" : "Select a connection"}
                            </div>
                        ) : (
                            filteredJobs.map((job) => (
                                <div
                                    key={`${job.OWNER}.${job.JOB_NAME}`}
                                    onClick={() => handleSelectJob(job)}
                                    className={`p-3 rounded cursor-pointer border transition-all ${selectedJob?.JOB_NAME === job.JOB_NAME
                                            ? "bg-blue-900/20 border-blue-500/50"
                                            : "bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700"
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`font-mono font-bold text-sm ${selectedJob?.JOB_NAME === job.JOB_NAME ? 'text-blue-400' : 'text-zinc-300'}`}>
                                            {job.JOB_NAME}
                                        </span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${job.STATE === 'SCHEDULED' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                                            {job.STATE}
                                        </span>
                                    </div>
                                    <div className="text-xs text-zinc-500 mb-2 truncate" title={job.JOB_ACTION}>
                                        {job.JOB_ACTION || "-"}
                                    </div>
                                    <div className="text-xs text-zinc-400 flex items-center gap-1 bg-zinc-950/50 p-1.5 rounded">
                                        <RefreshCcw size={10} className="mt-0.5" />
                                        {parseScheduleToIndonesian(job.REPEAT_INTERVAL)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Main Graph Area */}
                <div className="flex-1 relative bg-zinc-900">
                    {selectedJob && (
                        <div className="absolute top-4 left-4 z-10 bg-zinc-950/80 backdrop-blur border border-zinc-800 p-4 rounded-lg max-w-md shadow-xl pointer-events-none">
                            <h2 className="text-sm font-bold text-zinc-200 mb-1">{selectedJob.JOB_NAME}</h2>
                            <p className="text-xs text-zinc-400 font-mono mb-2">{selectedJob.JOB_ACTION}</p>
                            <p className="text-xs text-blue-400 italic">
                                "{parseScheduleToIndonesian(selectedJob.REPEAT_INTERVAL)}"
                            </p>
                        </div>
                    )}

                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        fitView
                        colorMode="dark"
                    >
                        <Background color="#333" variant={BackgroundVariant.Dots} />
                        <Controls className="!bg-zinc-800 !border-zinc-700 !text-white" />
                    </ReactFlow>

                    {isGraphLoading && (
                        <div className="absolute bottom-8 right-8 z-50 flex items-center bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-700 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-4 h-4 mr-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-medium text-white">{loadingProgress}</span>
                        </div>
                    )}

                    {!selectedJob && !isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-zinc-600 flex flex-col items-center gap-2">
                                <Layers size={48} className="opacity-20" />
                                <p>Select a job to visualize dependencies</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ConnectionManager
                isOpen={isConnManagerOpen}
                onClose={() => setIsConnManagerOpen(false)}
                onSelect={handleSelectConnection}
            />
        </div>
    );
}
