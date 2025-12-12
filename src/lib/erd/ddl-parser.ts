
import { v4 as uuidv4 } from 'uuid';
import { TableData, Column, ErdNode, ErdEdge } from './sql-generator';

const DATA_TYPE_MAP: Record<string, string> = {
    'int': 'number',
    'integer': 'number',
    'number': 'number',
    'varchar': 'string',
    'varchar2': 'string',
    'text': 'text',
    'char': 'string',
    'boolean': 'boolean',
    'bool': 'boolean',
    'date': 'date',
    'datetime': 'date',
    'timestamp': 'date',
    'uuid': 'uuid',
    'uniqueidentifier': 'uuid',
    'clob': 'text',
    'blob': 'text', // Represent as text/long
};

const mapSqlTypeToAppType = (sqlType: string): string => {
    const baseType = sqlType.split('(')[0].toLowerCase(); // remove size e.g. varchar(255)
    return DATA_TYPE_MAP[baseType] || 'string';
};

export const parseDdlToErd = (ddl: string): { nodes: ErdNode[], edges: ErdEdge[] } => {
    const nodes: ErdNode[] = [];
    const edges: ErdEdge[] = [];

    // Normalize input: remove comments, extra spaces
    // Check for standard comments -- and /* */
    let cleanDdl = ddl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

    // Split by CREATE TABLE
    // Regex explanation: Case insensitive 'CREATE TABLE', optionally 'IF NOT EXISTS', capture name, capture content between parenthesis
    // Handling nested parenthesis is hard with regex. We'll use a simpler state approach or refined split.
    // For MVP, assuming standard formatting or splitting by semicolon usually works if no weird internal semicolons.

    // Split statements by semicolon
    // Use a loop with regex to find all matches instead of splitting by semicolon
    // This is more robust against missing semicolons or semicolons inside comments/strings (simplistic)
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\(([\s\S]*?)\)(?:\s*;|(?=\s*CREATE)|$)/gim;

    let match;
    const tables: Record<string, TableData> = {};
    const tableIds: Record<string, string> = {};

    while ((match = tableRegex.exec(cleanDdl)) !== null) {
        let tableName = match[1].replace(/["`\[\]]/g, '');
        // clean up schema if present e.g. public.users
        const schemaParts = tableName.split('.');
        if (schemaParts.length > 1) {
            tableName = schemaParts[schemaParts.length - 1];
        }

        const body = match[2];
        const tableId = uuidv4();

        // Prevent duplicate tables
        if (tables[tableName]) continue;

        tableIds[tableName] = tableId;

        const columns: Column[] = [];
        let primaryKeys: string[] = [];

        const lines = splitByCommaIgnoringParenthesis(body);

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;

            // Check for PRIMARY KEY constraint at end
            const pkMatch = line.match(/^\s*PRIMARY\s+KEY\s*\((.+)\)/i);
            if (pkMatch) {
                const pkCols = pkMatch[1].split(',').map(c => c.trim().replace(/["`\[\]]/g, ''));
                primaryKeys.push(...pkCols);
                return;
            }

            // Check for FOREIGN KEY
            // constraint fk foreign key (col) references tbl(col)
            if (line.match(/FOREIGN\s+KEY/i) || line.match(/REFERENCES/i)) {
                return;
            }

            // Skip other constraints like Kye, Index, etc that start with CONSTRAINT or KEY or INDEX
            if (line.match(/^\s*(CONSTRAINT|KEY|INDEX|UNIQUE)/i) && !line.match(/^\s*CONSTRAINT.+PRIMARY\s+KEY/i)) {
                return;
            }

            // Column Definition
            const parts = line.split(/\s+/);
            const colName = parts[0].replace(/["`\[\]]/g, '');
            const colTypeRaw = parts[1] || 'VARCHAR';
            const colType = mapSqlTypeToAppType(colTypeRaw);

            const colDef = line.toUpperCase();
            const isPk = colDef.includes('PRIMARY KEY');
            const isNotNull = colDef.includes('NOT NULL');
            const isUnique = colDef.includes('UNIQUE');

            if (isPk) primaryKeys.push(colName);

            columns.push({
                id: uuidv4(),
                name: colName,
                type: colType,
                isPk: isPk,
                isFk: false,
                isUnique: isUnique,
                isNullable: !isNotNull && !isPk
            });
        });

        // Post-process Primary Keys
        columns.forEach(col => {
            if (primaryKeys.includes(col.name)) {
                col.isPk = true;
                col.isNullable = false;
            }
        });

        const tableData: TableData = {
            label: tableName,
            columns: columns
        };

        tables[tableName] = tableData;

        nodes.push({
            id: tableId,
            type: 'table',
            position: { x: 0, y: 0 },
            data: tableData
        });
    }

    // Layout
    // Simple cascade or grid
    let x = 0;
    let y = 0;
    const spacing = 350;
    const cols = Math.ceil(Math.sqrt(nodes.length));

    nodes.forEach((node, i) => {
        node.position = { x: (i % cols) * spacing, y: Math.floor(i / cols) * spacing };
    });

    return { nodes, edges };
};

function splitByCommaIgnoringParenthesis(str: string): string[] {
    const result: string[] = [];
    let current = '';
    let parenthesisLevel = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '(') parenthesisLevel++;
        if (char === ')') parenthesisLevel--;

        if (char === ',' && parenthesisLevel === 0) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    if (current) result.push(current);
    return result;
}
