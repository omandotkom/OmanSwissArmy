import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

export async function POST(req: NextRequest) {
    let connection: oracledb.Connection | null = null;
    try {
        const body = await req.json();
        const { connection: connConfig, tableName } = body;

        if (!connConfig || !tableName) {
            return NextResponse.json({ error: "Missing connection details or table name" }, { status: 400 });
        }

        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        // Query to get columns
        // We use USER_TAB_COLS to get columns for the current user's tables
        // If the user needs to check other schemas, we might need ALL_TAB_COLS and handle schema prefixes,
        // but for now we assume the connection user is the owner or we stick to checking objects relevant to the user.
        // However, if table name typically comes without schema, USER_ is appropriate.
        // If the user selected a table from a list, that list likely came from USER_OBJECTS.

        const query = `
            SELECT column_name, data_type, data_length, nullable
            FROM user_tab_cols
            WHERE table_name = :tableName
            ORDER BY column_id
        `;

        const result = await connection.execute(query, [tableName], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const columns = result.rows?.map((row: any) => ({
            name: row.COLUMN_NAME,
            type: row.DATA_TYPE,
            length: row.DATA_LENGTH,
            nullable: row.NULLABLE
        })) || [];

        return NextResponse.json({ columns });

    } catch (error: any) {
        console.error("Get Columns Error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { console.error("Error closing connection", e); }
        }
    }
}
