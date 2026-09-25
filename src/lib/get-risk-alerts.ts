import { createClient } from "@/utils/supabase/server";
import type { RiskAlertItem } from "@/components/alerts/RiskAlertsCenter";
import type { WearableBiometricsEntry } from "@/types/wearables";

export async function getRiskAlerts(): Promise<RiskAlertItem[]> {
  const supabase = await createClient();

  const [playersRes, injuriesRes, maturationRes, wearableLogsRes] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, position, team_id, teams ( id, name )"),
    supabase
      .from("injuries")
      .select("id, player_id, diagnosis, location, vas_score, status, date_of_injury, expected_return_date")
      .in("status", ["active", "rehabilitation"]),
    supabase
      .from("maturation_assessments")
      .select("player_id, risk_zone, growth_phase, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[WEARABLE]%")
      .order("date", { ascending: false })
      .limit(30),
  ]);

  const players = playersRes.data || [];
  const playerMap = new Map<string, any>(players.map((p) => [p.id, p]));
  const activeInjuries = injuriesRes.data || [];

  // Group latest maturation by player
  const matByPlayer = new Map<string, any>();
  for (const m of maturationRes.data || []) {
    if (!matByPlayer.has(m.player_id)) {
      matByPlayer.set(m.player_id, m);
    }
  }

  // Parse latest wearables
  const wearablesByPlayer = new Map<string, WearableBiometricsEntry>();
  for (const l of wearableLogsRes.data || []) {
    try {
      const raw = l.note.replace("[WEARABLE] ", "");
      const parsed: WearableBiometricsEntry = JSON.parse(raw);
      if (parsed.player_id && !wearablesByPlayer.has(parsed.player_id)) {
        wearablesByPlayer.set(parsed.player_id, parsed);
      }
    } catch {}
  }

  const alerts: RiskAlertItem[] = [];

  // 1. High VAS Pain Alerts (VAS >= 7)
  for (const inj of activeInjuries) {
    if (inj.vas_score >= 7) {
      const pl = playerMap.get(inj.player_id);
      if (pl) {
        alerts.push({
          id: `pain-${inj.id}`,
          type: "pain",
          severity: "critical",
          playerId: pl.id,
          playerName: `${pl.last_name} ${pl.first_name}`,
          teamName: pl.teams?.name || "Команда",
          position: pl.position,
          title: "Критичний рівень больового синдрому (ВАШ ≥ 7/10)",
          metric: `ВАШ ${inj.vas_score}/10`,
          mechanism: `Гострий біль у зоні ${inj.location}. Високий ризик поглиблення мікророзриву та рефлекторного спазму.`,
          actionRequired: "Терміново ізолювати від навантажень, призначити кріотерапію та діагностичний огляд.",
          timestamp: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
        });
      }
    }
  }

  // 2. Wearables Low Recovery (< 40%)
  for (const [playerId, wb] of wearablesByPlayer.entries()) {
    if (wb.recovery_score < 40) {
      const pl = playerMap.get(playerId);
      if (pl) {
        alerts.push({
          id: `wb-${wb.id || playerId}`,
          type: "wearable",
          severity: wb.recovery_score < 30 ? "critical" : "warning",
          playerId: pl.id,
          playerName: `${pl.last_name} ${pl.first_name}`,
          teamName: pl.teams?.name || "Команда",
          position: pl.position,
          title: "Критичне пригнічення відновлення (WHOOP / Apple)",
          metric: `Recovery ${wb.recovery_score}%`,
          mechanism: `Зниження HRV (${wb.hrv_rmssd || "—"} мс) та підвищений RHR (${wb.resting_hr || "—"} уд/хв). Ознаки симпатичного виснаження ВНС.`,
          actionRequired: "Знизити інтенсивність тренування на 40-50%, провести регідратацію та міофасціальний реліз.",
          timestamp: wb.date,
        });
      }
    }
  }

  // 3. Peak Height Velocity (PHV Red Zone) + Active Injury or High Load
  for (const [playerId, mat] of matByPlayer.entries()) {
    if (mat.risk_zone === "red") {
      const pl = playerMap.get(playerId);
      const playerInjury = activeInjuries.find((i) => i.player_id === playerId);
      if (pl && playerInjury) {
        alerts.push({
          id: `phv-${playerId}`,
          type: "phv",
          severity: "critical",
          playerId: pl.id,
          playerName: `${pl.last_name} ${pl.first_name}`,
          teamName: pl.teams?.name || "Команда",
          position: pl.position,
          title: "Травма у фазі пікового росту (PHV Red Zone)",
          metric: "PHV Зона Ризику",
          mechanism: "Незрілість зон росту апофізів та зміна довжини важелів скелета сповільнюють загоєння сухожилків.",
          actionRequired: "Виключити ударне осьове навантаження (стрибки, жорсткий контакт), збільшити термін реабілітації на 20%.",
          timestamp: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
        });
      }
    }
  }

  // 4. Overdue RTP target date
  const today = new Date().toISOString().split("T")[0];
  for (const inj of activeInjuries) {
    if (inj.expected_return_date && inj.expected_return_date < today) {
      const pl = playerMap.get(inj.player_id);
      if (pl) {
        const daysOver = Math.floor(
          (Date.now() - new Date(inj.expected_return_date).getTime()) / 86400000
        );
        alerts.push({
          id: `overdue-${inj.id}`,
          type: "overdue",
          severity: "warning",
          playerId: pl.id,
          playerName: `${pl.last_name} ${pl.first_name}`,
          teamName: pl.teams?.name || "Команда",
          position: pl.position,
          title: "Перевищено запланований термін повернення (RTP)",
          metric: `+${daysOver} дн. затримки`,
          mechanism: `Травма не закрита у розрахунковий термін (${inj.expected_return_date}). Можлива субклінічна симптоматика або страх рецидиву.`,
          actionRequired: "Провести повторний клінічний огляд та коригувати етап Return-to-Play на дошці RTP.",
          timestamp: today,
        });
      }
    }
  }

  return alerts;
}
