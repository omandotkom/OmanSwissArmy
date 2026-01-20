
import { NextRequest, NextResponse } from 'next/server';
import oracledb from 'oracledb';

export async function POST(req: NextRequest) {
    let connection: oracledb.Connection | null = null;
    try {
        const body = await req.json();
        const { connection: connConfig, owner, jobType, jobAction } = body;

        if (!connConfig) {
            return NextResponse.json({ error: "Missing connection details" }, { status: 400 });
        }

        connection = await oracledb.getConnection({
            user: connConfig.username,
            password: connConfig.password,
            connectString: `${connConfig.host}:${connConfig.port}/${connConfig.serviceName}`
        });

        // Helper to check schema validity
        const isValidSchema = async (name: string): Promise<boolean> => {
            if (!connection) return false;
            const res = await connection.execute(
                `SELECT 1 FROM all_users WHERE username = :name`,
                [name.toUpperCase()]
            );
            return (res.rows && res.rows.length > 0) || false;
        };

        let potentialRoots: { owner: string; name: string }[] = [];
        const jobOwner = owner ? owner.toUpperCase() : connConfig.username.toUpperCase();

        if (jobType === 'STORED_PROCEDURE') {
            const parts = jobAction.split('.');
            if (parts.length === 2) {
                const part1 = parts[0].replace(/"/g, '').toUpperCase();
                const part2 = parts[1].replace(/"/g, '').toUpperCase();
                if (await isValidSchema(part1)) {
                    potentialRoots.push({ owner: part1, name: part2 });
                } else {
                    potentialRoots.push({ owner: jobOwner, name: part1 }); // Package
                }
            } else if (parts.length > 2) {
                const part1 = parts[0].replace(/"/g, '').toUpperCase();
                if (await isValidSchema(part1)) {
                    potentialRoots.push({ owner: part1, name: parts[1].replace(/"/g, '').toUpperCase() });
                } else {
                    potentialRoots.push({ owner: jobOwner, name: parts[parts.length - 2].replace(/"/g, '').toUpperCase() });
                }
            } else {
                potentialRoots.push({ owner: jobOwner, name: jobAction.replace(/"/g, '').toUpperCase() });
            }

        } else if (jobType === 'PLSQL_BLOCK') {
            const cleanAction = jobAction.replace(/\s+/g, ' ').toUpperCase();

            // Global Regex to find ALL procedure calls
            const keywords = new Set(['BEGIN', 'END', 'COMMIT', 'ROLLBACK', 'DECLARE', 'IF', 'THEN', 'ELSIF', 'ELSE', 'LOOP', 'EXIT', 'WHEN', 'OTHERS', 'EXCEPTION', 'PRAGMA', 'NULL', 'RETURN']);

            // Regex to match "A" or "A.B" or "A.B.C"
            const regex = /([A-Z0-9_$#"]+)(\.[A-Z0-9_$#"]+){0,2}/g;
            const matches = cleanAction.match(regex);

            if (matches) {
                for (const m of matches) {
                    const raw = m.replace(/"/g, ''); // clean quotes
                    if (keywords.has(raw) || /^\d+$/.test(raw) || raw.length < 2) continue;

                    const parts = raw.split('.');
                    if (parts.length === 2) {
                        const [p1, p2] = parts;
                        if (await isValidSchema(p1)) {
                            potentialRoots.push({ owner: p1, name: p2 });
                        } else {
                            potentialRoots.push({ owner: jobOwner, name: p1 });
                        }
                    } else if (parts.length > 2) {
                        const [p1, p2, p3] = parts;
                        if (await isValidSchema(p1)) {
                            potentialRoots.push({ owner: p1, name: p2 }); // Package name
                        } else {
                            potentialRoots.push({ owner: jobOwner, name: p1 });
                        }
                    } else {
                        if (!keywords.has(parts[0])) {
                            potentialRoots.push({ owner: jobOwner, name: parts[0] });
                        }
                    }
                }
            }
        }

        // Deduplicate
        const uniqueRoots = new Map<string, { owner: string; name: string }>();
        potentialRoots.forEach(r => {
            const key = `${r.owner}.${r.name}`;
            if (!uniqueRoots.has(key)) uniqueRoots.set(key, r);
        });

        return NextResponse.json({ roots: Array.from(uniqueRoots.values()) });

    } catch (error: any) {
        console.error("Parse Error", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}
