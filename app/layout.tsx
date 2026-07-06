import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Porra de fútbol",
  description: "Organiza tu porra de fútbol para un partido: pronostica el marcador y gana el bote.",
};

export const viewport: Viewport = {
  themeColor: "#04100a",
};

// La CSP basada en nonce (middleware.ts) exige render por petición para que el
// nonce del HTML coincida con el de la cabecera; forzamos render dinámico.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="relative z-10 min-h-screen">{children}</body>
    </html>
  );
}
