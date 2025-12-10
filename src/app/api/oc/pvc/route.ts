import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const namespace = searchParams.get('namespace');
    const pvcName = searchParams.get('pvcName');

    if (!namespace || !pvcName) {
        return NextResponse.json({ error: 'Namespace and PvcName are required' }, { status: 400 });
    }

    const client = new OcClient();

    try {
        const pvcInfo = await client.getPvcDetails(namespace, pvcName);
        if (!pvcInfo) {
            return NextResponse.json({ error: 'PVC not found' }, { status: 404 });
        }
        return NextResponse.json({ pvc: pvcInfo });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
