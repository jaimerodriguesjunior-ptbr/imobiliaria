const fs = require("fs");
const XLSX = require("xlsx");

const normalize = (value) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9]+/g, " ").trim().toUpperCase();

const money = (value) => {
  if (typeof value === "number") return Math.round(value * 100) / 100;
  const raw = String(value ?? "").replace(/[^0-9,.-]/g, "");
  if (!raw) return null;
  const decimal = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
  const parsed = decimal >= 0
    ? `${raw.slice(0, decimal).replace(/[.,]/g, "")}.${raw.slice(decimal + 1)}`
    : raw.replace(/[.,]/g, "");
  return Math.round(Number(parsed) * 100) / 100;
};

function splitCsv(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (const character of line) {
    if (character === '"') quoted = !quoted;
    else if (character === ";" && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  values.push(value);
  return values;
}

function parse(rows) {
  const headerRow = rows.findIndex((row) => row.some((value) => normalize(value) === "LOCATARIO") && row.some((value) => normalize(value) === "PROPRIETARIO"));
  const rawHeaders = rows[headerRow].map((value) => String(value ?? ""));
  const headers = rawHeaders.map(normalize);
  const column = (...names) => headers.findIndex((header) => names.includes(header));
  const fields = {
    contract: column("N CTR"), code: column("COD IMOVEL"), category: column("CATEGORIA"), street: column("ENDERECO"), number: column("N"), complement: column("AP SL"),
    renter: column("LOCATARIO"), owner: column("PROPRIETARIO"), rent: column("ALUGUEL"),
    commission: rawHeaders.findIndex((header, index) => !header.includes("%") && headers[index] === "TX ADM"),
    rate: rawHeaders.findIndex((header, index) => header.includes("%") && headers[index] === "TX ADM"),
  };
  return rows.slice(headerRow + 1).filter((row) => row.some((value) => String(value).trim())).map((row) => ({
    contract: String(row[fields.contract] ?? "").trim(), code: String(row[fields.code] ?? "").trim(), category: String(row[fields.category] ?? "").trim(), street: String(row[fields.street] ?? "").trim(), number: String(row[fields.number] ?? "").trim(), complement: String(row[fields.complement] ?? "").trim(),
    renter: String(row[fields.renter] ?? "").trim(), owner: String(row[fields.owner] ?? "").trim(), rent: money(row[fields.rent]), commission: money(row[fields.commission]), rate: money(row[fields.rate]),
  })).filter((row) => row.owner && row.street && row.number);
}

const workbook = XLSX.readFile("relatorio_1787662468853.xls");
const xlsRows = parse(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: true }));
const csvContent = new TextDecoder("windows-1252").decode(fs.readFileSync("relatorio_1787662468853.csv"));
const csvRows = parse(csvContent.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map(splitCsv));
const key = (row) => `${row.contract}|${row.code}`;
const fields = ["category", "street", "number", "complement", "renter", "owner", "rent", "commission", "rate"];
function compare(source, candidate) {
  const byKey = new Map(candidate.map((row) => [key(row), row]));
  const missing = [];
  const differences = [];
  for (const sourceRow of source) {
    const candidateRow = byKey.get(key(sourceRow));
    if (!candidateRow) { missing.push(key(sourceRow)); continue; }
    const changed = fields.filter((field) => typeof sourceRow[field] === "number" ? sourceRow[field] !== candidateRow[field] : normalize(sourceRow[field]) !== normalize(candidateRow[field]));
    if (changed.length) differences.push({ key: key(sourceRow), fields: changed });
  }
  return { rows: candidate.length, missing: missing.length, extra: candidate.filter((row) => !source.some((sourceRow) => key(sourceRow) === key(row))).length, differences: differences.length, samples: differences.slice(0, 5) };
}

async function auditDatabase() {
  const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
  const imports = await (await fetch(`${base}imob_imports?select=*&order=created_at.desc&limit=1`, { headers })).json();
  const imported = imports[0];
  const databaseRows = await (await fetch(`${base}imob_monthly_leases?import_id=eq.${imported.id}&select=contract_number,external_code,category,street,number,complement,rent_amount,commission_amount,commission_rate,imob_owners(name),imob_renters(name)`, { headers })).json();
  return {
    import: { source_filename: imported.source_filename, source_hash: imported.source_hash, status: imported.status },
    comparison: compare(xlsRows, databaseRows.map((row) => ({
      contract: row.contract_number, code: row.external_code, category: row.category, street: row.street, number: row.number, complement: row.complement,
      renter: row.imob_renters?.name, owner: row.imob_owners?.name, rent: money(row.rent_amount), commission: money(row.commission_amount), rate: money(row.commission_rate),
    }))),
  };
}

(async () => console.log(JSON.stringify({ xls: xlsRows.length, csv: compare(xlsRows, csvRows), database: await auditDatabase() }, null, 2)))();
