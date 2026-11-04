// src/app/exams/new/[injuryId]/ExamFormClient.tsx
// Структурований огляд → injury_examinations (через add-examination-action)

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addExaminationAction } from "@/actions/add-examination-action";
import VoiceNoteTextarea from "@/components/voice/VoiceNoteTextarea";

type StatusOption = "active" | "rehabilitation" | "closed";

// ── UI ────────────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[10px] uppercase tracking-wider font-bold text-sky-400 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-sky-500/15" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-slate-400 mb-1.5">{children}</div>;
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none cursor-pointer focus:border-sky-500/50 transition-colors"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-slate-900 text-slate-200">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; activeClass: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
            value === o.value
              ? o.activeClass
              : "bg-slate-950/60 text-slate-400 border-slate-800 hover:border-sky-500/30 hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function VasSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const color = value >= 7 ? "#EF4444" : value >= 4 ? "#F59E0B" : "#22C55E";
  return (
    <div className="bg-slate-950/60 border border-sky-500/15 rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-400">Оцініть біль зараз</span>
        <span className="text-xl font-bold font-mono" style={{ color }}>{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: color }}
      />
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
        <span>0 — без болю</span>
        <span>10 — нестерпний</span>
      </div>
    </div>
  );
}

// ── Опції enum ────────────────────────────────────────────────────────────────
const GRADE_OPTIONS = [
  { value: "none", label: "Немає" },
  { value: "mild", label: "Незначний" },
  { value: "moderate", label: "Помірний" },
  { value: "severe", label: "Виражений" },
];

const ROM_OPTIONS = [
  { value: "full", label: "Повний" },
  { value: "slightly_limited", label: "Незначно обмежений" },
  { value: "moderately_limited", label: "Помірно обмежений" },
  { value: "severely_limited", label: "Значно обмежений" },
];

const TONE_OPTIONS = [
  { value: "normal", label: "Нормальний" },
  { value: "hypotonic", label: "Знижений" },
  { value: "hypertonic", label: "Підвищений" },
];

