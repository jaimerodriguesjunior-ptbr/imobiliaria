import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "MB Imob | DIMOB", description: "Gestão mensal de locações e DIMOBs" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
