import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNav from "@/components/layout/AppNav";
import { getCurrentUser } from "@/lib/auth";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-slate-200">
        {user && <AppNav role={user.role} userName={user.fullName || user.email} />}
        <main className={`${user ? "md:ml-16 pb-16 md:pb-0" : ""} flex-1`}>
          {children}
        </main>
      </body>
    </html>
  );
}
