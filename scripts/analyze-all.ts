import * as XLSX from "xlsx";

const wb = XLSX.readFile("planilha_mercearia.xlsx");

console.log("=== DETAILED ANALYSIS OF Planilha1 ===");
const s1 = wb.Sheets["Planilha1"];
const r1 = XLSX.utils.sheet_to_json(s1, { header: 1, raw: false });
r1.forEach((row: any, idx) => {
  if (row.length > 0 && row.some((c: any) => c !== null && c !== undefined && c !== "")) {
    console.log(`P1 Row ${idx + 1}: [col 0: "${row[0]}"] [col 1: "${row[1]}"] [col 2: "${row[2]}"] ... Total cols: ${row.length}`);
  }
});

console.log("\n=== DETAILED ANALYSIS OF Entradasaida ===");
const s2 = wb.Sheets["Entradasaida"];
const r2 = XLSX.utils.sheet_to_json(s2, { header: 1, raw: false });
r2.forEach((row: any, idx) => {
  if (row.length > 0 && row.some((c: any) => c !== null && c !== undefined && c !== "")) {
    console.log(`ES Row ${idx + 1}:`, JSON.stringify(row));
  }
});
