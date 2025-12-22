
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

// Helper to sort comma-separated definitions inside the main (...) of CREATE TABLE
const sortTableContent = (ddl: string) => {
    try {
        // Simple parser to find the main body: (...)
        // CREATE TABLE "OWNER"."NAME" (...) segment_attributes
        const firstParen = ddl.indexOf('(');
        if (firstParen === -1) return ddl;

        // Find balancing closing parenthesis
        let depth = 0;
        let lastParen = -1;
        for (let i = firstParen; i < ddl.length; i++) {
            if (ddl[i] === '(') depth++;
            else if (ddl[i] === ')') depth--;

            if (depth === 0) {
                lastParen = i;
                break;
            }
        }

        if (lastParen === -1) return ddl; // Malformed or weird

        const body = ddl.substring(firstParen + 1, lastParen);
        const pre = ddl.substring(0, firstParen + 1);
        const post = ddl.substring(lastParen);

        // Split body by comma, respecting depth
        const parts: string[] = [];
        let current = '';
        let pDepth = 0;

        for (let i = 0; i < body.length; i++) {
            const char = body[i];
            if (char === '(') pDepth++;
            else if (char === ')') pDepth--;

            if (char === ',' && pDepth === 0) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) parts.push(current.trim());

        // Sort the parts (columns, constraints)
        parts.sort();

        return pre + parts.join(', ') + post;

    } catch (e) {
        return ddl; // Fallback if parsing fails
    }
};

