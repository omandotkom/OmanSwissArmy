
import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { namespace, pod, path } = body;

        if (!namespace || !pod || !path) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const client = new OcClient();

        // Safety check: Don't allow deleting root or dangerous paths trivially
        if (path === '/' || path === '' || path === '.') {
            return NextResponse.json({ error: 'Cannot delete root directory!' }, { status: 400 });
        }

        // Run 'rm -rf' inside the pod
        console.log(`Deleting file: ${path} in pod ${pod} (${namespace})`);

        // We use 'exec' to run command inside the container
        // Note: This relies on 'rm' being available in the container image.
        await client.runCommand(['exec', '-n', namespace, pod, '--', 'rm', '-rf', path]);

        return NextResponse.json({ success: true, message: `Deleted ${path}` });

    } catch (error: any) {
        console.error('Delete failed:', error);
        return NextResponse.json({ error: error.message || 'Failed to delete file' }, { status: 500 });
    }
}
