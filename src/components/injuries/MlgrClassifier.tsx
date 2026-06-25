"use client";
// src/components/injuries/MlgrClassifier.tsx
// 6-кроковий класифікатор м'язових травм MLG-R + BAMIC + Munich
// Стиль клубу. Живий RTP-прогноз. Предзаповнення для докласифікації.

import { useState } from "react";
import {
  MLGR_MECHANISMS, MLGR_LOCATIONS, MLGR_GRADES, MLGR_MUSCLES,
  MUSCLE_GROUP_LABELS, BAMIC_GRADES, BAMIC_LOCATIONS, MUNICH_TYPES,
  predictRTP, buildMlgrCode, buildBamicCode, buildMunichCode,
  RTP_RISK_LABELS, type ClassificationInput, type MuscleGroup,
} from "@/lib/mlgr-classifier";
import type {
  MlgrMuscle, MlgrMechanism, MlgrLocation, MlgrGrade,
  BamicLocation, MunichType,
} from "@/types/database";

// Результат, який повертається назовні при збереженні
export type ClassificationResult = {
  input: ClassificationInput;
  mlgrCode: string | null;
  bamicCode: string | null;
  munichCode: string | null;
  rtp: ReturnType<typeof predictRTP>;
};

// ─── Дрібні UI-компоненти ─────────────────────────────────────
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
          done ? "bg-green-500 text-white"
          : active ? "bg-blue-500 text-white"
          : "bg-slate-800 text-slate-600"
        }`}
      >
        {done ? "✓" : n}
      </div>
    </div>
  );
}

function OptionBtn({
  selected, label, desc, onClick, warning, accent,
}: {
  selected: boolean;
  label: string;
  desc?: string;
  onClick: () => void;
  warning?: string;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg border transition-all mb-1.5 ${
        selected
          ? "border-blue-500/50 bg-blue-500/10"
          : "border-blue-900/20 bg-slate-900/60 hover:border-blue-500/30"
      }`}
      style={selected && accent ? { borderColor: `${accent}80`, background: `${accent}18` } : {}}
    >
      <div
        className={`text-[12px] font-medium ${selected ? "text-slate-100" : "text-slate-400"}`}
        style={selected && accent ? { color: accent } : {}}
      >
        {selected ? "● " : "○ "}{label}
        {warning && <span className="text-[9px] text-red-400 ml-1.5">⚠️ {warning}</span>}
      </div>
      {desc && <div className="text-[10px] text-slate-600 mt-0.5">{desc}</div>}
    </button>
  );
}

