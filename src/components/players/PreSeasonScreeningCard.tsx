"use client";

import { useState, useTransition } from "react";
import {
  type PreSeasonScreening,
  type ClearanceStatus,
  CLEARANCE_STATUS_META,
} from "@/types/screening";
import { saveScreeningAction } from "@/actions/save-screening-action";

type Props = {
  playerId: string;
  playerName: string;
  initialScreenings: PreSeasonScreening[];
};

export default function PreSeasonScreeningCard({
  playerId,
  playerName,
  initialScreenings,
}: Props) {
  const [screenings, setScreenings] = useState<PreSeasonScreening[]>(initialScreenings);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedScreening, setSelectedScreening] = useState<PreSeasonScreening | null>(
    initialScreenings[0] || null
  );

  const [isPending, startTransition] = useTransition();

  // Form inputs
  const [season, setSeason] = useState("2025/2026");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [doctor, setDoctor] = useState("Лікар-травматолог штабу");

  // Cardio
  const [ecgRest, setEcgRest] = useState<"normal" | "borderline" | "abnormal">("normal");
  const [echo, setEcho] = useState<"normal" | "abnormal" | "not_done">("normal");
  const [bpSystolic, setBpSystolic] = useState(120);
  const [bpDiastolic, setBpDiastolic] = useState(80);
  const [hrRest, setHrRest] = useState(62);
  const [cardioClearance, setCardioClearance] = useState(true);

  // Ortho
  const [thomasLeft, setThomasLeft] = useState<"normal" | "tight">("normal");
  const [thomasRight, setThomasRight] = useState<"normal" | "tight">("normal");
  const [hamstringsLeft, setHamstringsLeft] = useState(15);
  const [hamstringsRight, setHamstringsRight] = useState(15);
  const [wbltLeft, setWbltLeft] = useState(11);
  const [wbltRight, setWbltRight] = useState(11);
  const [beighton, setBeighton] = useState(2);
  const [surgeries, setSurgeries] = useState("");

  // Lab
  const [hemoglobin, setHemoglobin] = useState<number | "">(148);
  const [ferritin, setFerritin] = useState<number | "">(65);
  const [vitaminD, setVitaminD] = useState<number | "">(42);

  // Verdict
  const [overallStatus, setOverallStatus] = useState<ClearanceStatus>("cleared");
  const [restrictions, setRestrictions] = useState("");
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );

  const latest = screenings[0] || null;
  const latestMeta = latest ? CLEARANCE_STATUS_META[latest.overall_status] : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      const res = await saveScreeningAction({
        player_id: playerId,
        season,
        date,
        examiner_doctor: doctor,
        cardio_ecg_rest: ecgRest,
        cardio_echo: echo,
        cardio_bp_systolic: Number(bpSystolic),
        cardio_bp_diastolic: Number(bpDiastolic),
        cardio_hr_rest: Number(hrRest),
        cardio_clearance: cardioClearance,
        ortho_thomas_test_left: thomasLeft,
        ortho_thomas_test_right: thomasRight,
        ortho_hamstrings_90_90_left: Number(hamstringsLeft),
        ortho_hamstrings_90_90_right: Number(hamstringsRight),
        ortho_ankle_lunge_wblt_left: Number(wbltLeft),
        ortho_ankle_lunge_wblt_right: Number(wbltRight),
        ortho_beighton_hypermobility_score: Number(beighton),
        ortho_previous_surgeries: surgeries.trim() || null,
        lab_hemoglobin: hemoglobin !== "" ? Number(hemoglobin) : null,
        lab_ferritin: ferritin !== "" ? Number(ferritin) : null,
        lab_vitamin_d: vitaminD !== "" ? Number(vitaminD) : null,
        overall_status: overallStatus,
        restrictions_notes: restrictions.trim() || null,
        valid_until: validUntil,
      });

      if (res.screening) {
        setScreenings([res.screening, ...screenings]);
        setSelectedScreening(res.screening);
        setIsFormOpen(false);
      }
    });
  };

  return (
    <div className="bg-slate-900/90 border border-blue-900/25 rounded-2xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-900/20 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-xl">
            🏥
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Передсезонний медичний скринінг (PPE Screening)
            </h3>
            <p className="text-[11px] text-slate-400">
              Кардіодопуск, біомеханіка суглобів та лабораторний паспорт
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {latestMeta && (
            <span
              className={`px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${latestMeta.badgeClass}`}
            >
              <span>{latestMeta.icon}</span>
              <span>{latestMeta.label}</span>
            </span>
          )}
          <button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all"
          >
            {isFormOpen ? "✕ Закрити форму" : "+ Внести скринінг"}
          </button>
        </div>
      </div>

      {/* Latest summary details */}
      {selectedScreening && !isFormOpen && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950/60 p-4 rounded-xl border border-blue-900/20 text-xs">
          {/* Cardio */}
          <div className="space-y-1.5">
            <div className="font-bold text-slate-300 flex items-center gap-1.5">
              <span>❤️</span> Кардіологічний профіль
            </div>
            <div className="text-slate-400">
              ЕКГ:{" "}
              <span className="font-semibold text-white">
                {selectedScreening.cardio_ecg_rest === "normal"
                  ? "Норма (без аритмій)"
                  : "Потребує контролю"}
              </span>
            </div>
            <div className="text-slate-400">
              АТ / Пульс спокою:{" "}
              <span className="font-semibold text-white font-mono">
                {selectedScreening.cardio_bp_systolic}/{selectedScreening.cardio_bp_diastolic} мм рт.ст. · {selectedScreening.cardio_hr_rest} уд/хв
              </span>
            </div>
            <div className="text-slate-400">
              Кардіодопуск:{" "}
              <span className={selectedScreening.cardio_clearance ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {selectedScreening.cardio_clearance ? "✓ Надано" : "✗ Не надано"}
              </span>
            </div>
          </div>

          {/* Ortho */}
          <div className="space-y-1.5">
            <div className="font-bold text-slate-300 flex items-center gap-1.5">
              <span>🦵</span> Опорно-руховий апарат
            </div>
            <div className="text-slate-400">
              Тест Томаса (згиначі):{" "}
              <span className="text-slate-200">
                L: {selectedScreening.ortho_thomas_test_left === "normal" ? "норм" : "спазм"} · R: {selectedScreening.ortho_thomas_test_right === "normal" ? "норм" : "спазм"}
              </span>
            </div>
            <div className="text-slate-400">
              Ankle WBLT (гомілкостоп):{" "}
              <span className="font-mono text-white font-bold">
                L: {selectedScreening.ortho_ankle_lunge_wblt_left} см / R: {selectedScreening.ortho_ankle_lunge_wblt_right} см
              </span>{" "}
              <span className="text-[10px] text-slate-500">(норм ≥ 10)</span>
            </div>
            <div className="text-slate-400">
              Шкала Бейтона (гіпермобільність):{" "}
              <span className="font-mono text-slate-200">
                {selectedScreening.ortho_beighton_hypermobility_score}/9
              </span>
            </div>
          </div>

          {/* Lab & Validity */}
          <div className="space-y-1.5">
            <div className="font-bold text-slate-300 flex items-center gap-1.5">
              <span>🧪</span> Лабораторія та Термін
            </div>
            <div className="text-slate-400">
              Гемоглобін:{" "}
              <span className="font-mono text-white font-bold">
                {selectedScreening.lab_hemoglobin ?? "—"} г/л
              </span>
            </div>
            <div className="text-slate-400">
              Феритин (залізо) / Віт. D:{" "}
              <span className="font-mono text-white font-bold">
                {selectedScreening.lab_ferritin ?? "—"} нг/мл · {selectedScreening.lab_vitamin_d ?? "—"} нг/мл
              </span>
            </div>
            <div className="text-slate-400">
              Дійсний до:{" "}
              <span className="font-mono text-brand-blue font-bold">
                {new Date(selectedScreening.valid_until).toLocaleDateString("uk-UA")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      {isFormOpen && (
        <form onSubmit={handleSubmit} className="bg-slate-950/80 p-5 rounded-2xl border border-blue-900/40 space-y-5 text-xs">
          <div className="border-b border-blue-900/20 pb-3 font-bold text-sm text-blue-300">
            Внесення щорічного медичного скринінгу · {playerName}
          </div>

          {/* Section 1: General */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Сезон
              </label>
              <input
                type="text"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Дата огляду
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Лікар / Комісія
              </label>
              <input
                type="text"
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              />
            </div>
          </div>

          {/* Section 2: Cardio */}
          <div className="border-t border-blue-900/20 pt-3 space-y-3">
            <div className="font-bold text-slate-200">1. Кардіологічний огляд</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">ЕКГ спокою</label>
                <select
                  value={ecgRest}
                  onChange={(e) => setEcgRest(e.target.value as any)}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
                >
                  <option value="normal">Норма</option>
                  <option value="borderline">Прикордонна</option>
                  <option value="abnormal">Патологія</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">ЕхоКГ (УЗД серця)</label>
                <select
                  value={echo}
                  onChange={(e) => setEcho(e.target.value as any)}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
                >
                  <option value="normal">Норма</option>
                  <option value="abnormal">Патологія</option>
                  <option value="not_done">Не проводилось</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">АТ Систол. (мм)</label>
                <input
                  type="number"
                  value={bpSystolic}
                  onChange={(e) => setBpSystolic(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">АТ Діастол. (мм)</label>
                <input
                  type="number"
                  value={bpDiastolic}
                  onChange={(e) => setBpDiastolic(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Пульс спокою</label>
                <input
                  type="number"
                  value={hrRest}
                  onChange={(e) => setHrRest(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Ortho */}
          <div className="border-t border-blue-900/20 pt-3 space-y-3">
            <div className="font-bold text-slate-200">2. Ортопедо-біомеханічний скринінг</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">WBLT Лівий гомілкостоп (см)</label>
                <input
                  type="number"
                  step="0.5"
                  value={wbltLeft}
                  onChange={(e) => setWbltLeft(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">WBLT Правий гомілкостоп (см)</label>
                <input
                  type="number"
                  step="0.5"
                  value={wbltRight}
                  onChange={(e) => setWbltRight(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Тест Томаса (згиначі)</label>
                <select
                  value={thomasLeft}
                  onChange={(e) => {
                    setThomasLeft(e.target.value as any);
                    setThomasRight(e.target.value as any);
                  }}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
                >
                  <option value="normal">Нормальна довжина</option>
                  <option value="tight">Вкорочення / спазм</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Шкала Бейтона (0-9)</label>
                <input
                  type="number"
                  min={0}
                  max={9}
                  value={beighton}
                  onChange={(e) => setBeighton(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Lab */}
          <div className="border-t border-blue-900/20 pt-3 space-y-3">
            <div className="font-bold text-slate-200">3. Лабораторний паспорт</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Гемоглобін (г/л)</label>
                <input
                  type="number"
                  value={hemoglobin}
                  onChange={(e) => setHemoglobin(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Феритин (нг/мл)</label>
                <input
                  type="number"
                  value={ferritin}
                  onChange={(e) => setFerritin(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Вітамін D (нг/мл)</label>
                <input
                  type="number"
                  value={vitaminD}
                  onChange={(e) => setVitaminD(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Verdict */}
          <div className="border-t border-blue-900/20 pt-3 space-y-3">
            <div className="font-bold text-slate-200">4. Заключення та Допуск</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Статус допуску</label>
                <select
                  value={overallStatus}
                  onChange={(e) => setOverallStatus(e.target.value as any)}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-bold"
                >
                  <option value="cleared">🟢 Допущений до змагань (Повний допуск)</option>
                  <option value="provisional">🟡 Умовний допуск (Під наглядом)</option>
                  <option value="disqualified">🔴 Відсторонений (Не допущений)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Дійсний до</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-400 text-[10px] mb-1">Обмеження / Рекомендації</label>
              <textarea
                rows={2}
                value={restrictions}
                onChange={(e) => setRestrictions(e.target.value)}
                placeholder="Індивідуальна корекція навантаження, профілактика хамстрінгів, прийом вітаміну D..."
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-blue-900/20">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold shadow-lg shadow-blue-900/40"
            >
              {isPending ? "Збереження..." : "💾 Затвердити скринінг"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
