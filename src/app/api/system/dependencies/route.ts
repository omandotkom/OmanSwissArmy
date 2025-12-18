import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
    try {
        const cwd = process.cwd();
        const isWindows = process.platform === "win32";

        // Check for OC binary
        // In dev: ./bin/oc.exe
        // In prod: ./bin/oc.exe (copied via build.bat)
        const ocPath = path.join(cwd, "bin", isWindows ? "oc.exe" : "oc");
        const hasOc = fs.existsSync(ocPath);

        // Check for AI models
        // In dev: ./public/models
        // In prod: ./public/models (copied via build.bat)
        const modelsPath = path.join(cwd, "public", "models");
        const hasAi = fs.existsSync(modelsPath) && fs.readdirSync(modelsPath).length > 0;

        return NextResponse.json({
            oc: hasOc,
            ai: hasAi,
        });
    } catch (error) {
        console.error("Error checking dependencies:", error);
        return NextResponse.json(
            { oc: false, ai: false },
            { status: 500 }
        );
    }
}
