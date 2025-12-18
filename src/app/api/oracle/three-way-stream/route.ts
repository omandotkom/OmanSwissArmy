
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

// Global Job Store (In-Memory for simplicity in Standalone App)
// In production clustered env, use Redis/DB.
declare global {
    var jobStore: Record<string, any>;
}
if (!global.jobStore) global.jobStore = {};

const TEMP_DIR = path.join(process.cwd(), 'temp_jobs');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

export async function POST(req: NextRequest) {
    try {
        // Parse Body with explicit limit if needed, or rely on Next.js default (usually 4mb+, might need config increase for huge excel json)
        // Better: User uploads Excel, we parse in Backend? 
        // Current existing frontend parses Excel. Let's assume frontend sends the parsed data.
        // If data is huge, we might hit body limit. But let's proceed.

        const body = await req.json();
        const { excelData, ownerMappings } = body; // ownerMappings contains master/slave conns per owner

        // Generate timestamped Job ID: analysis_YYYYMMDD_HHMMSS_random
        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14); // YYYYMMDDHHMMSS
        const jobId = `analysis_${timestamp}_${Math.random().toString(36).substr(2, 5)}`;

        // Create isolated directory for this job to prevent overlap
        const jobDir = path.join(TEMP_DIR, jobId);
        if (!fs.existsSync(jobDir)) fs.mkdirSync(jobDir, { recursive: true });

        // Initialize Job
        global.jobStore[jobId] = {
            id: jobId,
            status: 'STARTING',
            progress: 0,
            total: excelData?.length || 0,
            logs: [],
            summary: { processed: 0, diffs: 0, missing: 0, new: 0, debug: { masterRows: 0, slaveRows: 0, excelRows: 0 } },
            error: null,
            resultFile: path.join(jobDir, `result.csv`)
        };

        // Start Background Processing
        processJob(jobId, excelData, ownerMappings).catch(err => {
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
        // Stream the result file
        const fileStream = fs.createReadStream(job.resultFile);

        // Return as download
        // We can return text/plain or application/jsonl
        return new NextResponse(fileStream as any, {
            headers: {
                'Content-Disposition': `attachment; filename="analysis_result_${jobId}.csv"`,
                'Content-Type': 'text/csv'
            }
        });
    }

    // Return Status
    // If completed, maybe read first 100 lines for preview?
    let preview = [];
    if (job.status === 'COMPLETED') {
        // Read simple head
        // Note: fs.read or readline
        // Just empty for now, frontend requested chart and summary mostly
    }

    return NextResponse.json(job);
}

// --- Background Worker Logic ---

async function processJob(jobId: string, excelData: any[], ownerMappings: Record<string, any>) {
    const job = global.jobStore[jobId];
    job.status = 'PREPARING';

    const addLog = (message: string) => {
        if (!job.logs) job.logs = [];
        // Format: [14:02:45] Message
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        job.logs.push(`[${time}] ${message}`);
    };

    // 1. Group Tasks by Connection Pair to minimize connections
    // Key: MasterID|SlaveID -> { masterConn, slaveConn, owners: [] }
    const tasks = new Map<string, { master: any, slave: any, owners: string[] }>();
    const excelOwners = new Set(excelData.map((d: any) => d.owner));

    excelOwners.forEach((owner) => {
        const map = ownerMappings[owner as string];
        // Allow partial mapping (Master Only or Slave Only)
        if (map && (map.master || map.slave)) {
            // Use a composite key based on available IDs. Nulls use 'null' string.
            const mId = map.master ? map.master.id : 'null';
            const sId = map.slave ? map.slave.id : 'null';
            const key = `${mId}|${sId}`;

            if (!tasks.has(key)) {
                tasks.set(key, { master: map.master, slave: map.slave, owners: [] });
            }
            tasks.get(key)!.owners.push(owner as string);
        }
    });

    job.totalTasks = tasks.size;
    job.summary.debug.activeTasks = tasks.size; // Add debug info
    job.status = 'RUNNING';

    const resultStream = fs.createWriteStream(job.resultFile, { flags: 'w' });

    // Write CSV Header
    resultStream.write(`OWNER,OBJECT_NAME,OBJECT_TYPE,IN_MASTER,IN_SLAVE,IN_EXCEL,MASTER_STATUS,SLAVE_STATUS,CONCLUSION,CONCLUSION_TYPE\n`);

    // Helper to write result
    const writeResult = (res: any) => {
        // Simple CSV escaping
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
            res.inExcel ? 'YES' : 'NO',
            escape(res.masterMeta?.status || '-'),
            escape(res.slaveMeta?.status || '-'),
            escape(res.conclusion),
            escape(res.conclusionType)
        ].join(',');

        resultStream.write(line + '\n');

        job.summary.processed++;
        if (job.total > 0) {
            job.progress = Math.min(99, Math.round((job.summary.processed / job.total) * 100));
        }

        if (res.conclusionType !== 'success') job.summary.diffs++;
        if (res.conclusionType === 'error' && res.conclusion.includes("missing")) job.summary.missing++;
        if (res.conclusion === 'Object Baru (Siap Naik ke Master)') job.summary.new++;

        if (job.summary.processed % 1000 === 0) {
            job.lastUpdate = Date.now();
        }
    };

    // Deduplicate Excel Data
    const uniqueExcel = new Map<string, any>();
    excelData.forEach(item => {
        const key = `${item.owner}|${item.name}|${item.type}`;
        if (!uniqueExcel.has(key)) {
            uniqueExcel.set(key, item);
        }
    });

    if (excelData.length !== uniqueExcel.size) {
        addLog(`Warning: Removed ${excelData.length - uniqueExcel.size} duplicate items from Excel input.`);
        excelData = Array.from(uniqueExcel.values());
        // Update job total with cleaned count
        job.total = excelData.length;
    }

    // Sort Excel Data in Memory (assuming it fits in RAM as per current design)
    // Multilevel sort: Owner ASC, Name ASC, Type ASC
    addLog(`Sorting ${excelData.length} items from input Excel...`);
    excelData.sort((a, b) => {
        const oA = (a.owner || '').toUpperCase();
        const oB = (b.owner || '').toUpperCase();
        const nA = (a.name || '').toUpperCase();
        const nB = (b.name || '').toUpperCase();
        const tA = (a.type || '').toUpperCase();
        const tB = (b.type || '').toUpperCase();
        if (oA < oB) return -1; if (oA > oB) return 1;
        if (nA < nB) return -1; if (nA > nB) return 1;
        if (tA < tB) return -1; if (tA > tB) return 1;
        return 0;
    });

    // Helper for Deep Code Comparison
    const getDDL = async (conn: any, type: string, name: string, owner: string) => {
        try {
            const cleanType = type.replace(/\s+/g, '_');
            // Handle specific type mappings if needed
            const result = await conn.execute(
                `SELECT DBMS_METADATA.GET_DDL(:type, :name, :owner) FROM DUAL`,
                [cleanType, name, owner],
                { fetchInfo: { "DBMS_METADATA.GET_DDL(:TYPE,:NAME,:OWNER)": { type: oracledb.STRING } } }
            );
            return result.rows && result.rows[0] ? String(result.rows[0][0]) : "";
        } catch (e) {
            // console.error(`Failed to fetch DDL for ${owner}.${name} (${type})`, e);
            return null; // Return null to indicate fetch failure
        }
    };

    const setupDeepCompare = async (conn: any) => {
        try {
            // Ignore storage parameters for logical comparison
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

    try {
        let taskIdx = 0;
        for (const task of Array.from(tasks.values())) {
            taskIdx++;
            const ownersStr = task.owners.slice(0, 3).join(', ') + (task.owners.length > 3 ? `... (+${task.owners.length - 3})` : '');
            addLog(`[Task ${taskIdx}/${tasks.size}] Processing Owners: ${ownersStr}`);

            // Streaming Connections
            let masterConn = null;
            let slaveConn = null;
            // Lookup Pools (Concurrency 10)
            let masterPool: any = null;
            let slavePool: any = null;

            try {
                // Initialize Streams (or Dummy Iterators if connection missing)
                let mIterator: AsyncIterator<any> = { next: async () => ({ value: null, done: true }) };
                let sIterator: AsyncIterator<any> = { next: async () => ({ value: null, done: true }) };

                // Connect Master if exists
                if (task.master) {
                    addLog(`  > Connecting to Master: ${task.master.name}...`);
                    const dbConfig = {
                        user: task.master.username,
                        password: task.master.password,
                        connectString: `${task.master.host}:${task.master.port}/${task.master.serviceName}`
                    };
                    masterConn = await oracledb.getConnection(dbConfig);
                    masterPool = await oracledb.createPool({
                        ...dbConfig,
                        poolMin: 2,
                        poolMax: 10
                    });

                    const ownersList = task.owners.map(o => `'${o}'`).join(',');
                    const query = `
                        SELECT owner, object_name, object_type, last_ddl_time, status
                        FROM all_objects
                        WHERE owner IN (${ownersList})
                        AND object_type NOT IN ('LOB', 'LOB PARTITION', 'INDEX', 'INDEX PARTITION', 'TABLE PARTITION', 'SEQUENCE')
                        AND object_name NOT LIKE 'BIN$%'
                        ORDER BY owner, object_name, object_type
                    `;
                    addLog(`  > Fetching metadata stream from Master...`);
                    const stream = masterConn.queryStream(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                    mIterator = stream[Symbol.asyncIterator]();
                } else {
                    addLog(`  > No Master connection configured for this group.`);
                }

                // Connect Slave if exists
                if (task.slave) {
                    addLog(`  > Connecting to Slave: ${task.slave.name}...`);
                    const dbConfig = {
                        user: task.slave.username,
                        password: task.slave.password,
                        connectString: `${task.slave.host}:${task.slave.port}/${task.slave.serviceName}`
                    };
                    slaveConn = await oracledb.getConnection(dbConfig);
                    slavePool = await oracledb.createPool({
                        ...dbConfig,
                        poolMin: 2,
                        poolMax: 10
                    });

                    const ownersList = task.owners.map(o => `'${o}'`).join(',');
                    const query = `
                        SELECT owner, object_name, object_type, last_ddl_time, status
                        FROM all_objects
                        WHERE owner IN (${ownersList})
                        AND object_type NOT IN ('LOB', 'LOB PARTITION', 'INDEX', 'INDEX PARTITION', 'TABLE PARTITION', 'SEQUENCE')
                        AND object_name NOT LIKE 'BIN$%'
                        ORDER BY owner, object_name, object_type
                    `;
                    addLog(`  > Fetching metadata stream from Slave...`);
                    const stream = slaveConn.queryStream(query, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                    sIterator = stream[Symbol.asyncIterator]();
                } else {
                    addLog(`  > No Slave connection configured for this group.`);
                }

                addLog(`  > Starting Stream Merge & Comparison (Parallel DDL Checks)...`);

                // Wrapper to get DDL from Pool
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
                                    // Helper to normalize DDL for comparison (Ignore dynamic names & Sort Table Columns)
                                    const normalizeDDL = (ddl: string, type: string) => {
                                        // 1. Remove "SYS_Cxxxx" constraint names (system generated)
                                        let clean = ddl.replace(/"?SYS_C\w+"?/g, "SYS_C_IGNORED");

                                        // 2. Remove whitespace/newlines standardization
                                        clean = clean.replace(/\s+/g, ' ').trim();

                                        // 3. For TABLES: Sort columns/constraints to ignore order
                                        if (type === 'TABLE') {
                                            clean = sortTableContent(clean);
                                        }

                                        return clean;
                                    };

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
                                            // Note: robust enough for standard "COL TYPE" and "CONSTRAINT PK..."
                                            parts.sort();

                                            return pre + parts.join(', ') + post;

                                        } catch (e) {
                                            return ddl; // Fallback if parsing fails
                                        }
                                    };

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
                                if (!item.inExcel) {
                                    item.conclusion = "Terdapat perubahan, tidak terdaftar di OBJECT DB";
                                    item.conclusionType = 'warning';
                                } else {
                                    item.conclusion = "Perubahan Terdaftar (Siap Sync)";
                                    item.conclusionType = 'info';
                                }
                            } else {
                                if (!item.inExcel) {
                                    item.conclusion = "Identik (Tidak di Excel)";
                                    item.conclusionType = 'success';
                                } else {
                                    item.conclusion = "Sudah Sync (Done)";
                                    item.conclusionType = 'success';
                                }
                            }
                        }
                        writeResult(item);
                    }));
                    pendingBatch.length = 0;
                };

                let mNext = await mIterator.next();
                let sNext = await sIterator.next();

                const taskExcelItems = excelData.filter(x => task.owners.includes(x.owner));
                job.summary.debug.excelRows += taskExcelItems.length; // Count Excel Rows
                let eIndex = 0;

                // Comparison Logic
                // We have 3 sorted Listeners: mVal, sVal, eVal

                const getCompVal = (row: any) => {
                    if (!row) return null;
                    const o = (row.OWNER || row.owner || '').toUpperCase();
                    const n = (row.OBJECT_NAME || row.name || '').toUpperCase();
                    const t = (row.OBJECT_TYPE || row.type || '').toUpperCase();
                    return `${o}|${n}|${t}`;
                };

                const getExcelVal = (idx: number) => {
                    if (idx >= taskExcelItems.length) return null;
                    const row = taskExcelItems[idx];
                    const o = (row.owner || '').toUpperCase();
                    const n = (row.name || '').toUpperCase();
                    const t = (row.type || '').toUpperCase();
                    return `${o}|${n}|${t}`;
                };

                while (!mNext.done || !sNext.done || eIndex < taskExcelItems.length) {
                    const mObj = mNext.value; // { OWNER, OBJECT_NAME, ... }
                    const sObj = sNext.value;
                    const eObj = eIndex < taskExcelItems.length ? taskExcelItems[eIndex] : null;

                    const mKey = mNext.done ? '~~~~' : getCompVal(mObj); // '~~~~' is high value
                    const sKey = sNext.done ? '~~~~' : getCompVal(sObj);
                    const eKey = !eObj ? '~~~~' : getExcelVal(eIndex);

                    // Find Min Key
                    const minKey = [mKey, sKey, eKey].sort()[0];
                    if (minKey === '~~~~') break; // All done

                    // Determine presence
                    const inMaster = mKey === minKey;
                    const inSlave = sKey === minKey;
                    const inExcel = eKey === minKey;

                    if (inMaster) job.summary.debug.masterRows++;
                    if (inSlave) job.summary.debug.slaveRows++;

                    // Build Data
                    const item = {
                        owner: inMaster ? mObj.OWNER : (inSlave ? sObj.OWNER : eObj.owner),
                        name: inMaster ? mObj.OBJECT_NAME : (inSlave ? sObj.OBJECT_NAME : eObj.name),
                        type: inMaster ? mObj.OBJECT_TYPE : (inSlave ? sObj.OBJECT_TYPE : eObj.type),
                        inMaster,
                        inSlave,
                        inExcel,
                        masterMeta: inMaster ? { last_ddl_time: mObj.LAST_DDL_TIME, status: mObj.STATUS } : null,
                        slaveMeta: inSlave ? { last_ddl_time: sObj.LAST_DDL_TIME, status: sObj.STATUS } : null,
                        conclusion: '',
                        conclusionType: 'info'
                    };

                    // Analyze
                    let text = '';
                    let type = 'info';

                    // Simplified Time Check for Optimization
                    // Simplified Time Check (IGNORED for Decision as per User Request)
                    const timeDiff = item.masterMeta?.last_ddl_time?.toString() !== item.slaveMeta?.last_ddl_time?.toString();

                    if (inExcel && !inSlave) {
                        text = "Source missing";
                        type = 'error';
                    } else if (inSlave && inMaster) {
                        // Handled in batch
                    } else if (!inSlave && inMaster) {
                        if (!inExcel) {
                            text = "Object belum turun / naik";
                            type = 'warning';
                        } else {
                            text = "Source missing (Ada di Master)";
                            type = 'error';
                        }
                    } else if (inSlave && !inMaster) {
                        if (!inExcel) {
                            text = "Object liar di Slave (Tidak di Excel)";
                            type = 'warning';
                        } else {
                            text = "Object Baru (Siap Naik ke Master)";
                            type = 'info';
                        }
                    } else if (!inSlave && !inMaster && inExcel) {
                        text = "Source missing (Hanya di Excel)";
                        type = 'error';
                    }

                    if (inSlave && inMaster) {
                        pendingBatch.push(item);
                        if (pendingBatch.length >= 10) {
                            await processBatch();
                        }
                    } else {
                        // Write Result (unless batched)
                        writeResult({ ...item, conclusion: text, conclusionType: type });
                    }

                    // Advance Pointers
                    if (inMaster) mNext = await mIterator.next();
                    if (inSlave) sNext = await sIterator.next();
                    if (inExcel) eIndex++;
                }

                await processBatch();
                addLog(`  > Task finished. Closing connections.`);

            } finally {
                if (masterConn) await masterConn.close();
                if (masterPool) await masterPool.close();
                if (slaveConn) await slaveConn.close();
                if (slavePool) await slavePool.close();
            }
        }

        resultStream.end();
        job.status = 'COMPLETED';
        job.progress = 100;
        addLog(`All tasks completed. Result generated.`);

    } catch (err: any) {
        console.error("Job Worker Error", err);
        job.status = 'ERROR';
        job.error = err.message;
        addLog(`ERROR: ${err.message}`);
        resultStream.end();
    }
}
