import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    try {
        const { tempDir, relativePath } = await request.json();

        if (!tempDir || !relativePath) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        // Security Check: prevent directory traversal
        const fullPath = path.resolve(tempDir, relativePath);
        if (!fullPath.startsWith(path.resolve(tempDir))) {
            return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
        }

        if (!fs.existsSync(fullPath)) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

        const content = await fs.promises.readFile(fullPath, 'utf-8');
        return NextResponse.json({ content });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
