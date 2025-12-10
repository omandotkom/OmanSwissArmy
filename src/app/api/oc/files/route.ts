import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const namespace = searchParams.get('namespace');
    const pod = searchParams.get('pod');
    const path = searchParams.get('path') || '/';

    if (!namespace || !pod) {
        return NextResponse.json({ error: 'Namespace and Pod are required' }, { status: 400 });
    }

    const client = new OcClient();

    try {
        const files = await client.listFiles(namespace, pod, path);
        return NextResponse.json({ files });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
