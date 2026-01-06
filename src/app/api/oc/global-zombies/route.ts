import { NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

// Helper untuk parsing size string (e.g. "10Gi", "500Mi") ke bytes
function parseSize(sizeStr: string): number {
    if (!sizeStr) return 0;
    const units: { [key: string]: number } = {
        'Ki': 1024,
        'Mi': 1024 * 1024,
        'Gi': 1024 * 1024 * 1024,
        'Ti': 1024 * 1024 * 1024 * 1024,
        'Pi': 1024 * 1024 * 1024 * 1024 * 1024
    };

    // Default unit
    let unit = 'Gi';
    let value = 0;

    // Regex untuk memisahkan angka dan unit
    const match = sizeStr.match(/^([0-9.]+)([A-Za-z]+)$/);
    if (match) {
        value = parseFloat(match[1]);
        unit = match[2];
    } else {
        // Jika cuma angka, asumsi bytes (jarang terjadi di k8s output normal untuk capacity)
        value = parseFloat(sizeStr);
        return isNaN(value) ? 0 : value;
    }

    const multiplier = units[unit] || 1;
    return value * multiplier;
}

// Helper untuk format bytes balik ke String (e.g. "10.5 GB")
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function POST(req: Request) {
    const client = new OcClient();

    try {
        // 1. Fetch Data (Parallel for speed) using OcClient
        // Note: runCommand returns stdout string directly
        const [pvcOut, podsOut] = await Promise.all([
            client.runCommand(['get', 'pvc', '-A', '-o', 'json']).catch(e => { throw new Error("Failed to fetch PVCs: " + e.message); }),
            client.runCommand(['get', 'pods', '-A', '-o', 'json']).catch(e => { throw new Error("Failed to fetch Pods: " + e.message); })
        ]);

        const pvcs = JSON.parse(pvcOut).items || [];
        const pods = JSON.parse(podsOut).items || [];

        // 2. Indexing PVCs
        // Map Key: "namespace/pvcName" -> PVC Object
        const pvcMap = new Map<string, any>();

        pvcs.forEach((pvc: any) => {
            const key = `${pvc.metadata.namespace}/${pvc.metadata.name}`;
            pvcMap.set(key, pvc);
        });

        const totalPvcCount = pvcMap.size;

        // 3. Mark used PVCs
        const mountedPvcs = new Set<string>();

        pods.forEach((pod: any) => {
            if (pod.spec && pod.spec.volumes) {
                pod.spec.volumes.forEach((vol: any) => {
                    if (vol.persistentVolumeClaim) {
                        const claimName = vol.persistentVolumeClaim.claimName;
                        const ns = pod.metadata.namespace; // PVC must be in same ns as Pod
                        const key = `${ns}/${claimName}`;

                        // Tandai sebagai mounted
                        mountedPvcs.add(key);

                        // Hapus dari map kandidat zombie
                        if (pvcMap.has(key)) {
                            pvcMap.delete(key);
                        }
                    }
                });
            }
        });

        // 4. Process Zombies (Sisa di Map adalah Zombie)
        let totalWastedBytes = 0;
        const zombies: any[] = [];

        pvcMap.forEach((pvc, key) => {
            // Filter only Bound PVCs (Pending/Lost aren't technically 'Zombies' in same sense, but let's keep logic simple for now)
            // Actually, we usually only care about Bound ones consuming space.
            if (pvc.status?.phase === 'Bound') {
                const capacity = pvc.status?.capacity?.storage || "0Gi";
                const bytes = parseSize(capacity);
                totalWastedBytes += bytes;

                zombies.push({
                    namespace: pvc.metadata.namespace,
                    name: pvc.metadata.name,
                    capacity: capacity,
                    storageClass: pvc.spec?.storageClass || "-",
                    status: pvc.status?.phase || "Unknown",
                    age: pvc.metadata.creationTimestamp,
                    volumeName: pvc.spec?.volumeName || ""
                });
            }
        });

        // 5. Build Aggregation (By Namespace)
        const nsStats: { [key: string]: { count: number, sizeBytes: number } } = {};
        zombies.forEach(z => {
            if (!nsStats[z.namespace]) {
                nsStats[z.namespace] = { count: 0, sizeBytes: 0 };
            }
            nsStats[z.namespace].count++;
            nsStats[z.namespace].sizeBytes += parseSize(z.capacity);
        });

        // Convert to array and Find worst namespace
        let worstNs = { name: '-', size: 0, sizeStr: '0 B' };
        const namespaceSummary = Object.keys(nsStats).map(ns => {
            if (nsStats[ns].sizeBytes > worstNs.size) {
                worstNs = { name: ns, size: nsStats[ns].sizeBytes, sizeStr: formatBytes(nsStats[ns].sizeBytes) };
            }
            return {
                namespace: ns,
                count: nsStats[ns].count,
                totalSize: formatBytes(nsStats[ns].sizeBytes)
            };
        });

        return NextResponse.json({
            summary: {
                totalScanned: totalPvcCount,
                totalMounted: mountedPvcs.size,
                totalZombies: zombies.length,
                totalWastedSize: formatBytes(totalWastedBytes),
                worstNamespace: worstNs
            },
            zombies: zombies,
            namespaceSummary: namespaceSummary
        });

    } catch (error: any) {
        console.error("Global PVC Scan Error:", error);
        return NextResponse.json({
            error: error.message || "Failed to execute global scan. Check cluster connection."
        }, { status: 500 });
    }
}
