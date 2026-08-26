import Link from "next/link";
import { logout } from "@/actions/auth";
export function Sidebar() { return <aside className="sidebar"><div className="brand">Imob<span>Recibos</span></div><nav className="nav"><Link href="/dashboard">Visão geral</Link><Link href="/importar">Importar CSV</Link><Link href="/recibos">Recibos</Link><Link href="/cadastros">Proprietários</Link><Link href="/configuracoes">Configurações</Link></nav><form action={logout} style={{ marginTop: 28 }}><button className="button secondary" type="submit">Sair</button></form></aside>; }
