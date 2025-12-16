
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

export async function POST(req: NextRequest) {
    let connection: oracledb.Connection | null = null;

    try {
        const body = await req.json();
        const { connection: connConfig, owner } = body;

        if (!connConfig) {
            return NextResponse.json({ error: "Missing connection details" }, { status: 400 });
        }

        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        // Query to list objects
        // If owner is specified and different from login user, we try accessing ALL_OBJECTS
        // Otherwise USER_OBJECTS is safer.

        // Supported types for code backup
        const types = [
            'PACKAGE', 'PACKAGE BODY',
            'PROCEDURE', 'FUNCTION',
            'TRIGGER', 'VIEW',
            'TYPE', 'TYPE BODY',
            'TABLE' // For Table, GET_DDL returns CREATE statement
        ];

        const typesInClause = types.map(t => `'${t}'`).join(',');

        let query = '';
        const params: any = {};

        // Simplest approach: Backup USER's objects (Schema = Login User)
        query = `
            SELECT object_name, object_type, status 
            FROM user_objects 
            WHERE object_type IN (${typesInClause})
            ORDER BY object_type, object_name
        `;

        const result = await connection.execute(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const objects = result.rows?.map((row: any) => ({
            name: row.OBJECT_NAME,
            type: row.OBJECT_TYPE,
            status: row.STATUS
        })) || [];

        return NextResponse.json({ objects });

    } catch (error: any) {
        console.error("List Objects Error", error);
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
