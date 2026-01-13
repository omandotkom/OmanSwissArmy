const XLSX = require('xlsx');

const filePath = "OBJECT DB EPROC PHASE 3 (2).xlsx";

try {
    const workbook = XLSX.readFile(filePath);
    console.log("All Sheet Names:", workbook.SheetNames.join(', '));
    console.log("\n=== Searching for TRANS_GROUP in all sheets ===\n");

    let totalTransGroup = 0;
    const allTransGroups = [];

    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        // Filter rows containing TRANS_GROUP
        const transRows = data.filter(row => {
            const name = row.OBJECT_NAME || row.NAME || row['OBJECT NAME'] || '';
            return String(name).toUpperCase().includes('TRANS_GROUP');
        });

        if (transRows.length > 0) {
            console.log(`\n--- Sheet: ${sheetName} (${transRows.length} TRANS_GROUP entries) ---`);
            transRows.forEach(row => {
                const owner = row.OWNER || 'N/A';
                const name = row.OBJECT_NAME || row.NAME || row['OBJECT NAME'] || 'N/A';
                const type = row.OBJECT_TYPE || row.TYPE || sheetName; // Fallback to sheet name

                console.log(`  ${owner} | ${name} | ${type}`);
                allTransGroups.push({ owner, name, type, sheet: sheetName });
                totalTransGroup++;
            });
        }
    });

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total TRANS_GROUP entries found: ${totalTransGroup}`);

    // Check for duplicates
    const uniqueKeys = new Set();
    const duplicates = [];

    allTransGroups.forEach(item => {
        const key = `${item.owner}|${item.name}|${item.type}`;
        if (uniqueKeys.has(key)) {
            duplicates.push(item);
        } else {
            uniqueKeys.add(key);
        }
    });

    if (duplicates.length > 0) {
        console.log(`\nDUPLICATES FOUND (${duplicates.length}):`);
        duplicates.forEach(d => {
            console.log(`  ${d.owner} | ${d.name} | ${d.type} (from sheet: ${d.sheet})`);
        });
    } else {
        console.log('\nNo duplicates found (all unique by OWNER|NAME|TYPE)');
    }

} catch (error) {
    console.error("Error reading file:", error.message);
}
