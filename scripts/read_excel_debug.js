const XLSX = require('xlsx');

const filePath = "C:\\Users\\khalida\\Downloads\\OBJECT DB TEAM 2 EPROC PHASE 3.xlsx";

try {
    const workbook = XLSX.readFile(filePath);

    console.log("All Sheet Names:", workbook.SheetNames);

    // Read the first few rows of "PROCEDURE" sheet if it exists, otherwise the first sheet again
    const targetSheetName = workbook.SheetNames.find(n => n.toUpperCase().includes('PROC')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[targetSheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`\n--- Previewing Sheet: ${targetSheetName} ---`);
    console.log("Headers:", XLSX.utils.sheet_to_json(sheet, { header: 1 })[0]);
    console.log("Data Preview (First 3 rows):");
    console.log(JSON.stringify(data.slice(0, 3), null, 2));

} catch (error) {
    console.error("Error reading file:", error.message);
}
