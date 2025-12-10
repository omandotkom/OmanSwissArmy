import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const sc = searchParams.get('sc');

    if (!sc) {
        return NextResponse.json({ error: 'Storage Class (sc) is required' }, { status: 400 });
    }

    const client = new OcClient();

    try {
        const results = await client.findPodsByStorageClass(sc);
        return NextResponse.json({ results });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
