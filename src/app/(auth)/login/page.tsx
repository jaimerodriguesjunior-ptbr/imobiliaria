"use client";

import { login } from "@/actions/auth";
import { useActionState } from "react";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  return <main className="login">
    <form action={action} className="card stack">
      <div>
        <h1 style={{ margin: 0 }}>MB Imob</h1>
        <p className="muted">Entre com o usuário cadastrado no Supabase.</p>
      </div>
      {state?.error && <div className="notice error">{state.error}</div>}
      <label className="field">E-mail<input name="email" type="email" required autoComplete="email" /></label>
      <label className="field">Senha<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="button" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  </main>;
}
