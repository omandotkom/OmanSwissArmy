
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
import { Plus, Download, Upload, Database, X, Trash2, Code, FileCode } from 'lucide-react';
import Editor from "@monaco-editor/react";

import TableNode from '@/components/erd/TableNode';
import { generateSql, DbType, ErdNode, ErdEdge, TableData } from '@/lib/erd/sql-generator';
import { parseDdlToErd } from '@/lib/erd/ddl-parser';
import { useToast, ToastContainer } from "@/components/ui/toast";
import Link from 'next/link';

const nodeTypes = {
    table: TableNode,
};

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const defaultTableData: TableData = {
    label: 'New Table',
    columns: [
        { id: 'c1', name: 'id', type: 'uuid', isPk: true, isFk: false, isUnique: true, isNullable: false }
    ]
};

export default function ErdDesigner() {
    return (
        <ReactFlowProvider>
            <ErdCanvas />
        </ReactFlowProvider>
    );
}

function ErdCanvas() {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [sqlModalOpen, setSqlModalOpen] = useState(false);
    const [ddlModalOpen, setDdlModalOpen] = useState(false);
    const [generatedSql, setGeneratedSql] = useState('');
    const [ddlContent, setDdlContent] = useState('');
    const [dbType, setDbType] = useState<DbType>('postgresql');

    const { addToast, toasts, removeToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sqlFileInputRef = useRef<HTMLInputElement>(null);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, type: 'smoothstep' }, eds)),
        [setEdges],
    );

    const handleAddTable = () => {
        const id = uuidv4();
        const newNode: Node = {
            id,
            type: 'table',
            position: { x: Math.random() * 400, y: Math.random() * 400 },
            data: { ...defaultTableData, label: `Table_${nodes.length + 1}` },
        };
        setNodes((nds) => nds.concat(newNode));
    };

    const handleNodeClick = (_: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id);
    };

    const handlePaneClick = () => {
        setSelectedNodeId(null);
    };

    const updateNodeData = (id: string, newData: Partial<TableData>) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === id) {
                    return { ...node, data: { ...node.data, ...newData } };
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
        link.download = "erd_schema.json";
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
        // reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // SQL Generation
    const handleGenerateSql = () => {
        const sql = generateSql(nodes as unknown as ErdNode[], edges as unknown as ErdEdge[], dbType);
        setGeneratedSql(sql);
        setSqlModalOpen(true);
    };

    // DDL Import
    const handleImportDDL = () => {
        try {
            const { nodes: newNodes, edges: newEdges } = parseDdlToErd(ddlContent);
            if (newNodes.length === 0) {
                addToast("No tables found in DDL", "error");
                return;
            }
            setNodes(newNodes as unknown as Node[]);
            setEdges(newEdges as unknown as Edge[]);
            setDdlModalOpen(false);
            setDdlContent('');
            addToast(`Imported ${newNodes.length} tables successfully`, "success");
        } catch (error) {
            addToast("Failed to parse DDL", "error");
            console.error(error);
        }
    };

    const handleOpenSqlFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const promises = Array.from(files).map(file => {
            return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = (e) => reject(e);
                reader.readAsText(file);
            });
        });

        try {
            const contents = await Promise.all(promises);
            const combined = contents.join('\n\n');
            setDdlContent(combined);
            addToast(`Loaded ${files.length} file(s) into editor`, "success");
        } catch (error) {
            console.error(error);
            addToast("Failed to read files", "error");
        }

        if (sqlFileInputRef.current) sqlFileInputRef.current.value = '';
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
                    <h1 className="text-lg font-semibold text-zinc-100">ERD Designer</h1>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="file"
                        accept=".json"
                        ref={fileInputRef}
                        onChange={handleImport}
                        className="hidden"
                    />
                    <input
                        type="file"
                        accept=".sql,.txt"
                        multiple
                        ref={sqlFileInputRef}
                        onChange={handleOpenSqlFile}
                        className="hidden"
                    />

                    <button onClick={handleAddTable} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors">
                        <Plus size={16} /> Add Table
                    </button>
                    <button onClick={handleGenerateSql} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 rounded text-white transition-colors">
                        <Code size={16} /> Generate SQL
                    </button>
                    <button onClick={() => setDdlModalOpen(true)} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-500 rounded text-white transition-colors">
                        <FileCode size={16} /> Import DDL
                    </button>
                    <div className="h-6 w-px bg-zinc-700 mx-2"></div>
                    <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition-colors">
                        <Upload size={16} /> Load JSON
                    </button>
                    <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 transition-colors">
                        <Download size={16} /> Export
                    </button>
                </div>
            </div>

            <div className="flex-1 relative flex overflow-hidden">
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
                    <div className="w-80 border-l border-zinc-800 bg-zinc-900 overflow-y-auto flex flex-col shadow-2xl z-20 absolute right-0 top-0 bottom-0">
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                            <h2 className="font-semibold text-zinc-200">Table Properties</h2>
                            <button onClick={() => setSelectedNodeId(null)} className="text-zinc-500 hover:text-zinc-300">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 flex flex-col gap-6">
                            {/* Table Name */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-zinc-500 uppercase font-bold">Table Name</label>
                                <input
                                    type="text"
                                    value={selectedNode.data.label as string}
                                    onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                                    className="bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            {/* Columns */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-zinc-500 uppercase font-bold">Columns</label>
                                    <button
                                        onClick={() => {
                                            const newCol = { id: uuidv4(), name: 'new_column', type: 'string', isPk: false, isFk: false, isUnique: false, isNullable: true };
                                            const currentCols = (selectedNode.data.columns as any[]) || [];
                                            updateNodeData(selectedNode.id, { columns: [...currentCols, newCol] });
                                        }}
                                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Add
                                    </button>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {(selectedNode.data.columns as any[]).map((col, idx) => (
                                        <div key={col.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded flex flex-col gap-2 group relative">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={col.name}
                                                    onChange={(e) => {
                                                        const newCols = [...(selectedNode.data.columns as any[])];
                                                        newCols[idx] = { ...newCols[idx], name: e.target.value };
                                                        updateNodeData(selectedNode.id, { columns: newCols });
                                                    }}
                                                    className="flex-1 bg-transparent border-b border-zinc-800 focus:border-blue-500 text-sm focus:outline-none py-1"
                                                    placeholder="Column Name"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newCols = (selectedNode.data.columns as any[]).filter(c => c.id !== col.id);
                                                        updateNodeData(selectedNode.id, { columns: newCols });
                                                    }}
                                                    className="text-zinc-600 hover:text-red-400"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>

                                            <div className="flex gap-2">
                                                <select
                                                    value={col.type}
                                                    onChange={(e) => {
                                                        const newCols = [...(selectedNode.data.columns as any[])];
                                                        newCols[idx] = { ...newCols[idx], type: e.target.value };
                                                        updateNodeData(selectedNode.id, { columns: newCols });
                                                    }}
                                                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded text-xs p-1 focus:outline-none"
                                                >
                                                    <option value="uuid">UUID</option>
                                                    <option value="string">String</option>
                                                    <option value="number">Number</option>
                                                    <option value="boolean">Boolean</option>
                                                    <option value="date">Date</option>
                                                    <option value="text">Text (Long)</option>
                                                </select>
                                            </div>

                                            <div className="flex gap-3 text-xs text-zinc-400 mt-1">
                                                <label className="flex items-center gap-1 cursor-pointer hover:text-zinc-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={col.isPk}
                                                        onChange={(e) => {
                                                            const newCols = [...(selectedNode.data.columns as any[])];
                                                            newCols[idx] = { ...newCols[idx], isPk: e.target.checked };
                                                            updateNodeData(selectedNode.id, { columns: newCols });
                                                        }}
                                                        className="accent-blue-500"
                                                    />
                                                    PK
                                                </label>
                                                <label className="flex items-center gap-1 cursor-pointer hover:text-zinc-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={col.isFk}
                                                        onChange={(e) => {
                                                            const newCols = [...(selectedNode.data.columns as any[])];
                                                            newCols[idx] = { ...newCols[idx], isFk: e.target.checked };
                                                            updateNodeData(selectedNode.id, { columns: newCols });
                                                        }}
                                                        className="accent-blue-500"
                                                    />
                                                    FK
                                                </label>
                                                <label className="flex items-center gap-1 cursor-pointer hover:text-zinc-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={!col.isNullable}
                                                        onChange={(e) => {
                                                            const newCols = [...(selectedNode.data.columns as any[])];
                                                            newCols[idx] = { ...newCols[idx], isNullable: !e.target.checked };
                                                            updateNodeData(selectedNode.id, { columns: newCols });
                                                        }}
                                                        className="accent-blue-500"
                                                    />
                                                    NN
                                                </label>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-zinc-800">
                                <button
                                    onClick={() => {
                                        setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                                        setSelectedNodeId(null);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 rounded transition-colors text-sm font-medium border border-red-900/50"
                                >
                                    <Trash2 size={16} /> Delete Table
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* SQL Modal */}
            {sqlModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                            <div className="flex items-center gap-4">
                                <h2 className="text-lg font-semibold text-white">Generate SQL</h2>
                                <select
                                    value={dbType}
                                    onChange={(e) => {
                                        setDbType(e.target.value as DbType);
                                        // re-generate immediately on change
                                        const newSql = generateSql(nodes as unknown as ErdNode[], edges as unknown as ErdEdge[], e.target.value as DbType);
                                        setGeneratedSql(newSql);
                                    }}
                                    className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none"
                                >
                                    <option value="postgresql">PostgreSQL</option>
                                    <option value="mysql">MySQL</option>
                                    <option value="oracle">Oracle</option>
                                    <option value="sqlserver">SQL Server</option>
                                </select>
                            </div>
                            <button onClick={() => setSqlModalOpen(false)} className="text-zinc-500 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 p-0 overflow-hidden relative">
                            <textarea
                                readOnly
                                value={generatedSql}
                                className="w-full h-[60vh] bg-zinc-950 p-4 font-mono text-sm text-green-400 resize-none focus:outline-none"
                            />
                        </div>
                        <div className="p-4 border-t border-zinc-800 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(generatedSql);
                                    addToast("Copied to clipboard", "success");
                                }}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-medium transition-colors"
                            >
                                Copy Code
                            </button>
                            <button
                                onClick={() => setSqlModalOpen(false)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DDL Import Modal */}
            {ddlModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                            <div className="flex items-center gap-4">
                                <h2 className="text-lg font-semibold text-white">Import DDL / SQL</h2>
                                <button
                                    onClick={() => sqlFileInputRef.current?.click()}
                                    className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-zinc-300 flex items-center gap-2"
                                >
                                    <Upload size={14} /> Open .sql File
                                </button>
                            </div>
                            <button onClick={() => { setDdlModalOpen(false); setDdlContent(''); }} className="text-zinc-500 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="flex-1 min-h-[400px] border-b border-zinc-800 relative">
                            <Editor
                                height="100%"
                                defaultLanguage="sql"
                                theme="vs-dark"
                                value={ddlContent}
                                onChange={(val) => setDdlContent(val || '')}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 13,
                                    padding: { top: 16 },
                                }}
                            />
                        </div>

                        <div className="p-4 flex flex-col gap-2">
                            <div className="text-xs text-zinc-500 bg-zinc-950 p-2 rounded border border-zinc-800">
                                Supported: CREATE TABLE statements (Postgres/MySQL/Oracle style). Puts tables in grid layout.
                                <br />Note: Complex Constraints and ALTER TABLE are currently skipped.
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => { setDdlModalOpen(false); setDdlContent(''); }}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleImportDDL}
                                    disabled={!ddlContent.trim()}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Parse & Import
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
