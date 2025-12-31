import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ActivityTracker from "@/components/ActivityTracker";

import GlobalErrorTracker from "@/components/GlobalErrorTracker";

import ProductionConsoleSilencer from "@/components/ProductionConsoleSilencer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Oman Swiss Army Tool",
  description: "A Swiss Army Knife for developers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ProductionConsoleSilencer />
        <Suspense fallback={null}>
          <ActivityTracker />
        </Suspense>
        <GlobalErrorTracker>
          {children}
        </GlobalErrorTracker>
      </body>
    </html>
  );
}
