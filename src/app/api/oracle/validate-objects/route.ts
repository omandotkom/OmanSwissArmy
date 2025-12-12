
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

// Helper to normalize DDL (ignore whitespace)
const normalizeDDL = (ddl: string | null): string => {
    if (!ddl) return '';
    // Remove comments? Maybe too risky.
    // Replace all whitespace sequences (newlines, tabs, spaces) with a single space
    return ddl.replace(/\s+/g, ' ').trim();
};

const getTypeForMetadata = (type: string) => {
    // Basic mapping, usually exact match but sometimes needs adjustment
    const map: Record<string, string> = {
        'PACKAGE BODY': 'PACKAGE_BODY',
        // Add others if needed
    };
    return map[type] || type;
};

async function getDDL(conn: oracledb.Connection, owner: string, type: string, name: string): Promise<string | null> {
    try {
        const result = await conn.execute(
            `SELECT DBMS_METADATA.GET_DDL(:type, :name, :owner) FROM DUAL`,
            {
                type: getTypeForMetadata(type),
                name: name,
                owner: owner
            },
            {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
                fetchInfo: { "DBMS_METADATA.GET_DDL(:TYPE,:NAME,:OWNER)": { type: oracledb.STRING } } // Fetch CLOB as String
            }
        );
        const row = result.rows?.[0] as any;
        if (row) {
            // First column
            const vals = Object.values(row);
            return vals[0] as string;
        }
        return null;
    } catch (e: any) {
        console.error(`Error fetching DDL for ${owner}.${name} (${type})`, e.message);
        return null; // Object might not exist
    }
}

export async function POST(req: NextRequest) {
    let conn1: oracledb.Connection | null = null;
    let conn2: oracledb.Connection | null = null;

    try {
        const body = await req.json();
        const { items, env1, env2, fetchDDL } = body;

        if (!items || !env1 || !env2) {
            return NextResponse.json({ error: "Missing items or connection details" }, { status: 400 });
        }

        // Establish Connections
        conn1 = await oracledb.getConnection({
            user: env1.username,
            password: env1.password,
            connectString: `${env1.host}:${env1.port}/${env1.serviceName}`
        });

        conn2 = await oracledb.getConnection({
            user: env2.username,
            password: env2.password,
            connectString: `${env2.host}:${env2.port}/${env2.serviceName}`
        });

        const results = [];

        // Configure DBMS_METADATA (Optional: to reduce noise like SEGMENT ATTRIBUTES)
        // We could run `EXEC DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'SEGMENT_ATTRIBUTES',false);`
        // For now, raw.

        for (const item of items) {
            const { owner, name, type } = item;

            // Parallel fetch could be faster, but sequential is safer for connection pool/resource limits initially
            const ddl1Raw = await getDDL(conn1, owner, type, name);
            const ddl2Raw = await getDDL(conn2, owner, type, name);

            let status = 'UNKNOWN';
            let message = '';

            if (ddl1Raw === null && ddl2Raw === null) {
                status = 'MISSING_IN_BOTH';
            } else if (ddl1Raw === null) {
                status = 'MISSING_IN_SOURCE';
            } else if (ddl2Raw === null) {
                status = 'MISSING_IN_TARGET';
            } else {
                const norm1 = normalizeDDL(ddl1Raw);
                const norm2 = normalizeDDL(ddl2Raw);

                if (norm1 === norm2) {
                    status = 'MATCH';
                } else {
                    status = 'DIFF';
                    // We could return diffs here, but full DDL might be large.
                    // Just return flag for now.
                }
            }

            results.push({
                item,
                status,
                ddl1: fetchDDL ? ddl1Raw : undefined,
                ddl2: fetchDDL ? ddl2Raw : undefined
            });
        }

        return NextResponse.json({ results });

    } catch (error: any) {
        console.error("Validation error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        if (conn1) {
            try {
                await conn1.close();
            } catch (e) {
                console.error("Error closing conn1", e);
            }
        }
        if (conn2) {
            try {
                await conn2.close();
            } catch (e) {
                console.error("Error closing conn2", e);
            }
        }
    }
}
