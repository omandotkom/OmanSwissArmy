
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const port = searchParams.get("port");

    if (!port || isNaN(Number(port))) {
        return NextResponse.json({ error: "Invalid port number" }, { status: 400 });
    }

    try {
        // 1. Check if port is in use and get PID
        // netstat -ano output format on Windows:
        //   Proto  Local Address          Foreign Address        State           PID
        //   TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345
        // We look for specifically ":<port> " to avoid matching substring ports (e.g. 3000 matching 30000)
        // But findstr is basic. Regex with findstr is limited.
        // Better command: netstat -ano | findstr ":<port>"

        // Note: findstr might return empty string if not found (exit code 1)
        let netstatOutput = "";
        try {
            const { stdout } = await execAsync(`netstat -ano | findstr ":${port}"`);
            netstatOutput = stdout;
        } catch (e) {
            // If findstr finds nothing, it throws error (exit code 1). This means port is free.
            return NextResponse.json({ status: "free" });
        }

        if (!netstatOutput.trim()) {
            return NextResponse.json({ status: "free" });
        }

        // Parse matches. There might be multiple lines (IPv4, IPv6, etc)
        // We assume the first significant listener is enough.
        const lines = netstatOutput.trim().split("\n");
        const match = lines.find(line => line.includes(`API`) || line.includes(`LISTENING`) || line.includes(`UDP`));
        // If not explicit LISTENING, any entry implies usage.
        const activeLine = match || lines[0];

        // Column extraction
        // Example: "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       21012"
        const parts = activeLine.trim().split(/\s+/);
        // Last part is PID
        const pid = parts[parts.length - 1];
        const protocol = parts[0];

        if (!pid || isNaN(Number(pid))) {
            // Maybe it's a weird state
            return NextResponse.json({ status: "unknown", message: "Could not parse PID" });
        }

        // 2. Get Process Name
        let processName = "Unknown";
        try {
            // tasklist /fi "pid eq 21012" /fo csv /nh
            // Output: "node.exe","21012","Console","0","45,212 K"
            const { stdout: tasklistOut } = await execAsync(`tasklist /fi "pid eq ${pid}" /fo csv /nh`);
            if (tasklistOut.trim()) {
                // Parse CSV - simple split by "," (assuming name doesn't have quotes inside quotes logic needed here? usually safe enough)
                const taskParts = tasklistOut.trim().split('","');
                if (taskParts.length > 0) {
                    processName = taskParts[0].replace(/"/g, "");
                }
            }
        } catch (e) {
            console.error("Tasklist error", e);
        }

        return NextResponse.json({
            status: "busy",
            pid,
            processName,
            protocol
        });

    } catch (error: any) {
        console.error("Check port error:", error);
        return NextResponse.json({ error: error.message || "Failed to check port" }, { status: 500 });
    }
}
