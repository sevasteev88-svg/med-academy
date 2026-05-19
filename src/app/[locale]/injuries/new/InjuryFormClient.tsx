"use client";
// src/app/[locale]/injuries/new/InjuryFormClient.tsx

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/utils/supabase/client";

type Player = { id: string; first_name: string; last_name: string; team: string };

// ── Довідники ─────────────────────────────────────────────────────────────────
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

const SIDES = [
  { value: "left",      label: "Ліва" },
  { value: "right",     label: "Права" },
  { value: "bilateral", label: "Обидві" },
];

const MECHANISMS = [
  { value: "contact",     label: "Контактна",      icon: "⚡" },
  { value: "non_contact", label: "Неконтактна",    icon: "🏃" },
  { value: "overuse",     label: "Перевантаження", icon: "🔄" },
];

const SEVERITIES = [
  { value: "minimal",            label: "Мінімальна",      sub: "1–3 дні",    cls: "border-green-500/35 text-green-400 bg-green-500/10" },
  { value: "mild",               label: "Легка",            sub: "4–7 днів",   cls: "border-green-500/35 text-green-400 bg-green-500/10" },
  { value: "moderate",           label: "Помірна",          sub: "8–28 днів",  cls: "border-amber-500/35 text-amber-400 bg-amber-500/10" },
  { value: "severe",             label: "Тяжка",            sub: "29–90 днів", cls: "border-red-500/35 text-red-400 bg-red-500/10" },
  { value: "career_threatening", label: "Загроза кар'єрі",  sub: ">90 дн.",    cls: "border-red-500/35 text-red-400 bg-red-500/10" },
];

// ── Munich Consensus 2012 ─────────────────────────────────────────────────────
const MUNICH_GRADES = [
  {
    value: "1a", label: "1A — Функціональне / втомне",
    sub: "Без структурних змін, пов'язане з перевтомою",
    cls: "border-blue-500/30 text-blue-400 bg-blue-500/8",
  },
  {
    value: "1b", label: "1B — DOMS",
    sub: "Відстрочений м'язовий біль після навантаження",
    cls: "border-blue-500/30 text-blue-400 bg-blue-500/8",
  },
  {
    value: "2a", label: "2A — Нейром. / хребет",
    sub: "Нейром. розлад, пов'язаний з хребтом",
    cls: "border-violet-500/30 text-violet-400 bg-violet-500/8",
  },
  {
    value: "2b", label: "2B — Нейром. / перифер.",
    sub: "Нейром. розлад, пов'язаний з перифер. нервом",
    cls: "border-violet-500/30 text-violet-400 bg-violet-500/8",
  },
  {
    value: "3a", label: "3A — Мінімальний частковий",
    sub: "Незначний надрив, локальний (<1 см)",
    cls: "border-amber-500/30 text-amber-400 bg-amber-500/8",
  },
  {
    value: "3b", label: "3B — Помірний частковий",
    sub: "Помірний надрив, мультифасцикулярний",
    cls: "border-amber-500/30 text-amber-400 bg-amber-500/8",
  },
  {
    value: "4",  label: "4 — Субтотальний / повний",
    sub: "Субтотальний або повний розрив м'яза",
    cls: "border-red-500/30 text-red-400 bg-red-500/8",
  },
];

// ── BAMIC (Hollabaugh 2024) ───────────────────────────────────────────────────
const BAMIC_GRADES = [
  { value: "0",  label: "0",  sub: "Норма — без змін на МРТ/УЗД",         cls: "border-green-500/30 text-green-400" },
  { value: "1",  label: "1",  sub: "Мінімальний (<10% поперечника)",       cls: "border-blue-500/30 text-blue-400" },
  { value: "2",  label: "2",  sub: "Помірний (10–50% поперечника)",        cls: "border-amber-500/30 text-amber-400" },
  { value: "3",  label: "3",  sub: "Виражений (>50% поперечника)",         cls: "border-orange-500/30 text-orange-400" },
  { value: "4",  label: "4",  sub: "Повний розрив або відрив сухожилля",   cls: "border-red-500/30 text-red-400" },
];

