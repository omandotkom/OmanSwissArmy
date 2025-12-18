
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
        return `-- Failed to fetch DDL: ${e.message}`;
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

export async function POST(req: NextRequest) {
    let masterConn = null;
    let slaveConn = null;

    try {
        const body = await req.json();
        const { master, slave, object } = body;
        // object = { owner, name, type }
        // master/slave = { username, password, host, port, serviceName }

        if (!object || !object.owner || !object.name || !object.type) {
            return NextResponse.json({ error: "Missing object details" }, { status: 400 });
        }

        const response: any = { masterDDL: '', slaveDDL: '' };

        // Fetch Master DDL
        if (master) {
            try {
                masterConn = await oracledb.getConnection({
                    user: master.username,
                    password: master.password,
                    connectString: `${master.host}:${master.port}/${master.serviceName}`
                });
                await setupDeepCompare(masterConn);
                response.masterDDL = await getDDL(masterConn, object.type, object.name, object.owner);
            } catch (e: any) {
                response.masterDDL = `-- Connection Error (Master): ${e.message}`;
            }
        } else {
            response.masterDDL = '-- No Master Connection Provided';
        }

        // Fetch Slave DDL
        if (slave) {
            try {
                slaveConn = await oracledb.getConnection({
                    user: slave.username,
                    password: slave.password,
                    connectString: `${slave.host}:${slave.port}/${slave.serviceName}`
                });
                await setupDeepCompare(slaveConn);
                response.slaveDDL = await getDDL(slaveConn, object.type, object.name, object.owner);
            } catch (e: any) {
                response.slaveDDL = `-- Connection Error (Slave): ${e.message}`;
            }
        } else {
            response.slaveDDL = '-- No Slave Connection Provided';
        }

        return NextResponse.json(response);

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        if (masterConn) await masterConn.close();
        if (slaveConn) await slaveConn.close();
    }
}
