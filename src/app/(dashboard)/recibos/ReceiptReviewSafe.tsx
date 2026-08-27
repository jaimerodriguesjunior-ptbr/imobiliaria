"use client";

import { confirmImportAndGenerateSafe, saveReceiptSelection } from "@/actions/imobiliaria-v2";
import { formatCurrency } from "@/lib/domain";
import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Row = Record<string, any>;

function ownerName(row: Row) {
  return String(row.imob_owners?.name || "Proprietário sem nome");
}

export function ReceiptReview({
  importId,
  initialRows,
  initialStatus,
}: {
  importId: string;
  initialRows: Row[];
  initialStatus: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [phase, setPhase] = useState<"selection" | "summary">(
    initialStatus === "confirmed" ? "summary" : "selection",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const selectedRows = useMemo(
    () => initialRows.filter((row) => selected.includes(row.id)),
    [initialRows, selected],
  );
  const groupedRows = useMemo(
    () =>
      [...initialRows]
        .sort(
          (a, b) =>
            ownerName(a).localeCompare(ownerName(b), "pt-BR") ||
            String(a.street).localeCompare(String(b.street), "pt-BR") ||
            String(a.number).localeCompare(String(b.number), "pt-BR"),
        )
        .map((row, index, rows) => ({
          row,
          startsOwner: index === 0 || ownerName(row) !== ownerName(rows[index - 1]),
        })),
    [initialRows],
  );

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function review() {
    setError("");
    const result = await saveReceiptSelection(importId, selected);
    if (result.error) setError(result.error);
    else setPhase("summary");
  }

  function generate() {
    setError("");
    startTransition(async () => {
      const result = await confirmImportAndGenerateSafe(importId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  if (phase === "summary") {
    return (
      <section className="stack">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Conferência final</h2>
          <p className="muted">
            {selectedRows.length} item(ns) selecionado(s). Somente imóveis ativos ou
            alterados com dados completos gerarão documentos.
          </p>
          <div className="list">
            {selectedRows.map((row) => (
              <div className="receipt-row" key={row.id}>
                <div>
                  <strong>{row.imob_owners?.name}</strong>
                  <div className="muted">
                    {row.street}, {row.number} {row.complement}
                  </div>
                  <div className="small">
                    {row.imob_renters?.name || "Sem locatário"} ·{" "}
                    {formatCurrency(Number(row.rent_amount))} · comissão{" "}
                    {formatCurrency(Number(row.commission_amount))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="actions">
          {selectedRows.length > 0 && (
            <button className="button" onClick={generate} disabled={pending}>
              {pending ? "Gerando..." : "Gerar documentos"}
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => setPhase("selection")}
            disabled={pending}
          >
            Escolher novos documentos
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Selecione os recibos</h2>
        <p className="muted">
          A lista está agrupada por proprietário. Todos começam desmarcados; imóveis
          vazios ou proprietários ausentes ficam identificados com asterisco.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th></th><th>Imóvel</th><th>Locatário</th><th>Valores</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {groupedRows.map(({ row, startsOwner }) => {
                const canSelect = ["active", "changed", "pending_data"].includes(row.status);
                const tag =
                  row.status === "pending_data" ? "Dados pendentes" :
                  row.status === "vacant" ? "* Imóvel vazio" :
                  row.status === "owner_inactive" ? "* Proprietário inativo" :
                  row.status === "changed" ? "Alterado" : "Ativo";
                return (
                  <Fragment key={row.id}>
                    {startsOwner && (
                      <tr>
                        <td colSpan={5} style={{ background: "#eef3ff", color: "#2853aa", fontWeight: 800, paddingTop: 15 }}>
                          {ownerName(row)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td>
                        <input className="check" type="checkbox" checked={selected.includes(row.id)} disabled={!canSelect} onChange={() => toggle(row.id)} />
                      </td>
                      <td><strong>{row.street}, {row.number}</strong><br /><span className="muted">{row.complement || ""}</span></td>
                      <td>{row.imob_renters?.name || "—"}</td>
                      <td>{formatCurrency(Number(row.rent_amount))}<br /><span className="muted">Comissão {formatCurrency(Number(row.commission_amount))}</span></td>
                      <td>
                        <span className={`badge ${row.status === "pending_data" ? "pending" : row.status === "vacant" ? "vacant" : row.status === "owner_inactive" ? "inactive" : ""}`}>{tag}</span>
                        {row.change_notes?.length ? <div className="small muted" style={{ marginTop: 5 }}>{row.change_notes.join(" · ")}</div> : null}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      <div className="actions floating-actions">
        <button className="button" onClick={review}>Conferir seleção</button>
        <button className="button secondary" onClick={() => router.push("/cadastros")}>Corrigir cadastros</button>
      </div>
    </section>
  );
}
