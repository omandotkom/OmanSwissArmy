
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
        // 1. Fetch ALL Resources in parallel
        // We attempt to fetch 'pv' (PersistentVolumes) to get ReclaimPolicy. 
        // This might fail if user is not admin, so we catch and return empty.
        const [pvcOut, podsOut, cmOut, secretOut, pvOut] = await Promise.all([
            client.runCommand(['get', 'pvc', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }'),
            client.runCommand(['get', 'pods', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }'),
            client.runCommand(['get', 'cm', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }'),
            client.runCommand(['get', 'secret', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }'),
            client.runCommand(['get', 'pv', '-o', 'json']).catch(() => '{ "items": [] }') // Global resource
        ]);

        const pvcData = JSON.parse(pvcOut);
        const podsData = JSON.parse(podsOut);
        const cmData = JSON.parse(cmOut);
        const secretData = JSON.parse(secretOut);
        const pvData = JSON.parse(pvOut);

        // 2. Map PV Details (ReclaimPolicy & FsType)
        // Map<VolumeName, { policy: string, fsType: string }>
        const pvMap = new Map<string, { policy: string, fsType: string }>();
        pvData.items?.forEach((pv: any) => {
            let fsType = 'Unknown';
            const s = pv.spec;
            if (s.csi?.fsType) fsType = s.csi.fsType;
            else if (s.awsElasticBlockStore?.fsType) fsType = s.awsElasticBlockStore.fsType;
            else if (s.gcePersistentDisk?.fsType) fsType = s.gcePersistentDisk.fsType;
            else if (s.azureDisk?.fsType) fsType = s.azureDisk.fsType;
            else if (s.nfs) fsType = 'nfs';
            else if (s.glusterfs) fsType = 'glusterfs';
            else if (s.hostPath) fsType = 'hostPath';

            pvMap.set(pv.metadata.name, {
                policy: s.persistentVolumeReclaimPolicy || 'Unknown',
                fsType: fsType
            });
        });

        // 3. Map Usage (Inverted Index)
        const pvcUsage = new Map<string, { podName: string, mountPath: string }[]>();
        const cmUsage = new Map<string, string[]>();
        const secretUsage = new Map<string, string[]>();

        podsData.items?.forEach((pod: any) => {
            const podName = pod.metadata.name;
            const volPvc = new Map<string, string>(); // VolName -> ClaimName

            pod.spec.volumes?.forEach((v: any) => {
                if (v.persistentVolumeClaim?.claimName) {
                    volPvc.set(v.name, v.persistentVolumeClaim.claimName);
                }
                if (v.configMap?.name) {
                    const existing = cmUsage.get(v.configMap.name) || [];
                    if (!existing.includes(podName)) existing.push(podName);
                    cmUsage.set(v.configMap.name, existing);
                }
                if (v.secret?.secretName) {
                    const existing = secretUsage.get(v.secret.secretName) || [];
                    if (!existing.includes(podName)) existing.push(podName);
                    secretUsage.set(v.secret.secretName, existing);
                }
                if (v.projected?.sources) {
                    v.projected.sources.forEach((s: any) => {
                        if (s.secret?.name) {
                            const existing = secretUsage.get(s.secret.name) || [];
                            if (!existing.includes(podName)) existing.push(podName);
                            secretUsage.set(s.secret.name, existing);
                        }
                        if (s.configMap?.name) {
                            const existing = cmUsage.get(s.configMap.name) || [];
                            if (!existing.includes(podName)) existing.push(podName);
                            cmUsage.set(s.configMap.name, existing);
                        }
                    });
                }
            });

            pod.spec.containers?.forEach((c: any) => {
                c.volumeMounts?.forEach((vm: any) => {
                    const claimName = volPvc.get(vm.name);
                    if (claimName) {
                        const current = pvcUsage.get(claimName) || [];
                        current.push({ podName, mountPath: vm.mountPath });
                        pvcUsage.set(claimName, current);
                    }
                });
            });
        });

        // Helper: Calculate Age
        const timeSince = (date: string) => {
            const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + "y";
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + "mo";
            interval = seconds / 86400;
            if (interval > 1) return Math.floor(interval) + "d";
            interval = seconds / 3600;
            if (interval > 1) return Math.floor(interval) + "h";
            return Math.floor(seconds / 60) + "m";
        };

        // 4. Construct PVC List (Enriched)
        const pvcs = pvcData.items?.map((pvc: any) => {
            const name = pvc.metadata.name;
            const usageInfo = pvcUsage.get(name) || [];
            const mountedBy = [...new Set(usageInfo.map(u => u.podName))];

            const scanCandidate = usageInfo.length > 0 ? usageInfo[0] : null;
            const accessModes = pvc.spec.accessModes || [];
            const isRWO = accessModes.includes('ReadWriteOnce');
            const rwoRisk = isRWO && mountedBy.length > 1;

            const volumeName = pvc.spec.volumeName || '';
            const pvDetails = pvMap.get(volumeName) || { policy: 'Unknown', fsType: 'Unknown' };

            // Check conditions (e.g. Resizing)
            const conditions = pvc.status?.conditions?.map((c: any) => c.type) || [];

            return {
                name: name,
                status: pvc.status.phase,
                capacity: pvc.status.capacity?.storage || 'N/A',
                storageClass: pvc.spec.storageClassName || 'Standard',
                accessModes: accessModes,
                volumemode: pvc.spec.volumeMode,
                mountedBy: mountedBy,
                scanCandidate: scanCandidate,
                isZombie: pvc.status.phase === 'Bound' && mountedBy.length === 0,
                rwoRisk: rwoRisk,
                // New Fields
                age: timeSince(pvc.metadata.creationTimestamp),
                volumeName: volumeName,
                reclaimPolicy: pvDetails.policy,
                fileSystem: pvDetails.fsType,
                conditions: conditions
            };
        }) || [];

        // 5. CM & Secrets
        const configMaps = cmData.items?.map((cm: any) => ({
            name: cm.metadata.name,
            keys: Object.keys(cm.data || {}).length,
            mountedBy: cmUsage.get(cm.metadata.name) || [],
            isUnused: (cmUsage.get(cm.metadata.name) || []).length === 0,
            age: timeSince(cm.metadata.creationTimestamp)
        })) || [];

        const secrets = secretData.items?.map((s: any) => ({
            name: s.metadata.name,
            type: s.type,
            keys: Object.keys(s.data || {}).length,
            mountedBy: secretUsage.get(s.metadata.name) || [],
            isUnused: (secretUsage.get(s.metadata.name) || []).length === 0,
            age: timeSince(s.metadata.creationTimestamp)
        })) || [];

        return NextResponse.json({ pvcs, configMaps, secrets });

    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to analyze resources' }, { status: 500 });
    }
}
