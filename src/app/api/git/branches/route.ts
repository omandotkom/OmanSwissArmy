
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';

const execPromise = util.promisify(exec);

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const repoPath = searchParams.get('path') || process.cwd();

    if (!fs.existsSync(repoPath)) {
        return NextResponse.json({ error: 'Repository path not found' }, { status: 404 });
    }

    try {
        // Get all branches (local and remote)
        // using -a for all
        const { stdout: branchOutput } = await execPromise('git branch -a --format="%(refname:short)"', { cwd: repoPath });

        const branches = branchOutput
            .split('\n')
            .map(b => b.trim())
            .filter(b => b.length > 0)
            .filter(b => !b.includes('HEAD ->')); // Filter out HEAD pointers

        // Deduplicate branches and sort
        const uniqueBranches = Array.from(new Set(branches)).sort();

        return NextResponse.json({ branches: uniqueBranches });
    } catch (error: any) {
        console.error('Error fetching branches:', error);
        return NextResponse.json({
            error: 'Failed to fetch branches. Ensure the path is a valid git repository.',
            details: error.message
        }, { status: 500 });
    }
}
