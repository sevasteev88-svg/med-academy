import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNav from "@/components/layout/AppNav";
import PwaRegister from "@/components/layout/PwaRegister";
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
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MedAcademy",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#070A13",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
        <PwaRegister />
      </body>
    </html>
  );
}
