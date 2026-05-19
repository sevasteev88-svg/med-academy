// src/app/[locale]/exams/new/[injuryId]/page.tsx
// Форма нового огляду для конкретної травми

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/utils/supabase/client";

// ── Типи ─────────────────────────────────────────────────────────────────────
type DynamicsOption = "improvement" | "unchanged" | "worsening";
type StatusOption = "active" | "rehabilitation" | "closed";

// ── Компоненти UI ─────────────────────────────────────────────────────────────
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
  return (
    <div className="text-[10px] text-slate-500 mb-1">{children}</div>
  );
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

// ── Чіп-вибір ────────────────────────────────────────────────────────────────
function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color: string; activeClass: string }[];
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

// ── VAS Slider ────────────────────────────────────────────────────────────────
function VasSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const color =
    value <= 3
      ? "text-green-400"
      : value <= 6
      ? "text-amber-400"
      : "text-red-400";
  return (
    <div className="bg-slate-900/82 border border-blue-900/18 rounded-lg p-3">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[11px] text-slate-500">Оцініть біль зараз</span>
        <span className={`text-[22px] font-medium ${color}`}>{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full cursor-pointer accent-blue-500"
        style={{
          background: `linear-gradient(90deg, #22C55E, #F59E0B 50%, #EF4444)`,
        }}
      />
      <div className="flex justify-between text-[9px] text-slate-600 mt-1">
        <span>0 — без болю</span>
        <span>10 — нестерпний</span>
      </div>
    </div>
  );
}

// ── Головна форма (Client Component) ─────────────────────────────────────────
export default function ExamFormClient({
  injuryId,
  locale,
  playerName,
  injuryInfo,
  prevLogs,
}: {
  injuryId: string;
  locale: string;
  playerName: string;
  injuryInfo: string;
  prevLogs: { date: string; note: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Поля форми
  const [vas, setVas] = useState(5);
  const [dynamics, setDynamics] = useState<DynamicsOption>("improvement");
  const [swelling, setSwelling] = useState("moderate");
  const [weightBearing, setWeightBearing] = useState("partial");
  const [notes, setNotes] = useState("");
  const [newStatus, setNewStatus] = useState<StatusOption>("active");
  const [nextExam, setNextExam] = useState("");
  const [treatment, setTreatment] = useState("");

  // Гоніометрія (опціонально)
  const [showGonio, setShowGonio] = useState(false);
  const [gonioFlex, setGonioFlex] = useState("");
  const [gonioExt, setGonioExt] = useState("");

  async function handleSave() {
    const supabase = createClient();

    // Формуємо нотатку
    const noteLines = [
      `ВАШ: ${vas}/10`,
      `Динаміка: ${{ improvement: "Покращення", unchanged: "Без змін", worsening: "Погіршення" }[dynamics]}`,
      `Набряк: ${swelling}`,
      `Навантаження: ${weightBearing}`,
      treatment ? `Призначення: ${treatment}` : null,
      showGonio && gonioFlex ? `Гоніо: згинання ${gonioFlex}°, розгинання ${gonioExt}°` : null,
      notes ? `Нотатки: ${notes}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    startTransition(async () => {
      // Зберігаємо лог огляду
      await supabase.from("injury_logs").insert({
        injury_id: injuryId,
        date: new Date().toISOString().split("T")[0],
        note: noteLines,
      });

      // Оновлюємо статус травми якщо змінився
      await supabase
        .from("injuries")
        .update({
          status: newStatus,
          ...(nextExam ? { expected_return_date: nextExam } : {}),
        })
        .eq("id", injuryId);

      router.push(`/${locale}/exams/new`);
    });
  }

  return (
    <div
      className="relative min-h-screen"
      style={{
        background:
          "repeating-linear-gradient(90deg,#060C1E 0px,#060C1E 60px,#0D2550 60px,#0D2550 120px)",
      }}
    >
      <div className="absolute inset-0 bg-[rgba(4,6,14,0.72)] pointer-events-none" />

      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* Topbar */}
        <div className="flex items-center gap-3 py-3 border-b border-blue-900/15 mb-0">
          <button
            onClick={() => router.push(`/${locale}/exams/new`)}
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

        {/* Динаміка */}
        <div className="mb-4">
          <SectionLabel>Динаміка стану</SectionLabel>
          <ChipGroup
            value={dynamics}
            onChange={setDynamics}
            options={[
              { value: "improvement", label: "Покращення", color: "", activeClass: "bg-green-500/15 text-green-400 border-green-500/35" },
              { value: "unchanged", label: "Без змін", color: "", activeClass: "bg-amber-500/15 text-amber-400 border-amber-500/35" },
              { value: "worsening", label: "Погіршення", color: "", activeClass: "bg-red-500/15 text-red-400 border-red-500/35" },
            ]}
          />
        </div>

        {/* Клінічний огляд */}
        <div className="mb-4">
          <SectionLabel>Клінічний огляд</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Набряк</FieldLabel>
              <Select
                value={swelling}
                onChange={setSwelling}
                options={[
                  { value: "none", label: "Відсутній" },
                  { value: "mild", label: "Незначний" },
                  { value: "moderate", label: "Помірний" },
                  { value: "severe", label: "Значний" },
                ]}
              />
            </div>
            <div>
              <FieldLabel>Навантаження на ногу</FieldLabel>
              <Select
                value={weightBearing}
                onChange={setWeightBearing}
                options={[
                  { value: "full", label: "Повне" },
                  { value: "partial", label: "Часткове" },
                  { value: "none", label: "Неможливе" },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Гоніометр (згорнутий за замовч.) */}
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

        {/* Нотатки */}
        <div className="mb-4">
          <SectionLabel>Нотатки лікаря</SectionLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Спостереження, динаміка, особливості..."
            rows={3}
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
                { value: "active", label: "Не готовий", color: "", activeClass: "bg-red-500/15 text-red-400 border-red-500/35" },
                { value: "rehabilitation", label: "Реабілітація", color: "", activeClass: "bg-amber-500/15 text-amber-400 border-amber-500/35" },
                { value: "closed", label: "Допущений", color: "", activeClass: "bg-green-500/15 text-green-400 border-green-500/35" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <FieldLabel>Наступний огляд</FieldLabel>
              <input
                type="date"
                value={nextExam}
                onChange={(e) => setNextExam(e.target.value)}
                className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none"
              />
            </div>
            <div>
              <FieldLabel>Процедури / лікування</FieldLabel>
              <input
                type="text"
                value={treatment}
                onChange={(e) => setTreatment(e.target.value)}
                placeholder="фізіотерапія, кріо..."
                className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Попередні огляди */}
        {prevLogs.length > 0 && (
          <div className="mb-4">
            <SectionLabel>Попередні огляди</SectionLabel>
            <div className="flex flex-col gap-1.5">
              {prevLogs.slice(0, 3).map((log, i) => (
                <div
                  key={i}
                  className="bg-slate-900/60 border border-blue-900/12 rounded-lg px-3 py-2 flex gap-3"
                >
                  <span className="text-[9px] text-slate-600 flex-shrink-0 w-16">
                    {log.date}
                  </span>
                  <span className="text-[11px] text-slate-500 leading-relaxed">
                    {log.note}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-2 pt-2 border-t border-blue-900/12">
          <button
            type="button"
            onClick={() => router.push(`/${locale}/exams/new`)}
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
