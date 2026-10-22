import { createClient } from "@/utils/supabase/server";
import { assertAuth } from "@/lib/auth";
import MatchdayProtocolClient from "@/components/reports/MatchdayProtocolClient";
import {
  getMatchdayProtocolSettingsAction,
} from "@/actions/club-settings-actions";
import { type MatchdayProtocolClubSettings } from "@/types/protocol";
import {
  type PreSeasonScreening,
  isScreeningValid,
} from "@/types/screening";

export const metadata = {
  title: "Медичний протокол матчу (Matchday Protocol) · ФК «Чорноморець»",
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

  // 2. Отримуємо всі скринінги клубу для зіставлення з гравцями
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

  // 3. Отримуємо налаштування клубу для протоколу (назва бланка, офіційність, типовий лікар та тренер)
  const clubId = "user" in auth ? auth.user.clubId : undefined;
  const protocolSettings: MatchdayProtocolClubSettings =
    await getMatchdayProtocolSettingsAction(clubId);

  // 4. Отримуємо статус доступності гравців через coach_player_availability_view
  let flattenedPlayers: any[] = [];

  const { data: viewData, error: viewError } = await supabase
    .from("coach_player_availability_view")
    .select("*")
    .order("team_sort_order", { ascending: true })
    .order("last_name", { ascending: true });

  if (!viewError && viewData && viewData.length > 0) {
    flattenedPlayers = viewData.map((row: any) => {
      const sc = latestScreeningsMap.get(row.player_id) || null;
      const valid = isScreeningValid(sc);

      // Визначаємо текст для колонки ЕКГ
      let ecgText = "Немає даних";
      if (sc) {
        if (sc.cardio_ecg_rest === "normal") ecgText = "Норма";
        else if (sc.cardio_ecg_rest === "borderline") ecgText = "Прикордонна";
        else if (sc.cardio_ecg_rest === "abnormal") ecgText = "Патологія";
        else if (sc.cardio_ecg_rest === "not_done") ecgText = "Не обстежено";
      }

      // Визначаємо текст для колонки медичного висновку
      let clearanceText = "Немає даних (Не допущено)";
      if (!sc || !valid) {
        clearanceText = "Немає даних (Не допущено)";
      } else if (row.availability_status === "unavailable") {
        clearanceText = row.restriction_notes || "Не допущений (травма)";
      } else if (sc.overall_status === "disqualified") {
        clearanceText = "Медичне відсторонення";
      } else if (row.availability_status === "restricted") {
        clearanceText = row.restriction_notes || `Обмежений (до ${row.max_minutes || 45} хв)`;
      } else if (sc.overall_status === "provisional") {
        clearanceText = "Умовний допуск (під наглядом)";
      } else {
        clearanceText = "Допущений без обмежень";
      }

      return {
        id: row.player_id,
        first_name: row.first_name,
        last_name: row.last_name,
        position: row.position,
        date_of_birth: row.date_of_birth,
        team_name: row.team_name,
        availability_status: row.availability_status,
        max_minutes: row.max_minutes,
        restriction_notes: row.restriction_notes,
        days_missed: row.days_missed,
        expected_return_date: row.expected_return_date,
        isScreened: sc !== null,
        hasValidScreening: valid,
        ecgStatusText: ecgText,
        clearanceText: clearanceText,
        screeningDate: sc?.date || null,
        screeningValidUntil: sc?.valid_until || null,
        injuries: [],
      };
    });
  } else {
    // Резервний фолбек (до застосування міграції)
    const { data: fallbackData } = await supabase
      .from("teams")
      .select(`
        id,
        name,
        players (
          id,
          first_name,
          last_name,
          position,
          date_of_birth,
          archived_at,
          injuries (
            id,
            status,
            date_of_injury,
            expected_return_date
          )
        )
      `)
      .order("sort_order", { ascending: true });

    flattenedPlayers = (fallbackData || []).flatMap((t) =>
      (t.players || [])
        .filter((p: any) => !p.archived_at)
        .map((p: any) => {
          const activeInjuries = (p.injuries || []).filter(
            (i: any) => i.status === "active" || i.status === "rehabilitation"
          );
          const hasActive = activeInjuries.some((i: any) => i.status === "active");
          const hasRehab = activeInjuries.some((i: any) => i.status === "rehabilitation");

          let status: "available" | "restricted" | "unavailable" = "available";
          let restrictionNotes = "Повний допуск без обмежень";
          let maxMinutes = 90;

          if (hasActive) {
            status = "unavailable";
            maxMinutes = 0;
            restrictionNotes = "Повний спокій / лазарет. Не допущений до матчу.";
          } else if (hasRehab) {
            status = "restricted";
            maxMinutes = 45;
            restrictionNotes = "Обмежений допуск: до 45 хвилин гри.";
          }

          const latestInj = activeInjuries[0];
          let daysMissed: number | null = null;
          if (latestInj?.date_of_injury) {
            const diffMs = Date.now() - new Date(latestInj.date_of_injury).getTime();
            daysMissed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
          }

          const sc = latestScreeningsMap.get(p.id) || null;
          const valid = isScreeningValid(sc);

          let ecgText = "Немає даних";
          if (sc) {
            if (sc.cardio_ecg_rest === "normal") ecgText = "Норма";
            else if (sc.cardio_ecg_rest === "borderline") ecgText = "Прикордонна";
            else if (sc.cardio_ecg_rest === "abnormal") ecgText = "Патологія";
            else if (sc.cardio_ecg_rest === "not_done") ecgText = "Не обстежено";
          }

          let clearanceText = "Немає даних (Не допущено)";
          if (!sc || !valid) {
            clearanceText = "Немає даних (Не допущено)";
          } else if (status === "unavailable") {
            clearanceText = restrictionNotes;
          } else if (sc.overall_status === "disqualified") {
            clearanceText = "Медичне відсторонення";
          } else if (status === "restricted") {
            clearanceText = restrictionNotes;
          } else if (sc.overall_status === "provisional") {
            clearanceText = "Умовний допуск (під наглядом)";
          } else {
            clearanceText = "Допущений без обмежень";
          }

          return {
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            position: p.position,
            date_of_birth: p.date_of_birth,
            team_name: t.name,
            availability_status: status,
            max_minutes: maxMinutes,
            restriction_notes: restrictionNotes,
            days_missed: daysMissed,
            expected_return_date: latestInj?.expected_return_date ?? null,
            isScreened: sc !== null,
            hasValidScreening: valid,
            ecgStatusText: ecgText,
            clearanceText: clearanceText,
            screeningDate: sc?.date || null,
            screeningValidUntil: sc?.valid_until || null,
            injuries: activeInjuries,
          };
        })
    );
  }

  return (
    <div className="min-h-screen bg-background text-slate-200 p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
      <MatchdayProtocolClient
        players={flattenedPlayers}
        teams={teams}
        initialSettings={protocolSettings}
      />
    </div>
  );
}
