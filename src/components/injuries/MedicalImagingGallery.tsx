"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import {
  saveImagingStudyAction,
  type ImagingStudy,
} from "@/actions/save-imaging-study-action";

type Props = {
  injuryId: string;
  initialStudies: ImagingStudy[];
  playerName: string;
};

const MODALITY_CONFIG: Record<
  ImagingStudy["modality"],
  { label: string; icon: string; badgeClass: string }
> = {
  mri: {
    label: "МРТ (Магнітно-резонансна томографія)",
    icon: "🧲",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  ultrasound: {
    label: "УЗД (Ультразвукова діагностика)",
    icon: "📡",
    badgeClass: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  xray: {
    label: "Рентгенографія (X-Ray)",
    icon: "🦴",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  ct: {
    label: "КТ (Комп'ютерна томографія)",
    icon: "🔬",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
};

export default function MedicalImagingGallery({
  injuryId,
  initialStudies,
  playerName,
}: Props) {
  const [studies, setStudies] = useState<ImagingStudy[]>(initialStudies);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImagingStudy | null>(null);

  // Form states
  const [modality, setModality] = useState<ImagingStudy["modality"]>("mri");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [facility, setFacility] = useState<string>("Клініка Святої Катерини");
  const [radiologistConclusion, setRadiologistConclusion] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!radiologistConclusion.trim()) {
      setErrorMsg("Вкажіть заключення лікаря-рентгенолога");
      return;
    }

    startTransition(async () => {
      const res = await saveImagingStudyAction({
        injuryId,
        modality,
        date,
        facility,
        radiologistConclusion: radiologistConclusion.trim(),
        imageUrl: imageUrl.trim() || null,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.study) {
        setStudies([res.study, ...studies]);
        setRadiologistConclusion("");
        setImageUrl("");
        setIsOpen(false);
        setErrorMsg(null);
      }
    });
  };

  return (
    <div className="bg-slate-900/90 border border-blue-900/25 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-blue-900/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🩻</span>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Архів медичної візуалізації (МРТ / УЗД / Рентген)
            </h3>
            <p className="text-[11px] text-slate-400">
              Протоколи інструментальних обстежень та знімки динаміки загоєння
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-xs font-semibold transition-all"
        >
          {isOpen ? "✕ Закрити" : "+ Додати протокол"}
        </button>
      </div>

      {/* Add Form */}
      {isOpen && (
        <form onSubmit={handleSubmit} className="bg-slate-950/70 border border-blue-900/30 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold text-blue-400">
            Новий протокол візуалізації для {playerName}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Метод обстеження
              </label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value as any)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                {Object.entries(MODALITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.icon} {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Дата дослідження
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Заклад / Центр діагностики
              </label>
              <input
                type="text"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                placeholder="напр. Клініка Святої Катерини"
                className="w-full bg-slate-900 border border-blue-900/40 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              Посилання на зображення / DICOM-веб переглядач (опціонально)
            </label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://... або пряме посилання на знімок .jpg/.png"
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              Заключення рентгенолога / Опис знахідок *
            </label>
            <textarea
              rows={3}
              value={radiologistConclusion}
              onChange={(e) => setRadiologistConclusion(e.target.value)}
              placeholder="Опишіть зону пошкодження, CSA %, набряк, стан сухожилкового компоненту (T-junction)..."
              className="w-full bg-slate-900 border border-blue-900/40 rounded-lg p-2.5 text-xs text-white resize-none"
            />
          </div>

          {errorMsg && <div className="text-xs text-red-400">{errorMsg}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              {isPending ? "Збереження..." : "Зберегти в картку"}
            </button>
          </div>
        </form>
      )}

      {/* Studies List */}
      {studies.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-500">
          Знімків та висновків МРТ/УЗД ще не внесено. Натисніть «+ Додати протокол».
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {studies.map((s) => {
            const conf = MODALITY_CONFIG[s.modality] || MODALITY_CONFIG.mri;
            return (
              <div
                key={s.id}
                className="bg-slate-950/60 border border-blue-900/20 rounded-xl p-3.5 space-y-2 hover:border-blue-700/40 transition-all flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${conf.badgeClass}`}
                    >
                      <span>{conf.icon}</span>
                      <span>{s.modality.toUpperCase()}</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(s.date).toLocaleDateString("uk-UA")}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-300 font-semibold">
                    📍 {s.facility}
                  </div>

                  <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-blue-900/10">
                    {s.radiologist_conclusion}
                  </div>
                </div>

                {s.image_url && (
                  <div className="pt-2 border-t border-blue-900/15 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setSelectedImage(s)}
                      className="text-xs text-brand-blue hover:text-brand-blue-light font-semibold flex items-center gap-1"
                    >
                      🖼️ Переглянути знімок
                    </button>
                    <a
                      href={s.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-slate-500 hover:text-slate-300"
                    >
                      Відкрити в повному розмірі ↗
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-blue-900/30 rounded-2xl max-w-3xl w-full p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-blue-900/20 pb-2">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>{MODALITY_CONFIG[selectedImage.modality].icon}</span>
                <span>
                  {MODALITY_CONFIG[selectedImage.modality].label} · {selectedImage.date}
                </span>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden flex items-center justify-center">
              <img
                src={selectedImage.image_url!}
                alt="Медичний скан"
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-blue-900/20">
              <span className="font-bold text-slate-400">Висновки: </span>
              {selectedImage.radiologist_conclusion}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
