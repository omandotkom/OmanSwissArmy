import { NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace');
    const name = searchParams.get('name');

    if (!namespace || !name) {
        return NextResponse.json({ error: 'Namespace and Name are required' }, { status: 400 });
    }

    const client = new OcClient();

    const isLogin = await client.checkLogin();
    if (!isLogin) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const details = await client.getPipelineRunDetails(namespace, name);
        return NextResponse.json({ details });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
