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
import { POSITION_LABELS, POSITION_FULL, DOMINANT_UA, LOCATION_UA, SEVERITY_UA, INJURY_TYPE_UA, STATUS_UA } from "@/lib/constants";
import PlayerConsentsCard from "@/components/consents/PlayerConsentsCard";
import PlayerTreatmentsCard from "@/components/players/PlayerTreatmentsCard";
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

export default async function PlayerDetailPage({ params, searchParams }: { params: Promise<{id:string}>; searchParams: Promise<{from?:string;to?:string}> }) {
  const { id } = await params; const { from, to } = await searchParams;
  const supabase = await createClient();

  // Логуємо перегляд картки гравця (Audit Log)
  await logAudit({
    action: "view_player",
    entity: "player",
    entityId: id,
    playerId: id,
  });

  let injuryQuery = supabase.from("injuries").select("*").eq("player_id", id).order("date_of_injury", { ascending: false });
  if (from) injuryQuery = injuryQuery.gte("date_of_injury", from);
  if (to) injuryQuery = injuryQuery.lte("date_of_injury", to);

  const [playerRes, injuriesRes, anthroRes, matRes, screeningLogsRes, nutritionLogsRes, photoLogsRes, wearableLogsRes, rehabLogsRes, pinLogsRes, lsiLogsRes, planLogsRes, workloadRes, wellnessRes, workloadLogsRes, wellnessLogsRes, treatmentLogsRes] = await Promise.all([
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
      .from("injury_logs")
      .select("*")
      .like("note", "[SCREENING]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[NUTRITION]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[PLAYER_PHOTO]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[WEARABLE]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[REHAB_CHECKIN]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("note")
      .like("note", `[PLAYER_PIN] %"player_id":"${id}"%`)
      .order("date", { ascending: false })
      .limit(1),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[LSI_ASSESSMENT]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("note")
      .like("note", "[CUSTOM_REHAB_PLAN]%")
      .order("created_at", { ascending: false })
      .limit(20),
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
      .from("injury_logs")
      .select("date, note")
      .like("note", "[WORKLOAD]%")
      .order("date", { ascending: false })
      .limit(100),
    supabase
      .from("injury_logs")
      .select("date, note")
      .like("note", "[WELLNESS%")
      .order("date", { ascending: false })
      .limit(100),
    supabase
      .from("injury_logs")
      .select("id, date, note")
      .like("note", "[TREATMENT]%")
      .order("date", { ascending: false })
      .limit(100),
  ]);

  const { data: player, error } = playerRes;
  if (error || !player) return notFound();

  const injuryList = injuriesRes.data ?? [];
  const measurements = anthroRes.data ?? [];
  const maturation = matRes.data?.[0] ?? null;

  const screenings: PreSeasonScreening[] = (screeningLogsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[SCREENING] ", "");
        const parsed = JSON.parse(rawJson);
        return parsed.player_id === id ? (parsed as PreSeasonScreening) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as PreSeasonScreening[];

  const nutritionLogs = (nutritionLogsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[NUTRITION] ", "");
        const parsed = JSON.parse(rawJson);
        return parsed.player_id === id ? (parsed as NutritionProfile) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as NutritionProfile[];

  const latestNutrition: NutritionProfile | null = nutritionLogs[0] || null;

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

  const rehabCheckins = (rehabLogsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[REHAB_CHECKIN] ", "");
        const parsed = JSON.parse(rawJson);
        return parsed.player_id === id ? (parsed as RehabCheckinData) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as RehabCheckinData[];

  const portalToken = await getOrGeneratePlayerPortalToken(id);

  const lsiRecords = (lsiLogsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[LSI_ASSESSMENT] ", "");
        const parsed = JSON.parse(rawJson);
        return parsed.player_id === id ? (parsed as LsiAssessmentRecord) : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as LsiAssessmentRecord[];

  let playerCustomPlan: PlayerCustomRehabPlan | null = null;
  if (planLogsRes.data && planLogsRes.data.length > 0) {
    for (const log of planLogsRes.data) {
      try {
        const raw = log.note.replace("[CUSTOM_REHAB_PLAN] ", "");
        const parsed = JSON.parse(raw);
        if (parsed.player_id === id) {
          playerCustomPlan = parsed;
          break;
        }
      } catch {}
    }
  }

  const playerTreatments: MedicalTreatmentEntry[] = (treatmentLogsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[TREATMENT] ", "");
        const parsed = JSON.parse(rawJson);
        if (parsed.player_id === id) {
          parsed.log_id = l.id;
          return parsed as MedicalTreatmentEntry;
        }
        return null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as MedicalTreatmentEntry[];

  const totalInjuries = injuryList.length;
  const totalDaysMissed = injuryList.reduce((s,i) => s + calcDaysMissed(i), 0);
  const activeCount = injuryList.filter(i => i.status === "active").length;
  const rehabCount = injuryList.filter(i => i.status === "rehabilitation").length;
  const closedCount = injuryList.filter(i => i.status === "closed").length;
  const daysByType: Record<string,number> = {}; const daysByLocation: Record<string,number> = {};
  for (const inj of injuryList) { const d = calcDaysMissed(inj); daysByType[inj.injury_type] = (daysByType[inj.injury_type]??0)+d; daysByLocation[inj.location] = (daysByLocation[inj.location]??0)+d; }
  const activeInjuries = injuryList.filter(i => i.status === "active" || i.status === "rehabilitation");
  const periodLabel = from ? `${from}${to ? ` — ${to}` : " — сьогодні"}` : "За весь час";
  const currentUser = await getCurrentUser();
  const isAdminUser = currentUser?.role === "admin";

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

  // Перевіряємо згоди: consentSummary містить дозволи за кожною областю
  const [
    consentSummary,
    activeDocuments,
    devicesRes,
    telegramRes,
  ] = await Promise.all([
    getPlayerConsentSummary(id, player.date_of_birth, player.club_id),
    getActiveConsentDocuments(player.club_id),
    getPlayerActiveDevicesAction(id),
    getPlayerTelegramStatusAction(id),
  ]);

  const hasPhotoConsent = consentSummary.scopes.photo.allowed;
  const hasWearablesConsent = consentSummary.scopes.wearables.allowed;
  const hasAiConsent = consentSummary.scopes.ai_processing.allowed;
  const hasSupplementsConsent = consentSummary.scopes.supplements.allowed;

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
                  <span className="px-2 py-0.5 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 font-mono text-xs font-bold">
                    {POSITION_LABELS[player.position] ?? player.position}
                  </span>
                </div>

                <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{player.teams.name}</span>
                  <span>·</span>
                  <span>{POSITION_FULL[player.position] ?? player.position}</span>
                  <span>·</span>
                  <span>{calcAge(player.date_of_birth)} років ({new Date(player.date_of_birth).toLocaleDateString("uk-UA")})</span>
                  <span>·</span>
                  <span>Нога: <strong className="text-slate-200">{DOMINANT_UA[player.dominant_leg]}</strong></span>
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

        {/* 1.4 Згоди законних представників (батьків) та гравця */}
        <PlayerConsentsCard
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          teamName={player.teams?.name || "Команда"}
          dateOfBirth={player.date_of_birth}
          initialSummary={consentSummary}
          activeDocuments={activeDocuments}
        />

        {/* Секції паспорта здоров'я */}
        <AnthropometrySection playerId={id} measurements={measurements} maturation={maturation} dateOfBirth={player.date_of_birth} />

        <WearablesBiometricsCard
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          initialEntries={wearableLogs}
          requiresParentalConsent={!hasWearablesConsent}
        />

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
        
        <PreSeasonScreeningCard playerId={id} playerName={`${player.last_name} ${player.first_name}`} initialScreenings={screenings} />
        
        <DentalNutritionCard
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          initialProfile={latestNutrition}
          requiresParentalConsent={!hasSupplementsConsent}
        />

        {/* 3.3 Фармакотерапія та медикаменти гравця з аптеки */}
        <PlayerTreatmentsCard
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          initialTreatments={playerTreatments}
        />

        {/* 8.2 Авторизовані пристрої гравця (QR-активація, макс 2 пристрої) */}
        <PlayerDevicesCard
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          initialDevices={activeDevices}
        />

        {/* 8.7 Telegram-сповіщення та нагадування (deep-link, QR, відписка в 1 клік) */}
        <TelegramBindingCard
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          initialBinding={telegramRes?.binding}
          initialEligibility={telegramRes?.eligibility}
        />

        <PlayerRehabCheckinHistory
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          portalToken={portalToken}
          checkins={rehabCheckins}
        />

        <LsiSymmetryAssessmentCard
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          initialRecords={lsiRecords}
          playerWeightKg={anthroRes.data?.[0]?.weight ? Number(anthroRes.data[0].weight) : null}
          defaultInjuryType={injuryList?.[0]?.injury_type}
          defaultSide={injuryList?.[0]?.side === "left" || injuryList?.[0]?.side === "right" ? injuryList[0].side : undefined}
        />

        <RehabExercisePlanBuilder
          playerId={id}
          playerName={`${player.last_name} ${player.first_name}`}
          initialPlan={playerCustomPlan}
          activeInjuries={activeInjuries}
          currentRtpPhase={playerCustomPlan?.target_rtp_phase || 1}
          defaultDoctorName={currentUser?.fullName || currentUser?.email || "Головний лікар клубу"}
        />

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

        {/* Історія травм */}
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

      </div>
    </div>
  );
}
