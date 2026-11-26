import type { Metadata } from "next";
import ParentPortalEntryClient from "@/components/parent/ParentPortalEntryClient";

export const metadata: Metadata = {
  title: "Сімейний кабінет батьків · Med-Academy",
  description: "Вхід до сімейного кабінету батьків за персональним посиланням або QR-кодом",
  manifest: "/api/parent/manifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Кабінет батьків",
  },
};

export default function ParentPortalIndexPage() {
  return <ParentPortalEntryClient />;
}
