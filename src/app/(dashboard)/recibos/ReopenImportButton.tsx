"use client";
import { reopenImport } from "@/actions/imobiliaria";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
export function ReopenImportButton({ importId }: { importId: string }) { const router = useRouter(); const [pending, startTransition] = useTransition(); return <button className="button secondary" disabled={pending} onClick={() => startTransition(async () => { const result = await reopenImport(importId); if (result.error) window.alert(result.error); else router.refresh(); })}>{pending ? "Reabrindo..." : "Reabrir importação para corrigir"}</button>; }
