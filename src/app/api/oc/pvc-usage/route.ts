
import { NextRequest, NextResponse } from 'next/server';
import { OcClient } from '@/lib/oc-helper';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { namespace, podName, mountPath } = body;

        if (!namespace || !podName || !mountPath) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const client = new OcClient();

        // Command: df -h [mountPath]
        // Output example:
        // Filesystem      Size  Used Avail Use% Mounted on
        // /dev/sda1        10G  2.5G  7.5G  25% /data

        // We use -P for POSIX portability (single line output)
        const cmd = ['exec', podName, '-n', namespace, '--', 'df', '-hP', mountPath];

        const output = await client.runCommand(cmd);
        const lines = output.trim().split('\n');

        if (lines.length < 2) {
            return NextResponse.json({ error: 'Command failed or no output' });
        }

        // Parse the second line
        const dataLine = lines[1];
        // Split by whitespace
        const parts = dataLine.split(/\s+/);

        if (parts.length < 5) {
            return NextResponse.json({ error: 'Invalid df output format' });
        }

        // Standard df -hP output columns:
        // Filesystem, Size, Used, Avail, Capacity, Mounted on
        const size = parts[1];
        const used = parts[2];
        const avail = parts[3];
        const capacity = parts[4]; // Percentage

        return NextResponse.json({
            usage: {
                size,
                used,
                avail,
                percentage: capacity
            }
        });

    } catch (error: any) {
        // If exec fails (e.g. pod not running, no df command), return default
        console.warn("Usage fetch failed:", error.message);
        return NextResponse.json({
            usage: null,
            error: error.message
        });
    }
}