const BAMIC_LOCATIONS = [
  { value: "a", label: "a — М'язово-фасціальний", sub: "Міофасціальне з'єднання" },
  { value: "b", label: "b — М'язово-сухожилковий", sub: "М'язово-сухожилковий перехід" },
  { value: "c", label: "c — Інтратендинальний ⚠️", sub: "Усередині сухожилля (T-junction)" },
];

// ── MLG-R (Valle et al., Sports Med 2017) ────────────────────────────────────
// Muscle Lesion Grade – Radiological
// DOI: 10.1007/s40279-016-0647-1 · PMID: 27878524
const MLGR_GRADES = [
  // ── Функціональні (без структурних змін на МРТ/УЗД) ──
  {
    value: "0a", label: "0-I · Функціональна / перевтома",
    sub: "Без структурних змін. Пов'язана з перевтомою або DOMS.",
    cls: "border-blue-500/30 text-blue-400 bg-blue-500/8", group: "functional",
  },
  {
    value: "0b", label: "0-II · Нейром. / відображений біль",
    sub: "Без структурних змін. Нейродинамічний або відображений соматичний біль.",
    cls: "border-blue-500/30 text-blue-400 bg-blue-500/8", group: "functional",
  },
  // ── Структурні ──
  {
    value: "1a", label: "1a · Незначна / міофасціальна",
    sub: "МРТ <1 см. Периферична, на рівні фасції / епімізію.",
    cls: "border-green-500/30 text-green-400 bg-green-500/8", group: "structural",
  },
  {
    value: "1b", label: "1b · Незначна / внутрішньом'язова",
    sub: "МРТ <1 см. Центральна, всередині м'язового черевця.",
    cls: "border-green-500/30 text-green-400 bg-green-500/8", group: "structural",
  },
  {
    value: "2a", label: "2a · Помірна / міофасціальна",
    sub: "МРТ 1–5 см. Периферична, біля фасції.",
    cls: "border-amber-500/30 text-amber-400 bg-amber-500/8", group: "structural",
  },
  {
    value: "2b", label: "2b · Помірна / м'язово-сухожилкова",
    sub: "МРТ 1–5 см. На рівні м'язово-сухожилкового переходу.",
    cls: "border-amber-500/30 text-amber-400 bg-amber-500/8", group: "structural",
  },
  {
    value: "2c", label: "2c · Помірна / інтратендинальна",
    sub: "МРТ 1–5 см. Всередині сухожилля (T-junction).",
    cls: "border-orange-500/30 text-orange-400 bg-orange-500/8", group: "structural",
  },
  {
    value: "3a", label: "3a · Тяжка / часткова",
    sub: "МРТ >5 см. Великий частковий розрив.",
    cls: "border-red-500/30 text-red-400 bg-red-500/8", group: "structural",
  },
  {
    value: "3b", label: "3b · Тяжка / сухожилкова часткова",
    sub: "МРТ >5 см. Великий частковий розрив сухожилля.",
    cls: "border-red-500/30 text-red-400 bg-red-500/8", group: "structural",
  },
  {
    value: "4a", label: "4a · Повний розрив м'яза",
    sub: "Повний розрив м'язового черевця.",
    cls: "border-red-500/40 text-red-300 bg-red-500/12", group: "structural",
  },
  {
    value: "4b", label: "4b · Повний відрив сухожилля",
    sub: "Повний відрив сухожилля / авульсія.",
    cls: "border-red-500/40 text-red-300 bg-red-500/12", group: "structural",
  },
];

// ── RTP за тяжкістю ───────────────────────────────────────────────────────────
const RTP_DAYS: Record<string, number> = {
  minimal: 3, mild: 7, moderate: 21, severe: 60, career_threatening: 120,
};

