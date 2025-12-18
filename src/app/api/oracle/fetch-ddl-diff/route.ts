
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

// Helper to get DDL (reuse logic)
const getDDL = async (conn: any, type: string, name: string, owner: string) => {
    try {
        const cleanType = type.replace(/\s+/g, '_');
        const result = await conn.execute(
            `SELECT DBMS_METADATA.GET_DDL(:type, :name, :owner) FROM DUAL`,
            [cleanType, name, owner],
            { fetchInfo: { "DBMS_METADATA.GET_DDL(:TYPE,:NAME,:OWNER)": { type: oracledb.STRING } } }
        );
        return result.rows && result.rows[0] ? String(result.rows[0][0]) : "";
    } catch (e: any) {
        // If object doesn't exist or other error
        if (e.message.includes("ORA-31603")) return null; // Object not found
        return `-- Failed to fetch DDL: ${e.message}`;
    }
};

const getGrants = async (conn: any, owner: string, name: string) => {
    try {
        const result = await conn.execute(
            `SELECT DBMS_METADATA.GET_DEPENDENT_DDL('OBJECT_GRANT', :name, :owner) FROM DUAL`,
            [name, owner],
            { fetchInfo: { "DBMS_METADATA.GET_DEPENDENT_DDL('OBJECT_GRANT',:NAME,:OWNER)": { type: oracledb.STRING } } }
        );
        return result.rows && result.rows[0] ? String(result.rows[0][0]) : "-- No specific grants found";
    } catch (e: any) {
        return "-- No grants found or access denied";
    }
};

