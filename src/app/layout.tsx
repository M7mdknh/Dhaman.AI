import { Inter, Newsreader } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import type { Metadata } from "next";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Display serif for marketing/auth headlines only — the app UI stays on the
// sans. Light weights at large sizes; never used for body copy.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Daman — Corporate Underwriting",
    template: "%s · Daman",
  },
  description:
    "AI-powered Letter of Guarantee underwriting. The AI prepares the package; the Risk Officer decides.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
