// src/app/exams/new/[injuryId]/ExamFormClient.tsx
// Структурований огляд → injury_examinations (через add-examination-action)

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addExaminationAction } from "@/actions/add-examination-action";

type StatusOption = "active" | "rehabilitation" | "closed";

// ── UI ────────────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[9px] uppercase tracking-widest text-slate-600 whitespace-nowrap">
        {children}
      </span>
      <div className="flex-1 h-px bg-blue-900/20" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] text-slate-500 mb-1">{children}</div>;
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
      className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
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
          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
            value === o.value
              ? o.activeClass
              : "bg-slate-900/80 text-slate-500 border-blue-900/18 hover:border-blue-500/30 hover:text-slate-300"
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
    <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-slate-400">Оцініть біль зараз</span>
        <span className="text-[20px] font-medium" style={{ color }}>{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: color }}
      />
      <div className="flex justify-between text-[9px] text-slate-600 mt-1">
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
    <div
      className="relative min-h-screen"
      style={{
        background: "repeating-linear-gradient(90deg,#060C1E 0px,#060C1E 60px,#0D2550 60px,#0D2550 120px)",
      }}
    >
      <div className="absolute inset-0 bg-[rgba(4,6,14,0.72)] pointer-events-none" />

      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* Topbar */}
        <div className="flex items-center gap-3 py-3 border-b border-blue-900/15 mb-0">
          <button
            onClick={() => router.push(`/injuries/${injuryId}`)}
            className="w-8 h-8 rounded-lg bg-blue-500/12 border border-blue-500/25 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-colors flex-shrink-0"
          >
            ←
          </button>
          <div>
            <div className="text-[13px] font-medium text-slate-200">Новий огляд</div>
            <div className="text-[10px] text-slate-600">Заповніть дані прийому</div>
          </div>
          <div className="ml-auto text-[10px] text-slate-600">
            {new Date().toLocaleDateString("uk-UA")}
          </div>
        </div>

        {/* Пацієнт */}
        <div className="flex items-center gap-3 py-2.5 px-3 bg-red-500/5 border-b border-red-500/12 mb-4">
          <div className="w-9 h-9 rounded-lg bg-red-500/14 text-red-400 flex items-center justify-center text-[12px] font-medium flex-shrink-0">
            {playerName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
          </div>
          <div>
            <div className="text-[13px] font-medium text-slate-200">{playerName}</div>
            <div className="text-[10px] text-slate-600">{injuryInfo}</div>
          </div>
        </div>

        {/* VAS */}
        <div className="mb-4">
          <SectionLabel>Шкала болю ВАШ</SectionLabel>
          <VasSlider value={vas} onChange={setVas} />
        </div>

        {/* Клінічний огляд — структуровані поля */}
        <div className="mb-4">
          <SectionLabel>Клінічний огляд</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
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
        <div className="mb-4">
          <SectionLabel>Гоніометрія</SectionLabel>
          <button
            type="button"
            onClick={() => setShowGonio(!showGonio)}
            className="text-[11px] text-blue-400 border border-blue-500/28 bg-blue-500/10 rounded-lg px-3 py-2 hover:bg-blue-500/18 transition-colors"
          >
            📐 {showGonio ? "Сховати гоніометр" : "Відкрити гоніометр"}
          </button>
          {showGonio && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>Згинання (°)</FieldLabel>
                <input
                  type="number"
                  value={gonioFlex}
                  onChange={(e) => setGonioFlex(e.target.value)}
                  placeholder="напр. 120"
                  className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none"
                />
              </div>
              <div>
                <FieldLabel>Розгинання (°)</FieldLabel>
                <input
                  type="number"
                  value={gonioExt}
                  onChange={(e) => setGonioExt(e.target.value)}
                  placeholder="напр. 0"
                  className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Об'єктивні нотатки */}
        <div className="mb-4">
          <SectionLabel>Об'єктивні нотатки (лікар)</SectionLabel>
          <textarea
            value={objectiveNote}
            onChange={(e) => setObjectiveNote(e.target.value)}
            placeholder="Що бачить лікар: пальпація, тести, спостереження..."
            rows={3}
            className="w-full bg-slate-900/82 border border-blue-900/20 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Суб'єктивні нотатки */}
        <div className="mb-4">
          <SectionLabel>Суб'єктивні нотатки (гравець)</SectionLabel>
          <textarea
            value={subjectiveNote}
            onChange={(e) => setSubjectiveNote(e.target.value)}
            placeholder="Що відчуває гравець: скарги, відчуття..."
            rows={2}
            className="w-full bg-slate-900/82 border border-blue-900/20 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Призначення */}
        <div className="mb-4">
          <SectionLabel>Призначення</SectionLabel>
          <div className="mb-3">
            <FieldLabel>Статус після огляду</FieldLabel>
            <ChipGroup
              value={newStatus}
              onChange={setNewStatus}
              options={[
                { value: "active", label: "Не готовий", activeClass: "bg-red-500/15 text-red-400 border-red-500/35" },
                { value: "rehabilitation", label: "Реабілітація", activeClass: "bg-amber-500/15 text-amber-400 border-amber-500/35" },
                { value: "closed", label: "Допущений", activeClass: "bg-green-500/15 text-green-400 border-green-500/35" },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Наступний огляд / очік. повернення</FieldLabel>
            <input
              type="date"
              value={nextExam}
              onChange={(e) => setNextExam(e.target.value)}
              className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none"
            />
          </div>
        </div>

        {/* Попередні огляди */}
        {prevLogs.length > 0 && (
          <div className="mb-4">
            <SectionLabel>Попередні огляди</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {prevLogs.slice(0, 3).map((log, i) => (
                <div key={i} className="bg-slate-900/60 border border-blue-900/12 rounded-lg px-3 py-2 flex gap-3">
                  <span className="text-[9px] text-slate-600 flex-shrink-0 w-16">{log.date}</span>
                  <span className="text-[11px] text-slate-500 leading-relaxed">{log.note}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-[11px] text-red-400">
            {error}
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-2 pt-2 border-t border-blue-900/12">
          <button
            type="button"
            onClick={() => router.push(`/injuries/${injuryId}`)}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-blue-400 border border-blue-500/28 bg-blue-500/8 hover:bg-blue-500/15 transition-colors"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? "Збереження..." : "Зберегти огляд"}
          </button>
        </div>
      </div>
    </div>
  );
}