// Smart Table Altering Logic
const generateSmartTableAlter = async (masterConn: any, slaveConn: any, owner: string, name: string) => {
    const fetchColumns = async (conn: any) => {
        const sql = `
            SELECT column_name, data_type, data_length, data_precision, data_scale, nullable
            FROM all_tab_columns
            WHERE owner = :owner AND table_name = :name
            ORDER BY column_name
        `;
        const result = await conn.execute(sql, [owner, name], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return result.rows || [];
    };

    try {
        const [masterCols, slaveCols] = await Promise.all([
            fetchColumns(masterConn),
            fetchColumns(slaveConn)
        ]);

        if (!masterCols.length || !slaveCols.length) return "-- Unable to analyze table structure for smart altering.";

        const buffer: string[] = [];
        const slaveColMap = new Map(slaveCols.map((c: any) => [c.COLUMN_NAME, c]));
        const masterColMap = new Map(masterCols.map((c: any) => [c.COLUMN_NAME, c]));

        // 1. Detect New Columns (In Slave, Not in Master)
        const newCols: string[] = [];
        slaveCols.forEach((sc: any) => {
            if (!masterColMap.has(sc.COLUMN_NAME)) {
                let type = sc.DATA_TYPE;
                if (type.includes('CHAR')) type += `(${sc.DATA_LENGTH})`;
                else if (type === 'NUMBER' && sc.DATA_PRECISION) {
                    type += `(${sc.DATA_PRECISION}${sc.DATA_SCALE ? ',' + sc.DATA_SCALE : ''})`;
                }
                newCols.push(`${sc.COLUMN_NAME} ${type} ${sc.NULLABLE === 'N' ? 'NOT NULL' : ''}`);
            }
        });

        if (newCols.length > 0) {
            buffer.push(`-- [SAFE] Adding New Columns`);
            buffer.push(`ALTER TABLE "${owner}"."${name}" ADD (${newCols.join(', ')});`);
        }

        // 2. Detect Modified Columns
        const modCols: string[] = [];
        const warnings: string[] = [];
        slaveCols.forEach((sc: any) => {
            const mc: any = masterColMap.get(sc.COLUMN_NAME);
            if (mc) {
                let changed = false;
                let potentialDataLoss = false;

                // Simple type check
                if (mc.DATA_TYPE !== sc.DATA_TYPE) {
                    changed = true;
                    potentialDataLoss = true; // Changing type is dangerous
                }
                if (mc.DATA_LENGTH < sc.DATA_LENGTH && mc.DATA_TYPE === sc.DATA_TYPE) {
                    changed = true; // Expanding is safe
                }
                if (mc.DATA_LENGTH > sc.DATA_LENGTH && mc.DATA_TYPE === sc.DATA_TYPE) {
                    changed = true;
                    potentialDataLoss = true; // Shrinking is dangerous
                }
                if (mc.NULLABLE !== sc.NULLABLE) {
                    changed = true;
                    // Making nullable is safe. Making NOT NULL checks data.
                    if (sc.NULLABLE === 'N' && mc.NULLABLE === 'Y') potentialDataLoss = true;
                }

                if (changed) {
                    let type = sc.DATA_TYPE;
                    if (type.includes('CHAR')) type += `(${sc.DATA_LENGTH})`;
                    else if (type === 'NUMBER' && sc.DATA_PRECISION) {
                        type += `(${sc.DATA_PRECISION}${sc.DATA_SCALE ? ',' + sc.DATA_SCALE : ''})`;
                    }

                    if (potentialDataLoss) {
                        warnings.push(`-- [WARN] Column ${sc.COLUMN_NAME} change (${mc.DATA_TYPE}(${mc.DATA_LENGTH}) -> ${sc.DATA_TYPE}(${sc.DATA_LENGTH})) might cause data loss!`);
                    } else {
                        modCols.push(`${sc.COLUMN_NAME} ${type} ${sc.NULLABLE === 'N' ? 'NOT NULL' : ''}`);
                    }
                }
            }
        });

        if (warnings.length > 0) {
            buffer.push(`\n-- MANUAL REVIEW REQUIRED FOR MODIFICATIONS:`);
            buffer.push(warnings.join('\n'));
        }

        if (modCols.length > 0) {
            buffer.push(`\n-- [SAFE] Modifying Columns`);
            buffer.push(`ALTER TABLE "${owner}"."${name}" MODIFY (${modCols.join(', ')});`);
        }

        // 3. Detect Dropped Columns (In Master, Not in Slave) -> Dangerous!
        const droppedCols: string[] = [];
        masterCols.forEach((mc: any) => {
            if (!slaveColMap.has(mc.COLUMN_NAME)) {
                droppedCols.push(mc.COLUMN_NAME);
            }
        });

        if (droppedCols.length > 0) {
            buffer.push(`\n-- [DANGER] DESTRUCTIVE CHANGES DETECTED`);
            droppedCols.forEach(col => {
                buffer.push(`-- ALTER TABLE "${owner}"."${name}" DROP COLUMN "${col}"; -- COMMENTED OUT FOR SAFETY`);
            });
        }

        if (buffer.length === 0) return "-- Structure appears identical (or changes handled by indexes/constraints). Check constraints manually.";
        return buffer.join('\n');

    } catch (e: any) {
        return `-- Smart Alter Failed: ${e.message}`;
    }
};

const setupDeepCompare = async (conn: any) => {
    try {
        await conn.execute(`BEGIN 
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'SEGMENT_ATTRIBUTES',false);
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'SQLTERMINATOR',true);
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'STORAGE',false);
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'TABLESPACE',false);
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'CONSTRAINTS',true);
            DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'REF_CONSTRAINTS',true);
        END;`);
    } catch (e) {
        console.error("Failed to setup metadata transform", e);
    }
};

export async function POST(req: NextRequest) {
    let masterConn = null;
    let slaveConn = null;

    try {
        const body = await req.json();
        const { master, slave, object } = body;
        // object = { owner, name, type }

        if (!object || !object.owner || !object.name || !object.type) {
            return NextResponse.json({ error: "Missing object details" }, { status: 400 });
        }

        const response: any = { masterDDL: '', slaveDDL: '', patchScript: '' };

        // Connect
        if (master) {
            masterConn = await oracledb.getConnection({
                user: master.username,
                password: master.password,
                connectString: `${master.host}:${master.port}/${master.serviceName}`
            });
            await setupDeepCompare(masterConn);
        }
        if (slave) {
            slaveConn = await oracledb.getConnection({
                user: slave.username,
                password: slave.password,
                connectString: `${slave.host}:${slave.port}/${slave.serviceName}`
            });
            await setupDeepCompare(slaveConn);
        }

        // Fetch DDLs
        if (masterConn) response.masterDDL = await getDDL(masterConn, object.type, object.name, object.owner);
        else response.masterDDL = '-- No Master Connection';

        if (slaveConn) {
            response.slaveDDL = await getDDL(slaveConn, object.type, object.name, object.owner);
            if (response.slaveDDL && object.type === 'TABLE') {
                const grants = await getGrants(slaveConn, object.owner, object.name);
                response.slaveDDL += `\n\n${grants}`;
            }
        }
        else response.slaveDDL = '-- No Slave Connection';

        // Auto Generate Patch Logic (Slave -> Master)
        if (!slaveConn) {
            response.patchScript = "-- Cannot generate patch: No Slave (Source) connection.";
        } else if (!response.slaveDDL) {
            response.patchScript = `-- Object ${object.name} not found in Slave. Drop in Master?\nDROP ${object.type} "${object.owner}"."${object.name}";`;
        } else {
            // Case 1: Object missing in Master
            if (!response.masterDDL) {
                response.patchScript = `-- New Object Patch (Create in Master)\n${response.slaveDDL}`;
            }
            // Case 2: Objects exist in both -> Diff Patch
            else {
                if (object.type === 'TABLE' && masterConn) {
                    response.patchScript = await generateSmartTableAlter(masterConn, slaveConn, object.owner, object.name);
                } else {
                    response.patchScript = `-- CREATE OR REPLACE Logic for ${object.type}\n${response.slaveDDL}`;
                }
            }
        }

        return NextResponse.json(response);

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        if (masterConn) await masterConn.close();
        if (slaveConn) await slaveConn.close();
    }
}
