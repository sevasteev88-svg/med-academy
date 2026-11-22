import type { Metadata, Viewport } from "next";
import { cache } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppNav from "@/components/layout/AppNav";
import LayoutMain from "@/components/layout/LayoutMain";
import PwaRegister from "@/components/layout/PwaRegister";
import DemoModeBanner from "@/components/layout/DemoModeBanner";
import ForcePasswordChangeModal from "@/components/layout/ForcePasswordChangeModal";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { DEMO_CLUB_ID } from "@/lib/demo-generator";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const getCurrentClubInfo = cache(async () => {
  const user = await getCurrentUser();
  let clubName: string | undefined;
  let clubLogoUrl: string | undefined;

  if (user?.clubId) {
    const supabase = await createClient();
    const { data: club } = await supabase
      .from("clubs")
      .select("name, logo_url")
      .eq("id", user.clubId)
      .maybeSingle();
    if (club?.name) clubName = club.name;
    if (club?.logo_url) clubLogoUrl = club.logo_url;
  }

  return { user, clubName, clubLogoUrl };
});

export async function generateMetadata(): Promise<Metadata> {
  const { clubName, clubLogoUrl } = await getCurrentClubInfo();
  const title = clubName
    ? `Медичний штаб · ${clubName}`
    : "Медичний штаб · Спортивна Академія";

  return {
    title,
    description: "Медичний дашборд для спортивного лікаря-травматолога",
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: clubName || "MedAcademy",
    },
    icons: clubLogoUrl
      ? {
          icon: [{ url: clubLogoUrl }],
          apple: [{ url: clubLogoUrl }],
        }
      : {
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
}

export const viewport: Viewport = {
  themeColor: "#070A13",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, clubName, clubLogoUrl } = await getCurrentClubInfo();

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
            clubId={user.clubId}
            clubName={clubName}
            clubLogoUrl={clubLogoUrl}
          />
        )}
        <LayoutMain hasStaffNav={Boolean(user)}>
          {user && user.clubId === DEMO_CLUB_ID && (
            <DemoModeBanner isDemoClub={true} />
          )}
          {user?.mustChangePassword && (
            <ForcePasswordChangeModal userEmail={user.email} />
          )}
          {children}
        </LayoutMain>
        <PwaRegister clubLogoUrl={clubLogoUrl} clubName={clubName} />
      </body>
    </html>
  );
}
