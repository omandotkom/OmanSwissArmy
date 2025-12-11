
import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: NextRequest) {
    const client = new OcClient();

    try {
        // 1. Get Username
        const userOut = await client.runCommand(['whoami']).catch(() => 'Unknown');
        const username = userOut.trim();

        // 2. Check Privileges debug
        // Check for Cluster Admin
        let debugLog: string[] = [];

        const canDoEverything = await client.runCommand(['auth', 'can-i', '*', '*'])
            .then(o => { debugLog.push(`Root: ${o.trim()}`); return o.trim() === 'yes'; })
            .catch(e => { debugLog.push(`RootErr: ${e.message}`); return false; });

        const canReadNodes = await client.runCommand(['auth', 'can-i', 'get', 'nodes'])
            .then(o => { debugLog.push(`Nodes: ${o.trim()}`); return o.trim() === 'yes'; })
            .catch(e => { debugLog.push(`NodesErr: ${e.message}`); return false; });

        const canReadPVs = await client.runCommand(['auth', 'can-i', 'get', 'pv'])
            .then(o => { debugLog.push(`PV: ${o.trim()}`); return o.trim() === 'yes'; })
            .catch(e => { debugLog.push(`PVErr: ${e.message}`); return false; });

        let role = 'Project User';
        if (canDoEverything) role = 'Cluster Admin';
        else if (canReadNodes && canReadPVs) role = 'Cluster Reader';
        else if (canReadPVs) role = 'Storage Viewer';

        return NextResponse.json({
            username,
            role,
            permissions: {
                isAdmin: canDoEverything,
                canReadNodes,
                canReadPVs
            },
            debug: debugLog // Return debug info
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to check user info' }, { status: 500 });
    }
}
