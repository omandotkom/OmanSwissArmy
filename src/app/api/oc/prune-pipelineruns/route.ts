import { NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export const runtime = 'nodejs'; // Required for streaming in some environments, though 'nodejs' is default for app dir usually

export async function POST(request: Request) {
    const client = new OcClient();

    // Check login
    const isLogin = await client.checkLogin();
    if (!isLogin) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const body = await request.json();
    const { namespace, keepCount } = body;

    if (!namespace) {
        return NextResponse.json({ error: 'Namespace is required' }, { status: 400 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const sendUpdate = (data: any) => {
                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
            };

            try {
                sendUpdate({ type: 'log', message: `Fetching pipeline runs from ${namespace}...` });
                const pipelineRuns = await client.getPipelineRuns(namespace);
                sendUpdate({ type: 'log', message: `Found ${pipelineRuns.length} total runs.` });

                // Sort by start time (newest first)
                const sortedRuns = pipelineRuns.sort((a, b) => {
                    const tA = new Date(a.status?.startTime || 0).getTime();
                    const tB = new Date(b.status?.startTime || 0).getTime();
                    return tB - tA;
                });

                // Helper to identify running pipelines
                const isRunning = (r: any) => {
                    const reason = r.status?.conditions?.[0]?.reason;
                    return reason === 'Running' || !r.status?.completionTime;
                };

                // Identify runs to DELETE
                const runsToDelete: string[] = [];
                const { strategy, statuses, days } = body;

                if (strategy === 'by-status' && Array.isArray(statuses)) {
                    sendUpdate({ type: 'log', message: `Strategy: Delete runs with status [${statuses.join(', ')}]` });
                    sortedRuns.forEach((r: any) => {
                        if (isRunning(r)) return;
                        const reason = r.status?.conditions?.[0]?.reason;
                        if (statuses.includes(reason)) {
                            runsToDelete.push(r.metadata.name);
                        }
                    });
                } else if (strategy === 'older-than' && typeof days === 'number') {
                    sendUpdate({ type: 'log', message: `Strategy: Delete runs older than ${days} days` });
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - days);
                    const cutoffTime = cutoff.getTime();

                    sortedRuns.forEach((r: any) => {
                        if (isRunning(r)) return;
                        const startTimeStr = r.status?.startTime;
                        if (startTimeStr) {
                            const t = new Date(startTimeStr).getTime();
                            if (t < cutoffTime) {
                                runsToDelete.push(r.metadata.name);
                            }
                        }
                    });
                } else {
                    // Default: Keep Count
                    const count = keepCount !== undefined ? keepCount : 10;
                    sendUpdate({ type: 'log', message: `Strategy: Keep recent ${count} runs` });
                    if (count >= 0 && count < sortedRuns.length) {
                        const toDelete = sortedRuns.slice(count);
                        toDelete.forEach((r: any) => {
                            if (!isRunning(r)) {
                                runsToDelete.push(r.metadata.name);
                            } else {
                                sendUpdate({ type: 'log', message: `Skipping running pipeline: ${r.metadata.name}` });
                            }
                        });
                    }
                }

                const total = runsToDelete.length;
                sendUpdate({ type: 'start', total, toKeep: keepCount });

                if (total === 0) {
                    sendUpdate({ type: 'log', message: 'No runs eligible for deletion.' });
                    sendUpdate({ type: 'done', success: 0, failed: 0 });
                    controller.close();
                    return;
                }

                let success = 0;
                let failed = 0;
                const CHUNK_SIZE = 5;

                for (let i = 0; i < total; i += CHUNK_SIZE) {
                    const chunk = runsToDelete.slice(i, i + CHUNK_SIZE);

                    await Promise.all(chunk.map(async (name) => {
                        try {
                            await client.deletePipelineRun(namespace, name);
                            success++;
                            sendUpdate({ type: 'progress', current: success + failed, total, log: `Deleted ${name}` });
                        } catch (e: any) {
                            failed++;
                            sendUpdate({ type: 'progress', current: success + failed, total, log: `Failed to delete ${name}: ${e.message}`, error: true });
                        }
                    }));
                }

                sendUpdate({ type: 'done', success, failed });
                controller.close();

            } catch (error: any) {
                sendUpdate({ type: 'error', message: error.message });
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
