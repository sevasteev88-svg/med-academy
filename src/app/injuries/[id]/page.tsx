/**
 * /injuries/[id]/page.tsx
 * Картка травми: інформація, класифікація (MLG-R+BAMIC+Munich), RTP, огляди.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { LOCATION_UA, INJURY_TYPE_UA, SEVERITY_UA, STATUS_UA, MECHANISM_UA, SIDE_UA, EXAM_GRADE_UA, ROM_GRADE_UA, MUSCLE_TONE_UA } from "@/lib/constants";
import ClassificationSection from "./ClassificationSection";

type Props = { params: Promise<{ id: string }> };

const STATUS_COLOR: Record<string, string> = {
  active: "bg-red-500/12 text-red-400 border-red-500/25",
  rehabilitation: "bg-amber-500/12 text-amber-400 border-amber-500/25",
  closed: "bg-green-500/12 text-green-400 border-green-500/25",
};

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-blue-900/10 last:border-0">
      <span className="text-[11px] text-slate-600">{label}</span>
      <span className="text-[12px] text-slate-300 font-medium text-right">{value}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[9px] uppercase tracking-widest text-slate-600 whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-blue-900/20" />
    </div>
  );
}

export default async function InjuryDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: injury } = await supabase
    .from("injuries")
    .select(`*, players(id, first_name, last_name, position, teams(name))`)
    .eq("id", id)
    .single();

  if (!injury) notFound();

  const player = injury.players as any;
  const playerName = player ? `${player.last_name} ${player.first_name}` : "—";
  const teamName = player?.teams?.name ?? "";
  const initials = player ? `${player.last_name?.[0] ?? ""}${player.first_name?.[0] ?? ""}` : "??";

  // Огляди (структуровані) з injury_examinations
  const { data: exams } = await supabase
    .from("injury_examinations")
    .select("*")
    .eq("injury_id", id)
    .order("date", { ascending: false });

  const injDays = daysSince(injury.date_of_injury);
  const rtpDays = injury.expected_return_date
    ? Math.ceil((new Date(injury.expected_return_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div
      className="relative min-h-screen"
      style={{
        background: "repeating-linear-gradient(90deg,#060C1E 0px,#060C1E 60px,#0D2550 60px,#0D2550 120px)",
      }}
    >
      <div className="absolute inset-0 bg-[rgba(4,6,14,0.72)] pointer-events-none" />
      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* Topbar */}
        <div className="flex items-center gap-3 py-3 border-b border-blue-900/15">
          <Link
            href="/injuries"
            className="w-8 h-8 rounded-lg bg-blue-500/12 border border-blue-500/25 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-colors flex-shrink-0"
          >
            ←
          </Link>
          <div className="flex-1">
            <div className="text-[13px] font-medium text-slate-200">Картка травми</div>
            <div className="text-[10px] text-slate-600">Медичний штаб · ФК Чорноморець</div>
          </div>
          <Link
            href={`/injuries/${id}/edit`}
            className="text-[10px] text-blue-400 border border-blue-500/25 bg-blue-500/8 px-3 py-1.5 rounded-lg hover:bg-blue-500/15 transition-colors"
          >
            ✏️ Редагувати
          </Link>
        </div>

        {/* Гравець */}
        <div className="flex items-center gap-3 py-3 border-b border-blue-900/10 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/14 text-red-400 flex items-center justify-center text-[12px] font-medium flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-medium text-slate-200">{playerName}</div>
            <div className="text-[10px] text-slate-600">{teamName} · {player?.position ?? ""}</div>
          </div>
          {player && (
            <Link href={`/players/${player.id}`} className="text-[10px] text-slate-600 hover:text-blue-400 transition-colors">
              Профіль →
            </Link>
          )}
        </div>

        {/* Лічильники */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-2.5 text-center">
            <div className="text-[18px] font-medium text-red-400">{injDays}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">днів травми</div>
          </div>
          <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-2.5 text-center">
            <div className={`text-[18px] font-medium ${rtpDays != null && rtpDays > 0 ? "text-amber-400" : rtpDays != null ? "text-green-400" : "text-slate-500"}`}>
              {rtpDays != null ? (rtpDays > 0 ? `+${rtpDays}` : "Готовий") : "—"}
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">днів до RTP</div>
          </div>
          <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-2.5 text-center">
            <div className="text-[18px] font-medium text-blue-400">{exams?.length ?? 0}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">оглядів</div>
          </div>
        </div>

        {/* Статус */}
        <div className="mb-4">
          <span className={`inline-block px-3 py-1 rounded-lg text-[11px] font-medium border ${STATUS_COLOR[injury.status] ?? STATUS_COLOR.closed}`}>
            {STATUS_UA[injury.status] ?? injury.status}
          </span>
        </div>

        {/* Класифікація (клієнтська секція) */}
        <div className="mb-4">
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

        {/* Основна інформація */}
        <div className="mb-4">
          <SectionLabel>Основна інформація</SectionLabel>
          <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg px-3 py-1">
            <Row label="Тип травми" value={INJURY_TYPE_UA[injury.injury_type] ?? injury.injury_type} />
            <Row label="Локалізація" value={`${LOCATION_UA[injury.location] ?? injury.location} · ${SIDE_UA[injury.side] ?? injury.side}`} />
            <Row label="Механізм" value={MECHANISM_UA[injury.mechanism] ?? injury.mechanism} />
            <Row label="Тяжкість" value={SEVERITY_UA[injury.severity] ?? injury.severity} />
            <Row label="Дата травми" value={fmtDate(injury.date_of_injury)} />
            {injury.expected_return_date && <Row label="Очік. повернення" value={fmtDate(injury.expected_return_date)} />}
            {injury.actual_return_date && <Row label="Факт. повернення" value={fmtDate(injury.actual_return_date)} />}
          </div>
        </div>

        {/* Опис */}
        {injury.description && (
          <div className="mb-4">
            <SectionLabel>Опис / обставини</SectionLabel>
            <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg px-3 py-2.5 text-[11px] text-slate-400 leading-relaxed">
              {injury.description}
            </div>
          </div>
        )}

        {/* Журнал оглядів */}
        <div className="mb-4">
          <SectionLabel>Журнал оглядів ({exams?.length ?? 0})</SectionLabel>

          {(!exams || exams.length === 0) && (
            <div className="text-center py-6 text-[11px] text-slate-600">Оглядів ще не було</div>
          )}

          <div className="flex flex-col gap-2">
            {(exams ?? []).map((ex) => {
              const vasColor =
                ex.vas_score >= 7 ? "text-red-400" : ex.vas_score >= 4 ? "text-amber-400" : "text-green-400";
              // Показуємо клінічні поля тільки якщо вони не дефолтні/порожні
              const clinical: { label: string; value: string }[] = [];
              if (ex.edema && ex.edema !== "none") clinical.push({ label: "Набряк", value: EXAM_GRADE_UA[ex.edema] ?? ex.edema });
              if (ex.hematoma && ex.hematoma !== "none") clinical.push({ label: "Гематома", value: EXAM_GRADE_UA[ex.hematoma] ?? ex.hematoma });
              if (ex.rom && ex.rom !== "full") clinical.push({ label: "ROM", value: ROM_GRADE_UA[ex.rom] ?? ex.rom });
              if (ex.palpation_pain && ex.palpation_pain !== "none") clinical.push({ label: "Пальпація", value: EXAM_GRADE_UA[ex.palpation_pain] ?? ex.palpation_pain });
              if (ex.muscle_tone && ex.muscle_tone !== "normal") clinical.push({ label: "Тонус", value: MUSCLE_TONE_UA[ex.muscle_tone] ?? ex.muscle_tone });

              return (
                <div key={ex.id} className="bg-slate-900/80 border border-blue-900/15 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-blue-900/10">
                    <span className="text-[11px] font-medium text-slate-300">{fmtDate(ex.date)}</span>
                    <span className={`text-[11px] font-medium ${vasColor}`}>ВАШ {ex.vas_score}/10</span>
                  </div>
                  <div className="px-3 py-2 flex flex-col gap-1.5">
                    {clinical.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {clinical.map((c) => (
                          <span key={c.label} className="text-[10px] px-2 py-0.5 rounded bg-slate-800/70 text-slate-400 border border-blue-900/15">
                            {c.label}: <span className="text-slate-300">{c.value}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {ex.objective_note && (
                      <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-line">
                        <span className="text-slate-600">Об'єктивно: </span>{ex.objective_note}
                      </p>
                    )}
                    {ex.subjective_note && (
                      <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-line">
                        <span className="text-slate-600">Суб'єктивно: </span>{ex.subjective_note}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Кнопки дій */}
        <div className="flex gap-2 pt-2 border-t border-blue-900/12">
          <Link
            href={`/exams/new/${id}`}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors text-center"
          >
            + Новий огляд
          </Link>
          {player && (
            <Link
              href={`/players/${player.id}`}
              className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-blue-400 border border-blue-500/28 bg-blue-500/8 hover:bg-blue-500/15 transition-colors text-center"
            >
              Профіль гравця
            </Link>
          )}
        </div>

      </div>
    </div>
  );
}
