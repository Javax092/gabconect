import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "Gabinete Conectado",
  description:
    "Infraestrutura segura de atendimento inteligente para WhatsApp com IA assistiva, compliance e supervisão humana."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body className={`${manrope.className} antialiased`}>{children}</body>
    </html>
  );
}
