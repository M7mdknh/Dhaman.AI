import { Inter } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import type { Metadata } from "next";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
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
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
