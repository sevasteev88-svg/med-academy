/**
 * /injuries/[id]/page.tsx
 * Картка травми: інформація, класифікація (MLG-R+BAMIC+Munich), RTP, огляди.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { LOCATION_UA, INJURY_TYPE_UA, SEVERITY_UA, STATUS_UA, MECHANISM_UA, SIDE_UA, EXAM_GRADE_UA, ROM_GRADE_UA, MUSCLE_TONE_UA } from "@/lib/constants";
import ClassificationSection from "./ClassificationSection";
import RehabilitationProtocolSection from "@/components/injuries/RehabilitationProtocolSection";
import RtpClearanceChecklist from "@/components/injuries/RtpClearanceChecklist";
import MedicalImagingGallery from "@/components/injuries/MedicalImagingGallery";
import type { ImagingStudy } from "@/actions/save-imaging-study-action";
import MedicalTreatmentJournal from "@/components/injuries/MedicalTreatmentJournal";
import type { MedicalTreatmentEntry } from "@/types/pharmacy";
import Scat6ConcussionAssessment from "@/components/injuries/Scat6ConcussionAssessment";
import type { ConcussionAssessment } from "@/types/concussion";
import LsiSymmetryAssessmentCard from "@/components/injuries/LsiSymmetryAssessmentCard";
import type { LsiAssessmentRecord } from "@/types/lsi";

type Props = { params: Promise<{ id: string }> };

const STATUS_COLOR: Record<string, string> = {
  active: "bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.2)]",
  rehabilitation: "bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]",
  closed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]",
};

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-sky-500/10 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs text-slate-100 font-semibold text-right">{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-2 h-2 rounded-full bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.8)]" />
      <span className="text-xs uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-sky-500/20 to-transparent" />
    </div>
  );
}

export default async function InjuryDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [injuryRes, examsRes, logsRes, treatmentsRes, concussionsRes, lsiRes, clearanceRes] = await Promise.all([
    supabase
      .from("injuries")
      .select(`*, players(id, first_name, last_name, date_of_birth, position, teams(name))`)
      .eq("id", id)
      .single(),
    supabase
      .from("injury_examinations")
      .select("*")
      .eq("injury_id", id)
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .eq("injury_id", id)
      .like("note", "[IMAGING]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .or(`injury_id.eq.${id},injury_id.is.null`)
      .like("note", "[TREATMENT]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .eq("injury_id", id)
      .like("note", "[CONCUSSION]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[LSI_ASSESSMENT]%")
      .order("date", { ascending: false }),
    supabase
      .from("injury_logs")
      .select("*")
      .eq("injury_id", id)
      .like("note", "[RTP_CLEARANCE]%")
      .order("date", { ascending: false })
      .limit(1),
  ]);

  const { data: injury } = injuryRes;
  if (!injury) notFound();

  const player = injury.players as any;
  const playerName = player ? `${player.last_name} ${player.first_name}` : "—";
  const teamName = player?.teams?.name ?? "";
  const initials = player ? `${player.last_name?.[0] ?? ""}${player.first_name?.[0] ?? ""}` : "??";

  const exams = examsRes.data;
  const imagingStudies: ImagingStudy[] = (logsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[IMAGING] ", "");
        return JSON.parse(rawJson) as ImagingStudy;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as ImagingStudy[];

  const medicalTreatments: MedicalTreatmentEntry[] = (treatmentsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[TREATMENT] ", "");
        const parsed = JSON.parse(rawJson);
        if (parsed.injury_id === id || (!parsed.injury_id && parsed.player_id === injury.player_id)) {
          return parsed as MedicalTreatmentEntry;
        }
        return null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as MedicalTreatmentEntry[];

  const concussionAssessments: ConcussionAssessment[] = (concussionsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[CONCUSSION] ", "");
        return JSON.parse(rawJson) as ConcussionAssessment;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as ConcussionAssessment[];

  const lsiAssessments: LsiAssessmentRecord[] = (lsiRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[LSI_ASSESSMENT] ", "");
        const parsed = JSON.parse(rawJson);
        if (parsed.injury_id === id || (!parsed.injury_id && parsed.player_id === injury.player_id)) {
          return parsed as LsiAssessmentRecord;
        }
        return null;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as LsiAssessmentRecord[];

  const isHeadInjury = injury.location === "head" || injury.injury_type === "concussion";

  const clearanceLogRaw = clearanceRes.data?.[0]?.note;
  let initialClearanceCriteria = null;
  if (clearanceLogRaw) {
    try {
      const jsonStr = clearanceLogRaw.replace("[RTP_CLEARANCE] ", "");
      const parsed = JSON.parse(jsonStr);
      if (parsed.criteria) {
        initialClearanceCriteria = parsed.criteria;
      }
    } catch {}
  }

  const injDays = daysSince(injury.date_of_injury);
  const isClosed = injury.status === "closed";
  const rtpDays = injury.expected_return_date
    ? Math.ceil((new Date(injury.expected_return_date).getTime() - Date.now()) / 86400000)
    : null;
  const rtpOverdue = rtpDays != null && rtpDays <= 0 && !isClosed;

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Topbar */}
        <div className="flex items-center justify-between pb-4 border-b border-sky-500/15">
          <div className="flex items-center gap-3">
            <Link
              href="/injuries"
              className="w-9 h-9 rounded-xl bg-slate-900/80 border border-sky-500/20 flex items-center justify-center text-sky-400 hover:bg-sky-500/20 hover:text-white transition-all flex-shrink-0"
            >
              ←
            </Link>
            <div>
              <div className="text-base font-bold text-white">Картка травми #{id.slice(0, 8)}</div>
              <div className="text-[11px] text-slate-400">Медичний штаб · ФК «Чорноморець» Одеса</div>
            </div>
          </div>
          <Link
            href={`/injuries/${id}/edit`}
            className="text-xs font-semibold text-sky-300 border border-sky-500/25 bg-sky-500/10 hover:bg-sky-500/20 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5"
          >
            <span>✏️</span>
            <span>Редагувати</span>
          </Link>
        </div>

        {/* Гравець & Діагноз - Hero Card */}
        <div className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 shadow-[0_4px_25px_rgba(0,0,0,0.35)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500/20 to-sky-600/30 border border-sky-500/30 text-sky-300 flex items-center justify-center text-base font-black shadow-[0_0_15px_rgba(14,165,233,0.2)] flex-shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-black text-white">{playerName}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_COLOR[injury.status] ?? STATUS_COLOR.closed}`}>
                  {STATUS_UA[injury.status] ?? injury.status}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {teamName} · <span className="font-mono text-sky-400">{player?.position ?? "—"}</span> ·{" "}
                <span className="text-slate-300 font-semibold">{INJURY_TYPE_UA[injury.injury_type] ?? injury.injury_type}</span>
              </div>
            </div>
          </div>
          {player && (
            <Link
              href={`/players/${player.id}`}
              className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs text-sky-400 font-semibold transition-all flex items-center justify-center gap-1.5 self-start sm:self-center"
            >
              <span>Профіль гравця</span>
              <span>→</span>
            </Link>
          )}
        </div>

        {/* Лічильники */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-rose-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)] text-center">
            <div className="text-3xl font-black font-mono text-rose-400">{injDays}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">днів у лазареті</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-amber-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)] text-center">
            <div className={`text-3xl font-black font-mono ${
              rtpDays == null ? "text-slate-500"
              : rtpDays > 0 ? "text-amber-400"
              : rtpOverdue ? "text-rose-400 animate-pulse"
              : "text-emerald-400"
            }`}>
              {rtpDays == null ? "—"
                : rtpDays > 0 ? `+${rtpDays}`
                : rtpOverdue ? "Прострочено"
                : "Готовий"}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">днів до RTP</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/20 shadow-[0_4px_20px_rgba(0,0,0,0.3)] text-center">
            <div className="text-3xl font-black font-mono text-sky-400">{exams?.length ?? 0}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">клінічних оглядів</div>
          </div>
        </div>

        {/* Класифікація (клієнтська секція) */}
        <div>
          <ClassificationSection
            injury={{
              id: injury.id,
              dateOfInjury: injury.date_of_injury,
              injuryType: injury.injury_type,
              isClassified: injury.is_classified ?? false,
              mlgrMuscle: injury.mlgr_muscle,
              mlgrMechanism: injury.mlgr_mechanism,
              mlgrLocation: injury.mlgr_location,
              mlgrGrade: injury.mlgr_grade,
              mlgrHasR: injury.mlgr_has_r ?? false,
              mlgrCsaPct: injury.mlgr_csa_pct,
              mlgrReinjury: injury.mlgr_reinjury ?? 0,
              mlgrCode: injury.mlgr_code,
              bamicGrade: injury.bamic_grade,
              bamicLocation: injury.bamic_location,
              bamicCode: injury.bamic_code,
              munichType: injury.munich_type,
              rtpMinDays: injury.rtp_min_days,
              rtpMaxDays: injury.rtp_max_days,
              rtpRisk: injury.rtp_risk,
            }}
          />
        </div>

        {/* Протокол реабілітації та AI-Асистент */}
        <RehabilitationProtocolSection
          injuryType={injury.injury_type}
          location={injury.location}
          side={injury.side}
          severity={injury.severity}
          mechanism={injury.mechanism}
          vasScore={injury.vas_score}
          bamicCode={injury.bamic_code}
          bamicLocation={injury.bamic_location}
          mlgrCode={injury.mlgr_code}
          munichType={injury.munich_type}
          reinjuryCount={injury.mlgr_reinjury ?? 0}
          playerName={playerName}
          teamName={teamName}
          position={player?.position ?? "—"}
          age={player?.date_of_birth ? Math.floor((Date.now() - new Date(player.date_of_birth).getTime()) / (365.25 * 86400000)) : 19}
        />

        {/* Чек-лист критеріїв повернення в гру (RTP Clearance) */}
        <div className="mb-4">
          <RtpClearanceChecklist
            injuryId={injury.id}
            injuryStatus={injury.status}
            playerName={playerName}
            initialCriteria={initialClearanceCriteria}
          />
        </div>

        {/* Архів інструментальної візуалізації (МРТ / УЗД) */}
        <div className="mb-4">
          <MedicalImagingGallery
            injuryId={injury.id}
            initialStudies={imagingStudies}
            playerName={playerName}
          />
        </div>

        {/* Журнал процедур, ін'єкцій та фармакотерапії (WADA Check) */}
        <div className="mb-4">
          <MedicalTreatmentJournal
            injuryId={injury.id}
            playerId={injury.player_id}
            playerName={playerName}
            initialTreatments={medicalTreatments}
          />
        </div>

        {/* Тестування симетрії кінцівок LSI та динамометрія */}
        <div className="mb-4">
          <LsiSymmetryAssessmentCard
            playerId={injury.player_id}
            injuryId={injury.id}
            playerName={playerName}
            initialRecords={lsiAssessments}
          />
        </div>

        {/* Протокол струсу мозку FIFA/SCAT6 (показується при травмах голови або наявності записів) */}
        {(isHeadInjury || concussionAssessments.length > 0) && (
          <div className="mb-4">
            <Scat6ConcussionAssessment
              injuryId={injury.id}
              playerName={playerName}
              initialAssessments={concussionAssessments}
            />
          </div>
        )}

        {/* Основна інформація */}
        <div>
          <SectionLabel>Основна клінічна інформація</SectionLabel>
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <Row label="Тип травми" value={INJURY_TYPE_UA[injury.injury_type] ?? injury.injury_type} />
            <Row label="Локалізація" value={`${LOCATION_UA[injury.location] ?? injury.location} · ${SIDE_UA[injury.side] ?? injury.side}`} />
            <Row label="Механізм" value={MECHANISM_UA[injury.mechanism] ?? injury.mechanism} />
            <Row label="Тяжкість" value={SEVERITY_UA[injury.severity] ?? injury.severity} />
            <Row label="Дата травми" value={fmtDate(injury.date_of_injury)} />
            {injury.expected_return_date && <Row label="Очік. повернення" value={fmtDate(injury.expected_return_date)} />}
            {injury.actual_return_date && <Row label="Факт. повернення" value={fmtDate(injury.actual_return_date)} />}
            {injury.next_exam_date && !isClosed && (
              <Row
                label="Наступний огляд"
                value={
                  <span className={new Date(injury.next_exam_date) < new Date(new Date().toDateString()) ? "text-rose-400 font-bold" : "text-sky-300"}>
                    {fmtDate(injury.next_exam_date)}
                  </span>
                }
              />
            )}
          </div>
        </div>

        {/* Опис */}
        {injury.description && (
          <div>
            <SectionLabel>Опис та обставини отримання травми</SectionLabel>
            <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)] text-xs text-slate-300 leading-relaxed whitespace-pre-line">
              {injury.description}
            </div>
          </div>
        )}

        {/* Журнал оглядів */}
        <div>
          <SectionLabel>Журнал клінічних оглядів ({exams?.length ?? 0})</SectionLabel>

          {(!exams || exams.length === 0) && (
            <div className="p-8 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 text-center text-xs text-slate-500">
              Оглядів ще не зареєстровано
            </div>
          )}

          <div className="flex flex-col gap-3">
            {(exams ?? []).map((ex) => {
              const vasCls =
                ex.vas_score >= 7 ? "text-rose-400 bg-rose-500/10 border-rose-500/20" : ex.vas_score >= 4 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
              const clinical: { label: string; value: string }[] = [];
              if (ex.edema && ex.edema !== "none") clinical.push({ label: "Набряк", value: EXAM_GRADE_UA[ex.edema] ?? ex.edema });
              if (ex.hematoma && ex.hematoma !== "none") clinical.push({ label: "Гематома", value: EXAM_GRADE_UA[ex.hematoma] ?? ex.hematoma });
              if (ex.rom && ex.rom !== "full") clinical.push({ label: "ROM", value: ROM_GRADE_UA[ex.rom] ?? ex.rom });
              if (ex.palpation_pain && ex.palpation_pain !== "none") clinical.push({ label: "Пальпація", value: EXAM_GRADE_UA[ex.palpation_pain] ?? ex.palpation_pain });
              if (ex.muscle_tone && ex.muscle_tone !== "normal") clinical.push({ label: "Тонус", value: MUSCLE_TONE_UA[ex.muscle_tone] ?? ex.muscle_tone });

              return (
                <div key={ex.id} className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
                  <div className="flex items-center justify-between pb-3 border-b border-sky-500/10">
                    <span className="text-xs font-bold text-white">{fmtDate(ex.date)}</span>
                    <span className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg border ${vasCls}`}>ВАШ {ex.vas_score}/10</span>
                  </div>
                  <div className="pt-3 flex flex-col gap-2">
                    {clinical.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {clinical.map((c) => (
                          <span key={c.label} className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700/60">
                            {c.label}: <span className="text-sky-300 font-semibold">{c.value}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {ex.objective_note && (
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                        <span className="text-sky-400 font-semibold">Об'єктивно: </span>{ex.objective_note}
                      </p>
                    )}
                    {ex.subjective_note && (
                      <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                        <span className="text-slate-500 font-semibold">Суб'єктивно: </span>{ex.subjective_note}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Кнопки дій */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-sky-500/15">
          <Link
            href={`/exams/new/${id}`}
            className="flex-1 py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all text-center flex items-center justify-center gap-2"
          >
            <span>+</span>
            <span>Додати новий огляд</span>
          </Link>
          {player && (
            <Link
              href={`/players/${player.id}`}
              className="flex-1 py-3 rounded-xl text-xs font-bold text-sky-300 border border-sky-500/25 bg-sky-500/10 hover:bg-sky-500/20 transition-all text-center flex items-center justify-center gap-2"
            >
              <span>Перейти в профіль гравця</span>
              <span>→</span>
            </Link>
          )}
        </div>

      </div>
    </div>
  );
}
