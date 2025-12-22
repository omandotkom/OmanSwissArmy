
/**
 * Sorting comma-separated definitions inside the main (...) of CREATE TABLE
 * to ensure column order doesn't affect comparison.
 */
export const sortTableContent = (ddl: string) => {
    try {
        const firstParen = ddl.indexOf('(');
        if (firstParen === -1) return ddl;

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

        if (lastParen === -1) return ddl;

        const body = ddl.substring(firstParen + 1, lastParen);
        const pre = ddl.substring(0, firstParen + 1);
        const post = ddl.substring(lastParen);

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

        parts.sort();

        return pre + parts.join(', ') + post;
    } catch (e) {
        return ddl;
    }
};

/**
 * Normalize Oracle DDL for comparison.
 * - Removes System Generated names (SYS_C..., SYS_LOB...)
 * - Normalizes whitespace
 * - Sorts Table Content (Columns/Constraints)
 * - Ignores Sequence properties
 */
export const normalizeDDL = (ddl: string, type: string) => {
    if (!ddl) return "";

    let clean = ddl.replace(/"?SYS_C\w+"?/g, "SYS_C_IGNORED");
    clean = clean.replace(/"?SYS_LOB\d+\$\$?"?/g, "SYS_LOB_IGNORED");
    clean = clean.replace(/"?SYS_IL\d+\$\$?"?/g, "SYS_IL_IGNORED");

    // Ignore GoldenGate / Supplemental Logging
    // Handle nested parentheses in SUPPLEMENTAL LOG GROUP "..." (...) ALWAYS
    clean = clean.replace(/,\s*SUPPLEMENTAL LOG GROUP\s+"[^"]+"\s*\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)\s*ALWAYS/gi, "");
    // Fallback simple remove if nested complexity fails (rare but safe)
    clean = clean.replace(/,\s*SUPPLEMENTAL LOG GROUP.*?\)\s*ALWAYS/gi, "");

    // Remove SUPPLEMENTAL LOG DATA (...) COLUMNS
    clean = clean.replace(/,\s*SUPPLEMENTAL LOG DATA\s*\(.*?\)\s*COLUMNS/gi, "");
    clean = clean.replace(/SUPPLEMENTAL LOG DATA\s*\(.*?\)\s*COLUMNS,?\s*/gi, "");

    clean = clean.replace(/\s+/g, ' ').trim();

    if (type === 'TABLE') {
        clean = sortTableContent(clean);
    }

    if (type === 'SEQUENCE') {
        return "SEQUENCE_PROPERTIES_IGNORED";
    }

    return clean;
};
