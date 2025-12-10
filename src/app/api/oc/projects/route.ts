import { NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET() {
    const client = new OcClient();

    try {
        const isLogin = await client.checkLogin();
        if (!isLogin) {
            return NextResponse.json(
                { error: 'Not logged in to OpenShift. Please run "oc login" in your terminal.' },
                { status: 401 }
            );
        }

        const projects = await client.getProjects();
        return NextResponse.json({ projects });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
