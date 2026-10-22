"use client";

import { useState, useTransition, useRef } from "react";
import {
  type PreSeasonScreening,
  type ClearanceStatus,
  type EcgRestResult,
  type EchoResult,
  type ThomasTestResult,
  CLEARANCE_STATUS_META,
  ECG_STATUS_META,
  calcFootballSeason,
  SCREENING_RANGES,
} from "@/types/screening";
import { saveScreeningAction } from "@/actions/save-screening-action";
import BiomechanicsGuidanceModal from "@/components/players/BiomechanicsGuidanceModal";
import type { BiomechanicsTestGuide } from "@/lib/biomechanics-guide";

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

  // Initial date & auto-season
  const todayStr = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(todayStr);
  const [season, setSeason] = useState(calcFootballSeason(todayStr));
  const [doctor, setDoctor] = useState("");

  // Cardio
  const [ecgRest, setEcgRest] = useState<EcgRestResult>("not_done");
  const [echo, setEcho] = useState<EchoResult>("not_done");
  const [cardioInterpreter, setCardioInterpreter] = useState("");
  const [bpSystolic, setBpSystolic] = useState<number | "">("");
  const [bpDiastolic, setBpDiastolic] = useState<number | "">("");
  const [hrRest, setHrRest] = useState<number | "">("");
  const [cardioClearance, setCardioClearance] = useState(false);

  // File Attachment
  const [conclusionFileName, setConclusionFileName] = useState<string>("");
  const [conclusionFileUrl, setConclusionFileUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ortho
  const [thomasLeft, setThomasLeft] = useState<ThomasTestResult>("not_done");
  const [thomasRight, setThomasRight] = useState<ThomasTestResult>("not_done");
  const [hamstringsLeft, setHamstringsLeft] = useState<number | "">("");
  const [hamstringsRight, setHamstringsRight] = useState<number | "">("");
  const [wbltLeft, setWbltLeft] = useState<number | "">("");
  const [wbltRight, setWbltRight] = useState<number | "">("");
  const [beighton, setBeighton] = useState<number | "">("");
  const [surgeries, setSurgeries] = useState("");

  // Lab
  const [hemoglobin, setHemoglobin] = useState<number | "">("");
  const [ferritin, setFerritin] = useState<number | "">("");
  const [vitaminD, setVitaminD] = useState<number | "">("");

  // Verdict
  const [overallStatus, setOverallStatus] = useState<ClearanceStatus>("cleared");
  const [restrictions, setRestrictions] = useState("");
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Довідник біомеханічних тестів (модалка / підказки)
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [guideModalTestId, setGuideModalTestId] = useState<BiomechanicsTestGuide["id"]>("wblt");

  const openGuide = (testId: BiomechanicsTestGuide["id"]) => {
    setGuideModalTestId(testId);
    setGuideModalOpen(true);
  };

  const latest = screenings[0] || null;
  const latestMeta = latest ? CLEARANCE_STATUS_META[latest.overall_status] : null;

  // Обробка зміни дати -> автоперерахунок сезону та терміну дії
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setSeason(calcFootballSeason(newDate));
    if (newDate) {
      const d = new Date(newDate);
      if (!isNaN(d.getTime())) {
        const nextYear = new Date(d);
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        setValidUntil(nextYear.toISOString().split("T")[0]);
      }
    }
  };

  // Обробка завантаження файлу висновку ЕКГ / ЕхоКГ
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("Розмір файлу не повинен перевищувати 10 МБ.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setConclusionFileUrl(reader.result as string);
      setConclusionFileName(file.name);
      setErrorMsg(null);
    };
    reader.onerror = () => {
      setErrorMsg("Не вдалося прочитати файл висновку.");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setConclusionFileUrl("");
    setConclusionFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // 1. Обов'язкові поля
    if (!date) {
      setErrorMsg("Вкажіть дату проведення скринінгу.");
      return;
    }
    if (!doctor.trim()) {
      setErrorMsg("Вкажіть П.І.Б. лікаря / медичної комісії.");
      return;
    }
    if (!restrictions.trim()) {
      setErrorMsg("Вкажіть медичний висновок та рекомендації лікаря.");
      return;
    }

    // 2. Валідація фізіологічних діапазонів
    const { bpSystolic: bpSysR, bpDiastolic: bpDiaR, hrRest: hrR, wblt, hamstrings, beighton: bR, hemoglobin: hbR, ferritin: fR, vitaminD: vR } = SCREENING_RANGES;

    if (bpSystolic !== "") {
      const v = Number(bpSystolic);
      if (v < bpSysR.min || v > bpSysR.max) {
        setErrorMsg(`Систолічний АТ повинен бути між ${bpSysR.min} та ${bpSysR.max} мм рт. ст.`);
        return;
      }
    }

    if (bpDiastolic !== "") {
      const v = Number(bpDiastolic);
      if (v < bpDiaR.min || v > bpDiaR.max) {
        setErrorMsg(`Діастолічний АТ повинен бути між ${bpDiaR.min} та ${bpDiaR.max} мм рт. ст.`);
        return;
      }
      if (bpSystolic !== "" && v >= Number(bpSystolic)) {
        setErrorMsg("Діастолічний тиск має бути нижчим за систолічний.");
        return;
      }
    }

    if (hrRest !== "") {
      const v = Number(hrRest);
      if (v < hrR.min || v > hrR.max) {
        setErrorMsg(`Пульс спокою повинен бути між ${hrR.min} та ${hrR.max} уд/хв.`);
        return;
      }
    }

    if (wbltLeft !== "") {
      const v = Number(wbltLeft);
      if (v < wblt.min || v > wblt.max) {
        setErrorMsg(`WBLT лівого гомілкостопа: ${wblt.min}–${wblt.max} см.`);
        return;
      }
    }

    if (wbltRight !== "") {
      const v = Number(wbltRight);
      if (v < wblt.min || v > wblt.max) {
        setErrorMsg(`WBLT правого гомілкостопа: ${wblt.min}–${wblt.max} см.`);
        return;
      }
    }

    if (hamstringsLeft !== "") {
      const v = Number(hamstringsLeft);
      if (v < hamstrings.min || v > hamstrings.max) {
        setErrorMsg(`Hamstrings (ліва): 0–90°.`);
        return;
      }
    }

    if (hamstringsRight !== "") {
      const v = Number(hamstringsRight);
      if (v < hamstrings.min || v > hamstrings.max) {
        setErrorMsg(`Hamstrings (права): 0–90°.`);
        return;
      }
    }

    if (beighton !== "") {
      const v = Number(beighton);
      if (v < bR.min || v > bR.max) {
        setErrorMsg(`Шкала Бейтона повинна бути від ${bR.min} до ${bR.max}.`);
        return;
      }
    }

    if (hemoglobin !== "") {
      const v = Number(hemoglobin);
      if (v < hbR.min || v > hbR.max) {
        setErrorMsg(`Гемоглобін: ${hbR.min}–${hbR.max} г/л.`);
        return;
      }
    }

    if (ferritin !== "") {
      const v = Number(ferritin);
      if (v < fR.min || v > fR.max) {
        setErrorMsg(`Феритин: ${fR.min}–${fR.max} нг/мл.`);
        return;
      }
    }

    if (vitaminD !== "") {
      const v = Number(vitaminD);
      if (v < vR.min || v > vR.max) {
        setErrorMsg(`Вітамін D: ${vR.min}–${vR.max} нг/мл.`);
        return;
      }
    }

    startTransition(async () => {
      const res = await saveScreeningAction({
        player_id: playerId,
        season,
        date,
        examiner_doctor: doctor,
        cardio_ecg_rest: ecgRest,
        cardio_echo: echo,
        cardio_interpreter_doctor: cardioInterpreter.trim() || null,
        cardio_conclusion_file_url: conclusionFileUrl || null,
        cardio_conclusion_file_name: conclusionFileName || null,
        cardio_bp_systolic: bpSystolic !== "" ? Number(bpSystolic) : null,
        cardio_bp_diastolic: bpDiastolic !== "" ? Number(bpDiastolic) : null,
        cardio_hr_rest: hrRest !== "" ? Number(hrRest) : null,
        cardio_clearance: cardioClearance,
        ortho_thomas_test_left: thomasLeft,
        ortho_thomas_test_right: thomasRight,
        ortho_hamstrings_90_90_left: hamstringsLeft !== "" ? Number(hamstringsLeft) : null,
        ortho_hamstrings_90_90_right: hamstringsRight !== "" ? Number(hamstringsRight) : null,
        ortho_ankle_lunge_wblt_left: wbltLeft !== "" ? Number(wbltLeft) : null,
        ortho_ankle_lunge_wblt_right: wbltRight !== "" ? Number(wbltRight) : null,
        ortho_beighton_hypermobility_score: beighton !== "" ? Number(beighton) : null,
        ortho_previous_surgeries: surgeries.trim() || null,
        lab_hemoglobin: hemoglobin !== "" ? Number(hemoglobin) : null,
        lab_ferritin: ferritin !== "" ? Number(ferritin) : null,
        lab_vitamin_d: vitaminD !== "" ? Number(vitaminD) : null,
        overall_status: overallStatus,
        restrictions_notes: restrictions.trim(),
        valid_until: validUntil,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.screening) {
        setScreenings([res.screening, ...screenings]);
        setSelectedScreening(res.screening);
        setIsFormOpen(false);
      }
    });
  };

  return (
    <div className="bg-slate-900/90 border border-blue-900/25 rounded-2xl p-5 space-y-4">
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span className="font-medium">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-400 hover:text-white text-sm px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-900/20 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-xl shrink-0">
            🏥
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              <span>Передсезонний медичний скринінг (PPE)</span>
              {latest?.season && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/25">
                  {latest.season}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">
              Кардіодопуск, біомеханіка суглобів та лабораторний паспорт
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-900/40"
          >
            {isFormOpen ? "✕ Закрити форму" : "+ Внести скринінг"}
          </button>
        </div>
      </div>

      {/* History selector if multiple screenings */}
      {screenings.length > 1 && !isFormOpen && (
        <div className="flex items-center gap-2 text-xs pt-1">
          <span className="text-slate-400 text-[11px]">Історія оглядів:</span>
          <div className="flex gap-1.5 flex-wrap">
            {screenings.map((sc, idx) => (
              <button
                key={sc.id}
                onClick={() => setSelectedScreening(sc)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all ${
                  selectedScreening?.id === sc.id
                    ? "bg-blue-600 text-white font-bold"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {sc.season} ({new Date(sc.date).toLocaleDateString("uk-UA")})
                {idx === 0 && " • Останній"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary View of Selected Screening */}
      {selectedScreening && !isFormOpen && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950/60 p-4 rounded-xl border border-blue-900/20 text-xs">
            {/* Cardio */}
            <div className="space-y-2">
              <div className="font-bold text-slate-300 flex items-center gap-1.5">
                <span>❤️</span> Кардіологічний профіль
              </div>
              <div className="text-slate-400">
                ЕКГ спокою:{" "}
                <span
                  className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                    ECG_STATUS_META[selectedScreening.cardio_ecg_rest]?.badgeClass || "text-white"
                  }`}
                >
                  {ECG_STATUS_META[selectedScreening.cardio_ecg_rest]?.label || "Не обстежено"}
                </span>
              </div>
              <div className="text-slate-400">
                ЕхоКГ:{" "}
                <span className="font-semibold text-slate-200">
                  {selectedScreening.cardio_echo === "normal"
                    ? "Норма"
                    : selectedScreening.cardio_echo === "abnormal"
                    ? "Патологія"
                    : "Не обстежено"}
                </span>
              </div>
              {selectedScreening.cardio_interpreter_doctor && (
                <div className="text-slate-400 text-[11px]">
                  Інтерпретував:{" "}
                  <span className="text-slate-200 font-medium">
                    {selectedScreening.cardio_interpreter_doctor}
                  </span>
                </div>
              )}
              <div className="text-slate-400">
                АТ / Пульс:{" "}
                <span className="font-semibold text-white font-mono">
                  {selectedScreening.cardio_bp_systolic != null && selectedScreening.cardio_bp_diastolic != null
                    ? `${selectedScreening.cardio_bp_systolic}/${selectedScreening.cardio_bp_diastolic} мм рт.ст.`
                    : "—"}
                  {selectedScreening.cardio_hr_rest != null ? ` · ${selectedScreening.cardio_hr_rest} уд/хв` : ""}
                </span>
              </div>
              <div className="text-slate-400">
                Кардіодопуск:{" "}
                <span
                  className={
                    selectedScreening.cardio_clearance
                      ? "text-emerald-400 font-bold"
                      : "text-amber-400 font-bold"
                  }
                >
                  {selectedScreening.cardio_clearance ? "✓ Надано" : "✗ Не надано"}
                </span>
              </div>

              {/* Attached file badge */}
              {selectedScreening.cardio_conclusion_file_url && (
                <div className="pt-1">
                  <a
                    href={selectedScreening.cardio_conclusion_file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 text-blue-300 text-[11px] font-medium transition-colors"
                  >
                    <span>📎</span>
                    <span className="truncate max-w-[180px]">
                      {selectedScreening.cardio_conclusion_file_name || "Висновки ЕКГ/ЕхоКГ"}
                    </span>
                    <span>↗</span>
                  </a>
                </div>
              )}
            </div>

            {/* Ortho */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-bold text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span>🦵</span> Опорно-руховий апарат
                </div>
                <button
                  type="button"
                  onClick={() => openGuide("wblt")}
                  className="text-[10px] text-sky-400 hover:text-sky-300 hover:underline font-normal flex items-center gap-1"
                  title="Відкрити довідник з біомеханічних тестів"
                >
                  <span>📖</span> Довідник тестів
                </button>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>
                  Тест Томаса (згиначі):{" "}
                  <span className="text-slate-200">
                    L: {selectedScreening.ortho_thomas_test_left === "normal" ? "норм" : selectedScreening.ortho_thomas_test_left === "tight" ? "спазм" : "не обст."} · R: {selectedScreening.ortho_thomas_test_right === "normal" ? "норм" : selectedScreening.ortho_thomas_test_right === "tight" ? "спазм" : "не обст."}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openGuide("thomas")}
                  className="text-slate-500 hover:text-sky-300 text-[10px] px-1 transition-colors"
                  title="Методика тесту Томаса"
                >
                  ℹ️
                </button>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>
                  Ankle WBLT (гомілкостоп):{" "}
                  <span className="font-mono text-white font-bold">
                    {selectedScreening.ortho_ankle_lunge_wblt_left != null ? `${selectedScreening.ortho_ankle_lunge_wblt_left} см` : "—"} / {selectedScreening.ortho_ankle_lunge_wblt_right != null ? `${selectedScreening.ortho_ankle_lunge_wblt_right} см` : "—"}
                  </span>{" "}
                  <span className="text-[10px] text-slate-500">(норм ≥ 10)</span>
                </span>
                <button
                  type="button"
                  onClick={() => openGuide("wblt")}
                  className="text-slate-500 hover:text-sky-300 text-[10px] px-1 transition-colors"
                  title="Методика WBLT"
                >
                  ℹ️
                </button>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>
                  Hamstrings 90-90 (дефіцит):{" "}
                  <span className="font-mono text-white font-bold">
                    {selectedScreening.ortho_hamstrings_90_90_left != null ? `${selectedScreening.ortho_hamstrings_90_90_left}°` : "—"} / {selectedScreening.ortho_hamstrings_90_90_right != null ? `${selectedScreening.ortho_hamstrings_90_90_right}°` : "—"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openGuide("hamstrings")}
                  className="text-slate-500 hover:text-sky-300 text-[10px] px-1 transition-colors"
                  title="Методика Hamstrings 90-90"
                >
                  ℹ️
                </button>
              </div>
              <div className="text-slate-400 flex items-center justify-between">
                <span>
                  Шкала Бейтона:{" "}
                  <span className="font-mono text-slate-200">
                    {selectedScreening.ortho_beighton_hypermobility_score != null
                      ? `${selectedScreening.ortho_beighton_hypermobility_score}/9`
                      : "—"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => openGuide("beighton")}
                  className="text-slate-500 hover:text-sky-300 text-[10px] px-1 transition-colors"
                  title="Шкала Бейтона (критерії)"
                >
                  ℹ️
                </button>
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
                  {selectedScreening.lab_hemoglobin != null ? `${selectedScreening.lab_hemoglobin} г/л` : "—"}
                </span>
              </div>
              <div className="text-slate-400">
                Феритин / Віт. D:{" "}
                <span className="font-mono text-white font-bold">
                  {selectedScreening.lab_ferritin != null ? `${selectedScreening.lab_ferritin} нг/мл` : "—"} · {selectedScreening.lab_vitamin_d != null ? `${selectedScreening.lab_vitamin_d} нг/мл` : "—"}
                </span>
              </div>
              <div className="text-slate-400">
                Лікар огляду:{" "}
                <span className="text-slate-200 font-medium">
                  {selectedScreening.examiner_doctor || "—"}
                </span>
              </div>
              <div className="text-slate-400">
                Дійсний до:{" "}
                <span className="font-mono text-sky-400 font-bold">
                  {new Date(selectedScreening.valid_until).toLocaleDateString("uk-UA")}
                </span>
              </div>
            </div>
          </div>

          {/* Conclusion notes */}
          {selectedScreening.restrictions_notes && (
            <div className="bg-slate-950/40 p-3 rounded-xl border border-blue-900/20 text-xs">
              <span className="text-slate-400 font-semibold">Висновок та рекомендації лікаря: </span>
              <span className="text-slate-200">{selectedScreening.restrictions_notes}</span>
            </div>
          )}
        </div>
      )}

      {/* Form for new screening */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="bg-slate-950/90 p-5 rounded-2xl border border-blue-900/40 space-y-5 text-xs shadow-2xl"
        >
          <div className="border-b border-blue-900/20 pb-3 flex items-center justify-between">
            <span className="font-bold text-sm text-blue-300">
              Внесення медичного скринінгу · {playerName}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              Сезон: <strong className="text-white">{season}</strong> (автоматично від дати)
            </span>
          </div>

          {/* Section 1: General Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Дата огляду <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                Сезон (старт 1 липня)
              </label>
              <input
                type="text"
                readOnly
                value={season}
                className="w-full bg-slate-900/50 border border-blue-900/30 rounded-lg p-2 text-sky-400 font-mono font-bold cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-slate-400 uppercase text-[10px] font-bold mb-1">
                П.І.Б. лікаря / комісії <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="наприклад, д-р Коваленко О.В."
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
              />
            </div>
          </div>

          {/* Section 2: Cardio */}
          <div className="border-t border-blue-900/20 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-200 flex items-center gap-1.5">
                <span>❤️</span> 1. Кардіологічний огляд (Критерії Seattle / International Criteria)
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={cardioClearance}
                  onChange={(e) => setCardioClearance(e.target.checked)}
                  className="rounded border-slate-700 text-blue-600 focus:ring-0"
                />
                <span className="text-[11px] font-medium">Кардіодопуск надано</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">ЕКГ спокою</label>
                <select
                  value={ecgRest}
                  onChange={(e) => setEcgRest(e.target.value as EcgRestResult)}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
                >
                  <option value="not_done">Не обстежено</option>
                  <option value="normal">Норма (без аритмій)</option>
                  <option value="borderline">Прикордонна</option>
                  <option value="abnormal">Патологія</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] mb-1">ЕхоКГ (УЗД серця)</label>
                <select
                  value={echo}
                  onChange={(e) => setEcho(e.target.value as EchoResult)}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
                >
                  <option value="not_done">Не обстежено</option>
                  <option value="normal">Норма</option>
                  <option value="abnormal">Патологія</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  АТ Систол. <span className="text-slate-500 font-mono">(60-240)</span>
                </label>
                <input
                  type="number"
                  placeholder="мм рт.ст."
                  min={60}
                  max={240}
                  value={bpSystolic}
                  onChange={(e) => setBpSystolic(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  АТ Діастол. <span className="text-slate-500 font-mono">(40-140)</span>
                </label>
                <input
                  type="number"
                  placeholder="мм рт.ст."
                  min={40}
                  max={140}
                  value={bpDiastolic}
                  onChange={(e) => setBpDiastolic(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  Пульс спокою <span className="text-slate-500 font-mono">(35-200)</span>
                </label>
                <input
                  type="number"
                  placeholder="уд/хв"
                  min={35}
                  max={200}
                  value={hrRest}
                  onChange={(e) => setHrRest(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>

            {/* Кардіолог-інтерпретатор та прикріплення файлу */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  Хто інтерпретував ЕКГ / ЕхоКГ (П.І.Б. кардіолога / фахівця)
                </label>
                <input
                  type="text"
                  placeholder="наприклад, проф. Мельник І.П. (ОДЛ)"
                  value={cardioInterpreter}
                  onChange={(e) => setCardioInterpreter(e.target.value)}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  Прикріплення файлу висновку (PDF або скан / фото ЕКГ)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-blue-900/40 text-blue-300 text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <span>📎</span>
                    <span>{conclusionFileName ? "Змінити файл" : "Обрати файл..."}</span>
                  </button>

                  {conclusionFileName && (
                    <div className="flex items-center gap-2 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-700/50 text-[11px] text-slate-300 flex-1 min-w-0">
                      <span className="truncate">{conclusionFileName}</span>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="text-rose-400 hover:text-white px-1"
                        title="Видалити прикріплений файл"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Ortho */}
          <div className="border-t border-blue-900/20 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-slate-200">2. Ортопедо-біомеханічний скринінг</div>
              <button
                type="button"
                onClick={() => openGuide("wblt")}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 hover:underline transition-colors"
                title="Відкрити клінічне керівництво з біомеханічних тестів"
              >
                <span>📖</span> Методика тестів (FIFA / Aspetar)
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                  <span>WBLT Лівий гомілкостоп (см)</span>
                  <button
                    type="button"
                    onClick={() => openGuide("wblt")}
                    className="text-slate-400 hover:text-sky-300 transition-colors"
                    title="Методика та критерії WBLT"
                  >
                    ℹ️
                  </button>
                </div>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={35}
                  placeholder="напр. 11"
                  value={wbltLeft}
                  onChange={(e) => setWbltLeft(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                  <span>WBLT Правий гомілкостоп (см)</span>
                  <button
                    type="button"
                    onClick={() => openGuide("wblt")}
                    className="text-slate-400 hover:text-sky-300 transition-colors"
                    title="Методика та критерії WBLT"
                  >
                    ℹ️
                  </button>
                </div>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={35}
                  placeholder="напр. 11"
                  value={wbltRight}
                  onChange={(e) => setWbltRight(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                  <span>Тест Томаса (згиначі L / R)</span>
                  <button
                    type="button"
                    onClick={() => openGuide("thomas")}
                    className="text-slate-400 hover:text-sky-300 transition-colors"
                    title="Методика тесту Томаса"
                  >
                    ℹ️
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={thomasLeft}
                    onChange={(e) => setThomasLeft(e.target.value as ThomasTestResult)}
                    className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-1.5 text-white text-[11px]"
                  >
                    <option value="not_done">L: Не обст.</option>
                    <option value="normal">L: Норма</option>
                    <option value="tight">L: Спазм</option>
                  </select>
                  <select
                    value={thomasRight}
                    onChange={(e) => setThomasRight(e.target.value as ThomasTestResult)}
                    className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-1.5 text-white text-[11px]"
                  >
                    <option value="not_done">R: Не обст.</option>
                    <option value="normal">R: Норма</option>
                    <option value="tight">R: Спазм</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                  <span>Шкала Бейтона (0-9)</span>
                  <button
                    type="button"
                    onClick={() => openGuide("beighton")}
                    className="text-slate-400 hover:text-sky-300 transition-colors"
                    title="Шкала Бейтона (5 тестів)"
                  >
                    ℹ️
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  max={9}
                  placeholder="0–9 балів"
                  value={beighton}
                  onChange={(e) => setBeighton(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                  <span>Hamstrings 90-90 дефіцит L (°)</span>
                  <button
                    type="button"
                    onClick={() => openGuide("hamstrings")}
                    className="text-slate-400 hover:text-sky-300 transition-colors"
                    title="Методика тесту Hamstrings 90-90"
                  >
                    ℹ️
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  max={90}
                  placeholder="градуси"
                  value={hamstringsLeft}
                  onChange={(e) => setHamstringsLeft(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                  <span>Hamstrings 90-90 дефіцит R (°)</span>
                  <button
                    type="button"
                    onClick={() => openGuide("hamstrings")}
                    className="text-slate-400 hover:text-sky-300 transition-colors"
                    title="Методика тесту Hamstrings 90-90"
                  >
                    ℹ️
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  max={90}
                  placeholder="градуси"
                  value={hamstringsRight}
                  onChange={(e) => setHamstringsRight(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  Попередні операції / травми
                </label>
                <input
                  type="text"
                  placeholder="напр. шов меніска 2024"
                  value={surgeries}
                  onChange={(e) => setSurgeries(e.target.value)}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Lab */}
          <div className="border-t border-blue-900/20 pt-3 space-y-3">
            <div className="font-bold text-slate-200">3. Лабораторний паспорт</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  Гемоглобін <span className="text-slate-500 font-mono">(50-220 г/л)</span>
                </label>
                <input
                  type="number"
                  min={50}
                  max={220}
                  placeholder="г/л"
                  value={hemoglobin}
                  onChange={(e) => setHemoglobin(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  Феритин <span className="text-slate-500 font-mono">(1-1500 нг/мл)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={1500}
                  placeholder="нг/мл"
                  value={ferritin}
                  onChange={(e) => setFerritin(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] mb-1">
                  Вітамін D <span className="text-slate-500 font-mono">(1-250 нг/мл)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={250}
                  placeholder="нг/мл"
                  value={vitaminD}
                  onChange={(e) => setVitaminD(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Verdict & Clearance */}
          <div className="border-t border-blue-900/20 pt-3 space-y-3">
            <div className="font-bold text-slate-200">
              4. Заключення та Допуск <span className="text-rose-400">*</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Статус допуску</label>
                <select
                  value={overallStatus}
                  onChange={(e) => setOverallStatus(e.target.value as ClearanceStatus)}
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
                  className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2 text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-[10px] mb-1">
                Медичний висновок та рекомендації лікаря <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={2}
                required
                value={restrictions}
                onChange={(e) => setRestrictions(e.target.value)}
                placeholder="Вкажіть підсумок огляду: відсутність кардіологічних протипоказань, рекомендації щодо прехабу, дозування вітамінів..."
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

      {/* Модальне клінічне керівництво з біомеханічних тестів (FIFA / Aspetar) */}
      <BiomechanicsGuidanceModal
        isOpen={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        initialTestId={guideModalTestId}
      />
    </div>
  );
}
