"use client";
import { processCsvImport } from "@/actions/imobiliaria-v2";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

function defaultCompetence() { return new Date().toISOString().slice(0, 7); }
export function ImportCsvForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  function acceptFile(file?: File) {
    if (!file) return;
    if (!/\.(csv|xls|xlsx)$/i.test(file.name)) { setError("Selecione um arquivo CSV, XLS ou XLSX."); return; }
    if (inputRef.current) { const transfer = new DataTransfer(); transfer.items.add(file); inputRef.current.files = transfer.files; }
    setError(""); setFileName(file.name);
  }
  function onDrop(event: React.DragEvent<HTMLLabelElement>) { event.preventDefault(); event.stopPropagation(); setDragging(false); acceptFile(event.dataTransfer.files?.[0]); }
  function submit(formData: FormData) { setError(""); startTransition(async () => { const result = await processCsvImport(formData); if (result.error) setError(result.error); else if (result.importId) router.push(`/recibos?importId=${result.importId}`); }); }
  return <form action={submit} className="stack">
    <div className="card stack"><div><h2 style={{ margin: 0 }}>Competência</h2><p className="muted">A comparação será feita contra a última competência confirmada anterior.</p></div><div className="form-grid"><label className="field">Mês e ano<input name="competence" type="month" defaultValue={defaultCompetence()} required /></label></div></div>
    <div className="card"><label className={`dropzone${dragging ? " dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={onDrop}><strong>{dragging ? "Solte o relatório aqui" : "Arraste o relatório ou selecione no computador"}</strong><span className="muted">Aceita CSV, XLS e XLSX. A planilha é lida sem considerar a largura visual das colunas.</span><input ref={inputRef} name="file" type="file" accept=".csv,text/csv,.xls,application/vnd.ms-excel,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={(event) => acceptFile(event.target.files?.[0])}/>{fileName && <span className="notice success">Arquivo selecionado: {fileName}</span>}</label></div>
    {error && <div className="notice error">{error}</div>}<div className="actions"><button className="button" disabled={pending}>{pending ? "Lendo e comparando..." : "Importar e revisar"}</button></div>
  </form>;
}
