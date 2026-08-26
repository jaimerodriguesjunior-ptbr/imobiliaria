"use client";

import { saveCompanySettings } from "@/actions/imobiliaria";
import { useActionState } from "react";

const labels: Record<string, string> = {
  razao_social: "Razão social", nome_fantasia: "Nome fantasia", cnpj: "CNPJ",
  logradouro: "Logradouro", numero: "Número", complemento: "Complemento", bairro: "Bairro",
  cidade: "Cidade", uf: "UF", cep: "CEP", creci: "CRECI", signatory_name: "Nome de quem assina",
  signatory_title: "Cargo de quem assina", document_label: "Identificação do documento",
};

export function SettingsForm({ initial, logoUrl }: { initial: Record<string, any> | null; logoUrl: string | null }) {
  const [state, action, pending] = useActionState((_: unknown, formData: FormData) => saveCompanySettings(formData), null);
  const fields = Object.keys(labels);

  return <form action={action} className="card stack" encType="multipart/form-data">
    <div><h2 style={{ margin: 0 }}>Dados da imobiliária</h2><p className="muted">Esses dados aparecem em todos os recibos gerados.</p></div>
    {state?.error && <div className="notice error">{state.error}</div>}
    {state?.success && <div className="notice success">Configuração salva.</div>}
    <div className="company-logo-field">
      <label className="field">Logo da imobiliária<input name="logo" type="file" accept="image/png,image/jpeg,image/webp"/></label>
      <p className="muted small">PNG, JPG ou WebP de até 5 MB. A logo aparece no menu para todos os usuários desta imobiliária.</p>
      {logoUrl && <div className="company-logo-preview"><img src={logoUrl} alt="Logo atual da imobiliária"/></div>}
    </div>
    <div className="form-grid">{fields.map((field) => <label className="field" key={field}>{labels[field]}<input name={field} defaultValue={initial?.[field] || (field === "document_label" ? "DIMOB" : field === "signatory_title" ? "Sócia – Administrativa" : "")}/></label>)}</div>
    <div><button className="button" disabled={pending}>{pending ? "Salvando..." : "Salvar configuração"}</button></div>
  </form>;
}
