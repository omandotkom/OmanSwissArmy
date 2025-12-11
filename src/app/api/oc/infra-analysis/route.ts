
import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const namespace = searchParams.get('namespace');

    if (!namespace) {
        return NextResponse.json({ error: 'Namespace is required' }, { status: 400 });
    }

    const client = new OcClient();

    try {
        // 1. Try Fetch Node Metrics (This often requires Admin privileges)
        // Output format: NAME   CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
        let nodes = [];
        let nodeError = null;

        try {
            const nodesOutput = await client.runCommand(['adm', 'top', 'nodes', '--no-headers']);
            nodes = nodesOutput.split('\n').filter(line => line.trim()).map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    name: parts[0],
                    cpuCores: parts[1],
                    cpuPercent: parts[2],
                    memoryBytes: parts[3],
                    memoryPercent: parts[4]
                };
            });
        } catch (e: any) {
            console.warn("Node metrics failed (likely permission):", e.message);
            nodeError = "Permission Denied: You typically need Cluster Admin rights to see Node-level metrics.";
        }

        // 2. Fetch Project Pod Metrics
        let pods = [];
        try {
            const podsOutput = await client.runCommand(['adm', 'top', 'pods', '-n', namespace, '--no-headers', '--sort-by=cpu']);
            pods = podsOutput.split('\n').filter(line => line.trim()).map(line => {
                const parts = line.trim().split(/\s+/);
                return {
                    name: parts[0],
                    cpu: parts[1],
                    memory: parts[2]
                };
            });
        } catch (e: any) {
            // Pod metrics might fail if metrics-server is down or empty project
            console.warn("Pod metrics failed:", e.message);
        }

        return NextResponse.json({
            nodes,
            nodeError,
            pods
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to analyze infra' }, { status: 500 });
    }
}
