import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { logAudit } from "@/lib/audit";
import PeriodSelector from "@/components/players/PeriodSelector";
import AnthropometrySection from "@/components/players/AnthropometrySection";
import PreSeasonScreeningCard from "@/components/players/PreSeasonScreeningCard";
import ReinjuryRiskWidget from "@/components/players/ReinjuryRiskWidget";
import DentalNutritionCard from "@/components/players/DentalNutritionCard";
import PlayerPhotoUploader from "@/components/players/PlayerPhotoUploader";
import WearablesBiometricsCard from "@/components/players/WearablesBiometricsCard";
import PlayerSportsIntelligenceCard from "@/components/players/PlayerSportsIntelligenceCard";
import PlayerRehabCheckinHistory from "@/components/players/PlayerRehabCheckinHistory";
import PlayerDevicesCard from "@/components/players/PlayerDevicesCard";
import TelegramBindingCard from "@/components/telegram/TelegramBindingCard";
import PlayerSubscriptionQuotaCard from "@/components/players/PlayerSubscriptionQuotaCard";
import { getPlayerActiveDevicesAction } from "@/actions/player-device-actions";
import { getPlayerTelegramStatusAction } from "@/actions/telegram-actions";
import { getOrGeneratePlayerPortalToken } from "@/actions/rehab-portal-action";
import LsiSymmetryAssessmentCard from "@/components/injuries/LsiSymmetryAssessmentCard";
import RehabExercisePlanBuilder from "@/components/injuries/RehabExercisePlanBuilder";
import { isScreeningValid, type PreSeasonScreening } from "@/types/screening";
import type { NutritionProfile } from "@/types/nutrition";
import type { PlayerPhoto } from "@/types/photo";
import type { WearableBiometricsEntry } from "@/types/wearables";
import type { RehabCheckinData } from "@/types/rehab-portal";
import type { LsiAssessmentRecord } from "@/types/lsi";
import type { PlayerCustomRehabPlan } from "@/types/exercise-library";
import PrintButton from "@/components/ui/PrintButton";
import { PlayerEhrTransferButton } from "@/components/players/PlayerEhrTransferButton";
import PlayerArchiveControl from "@/components/players/PlayerArchiveControl";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessTeam } from "@/lib/team-access";
import { POSITION_LABELS, POSITION_FULL, DOMINANT_UA, LOCATION_UA, SEVERITY_UA, INJURY_TYPE_UA, STATUS_UA } from "@/lib/constants";
import PlayerConsentsCard from "@/components/consents/PlayerConsentsCard";
import PlayerParentAccessCard from "@/components/parent/PlayerParentAccessCard";
import { getPlayerParentAccessStateAction } from "@/actions/parent-portal-actions";
import PlayerTreatmentsCard from "@/components/players/PlayerTreatmentsCard";
import PlayerAnamnesisCard from "@/components/players/PlayerAnamnesisCard";
import type { PlayerMedicalAnamnesis } from "@/types/player-anamnesis";
import PlayerProfileTabs from "@/components/players/PlayerProfileTabs";
import type { MedicalTreatmentEntry } from "@/types/pharmacy";
import { calculateAcwr } from "@/types/workload";
import {
  getPlayerConsentSummary,
  getActiveConsentDocuments,
} from "@/lib/consents";

function calcAge(dob: string) { return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000)); }
function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function vasVariant(v: number): "ok"|"warn"|"danger" { if(v>=7)return"danger";if(v>=4)return"warn";return"ok"; }
function statusVariant(s: string): "ok"|"warn"|"danger"|"neutral" { if(s==="active")return"danger";if(s==="rehabilitation")return"warn";return"neutral"; }
function calcDaysMissed(inj: any): number { if(inj.actual_return_date)return Math.max(0,Math.floor((new Date(inj.actual_return_date).getTime()-new Date(inj.date_of_injury).getTime())/86400000)); if(inj.status==="active"||inj.status==="rehabilitation")return daysSince(inj.date_of_injury); return 0; }

