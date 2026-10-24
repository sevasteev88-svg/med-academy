import { redirect } from "next/navigation";
import { getCurrentUser, isDoctor } from "@/lib/auth";
import { getComprehensiveClubSettingsAction } from "@/actions/club-settings-actions";
import ClubSettingsClient from "@/components/admin/ClubSettingsClient";

export const metadata = {
  title: "Налаштування клубу та онбординг · MedAcademy",
  description: "Керування клубом, кольорами, командами, Telegram-інтеграцією та CSV імпортом",
};

export default async function ClubSettingsPage() {
  const user = await getCurrentUser();

  if (!user || (!isDoctor(user.role) && user.role !== "admin")) {
    redirect("/");
  }

  const { settings, error } = await getComprehensiveClubSettingsAction();

  if (error || !settings) {
    return (
      <div className="min-h-screen text-slate-100 p-8 max-w-4xl mx-auto">
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
          Помилка завантаження налаштувань клубу: {error || "Не знайдено"}
        </div>
      </div>
    );
  }

  return <ClubSettingsClient initialSettings={settings} />;
}
