
const XLSX = require('xlsx');
const fs = require('fs');

const filename = "public/Object DB Kelompok 3 (1).xlsx";

try {
    const workbook = XLSX.readFile(filename);
    const result = {};

    workbook.SheetNames.forEach(sheetName => {
        if (sheetName.toUpperCase().includes("COLUMN")) {
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
            if (json.length > 0) {
                result[sheetName] = json.slice(0, 3); // First 3 rows
            }
        }
    });

    fs.writeFileSync('debug_output.json', JSON.stringify(result, null, 2));
    console.log("Done.");

} catch (e) {
    console.error("Error:", e.message);
}
