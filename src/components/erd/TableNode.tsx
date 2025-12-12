
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { TableData } from '@/lib/erd/sql-generator';
import { KeyRound, Link } from 'lucide-react';

const TableNode = ({ data, selected }: NodeProps & { data: TableData }) => {
    return (
        <div className={`min-w-[200px] rounded-md border bg-zinc-900 shadow-xl transition-all ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-zinc-700'}`}>

            {/* Header */}
            <div className="border-b border-zinc-700 bg-zinc-800 px-4 py-2 rounded-t-md">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                    {data.label}
                </h3>
            </div>

            {/* Columns */}
            <div className="p-2 flex flex-col gap-1">
                {data.columns.map((col) => (
                    <div key={col.id} className="group flex items-center justify-between rounded px-2 py-1 hover:bg-zinc-800 relative">
                        <div className="flex items-center gap-2 overflow-hidden">
                            {col.isPk && <KeyRound className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
                            {col.isFk && <Link className="h-3 w-3 text-blue-500 flex-shrink-0" />}
                            <span className={`text-xs ${col.isPk ? 'font-bold text-zinc-100' : 'text-zinc-300'}`}>
                                {col.name}
                            </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 ml-2">{col.type}</span>

                        {/* Handles for connecting - Only show on hover or always? 
                For ERD usually we just connect the whole table, so we put handles on the table sides.
            */}
                    </div>
                ))}
                {data.columns.length === 0 && (
                    <div className="text-xs text-zinc-600 italic px-2">No columns</div>
                )}
            </div>

            {/* Connection Handles */}
            <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-3 !h-3" />
            <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-3 !h-3" />
            <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3" />
            <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
        </div>
    );
};

export default memo(TableNode);
