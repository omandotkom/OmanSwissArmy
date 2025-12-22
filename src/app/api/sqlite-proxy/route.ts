import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// Import correctly depending on environment (this prevents build errors if module missing during static analysis)
let Database: any;
try {
    Database = require('better-sqlite3-multiple-ciphers');
} catch (e) {
    console.warn("better-sqlite3-multiple-ciphers not found or failed to load");
}

export async function POST(req: NextRequest) {
    if (!Database) {
        return NextResponse.json({ error: 'Server dependency missing: better-sqlite3-multiple-ciphers' }, { status: 500 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const password = formData.get('password') as string;
        const query = formData.get('query') as string;
        const mode = formData.get('mode') as string; // 'check' | 'query' | 'tables'

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        // Save temp file
        const buffer = Buffer.from(await file.arrayBuffer());
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `sqlite-temp-${crypto.randomUUID()}.db`);

        fs.writeFileSync(tempFilePath, buffer);

        let db;
        try {
            db = new Database(tempFilePath);

            // Set encryption key if provided
            if (password) {
                db.pragma(`key='${password}'`);
            }

            // Test connection with a simple read to verify encryption
            try {
                db.prepare('SELECT count(*) FROM sqlite_master').get();
            } catch (err: any) {
                if (err.message.includes('file is not a database') || err.message.includes('encrypted')) {
                    // Cleanup
                    db.close();
                    fs.unlinkSync(tempFilePath);
                    return NextResponse.json({ error: 'Invalid password or encrypted file format mismatch' }, { status: 403 });
                }
                throw err;
            }

            // --- Handlers ---

            if (mode === 'check' || mode === 'tables') {
                const tables = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'").all();
                const tableList = tables.map((t: any) => ({
                    name: t.name,
                    type: t.type,
                    rowCount: 0
                }));

                db.close();
                fs.unlinkSync(tempFilePath);
                return NextResponse.json({ tables: tableList, success: true });
            }

            if (mode === 'query') {
                if (!query) throw new Error("Query is required");

                const stmt = db.prepare(query);
                let result;

                // Allow read-only operations mostly, but for now we run what user asks (sandbox implied)
                if (query.trim().toLowerCase().startsWith('select') || query.trim().toLowerCase().startsWith('pragma')) {
                    const rows = stmt.all();
                    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
                    // Normalize simple array of objects to [[col1, col2], ...] format for frontend
                    const values = rows.map((r: any) => Object.values(r));
                    result = { columns, values };
                } else {
                    const info = stmt.run();
                    result = {
                        columns: ['info'],
                        values: [[`Rows affected: ${info.changes}, LastInsertRowid: ${info.lastInsertRowid}`]]
                    };
                }

                db.close();
                fs.unlinkSync(tempFilePath);
                return NextResponse.json({ result, success: true });
            }

            db.close();
            fs.unlinkSync(tempFilePath);
            return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

        } catch (dbErr: any) {
            if (db && db.open) db.close();
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return NextResponse.json({ error: dbErr.message }, { status: 500 });
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