function NavButtons({
  onBack, onNext, nextLabel = "Далі", backLabel = "Назад",
  nextDisabled = false, showBack = true,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}) {
  return (
    <div className="flex gap-2 mt-3">
      {showBack && (
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-2 rounded-lg text-[11px] font-medium text-slate-400 border border-blue-900/25 bg-slate-900/60 hover:border-blue-500/30 transition-colors"
        >
          ← {backLabel}
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="flex-1 py-2 rounded-lg text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}

// ─── Головний компонент ───────────────────────────────────────
export default function MlgrClassifier({
  initial,
  onSave,
  onCancel,
  saving = false,
}: {
  initial?: Partial<ClassificationInput>;
  onSave: (result: ClassificationResult) => void;
  onCancel?: () => void;
  saving?: boolean;
}) {
  const [step, setStep] = useState(1);

  // Стан класифікації (з предзаповненням)
  const [muscle, setMuscle] = useState<MlgrMuscle | "">(initial?.muscle ?? "");
  const [mechanism, setMechanism] = useState<MlgrMechanism | "">(initial?.mechanism ?? "");
  const [location, setLocation] = useState<MlgrLocation | "">(initial?.location ?? "");
  const [grade, setGrade] = useState<MlgrGrade | null>(initial?.grade ?? null);
  const [hasR, setHasR] = useState<boolean>(initial?.hasR ?? false);
  const [csaPct, setCsaPct] = useState<string>(initial?.csaPct != null ? String(initial.csaPct) : "");
  const [reinjury, setReinjury] = useState<number>(initial?.reinjury ?? 0);
  const [bamicGrade, setBamicGrade] = useState<string>(initial?.bamicGrade ?? "");
  const [bamicLoc, setBamicLoc] = useState<BamicLocation | "">(initial?.bamicLocation ?? "");
  const [munichType, setMunichType] = useState<MunichType | "">(initial?.munichType ?? "");

  // Поточний інпут для розрахунків
  const input: ClassificationInput = {
    muscle, mechanism, location, grade, hasR,
    csaPct: csaPct ? Number(csaPct) : null,
    reinjury, bamicGrade, bamicLocation: bamicLoc, munichType,
  };

  const mlgrCode = buildMlgrCode(input);
  const bamicCode = buildBamicCode(input);
  const munichCode = buildMunichCode(input);
  const rtp = predictRTP(input);

  // Групування м'язів
  const groups: Record<string, typeof MLGR_MUSCLES> = {};
  MLGR_MUSCLES.forEach((m) => {
    if (!groups[m.group]) groups[m.group] = [];
    groups[m.group].push(m);
  });

  function handleSave() {
    onSave({ input, mlgrCode, bamicCode, munichCode, rtp });
  }

  return (
    <div className="bg-slate-900/85 border border-blue-900/25 rounded-xl p-4">
      {/* Заголовок */}
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">
        🔬 Класифікатор м'язових травм · MLG-R + BAMIC + Munich
      </div>

      {/* Індикатор кроків */}
      <div className="flex items-center justify-between gap-1 mb-4 px-1">
        {[
          { n: 1, done: !!muscle },
          { n: 2, done: !!mechanism },
          { n: 3, done: !!location },
          { n: 4, done: grade != null },
          { n: 5, done: step > 5 },
          { n: 6, done: !!bamicGrade || !!munichType },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center flex-1 last:flex-none">
            <StepDot n={s.n} active={step === s.n} done={s.done} />
            {i < 5 && <div className={`flex-1 h-px mx-1 ${s.done ? "bg-green-500/40" : "bg-slate-800"}`} />}
          </div>
        ))}
      </div>

      {/* ═══ КРОК 1: М'яз ═══ */}
      {step === 1 && (
        <div>
          <div className="text-[12px] font-medium text-slate-300 mb-2">Оберіть м'яз</div>
          <div className="max-h-[280px] overflow-y-auto pr-1">
            {(Object.keys(groups) as MuscleGroup[]).map((g) => (
              <div key={g} className="mb-3">
                <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-1.5">
                  {MUSCLE_GROUP_LABELS[g]}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {groups[g].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => { setMuscle(m.key); setStep(2); }}
                      className={`text-left px-2.5 py-1.5 rounded-lg border text-[11px] transition-all ${
                        muscle === m.key
                          ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                          : "border-blue-900/20 bg-slate-900/60 text-slate-400 hover:border-blue-500/30"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="mt-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Скасувати
            </button>
          )}
        </div>
      )}

      {/* ═══ КРОК 2: Механізм ═══ */}
      {step === 2 && (
        <div>
          <div className="text-[12px] font-medium text-slate-300 mb-2">Механізм пошкодження (M)</div>
          {MLGR_MECHANISMS.map((m) => (
            <OptionBtn
              key={m.key}
              selected={mechanism === m.key}
              label={m.label}
              desc={m.desc}
              accent={m.color}
              onClick={() => { setMechanism(m.key); setStep(3); }}
            />
          ))}
          <NavButtons onBack={() => setStep(1)} showBack />
        </div>
      )}

      {/* ═══ КРОК 3: Локалізація ═══ */}
      {step === 3 && (
        <div>
          <div className="text-[12px] font-medium text-slate-300 mb-2">Локалізація (L)</div>
          {MLGR_LOCATIONS.map((l) => (
            <OptionBtn
              key={l.key}
              selected={location === l.key}
              label={l.label}
              warning={l.risk === "high" ? "висока зона ризику" : undefined}
              onClick={() => { setLocation(l.key); setStep(4); }}
            />
          ))}
          <NavButtons onBack={() => setStep(2)} showBack />
        </div>
      )}

      {/* ═══ КРОК 4: Грейд ═══ */}
      {step === 4 && (
        <div>
          <div className="text-[12px] font-medium text-slate-300 mb-2">Грейд (G)</div>
          {MLGR_GRADES.map((g) => (
            <OptionBtn
              key={g.key}
              selected={grade === g.key}
              label={`${g.label} · ${g.days} дн.`}
              desc={`${g.desc} — ${g.mri}`}
              accent={g.color}
              onClick={() => setGrade(g.key)}
            />
          ))}

          {/* Інтратендинальне (r) */}
          <label className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg border border-blue-900/20 bg-slate-900/60 cursor-pointer">
            <input
              type="checkbox"
              checked={hasR}
              onChange={(e) => setHasR(e.target.checked)}
              className="accent-red-500"
            />
            <span className="text-[11px] text-slate-300">
              Інтратендинальне вовлечення (r) <span className="text-red-400">⚠️ гірший прогноз</span>
            </span>
          </label>

          {/* CSA % для grade 3 */}
          {grade === 3 && (
            <div className="mt-2">
              <div className="text-[10px] text-slate-500 mb-1">% площі поперечного перерізу (CSA)</div>
              <input
                type="number"
                value={csaPct}
                onChange={(e) => setCsaPct(e.target.value)}
                placeholder="напр. 30"
                className="w-full bg-slate-900/80 border border-blue-900/22 rounded-lg px-3 py-2 text-[12px] text-slate-300 outline-none"
              />
            </div>
          )}

          <NavButtons
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
            nextDisabled={grade == null}
            showBack
          />
        </div>
      )}

      {/* ═══ КРОК 5: Рецидив ═══ */}
      {step === 5 && (
        <div>
          <div className="text-[12px] font-medium text-slate-300 mb-2">Рецидив (R)</div>
          <div className="text-[10px] text-slate-600 mb-2">
            Скільки разів ця травма вже траплялась раніше
          </div>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReinjury(r)}
                className={`flex-1 py-2.5 rounded-lg border text-[13px] font-medium transition-all ${
                  reinjury === r
                    ? "border-blue-500/50 bg-blue-500/15 text-blue-300"
                    : "border-blue-900/20 bg-slate-900/60 text-slate-500 hover:border-blue-500/30"
                }`}
              >
                R{r}{r === 3 ? "+" : ""}
              </button>
            ))}
          </div>
          {reinjury >= 1 && (
            <div className="text-[10px] text-amber-400 mt-2">
              ⚠️ Рецидив подовжує прогноз відновлення
            </div>
          )}
          <NavButtons onBack={() => setStep(4)} onNext={() => setStep(6)} showBack />
        </div>
      )}

      {/* ═══ КРОК 6: BAMIC + Munich ═══ */}
      {step === 6 && (
        <div>
          <div className="text-[12px] font-medium text-slate-300 mb-2">BAMIC + Munich (опціонально)</div>

          {/* BAMIC грейд */}
          <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-1.5">BAMIC ступінь</div>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {BAMIC_GRADES.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBamicGrade(bamicGrade === b.key ? "" : b.key)}
                className={`py-1.5 rounded-lg border text-[11px] transition-all ${
                  bamicGrade === b.key
                    ? "border-amber-500/50 bg-amber-500/12 text-amber-300"
                    : "border-blue-900/20 bg-slate-900/60 text-slate-500 hover:border-amber-500/30"
                }`}
                title={b.desc}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* BAMIC локалізація */}
          <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-1.5">BAMIC локалізація</div>
          <div className="mb-3">
            {BAMIC_LOCATIONS.map((l) => (
              <OptionBtn
                key={l.key}
                selected={bamicLoc === l.key}
                label={l.label}
                desc={l.desc}
                warning={l.key === "c" ? "T-junction" : undefined}
                onClick={() => setBamicLoc(bamicLoc === l.key ? "" : l.key)}
              />
            ))}
          </div>

          {/* Munich */}
          <div className="text-[9px] uppercase tracking-wider text-slate-600 mb-1.5">Munich тип</div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {MUNICH_TYPES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMunichType(munichType === m.key ? "" : m.key)}
                className={`text-left px-2.5 py-1.5 rounded-lg border text-[10px] transition-all ${
                  munichType === m.key
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                    : "border-blue-900/20 bg-slate-900/60 text-slate-500 hover:border-blue-500/30"
                }`}
                title={m.desc}
              >
                {m.label}
              </button>
            ))}
          </div>

          <NavButtons onBack={() => setStep(5)} showBack />
        </div>
      )}

      {/* ═══ Живий результат (показується з кроку 4) ═══ */}
      {grade != null && (
        <div className="mt-4 pt-3 border-t border-blue-900/20">
          {/* Коди */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {mlgrCode && (
              <span className="text-[10px] px-2 py-1 rounded bg-violet-500/10 text-violet-400 border border-violet-500/22 font-medium">
                MLG-R: {mlgrCode}
              </span>
            )}
            {bamicCode && (
              <span className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/22 font-medium">
                BAMIC: {bamicCode}
              </span>
            )}
            {munichCode && (
              <span className="text-[10px] px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/22 font-medium">
                Munich: {munichCode}
              </span>
            )}
          </div>

          {/* RTP прогноз */}
          {rtp && (
            <div className="bg-slate-950/60 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-slate-600">Прогноз RTP</div>
                <div className="text-[18px] font-medium text-slate-200">
                  {rtp.minDays}–{rtp.maxDays} <span className="text-[12px] text-slate-500">днів</span>
                </div>
              </div>
              <div
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
                style={{
                  background: `${rtp.risk === "high" ? "#EF4444" : rtp.risk === "moderate" ? "#F59E0B" : "#22C55E"}18`,
                  color: rtp.risk === "high" ? "#EF4444" : rtp.risk === "moderate" ? "#F59E0B" : "#22C55E",
                }}
              >
                {RTP_RISK_LABELS[rtp.risk]}
              </div>
            </div>
          )}

          {/* Зберегти */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-3 py-2.5 rounded-lg text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Збереження..." : "💾 Зберегти класифікацію"}
          </button>
        </div>
      )}
    </div>
  );
}
