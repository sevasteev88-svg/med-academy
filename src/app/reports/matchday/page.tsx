import { createClient } from "@/utils/supabase/server";
import { assertAuth } from "@/lib/auth";
import { canUserAccessTeam } from "@/lib/team-access";
import MatchdayProtocolClient from "@/components/reports/MatchdayProtocolClient";
import {
  getMatchdayProtocolSettingsAction,
} from "@/actions/club-settings-actions";
import { getMatchdayRosterAction } from "@/actions/match-roster-actions";
import { type MatchdayProtocolClubSettings } from "@/types/protocol";
import { type PreSeasonScreening } from "@/types/screening";
import { getPlayerAvailability } from "@/lib/availability";

export const metadata = {
  title: "Медичний протокол матчу (Matchday Protocol)",
  description: "Протокол допуску гравців до матчу та конструктор заявки (PDF-друк)",
};

export default async function MatchdayProtocolPage() {
  const auth = await assertAuth();
  const supabase = await createClient();

  const user = "user" in auth ? auth.user : null;
  const isCoachUser = user?.role === "coach";

  // 1. Отримуємо команди клубу
  const { data: teamsData } = await supabase
    .from("teams")
    .select("id, name, sort_order")
    .eq("club_id", user?.clubId || "00000000-0000-0000-0000-000000000001")
    .order("sort_order", { ascending: true });

  const rawTeams = teamsData || [];

  // Якщо користувач — тренер, фільтруємо виключно закріплені за ним команди
  let visibleTeams = rawTeams;
  if (isCoachUser && user) {
    visibleTeams = rawTeams.filter((t) => canUserAccessTeam(user, t.id));
  }

  const teamNames = visibleTeams.map((t) => t.name);
  const initialTeamName = teamNames[0] || (rawTeams[0]?.name ?? "U19");

  // 2. Отримуємо всі скринінги клубу для деталізації ЕКГ
  const clubId = user?.clubId || undefined;
  let screeningsQuery = supabase
    .from("player_screenings")
    .select("id, player_id, date, season, examiner_doctor, overall_status, valid_until, cardio_clearance, restrictions_notes, data, created_at")
    .order("date", { ascending: false });

  if (clubId) {
    screeningsQuery = screeningsQuery.eq("club_id", clubId);
  }

  const { data: screeningRows } = await screeningsQuery;

  const latestScreeningsMap = new Map<string, PreSeasonScreening>();

  (screeningRows || []).forEach((row: any) => {
    if (row.player_id && !latestScreeningsMap.has(row.player_id)) {
      latestScreeningsMap.set(row.player_id, {
        ...((row.data as PreSeasonScreening) || {}),
        id: row.data?.id || row.id,
        player_id: row.player_id,
        date: row.date,
        season: row.season ?? row.data?.season,
        examiner_doctor: row.examiner_doctor ?? row.data?.examiner_doctor,
        overall_status: row.overall_status ?? row.data?.overall_status,
        valid_until: row.valid_until ?? row.data?.valid_until,
        cardio_clearance: row.cardio_clearance ?? row.data?.cardio_clearance,
        restrictions_notes: row.restrictions_notes ?? row.data?.restrictions_notes,
        created_at: row.created_at ?? row.data?.created_at,
      });
    }
  });

  // 3. Отримуємо налаштування клубу для протоколу
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

  // 5. Отримуємо збережену заявку для команди за замовчуванням
  const initialRosterRes = await getMatchdayRosterAction(initialTeamName);

  return (
    <MatchdayProtocolClient
      players={flattenedPlayers}
      teams={teamNames}
      allClubTeams={rawTeams.map((t) => t.name)}
      initialSettings={protocolSettings}
      initialRoster={initialRosterRes.roster}
      userRole={user?.role || "doctor"}
      coachHasNoTeams={isCoachUser && teamNames.length === 0}
    />
  );
}
