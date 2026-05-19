"use client";
// src/app/[locale]/injuries/new/InjuryFormClient.tsx

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/utils/supabase/client";

// ── Типи ─────────────────────────────────────────────────────────────────────
type Player = { id: string; first_name: string; last_name: string; team: string };

// ── Дані форми ────────────────────────────────────────────────────────────────
const INJURY_TYPES = [
  { value: "muscular",    label: "М'язова" },
  { value: "ligament",   label: "Зв'язкова" },
  { value: "bone",       label: "Кісткова" },
  { value: "tendon",     label: "Сухожилкова" },
  { value: "cartilage",  label: "Хрящова" },
  { value: "concussion", label: "Струс мозку" },
  { value: "contusion",  label: "Забій" },
  { value: "other",      label: "Інше" },
];

const LOCATIONS = [
  { value: "knee",     label: "Коліно" },
  { value: "ankle",    label: "Щиколотка" },
  { value: "thigh",    label: "Стегно" },
  { value: "calf",     label: "Гомілка" },
  { value: "groin",    label: "Пах" },
  { value: "hip",      label: "Кульшовий суглоб" },
  { value: "shoulder", label: "Плече" },
  { value: "back",     label: "Спина / поперек" },
  { value: "neck",     label: "Шия" },
  { value: "foot",     label: "Стопа" },
  { value: "wrist",    label: "Зап'ясток" },
  { value: "head",     label: "Голова" },
  { value: "other",    label: "Інше" },
];

const SEVERITIES = [
  { value: "minimal",           label: "Мінімальна",  sub: "1–3 дні",    cls: "border-green-500/35 text-green-400 bg-green-500/10" },
  { value: "mild",              label: "Легка",       sub: "4–7 днів",   cls: "border-green-500/35 text-green-400 bg-green-500/10" },
  { value: "moderate",          label: "Помірна",     sub: "8–28 днів",  cls: "border-amber-500/35 text-amber-400 bg-amber-500/10" },
  { value: "severe",            label: "Тяжка",       sub: "29–90 днів", cls: "border-red-500/35 text-red-400 bg-red-500/10" },
  { value: "career_threatening",label: "Загроза карʼєрі", sub: ">90 дн.", cls: "border-red-500/35 text-red-400 bg-red-500/10" },
];

const MECHANISMS = [
  { value: "contact",     label: "Контактна",     icon: "⚡" },
  { value: "non_contact", label: "Неконтактна",   icon: "🏃" },
  { value: "overuse",     label: "Перевантаження",icon: "🔄" },
];

const SIDES = [
  { value: "left",      label: "Ліва / лівий" },
  { value: "right",     label: "Права / правий" },
  { value: "bilateral", label: "Двостороння" },
];

// ── UI Компоненти ─────────────────────────────────────────────────────────────
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

