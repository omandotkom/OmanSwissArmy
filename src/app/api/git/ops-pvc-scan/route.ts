import { NextResponse } from 'next/server';
import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// Helper to get all files recursively, excluding .git
async function getFiles(dir: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map((entry) => {
        const res = path.resolve(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '.git' || entry.name === 'node_modules') return [];
            return getFiles(res);
        }
        // Filter text files roughly (avoid binary)
        // Simple check: exclude common binary extensions
        const ext = path.extname(entry.name).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.bin', '.exe', '.dll'].includes(ext)) {
            return [];
        }
        return res;
    }));
    return files.flat();
}

export async function POST(request: Request) {
    let tempDir = '';
    try {
        const { repoUrl, branch, oldPvcName, oldStorageClass } = await request.json();

        if (!repoUrl || !oldPvcName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const runId = uuidv4();
        tempDir = path.join(os.tmpdir(), `pvc-migrator-${runId}`);
        await fs.promises.mkdir(tempDir, { recursive: true });

        console.log(`Cloning ${repoUrl} to ${tempDir}...`);

        const git = simpleGit();

        // Clone
        await git.clone(repoUrl, tempDir);

        const repoGit = simpleGit(tempDir);

        // Checkout branch if specified
        if (branch && branch !== 'main' && branch !== 'master') {
            await repoGit.checkout(branch).catch(async () => {
                // If branch doesn't exist locally/remotely, might be an error or fallback to default
                console.warn(`Branch ${branch} not found, staying on default.`);
            });
        }

        // Scan files
        const files = await getFiles(tempDir);
        console.log(`Scanning ${files.length} files in ${tempDir}...`); // DEBUG

        const matches: any[] = [];
        let contextCounter = 0;

        for (const file of files) {
            const content = await fs.promises.readFile(file, 'utf-8');
            const lines = content.split(/\r?\n/);
            const relativePath = path.relative(tempDir, file).replace(/\\/g, '/');

            // Find Anchor (PVC Name)
            for (let i = 0; i < lines.length; i++) {
                // Case Insensitive Check? Or Strict? 
                // PVC names in k8s are lowercase, but let's be safe
                if (lines[i].toLowerCase().includes(oldPvcName.toLowerCase())) {
                    contextCounter++;
                    console.log(`Match found in ${relativePath}:${i + 1}`); // DEBUG

                    // Add PVC Name Match
                    matches.push({
                        file: relativePath,
                        line: i + 1,
                        content: lines[i],
                        type: 'PVC_NAME',
                        contextId: contextCounter
                    });

                    // Search for Storage Class in Vicinity (+- 10 lines)
                    // Logic: If oldStorageClass is provided and distinct
                    if (oldStorageClass) {
                        const start = Math.max(0, i - 15);
                        const end = Math.min(lines.length - 1, i + 15);

                        for (let j = start; j <= end; j++) {
                            // Don't match the same line unless it contains both (rare but possible)
                            // Search for exact storage class string
                            if (lines[j].includes(oldStorageClass)) {
                                // Prevent duplicate matches if multiple anchors share the same line
                                const existing = matches.find(m => m.file === relativePath && m.line === j + 1 && m.type === 'STORAGE_CLASS');
                                if (!existing) {
                                    matches.push({
                                        file: relativePath,
                                        line: j + 1,
                                        content: lines[j],
                                        type: 'STORAGE_CLASS',
                                        contextId: contextCounter
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        console.log(`Scan complete. Found ${matches.length} matches.`); // DEBUG

        // Cleanup (Async in background or await)
        // await fs.promises.rm(tempDir, { recursive: true, force: true }); // DISABLED FOR EDITOR PREVIEW support

        // Convert absolute paths to relative for frontend
        const allFilesRelative = files.map(f => path.relative(tempDir, f).replace(/\\/g, '/'));

        return NextResponse.json({ matches, tempDir, allFiles: allFilesRelative });

    } catch (e: any) {
        // Cleanup on error
        if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => { });
        console.error(e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
