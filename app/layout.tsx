import type { Metadata } from "next";
import "./globals.css";
import "./house.css";
import "./casa-brand.css";

export const metadata: Metadata = {
  title: "Galega — Cloudflare · TESTE",
  description: "Ambiente isolado de teste para Casa e chat interno.",
  applicationName: "Galega — CF TESTE",
  icons: {
    icon: "/logo-galega.png",
    shortcut: "/logo-galega.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head><link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials"/><meta name="theme-color" content="#292f27"/></head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
