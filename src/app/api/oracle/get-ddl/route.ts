
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

const getTypeForMetadata = (type: string) => {
    const map: Record<string, string> = {
        'PACKAGE BODY': 'PACKAGE_BODY',
        'TYPE BODY': 'TYPE_BODY',
        // Add others if needed
    };
    return map[type] || type;
};

export async function POST(req: NextRequest) {
    let connection: oracledb.Connection | null = null;

    try {
        const body = await req.json();
        const { connection: connConfig, owner, name, type } = body;

        if (!connConfig || !owner || !name || !type) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        // Configure DBMS_METADATA for clean output
        // SQLTERMINATOR: Adds ';' at end of statements
        await connection.execute(`
            BEGIN 
                DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR', TRUE);
                DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'SEGMENT_ATTRIBUTES', FALSE);
                DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'STORAGE', FALSE);
                DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM, 'TABLESPACE', FALSE);
            END;
        `);

        // Fetch DDL
        const result = await connection.execute(
            `SELECT DBMS_METADATA.GET_DDL(:type, :name, :owner) as DDL FROM DUAL`,
            {
                type: getTypeForMetadata(type),
                name: name,
                owner: owner
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
                fetchInfo: { "DDL": { type: oracledb.STRING } }
            }
        );

        const row = result.rows?.[0] as any;
        let ddl = "";

        if (row && row.DDL) {
            ddl = row.DDL;
        } else {
            // Fallback: Sometimes GET_DDL fails or returns empty if object is weird.
            // But usually it throws error if not found.
            throw new Error("Object not found or DDL empty");
        }

        return NextResponse.json({ ddl });

    } catch (error: any) {
        console.error(`Get DDL Error`, error);
        // Clean error message
        let msg = error.message;
        if (msg.includes('ORA-31603')) msg = "Object not found (ORA-31603)";
        return NextResponse.json({ error: msg }, { status: 500 });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (e) {
                console.error("Error closing connection", e);
            }
        }
    }
}
