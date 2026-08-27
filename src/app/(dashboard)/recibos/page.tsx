import Link from "next/link";
import { getImportForReview, getImports, getReceipts } from "@/actions/imobiliaria-v2";
import { ReceiptReview } from "./ReceiptReviewSafe";
import { ReopenImportButton } from "./ReopenImportButton";

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ importId?: string }> }) {
  const { importId } = await searchParams;
  if (!importId) {
    const imports = await getImports();
    return <>
      <header className="top"><div><h1>Recibos</h1><p>Escolha uma competência já importada para revisar ou baixar os documentos.</p></div><Link className="button" href="/importar">Importar CSV</Link></header>
      {imports.length === 0 ? <section className="card"><p className="muted">Nenhuma importação encontrada.</p></section> : <section className="card"><div className="table-wrap"><table className="table"><thead><tr><th>Competência</th><th>Arquivo</th><th>Situação</th><th>Itens</th><th>Documentos</th><th></th></tr></thead><tbody>{imports.map((item: any) => {
        const rows = item.imob_monthly_leases || [];
        const receipts = item.imob_receipts || [];
        const historical = item.status === "superseded";
        const label = historical ? "Histórico substituído" : item.status === "confirmed" ? "Confirmada" : "Em revisão";
        return <tr key={item.id}><td><strong>{new Date(`${item.competence}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong></td><td>{item.source_filename}</td><td><span className={`badge ${item.status === "review" ? "pending" : historical ? "inactive" : ""}`}>{label}</span></td><td>{rows.length}</td><td>{receipts.length}</td><td><Link className="button secondary" href={`/recibos?importId=${item.id}`}>{historical || item.status === "confirmed" ? "Ver documentos" : "Revisar e gerar"}</Link></td></tr>;
      })}</tbody></table></div></section>}
    </>;
  }

  const { imported, rows } = await getImportForReview(importId);
  const historical = imported.status === "superseded";
  const receipts = imported.status === "review" ? [] : await getReceipts(importId);
  return <>
    <header className="top"><div><h1>Recibos de {new Date(`${imported.competence}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h1><p>{historical ? "Esta versão foi substituída e está disponível somente para consulta." : "Revise o resultado da importação antes de emitir."}</p></div><Link className="button secondary" href="/recibos">Voltar ao histórico</Link></header>
    {historical ? (
      <section className="card"><h2 style={{ marginTop: 0 }}>Importação histórica</h2><p className="muted">{rows.length} item(ns) registrados nesta versão. Os documentos abaixo permanecem acessíveis, mas esta importação não pode mais ser alterada.</p></section>
    ) : (
      <ReceiptReview importId={importId} initialRows={rows} initialStatus={imported.status}/>
    )}
    {imported.status === "confirmed" && receipts.length === 0 && <section className="card" style={{ marginTop: 18 }}><div className="notice error">Nenhum documento foi salvo para esta importação.</div><div style={{ marginTop: 12 }}><ReopenImportButton importId={importId}/></div></section>}
    {receipts.length > 0 && <section className="card" style={{ marginTop: 18 }}><div className="top" style={{ marginBottom: 12 }}><div><h2 style={{ marginTop: 0 }}>Documentos gerados</h2><p className="muted">{receipts.length} documento(s) pronto(s) para baixar.</p></div><a className="button" href={`/api/recibos/${importId}?zip=1`}>Baixar tudo (.zip)</a></div><div className="list">{receipts.map((receipt: any) => <a className="button secondary" href={`/api/recibos/${receipt.id}`} key={receipt.id}>Baixar {receipt.filename}</a>)}</div></section>}
  </>;
}
