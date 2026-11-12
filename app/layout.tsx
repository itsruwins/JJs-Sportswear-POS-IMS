import type { Metadata, Viewport } from "next";
import { Archivo, Montserrat } from "next/font/google";
import { SHOP } from "@/lib/shop";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

// The logo's tagline lettering: only the brand voice uses it.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: "600",
  display: "swap",
});

export const metadata: Metadata = {
  // Pages under a layout with its own template (customer, admin) use that one instead.
  title: { default: `${SHOP.name} · Design it. Track it. Wear it.`, template: `%s · ${SHOP.name}` },
  description:
    `Custom team jerseys and sportswear from ${SHOP.name} in Legazpi City. Design with AI, pay your down payment by GCash, track your order live, and check sizes and stock online.`,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#110d0b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the theme script sets data-theme on <html> before React hydrates.
    <html lang="en" className={`${archivo.variable} ${montserrat.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
