
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

export async function POST(req: NextRequest) {
    let connection: oracledb.Connection | null = null;

    try {
        const body = await req.json();
        const { connection: connConfig, owners } = body;

        if (!connConfig) {
            return NextResponse.json({ error: "Missing connection details" }, { status: 400 });
        }

        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        let query = '';
        let params: any[] = [];

        // If owners are provided, filter by them. Otherwise, default to USER's objects? 
        // Or if empty, maybe fetch everything? (Dangerous).
        // Let's assume if owners is empty, we return empty or just user schemas.
        // Actually the excel parser should provide owners. 

        let whereClause = "1=1";
        if (owners && owners.length > 0) {
            // Create bind variables for owners
            const bindVars = owners.map((_: any, i: number) => `:o${i}`);
            whereClause = `owner IN (${bindVars.join(',')})`;
            params = owners;
        } else {
            // Default to current user if no owners specified?
            // Or maybe return error?
            // Let's default to creating user's objects for safety.
            whereClause = `owner = USER`;
        }

        const excludedTypes = [
            'LOB', 'LOB PARTITION', 'INDEX', 'INDEX PARTITION', 'TABLE PARTITION', 'SEQUENCE'
            // Add more noise types if needed
        ];
        const excludedTypesClause = excludedTypes.map(t => `'${t}'`).join(',');

        query = `
            SELECT owner, object_name, object_type, last_ddl_time, status
            FROM all_objects
            WHERE ${whereClause}
            AND object_type NOT IN (${excludedTypesClause})
            AND object_name NOT LIKE 'BIN$%'
            ORDER BY owner, object_type, object_name
        `;

        const result = await connection.execute(query, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const objects = result.rows?.map((row: any) => ({
            owner: row.OWNER,
            name: row.OBJECT_NAME,
            type: row.OBJECT_TYPE,
            last_ddl_time: row.LAST_DDL_TIME,
            status: row.STATUS
        })) || [];

        return NextResponse.json({ objects });

    } catch (error: any) {
        console.error("Analyze Objects Error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
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
