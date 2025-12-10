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
        const pods = await client.getPods(namespace);
        return NextResponse.json({ pods });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
