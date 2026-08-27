import Link from "next/link";
import { getDashboardData } from "@/actions/imobiliaria-v2";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return <div className="dashboard-page">
    <div className="dashboard-inner">
      <header className="top">
        <div>
          <h1>Visão geral</h1>
          <p>Controle mensal de locações e recibos da imobiliária.</p>
        </div>
        <Link className="button" href="/importar">Importar CSV</Link>
      </header>
      <section className="grid">
        <div className="card metric"><span>Proprietários cadastrados</span><b>{data.ownerCount}</b></div>
        <div className="card metric"><span>Imóveis cadastrados</span><b>{data.propertyCount}</b></div>
        <div className="card metric"><span>Última importação</span><b style={{ fontSize: 18 }}>{data.lastImport ? new Date(`${data.lastImport.competence}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "Nenhuma"}</b><span>{data.lastImport?.status || "Aguardando CSV"}</span></div>
      </section>
      <section className="card" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>Como funciona</h2>
        <p className="muted">Importe o relatório mensal, revise os novos imóveis, alterações e ausências; depois selecione os recibos que deseja gerar.</p>
      </section>
    </div>
  </div>;
}
