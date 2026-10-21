import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isDoctor } from "@/lib/auth";
import { getClubReadinessConfigAction } from "@/actions/readiness-actions";
import DoctorReadinessSettingsClient from "@/components/readiness/DoctorReadinessSettingsClient";

export default async function ReadinessSettingsPage() {
  const user = await getCurrentUser();

  if (!user || !isDoctor(user.role)) {
    redirect("/team/readiness");
  }

  const config = await getClubReadinessConfigAction();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Хлібні крихти та заголовок */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
              <Link
                href="/team/readiness"
                className="hover:text-sky-400 transition-colors"
              >
                ← Готовність команди
              </Link>
              <span>/</span>
              <span className="text-slate-300">Налаштування порогових правил</span>
            </div>

            <div className="flex items-center gap-2.5 mt-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]" />
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Порогові правила готовності (Медичний регламент)
              </h1>
            </div>

            <p className="text-xs text-slate-400 mt-1">
              Управління пороговими значеннями ранкового світлофора та правами видимості для тренера
            </p>
          </div>

          <div>
            <Link
              href="/team/readiness"
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-300 transition-all inline-flex items-center gap-1.5"
            >
              <span>🚦</span>
              <span>До світлофора</span>
            </Link>
          </div>
        </div>

        <DoctorReadinessSettingsClient
          initialConfig={config}
          userRole={user.role}
        />
      </div>
    </div>
  );
}
