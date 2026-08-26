import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Imobiliária | Recibos", description: "Gestão mensal de locações e recibos" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
