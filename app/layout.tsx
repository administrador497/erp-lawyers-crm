import type { Metadata } from "next";
import { Source_Serif_4, Public_Sans } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-source-serif",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRM Omnicanal — ERP Lawyers & Associates",
  description: "CRM omnicanal para ERP Lawyers & Associates",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reading this (even unused) is what Next.js's CSP-nonce integration
  // expects from the root layout — see middleware.ts, which is what
  // actually generates the nonce and sets it as this x-nonce request
  // header. It also forces this layout (and therefore every route under
  // it) to render dynamically, which a per-request nonce requires anyway:
  // a statically cached page can never carry a value that must differ on
  // every request.
  await headers();

  return (
    <html lang="es" className={`${sourceSerif.variable} ${publicSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
