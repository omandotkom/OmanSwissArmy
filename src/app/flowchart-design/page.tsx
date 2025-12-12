
"use client";

import React, { useState, useCallback, useRef } from 'react';
import {
    ReactFlow,
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    ReactFlowProvider,
    BackgroundVariant,
    Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import {
    Download, Upload, X, Trash2,
    Circle, Square, Diamond, ArrowRightLeft
} from 'lucide-react';
import { StartEndNode, ProcessNode, DecisionNode, IONode } from '@/components/flowchart/FlowchartNodes';
import { useToast, ToastContainer } from "@/components/ui/toast";
import Link from 'next/link';

const nodeTypes = {
    startEnd: StartEndNode,
    process: ProcessNode,
    decision: DecisionNode,
    io: IONode
};

const initialNodes: Node[] = [
    {
        id: '1',
        type: 'startEnd',
        position: { x: 250, y: 50 },
        data: { label: 'Start' },
    }
];
const initialEdges: Edge[] = [];

type NodeType = 'startEnd' | 'process' | 'decision' | 'io';

export default function FlowchartDesigner() {
    return (
        <ReactFlowProvider>
            <FlowchartCanvas />
        </ReactFlowProvider>
    );
}

function FlowchartCanvas() {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const { addToast, toasts, removeToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep', markerEnd: { type: 'arrowclosed' } }, eds)),
        [setEdges],
    );

    const handleAddNode = (type: NodeType) => {
        const id = uuidv4();
        let label = 'Process';
        if (type === 'startEnd') label = 'Start/End';
        if (type === 'decision') label = 'Check?';
        if (type === 'io') label = 'Input';

        const newNode: Node = {
            id,
            type,
            position: { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
            data: { label },
        };
        setNodes((nds) => nds.concat(newNode));
    };

    const handleNodeClick = (_: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id);
    };

    const handlePaneClick = () => {
        setSelectedNodeId(null);
    };

    const updateNodeLabel = (id: string, label: string) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return { ...node, data: { ...node.data, label } };
                }
                return node;
            })
        );
    };

    // Import/Export
    const handleExport = () => {
        const data = { nodes, edges };
        const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
        const link = document.createElement("a");
        link.href = jsonString;
        link.download = "flowchart.json";
        link.click();
        addToast("Exported successfully", "success");
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const parsed = JSON.parse(content);
                if (parsed.nodes && parsed.edges) {
                    setNodes(parsed.nodes);
                    setEdges(parsed.edges);
                    addToast("Imported successfully", "success");
                } else {
                    addToast("Invalid JSON format", "error");
                }
            } catch (err) {
                addToast("Failed to parse JSON file", "error");
            }
        };
        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const selectedNode = nodes.find(n => n.id === selectedNodeId);

    return (
        <div className="h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/** Top Bar */}
            <div className="h-14 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-4 z-10">
                <div className="flex items-center gap-4">
                    <Link href="/" className="text-zinc-400 hover:text-zinc-200 transition-colors">
                        ← Home
                    </Link>
                    <h1 className="text-lg font-semibold text-zinc-100">Flowchart Designer</h1>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        accept=".json"
                        ref={fileInputRef}
                        onChange={handleImport}
                        className="hidden"
                    />

                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition-colors">
                        <Upload size={16} /> Import
                    </button>
                    <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition-colors">
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>

            <div className="flex-1 relative flex overflow-hidden">
                {/* Toolbar for Shapes */}
                <div className="w-16 border-r border-zinc-800 bg-zinc-900 flex flex-col items-center py-4 gap-4 z-10">
                    <button onClick={() => handleAddNode('startEnd')} className="p-2 rounded bg-green-600/20 text-green-500 hover:bg-green-600/40 transition-colors" title="Start/End">
                        <Circle size={24} />
                        <span className="text-[10px] block mt-1">Start</span>
                    </button>
                    <button onClick={() => handleAddNode('process')} className="p-2 rounded bg-blue-600/20 text-blue-500 hover:bg-blue-600/40 transition-colors" title="Process">
                        <Square size={24} />
                        <span className="text-[10px] block mt-1">Process</span>
                    </button>
                    <button onClick={() => handleAddNode('decision')} className="p-2 rounded bg-yellow-600/20 text-yellow-500 hover:bg-yellow-600/40 transition-colors" title="Decision">
                        <Diamond size={24} />
                        <span className="text-[10px] block mt-1">Check</span>
                    </button>
                    <button onClick={() => handleAddNode('io')} className="p-2 rounded bg-purple-600/20 text-purple-500 hover:bg-purple-600/40 transition-colors" title="I/O">
                        <ArrowRightLeft size={24} />
                        <span className="text-[10px] block mt-1">I/O</span>
                    </button>
                </div>

                {/* Main Canvas */}
                <div className="flex-1 h-full w-full">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={handleNodeClick}
                        onPaneClick={handlePaneClick}
                        nodeTypes={nodeTypes}
                        fitView
                        colorMode="dark"
                    >
                        <Background color="#333" variant={BackgroundVariant.Dots} />
                        <Controls position="bottom-left" />
                        <MiniMap position="bottom-right" className="!bg-zinc-900 !border-zinc-800" maskColor="rgba(0,0,0, 0.5)" />
                    </ReactFlow>
                </div>

                {/* Right Sidebar - Properties */}
                {selectedNode && (
                    <div className="w-64 border-l border-zinc-800 bg-zinc-900 overflow-y-auto flex flex-col shadow-2xl z-20 absolute right-0 top-0 bottom-0">
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                            <h2 className="font-semibold text-zinc-200">Properties</h2>
                            <button onClick={() => setSelectedNodeId(null)} className="text-zinc-500 hover:text-zinc-300">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 flex flex-col gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-zinc-500 uppercase font-bold">Label</label>
                                <textarea
                                    value={selectedNode.data.label as string}
                                    onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
                                    className="bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 min-h-[80px]"
                                />
                            </div>

                            <div className="pt-4 border-t border-zinc-800">
                                <button
                                    onClick={() => {
                                        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                                        setSelectedNodeId(null);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 rounded transition-colors text-sm font-medium border border-red-900/50"
                                >
                                    <Trash2 size={16} /> Delete Node
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
