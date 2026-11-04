import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNav from "@/components/layout/AppNav";
import PwaRegister from "@/components/layout/PwaRegister";
import DemoModeBanner from "@/components/layout/DemoModeBanner";
import { getCurrentUser } from "@/lib/auth";
import { getRiskAlerts } from "@/lib/get-risk-alerts";
import { DEMO_CLUB_ID } from "@/lib/demo-generator";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Медичний штаб · Спортивна Академія",
  description: "Медичний дашборд для спортивного лікаря-травматолога",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MedAcademy",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
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
  const rawAlerts = user ? await getRiskAlerts() : [];
  const alerts = user?.role === "coach" ? rawAlerts.filter((a) => a.type !== "pharmacy") : rawAlerts;

  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-slate-200">
        {user && (
          <AppNav
            role={user.role}
            userName={user.fullName || user.email}
            alerts={alerts}
          />
        )}
        <main className={`${user ? "md:ml-16 pt-14 md:pt-0 pb-24 md:pb-6" : ""} flex-1 min-w-0 overflow-x-hidden`}>
          {user && user.clubId === DEMO_CLUB_ID && (
            <DemoModeBanner isDemoClub={true} />
          )}
          {children}
        </main>
        <PwaRegister />
      </body>
    </html>
  );
}
