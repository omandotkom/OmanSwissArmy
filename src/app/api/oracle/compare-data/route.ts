import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

// Helper to fetch all rows
async function fetchAllRows(connConfig: any, sql: string) {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        // Limit to 20000 rows for safety
        const result = await connection.execute(sql, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            maxRows: 20000
        });

        return { rows: result.rows || [], error: null };
    } catch (e: any) {
        return { rows: [], error: e.message };
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) { }
        }
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sourceConn, targetConn, tableName, columns } = body;

        if (!sourceConn || !targetConn || !tableName || !columns || columns.length === 0) {
            return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
        }

        // Construct Query
        // We use TO_CHAR for dates to ensure consistent JSON stringification if needed, 
        // but JS driver usually handles standard types well.
        // For distinct comparison, selecting exact columns is fine.
        const cols = columns.map((c: string) => `"${c}"`).join(', '); // Quote columns to be safe
        const sql = `SELECT ${cols} FROM "${tableName}"`;

        // Parallel Fetch
        const [sourceRes, targetRes] = await Promise.all([
            fetchAllRows(sourceConn, sql),
            fetchAllRows(targetConn, sql)
        ]);

        if (sourceRes.error) return NextResponse.json({ error: `Source Error: ${sourceRes.error}` }, { status: 500 });
        if (targetRes.error) return NextResponse.json({ error: `Target Error: ${targetRes.error}` }, { status: 500 });

        const sourceRows = sourceRes.rows as any[];
        const targetRows = targetRes.rows as any[];

        // Frequency Map for Comparison (Order Independent)
        // Key: JSON String of row
        // Value: { s: countSource, t: countTarget, data: rowObject }
        const map = new Map<string, { s: number, t: number, data: any }>();

        // We need a stable stringify. 
        // Since we select columns in order, object keys in row *should* be ordered? 
        // oracledb OUT_FORMAT_OBJECT returns object with keys matching column names.
        // To be safe, we relying on the driver order or we manually order keys.
        // But since we select explicit columns, we can just iterate columns to build a value array for key.
        const generateKey = (row: any) => {
            return JSON.stringify(columns.map((c: string) => row[c]));
        };

        sourceRows.forEach(row => {
            const key = generateKey(row);
            if (!map.has(key)) map.set(key, { s: 0, t: 0, data: row });
            map.get(key)!.s++;
        });

        targetRows.forEach(row => {
            const key = generateKey(row);
            if (!map.has(key)) map.set(key, { s: 0, t: 0, data: row });
            map.get(key)!.t++;
        });

        // Analyze Diff
        let matchCount = 0;
        let sourceOnlyCount = 0;
        let targetOnlyCount = 0;
        let diffs: any[] = [];

        map.forEach((val, key) => {
            const min = Math.min(val.s, val.t);
            matchCount += min;

            const sExcess = val.s - min;
            const tExcess = val.t - min;

            if (sExcess > 0) {
                sourceOnlyCount += sExcess;
                // Add to diffs (if not too many)
                if (diffs.length < 1000) {
                    diffs.push({ type: 'SOURCE_ONLY', data: val.data, count: sExcess });
                }
            }
            if (tExcess > 0) {
                targetOnlyCount += tExcess;
                if (diffs.length < 1000) {
                    diffs.push({ type: 'TARGET_ONLY', data: val.data, count: tExcess });
                }
            }
        });

        return NextResponse.json({
            status: (sourceOnlyCount === 0 && targetOnlyCount === 0) ? 'MATCH' : 'DIFF',
            stats: {
                sourceTotal: sourceRows.length,
                targetTotal: targetRows.length,
                matchCount,
                sourceOnlyCount,
                targetOnlyCount
            },
            diffs: diffs // First 1000 diffs
        });

    } catch (error: any) {
        console.error("Compare Data Error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
