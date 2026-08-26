import "./globals.css";
import type { Metadata } from "next";
import { PwaServiceWorker } from "@/components/PwaServiceWorker";

export const metadata: Metadata = {
  title: "MB Imob | DIMOB",
  description: "Gestão mensal de locações e DIMOBs",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", type: "image/png", sizes: "96x96" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><PwaServiceWorker />{children}</body></html>;
}
