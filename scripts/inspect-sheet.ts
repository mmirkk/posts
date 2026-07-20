import * as XLSX from "xlsx";

const id = "1dss74R_EcymZiCXGpoLW4CM5256CMX5dfZyZLNoNlHE";
const urls = [
  `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`,
  `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`,
];

for (const url of urls) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    const body = await response.text();
    console.log(JSON.stringify({
      url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      length: body.length,
      preview: body.slice(0, 500),
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ url, error: error instanceof Error ? error.message : String(error) }));
  }
}

const workbookResponse = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`);
const workbook = XLSX.read(await workbookResponse.arrayBuffer(), { type: "array", cellDates: true });
console.log(JSON.stringify({
  sheets: workbook.SheetNames.map((name) => ({
    name,
    preview: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false }).slice(0, 5),
  })),
}, null, 2));

const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false });
const frequency = (key: string) => Object.entries(rows.reduce<Record<string, number>>((acc, row) => {
  const value = String(row[key] ?? "").trim() || "(vacío)";
  acc[value] = (acc[value] ?? 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1]);
console.log(JSON.stringify({
  rowCount: rows.length,
  emptyCopy: rows.filter((row) => !String(row.Copy ?? "").trim()).length,
  emptyDate: rows.filter((row) => !String(row.Fecha ?? "").trim()).length,
  networks: frequency("Red"),
  pautas: frequency("Pauta"),
  cu: frequency("CU"),
}, null, 2));
