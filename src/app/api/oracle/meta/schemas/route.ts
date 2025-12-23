
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

export async function POST(req: NextRequest) {
    let connection: oracledb.Connection | null = null;
    try {
        const body = await req.json();
        const { connection: connConfig } = body;

        if (!connConfig) {
            return NextResponse.json({ error: "Missing connection details" }, { status: 400 });
        }

        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        // Get all schemas that have objects
        const query = `
            SELECT DISTINCT owner 
            FROM all_objects 
            WHERE oracle_maintained = 'N' 
            ORDER BY owner
        `;

        const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const schemas = result.rows?.map((row: any) => row.OWNER) || [];
        return NextResponse.json({ schemas });

    } catch (error: any) {
        console.error("Get Schemas Error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}
