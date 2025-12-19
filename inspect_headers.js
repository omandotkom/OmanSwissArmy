const XLSX = require('xlsx');

const file = 'C:\\SM_WORKSPACE\\EPOC_BACKUP_DB\\OBJECT DB TEAM 2 EPROC PHASE 3 (2).xlsx';

const interestSheets = ['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'SEQUENCE', 'TYPE', 'INDEX'];

console.log(`Reading: ${file}`);
try {
    const wb = XLSX.readFile(file);
    interestSheets.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        if (!ws) {
            console.log(`[${sheetName}] NOT FOUND`);
            return;
        }

        // Get headers (first row)
        const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
        console.log(`[${sheetName}] Headers: ${JSON.stringify(headers)}`);
    });
} catch (e) {
    console.error("Error:", e.message);
}
