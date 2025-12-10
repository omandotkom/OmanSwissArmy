import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const namespace = searchParams.get('namespace');
    const pod = searchParams.get('pod');
    const path = searchParams.get('path');

    if (!namespace || !pod || !path) {
        return NextResponse.json({ error: 'Namespace, Pod, and Path are required' }, { status: 400 });
    }

    const client = new OcClient();

    try {
        const isDownload = searchParams.get('download') === 'true';

        // Jika download, gunakan binary buffer
        // Jika preview text, bisa gunakan string biasa, tapi binary buffer aman untuk keduanya.
        const contentBuffer = await client.readFileBinary(namespace, pod, path);

        // Tentukan filename dari path
        const filename = path.split('/').pop() || 'downloaded-file';

        const headers: any = {};

        if (isDownload) {
            headers['Content-Disposition'] = `attachment; filename="${filename}"`;
            headers['Content-Type'] = 'application/octet-stream';
        } else {
            headers['Content-Type'] = 'text/plain; charset=utf-8';
        }

        return new NextResponse(new Uint8Array(contentBuffer), { headers });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