// ── Головна форма ─────────────────────────────────────────────────────────────
export default function ExamFormClient({
  injuryId,
  playerName,
  injuryInfo,
  prevLogs,
}: {
  injuryId: string;
  playerName: string;
  injuryInfo: string;
  prevLogs: { date: string; note: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];

  // Поля огляду
  const [vas, setVas] = useState(5);
  const [edema, setEdema] = useState("moderate");
  const [hematoma, setHematoma] = useState("none");
  const [rom, setRom] = useState("slightly_limited");
  const [palpationPain, setPalpationPain] = useState("mild");
  const [muscleTone, setMuscleTone] = useState("normal");
  const [objectiveNote, setObjectiveNote] = useState("");
  const [subjectiveNote, setSubjectiveNote] = useState("");

  // Гоніометрія (опц.) — пишеться в objective_note
  const [showGonio, setShowGonio] = useState(false);
  const [gonioFlex, setGonioFlex] = useState("");
  const [gonioExt, setGonioExt] = useState("");

  // Дії над травмою
  const [newStatus, setNewStatus] = useState<StatusOption>("active");
  const [nextExam, setNextExam] = useState("");

  function handleSave() {
    setError(null);

    // Збираємо objective_note + гоніометрія
    let objNote = objectiveNote.trim();
    if (showGonio && gonioFlex) {
      const gonioStr = `Гоніометрія: згинання ${gonioFlex}°${gonioExt ? `, розгинання ${gonioExt}°` : ""}`;
      objNote = objNote ? `${objNote}\n${gonioStr}` : gonioStr;
    }

    const fd = new FormData();
    fd.set("injuryId", injuryId);
    fd.set("date", today);
    fd.set("vasScore", String(vas));
    fd.set("edema", edema);
    fd.set("hematoma", hematoma);
    fd.set("rom", rom);
    fd.set("palpationPain", palpationPain);
    fd.set("muscleTone", muscleTone);
    fd.set("objectiveNote", objNote);
    fd.set("subjectiveNote", subjectiveNote.trim());
    fd.set("newStatus", newStatus);
    if (nextExam) fd.set("nextExamDate", nextExam);

    startTransition(async () => {
      const res = await addExaminationAction({}, fd);
      if (res.error) {
        setError(res.error);
      } else {
        router.push(`/injuries/${injuryId}`);
      }
    });
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">

        {/* Topbar */}
        <div className="flex items-center gap-3 pb-3 border-b border-sky-500/15">
          <button
            onClick={() => router.push(`/injuries/${injuryId}`)}
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-sky-500/20 flex items-center justify-center text-sky-400 hover:bg-sky-500/20 hover:text-white transition-all flex-shrink-0"
          >
            ←
          </button>
          <div>
            <div className="text-sm font-bold text-white">Новий огляд</div>
            <div className="text-[11px] text-slate-400">Заповніть дані прийому</div>
          </div>
          <div className="ml-auto text-[11px] text-slate-400 font-mono">
            {new Date().toLocaleDateString("uk-UA")}
          </div>
        </div>

        {/* Пацієнт */}
        <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-500/20 to-sky-600/30 border border-sky-500/30 text-sky-300 flex items-center justify-center text-xs font-black flex-shrink-0">
            {playerName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-black text-white">{playerName}</div>
            <div className="text-xs text-slate-400 mt-0.5">{injuryInfo}</div>
          </div>
        </div>

        {/* Основна форма в єдиному стилі */}
        <div className="p-5 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-sky-500/15 shadow-[0_4px_25px_rgba(0,0,0,0.35)] space-y-5">

          {/* VAS */}
          <div>
            <SectionLabel>Шкала болю ВАШ</SectionLabel>
            <VasSlider value={vas} onChange={setVas} />
          </div>

          {/* Клінічний огляд — структуровані поля */}
          <div>
            <SectionLabel>Клінічний огляд</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Набряк</FieldLabel>
                <Select value={edema} onChange={setEdema} options={GRADE_OPTIONS} />
              </div>
              <div>
                <FieldLabel>Гематома</FieldLabel>
                <Select value={hematoma} onChange={setHematoma} options={GRADE_OPTIONS} />
              </div>
              <div>
                <FieldLabel>Об'єм рухів (ROM)</FieldLabel>
                <Select value={rom} onChange={setRom} options={ROM_OPTIONS} />
              </div>
              <div>
                <FieldLabel>Біль при пальпації</FieldLabel>
                <Select value={palpationPain} onChange={setPalpationPain} options={GRADE_OPTIONS} />
              </div>
              <div className="col-span-2">
                <FieldLabel>М'язовий тонус</FieldLabel>
                <Select value={muscleTone} onChange={setMuscleTone} options={TONE_OPTIONS} />
              </div>
            </div>
          </div>

          {/* Гоніометрія (опц.) */}
          <div>
            <SectionLabel>Гоніометрія</SectionLabel>
            <button
              type="button"
              onClick={() => setShowGonio(!showGonio)}
              className="text-xs text-sky-400 border border-sky-500/25 bg-sky-500/10 rounded-xl px-3 py-2 hover:bg-sky-500/20 transition-colors"
            >
              📐 {showGonio ? "Сховати гоніометр" : "Відкрити гоніометр"}
            </button>
            {showGonio && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Згинання (°)</FieldLabel>
                  <input
                    type="number"
                    value={gonioFlex}
                    onChange={(e) => setGonioFlex(e.target.value)}
                    placeholder="напр. 120"
                    className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500/50"
                  />
                </div>
                <div>
                  <FieldLabel>Розгинання (°)</FieldLabel>
                  <input
                    type="number"
                    value={gonioExt}
                    onChange={(e) => setGonioExt(e.target.value)}
                    placeholder="напр. 0"
                    className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Об'єктивні нотатки з підтримкою голосу uk-UA */}
          <div>
            <VoiceNoteTextarea
              id="objectiveNote"
              label="Об'єктивні нотатки (лікар)"
              value={objectiveNote}
              onChange={setObjectiveNote}
              placeholder="Що бачить лікар: пальпація, тести, спостереження... (диктуйте або друкуйте)"
              rows={3}
            />
          </div>

          {/* Суб'єктивні нотатки */}
          <div>
            <SectionLabel>Суб'єктивні нотатки (гравець)</SectionLabel>
            <textarea
              value={subjectiveNote}
              onChange={(e) => setSubjectiveNote(e.target.value)}
              placeholder="Що відчуває гравець: скарги, відчуття..."
              rows={2}
              className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none resize-none leading-relaxed focus:border-sky-500/50"
            />
          </div>

          {/* Призначення */}
          <div>
            <SectionLabel>Призначення</SectionLabel>
            <div className="mb-3">
              <FieldLabel>Статус після огляду</FieldLabel>
              <ChipGroup
                value={newStatus}
                onChange={setNewStatus}
                options={[
                  { value: "active", label: "Не готовий", activeClass: "bg-rose-500/15 text-rose-300 border-rose-500/35" },
                  { value: "rehabilitation", label: "Реабілітація", activeClass: "bg-amber-500/15 text-amber-300 border-amber-500/35" },
                  { value: "closed", label: "Допущений (Закрити травму)", activeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.2)]" },
                ]}
              />
            </div>
            <div>
              <FieldLabel>Наступний огляд / очік. повернення</FieldLabel>
              <input
                type="date"
                value={nextExam}
                onChange={(e) => setNextExam(e.target.value)}
                className="w-full bg-slate-950/80 border border-sky-500/20 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500/50"
              />
            </div>
          </div>

          {/* Попередні огляди */}
          {prevLogs.length > 0 && (
            <div>
              <SectionLabel>Попередні огляди</SectionLabel>
              <div className="flex flex-col gap-2">
                {prevLogs.slice(0, 3).map((log, i) => (
                  <div key={i} className="bg-slate-950/50 border border-sky-500/10 rounded-xl px-3.5 py-2.5 flex gap-3">
                    <span className="text-[10px] text-slate-500 font-mono flex-shrink-0 w-20">{log.date}</span>
                    <span className="text-xs text-slate-300 leading-relaxed">{log.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-3.5 py-2.5 text-xs text-rose-400">
              {error}
            </div>
          )}

          {/* Кнопки дій */}
          <div className="flex gap-3 pt-3 border-t border-sky-500/15">
            <button
              type="button"
              onClick={() => router.push(`/injuries/${injuryId}`)}
              className="flex-1 py-3 rounded-xl text-xs font-semibold text-slate-300 border border-slate-700/60 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 transition-all shadow-[0_0_15px_rgba(14,165,233,0.3)] disabled:opacity-50"
            >
              {isPending ? "Збереження..." : "Зберегти огляд"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
