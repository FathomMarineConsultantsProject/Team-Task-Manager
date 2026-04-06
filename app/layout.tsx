import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppDataProvider } from "@/components/providers/AppDataProvider";
import AppShell from "@/components/layout/AppShell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Team Task Manager",
  description: "Collaborative task and project workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className={`${inter.variable} bg-white text-slate-900`}>
        <div id="root">
          <AppDataProvider>
            <AppShell>{children}</AppShell>
          </AppDataProvider>
        </div>
        <div id="modal-root" />
      </body>
    </html>
  );
}