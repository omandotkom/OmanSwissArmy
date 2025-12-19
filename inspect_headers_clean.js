const XLSX = require('xlsx');

const file = 'C:\\SM_WORKSPACE\\EPOC_BACKUP_DB\\OBJECT DB TEAM 2 EPROC PHASE 3 (2).xlsx';
// const file = 'C:\\SM_WORKSPACE\\EPOC_BACKUP_DB\\Object DB Kelompok 3.xlsx';

const interestSheets = ['TABLE', 'PROCEDURE', 'TRIGGER'];

console.log(`Checking file: ${file}`);
const wb = XLSX.readFile(file);

interestSheets.forEach(sheet => {
    const ws = wb.Sheets[sheet];
    if (!ws) return;
    const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
    console.log(`SHEET: ${sheet} -> HEADERS: ${headers.join(', ')}`);
});
