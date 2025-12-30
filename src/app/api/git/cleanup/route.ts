import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const { tempDir } = await request.json();

        if (!tempDir) {
            return NextResponse.json({ error: 'Missing tempDir' }, { status: 400 });
        }

        // Security: Ensure we only delete from temp dir
        // Check if path contains 'pvc-migrator-scan-' to avoid deleting random things
        if (!tempDir.includes('pvc-migrator-scan-')) {
            return NextResponse.json({ error: 'Invalid temp directory' }, { status: 403 });
        }

        if (fs.existsSync(tempDir)) {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
