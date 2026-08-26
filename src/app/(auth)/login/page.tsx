"use client";

import { login } from "@/actions/auth";
import { useActionState, useEffect, useRef } from "react";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const replayTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
  }, []);

  function replayVideoAfterPause() {
    replayTimerRef.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    }, 3000);
  }

  return <main className="login">
    <form action={action} className="card stack">
      <div>
        <div className="login-brand-frame">
          <video ref={videoRef} className="login-brand-video" autoPlay muted playsInline aria-label="MB Imob" onEnded={replayVideoAfterPause}>
            <source src="/mbimob.mp4" type="video/mp4" />
          </video>
        </div>
      </div>
      {state?.error && <div className="notice error">{state.error}</div>}
      <label className="field">E-mail<input name="email" type="email" required autoComplete="email" /></label>
      <label className="field">Senha<input name="password" type="password" required autoComplete="current-password" /></label>
      <button className="button" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
    </form>
  </main>;
}
