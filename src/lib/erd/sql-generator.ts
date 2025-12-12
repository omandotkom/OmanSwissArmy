
export type DbType = 'postgresql' | 'mysql' | 'oracle' | 'sqlserver';

export interface Column {
    id: string;
    name: string;
    type: string;
    isPk: boolean;
    isFk: boolean;
    isUnique: boolean;
    isNullable: boolean;
}

export interface TableData {
    label: string;
    columns: Column[];
}

export interface ErdNode {
    id: string;
    position: { x: number; y: number };
    data: TableData;
    type?: string;
}

export interface ErdEdge {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
}

export const generateSql = (nodes: ErdNode[], edges: ErdEdge[], dbType: DbType): string => {
    let sql = '';

    nodes.forEach(node => {
        const tableName = node.data.label;
        sql += `CREATE TABLE ${tableName} (\n`;

        const pkColumns: string[] = [];
        const columnDefs: string[] = [];

        node.data.columns.forEach(col => {
            let colDef = `  ${col.name} ${mapType(col.type, dbType)}`;

            if (!col.isNullable) {
                colDef += ' NOT NULL';
            }

            if (col.isUnique) {
                colDef += ' UNIQUE';
            }

            columnDefs.push(colDef);

            if (col.isPk) {
                pkColumns.push(col.name);
            }
        });

        if (pkColumns.length > 0) {
            columnDefs.push(`  PRIMARY KEY (${pkColumns.join(', ')})`);
        }

        // Add Foreign Keys based on Edges
        // We look for edges where THIS node is the SOURCE (referencing another table)
        // Actually, usually edges in ERD flow from One -> Many or vice-versa. 
        // Let's assume Edge Source = PK Table, Edge Target = FK Table (Standard Crow's foot)
        // OR Edge Source = FK Table, Edge Target = PK Table.
        // For simplicity in this tool, let's assume the user draws from Parent(PK) to Child(FK).
        // So validation: Target is the one having the FK.

        // However, generic edges don't carry column info unless we handle it.
        // For this MVP, we will rely on implicit naming or just adding basic constraints without column specifics if not defined,
        // BUT strictly speaking, a relationship needs columns.
        // To keep it simple: We just generate basic CREATE TABLE. 
        // Advanced FK generation requires knowing WHICH column maps to WHICH.
        // We will append a generic FK comment or attempt to map if standard naming (id) exists.

        // Let's try to find if any column says "isFk".
        // If "isFk" is true, we check if there is an incoming edge? 
        // Actually simpler: We just define columns. The relationships in valid SQL need explicit column mapping.
        // We will add a comment for relationships found in diagram but not purely defined in columns.

        // Better approach for MVP: Just iterate edges to add ALTER TABLE or FK constraints 
        // IF we can guess the columns. if not, just leave as comment.

        sql += columnDefs.join(',\n');
        sql += `\n);\n\n`;
    });

    // Add Relationships
    if (edges.length > 0) {
        sql += `-- Relationships (Potential Foreign Keys)\n`;
        edges.forEach(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            if (sourceNode && targetNode) {
                sql += `-- ${sourceNode.data.label} references ${targetNode.data.label}\n`;
                // We could generate ALTER TABLE if we knew the columns.
                // For now, let's look for a column in Target that matches Source_ID or similar?
                // Or just leave it as documentation.
                // user asked to "generate query sql", so best effort.

                sql += `ALTER TABLE ${targetNode.data.label} ADD CONSTRAINT fk_${sourceNode.data.label}_${targetNode.data.label} FOREIGN KEY (/* column_name */) REFERENCES ${sourceNode.data.label} (id);\n`;
            }
        });
    }

    return sql;
};

const mapType = (type: string, dbType: DbType): string => {
    const t = type.toLowerCase();

    // Simple mapping logic
    if (dbType === 'postgresql') {
        if (t === 'string') return 'VARCHAR(255)';
        if (t === 'number') return 'INTEGER';
        if (t === 'boolean') return 'BOOLEAN';
        if (t === 'date') return 'TIMESTAMP';
        if (t === 'text') return 'TEXT';
        if (t === 'uuid') return 'UUID';
    } else if (dbType === 'oracle') {
        if (t === 'string') return 'VARCHAR2(255)';
        if (t === 'number') return 'NUMBER';
        if (t === 'boolean') return 'NUMBER(1)';
        if (t === 'date') return 'DATE';
        if (t === 'text') return 'CLOB';
        if (t === 'uuid') return 'RAW(16)';
    } else if (dbType === 'mysql') {
        if (t === 'string') return 'VARCHAR(255)';
        if (t === 'number') return 'INT';
        if (t === 'boolean') return 'TINYINT(1)';
        if (t === 'date') return 'DATETIME';
        if (t === 'text') return 'LONGTEXT';
        if (t === 'uuid') return 'CHAR(36)';
    } else if (dbType === 'sqlserver') {
        if (t === 'string') return 'NVARCHAR(255)';
        if (t === 'number') return 'INT';
        if (t === 'boolean') return 'BIT';
        if (t === 'date') return 'DATETIME2';
        if (t === 'text') return 'NVARCHAR(MAX)';
        if (t === 'uuid') return 'UNIQUEIDENTIFIER';
    }

    return type.toUpperCase(); // Fallback
};
