import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNav from "@/components/layout/AppNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Медичний штаб · ФК «Чорноморець»",
  description: "Медичний дашборд для спортивного лікаря-травматолога",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-slate-200">
        <AppNav />
        {/* Відступ під бічну панель (десктоп) і нижню панель (мобіль) */}
        <main className="md:ml-16 pb-16 md:pb-0 flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
