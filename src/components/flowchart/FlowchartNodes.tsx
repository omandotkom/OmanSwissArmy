
import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

// Common handle styles
const handleStyle = { width: 8, height: 8, background: '#555' };

export const StartEndNode = memo(({ data, selected }: NodeProps) => {
    return (
        <div className={`px-4 py-2 shadow-md rounded-full bg-green-500 border-2 ${selected ? 'border-white' : 'border-green-600'} min-w-[100px] text-center`}>
            <Handle type="target" position={Position.Top} className="!bg-zinc-100" />
            <div className="font-bold text-white text-sm">{data.label as string}</div>
            <Handle type="source" position={Position.Bottom} className="!bg-zinc-100" />
        </div>
    );
});

export const ProcessNode = memo(({ data, selected }: NodeProps) => {
    return (
        <div className={`px-4 py-2 shadow-md rounded-md bg-blue-500 border-2 ${selected ? 'border-white' : 'border-blue-600'} min-w-[100px] text-center`}>
            <Handle type="target" position={Position.Top} className="!bg-zinc-100" />
            <Handle type="target" position={Position.Left} className="!bg-zinc-100" />
            <div className="font-bold text-white text-sm">{data.label as string}</div>
            <Handle type="source" position={Position.Right} className="!bg-zinc-100" />
            <Handle type="source" position={Position.Bottom} className="!bg-zinc-100" />
        </div>
    );
});

export const DecisionNode = memo(({ data, selected }: NodeProps) => {
    return (
        <div className="relative flex items-center justify-center w-[100px] h-[100px]">
            <Handle type="target" position={Position.Top} className="!bg-zinc-100 -mt-2" />
            <div className={`w-[80px] h-[80px] bg-yellow-500 border-2 ${selected ? 'border-white' : 'border-yellow-600'} rotate-45 flex items-center justify-center shadow-md`}>
                <div className="-rotate-45 font-bold text-white text-xs text-center leading-tight p-1">{data.label as string}</div>
            </div>
            <Handle type="source" position={Position.Right} className="!bg-zinc-100 -mr-2" />
            <Handle type="source" position={Position.Bottom} className="!bg-zinc-100 -mb-2" />
            <Handle type="source" position={Position.Left} className="!bg-zinc-100 -ml-2" />
        </div>
    );
});

export const IONode = memo(({ data, selected }: NodeProps) => {
    return (
        <div className={`px-4 py-2 shadow-md bg-purple-500 border-2 ${selected ? 'border-white' : 'border-purple-600'} min-w-[100px] text-center transform -skew-x-12`}>
            <Handle type="target" position={Position.Top} className="!bg-zinc-100 skew-x-12" />
            <div className="font-bold text-white text-sm transform skew-x-12">{data.label as string}</div>
            <Handle type="source" position={Position.Bottom} className="!bg-zinc-100 skew-x-12" />
        </div>
    );
});

StartEndNode.displayName = "StartEndNode";
ProcessNode.displayName = "ProcessNode";
DecisionNode.displayName = "DecisionNode";
IONode.displayName = "IONode";
