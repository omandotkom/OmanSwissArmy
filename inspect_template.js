const XLSX = require('xlsx');

const templatePath = 'C:\\SM_WORKSPACE\\OmanSwissArmyTool\\oman-swiss-army-tool\\public\\OBJ_DB_TEMPLATE.xlsx';

console.log("Reading Template...");
const wb = XLSX.readFile(templatePath);

['PROCEDURE', 'TABLE', 'VIEW'].forEach(sheet => {
    const ws = wb.Sheets[sheet];
    if (ws) {
        const headers = XLSX.utils.sheet_to_json(ws, { header: 1 })[0];
        console.log(`TEMPLATE [${sheet}] HEADERS: ${JSON.stringify(headers)}`);
    } else {
        console.log(`TEMPLATE [${sheet}] MISSING`);
    }
});
