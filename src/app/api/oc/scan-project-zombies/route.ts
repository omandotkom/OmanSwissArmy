import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

// Helper: Parse Size
function parseSize(sizeStr: string): number {
    if (!sizeStr) return 0;
    const units: { [key: string]: number } = {
        'Ki': 1024, 'Mi': 1024 * 1024, 'Gi': 1024 * 1024 * 1024, 'Ti': 1024 * 1024 * 1024 * 1024
    };
    let unit = 'Gi';
    let value = 0;
    const match = sizeStr.match(/^([0-9.]+)([A-Za-z]+)$/);
    if (match) {
        value = parseFloat(match[1]);
        unit = match[2];
    } else {
        value = parseFloat(sizeStr);
        return isNaN(value) ? 0 : value;
    }
    return value * (units[unit] || 1);
}

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const project = searchParams.get('project');

    if (!project) {
        return NextResponse.json({ error: 'Project parameter is required' }, { status: 400 });
    }

    const client = new OcClient();

    try {
        // 1. Fetch PVCs & Pods in specific namespace (Parallel)
        const [pvcOut, podsOut] = await Promise.all([
            client.runCommand(['get', 'pvc', '-n', project, '-o', 'json']).catch(() => '{ "items": [] }'),
            client.runCommand(['get', 'pods', '-n', project, '-o', 'json']).catch(() => '{ "items": [] }')
        ]);

        const pvcs = JSON.parse(pvcOut).items || [];
        const pods = JSON.parse(podsOut).items || [];

        // If no PVCs, return early
        if (pvcs.length === 0) {
            return NextResponse.json({ zombies: [], scannedCount: 0 });
        }

        // 2. Identify Mounted PVCs
        const mountedPvcNames = new Set<string>();

        pods.forEach((pod: any) => {
            pod.spec?.volumes?.forEach((vol: any) => {
                if (vol.persistentVolumeClaim?.claimName) {
                    mountedPvcNames.add(vol.persistentVolumeClaim.claimName);
                }
            });
        });

        // 3. Filter Zombies
        const zombies = pvcs
            .filter((pvc: any) => {
                const isBound = pvc.status?.phase === 'Bound';
                const isMounted = mountedPvcNames.has(pvc.metadata.name);
                return isBound && !isMounted;
            })
            .map((pvc: any) => ({
                namespace: project,
                name: pvc.metadata.name,
                capacity: pvc.status?.capacity?.storage || "0Gi",
                capacityBytes: parseSize(pvc.status?.capacity?.storage || "0Gi"),
                storageClass: pvc.spec?.storageClassName || "-",
                status: pvc.status?.phase,
                age: pvc.metadata.creationTimestamp,
                volumeName: pvc.spec?.volumeName || ""
            }));

        return NextResponse.json({
            zombies,
            scannedCount: pvcs.length
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