function SelectField({
  value, onChange, options,
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
      <option value="">— Оберіть —</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Головний компонент ────────────────────────────────────────────────────────
export default function InjuryFormClient({
  players,
  locale,
}: {
  players: Player[];
  locale: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Поля форми
  const [playerId,       setPlayerId]       = useState("");
  const [injuryType,     setInjuryType]     = useState("");
  const [location,       setLocation]       = useState("");
  const [side,           setSide]           = useState("right");
  const [severity,       setSeverity]       = useState("moderate");
  const [mechanism,      setMechanism]      = useState("non_contact");
  const [dateOfInjury,   setDateOfInjury]   = useState(
    new Date().toISOString().split("T")[0]
  );
  const [expectedReturn, setExpectedReturn] = useState("");
  const [vas,            setVas]            = useState(5);
  const [description,    setDescription]    = useState("");

  // ── Підрахунок очікуваного повернення ─────────────────────────────────────
  const RTP_DAYS: Record<string, number> = {
    minimal: 3, mild: 7, moderate: 21, severe: 60, career_threatening: 120,
  };

  function autoFillRtp(sev: string) {
    setSeverity(sev);
    if (dateOfInjury) {
      const d = new Date(dateOfInjury);
      d.setDate(d.getDate() + (RTP_DAYS[sev] ?? 21));
      setExpectedReturn(d.toISOString().split("T")[0]);
    }
  }

  // ── Збереження ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!playerId || !injuryType || !location) {
      setError("Заповніть обов'язкові поля: гравець, тип травми, локалізація");
      return;
    }
    setError(null);

    startTransition(async () => {
      const supabase = createClient();

      const { data: injury, error: insertError } = await supabase
        .from("injuries")
        .insert({
          player_id:            playerId,
          injury_type:          injuryType,
          location:             location,
          side:                 side,
          severity:             severity,
          mechanism:            mechanism,
          date_of_injury:       dateOfInjury,
          expected_return_date: expectedReturn || null,
          status:               "active",
          description:          description || null,
        })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      // Додаємо перший лог із ВАШ
      if (injury) {
        await supabase.from("injury_logs").insert({
          injury_id: injury.id,
          date:      dateOfInjury,
          note:      `Первинний огляд. ВАШ: ${vas}/10. Механізм: ${{
            contact: "контактна", non_contact: "неконтактна", overuse: "перевантаження",
          }[mechanism]}. ${description ? description : ""}`.trim(),
        });
      }

      router.push(`/${locale}`);
    });
  }

  const vasColor = vas <= 3 ? "text-green-400" : vas <= 6 ? "text-amber-400" : "text-red-400";

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
        <div className="flex items-center gap-3 py-3 border-b border-blue-900/15 mb-4">
          <button
            onClick={() => router.push(`/${locale}`)}
            className="w-8 h-8 rounded-lg bg-blue-500/12 border border-blue-500/25 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-colors flex-shrink-0"
          >
            ←
          </button>
          <div className="flex-1">
            <div className="text-[13px] font-medium text-slate-200">Фіксація травми</div>
            <div className="text-[10px] text-slate-600">Заповніть всі поля</div>
          </div>
          <span className="text-[10px] text-slate-600">
            {new Date().toLocaleDateString("uk-UA")}
          </span>
        </div>

        {/* Помилка */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/25 rounded-lg text-[11px] text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* ── Гравець ── */}
        <div className="mb-4">
          <SectionLabel>Гравець *</SectionLabel>
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2.5 text-[12px] text-slate-300 outline-none cursor-pointer"
          >
            <option value="">— Оберіть гравця —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.last_name} {p.first_name} · {p.team}
              </option>
            ))}
          </select>
        </div>

        {/* ── Дата травми ── */}
        <div className="mb-4">
          <SectionLabel>Дата отримання травми *</SectionLabel>
          <input
            type="date"
            value={dateOfInjury}
            onChange={(e) => setDateOfInjury(e.target.value)}
            className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none"
          />
        </div>

        {/* ── Тип + Локалізація ── */}
        <div className="mb-4">
          <SectionLabel>Характер травми *</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Тип травми</FieldLabel>
              <SelectField value={injuryType} onChange={setInjuryType} options={INJURY_TYPES} />
            </div>
            <div>
              <FieldLabel>Локалізація</FieldLabel>
              <SelectField value={location} onChange={setLocation} options={LOCATIONS} />
            </div>
          </div>
          <div className="mt-2">
            <FieldLabel>Сторона</FieldLabel>
            <div className="flex gap-2">
              {SIDES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSide(s.value)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-medium border transition-all ${
                    side === s.value
                      ? "bg-blue-500/18 text-blue-400 border-blue-500/40"
                      : "bg-slate-900/80 text-slate-500 border-blue-900/18 hover:border-blue-500/30"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Механізм ── */}
        <div className="mb-4">
          <SectionLabel>Механізм травми</SectionLabel>
          <div className="flex gap-2">
            {MECHANISMS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMechanism(m.value)}
                className={`flex-1 py-2.5 rounded-lg text-[11px] font-medium border transition-all ${
                  mechanism === m.value
                    ? "bg-blue-500/18 text-blue-400 border-blue-500/40"
                    : "bg-slate-900/80 text-slate-500 border-blue-900/18 hover:border-blue-500/30"
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Тяжкість ── */}
        <div className="mb-4">
          <SectionLabel>Тяжкість травми</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => autoFillRtp(s.value)}
                className={`py-2.5 px-3 rounded-lg text-left border transition-all ${
                  severity === s.value
                    ? s.cls
                    : "bg-slate-900/80 text-slate-500 border-blue-900/18 hover:border-blue-500/25"
                }`}
              >
                <div className="text-[11px] font-medium">{s.label}</div>
                <div className="text-[9px] opacity-70 mt-0.5">{s.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── ВАШ ── */}
        <div className="mb-4">
          <SectionLabel>Шкала болю ВАШ</SectionLabel>
          <div className="bg-slate-900/82 border border-blue-900/18 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] text-slate-500">Біль при первинному огляді</span>
              <span className={`text-[22px] font-medium ${vasColor}`}>{vas}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={vas}
              onChange={(e) => setVas(Number(e.target.value))}
              className="w-full h-1.5 rounded-full cursor-pointer"
              style={{ background: "linear-gradient(90deg,#22C55E,#F59E0B 50%,#EF4444)" }}
            />
            <div className="flex justify-between text-[9px] text-slate-600 mt-1">
              <span>0 — без болю</span>
              <span>10 — нестерпний</span>
            </div>
          </div>
        </div>

        {/* ── Очікуване повернення ── */}
        <div className="mb-4">
          <SectionLabel>Очікуване повернення (RTP)</SectionLabel>
          <input
            type="date"
            value={expectedReturn}
            onChange={(e) => setExpectedReturn(e.target.value)}
            className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none"
          />
          <div className="text-[9px] text-slate-600 mt-1">
            * Автоматично розраховується на основі тяжкості, можна змінити вручну
          </div>
        </div>

        {/* ── Опис ── */}
        <div className="mb-4">
          <SectionLabel>Опис / обставини травми</SectionLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Як отримано травму, обставини, перший огляд..."
            rows={3}
            className="w-full bg-slate-900/82 border border-blue-900/20 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none resize-none leading-relaxed"
          />
        </div>

        {/* ── Кнопки ── */}
        <div className="flex gap-2 pt-2 border-t border-blue-900/12">
          <button
            type="button"
            onClick={() => router.push(`/${locale}`)}
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
            {isPending ? "Збереження..." : "Зафіксувати травму"}
          </button>
        </div>

      </div>
    </div>
  );
}
