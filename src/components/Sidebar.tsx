"use client";

import Link from "next/link";
import { logout } from "@/actions/auth";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";

export function Sidebar({ logoUrl }: { logoUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const displayLogoUrl = logoUrl || "/equipe-imobiliaria.png";

  return <>
    <button className="mobile-menu-button" type="button" aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? <X size={22} /> : <Menu size={22} />}
    </button>
    {open && <button className="mobile-menu-backdrop" type="button" aria-label="Fechar menu" onClick={close} />}
    <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
      <div className="brand">MB Imob</div>
      <div className="sidebar-logo"><img src={displayLogoUrl} alt="Logo da imobiliária" /></div>
      <nav className="nav">
        <Link href="/dashboard" onClick={close}>Visão geral</Link>
        <div className="nav-divider" aria-hidden="true" />
        <Link href="/importar" onClick={close}>Importar CSV</Link>
        <Link href="/recibos" onClick={close}>DIMOBs</Link>
        <div className="nav-divider" aria-hidden="true" />
        <Link href="/cadastros" onClick={close}>Proprietários</Link>
      </nav>
      <div className="sidebar-footer">
        <Link href="/configuracoes" onClick={close}>Configuração</Link>
        <form action={logout}>
          <button className="sidebar-logout" type="submit"><LogOut size={16} /> Sair</button>
        </form>
      </div>
    </aside>
  </>;
}
