import type { Metadata } from "next";
import "./globals.css";
import { AppDataProvider } from "@/components/providers/AppDataProvider";
import AppShell from "@/components/layout/AppShell";

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
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white text-slate-900">
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
