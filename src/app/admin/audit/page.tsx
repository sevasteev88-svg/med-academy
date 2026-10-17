import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import AuditLogViewerClient from "@/components/audit/AuditLogViewerClient";
import type { AuditLogEntry } from "@/types/database";

export const metadata = {
  title: "Журнал дій (Audit Log) · ФК «Чорноморець»",
  description: "Аудит безпеки та журналювання дій медичного та тренерського штабу",
};

export default async function AuditLogPage() {
  const user = await getCurrentUser();

  // Доступ тільки для ролі admin
  if (!user || !isAdmin(user.role)) {
    redirect("/");
  }

  const supabase = await createClient();

  // 1. Отримуємо записи audit_log для поточного клубу
  const { data: rawLogs, error: logError } = await supabase
    .from("audit_log")
    .select("*")
    .order("at", { ascending: false })
    .limit(200);

  // 2. Отримуємо профілі користувачів для мапінгу імен/пошт
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role");

  // 3. Отримуємо список гравців для відображення імен
  const { data: playersData } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .order("last_name", { ascending: true });

  const playerMap = new Map<string, string>();
  const playersList = (playersData || []).map((p) => {
    const fullName = `${p.last_name} ${p.first_name}`;
    playerMap.set(p.id, fullName);
    return { id: p.id, name: fullName };
  });

  const profileMap = new Map<string, { name: string }>();
  (profiles || []).forEach((pr) => {
    profileMap.set(pr.id, { name: pr.full_name || "" });
  });

  // Унікальні користувачі з логів
  const userMap = new Map<string, { id: string; name: string; email: string }>();

  const enrichedLogs = (rawLogs || []).map((log: AuditLogEntry) => {
    const uid = log.user_id;
    const profile = uid ? profileMap.get(uid) : undefined;
    const userName =
      profile?.name ||
      (uid && uid === user.id ? user.fullName : uid ? "Користувач" : "Батьки / Публічне посилання (OTP)");
    const userEmail = uid && uid === user.id ? user.email : "";
    const playerName = log.player_id ? playerMap.get(log.player_id) || "Невідомий гравець" : undefined;

    if (uid && !userMap.has(uid)) {
      userMap.set(uid, {
        id: uid,
        name: userName,
        email: userEmail,
      });
    }

    return {
      ...log,
      user_name: userName,
      user_email: userEmail,
      player_name: playerName,
    };
  });

  const usersList = Array.from(userMap.values());

  return (
    <div className="min-h-screen bg-background text-slate-200 p-5 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Заголовок та навігація */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-sky-500/20 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/"
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Дашборд
              </Link>
              <span className="text-slate-700">/</span>
              <span className="text-xs text-sky-400 font-medium">Безпека</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <span>🛡️</span>
              <span>Журнал дій (Audit Log)</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Неперервний та незмінний аудит дій персоналу в системі · Доступ тільки для адміністратора клубу
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/30">
              <span>👑</span>
              <span>Режим адміністратора</span>
            </span>
          </div>
        </div>

        {logError && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            ⚠️ Таблиця <code>audit_log</code> очікує виконання останньої міграції або сталася помилка зчитування: {logError.message}.
          </div>
        )}

        {/* Клієнтський компонент з фільтрами */}
        <AuditLogViewerClient
          initialLogs={enrichedLogs}
          users={usersList}
          players={playersList}
        />
      </div>
    </div>
  );
}
