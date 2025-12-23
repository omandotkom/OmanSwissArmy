
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

export async function POST(req: NextRequest) {
    let connection: oracledb.Connection | null = null;
    try {
        const body = await req.json();
        const { connection: connConfig, owner } = body;

        if (!connConfig || !owner) {
            return NextResponse.json({ error: "Missing connection or owner" }, { status: 400 });
        }

        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        // Get objects for specific owner
        const query = `
            SELECT object_name, object_type 
            FROM all_objects 
            WHERE owner = :owner 
            AND object_type IN ('TABLE','VIEW','PACKAGE','PACKAGE BODY','PROCEDURE','FUNCTION','TRIGGER','SEQUENCE','TYPE','TYPE BODY')
            ORDER BY object_name
        `;

        const result = await connection.execute(query, { owner }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const objects = result.rows?.map((row: any) => ({
            name: row.OBJECT_NAME,
            type: row.OBJECT_TYPE
        })) || [];

        return NextResponse.json({ objects });

    } catch (error: any) {
        console.error("Get Objects Error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}
