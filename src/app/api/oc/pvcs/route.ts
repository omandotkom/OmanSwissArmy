
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
        // We use metadata-only for secrets/cm to be faster/safer if possible, but -o json usually fetches full content.
        // For secrets, we strictly need to avoid leaking data if we were logging, but here we just process metadata.
        const [pvcOut, podsOut, cmOut, secretOut] = await Promise.all([
            client.runCommand(['get', 'pvc', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }'),
            client.runCommand(['get', 'pods', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }'),
            client.runCommand(['get', 'cm', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }'),
            client.runCommand(['get', 'secret', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }')
        ]);

        const pvcData = JSON.parse(pvcOut);
        const podsData = JSON.parse(podsOut);
        const cmData = JSON.parse(cmOut);
        const secretData = JSON.parse(secretOut);

        // 2. Map Usage (Inverted Index)
        // Map<Name, PodName[]> for each type
        const pvcUsage = new Map<string, { podName: string, mountPath: string }[]>();
        const cmUsage = new Map<string, string[]>();
        const secretUsage = new Map<string, string[]>();

        podsData.items?.forEach((pod: any) => {
            const podName = pod.metadata.name;

            // Map Volumes logic
            const volPvc = new Map<string, string>(); // VolName -> ClaimName

            pod.spec.volumes?.forEach((v: any) => {
                // PVC
                if (v.persistentVolumeClaim?.claimName) {
                    volPvc.set(v.name, v.persistentVolumeClaim.claimName);
                }
                // ConfigMap
                if (v.configMap?.name) {
                    const existing = cmUsage.get(v.configMap.name) || [];
                    if (!existing.includes(podName)) existing.push(podName);
                    cmUsage.set(v.configMap.name, existing);
                }
                // Secret
                if (v.secret?.secretName) {
                    const existing = secretUsage.get(v.secret.secretName) || [];
                    if (!existing.includes(podName)) existing.push(podName);
                    secretUsage.set(v.secret.secretName, existing);
                }
                // Projected (often used for service account tokens/secrets)
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

            // Map PVC Mount Paths (only for PVCs as requested for Disk Usage)
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

        // 3. Construct PVC List with RWO Check
        const pvcs = pvcData.items?.map((pvc: any) => {
            const name = pvc.metadata.name;
            const usageInfo = pvcUsage.get(name) || [];
            const mountedBy = [...new Set(usageInfo.map(u => u.podName))]; // Unique pods

            const scanCandidate = usageInfo.length > 0 ? usageInfo[0] : null;
            const accessModes = pvc.spec.accessModes || [];
            const isRWO = accessModes.includes('ReadWriteOnce');

            // Risk: RWO volume mounted by more than 1 distinct pod
            const rwoRisk = isRWO && mountedBy.length > 1;

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
                rwoRisk: rwoRisk
            };
        }) || [];

        // 4. Construct CM List
        const configMaps = cmData.items?.map((cm: any) => ({
            name: cm.metadata.name,
            keys: Object.keys(cm.data || {}).length,
            mountedBy: cmUsage.get(cm.metadata.name) || [],
            isUnused: (cmUsage.get(cm.metadata.name) || []).length === 0
        })) || [];

        // 5. Construct Secret List
        const secrets = secretData.items?.map((s: any) => ({
            name: s.metadata.name,
            type: s.type,
            keys: Object.keys(s.data || {}).length,
            mountedBy: secretUsage.get(s.metadata.name) || [],
            isUnused: (secretUsage.get(s.metadata.name) || []).length === 0
        })) || [];

        return NextResponse.json({ pvcs, configMaps, secrets });

    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to analyze resources' }, { status: 500 });
    }
}
