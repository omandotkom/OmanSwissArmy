
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';

const execPromise = util.promisify(exec);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sourceBranch, targetBranch, repoPath: inputRepoPath } = body;
        const repoPath = inputRepoPath || process.cwd();

        if (!sourceBranch || !targetBranch) {
            return NextResponse.json({ error: 'Source and Target branches are required' }, { status: 400 });
        }

        if (!fs.existsSync(repoPath)) {
            return NextResponse.json({ error: 'Repository path not found' }, { status: 404 });
        }

        // Fetch latest data to ensure we are comparing actual states (optional, can be slow)
        // await execPromise('git fetch origin', { cwd: repoPath });

        // Run merge-tree
        // Syntax: git merge-tree --write-tree <branch1> <branch2>
        // We simulate merging sourceBranch INTO targetBranch.
        // The order for merge-tree is git merge-tree --write-tree <root-branch> <merge-branch>
        const command = `git merge-tree --write-tree ${targetBranch} ${sourceBranch}`;

        try {
            const { stdout } = await execPromise(command, { cwd: repoPath });
            // If it succeeds with exit code 0, it means Clean Merge (usually).
            // But wait, merge-tree --write-tree can exit with 0 even if there are conflicts in some versions?
            // Actually, docs say: "The exit status is 0 if the merge was successful, and non-zero if there were conflicts."

            // However, we should also parse the output.
            // Output format:
            // <OID>
            // <Conflict Info...>

            const lines = stdout.split('\n');
            const treeOid = lines[0];

            // Check for conflict markers in the output involves looking for 'conflicted'
            // But relying on exit code is safer if the git version supports it.
            // Let's assume it's clean if we are here, but let's double check content just in case.

            return NextResponse.json({
                hasConflicts: false,
                conflictingFiles: [],
                output: stdout,
                message: 'Clean merge. No conflicts detected.'
            });

        } catch (error: any) {
            // Exit code non-zero usually means conflicts
            const stdout = error.stdout || '';

            // Parse conflicting files
            // Pattern often looks like:
            // changed in both
            //   base   100644 ... file.txt
            //   our    100644 ... file.txt
            //   their  100644 ... file.txt
            // Or easier: check valid "Conflict" sections if available.
            // Modern merge-tree output might just list files.

            // Let's try to grab file names.
            // A simple heuristic: look for file paths in the output text.
            // Unfortunately, the raw output is a bit verbose.
            // "CONFLICT (content): Merge conflict in <filename>"

            const conflictLines = stdout.split('\n').filter((line: string) => line.includes('CONFLICT'));
            const conflictingFiles = conflictLines.map((line: string) => {
                // Example: "CONFLICT (content): Merge conflict in src/app/page.tsx"
                const match = line.match(/in (.+)$/);
                return match ? match[1] : line;
            });

            // Deduplicate
            const uniqueFiles = Array.from(new Set(conflictingFiles)) as string[];

            // Deep Scan for Content
            let detailedConflicts: Array<{ file: string; content: string }> = [];
            try {
                // Get common ancestor
                const { stdout: baseOut } = await execPromise(`git merge-base ${targetBranch} ${sourceBranch}`, { cwd: repoPath });
                const baseSha = baseOut.trim();

                if (baseSha) {
                    // Run legacy merge-tree to get full diffs
                    // Limit buffer to avoid crashing on huge diffs
                    const { stdout: diffOut } = await execPromise(`git merge-tree ${baseSha} ${targetBranch} ${sourceBranch}`, {
                        cwd: repoPath,
                        maxBuffer: 10 * 1024 * 1024
                    });

                    // Parse simple blocks based on "changed in both"
                    // This is a naive parser but effective for standard output
                    const fileBlocks = diffOut.split(/^changed in both/gm);

                    fileBlocks.forEach(block => {
                        if (!block.trim()) return;

                        // Check which file this block belongs to
                        // The block starts with lines like:
                        //   base   100644 ... filename
                        //   our    ...
                        //   their  ...

                        const lines = block.split('\n');
                        const filenameLine = lines.find(l => l.trim().match(/^[a-z]+\s+\d{6}\s+[a-f0-9]+\s+(.+)$/));

                        if (filenameLine) {
                            const match = filenameLine.trim().match(/^[a-z]+\s+\d{6}\s+[a-f0-9]+\s+(.+)$/);
                            const filename = match ? match[1] : null;

                            if (filename && uniqueFiles.includes(filename) && block.includes('<<<<<<<')) {
                                // This is a conflict block for one of our files
                                detailedConflicts.push({
                                    file: filename,
                                    content: "changed in both" + block // Restore header for context if needed, or just block
                                });
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Deep scan error", e);
            }

            return NextResponse.json({
                hasConflicts: true,
                conflictingFiles: uniqueFiles,
                detailedConflicts: detailedConflicts,
                output: stdout,
                message: 'Conflicts detected.'
            });
        }

    } catch (error: any) {
        console.error('Error simulating merge:', error);
        return NextResponse.json({
            error: 'Failed to simulate merge.',
            details: error.message
        }, { status: 500 });
    }
}
