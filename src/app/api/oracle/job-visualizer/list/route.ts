
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

        // Default to current user if owner not specified
        const targetOwner = owner ? owner.toUpperCase() : connConfig.username.toUpperCase();

        const query = `
            SELECT owner, job_name, job_type, job_action, repeat_interval, state, last_start_date, next_run_date, comments
            FROM all_scheduler_jobs
            WHERE owner = :owner
            ORDER BY job_name
        `;

        const result = await connection.execute(query, { owner: targetOwner }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        return NextResponse.json({ jobs: result.rows });

    } catch (error: any) {
        console.error("List Jobs Error", error);
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
