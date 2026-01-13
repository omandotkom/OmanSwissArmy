import { NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace');

    if (!namespace) {
        return NextResponse.json({ error: 'Namespace is required' }, { status: 400 });
    }

    const client = new OcClient();

    const isLogin = await client.checkLogin();
    if (!isLogin) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const pipelineRuns = await client.getPipelineRuns(namespace);
        console.log(`[API] Found ${pipelineRuns.length} pipeline runs in ${namespace}`);

        // Simplify the response to save bandwidth
        const simplified = pipelineRuns.map((pr: any) => ({
            name: pr.metadata.name,
            status: pr.status?.conditions?.[0]?.reason || 'Unknown',
            startTime: pr.status?.startTime,
            completionTime: pr.status?.completionTime,
            duration: pr.status?.completionTime ? (new Date(pr.status.completionTime).getTime() - new Date(pr.status.startTime).getTime()) / 1000 + 's' : pr.status?.startTime ? 'Running' : '-',
            pipeline: pr.spec?.pipelineRef?.name || 'Embedded',
            startedBy: pr.metadata?.annotations?.['pipeline.openshift.io/started-by'] || pr.metadata?.labels?.['pipeline.openshift.io/started-by'] || '-',
            pvcClaims: pr.spec?.workspaces?.map((w: any) => w.persistentVolumeClaim?.claimName).filter(Boolean) || []
        }));

        // Sort by start time desc
        simplified.sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

        return NextResponse.json({ pipelineRuns: simplified });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
