import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "./globals.css";

// ─── Metadata ───────────────────────────────────────────────
export const metadata: Metadata = {
  title: "MedAcademy",
  description: "Football team medical tracking and roster management",
};

// ─── Типы ───────────────────────────────────────────────────
type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

// ─── Layout ─────────────────────────────────────────────────
export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  // Защита: если кто-то вручную вбил /fr/... — 404
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // Загружаем словарь для текущей локали (серверно)
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {/*
          NextIntlClientProvider прокидывает словарь во все
          клиентские компоненты, чтобы useTranslations() работал.
        */}
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
