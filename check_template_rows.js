const XLSX = require('xlsx');

const templatePath = 'C:\\SM_WORKSPACE\\OmanSwissArmyTool\\oman-swiss-army-tool\\public\\OBJ_DB_TEMPLATE.xlsx';

console.log("--- Analyzing Template Content Depth ---");
const wb = XLSX.readFile(templatePath);

['SEQUENCE', 'TABLE', 'PROCEDURE'].forEach(sheet => {
    const ws = wb.Sheets[sheet];
    if (!ws) return;

    const range = XLSX.utils.decode_range(ws['!ref']);
    console.log(`\nSHEET: ${sheet}`);
    console.log(`  Reported Range: ${ws['!ref']} (Rows: ${range.e.r + 1})`);

    // Check actual content
    const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log(`  Actual Data Rows (including header): ${json.length}`);

    if (json.length > 0) {
        console.log(`  Header: ${JSON.stringify(json[0])}`);
        if (json.length > 1) {
            console.log(`  First Data Row: ${JSON.stringify(json[1])}`);
        } else {
            console.log(`  (No data rows below header)`);
        }
    }
});
