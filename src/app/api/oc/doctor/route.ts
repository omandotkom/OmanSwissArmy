
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
        // 1. Fetch Resource Quota
        const rquotaCmd = await client.runCommand(['get', 'resourcequota', '-n', namespace, '-o', 'json']).catch(() => '{ "items": [] }');
        const rquotaData = JSON.parse(rquotaCmd);

        // 2. Fetch Pending Pods
        const pendingPodsCmd = await client.runCommand(['get', 'pods', '-n', namespace, '--field-selector=status.phase=Pending', '-o', 'json']).catch(() => '{ "items": [] }');
        const pendingPodsData = JSON.parse(pendingPodsCmd);

        // 3. Analyze Quotas
        interface QuotaStatus { name: string, used: string, hard: string, type: 'cpu' | 'memory' | 'other', isCritical: boolean }
        const quotas: QuotaStatus[] = [];

        rquotaData.items?.forEach((q: any) => {
            const hard = q.status?.hard || {};
            const used = q.status?.used || {};

            Object.keys(hard).forEach(key => {
                if (key.includes('cpu') || key.includes('memory') || key.includes('pods')) {
                    const hVal = hard[key];
                    const uVal = used[key];
                    const isCritical = (hVal === uVal); // Very basic check

                    quotas.push({
                        name: `${q.metadata.name} - ${key}`,
                        used: uVal,
                        hard: hVal,
                        type: key.includes('cpu') ? 'cpu' : key.includes('memory') ? 'memory' : 'other',
                        isCritical
                    });
                }
            });
        });

        // 4. Analyze Pending Pods & Infra Stress
        const infraIssues: { pod: string, message: string, severity: 'warning' | 'critical' }[] = [];

        const pendingAnalyses = await Promise.all(pendingPodsData.items?.map(async (pod: any) => {
            // Get events for this pod
            // oc get events --field-selector involvedObject.name=mypodname,involvedObject.namespace=mynamespace
            const eventsCmd = await client.runCommand(['get', 'events', '-n', namespace,
                `--field-selector=involvedObject.name=${pod.metadata.name},involvedObject.uid=${pod.metadata.uid}`,
                '--sort-by=.lastTimestamp',
                '-o', 'json'
            ]).catch(() => '{ "items": [] }');

            const eventsData = JSON.parse(eventsCmd);
            const recentEvents = eventsData.items?.map((e: any) => {
                const msg = e.message || "";
                // Check for Infra/CRI patterns
                if (msg.includes("CRI-O") ||
                    msg.includes("system load") ||
                    msg.includes("name is reserved") ||
                    msg.includes("PLEG") ||
                    msg.includes("context deadline exceeded")) {

                    infraIssues.push({
                        pod: pod.metadata.name,
                        message: `INFRA ISSUE: ${msg}`,
                        severity: 'critical'
                    });
                }

                return {
                    reason: e.reason,
                    message: e.message,
                    count: e.count
                };
            }) || [];

            return {
                name: pod.metadata.name,
                startTime: pod.metadata.creationTimestamp,
                events: recentEvents
            };
        }) || []);

        return NextResponse.json({
            quotas,
            pendingPods: pendingAnalyses,
            infraIssues
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to diagnose cluster' }, { status: 500 });
    }
}
