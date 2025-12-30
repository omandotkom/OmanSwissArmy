"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Background,
    Controls,
    MiniMap,
    Node,
    Position,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Editor from '@monaco-editor/react';
import { Activity, Download, RefreshCcw, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';
import { trackActivity } from '@/lib/tracker';

const DEFAULT_JSON = `{
  "name": "Oman Swiss Army Tool",
  "version": "1.0.0",
  "features": [
    { "name": "JSON Visualizer", "status": "In Progress" },
    { "name": "ERD Designer", "status": "Done" },
    { "name": "Flowchart", "status": "Done" }
  ],
  "author": {
    "name": "Oman",
    "role": "Developer"
  }
}`;

const NODE_WIDTH = 250;
const NODE_HEIGHT = 50;
const X_SPACING = 300;
const Y_SPACING = 60;

// Custom Node Component (Optional, using default for now or we can style it)
// We will use standard nodes but customized via style prop

const JsonVisualizer = () => {
    const [jsonInput, setJsonInput] = useState(DEFAULT_JSON);
    const [error, setError] = useState<string | null>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

    // Layout Algorithm
    const processJson = useCallback((jsonStr: string) => {
        try {
            const data = JSON.parse(jsonStr);
            setError(null);

            const newNodes: Node[] = [];
            const newEdges: Edge[] = [];
            let globalY = 0;

            // Recursive function to generate nodes and edges
            // Returns the center Y of the subtree
            const traverse = (obj: any, parentId: string | null, depth: number, keyName: string | null): number => {
                const currentId = parentId ? `${parentId}-${keyName}` : 'root';
                const isObject = typeof obj === 'object' && obj !== null;
                const isArray = Array.isArray(obj);

                // Label logic
                let label = keyName || 'Root';
                let value = '';

                if (!isObject) {
                    value = String(obj);
                    label = keyName ? `${keyName}: ${value}` : value;
                } else if (isArray) {
                    label = keyName ? `${keyName} []` : 'Array []';
                } else {
                    label = keyName ? `${keyName} {}` : 'Object {}';
                }

                // We will finalize position later, first gather children
                const childrenY: number[] = [];

                if (isObject) {
                    const keys = Object.keys(obj);
                    if (keys.length === 0) {
                        // Empty object/array
                        // Treat as leaf for spacing
                        globalY += Y_SPACING;
                        childrenY.push(globalY - Y_SPACING); // Use current globalY
                    } else {
                        keys.forEach((key, index) => {
                            const childY = traverse(obj[key], currentId, depth + 1, key);
                            childrenY.push(childY);

                            // Create Edge
                            newEdges.push({
                                id: `e-${currentId}-${currentId}-${key}`,
                                source: currentId,
                                target: `${currentId}-${key}`,
                                type: 'smoothstep',
                                animated: false,
                                style: { stroke: '#6366f1' },
                                markerEnd: {
                                    type: MarkerType.ArrowClosed,
                                    color: '#6366f1',
                                },
                            });
                        });
                    }
                } else {
                    // Leaf node
                    globalY += Y_SPACING;
                    childrenY.push(globalY - Y_SPACING);
                }

                // Calculate Y for this node
                // If it has children, center it relative to children
                // If leaf, use the globalY calculation
                let myY = 0;
                if (childrenY.length > 0) {
                    const minY = Math.min(...childrenY);
                    const maxY = Math.max(...childrenY);
                    myY = (minY + maxY) / 2;
                } else {
                    // Should not happen with logic above, but fallback
                    myY = globalY;
                    globalY += Y_SPACING;
                }

                // Create Node
                newNodes.push({
                    id: currentId,
                    data: { label: label },
                    position: { x: depth * X_SPACING, y: myY },
                    sourcePosition: Position.Right,
                    targetPosition: Position.Left,
                    style: {
                        background: '#18181b',
                        color: '#fff',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        padding: '10px',
                        minWidth: '150px',
                        fontSize: '12px',
                        fontFamily: 'monospace'
                    },
                });

                return myY;
            };

            traverse(data, null, 0, null);

            setNodes(newNodes);
            setEdges(newEdges);

        } catch (e: any) {
            setError(e.message);
        }
    }, [setNodes, setEdges]);

    // Initial load
    useEffect(() => {
        processJson(jsonInput);
        trackActivity({ action: "OPEN_TOOL", label: "JSON Visualizer" });
    }, []);

    // Update when input changes (debounced could be better but explicit button is safer for large JSON)
    const handleVisualize = () => {
        processJson(jsonInput);
        trackActivity({ action: "GENERATE_VISUALIZATION", label: "JSON Visualizer" });
    };

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
            {/* Header */}
            <header className="flex-none px-6 py-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <a
                        href="/"
                        onClick={(e) => {
                            e.preventDefault();
                            trackActivity({ action: "CLICK_BACK", label: "JSON Visualizer" }); // Tracker for back navigation
                            window.location.href = "/";
                        }}
                        className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4"
                        >
                            <path d="m12 19-7-7 7-7" />
                            <path d="M19 12H5" />
                        </svg>
                        Back
                    </a>
                    <div>
                        <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-indigo-500" />
                            JSON Visualizer
                        </h1>
                        <p className="text-xs text-zinc-500 mt-1">Visualize JSON data as interactive node diagrams</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleVisualize}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-sm font-medium transition-colors"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        Visualize
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Editor */}
                <div className="w-1/3 border-r border-zinc-800 flex flex-col">
                    <div className="flex-1 relative">
                        <Editor
                            height="100%"
                            defaultLanguage="json"
                            theme="vs-dark"
                            value={jsonInput}
                            onChange={(val) => setJsonInput(val || "")}
                            options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                            }}
                        />
                    </div>
                    {error && (
                        <div className="p-3 bg-red-900/20 border-t border-red-900/50 text-red-200 text-xs flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <pre className="whitespace-pre-wrap font-mono">{error}</pre>
                        </div>
                    )}
                </div>

                {/* Right: React Flow */}
                <div className="flex-1 h-full bg-zinc-900/30 relative">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        fitView
                        attributionPosition="bottom-right"
                    >
                        <Background color="#27272a" gap={16} />
                        <Controls className="bg-zinc-800 border-zinc-700 fill-zinc-400 text-zinc-400" />
                        <MiniMap
                            nodeColor="#3f3f46"
                            maskColor="rgba(0,0,0, 0.4)"
                            className="bg-zinc-900 border border-zinc-800"
                        />
                    </ReactFlow>
                </div>
            </div>
        </div>
    );
};

export default JsonVisualizer;
