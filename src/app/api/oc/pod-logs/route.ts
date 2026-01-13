import { NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace');
    const pod = searchParams.get('pod');
    const container = searchParams.get('container') || undefined;

    if (!namespace || !pod) {
        return NextResponse.json({ error: 'Namespace and Pod are required' }, { status: 400 });
    }

    const client = new OcClient();

    const isLogin = await client.checkLogin();
    if (!isLogin) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const logs = await client.getPodLogs(namespace, pod, container);
        return NextResponse.json({ logs });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
