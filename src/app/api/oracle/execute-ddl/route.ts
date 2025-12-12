
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

export async function POST(req: NextRequest) {
    let conn: oracledb.Connection | null = null;
    try {
        const body = await req.json();
        const { targetEnv, ddl, objectType } = body;

        if (!targetEnv || !ddl) {
            return NextResponse.json({ error: "Missing target connection or DDL" }, { status: 400 });
        }

        conn = await oracledb.getConnection({
            user: targetEnv.username,
            password: targetEnv.password,
            connectString: `${targetEnv.host}:${targetEnv.port}/${targetEnv.serviceName}`
        });

        // Basic safety check for PL/SQL vs Table
        // For View, Procedure, Function, Package, Package Body, Trigger, Type, Type Body:
        // We usually want "CREATE OR REPLACE".
        // If the DDL starts with "CREATE " and NOT "CREATE OR REPLACE", we might want to inject "OR REPLACE".
        // HOWEVER, user requested "text must be exactly the same".
        // So we will try to execute AS IS first.

        // But if it fails with "Name already used", we can't do much without altering the DDL.
        // Let's rely on the user understanding Oracle DDLs for now, OR simplistic replacement if it fails?
        // No, user requirement: "pastikan tidak ada teks yang hilang... teks harus benar-benar sama".
        // This implies we trust the DDL source.

        // One common issue: GET_DDL output might have a trailing slash or missing semicolon depending on settings.
        // Usually oracledb.execute expects a single statement without trailing slash '/' for PL/SQL?
        // Actually for PL/SQL blocks, it executes fine.

        // Let's try executing.
        await conn.execute(ddl);

        return NextResponse.json({ success: true, message: "Object compiled successfully." });

    } catch (error: any) {
        console.error("Execution failed", error);
        // Provide detailed error
        return NextResponse.json({ error: error.message || "Execution failed", details: error.offset ? `At offset ${error.offset}` : undefined }, { status: 500 });
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (e) {
                console.error("Error closing connection", e);
            }
        }
    }
}
