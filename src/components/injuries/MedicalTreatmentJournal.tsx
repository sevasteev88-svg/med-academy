"use client";

import { useState, useTransition } from "react";
import {
  type MedicalTreatmentEntry,
  type TreatmentCategory,
  type WadaStatus,
  TREATMENT_CATEGORY_META,
  WADA_META,
} from "@/types/pharmacy";
import { saveMedicalTreatmentAction } from "@/actions/save-medical-treatment-action";

type Props = {
  injuryId?: string;
  playerId: string;
  playerName: string;
  initialTreatments: MedicalTreatmentEntry[];
};

const COMMON_PRESETS: { title: string; category: TreatmentCategory; dosage: string; wada: WadaStatus }[] = [
  { title: "PRP-терапія (Platelet-Rich Plasma)", category: "injection", dosage: "3.5 мл збагаченої плазми", wada: "allowed" },
  { title: "Ударно-хвильова терапія (Radial UWT)", category: "physiotherapy", dosage: "2.2 bar, 2000 імпульсів, 10 Гц", wada: "allowed" },
  { title: "Кінезіотейпування м'яза (ліхтарик/дренаж)", category: "taping", dosage: "Аплікація на 3 дні", wada: "allowed" },
  { title: "Німесулід (НПЗЗ)", category: "medication", dosage: "100 мг 2 р/день після їжі (3 дні)", wada: "allowed" },
  { title: "Дексаметазон (локальна блокада)", category: "injection", dosage: "4 мг / 1 мл під УЗД", wada: "prohibited_in_competition" },
  { title: "Траумель С + Цель Т", category: "injection", dosage: "Периартикулярно 2.0 мл", wada: "allowed" },
];

export default function MedicalTreatmentJournal({
  injuryId,
  playerId,
  playerName,
  initialTreatments,
}: Props) {
  const [treatments, setTreatments] = useState(initialTreatments);
  const [isOpen, setIsOpen] = useState(false);

  // Form
  const [category, setCategory] = useState<TreatmentCategory>("physiotherapy");
  const [title, setTitle] = useState("");
  const [dosage, setDosage] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [doctor, setDoctor] = useState("Лікар штабу ФК Чорноморець");
  const [wadaStatus, setWadaStatus] = useState<WadaStatus>("allowed");
  const [notes, setNotes] = useState("");

  const [isPending, startTransition] = useTransition();

  const handleApplyPreset = (p: typeof COMMON_PRESETS[0]) => {
    setTitle(p.title);
    setCategory(p.category);
    setDosage(p.dosage);
    setWadaStatus(p.wada);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    startTransition(async () => {
      const res = await saveMedicalTreatmentAction({
        injury_id: injuryId || null,
        player_id: playerId,
        date,
        category,
        title: title.trim(),
        dosage_or_params: dosage.trim() || null,
        doctor_name: doctor,
        wada_status: wadaStatus,
        notes: notes.trim() || null,
      });

      if (res.treatment) {
        setTreatments([res.treatment, ...treatments]);
        setTitle("");
        setDosage("");
        setNotes("");
        setIsOpen(false);
      }
    });
  };

  return (
    <div className="bg-slate-900/90 border border-blue-900/25 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-blue-900/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💊</span>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Журнал процедур, ін'єкцій та фармакотерапії
            </h3>
            <p className="text-[11px] text-slate-400">
              Облік маніпуляцій, фізіотерапії та антидопінговий контроль (WADA Check)
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold transition-all"
        >
          {isOpen ? "✕ Закрити" : "+ Додати процедуру/препарат"}
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="bg-slate-950/80 p-4 rounded-xl border border-blue-900/30 space-y-4 text-xs">
          {/* Quick presets */}
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">
              Швидкі медичні шаблони:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PRESETS.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 border border-blue-900/30 text-[11px] transition-colors"
                >
                  {p.title.split("(")[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Категорія втручання
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              >
                {Object.entries(TREATMENT_CATEGORY_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.icon} {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Дата процедури
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
                Лікар, що провів маніпуляцію
              </label>
              <input
                type="text"
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Назва процедури / Препарату *
              </label>
              <input
                type="text"
                placeholder="напр. PRP-терапія згиначів стегна"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Дозування / Параметри апарату
              </label>
              <input
                type="text"
                placeholder="напр. 3.0 мл плазми або 2.5 bar, 2000 ударів"
                value={dosage}
                onChange={(e) => setDosage(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
              WADA Антидопінговий статус
            </label>
            <select
              value={wadaStatus}
              onChange={(e) => setWadaStatus(e.target.value as any)}
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-bold"
            >
              {Object.entries(WADA_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
              Примітки / Реакція пацієнта
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Переносимість, рекомендації щодо спокою..."
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-blue-900/20">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold"
            >
              {isPending ? "Збереження..." : "Зафіксувати процедуру"}
            </button>
          </div>
        </form>
      )}

      {/* Treatments List */}
      {treatments.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">
          Процедур та призначень ще не зафіксовано.
        </div>
      ) : (
        <div className="space-y-2">
          {treatments.map((t) => {
            const cat = TREATMENT_CATEGORY_META[t.category] || TREATMENT_CATEGORY_META.physiotherapy;
            const wada = WADA_META[t.wada_status] || WADA_META.allowed;
            return (
              <div
                key={t.id}
                className="bg-slate-950/60 border border-blue-900/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cat.badgeClass}`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </span>
                    <span className="font-bold text-white text-sm">{t.title}</span>
                  </div>

                  <div className="text-slate-400 flex flex-wrap gap-2 text-[11px]">
                    {t.dosage_or_params && (
                      <span>
                        Параметри: <strong className="text-slate-300">{t.dosage_or_params}</strong>
                      </span>
                    )}
                    <span>· Лікар: {t.doctor_name}</span>
                    {t.notes && <span className="text-slate-400">({t.notes})</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:flex-col sm:items-end shrink-0">
                  <span className="font-mono text-slate-400 text-[11px]">{t.date}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${wada.badgeClass}`}>
                    {wada.label.split(":")[0]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
