import { NextResponse } from 'next/server';
import simpleGit from 'simple-git';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
    let tempDir = '';
    try {
        const { repoUrl, baseBranch, fixes, message, newBranchName, authorName, authorEmail, branchMode } = await request.json();

        if (!repoUrl || !fixes || fixes.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const runId = uuidv4();
        tempDir = path.join(os.tmpdir(), `pvc-migrator-push-${runId}`);
        await fs.promises.mkdir(tempDir, { recursive: true });

        console.log(`Cloning ${repoUrl}...`);
        const git = simpleGit();
        await git.clone(repoUrl, tempDir);

        const repoGit = simpleGit(tempDir);

        // Configure Git Identity
        const userName = authorName || 'Oman Swiss Army Bot';
        const userEmail = authorEmail || 'bot@omansmissarmy.tool';

        await repoGit.addConfig('user.name', userName);
        await repoGit.addConfig('user.email', userEmail);

        // Checkout & Branch Strategy
        const newBranch = newBranchName || `migrate-pvc-${Date.now()}`;

        if (branchMode === 'existing') {
            console.log(`Using existing branch: ${newBranch}`);
            // Mode: Existing Branch
            await repoGit.fetch(['--all']);
            try {
                // Checkout specific branch. 
                await repoGit.checkout(newBranch);
                await repoGit.pull();
            } catch (e: any) {
                console.warn('Checkout failed, trying to create track from origin...', e.message);
                try {
                    // Try checkout with tracking
                    await repoGit.checkout(['-b', newBranch, `origin/${newBranch}`]);
                } catch (e2) {
                    // Fallback: Branch doesn't exist in remote. Create it as new.
                    console.warn(`Branch ${newBranch} not found in remote. Creating new from base...`);
                    const originBranch = baseBranch || 'main';
                    try {
                        await repoGit.checkout(originBranch);
                        await repoGit.pull();
                    } catch (ex) {
                        if (!baseBranch) await repoGit.checkout('master').catch(() => { });
                    }
                    await repoGit.checkoutLocalBranch(newBranch);
                }
            }
        } else {
            // Mode: New Branch (Default)
            const originBranch = baseBranch || 'main';
            try {
                await repoGit.checkout(originBranch);
                await repoGit.pull();
            } catch (e) {
                if (!baseBranch) await repoGit.checkout('master').catch(() => { });
            }

            await repoGit.checkoutLocalBranch(newBranch);
        }

        // Apply Fixes
        // Group by file to read/write once per file
        const fixesByFile: Record<string, any[]> = {};
        for (const fix of fixes) {
            if (!fixesByFile[fix.file]) fixesByFile[fix.file] = [];
            fixesByFile[fix.file].push(fix);
        }

        for (const relPath of Object.keys(fixesByFile)) {
            const filePath = path.join(tempDir, relPath);
            if (!fs.existsSync(filePath)) {
                console.warn(`File not found: ${filePath}, skipping fixes.`);
                continue;
            }

            let content = await fs.promises.readFile(filePath, 'utf-8');
            let lines = content.split(/\r?\n/);

            const fileFixes = fixesByFile[relPath];
            let modified = false;

            for (const fix of fileFixes) {
                const lineIdx = fix.line - 1;
                if (lineIdx < 0 || lineIdx >= lines.length) continue;

                // Safety Check: Verify line still matches somewhat (at least contains the old text)
                // If the user provided 'originalContent', use it to verify? 
                // Let's just trust the passed 'newLineContent' which should be the FULL line.

                if (fix.newContent) {
                    lines[lineIdx] = fix.newContent;
                    modified = true;
                }
            }

            if (modified) {
                // Reassemble
                // Detect line ending? defaulting to \n
                await fs.promises.writeFile(filePath, lines.join('\n'), 'utf-8');
            }
        }

        // Commit & Push
        await repoGit.add('.');

        // Check if anything changed
        const status = await repoGit.status();
        if (status.files.length === 0) {
            return NextResponse.json({ error: 'No changes detected after processing. Maybe files were already updated?' }, { status: 400 });
        }

        await repoGit.commit(message || `chore: update PVC configuration`);
        await repoGit.push('origin', newBranch);

        // Cleanup
        await fs.promises.rm(tempDir, { recursive: true, force: true });

        return NextResponse.json({
            success: true,
            branch: newBranch,
            message: `Successfully pushed branch ${newBranch}`
        });

    } catch (e: any) {
        if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => { });
        console.error(e);
        return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
    }
}
