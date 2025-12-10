import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const project = searchParams.get('project');
    const sc = searchParams.get('sc');

    if (!project || !sc) {
        return NextResponse.json({ error: 'Project and Storage Class are required' }, { status: 400 });
    }

    const client = new OcClient();

    try {
        // Note: We need to ensure the method exists on client.
        // Since we are adding it dynamically, we might need to rely on the implementation being present.
        // Using the new helper method directly.
        const results = await client.findPodsByStorageClassInNamespace(project, sc);
        return NextResponse.json({ results });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
