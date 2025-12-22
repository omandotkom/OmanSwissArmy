
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';
import { normalizeDDL } from '@/lib/oracle-ddl-helper';

// Reuse Global Job Store
declare global {
    var jobStore: Record<string, any>;
}
if (!global.jobStore) global.jobStore = {};

const TEMP_DIR = path.join(process.cwd(), 'temp_jobs');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { ownerMappings } = body;

        // Generate Job ID
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const jobId = `twoway_${timestamp}_${Math.random().toString(36).substr(2, 5)}`;

        // Create job directory
        const jobDir = path.join(TEMP_DIR, jobId);
        if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

        // Initialize Job
        global.jobStore[jobId] = {
            id: jobId,
            status: 'STARTING',
            progress: 0,
            total: 0, // Will be updated as we discover objects
            logs: [],
            summary: { processed: 0, diffs: 0, missing: 0, new: 0, debug: { masterRows: 0, slaveRows: 0 } },
            error: null,
            resultFile: path.join(jobDir, `result.csv`)
        };

        // Start Background Processing
        processJob(jobId, ownerMappings).catch(err => {
            console.error(`Job ${jobId} failed:`, err);
            if (global.jobStore[jobId]) {
                global.jobStore[jobId].status = 'ERROR';
                global.jobStore[jobId].error = err.message;
            }
        });

        return NextResponse.json({ jobId });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');
    const download = searchParams.get('download');

    if (!jobId || !global.jobStore[jobId]) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const job = global.jobStore[jobId];

    if (download === 'true' && job.status === 'COMPLETED') {
        const fileStream = fs.createReadStream(job.resultFile);
        return new NextResponse(fileStream as any, {
            headers: {
                'Content-Disposition': `attachment; filename="twoway_result_${jobId}.csv"`,
                'Content-Type': 'text/csv'
            }
        });
    }

    return NextResponse.json(job);
}

// --- Background Worker Logic ---