export default async function PlayerDetailPage({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{from?:string;to?:string;tab?:string}> }) {
  const { id } = await params; const { from, to, tab } = await searchParams;
  const supabase = await createClient();

  let injuryQuery = supabase.from("injuries").select("*").eq("player_id", id).order("date_of_injury", { ascending: false });
  if (from) injuryQuery = injuryQuery.gte("date_of_injury", from);
  if (to) injuryQuery = injuryQuery.lte("date_of_injury", to);

  const [
    currentUser,
    playerRes,
    injuriesRes,
    anthroRes,
    matRes,
    screeningLogsRes,
    nutritionLogsRes,
    rehabLogsRes,
    lsiLogsRes,
    planLogsRes,
    workloadRes,
    wellnessRes,
    treatmentLogsRes,
    anamnesisLogsRes,
  ] = await Promise.all([
    getCurrentUser(),
    supabase.from("players").select("*, teams ( name, category )").eq("id", id).single(),
    injuryQuery,
    supabase.from("anthropometry_logs").select("*").eq("player_id", id).order("date", { ascending: false }),
    supabase
      .from("maturation_assessments")
      .select("growth_phase, risk_zone, consensus_offset, age_at_measurement, created_at")
      .eq("player_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("player_screenings")
      .select("id, player_id, date, season, examiner_doctor, overall_status, valid_until, cardio_clearance, restrictions_notes, data, created_at")
      .eq("player_id", id)
      .order("date", { ascending: false }),
    supabase
      .from("player_nutrition_profiles")
      .select("id, player_id, date, data, created_at")
      .eq("player_id", id)
      .order("date", { ascending: false }),
    supabase
      .from("rehab_checkins")
      .select("*")
      .eq("player_id", id)
      .order("date", { ascending: false }),
    supabase
      .from("lsi_assessments")
      .select("*")
      .eq("player_id", id)
      .order("date", { ascending: false }),
    supabase
      .from("rehab_plans")
      .select("*")
      .eq("player_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("workload_sessions")
      .select("date, workload_au, duration_minutes, rpe_score")
      .eq("player_id", id)
      .order("date", { ascending: false })
      .limit(100),
    supabase
      .from("wellness_surveys")
      .select("date, total_score")
      .eq("player_id", id)
      .order("date", { ascending: false })
      .limit(50),
    supabase
      .from("medical_treatments")
      .select("*")
      .eq("player_id", id)
      .order("date", { ascending: false })
      .limit(100),
    supabase
      .from("player_anamnesis")
      .select("*")
      .eq("player_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const { data: player, error } = playerRes;
  if (error || !player) return notFound();

  // Сувора міжклубна ізоляція картки гравця
  if (currentUser?.clubId && player.club_id && player.club_id !== currentUser.clubId) {
    return notFound();
  }

  const isAdminUser = currentUser?.role === "admin";
  const isCoachUser = currentUser?.role === "coach";

  // Якщо це тренер — перевіряємо, чи має він доступ до команди цього футболіста
  if (isCoachUser && !canUserAccessTeam(currentUser, player.team_id)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="p-8 rounded-2xl bg-slate-900 border border-rose-500/30 text-center space-y-3 max-w-md shadow-2xl">
          <div className="text-4xl">⛔</div>
          <h2 className="text-lg font-bold text-white">Доступ обмежено</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Цей футболіст грає за іншу вікову категорію ({player.teams?.name || "інша команда"}). Ви маєте доступ лише до гравців закріплених за вами команд.
          </p>
          <Link
            href="/players"
            className="inline-block mt-3 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all"
          >
            ← Повернутися до списку моїх гравців
          </Link>
        </div>
      </div>
    );
  }

  // Неблокуюче логування перегляду картки гравця
  void logAudit({
    action: "view_player",
    entity: "player",
    entityId: id,
    playerId: id,
    userId: currentUser?.id,
    clubId: player.club_id || currentUser?.clubId,
  }).catch(() => {});

  const scopedClubId = currentUser?.clubId || player.club_id;
  const needWorkloadFallback = (workloadRes?.data || []).length === 0;
  const needWellnessFallback = (wellnessRes?.data || []).length === 0;

  let photoLogsQuery = supabase
    .from("injury_logs")
    .select("*")
    .like("note", `[PLAYER_PHOTO] %"player_id":"${id}"%`)
    .order("date", { ascending: false })
    .limit(10);
  if (scopedClubId) photoLogsQuery = photoLogsQuery.eq("club_id", scopedClubId);

  let wearableLogsQuery = supabase
    .from("injury_logs")
    .select("*")
    .like("note", `[WEARABLE] %"player_id":"${id}"%`)
    .order("date", { ascending: false })
    .limit(100);
  if (scopedClubId) wearableLogsQuery = wearableLogsQuery.eq("club_id", scopedClubId);

  const activeDocumentsPromise = getActiveConsentDocuments(player.club_id);

  const [
    photoLogsRes,
    wearableLogsRes,
    workloadLogsRes,
    wellnessLogsRes,
    portalToken,
    activeDocuments,
    consentSummary,
    devicesRes,
    telegramRes,
    subRes,
    parentAccessState,
  ] = await Promise.all([
    photoLogsQuery,
    wearableLogsQuery,
    needWorkloadFallback
      ? (() => {
          let q = supabase
            .from("injury_logs")
            .select("date, note")
            .like("note", `[WORKLOAD] %"player_id":"${id}"%`)
            .order("date", { ascending: false })
            .limit(100);
          if (scopedClubId) q = q.eq("club_id", scopedClubId);
          return q;
        })()
      : Promise.resolve({ data: [] as any[] }),
    needWellnessFallback
      ? (() => {
          let q = supabase
            .from("injury_logs")
            .select("date, note")
            .like("note", `[WELLNESS%"player_id":"${id}"%`)
            .order("date", { ascending: false })
            .limit(100);
          if (scopedClubId) q = q.eq("club_id", scopedClubId);
          return q;
        })()
      : Promise.resolve({ data: [] as any[] }),
    getOrGeneratePlayerPortalToken(id),
    activeDocumentsPromise,
    activeDocumentsPromise.then((docs) =>
      getPlayerConsentSummary(id, player.date_of_birth, player.club_id, docs)
    ),
    getPlayerActiveDevicesAction(id),
    getPlayerTelegramStatusAction(id),
    supabase.from("player_subscriptions").select("*").eq("player_id", id).maybeSingle(),
    getPlayerParentAccessStateAction(id),
  ]);

  const injuryList = injuriesRes.data ?? [];
  const measurements = anthroRes.data ?? [];
  const maturation = matRes.data?.[0] ?? null;

  const screenings: PreSeasonScreening[] = (screeningLogsRes.data || []).map((row: any) => ({
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
  }));

  const nutritionLogs: NutritionProfile[] = (nutritionLogsRes.data || []).map((row: any) => ({
    ...((row.data as NutritionProfile) || {}),
    id: row.data?.id || row.id,
    player_id: row.player_id,
    date: row.date,
    created_at: row.created_at ?? row.data?.created_at,
  }));

  const latestNutrition: NutritionProfile | null = nutritionLogs[0] || null;

  const latestAnamnesisRow = (anamnesisLogsRes.data || [])[0] as any;
  const anamnesisRecord: PlayerMedicalAnamnesis | null = latestAnamnesisRow
    ? {
        ...((latestAnamnesisRow.data as PlayerMedicalAnamnesis) || {}),
        player_id: latestAnamnesisRow.player_id,
        jersey_number: latestAnamnesisRow.jersey_number ?? latestAnamnesisRow.data?.jersey_number ?? null,
        phone: latestAnamnesisRow.phone ?? latestAnamnesisRow.data?.phone ?? null,
        blood_type: latestAnamnesisRow.blood_type ?? latestAnamnesisRow.data?.blood_type ?? null,
        allergies: latestAnamnesisRow.allergies ?? latestAnamnesisRow.data?.allergies ?? null,
        past_injuries: latestAnamnesisRow.past_injuries ?? latestAnamnesisRow.data?.past_injuries ?? null,
        initial_height:
          latestAnamnesisRow.initial_height != null
            ? Number(latestAnamnesisRow.initial_height)
            : latestAnamnesisRow.data?.initial_height ?? null,
        initial_weight:
          latestAnamnesisRow.initial_weight != null
            ? Number(latestAnamnesisRow.initial_weight)
            : latestAnamnesisRow.data?.initial_weight ?? null,
        created_at: latestAnamnesisRow.created_at ?? latestAnamnesisRow.data?.created_at,
      }
    : null;

  const photoLogs = (photoLogsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[PLAYER_PHOTO] ", "");
        const parsed = JSON.parse(rawJson);
        return parsed.player_id === id ? (parsed as PlayerPhoto) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as PlayerPhoto[];

  const currentPhotoUrl = photoLogs[0]?.photo_url || null;

  const wearableLogs = (wearableLogsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[WEARABLE] ", "");
        const parsed = JSON.parse(rawJson);
        return parsed.player_id === id ? (parsed as WearableBiometricsEntry) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as WearableBiometricsEntry[];

  const rehabCheckins: RehabCheckinData[] = (rehabLogsRes.data || []).map((row: any) => ({
    ...((row.data as RehabCheckinData) || {}),
    player_id: row.player_id,
    injury_id: row.injury_id ?? row.data?.injury_id ?? "",
    date: row.date,
    vas_score: row.vas_score ?? row.data?.vas_score,
    sleep_quality: row.sleep_quality ?? row.data?.sleep_quality,
    freshness_level: row.freshness_level ?? row.data?.freshness_level,
    muscle_soreness: row.muscle_soreness ?? row.data?.muscle_soreness,
    stress_level: row.stress_level ?? row.data?.stress_level,
  }));

  const lsiRecords: LsiAssessmentRecord[] = (lsiLogsRes.data || []).map((row: any) => ({
    ...((row.data as LsiAssessmentRecord) || {}),
    id: row.data?.id || row.id,
    player_id: row.player_id,
    injury_id: row.injury_id ?? row.data?.injury_id ?? null,
    date: row.date,
    injury_type: row.injury_type ?? row.data?.injury_type ?? "ligament",
    tested_limb: row.tested_limb ?? row.data?.tested_limb ?? "left",
    evaluator_name: row.evaluator_name ?? row.data?.evaluator_name ?? "",
    doctor_signature: row.doctor_signature ?? row.data?.doctor_signature ?? "",
    protocol_source: row.protocol_source ?? row.data?.protocol_source ?? "",
    phase_clearance: row.phase_clearance ?? row.data?.phase_clearance ?? "",
    overall_lsi_percent:
      row.overall_lsi_percent != null
        ? Number(row.overall_lsi_percent)
        : row.data?.overall_lsi_percent ?? 0,
    criteria_met: Boolean(row.criteria_met ?? row.data?.criteria_met),
    status: row.status ?? row.data?.status ?? "conditional",
    doctor_verdict: row.doctor_verdict ?? row.data?.doctor_verdict ?? "",
    notes: row.notes ?? row.data?.notes,
    created_at: row.created_at ?? row.data?.created_at,
  }));

  const latestPlanRow = (planLogsRes.data || [])[0] as any;
  const playerCustomPlan: PlayerCustomRehabPlan | null = latestPlanRow
    ? {
        ...((latestPlanRow.data as PlayerCustomRehabPlan) || {}),
        id: latestPlanRow.data?.id || latestPlanRow.id,
        player_id: latestPlanRow.player_id,
        target_injury_id: latestPlanRow.target_injury_id ?? latestPlanRow.data?.target_injury_id,
        status: latestPlanRow.status ?? latestPlanRow.data?.status ?? "approved",
        doctor_name: latestPlanRow.doctor_name ?? latestPlanRow.data?.doctor_name,
        approved_by: latestPlanRow.approved_by ?? latestPlanRow.data?.approved_by,
        approved_at: latestPlanRow.approved_at ?? latestPlanRow.data?.approved_at,
        created_at: latestPlanRow.created_at ?? latestPlanRow.data?.created_at,
      }
    : null;

  const playerTreatments: MedicalTreatmentEntry[] = (treatmentLogsRes.data || []).map((row: any) => ({
    ...((row.data as MedicalTreatmentEntry) || {}),
    id: row.legacy_entry_id || row.id,
    log_id: row.id,
    injury_id: row.injury_id,
    player_id: row.player_id,
    date: row.date,
    category: row.category,
    title: row.title,
    dosage_or_params: row.dosage_or_params,
    duration_days: row.duration_days,
    duration_note: row.duration_note,
    reason: row.reason,
    doctor_name: row.doctor_name,
    wada_status: row.wada_status,
    doctor_wada_confirmed: row.doctor_wada_confirmed,
    doctor_confirmation_note: row.doctor_confirmation_note,
    notes: row.notes,
    pharmacy_item_id: row.pharmacy_item_id,
    units_deducted: row.units_deducted != null ? Number(row.units_deducted) : null,
    created_at: row.created_at,
  }));

  const totalInjuries = injuryList.length;
  const totalDaysMissed = injuryList.reduce((s,i) => s + calcDaysMissed(i), 0);
  const activeCount = injuryList.filter(i => i.status === "active").length;
  const rehabCount = injuryList.filter(i => i.status === "rehabilitation").length;
  const closedCount = injuryList.filter(i => i.status === "closed").length;
  const daysByType: Record<string,number> = {}; const daysByLocation: Record<string,number> = {};
  for (const inj of injuryList) { const d = calcDaysMissed(inj); daysByType[inj.injury_type] = (daysByType[inj.injury_type]??0)+d; daysByLocation[inj.location] = (daysByLocation[inj.location]??0)+d; }
  const activeInjuries = injuryList.filter(i => i.status === "active" || i.status === "rehabilitation");
  const periodLabel = from ? `${from}${to ? ` — ${to}` : " — сьогодні"}` : "За весь час";

  // Обчислення зіграних хвилин для тренерського профілю (7 та 28 днів)
  const d7AgoDateStr = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split("T")[0];
  const d28AgoDateStr = new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString().split("T")[0];

  const totalMinutes7d = (workloadRes?.data || [])
    .filter((w: any) => w.date >= d7AgoDateStr)
    .reduce((sum: number, w: any) => sum + (Number(w.duration_minutes) || 0), 0);

  const totalMinutes28d = (workloadRes?.data || [])
    .filter((w: any) => w.date >= d28AgoDateStr)
    .reduce((sum: number, w: any) => sum + (Number(w.duration_minutes) || 0), 0);

  // Розрахунок показників для чесного індикатора AI-аналітика ризику (Задача 3.1)
  // 1. Зріст: заміри за останні 12 місяців
  const oneYearAgoStr = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().split("T")[0];
  const heightMeasurementsCount12m = (measurements || []).filter(
    (m) => m.date >= oneYearAgoStr && m.height_cm != null
  ).length;

  // 2. Навантаження та ACWR (потрібно >=28 днів історії)
  let playerWorkloadList: { date: string; workload_au: number }[] = (workloadRes?.data as any) || [];
  if (playerWorkloadList.length === 0 && workloadLogsRes?.data) {
    playerWorkloadList = workloadLogsRes.data
      .map((l) => {
        try {
          const raw = l.note.replace("[WORKLOAD] ", "");
          const parsed = JSON.parse(raw);
          return parsed.player_id === id ? { date: parsed.date, workload_au: parsed.workload_au } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];
  }

  let workloadDaysMonitored = 0;
  let playerAcwr: number | null = null;
  if (playerWorkloadList.length > 0) {
    const dates = playerWorkloadList.map((w) => w.date).sort();
    const earliest = new Date(dates[0]).getTime();
    workloadDaysMonitored = Math.floor((Date.now() - earliest) / (1000 * 60 * 60 * 24)) + 1;

    const d7Ago = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split("T")[0];
    const d28Ago = new Date(Date.now() - 28 * 24 * 3600 * 1000).toISOString().split("T")[0];

    const acuteLoad = playerWorkloadList
      .filter((w) => w.date >= d7Ago)
      .reduce((sum, w) => sum + (w.workload_au || 0), 0);
    const chronicLoad = playerWorkloadList
      .filter((w) => w.date >= d28Ago)
      .reduce((sum, w) => sum + (w.workload_au || 0), 0);

    const calc = calculateAcwr(acuteLoad, chronicLoad, {
      daysMonitored: workloadDaysMonitored,
      chronicSessionsCount: playerWorkloadList.filter((w) => w.date >= d28Ago).length,
    });
    playerAcwr = calc.acwr;
  }

  // 3. Велнес: кількість днів моніторингу (потрібно >=7 днів)
  let playerWellnessList: { date: string; total_score: number }[] = (wellnessRes?.data as any) || [];
  if (playerWellnessList.length === 0 && wellnessLogsRes?.data) {
    playerWellnessList = wellnessLogsRes.data
      .map((l) => {
        try {
          const raw = l.note.replace("[WELLNESS_ENTRY] ", "").replace("[WELLNESS] ", "");
          const parsed = JSON.parse(raw);
          return parsed.player_id === id ? { date: parsed.date, total_score: parsed.total_score || parsed.score } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as any[];
  }

  const distinctWellnessDays = new Set(playerWellnessList.map((w) => w.date)).size;
  const latestWellnessScore = playerWellnessList[0]?.total_score ?? null;

  const initials = `${player.last_name?.[0] ?? ""}${player.first_name?.[0] ?? ""}`;

  const playerSub = subRes?.data || null;

  const hasPhotoConsent = consentSummary.scopes.photo.allowed;
  const hasWearablesConsent = consentSummary.scopes.wearables.allowed;
  const hasAiConsent = consentSummary.scopes.ai_processing.allowed;
  const hasSupplementsConsent = consentSummary.scopes.supplements.allowed;
  const hasPendingConsents = !hasPhotoConsent || !hasWearablesConsent || !hasAiConsent || !hasSupplementsConsent;

  const activeDevices = devicesRes?.devices || [];

  return (
    <div className="min-h-screen text-slate-200 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Хлібні крихти */}
        <div className="flex items-center gap-2">
          <Link href="/players" className="text-slate-400 hover:text-sky-300 text-xs font-semibold transition-colors flex items-center gap-1">
            <span>←</span> До списку гравців
          </Link>
          <span className="text-slate-600 text-xs">/</span>
          <span className="text-slate-300 text-xs font-mono">{player.teams.name}</span>
        </div>

        {/* Hero Card футболіста */}
        <Card className="p-5 md:p-6 bg-slate-900/60 backdrop-blur-xl border border-sky-500/20 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              {/* Аватар з можливістю завантаження фото */}
              <PlayerPhotoUploader
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialPhotoUrl={currentPhotoUrl}
                initials={initials}
                requiresParentalConsent={!hasPhotoConsent}
              />

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    {player.last_name} {player.first_name}
                  </h1>
                  {anamnesisRecord?.jersey_number && (
                    <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 font-mono text-xs font-black shadow-sm">
                      #{anamnesisRecord.jersey_number}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 font-mono text-xs font-bold">
                    {POSITION_LABELS[player.position] ?? player.position}
                  </span>
                  {anamnesisRecord?.blood_type && (
                    <span className="px-2 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono text-xs font-bold flex items-center gap-1 shadow-sm">
                      <span>🩸</span>
                      <span>{anamnesisRecord.blood_type}</span>
                    </span>
                  )}
                  {anamnesisRecord?.allergies && (
                    <span
                      className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 shadow-sm"
                      title={anamnesisRecord.allergies}
                    >
                      <span>⚠️</span>
                      <span className="max-w-[140px] truncate">Алергія: {anamnesisRecord.allergies}</span>
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{player.teams.name}</span>
                  <span>·</span>
                  <span>{POSITION_FULL[player.position] ?? player.position}</span>
                  <span>·</span>
                  <span>{calcAge(player.date_of_birth)} років ({new Date(player.date_of_birth).toLocaleDateString("uk-UA")})</span>
                  <span>·</span>
                  <span>Нога: <strong className="text-slate-200">{DOMINANT_UA[player.dominant_leg]}</strong></span>
                  {anamnesisRecord?.phone && (
                    <>
                      <span>·</span>
                      <span>Тел: <strong className="text-slate-200 font-mono">{anamnesisRecord.phone}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Статус бойової готовності */}
            <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800 shrink-0">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Медичний допуск:</span>
              {activeInjuries.length > 0 ? (
                activeInjuries.map((inj: any) => (
                  <Badge key={inj.id} variant={vasVariant(inj.vas_score)}>
                    ВАШ {inj.vas_score}/10
                  </Badge>
                ))
              ) : !screenings[0] || !isScreeningValid(screenings[0]) ? (
                screenings[0] && screenings[0].overall_status === "provisional" ? (
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm shadow-amber-500/10 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Умовний допуск
                  </span>
                ) : screenings[0] && screenings[0].overall_status === "disqualified" ? (
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm shadow-rose-500/10 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    Відсторонений
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-xl text-xs font-bold bg-slate-700/40 text-slate-400 border border-slate-600/50 shadow-sm flex items-center gap-1.5" title="Необхідно внести або оновити передсезонний медичний скринінг">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Допуск не підтверджено
                  </span>
                )
              ) : (
                <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Готовий до гри
                </span>
              )}
            </div>
          </div>

          {/* Панель швидких дій */}
          <div className="mt-5 pt-4 border-t border-sky-500/15 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/injuries/new?playerId=${id}`}
                className="bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold py-2 px-3.5 rounded-xl text-xs transition-all shadow-md shadow-sky-600/20 active:scale-95 flex items-center gap-1.5"
              >
                <span>+</span> Фіксувати травму
              </Link>
              <Link
                href={`/wellness?playerId=${id}`}
                className="border border-sky-500/30 bg-slate-900/60 hover:bg-slate-800 text-sky-300 font-semibold py-2 px-3.5 rounded-xl text-xs transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span>⚡</span> Внести велнес
              </Link>
              <Link
                href={`/players/${id}/edit`}
                className="border border-slate-800 bg-slate-900/40 hover:bg-slate-800 text-slate-300 font-semibold py-2 px-3 rounded-xl text-xs transition-all active:scale-95"
              >
                ✏️ Редагувати
              </Link>
              <PrintButton label="PDF Паспорт" entity="player" entityId={id} playerId={id} />
              <PlayerEhrTransferButton
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                doctorName={currentUser?.fullName || "Лікар клубу"}
              />
            </div>
            <PlayerArchiveControl
              playerId={id}
              playerLastName={player.last_name}
              playerFirstName={player.first_name}
              isArchived={Boolean(player.archived_at)}
              archivedAt={player.archived_at}
              archiveReason={player.archive_reason}
              hasOpenInjuries={activeInjuries.length > 0}
              openInjuriesCount={activeInjuries.length}
              isAdmin={isAdminUser}
            />
          </div>
        </Card>

        {/* ТРЕНЕРСЬКЕ РЕЗЮМЕ ГРАВЦЯ (COACH VIEW) */}
        {isCoachUser && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 border border-sky-500/40 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Тренерське резюме: статус та навантаження
                </h3>
              </div>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Очима тренера
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-1">Медичний режим:</span>
                {activeInjuries.length > 0 ? (
                  <span className="text-rose-400 font-black flex items-center gap-1.5">
                    <span>⛔</span> Лазарет ({calcDaysMissed(activeInjuries[0])} дн.)
                  </span>
                ) : screenings[0] && screenings[0].overall_status === "provisional" ? (
                  <span className="text-amber-400 font-black flex items-center gap-1.5">
                    <span>⏱️</span> Щадний (макс 45 хв)
                  </span>
                ) : (
                  <span className="text-emerald-400 font-black flex items-center gap-1.5">
                    <span>✓</span> Загальна група (90+ хв)
                  </span>
                )}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-1">Хвилини за 7 днів:</span>
                <span className="text-sky-300 font-mono font-black text-base">
                  {totalMinutes7d} хв
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">тренування + матчі</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-1">Хвилини за 28 днів:</span>
                <span className="text-white font-mono font-black text-base">
                  {totalMinutes28d} хв
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">місячний обсяг</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-1">Індекс втоми (ACWR):</span>
                <span
                  className={`font-mono font-black text-base ${
                    playerAcwr && playerAcwr > 1.4
                      ? "text-rose-400"
                      : playerAcwr && playerAcwr < 0.8
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}
                >
                  {playerAcwr ? playerAcwr.toFixed(2) : "Норма"}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">оптимум: 0.8 – 1.3</span>
              </div>
            </div>

            {/* Вказівки для тренувального процесу */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-blue-900/40 text-xs space-y-1">
              <strong className="text-sky-300 flex items-center gap-1.5">
                <span>🎯</span> Рекомендації для тренувального процесу від медичного штабу:
              </strong>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                {activeInjuries.length > 0
                  ? `Гравець перебуває на стадії реабілітації (${
                      INJURY_TYPE_UA[activeInjuries[0].injury_type] ?? activeInjuries[0].injury_type
                    }). Участь у загальних групових тренуваннях та двосторонніх матчах категорично заборонена.`
                  : screenings[0]?.overall_status === "provisional"
                  ? "Дозволено участь у тренуваннях з контролем втоми (жовтий жилет). Рекомендується обмеження контактних єдиноборств та скорочення тривалості спринтерських серій."
                  : "Гравець допущений до тренувань у загальній групі без обмежень. Слідкуйте за розминкою та відновленням."}
              </p>
            </div>
          </div>
        )}

        {/* Вкладки медичного профілю гравця (Варіант 1) */}
        <PlayerProfileTabs
          activeInjuriesCount={activeInjuries.length}
          hasPendingConsents={hasPendingConsents}
          overview={
            <>
              {/* Повідомлення про поточний стан / активну травму */}
              {activeInjuries.length > 0 ? (
                <div className="p-4 md:p-5 rounded-2xl bg-rose-950/30 border border-rose-500/40 shadow-lg shadow-rose-950/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 rounded-xl bg-rose-500/20 text-rose-300 text-2xl shrink-0">
                      ⚠️
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm md:text-base font-bold text-white">
                          Активне пошкодження: {INJURY_TYPE_UA[activeInjuries[0].injury_type] ?? activeInjuries[0].injury_type} — {LOCATION_UA[activeInjuries[0].location] ?? activeInjuries[0].location}
                        </span>
                        <Badge variant={vasVariant(activeInjuries[0].vas_score)}>
                          ВАШ {activeInjuries[0].vas_score}/10
                        </Badge>
                        <Badge variant={statusVariant(activeInjuries[0].status)}>
                          {STATUS_UA[activeInjuries[0].status] ?? activeInjuries[0].status}
                        </Badge>
                      </div>
                      <p className="text-xs text-rose-200/80 mt-1">
                        Днів на відновленні: <strong className="text-white font-mono">{calcDaysMissed(activeInjuries[0])}</strong> · Зафіксовано: {new Date(activeInjuries[0].date_of_injury).toLocaleDateString("uk-UA")}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/players/${id}?tab=injuries`}
                    className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                  >
                    <span>План реабілітації</span>
                    <span>→</span>
                  </Link>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-950/25 border border-emerald-500/30 shadow-md flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50 shrink-0" />
                    <span className="text-xs md:text-sm font-semibold text-emerald-300">
                      Активних скарг та відкритих травм не зафіксовано. Гравець займається в загальній групі.
                    </span>
                  </div>
                  <Link
                    href={`/injuries/new?playerId=${id}`}
                    className="text-xs font-semibold text-slate-400 hover:text-white transition-colors shrink-0"
                  >
                    + Фіксувати травму
                  </Link>
                </div>
              )}

              {/* Індикатор оцінки ризику реінжурі */}
              <ReinjuryRiskWidget
                playerName={`${player.last_name} ${player.first_name}`}
                heightMeasurementsCount12m={heightMeasurementsCount12m}
                growthPhase={maturation?.growth_phase}
                hasPhvRecorded={Boolean(maturation?.growth_phase)}
                workloadDaysMonitored={workloadDaysMonitored}
                acwr={playerAcwr}
                wellnessDaysRecorded={distinctWellnessDays}
                wellnessScore={latestWellnessScore}
                reinjuryCount={injuryList.filter((i) => i.status === "closed").length}
                hasActiveDiscomfort={activeInjuries.length > 0}
              />

              {/* Швидкі оглядові плашки статусів */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <Card className="p-4 bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-mono text-slate-400 mb-1 flex items-center justify-between">
                      <span>Скринінг / Допуск</span>
                      <span>🩺</span>
                    </div>
                    <div className="text-sm font-bold text-white mt-1">
                      {screenings[0] ? (
                        screenings[0].overall_status === "cleared" ? (
                          <span className="text-emerald-400">Пройдено повний скринінг</span>
                        ) : screenings[0].overall_status === "provisional" ? (
                          <span className="text-amber-400">Умовний допуск</span>
                        ) : (
                          <span className="text-rose-400">Відсторонений</span>
                        )
                      ) : (
                        <span className="text-slate-400">Скринінг не внесено</span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/players/${id}?tab=passport`}
                    className="text-[11px] text-sky-400 hover:text-sky-300 mt-3 inline-flex items-center gap-1 font-semibold"
                  >
                    <span>Відкрити медпаспорт</span>
                    <span>→</span>
                  </Link>
                </Card>

                <Card className="p-4 bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-mono text-slate-400 mb-1 flex items-center justify-between">
                      <span>Анамнез травм</span>
                      <span>📊</span>
                    </div>
                    <div className="text-sm font-bold text-white mt-1">
                      {totalInjuries === 0 ? (
                        <span className="text-emerald-400">Травм не зафіксовано</span>
                      ) : (
                        <span>{totalInjuries} травм ({totalDaysMissed} дн. пропущено)</span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/players/${id}?tab=injuries`}
                    className="text-[11px] text-sky-400 hover:text-sky-300 mt-3 inline-flex items-center gap-1 font-semibold"
                  >
                    <span>Історія та реабілітація</span>
                    <span>→</span>
                  </Link>
                </Card>

                <Card className="p-4 bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-mono text-slate-400 mb-1 flex items-center justify-between">
                      <span>Згоди законних представників</span>
                      <span>📋</span>
                    </div>
                    <div className="text-sm font-bold text-white mt-1">
                      {!hasPendingConsents ? (
                        <span className="text-emerald-400">Всі згоди підписано</span>
                      ) : (
                        <span className="text-amber-400">Потрібно підтвердження</span>
                      )}
                    </div>
                  </div>
                  <Link
                    href={`/players/${id}?tab=profile`}
                    className="text-[11px] text-sky-400 hover:text-sky-300 mt-3 inline-flex items-center gap-1 font-semibold"
                  >
                    <span>Керувати згодами та ШІ</span>
                    <span>→</span>
                  </Link>
                </Card>
              </div>
            </>
          }
          injuries={
            <>
              {/* Період аналізу травм */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-mono font-bold text-sky-400 tracking-wider">
                    Період аналізу травм
                  </span>
                  <div className="flex-1 h-px bg-sky-500/15" />
                </div>
                <PeriodSelector />
              </section>

              {/* Статистика травм гравця */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>📊</span> Статистика травм <span className="text-slate-400 font-mono text-xs font-normal">({periodLabel})</span>
                  </h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="p-3.5"><div className="text-[10px] uppercase font-mono text-slate-400 mb-1">Всього травм</div><div className="text-2xl font-black font-mono text-white">{totalInjuries}</div></Card>
                  <Card className="p-3.5"><div className="text-[10px] uppercase font-mono text-slate-400 mb-1">Днів пропущено</div><div className="text-2xl font-black font-mono text-red-400">{totalDaysMissed}</div></Card>
                  <Card className="p-3.5"><div className="text-[10px] uppercase font-mono text-slate-400 mb-1">Активних / Реаб.</div><div className="text-2xl font-black font-mono text-amber-400">{activeCount} / {rehabCount}</div></Card>
                  <Card className="p-3.5"><div className="text-[10px] uppercase font-mono text-slate-400 mb-1">Закритих</div><div className="text-2xl font-black font-mono text-emerald-400">{closedCount}</div></Card>
                </div>

                {totalInjuries > 0 && (
                  <div className="grid md:grid-cols-2 gap-3">
                    <Card className="p-4">
                      <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
                        <span>⚡</span> Розподіл по типу
                      </div>
                      <div className="space-y-2">
                        {Object.entries(daysByType).sort(([,a],[,b])=>b-a).map(([t,d])=>(
                          <div key={t} className="flex justify-between items-center text-xs">
                            <span className="text-slate-300 truncate">{INJURY_TYPE_UA[t]??t}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="h-1.5 rounded-full bg-red-950/60 border border-red-900/30 w-20 overflow-hidden">
                                <div className="h-full rounded-full bg-red-500" style={{width:`${Math.min(100,(d/Math.max(totalDaysMissed,1))*100)}%`}}/>
                              </div>
                              <span className="font-mono text-slate-400 w-12 text-right">{d} дн.</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card className="p-4">
                      <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
                        <span>🦴</span> Розподіл по локалізації
                      </div>
                      <div className="space-y-2">
                        {Object.entries(daysByLocation).sort(([,a],[,b])=>b-a).map(([l,d])=>(
                          <div key={l} className="flex justify-between items-center text-xs">
                            <span className="text-slate-300 truncate">{LOCATION_UA[l]??l}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="h-1.5 rounded-full bg-amber-950/60 border border-amber-900/30 w-20 overflow-hidden">
                                <div className="h-full rounded-full bg-amber-500" style={{width:`${Math.min(100,(d/Math.max(totalDaysMissed,1))*100)}%`}}/>
                              </div>
                              <span className="font-mono text-slate-400 w-12 text-right">{d} дн.</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                )}
              </section>

              {/* План реабілітації */}
              <RehabExercisePlanBuilder
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialPlan={playerCustomPlan}
                activeInjuries={activeInjuries}
                currentRtpPhase={playerCustomPlan?.target_rtp_phase || 1}
                defaultDoctorName={currentUser?.fullName || currentUser?.email || "Головний лікар клубу"}
              />

              {/* LSI Оцінка симетрії */}
              <LsiSymmetryAssessmentCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialRecords={lsiRecords}
                playerWeightKg={anthroRes.data?.[0]?.weight ? Number(anthroRes.data[0].weight) : null}
                defaultInjuryType={injuryList?.[0]?.injury_type}
                defaultSide={injuryList?.[0]?.side === "left" || injuryList?.[0]?.side === "right" ? injuryList[0].side : undefined}
                preSeasonScreenings={screenings}
              />

              {/* Історія чек-інів реабілітації */}
              <PlayerRehabCheckinHistory
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                portalToken={portalToken}
                checkins={rehabCheckins}
              />

              {/* Історія пошкоджень */}
              <section className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-sky-500/15">
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>📋</span> Історія пошкоджень
                  </h2>
                  <span className="text-xs font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded-md border border-slate-800">
                    {totalInjuries} записів
                  </span>
                </div>

                {totalInjuries === 0 ? (
                  <Card className="p-8 text-center text-xs text-slate-400">
                    {from ? "За обраний період травм не зафіксовано" : "Травм у даного гравця не зафіксовано 🟢"}
                  </Card>
                ) : (
                  <div className="space-y-2.5">
                    {injuryList.map((inj: any) => {
                      const missed = calcDaysMissed(inj);
                      return (
                        <Link key={inj.id} href={`/injuries/${inj.id}`} className="block group">
                          <Card interactive accent={statusVariant(inj.status)==="neutral"?null:(statusVariant(inj.status) as "danger"|"warn")} className="p-3.5">
                            <div className="flex justify-between items-start gap-3">
                              <div className="min-w-0">
                                <div className="font-bold text-white text-sm group-hover:text-sky-300 transition-colors">
                                  {INJURY_TYPE_UA[inj.injury_type]??inj.injury_type} — {LOCATION_UA[inj.location]??inj.location}
                                </div>
                                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span>{SEVERITY_UA[inj.severity]}</span>
                                  <span>·</span>
                                  <span>{new Date(inj.date_of_injury).toLocaleDateString("uk-UA")}</span>
                                  <span>·</span>
                                  <span className="text-red-400 font-mono font-bold">{missed} дн.</span>
                                </div>
                                {inj.description && (
                                  <div className="text-xs text-slate-500 mt-1 truncate max-w-lg">{inj.description}</div>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <Badge variant={vasVariant(inj.vas_score)}>ВАШ {inj.vas_score}/10</Badge>
                                <Badge variant={statusVariant(inj.status)}>{STATUS_UA[inj.status]??inj.status}</Badge>
                              </div>
                            </div>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          }
          passport={
            <>
              {/* Первинний медичний анамнез та особливості */}
              <PlayerAnamnesisCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                anamnesis={anamnesisRecord}
              />

              {/* Передсезонний медичний скринінг */}
              <PreSeasonScreeningCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialScreenings={screenings}
                growthPhase={(maturation?.growth_phase as "pre_phv" | "phv" | "post_phv") ?? null}
              />
              
              {/* Антропометрія та біологічне дозрівання */}
              <AnthropometrySection playerId={id} measurements={measurements} maturation={maturation} dateOfBirth={player.date_of_birth} />
              
              {/* Стоматологія та нутриціологія */}
              <DentalNutritionCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialProfile={latestNutrition}
                requiresParentalConsent={!hasSupplementsConsent}
              />

              {/* Фармакотерапія та ліки з аптеки (Тільки для медичного персоналу) */}
              {!isCoachUser && (
                <PlayerTreatmentsCard
                  playerId={id}
                  playerName={`${player.last_name} ${player.first_name}`}
                  initialTreatments={playerTreatments}
                />
              )}
            </>
          }
          profile={
            <>
              {/* Паспорт здоров'я та клубна квота підписки B2B2C */}
              <PlayerSubscriptionQuotaCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                userRole={currentUser?.role}
                initialSubscription={
                  playerSub
                    ? {
                        status: playerSub.status,
                        isActive: playerSub.status === "comped" || playerSub.status === "active",
                        planCode: playerSub.plan_code,
                        amountUah: Number(playerSub.amount_uah),
                        billingInterval: playerSub.billing_interval,
                        currentPeriodEnd: playerSub.current_period_end,
                        compedReason: playerSub.comped_reason,
                        compedBy: playerSub.comped_by,
                      }
                    : null
                }
              />

              {/* Сімейний кабінет для батьків (персональне посилання + повідомлення) */}
              <PlayerParentAccessCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialTokens={parentAccessState.tokens}
                initialMessages={parentAccessState.messages}
              />

              {/* Згоди законних представників (батьків) та гравця */}
              <PlayerConsentsCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                teamName={player.teams?.name || "Команда"}
                dateOfBirth={player.date_of_birth}
                initialSummary={consentSummary}
                activeDocuments={activeDocuments}
              />

              {/* ШІ-аналітика спортивної форми */}
              <PlayerSportsIntelligenceCard
                requiresParentalConsent={!hasAiConsent}
                playerContext={{
                  id,
                  name: `${player.last_name} ${player.first_name}`,
                  age: calcAge(player.date_of_birth),
                  position: POSITION_FULL[player.position] || player.position,
                  team: player.teams?.name || "Команда",
                  maturation: maturation
                    ? {
                        growth_phase: maturation.growth_phase,
                        risk_zone: maturation.risk_zone,
                        consensus_offset: maturation.consensus_offset,
                      }
                    : null,
                  wearables: wearableLogs,
                  screening: screenings,
                  nutrition: latestNutrition,
                  injuries: injuryList.map((i) => ({
                    type: i.injury_type,
                    location: i.location,
                    severity: i.severity,
                    status: i.status,
                    daysMissed: calcDaysMissed(i),
                  })),
                }}
              />

              {/* Носимі біометричні датчики (Wearables) */}
              <WearablesBiometricsCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialEntries={wearableLogs}
                requiresParentalConsent={!hasWearablesConsent}
              />

              {/* Авторизовані пристрої гравця (QR-активація) */}
              <PlayerDevicesCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialDevices={activeDevices}
              />

              {/* Telegram-сповіщення та нагадування */}
              <TelegramBindingCard
                playerId={id}
                playerName={`${player.last_name} ${player.first_name}`}
                initialBinding={telegramRes?.binding}
                initialEligibility={telegramRes?.eligibility}
              />
            </>
          }
        />

      </div>
    </div>
  );
}
