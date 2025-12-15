
import { NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function POST(request: Request) {
    const client = new OcClient();

    // Check login could be here, helper likely throws if not logged in (or runCommand checks?)
    // OcClient.checkLogin() is available.

    try {
        const { namespace, pvcName } = await request.json();

        if (!namespace || !pvcName) {
            return NextResponse.json({ error: 'Namespace and PVC Name are required' }, { status: 400 });
        }

        const podName = `debug-k-${pvcName.substring(0, 40)}-${Date.now()}`; // Safety substring
        const duration = 600; // 10 Minutes

        await client.createDebugPod(namespace, podName, pvcName, duration);

        // We don't necessarily wait for it to be ready here to keep UI snappy, 
        // the generic PVC Browser handles "ContainerCreating" state usually well enough (refreshes).
        // Or we could wait a bit. Let's return the podName so frontend can redirect.

        return NextResponse.json({
            message: 'Debug pod scheduled',
            podName: podName,
            mountPath: '/mnt/data'
        });

    } catch (error: any) {
        console.error('Inspect API Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to create debug pod' }, { status: 500 });
    }
}