// ── UI Компоненти ─────────────────────────────────────────────────────────────
function SectionLabel({ children, badge }: { children: React.ReactNode; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[9px] uppercase tracking-widest text-slate-600 whitespace-nowrap">
        {children}
      </span>
      {badge && (
        <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
          {badge}
        </span>
      )}
      <div className="flex-1 h-px bg-blue-900/20" />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] text-slate-500 mb-1">{children}</div>;
}

function SelectField({ value, onChange, options }: {
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
export default function InjuryFormClient({ players, locale }: { players: Player[]; locale: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [playerId,       setPlayerId]       = useState("");
  const [injuryType,     setInjuryType]     = useState("");
  const [location,       setLocation]       = useState("");
  const [side,           setSide]           = useState("right");
  const [severity,       setSeverity]       = useState("moderate");
  const [mechanism,      setMechanism]      = useState("non_contact");
  const [dateOfInjury,   setDateOfInjury]   = useState(new Date().toISOString().split("T")[0]);
  const [expectedReturn, setExpectedReturn] = useState("");
  const [vas,            setVas]            = useState(5);
  const [description,    setDescription]    = useState("");

  // Класифікації (тільки для м'язових)
  const [classSystem,    setClassSystem]    = useState<"none" | "munich" | "bamic" | "barcelona">("none");
  const [munichGrade,    setMunichGrade]    = useState("");
  const [bamicGrade,     setBamicGrade]     = useState("");
  const [bamicLocation,  setBamicLocation]  = useState("");
  const [mlgrGrade,      setMlgrGrade]      = useState("");

  const isMuscular = injuryType === "muscular";

  function autoFillRtp(sev: string) {
    setSeverity(sev);
    if (dateOfInjury) {
      const d = new Date(dateOfInjury);
      d.setDate(d.getDate() + (RTP_DAYS[sev] ?? 21));
      setExpectedReturn(d.toISOString().split("T")[0]);
    }
  }

  async function handleSave() {
    if (!playerId || !injuryType || !location) {
      setError("Заповніть обов'язкові поля: гравець, тип травми, локалізація");
      return;
    }
    setError(null);

    // Формуємо класифікаційний рядок
    let classNote = "";
    if (isMuscular) {
      if (classSystem === "munich" && munichGrade)
        classNote = `Munich: ${munichGrade.toUpperCase()}`;
      else if (classSystem === "bamic" && bamicGrade)
        classNote = `BAMIC: ${bamicGrade}${bamicLocation}`;
      else if (classSystem === "barcelona" && mlgrGrade)
        classNote = `MLG-R: ${mlgrGrade.toUpperCase()}`;
    }

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
          description:          [description, classNote].filter(Boolean).join(" | ") || null,
        })
        .select()
        .single();

      if (insertError) { setError(insertError.message); return; }

      if (injury) {
        const noteLines = [
          `Первинний огляд. ВАШ: ${vas}/10`,
          `Механізм: ${{ contact: "контактна", non_contact: "неконтактна", overuse: "перевантаження" }[mechanism]}`,
          classNote,
          description,
        ].filter(Boolean).join(" | ");

        await supabase.from("injury_logs").insert({
          injury_id: injury.id,
          date:      dateOfInjury,
          note:      noteLines,
        });
      }

      router.push(`/${locale}`);
    });
  }

  const vasColor = vas <= 3 ? "text-green-400" : vas <= 6 ? "text-amber-400" : "text-red-400";

  return (
    <div className="relative min-h-screen" style={{
      background: "repeating-linear-gradient(90deg,#060C1E 0px,#060C1E 60px,#0D2550 60px,#0D2550 120px)",
    }}>
      <div className="absolute inset-0 bg-[rgba(4,6,14,0.72)] pointer-events-none" />
      <div className="relative z-10 max-w-xl mx-auto px-4 pb-10">

        {/* Topbar */}
        <div className="flex items-center gap-3 py-3 border-b border-blue-900/15 mb-4">
          <button onClick={() => router.push(`/${locale}`)}
            className="w-8 h-8 rounded-lg bg-blue-500/12 border border-blue-500/25 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-colors flex-shrink-0">
            ←
          </button>
          <div className="flex-1">
            <div className="text-[13px] font-medium text-slate-200">Фіксація травми</div>
            <div className="text-[10px] text-slate-600">Заповніть всі поля</div>
          </div>
          <span className="text-[10px] text-slate-600">{new Date().toLocaleDateString("uk-UA")}</span>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/25 rounded-lg text-[11px] text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* Гравець */}
        <div className="mb-4">
          <SectionLabel>Гравець *</SectionLabel>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}
            className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2.5 text-[12px] text-slate-300 outline-none cursor-pointer">
            <option value="">— Оберіть гравця —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.last_name} {p.first_name} · {p.team}</option>
            ))}
          </select>
        </div>

        {/* Дата */}
        <div className="mb-4">
          <SectionLabel>Дата отримання травми *</SectionLabel>
          <input type="date" value={dateOfInjury} onChange={(e) => setDateOfInjury(e.target.value)}
            className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none" />
        </div>

        {/* Тип + Локалізація */}
        <div className="mb-4">
          <SectionLabel>Характер травми *</SectionLabel>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <FieldLabel>Тип травми</FieldLabel>
              <SelectField value={injuryType} onChange={setInjuryType} options={INJURY_TYPES} />
            </div>
            <div>
              <FieldLabel>Локалізація</FieldLabel>
              <SelectField value={location} onChange={setLocation} options={LOCATIONS} />
            </div>
          </div>
          <div>
            <FieldLabel>Сторона</FieldLabel>
            <div className="flex gap-2">
              {SIDES.map((s) => (
                <button key={s.value} type="button" onClick={() => setSide(s.value)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-medium border transition-all ${
                    side === s.value
                      ? "bg-blue-500/18 text-blue-400 border-blue-500/40"
                      : "bg-slate-900/80 text-slate-500 border-blue-900/18 hover:border-blue-500/30"
                  }`}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Механізм */}
        <div className="mb-4">
          <SectionLabel>Механізм травми</SectionLabel>
          <div className="flex gap-2">
            {MECHANISMS.map((m) => (
              <button key={m.value} type="button" onClick={() => setMechanism(m.value)}
                className={`flex-1 py-2.5 rounded-lg text-[11px] font-medium border transition-all ${
                  mechanism === m.value
                    ? "bg-blue-500/18 text-blue-400 border-blue-500/40"
                    : "bg-slate-900/80 text-slate-500 border-blue-900/18 hover:border-blue-500/30"
                }`}>{m.icon} {m.label}</button>
            ))}
          </div>
        </div>

        {/* Тяжкість */}
        <div className="mb-4">
          <SectionLabel>Тяжкість травми</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {SEVERITIES.map((s) => (
              <button key={s.value} type="button" onClick={() => autoFillRtp(s.value)}
                className={`py-2.5 px-3 rounded-lg text-left border transition-all ${
                  severity === s.value ? s.cls : "bg-slate-900/80 text-slate-500 border-blue-900/18 hover:border-blue-500/25"
                }`}>
                <div className="text-[11px] font-medium">{s.label}</div>
                <div className="text-[9px] opacity-70 mt-0.5">{s.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── КЛАСИФІКАЦІЇ М'ЯЗОВИХ ТРАВМ ── */}
        {isMuscular && (
          <div className="mb-4">
            <SectionLabel badge="тільки для м'язових">Класифікація пошкодження</SectionLabel>

            {/* Вибір системи */}
            <div className="flex gap-2 mb-3">
              {[
                { value: "none",      label: "Не застос." },
                { value: "munich",    label: "Munich 2012" },
                { value: "bamic",     label: "BAMIC" },
                { value: "barcelona", label: "MLG-R" },
              ].map((opt) => (
                <button key={opt.value} type="button"
                  onClick={() => setClassSystem(opt.value as any)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-medium border transition-all ${
                    classSystem === opt.value
                      ? "bg-blue-500/18 text-blue-400 border-blue-500/40"
                      : "bg-slate-900/80 text-slate-500 border-blue-900/18 hover:border-blue-500/25"
                  }`}>{opt.label}</button>
              ))}
            </div>

            {/* Munich */}
            {classSystem === "munich" && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[9px] text-slate-600 mb-1">Munich Consensus Classification 2012</div>
                {MUNICH_GRADES.map((g) => (
                  <button key={g.value} type="button" onClick={() => setMunichGrade(g.value)}
                    className={`px-3 py-2.5 rounded-lg text-left border transition-all ${
                      munichGrade === g.value ? g.cls : "bg-slate-900/80 text-slate-500 border-blue-900/15 hover:border-blue-500/25"
                    }`}>
                    <div className="text-[11px] font-medium">{g.label}</div>
                    <div className="text-[9px] opacity-70 mt-0.5">{g.sub}</div>
                  </button>
                ))}
              </div>
            )}

            {/* BAMIC */}
            {classSystem === "bamic" && (
              <div>
                <div className="text-[9px] text-slate-600 mb-2">
                  British Athletics Muscle Injury Classification · Hollabaugh 2024
                </div>
                <div className="mb-3">
                  <FieldLabel>Ступінь (Grade)</FieldLabel>
                  <div className="flex gap-1.5">
                    {BAMIC_GRADES.map((g) => (
                      <button key={g.value} type="button" onClick={() => setBamicGrade(g.value)}
                        className={`flex-1 py-2.5 rounded-lg border text-center transition-all ${
                          bamicGrade === g.value
                            ? `${g.cls} bg-opacity-10`
                            : "bg-slate-900/80 text-slate-500 border-blue-900/15 hover:border-blue-500/25"
                        }`}>
                        <div className={`text-[14px] font-medium ${bamicGrade === g.value ? g.cls.split(" ")[1] : ""}`}>{g.label}</div>
                      </button>
                    ))}
                  </div>
                  {bamicGrade && (
                    <div className="text-[9px] text-slate-500 mt-1 px-1">
                      {BAMIC_GRADES.find(g => g.value === bamicGrade)?.sub}
                    </div>
                  )}
                </div>
                <div>
                  <FieldLabel>Локалізація (суфікс)</FieldLabel>
                  <div className="flex flex-col gap-1.5">
                    {BAMIC_LOCATIONS.map((l) => (
                      <button key={l.value} type="button" onClick={() => setBamicLocation(l.value)}
                        className={`px-3 py-2 rounded-lg text-left border transition-all ${
                          bamicLocation === l.value
                            ? l.value === "c"
                              ? "bg-red-500/12 text-red-400 border-red-500/35"
                              : "bg-blue-500/12 text-blue-400 border-blue-500/35"
                            : "bg-slate-900/80 text-slate-500 border-blue-900/15 hover:border-blue-500/25"
                        }`}>
                        <div className="text-[11px] font-medium">{l.label}</div>
                        <div className="text-[9px] opacity-70 mt-0.5">{l.sub}</div>
                      </button>
                    ))}
                  </div>
                  {bamicGrade && bamicLocation && (
                    <div className="mt-2 px-3 py-2 bg-blue-500/8 border border-blue-500/20 rounded-lg">
                      <span className="text-[10px] text-slate-400">Код: </span>
                      <span className="text-[13px] font-medium text-blue-400">
                        BAMIC {bamicGrade}{bamicLocation}
                      </span>
                      {bamicLocation === "c" && (
                        <span className="ml-2 text-[9px] text-red-400">⚠️ T-junction — подвійний термін RTP</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MLG-R */}
            {classSystem === "barcelona" && (
              <div>
                <div className="text-[9px] text-slate-600 mb-2">
                  MLG-R · Valle X, Alentorn-Geli E, Pruna R et al. · Sports Med 2017
                </div>
                {/* Функціональні */}
                <div className="text-[8px] text-slate-700 uppercase tracking-wider mb-1 mt-1">
                  Функціональні (без структурних змін)
                </div>
                <div className="flex flex-col gap-1.5 mb-3">
                  {MLGR_GRADES.filter(g => g.group === "functional").map((g) => (
                    <button key={g.value} type="button" onClick={() => setMlgrGrade(g.value)}
                      className={`px-3 py-2.5 rounded-lg text-left border transition-all ${
                        mlgrGrade === g.value ? g.cls : "bg-slate-900/80 text-slate-500 border-blue-900/15 hover:border-blue-500/25"
                      }`}>
                      <div className="text-[11px] font-medium">{g.label}</div>
                      <div className="text-[9px] opacity-70 mt-0.5">{g.sub}</div>
                    </button>
                  ))}
                </div>
                {/* Структурні */}
                <div className="text-[8px] text-slate-700 uppercase tracking-wider mb-1">
                  Структурні пошкодження
                </div>
                <div className="flex flex-col gap-1.5">
                  {MLGR_GRADES.filter(g => g.group === "structural").map((g) => (
                    <button key={g.value} type="button" onClick={() => setMlgrGrade(g.value)}
                      className={`px-3 py-2.5 rounded-lg text-left border transition-all ${
                        mlgrGrade === g.value ? g.cls : "bg-slate-900/80 text-slate-500 border-blue-900/15 hover:border-blue-500/25"
                      }`}>
                      <div className="text-[11px] font-medium">{g.label}</div>
                      <div className="text-[9px] opacity-70 mt-0.5">{g.sub}</div>
                    </button>
                  ))}
                </div>
                {mlgrGrade && (
                  <div className="mt-2 px-3 py-2 bg-blue-500/8 border border-blue-500/20 rounded-lg">
                    <span className="text-[10px] text-slate-400">Код: </span>
                    <span className="text-[13px] font-medium text-blue-400">MLG-R {mlgrGrade.toUpperCase()}</span>
                    {mlgrGrade === "2c" && (
                      <span className="ml-2 text-[9px] text-orange-400">⚠️ Інтратендинальна — подовжений RTP</span>
                    )}
                    {(mlgrGrade === "4a" || mlgrGrade === "4b") && (
                      <span className="ml-2 text-[9px] text-red-400">🔴 Повний розрив — хірургічна консультація</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ВАШ */}
        <div className="mb-4">
          <SectionLabel>Шкала болю ВАШ</SectionLabel>
          <div className="bg-slate-900/82 border border-blue-900/18 rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] text-slate-500">Біль при первинному огляді</span>
              <span className={`text-[22px] font-medium ${vasColor}`}>{vas}</span>
            </div>
            <input type="range" min={0} max={10} value={vas}
              onChange={(e) => setVas(Number(e.target.value))}
              className="w-full h-1.5 rounded-full cursor-pointer"
              style={{ background: "linear-gradient(90deg,#22C55E,#F59E0B 50%,#EF4444)" }} />
            <div className="flex justify-between text-[9px] text-slate-600 mt-1">
              <span>0 — без болю</span><span>10 — нестерпний</span>
            </div>
          </div>
        </div>

        {/* RTP */}
        <div className="mb-4">
          <SectionLabel>Очікуване повернення (RTP)</SectionLabel>
          <input type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)}
            className="w-full bg-slate-900/85 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none" />
          <div className="text-[9px] text-slate-600 mt-1">
            * Автоматично розраховується з тяжкості, можна змінити вручну
          </div>
        </div>

        {/* Опис */}
        <div className="mb-4">
          <SectionLabel>Опис / обставини травми</SectionLabel>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Як отримано травму, обставини, перший огляд..."
            rows={3}
            className="w-full bg-slate-900/82 border border-blue-900/20 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none resize-none leading-relaxed" />
        </div>

        {/* Кнопки */}
        <div className="flex gap-2 pt-2 border-t border-blue-900/12">
          <button type="button" onClick={() => router.push(`/${locale}`)}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-blue-400 border border-blue-500/28 bg-blue-500/8 hover:bg-blue-500/15 transition-colors">
            Скасувати
          </button>
          <button type="button" onClick={handleSave} disabled={isPending}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isPending ? "Збереження..." : "Зафіксувати травму"}
          </button>
        </div>

      </div>
    </div>
  );
}