// Helper to normalize DDL (ignore whitespace)
const normalizeDDL = (ddl: string | null, type: string = ''): string => {
    if (!ddl) return '';

    // 1. Remove "SYS_Cxxxx" constraint names (system generated)
    let clean = ddl.replace(/"?SYS_C\w+"?/g, "SYS_C_IGNORED");

    // 1b. Remove "SYS_LOBxxxx" and "SYS_ILxxxx" (LOB Segment & Index names system generated)
    clean = clean.replace(/"?SYS_LOB\d+\$\$?"?/g, "SYS_LOB_IGNORED");
    clean = clean.replace(/"?SYS_IL\d+\$\$?"?/g, "SYS_IL_IGNORED");

    // 2. Remove whitespace/newlines standardization
    clean = clean.replace(/\s+/g, ' ').trim();

    // 3. For TABLES: Sort columns/constraints to ignore order
    if (type === 'TABLE') {
        clean = sortTableContent(clean);
    }

    if (type === 'SEQUENCE') {
        // User Request: Only compare Name (Existence). Ignore all properties.
        return "SEQUENCE_PROPERTIES_IGNORED";
    }

    return clean;
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

// Helper to get Column Metadata
async function getColumnMeta(conn: oracledb.Connection, owner: string, tableName: string, colName: string) {
    try {
        // 0. Sanity Check: Is the table visible?
        const tableCheck = await conn.execute(
            `SELECT OBJECT_NAME FROM ALL_OBJECTS WHERE OWNER = :owner AND OBJECT_NAME = :tableName AND OBJECT_TYPE = 'TABLE'`,
            { owner: owner.toUpperCase(), tableName: tableName.toUpperCase() }
        );
        if ((tableCheck.rows?.length || 0) === 0) {
            return { error: 'TABLE_NOT_FOUND' };
        }

        // 1. Check Column
        const result = await conn.execute(
            `SELECT DATA_TYPE, DATA_LENGTH, CHAR_LENGTH, NULLABLE 
             FROM ALL_TAB_COLUMNS 
             WHERE OWNER = :owner AND TABLE_NAME = :tableName AND COLUMN_NAME = :colName`,
            {
                owner: owner.toUpperCase(),
                tableName: tableName.toUpperCase(),
                colName: colName.toUpperCase()
            },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const row = result.rows?.[0] as any;
        if (!row) {
            return null;
        }
        return row;

    } catch (e: any) {
        console.error("getColumnMeta Error:", e.message);
        return null;
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

        for (const item of items) {
            const { owner, name, type, validationScript } = item;
            let status = 'UNKNOWN';
            let ddl1Raw: string | null = null;
            let ddl2Raw: string | null = null;

            // SPECIAL HANDLING FOR 'COLUMN' TYPE (From Excel 'Column' sheet or 'Column Table')
            if ((type === 'COLUMN' || type === 'COLUMN_TABLE') && validationScript) {
                // Match ADD, MODIFY or RENAME (Single)
                let colName = null;
                let multiCols: string[] = [];

                // 1. Try Single Column Parsing first (Priority)
                // Try Single ADD (no parenthesis logic or simple)
                let match = validationScript.match(/ADD\s+([a-zA-Z0-9_$#]+)/i);
                if (match) colName = match[1];

                if (!colName) {
                    match = validationScript.match(/MODIFY\s+(?:["(])?([a-zA-Z0-9_$#]+)/i);
                    if (match) colName = match[1];
                }

                if (!colName) {
                    match = validationScript.match(/RENAME\s+COLUMN\s+.*\s+TO\s+(?:["(])?([a-zA-Z0-9_$#]+)/i);
                    if (match) colName = match[1];
                }

                // 2. Fallback: Multi-Column Parsing (ADD ( ... ))
                if (!colName) {
                    const multiMatch = validationScript.match(/ADD\s*\(([\s\S]+)\)/i);
                    if (multiMatch) {
                        const content = multiMatch[1];
                        // Split by comma, extract first word of each segment
                        multiCols = content.split(',').map((part: string) => {
                            const trimmed = part.trim();
                            // Take first word
                            const firstWord = trimmed.split(/\s+/)[0];
                            return firstWord.replace(/"/g, '').trim();
                        }).filter((c: string) => c && c.length > 0);
                    }
                }

                if (colName) {
                    colName = colName.replace(/"/g, '').trim();
                }

                if (!colName && multiCols.length === 0) {
                    status = 'ERROR';
                    ddl1Raw = `Could not parse COLUMN name from query: ${validationScript}`;
                }
                else if (multiCols.length > 0) {
                    // MULTI COLUMN VALIDATION
                    let allMatch = true;
                    let anySourceMissing = false;
                    let anyTargetMissing = false;
                    let details = [];

                    for (const col of multiCols) {
                        const meta1 = await getColumnMeta(conn1, owner, name, col);
                        const meta2 = await getColumnMeta(conn2, owner, name, col);

                        let colStatus = 'MATCH';
                        if (!meta1 && !meta2) { colStatus = 'MISSING_BOTH'; allMatch = false; anySourceMissing = true; anyTargetMissing = true; }
                        else if (!meta1) { colStatus = 'MISSING_SOURCE'; allMatch = false; anySourceMissing = true; }
                        else if (!meta2) { colStatus = 'MISSING_TARGET'; allMatch = false; anyTargetMissing = true; }
                        else {
                            const isMatch = meta1.DATA_TYPE === meta2.DATA_TYPE &&
                                meta1.DATA_LENGTH === meta2.DATA_LENGTH &&
                                meta1.NULLABLE === meta2.NULLABLE;
                            if (!isMatch) { colStatus = 'DIFF'; allMatch = false; }
                        }

                        details.push({ col, status: colStatus, m1: meta1, m2: meta2 });
                    }

                    if (allMatch) status = 'MATCH';
                    else if (anySourceMissing && anyTargetMissing && multiCols.length === 1) status = 'MISSING_IN_BOTH'; // Only reasonable for single item effectively
                    else if (anySourceMissing) status = 'MISSING_IN_SOURCE'; // Partial missing is missing
                    else status = 'DIFF';

                    const report = `--- Multi-Column Validation ---\nTable: ${name}\nCols: ${multiCols.join(', ')}\n\n` +
                        details.map(d => `[${d.col}] -> ${d.status}\nSource: ${JSON.stringify(d.m1)}\nTarget: ${JSON.stringify(d.m2)}`).join('\n\n');

                    ddl1Raw = report;
                    ddl2Raw = report;

                }
                else {
                    // SINGLE COLUMN VALIDATION (Existing Logic)
                    const meta1 = await getColumnMeta(conn1, owner, name, colName!); // colName is guaranteed here
                    const meta2 = await getColumnMeta(conn2, owner, name, colName!);

                    // Debug Info included in DDL view
                    const parsedInfo = `--- Parsed Info ---\nColumn: ${colName}\nTable: ${name}\nOwner: ${owner}\nScript: ${validationScript}\n\n`;

                    ddl1Raw = parsedInfo + (meta1 ? JSON.stringify(meta1, null, 2) : "MISSING (Or Table Not Visible)");
                    ddl2Raw = parsedInfo + (meta2 ? JSON.stringify(meta2, null, 2) : "MISSING (Or Table Not Visible)");

                    if (!meta1 && !meta2) status = 'MISSING_IN_BOTH';
                    else if (!meta1) status = 'MISSING_IN_SOURCE';
                    else if (!meta2) status = 'MISSING_IN_TARGET';
                    else {
                        // Compare Metadata
                        const isMatch = meta1.DATA_TYPE === meta2.DATA_TYPE &&
                            meta1.DATA_LENGTH === meta2.DATA_LENGTH &&
                            meta1.NULLABLE === meta2.NULLABLE;
                        status = isMatch ? 'MATCH' : 'DIFF';
                    }
                }
            }
            // STANDARD HANDLING FOR OTHER OBJECTS (Table, Procedure, etc)
            else {
                // Parallel fetch could be faster, but sequential is safer for connection pool/resource limits initially
                ddl1Raw = await getDDL(conn1, owner, type, name);
                ddl2Raw = await getDDL(conn2, owner, type, name);

                if (ddl1Raw === null && ddl2Raw === null) {
                    status = 'MISSING_IN_BOTH';
                } else if (ddl1Raw === null) {
                    status = 'MISSING_IN_SOURCE';
                } else if (ddl2Raw === null) {
                    status = 'MISSING_IN_TARGET';
                } else {
                    const norm1 = normalizeDDL(ddl1Raw, type);
                    const norm2 = normalizeDDL(ddl2Raw, type);

                    if (norm1 === norm2) {
                        status = 'MATCH';
                    } else {
                        status = 'DIFF';
                    }
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