async function processJob(jobId: string, ownerMappings: Record<string, any>) {
    const job = global.jobStore[jobId];
    job.status = 'PREPARING';

    const addLog = (message: string) => {
        if (!job.logs) job.logs = [];
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        job.logs.push(`[${time}] ${message}`);
    };

    // 1. Group Tasks by Connection Pair
    const tasks = new Map<string, { master: any, slave: any, owners: string[] }>();
    const owners = Object.keys(ownerMappings);

    owners.forEach((owner) => {
        const map = ownerMappings[owner];
        if (map && (map.master || map.slave)) {
            const mId = map.master ? map.master.id : 'null';
            const sId = map.slave ? map.slave.id : 'null';
            const key = `${mId}|${sId}`;

            if (!tasks.has(key)) {
                tasks.set(key, { master: map.master, slave: map.slave, owners: [] });
            }
            tasks.get(key)!.owners.push(owner);
        }
    });

    job.totalTasks = tasks.size;
    job.status = 'RUNNING';

    const resultStream = fs.createWriteStream(job.resultFile, { flags: 'w' });

    // Header without "IN_EXCEL"
    resultStream.write(`OWNER,OBJECT_NAME,OBJECT_TYPE,IN_MASTER,IN_SLAVE,MASTER_STATUS,SLAVE_STATUS,CONCLUSION,CONCLUSION_TYPE\n`);

    const writeResult = (res: any) => {
        const escape = (val: any) => {
            const s = String(val ?? '');
            if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        const line = [
            escape(res.owner),
            escape(res.name),
            escape(res.type),
            res.inMaster ? 'YES' : 'NO',
            res.inSlave ? 'YES' : 'NO',
            escape(res.masterMeta?.status || '-'),
            escape(res.slaveMeta?.status || '-'),
            escape(res.conclusion),
            escape(res.conclusionType)
        ].join(',');

        resultStream.write(line + '\n');

        job.summary.processed++;
        // Update total dynamically as we find objects, or just show count

        if (res.conclusionType !== 'success') job.summary.diffs++;
        if (res.conclusion.includes("Missing in Target")) job.summary.missing++;
        if (res.conclusion === 'Extra in Target') job.summary.new++;

        if (job.summary.processed % 1000 === 0) {
            job.lastUpdate = Date.now();
        }
    };

    // Helper for Deep Code Comparison (Reused)
    const getDDL = async (conn: any, type: string, name: string, owner: string) => {
        try {
            const cleanType = type.replace(/\s+/g, '_');
            const result = await conn.execute(
                `SELECT DBMS_METADATA.GET_DDL(:type, :name, :owner) FROM DUAL`,
                [cleanType, name, owner],
                { fetchInfo: { "DBMS_METADATA.GET_DDL(:TYPE,:NAME,:OWNER)": { type: oracledb.STRING } } }
            );
            return result.rows && result.rows[0] ? String(result.rows[0][0]) : "";
        } catch (e) {
            return null;
        }
    };

    const setupDeepCompare = async (conn: any) => {
        try {
            await conn.execute(`BEGIN 
                DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'SEGMENT_ATTRIBUTES',false);
                DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'SQLTERMINATOR',true);
                DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'STORAGE',false);
                DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'TABLESPACE',false);
            END;`);
        } catch (e) {
            console.error("Failed to setup metadata transform", e);
        }
    };

    // Global Try-Catch mainly for File Stream errors or critical initialization
    try {
        let taskIdx = 0;
        for (const task of Array.from(tasks.values())) {
            taskIdx++;
            const ownersStr = task.owners.slice(0, 3).join(', ') + (task.owners.length > 3 ? `... (+${task.owners.length - 3})` : '');
            addLog(`[Task ${taskIdx}/${tasks.size}] Processing Owners: ${ownersStr}`);

            // Per-Task Try-Catch to prevent one failure from stopping others
            try {
                let masterConn = null;
                let slaveConn = null;
                let masterPool: any = null;
                let slavePool: any = null;

                try {
                    let mIterator: AsyncIterator<any> = { next: async () => ({ value: null, done: true }) };
                    let sIterator: AsyncIterator<any> = { next: async () => ({ value: null, done: true }) };

                    if (task.master) {
                        addLog(`  > Connecting to Master: ${task.master.name}...`);
                        const dbConfig = {
                            user: task.master.username,
                            password: task.master.password,
                            connectString: `${task.master.host}:${task.master.port}/${task.master.serviceName}`
                        };
                        try {
                            masterConn = await oracledb.getConnection(dbConfig);
                            masterPool = await oracledb.createPool({ ...dbConfig, poolMin: 2, poolMax: 10 });

                            const ownersList = task.owners.map(o => `'${o}'`).join(',');
                            const query = `
                                SELECT owner, object_name, object_type, last_ddl_time, status
                                FROM all_objects
                                WHERE owner IN (${ownersList})
                                AND object_type NOT IN ('LOB', 'LOB PARTITION', 'INDEX PARTITION', 'TABLE PARTITION')
                                AND object_name NOT LIKE 'BIN$%'
                                ORDER BY owner, object_name, object_type
                            `;
                            const stream = masterConn.queryStream(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                            mIterator = stream[Symbol.asyncIterator]();
                        } catch (e: any) {
                            addLog(`  ! Error connecting/querying Master: ${e.message}`);
                            // Continue implies we treat Master as empty? Or skip task?
                            // Let's treat as empty iterator (initialized above) but log error
                        }
                    }

                    if (task.slave) {
                        addLog(`  > Connecting to Slave: ${task.slave.name}...`);
                        const dbConfig = {
                            user: task.slave.username,
                            password: task.slave.password,
                            connectString: `${task.slave.host}:${task.slave.port}/${task.slave.serviceName}`
                        };
                        try {
                            slaveConn = await oracledb.getConnection(dbConfig);
                            slavePool = await oracledb.createPool({ ...dbConfig, poolMin: 2, poolMax: 10 });

                            const ownersList = task.owners.map(o => `'${o}'`).join(',');
                            const query = `
                                SELECT owner, object_name, object_type, last_ddl_time, status
                                FROM all_objects
                                WHERE owner IN (${ownersList})
                                AND object_type NOT IN ('LOB', 'LOB PARTITION', 'INDEX PARTITION', 'TABLE PARTITION')
                                AND object_name NOT LIKE 'BIN$%'
                                ORDER BY owner, object_name, object_type
                            `;
                            const stream = slaveConn.queryStream(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                            sIterator = stream[Symbol.asyncIterator]();
                        } catch (e: any) {
                            addLog(`  ! Error connecting/querying Slave: ${e.message}`);
                        }
                    }

                    addLog(`  > Starting Stream Merge & Comparison...`);

                    const fetchWithPool = async (pool: any, type: string, name: string, owner: string) => {
                        let conn;
                        try {
                            if (!pool) return null;
                            conn = await pool.getConnection();
                            await setupDeepCompare(conn);
                            return await getDDL(conn, type, name, owner);
                        } catch (e: any) {
                            return null;
                        } finally {
                            if (conn) await conn.close();
                        }
                    };

                    const pendingBatch: any[] = [];
                    const processBatch = async () => {
                        if (pendingBatch.length === 0) return;
                        await Promise.all(pendingBatch.map(async (item) => {
                            if (item.inSlave && item.inMaster) {
                                let isIdentical = true;
                                try {
                                    const [mCode, sCode] = await Promise.all([
                                        fetchWithPool(masterPool, item.type, item.name, item.owner),
                                        fetchWithPool(slavePool, item.type, item.name, item.owner)
                                    ]);

                                    if (mCode !== null && sCode !== null) {
                                        const mNorm = normalizeDDL(mCode, item.type);
                                        const sNorm = normalizeDDL(sCode, item.type);

                                        if (mNorm === sNorm) {
                                            isIdentical = true;
                                        } else {
                                            isIdentical = false;
                                            addLog(`    Info: ${item.owner}.${item.name} has DIFFERENT code.`);
                                        }
                                    } else {
                                        isIdentical = false;
                                        addLog(`    Warning: Failed to fetch DDL for ${item.owner}.${item.name}.`);
                                    }
                                } catch (e: any) {
                                    isIdentical = false;
                                    addLog(`    Error checking DDL for ${item.owner}.${item.name}: ${(e as any).message}.`);
                                }

                                if (!isIdentical) {
                                    item.conclusion = "Content Mismatch";
                                    item.conclusionType = 'warning';
                                } else {
                                    item.conclusion = "Match";
                                    item.conclusionType = 'success';
                                }
                            }
                            writeResult(item);
                        }));
                        pendingBatch.length = 0;
                    };

                    let mNext = await mIterator.next();
                    let sNext = await sIterator.next();

                    const getCompVal = (row: any) => {
                        if (!row) return '~~~~';
                        const o = (row.OWNER || row.owner || '').toUpperCase();
                        const n = (row.OBJECT_NAME || row.name || '').toUpperCase();
                        const t = (row.OBJECT_TYPE || row.type || '').toUpperCase();
                        return `${o}|${n}|${t}`;
                    };

                    while (!mNext.done || !sNext.done) {
                        const mObj = mNext.value;
                        const sObj = sNext.value;

                        const mKey = mNext.done ? '~~~~' : getCompVal(mObj);
                        const sKey = sNext.done ? '~~~~' : getCompVal(sObj);

                        const minKey = mKey < sKey ? mKey : sKey;
                        if (minKey === '~~~~') break;

                        const inMaster = mKey === minKey;
                        const inSlave = sKey === minKey;

                        if (inMaster) job.summary.debug.masterRows++;
                        if (inSlave) job.summary.debug.slaveRows++;

                        const item: any = {
                            owner: inMaster ? mObj.OWNER : sObj.OWNER,
                            name: inMaster ? mObj.OBJECT_NAME : sObj.OBJECT_NAME,
                            type: inMaster ? mObj.OBJECT_TYPE : sObj.OBJECT_TYPE,
                            inMaster,
                            inSlave,
                            masterMeta: inMaster ? { last_ddl_time: mObj.LAST_DDL_TIME, status: mObj.STATUS } : null,
                            slaveMeta: inSlave ? { last_ddl_time: sObj.LAST_DDL_TIME, status: sObj.STATUS } : null,
                            conclusion: '',
                            conclusionType: 'info'
                        };

                        if (inMaster && !inSlave) {
                            item.conclusion = "Missing in Slave";
                            item.conclusionType = 'error';
                            writeResult(item);
                        } else if (!inMaster && inSlave) {
                            item.conclusion = "Missing in Master";
                            item.conclusionType = 'info';
                            writeResult(item);
                        } else {
                            pendingBatch.push(item);
                            if (pendingBatch.length >= 10) await processBatch();
                        }

                        if (inMaster) mNext = await mIterator.next();
                        if (inSlave) sNext = await sIterator.next();
                    }

                    await processBatch();
                    addLog(`  > Task finished.`);

                } finally {
                    if (masterConn) await masterConn.close();
                    if (masterPool) await masterPool.close();
                    if (slaveConn) await slaveConn.close();
                    if (slavePool) await slavePool.close();
                }
            } catch (taskErr: any) {
                addLog(`  ! Task Failed: ${taskErr.message}`);
                console.error("Task execution error:", taskErr);
                // Continue to next task!
            }
        }

        resultStream.end();
        job.status = 'COMPLETED';
        job.progress = 100;
        addLog(`All tasks completed. Result generated.`);

    } catch (err: any) {
        console.error("Critical Job Error", err);
        job.status = 'ERROR';
        job.error = err.message;
        addLog(`CRITICAL ERROR: ${err.message}`);
        resultStream.end();
    }
}
