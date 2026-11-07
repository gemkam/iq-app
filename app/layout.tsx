import "./globals.css";
import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import AuthGate from "@/components/AuthGate";
import { ThemeSync, themeBootScript } from "@/components/Theme";

export const metadata: Metadata = {
  title: "IQ - Quotations & Invoices",
  description: "Quotations and invoices for Oman businesses",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#05070d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ThemeSync />
        <AuthGate>
          <Nav />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
