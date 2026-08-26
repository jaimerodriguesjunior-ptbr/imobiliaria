import { formatCurrency, moneyInWords } from "@/lib/domain";

type ReceiptData = {
  competence: string; company: Record<string, string | null>; owner: Record<string, string | null>;
  tenant: Record<string, string | null> | null; lease: Record<string, string | number | null>;
};

const text = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function renderReceiptDocument({ competence, company, owner, tenant, lease }: ReceiptData) {
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${competence}-01T12:00:00Z`)).toUpperCase();
  const address = [lease.street, lease.number, lease.complement].filter(Boolean).join(", ");
  const rent = Number(lease.rent_amount || 0);
  const commission = Number(lease.commission_amount || 0);
  const signatoryTitle = company.signatory_title || company.signatory_name || "Sócia – Administrativa";
  const signatoryName = company.signatory_name && company.signatory_name !== signatoryTitle ? company.signatory_name : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 1.55cm 1.7cm 1.35cm; }
    body { font-family: Arial, sans-serif; font-size: 12pt; color:#111; line-height:1.2; margin:0; }
    .top { text-align:left; font-weight:bold; margin:0 0 43px; line-height:1.18; }
    .fields { border:1px solid #111; border-collapse:collapse; border-spacing:0; width:100%; }
    .fields td { border-bottom:1px solid #111; padding:6px 5px; vertical-align:top; }
    .fields tr:last-child td { border-bottom:0; }
    .label { font-weight:bold; }
    .signature { margin-top:96px; text-align:center; line-height:1.18; page-break-inside:avoid; }
    .signature hr { border:0; border-top:1px solid #999; width:270px; margin:0 auto 8px; }
    .small { font-size:10pt; }
  </style></head><body>
    <div class="top">PLANILHA REFERENTE AO MÊS DE ${text(month)}<br>IMOBILIÁRIA: ${text(company.razao_social || company.nome_fantasia)}<br>CNPJ: ${text(company.cnpj)} &nbsp;&nbsp; ${text(company.document_label || "DIMOB")}/${text(competence.slice(0,4))}</div>
    <table class="fields" role="presentation"><tbody>
      <tr><td><span class="label">NOME DO LOCADOR:</span> ${text(owner.name)}</td></tr>
      <tr><td><span class="label">CPF/CNPJ DO LOCADOR:</span> ${text(owner.document)}</td></tr>
      <tr><td><span class="label">NOME DO LOCATÁRIO:</span> ${text(tenant?.name)}</td></tr>
      <tr><td><span class="label">CPF/CNPJ DO LOCATÁRIO:</span> ${text(tenant?.document)}</td></tr>
      <tr><td><span class="label">NUMERO DO CONTRATO:</span> ${text(lease.contract_number)}</td></tr>
      <tr><td><span class="label">ENDEREÇO DO IMÓVEL:</span> ${text(address)}</td></tr>
      <tr><td><span class="label">MUNICIPIO DO IMÓVEL:</span> ${text([lease.city, lease.state].filter(Boolean).join(" "))}</td></tr>
      <tr><td><span class="label">VALOR DO ALUGUEL MENSAL:</span> ${formatCurrency(rent)} (${moneyInWords(rent)})</td></tr>
      <tr><td><span class="label">VALOR DA COMISSÃO MENSAL:</span> ${formatCurrency(commission)} (${moneyInWords(commission)})</td></tr>
    </tbody></table>
    <div class="signature"><hr><div>${text(signatoryTitle)}</div>${signatoryName ? `<div>${text(signatoryName)}</div>` : ""}<div class="small">EMPREENDIMENTOS IMOBILIARIOS 4001<br>CRECI: ${text(company.creci)}</div></div>
  </body></html>`;
}
