
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

interface DependencyNode {
    owner: string;
    name: string;
    type: string;
    referenced_owner: string;
    referenced_name: string;
    referenced_type: string;
    level?: number;
}

export async function POST(req: NextRequest) {
    let connection: oracledb.Connection | null = null;
    try {
        const body = await req.json();
        const { connection: connConfig, rootOwner, rootName } = body;

        if (!connConfig) {
            return NextResponse.json({ error: "Missing connection details" }, { status: 400 });
        }

        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        // Check if user has access to DBA_DEPENDENCIES
        let dependencyView = 'ALL_DEPENDENCIES';
        try {
            await connection.execute(`SELECT 1 FROM DBA_DEPENDENCIES WHERE ROWNUM = 1`);
            dependencyView = 'DBA_DEPENDENCIES';
        } catch (e) {
            // Fallback to ALL_DEPENDENCIES
        }

        // Query single root dependency tree
        const query = `
            SELECT owner, name, type, referenced_owner, referenced_name, referenced_type, LEVEL
            FROM ${dependencyView}
            WHERE referenced_owner NOT IN ('SYS', 'PUBLIC', 'SYSTEM', 'XDB', 'CTXSYS', 'MDSYS', 'ORDDATA')
            AND referenced_type IN ('PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TYPE', 'TABLE', 'VIEW', 'SYNONYM')
            START WITH name = :rootName AND owner = :rootOwner
            CONNECT BY NOCYCLE NAME = PRIOR REFERENCED_NAME 
                   AND OWNER = PRIOR REFERENCED_OWNER
                   AND LEVEL <= 25
        `;

        const result = await connection.execute(query, { rootName, rootOwner }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const nodesMap = new Map<string, any>();
        const edges: any[] = [];

        const rootId = `${rootOwner}.${rootName}`;
        // Note: Logic for "Root Node" creation handles by frontend or assumed?
        // Let's return the tree. The caller knows who the root is.
        // But we should include the root node definition itself in case it has no dependencies.
        nodesMap.set(rootId, { id: rootId, label: rootName, type: 'NODE', fullType: 'ROOT_PROC' });

        const rows = result.rows || [];
        (rows as any[]).forEach((row: DependencyNode) => {
            const srcId = `${row.owner}.${row.name}`;
            const targetId = `${row.referenced_owner}.${row.referenced_name}`;

            if (!nodesMap.has(srcId)) nodesMap.set(srcId, { id: srcId, label: row.name, type: 'NODE', fullType: row.type });
            if (!nodesMap.has(targetId)) nodesMap.set(targetId, { id: targetId, label: row.referenced_name, type: 'NODE', fullType: row.referenced_type });

            if (srcId !== targetId) {
                const edgeId = `${srcId}->${targetId}`;
                // Avoid duplicate edges
                if (!edges.some(e => e.id === edgeId)) {
                    edges.push({
                        id: edgeId,
                        source: srcId,
                        target: targetId,
                        animated: true
                    });
                }
            }
        });

        return NextResponse.json({
            rootId,
            nodes: Array.from(nodesMap.values()),
            edges
        });

    } catch (error: any) {
        console.error("Trace Error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}
