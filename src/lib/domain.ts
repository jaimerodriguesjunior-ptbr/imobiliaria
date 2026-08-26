export type CsvLease = {
  contractNumber: string;
  propertyCode: string;
  category: string;
  street: string;
  number: string;
  complement: string;
  tenantName: string;
  ownerName: string;
  rentAmount: number | null;
  commissionAmount: number | null;
  commissionRate: number | null;
};

export const normalizeText = (value = "") => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ").trim().toUpperCase();

export function parseBrazilianMoney(value = "") {
  const clean = value.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBrazilianRate(value = "") {
  return parseBrazilianMoney(value.replace("%", ""));
}

export function parseLeaseCsv(content: string): CsvLease[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const headerIndex = lines.findIndex((line) => normalizeText(line).includes("LOCATARIO") && normalizeText(line).includes("PROPRIETARIO"));
  if (headerIndex < 0) throw new Error("Não localizamos o cabeçalho do relatório de locações.");
  const headers = lines[headerIndex].split(";").map(normalizeText);
  const indexOf = (name: string) => headers.findIndex((header) => header === normalizeText(name));
  const column = (values: string[], name: string) => values[indexOf(name)]?.trim() || "";
  const required = ["Nº CTR", "COD. IMÓVEL", "ENDEREÇO", "Nº", "LOCATÁRIO", "PROPRIETÁRIO", "ALUGUEL", "TX. ADM."];
  if (required.some((name) => indexOf(name) < 0)) throw new Error("O CSV não possui todas as colunas necessárias do relatório.");

  return lines.slice(headerIndex + 1).map((line) => {
    const values = line.split(";");
    return {
      contractNumber: column(values, "Nº Ctr"), propertyCode: column(values, "Cod. Imóvel"), category: column(values, "Categoria"),
      street: column(values, "Endereço"), number: column(values, "Nº"), complement: column(values, "Ap/ Sl"),
      tenantName: column(values, "Locatário"), ownerName: column(values, "Proprietário"),
      rentAmount: parseBrazilianMoney(column(values, "Aluguel")), commissionAmount: parseBrazilianMoney(column(values, "Tx. Adm.")),
      commissionRate: parseBrazilianRate(column(values, "%Tx. Adm")),
    };
  }).filter((row) => row.ownerName && row.street && row.number);
}

export function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function moneyInWords(value: number | null | undefined) {
  const units = ["", "UM", "DOIS", "TRÊS", "QUATRO", "CINCO", "SEIS", "SETE", "OITO", "NOVE"];
  const teens = ["DEZ", "ONZE", "DOZE", "TREZE", "CATORZE", "QUINZE", "DEZESSEIS", "DEZESSETE", "DEZOITO", "DEZENOVE"];
  const tens = ["", "", "VINTE", "TRINTA", "QUARENTA", "CINQUENTA", "SESSENTA", "SETENTA", "OITENTA", "NOVENTA"];
  const hundreds = ["", "CENTO", "DUZENTOS", "TREZENTOS", "QUATROCENTOS", "QUINHENTOS", "SEISCENTOS", "SETECENTOS", "OITOCENTOS", "NOVECENTOS"];
  const belowThousand = (number: number): string => {
    if (number === 100) return "CEM";
    const parts: string[] = [];
    if (number >= 100) parts.push(hundreds[Math.floor(number / 100)]);
    const rest = number % 100;
    if (rest >= 20) {
      parts.push(tens[Math.floor(rest / 10)]);
      if (rest % 10) parts.push(units[rest % 10]);
    } else if (rest >= 10) parts.push(teens[rest - 10]);
    else if (rest) parts.push(units[rest]);
    return parts.filter(Boolean).join(" E ");
  };
  const integerWords = (number: number): string => {
    if (number === 0) return "ZERO";
    if (number < 1000) return belowThousand(number);
    if (number < 1_000_000) {
      const thousands = Math.floor(number / 1000);
      const remainder = number % 1000;
      const prefix = thousands === 1 ? "UM MIL" : `${belowThousand(thousands)} MIL`;
      return remainder ? `${prefix} E ${belowThousand(remainder)}` : prefix;
    }
    const millions = Math.floor(number / 1_000_000);
    const remainder = number % 1_000_000;
    const prefix = millions === 1 ? "UM MILHÃO" : `${integerWords(millions)} MILHÕES`;
    return remainder ? `${prefix} E ${integerWords(remainder)}` : prefix;
  };
  const cents = Math.round((Number(value || 0) + Number.EPSILON) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = cents % 100;
  const wholeLabel = whole === 1 ? "REAL" : "REAIS";
  if (!fraction) return `${integerWords(whole)} ${wholeLabel}`;
  return `${integerWords(whole)} ${wholeLabel} E ${integerWords(fraction)} ${fraction === 1 ? "CENTAVO" : "CENTAVOS"}`;
}

export function competenceToDate(value: string) { return `${value}-01`; }
export function previousCompetenceDate(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
}
