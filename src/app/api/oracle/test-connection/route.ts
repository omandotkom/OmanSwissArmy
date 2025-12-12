
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

export async function POST(req: NextRequest) {
    let conn: oracledb.Connection | null = null;
    try {
        const body = await req.json();
        const { host, port, serviceName, username, password } = body;

        if (!host || !port || !serviceName || !username || !password) {
            return NextResponse.json({ error: "Missing connection details" }, { status: 400 });
        }

        conn = await oracledb.getConnection({
            user: username,
            password: password,
            connectString: `${host}:${port}/${serviceName}`
        });

        // Optional: Run a lightweight query to be sure
        await conn.execute("SELECT 1 FROM DUAL");

        return NextResponse.json({ success: true, message: "Connection successful!" });

    } catch (error: any) {
        console.error("Test connection failed", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
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
