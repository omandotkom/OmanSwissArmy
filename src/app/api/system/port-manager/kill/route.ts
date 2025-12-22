
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
    try {
        const { pid } = await request.json();

        if (!pid) {
            return NextResponse.json({ error: "PID is required" }, { status: 400 });
        }

        // Security check? In a local tool, we assume 'admin' trust.
        // But we should prevent silly things like killing PID 0 or 4 (System).
        if (Number(pid) < 10) {
            return NextResponse.json({ error: "Cannot kill system processes" }, { status: 403 });
        }

        // Force kill
        await execAsync(`taskkill /F /PID ${pid}`);

        return NextResponse.json({ message: `Process ${pid} terminated successfully` });

    } catch (error: any) {
        // If process not found (maybe already closed), taskkill usually throws
        if (error.stderr && error.stderr.includes("not found")) {
            return NextResponse.json({ message: "Process was already closed or not found" });
        }

        console.error("Kill process error:", error);
        return NextResponse.json({ error: error.message || "Failed to kill process" }, { status: 500 });
    }
}
