import { createClient } from "@/utils/supabase/server";
import { assertAuth } from "@/lib/auth";
import MatchdayProtocolClient from "@/components/reports/MatchdayProtocolClient";
import {
  getMatchdayProtocolSettingsAction,
} from "@/actions/club-settings-actions";
import { type MatchdayProtocolClubSettings } from "@/types/protocol";
import {
  type PreSeasonScreening,
} from "@/types/screening";
import { getPlayerAvailability } from "@/lib/availability";

export const metadata = {
  title: "Медичний протокол матчу (Matchday Protocol)",
  description: "Протокол допуску гравців до матчу (PDF-друк)",
};

export default async function MatchdayProtocolPage() {
  const auth = await assertAuth();
  const supabase = await createClient();

  // 1. Отримуємо команди клубу
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  const teams = (teamsData || []).map((t) => t.name);

  // 2. Отримуємо всі скринінги клубу для деталізації ЕКГ
  const { data: screeningLogs } = await supabase
    .from("injury_logs")
    .select("note, date")
    .like("note", "[SCREENING]%")
    .order("date", { ascending: false });

  const latestScreeningsMap = new Map<string, PreSeasonScreening>();

  (screeningLogs || []).forEach((log) => {
    try {
      const rawJson = log.note.replace("[SCREENING] ", "");
      const sc = JSON.parse(rawJson) as PreSeasonScreening;
      if (sc && sc.player_id && !latestScreeningsMap.has(sc.player_id)) {
        latestScreeningsMap.set(sc.player_id, sc);
      }
    } catch {}
  });

  // 3. Отримуємо налаштування клубу для протоколу
  const clubId = "user" in auth ? auth.user.clubId : undefined;
  const protocolSettings: MatchdayProtocolClubSettings =
    await getMatchdayProtocolSettingsAction(clubId);

  // 4. Отримуємо єдине джерело доступності гравців
  const availabilityReport = await getPlayerAvailability(clubId);

  const flattenedPlayers = availabilityReport.players.map((p) => {
    const sc = latestScreeningsMap.get(p.id) || null;
    const valid = p.hasValidScreening;

    // Визначаємо текст для колонки ЕКГ
    let ecgText = "Немає даних";
    if (sc) {
      if (sc.cardio_ecg_rest === "normal") ecgText = "Норма";
      else if (sc.cardio_ecg_rest === "borderline") ecgText = "Прикордонна";
      else if (sc.cardio_ecg_rest === "abnormal") ecgText = "Патологія";
      else if (sc.cardio_ecg_rest === "not_done") ecgText = "Не обстежено";
    }

    // Текст для медичного висновку
    let clearanceText = "Немає даних (Не допущено)";
    if (!sc || !valid) {
      clearanceText = "Немає даних (Не допущено)";
    } else if (p.status === "unavailable") {
      clearanceText = p.restriction_notes || "Не допущений (травма)";
    } else if (sc.overall_status === "disqualified") {
      clearanceText = "Медичне відсторонення";
    } else if (p.status === "restricted") {
      clearanceText = p.restriction_notes || `Обмежений (до ${p.max_minutes || 45} хв)`;
    } else if (sc.overall_status === "provisional") {
      clearanceText = "Умовний допуск (під наглядом)";
    } else {
      clearanceText = "Допущений без обмежень";
    }

    const latestInj = p.injuries[0];
    let daysMissed: number | null = null;
    if (latestInj?.date_of_injury) {
      const diffMs = Date.now() - new Date(latestInj.date_of_injury).getTime();
      daysMissed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    }

    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position,
      date_of_birth: p.date_of_birth || "",
      team_name: p.team_name || "—",
      availability_status: p.status,
      max_minutes: p.max_minutes,
      restriction_notes: p.restriction_notes,
      days_missed: daysMissed,
      expected_return_date: latestInj?.expected_return_date || null,
      isScreened: sc !== null,
      hasValidScreening: valid,
      ecgStatusText: ecgText,
      clearanceText: clearanceText,
      screeningDate: p.screeningDate,
      screeningValidUntil: p.screeningValidUntil,
      injuries: p.injuries,
    };
  });

  return (
    <MatchdayProtocolClient
      players={flattenedPlayers}
      teams={teams}
      initialSettings={protocolSettings}
    />
  );
}
