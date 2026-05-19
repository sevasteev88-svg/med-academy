// src/app/[locale]/injuries/[id]/page.tsx
// Картка травми — повна інформація + журнал оглядів

import { createClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";

// ── Утиліти ──────────────────────────────────────────────────────────────────
function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("uk-UA", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Лейбли ────────────────────────────────────────────────────────────────────
const SEVERITY_LABELS: Record<string, { label: string; cls: string }> = {
  minimal:            { label: "Мінімальна",       cls: "text-green-400 bg-green-500/10 border-green-500/25" },
  mild:               { label: "Легка",             cls: "text-green-400 bg-green-500/10 border-green-500/25" },
  moderate:           { label: "Помірна",           cls: "text-amber-400 bg-amber-500/10 border-amber-500/25" },
  severe:             { label: "Тяжка",             cls: "text-red-400 bg-red-500/10 border-red-500/25" },
  career_threatening: { label: "Загроза кар'єрі",  cls: "text-red-400 bg-red-500/10 border-red-500/25" },
};

const STATUS_LABELS: Record<string, { label: string; cls: string; dot: string }> = {
  active:         { label: "Активна",        cls: "text-red-400 bg-red-500/10 border-red-500/25",   dot: "bg-red-500" },
  rehabilitation: { label: "Реабілітація",   cls: "text-amber-400 bg-amber-500/10 border-amber-500/25", dot: "bg-amber-500" },
  closed:         { label: "Закрита",        cls: "text-green-400 bg-green-500/10 border-green-500/25", dot: "bg-green-500" },
};

const MECHANISM_LABELS: Record<string, string> = {
  contact: "Контактна", non_contact: "Неконтактна", overuse: "Перевантаження",
};

const LOCATION_LABELS: Record<string, string> = {
  knee: "Коліно", ankle: "Щиколотка", thigh: "Стегно", calf: "Гомілка",
  groin: "Пах", hip: "Кульшовий суглоб", shoulder: "Плече",
  back: "Спина/поперек", neck: "Шия", foot: "Стопа",
  wrist: "Зап'ясток", head: "Голова", other: "Інше",
};

const SIDE_LABELS: Record<string, string> = {
  left: "Ліва/лівий", right: "Права/правий", bilateral: "Двостороння",
};

const TYPE_LABELS: Record<string, string> = {
  muscular: "М'язова", ligament: "Зв'язкова", bone: "Кісткова",
  tendon: "Сухожилкова", cartilage: "Хрящова", concussion: "Струс мозку",
  contusion: "Забій", other: "Інше",
};

// ── Компоненти ────────────────────────────────────────────────────────────────
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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-blue-900/10 last:border-0">
      <span className="text-[10px] text-slate-600">{label}</span>
      <span className="text-[11px] text-slate-300 font-medium">{value}</span>
    </div>
  );
}

// ── Парсинг нотатки огляду ────────────────────────────────────────────────────
function parseLogNote(note: string) {
  const parts = note.split(" | ");
  const vas = parts.find(p => p.startsWith("ВАШ:"))?.replace("ВАШ:", "").trim();
  const dynamics = parts.find(p => p.startsWith("Динаміка:"))?.replace("Динаміка:", "").trim();
  const mechanism = parts.find(p => p.startsWith("Механізм:"))?.replace("Механізм:", "").trim();
  const munich = parts.find(p => p.startsWith("Munich:"))?.replace("Munich:", "").trim();
  const bamic = parts.find(p => p.startsWith("BAMIC:"))?.replace("BAMIC:", "").trim();
  const mlgr = parts.find(p => p.startsWith("MLG-R:"))?.replace("MLG-R:", "").trim();
  const gonio = parts.find(p => p.startsWith("Гоніо:"))?.replace("Гоніо:", "").trim();
  const notes = parts.find(p => p.startsWith("Нотатки:"))?.replace("Нотатки:", "").trim();
  const treatment = parts.find(p => p.startsWith("Призначення:"))?.replace("Призначення:", "").trim();
  const primary = parts.find(p => p.startsWith("Первинний"));
  return { vas, dynamics, mechanism, munich, bamic, mlgr, gonio, notes, treatment, primary };
}

function vasColor(vas: string | undefined): string {
  if (!vas) return "text-slate-400";
  const n = parseInt(vas);
  return n <= 3 ? "text-green-400" : n <= 6 ? "text-amber-400" : "text-red-400";
}

function dynamicsIcon(d: string | undefined): string {
  if (!d) return "";
  if (d.includes("Покращення")) return "↗️";
  if (d.includes("Погіршення")) return "↘️";
  return "→";
}

// ── Головна сторінка ──────────────────────────────────────────────────────────
export default async function InjuryCardPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const supabase = await createClient();

  // Травма з гравцем і командою
  const { data: injury } = await supabase
    .from("injuries")
    .select(`
      *,
      players (
        id, first_name, last_name, date_of_birth, position,
        teams ( name )
      )
    `)
    .eq("id", id)
    .single();

  if (!injury) notFound();

  // Всі огляди для цієї травми
  const { data: logs } = await supabase
    .from("injury_logs")
    .select("*")
    .eq("injury_id", id)
    .order("date", { ascending: false });

  const p = injury.players as any;
  const playerName = p ? `${p.last_name} ${p.first_name}` : "—";
  const teamName = p?.teams?.name ?? "—";
  const initials = p
    ? `${p.last_name?.[0] ?? ""}${p.first_name?.[0] ?? ""}`
    : "??";

  const status = STATUS_LABELS[injury.status] ?? STATUS_LABELS.active;
  const severity = SEVERITY_LABELS[injury.severity] ?? SEVERITY_LABELS.moderate;
  const injDays = daysSince(injury.date_of_injury);
  const rtpDays = injury.expected_return_date ? daysUntil(injury.expected_return_date) : null;

  // Класифікації з description
  const desc = injury.description ?? "";
  const hasMunich = desc.includes("Munich:");
  const hasBamic  = desc.includes("BAMIC:");
  const hasMlgr   = desc.includes("MLG-R:");
  const classMatch = desc.match(/(Munich:[^\|]+|BAMIC:[^\|]+|MLG-R:[^\|]+)/g) ?? [];
  const descText = desc
    .replace(/Munich:[^\|]+\|?/g, "")
    .replace(/BAMIC:[^\|]+\|?/g, "")
    .replace(/MLG-R:[^\|]+\|?/g, "")
    .replace(/\s*\|\s*$/, "")
    .trim();

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
          <Link
            href={`/${locale}`}
            className="w-8 h-8 rounded-lg bg-blue-500/12 border border-blue-500/25 flex items-center justify-center text-blue-400 hover:bg-blue-500/20 transition-colors flex-shrink-0"
          >
            ←
          </Link>
          <div className="flex-1">
            <div className="text-[13px] font-medium text-slate-200">Картка травми</div>
            <div className="text-[10px] text-slate-600">Медичний штаб · ФК Чорноморець</div>
          </div>
          <Link
            href={`/${locale}/injuries/${id}/edit`}
            className="text-[10px] text-blue-400 border border-blue-500/25 bg-blue-500/8 px-3 py-1.5 rounded-lg hover:bg-blue-500/15 transition-colors"
          >
            ✏️ Редагувати
          </Link>
        </div>

        {/* Гравець */}
        <div className="flex items-center gap-3 py-3 border-b border-blue-900/10 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/14 text-red-400 flex items-center justify-center text-[12px] font-medium flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-medium text-slate-200">{playerName}</div>
            <div className="text-[10px] text-slate-600">{teamName} · {p?.position ?? ""}</div>
          </div>
          <Link
            href={`/${locale}/players/${p?.id}`}
            className="text-[10px] text-slate-600 hover:text-blue-400 transition-colors"
          >
            Профіль →
          </Link>
        </div>

        {/* Статус + дні */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-2.5 text-center">
            <div className={`text-[18px] font-medium ${status.cls.split(" ")[0]}`}>{injDays}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">днів травми</div>
          </div>
          <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-2.5 text-center">
            <div className={`text-[18px] font-medium ${rtpDays !== null && rtpDays > 0 ? "text-amber-400" : rtpDays !== null && rtpDays <= 0 ? "text-green-400" : "text-slate-500"}`}>
              {rtpDays !== null ? (rtpDays > 0 ? `+${rtpDays}` : "Готовий") : "—"}
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">днів до RTP</div>
          </div>
          <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg p-2.5 text-center">
            <div className="text-[18px] font-medium text-blue-400">{logs?.length ?? 0}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">оглядів</div>
          </div>
        </div>

        {/* Основна інформація */}
        <div className="mb-4">
          <SectionLabel>Основна інформація</SectionLabel>
          <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg px-3 py-1">
            <InfoRow label="Статус" value={
              <span className={`px-2 py-0.5 rounded text-[10px] border ${status.cls}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${status.dot}`} />
                {status.label}
              </span>
            } />
            <InfoRow label="Тип травми"    value={TYPE_LABELS[injury.injury_type] ?? injury.injury_type} />
            <InfoRow label="Локалізація"   value={`${LOCATION_LABELS[injury.location] ?? injury.location} · ${SIDE_LABELS[injury.side] ?? injury.side}`} />
            <InfoRow label="Механізм"      value={MECHANISM_LABELS[injury.mechanism] ?? injury.mechanism} />
            <InfoRow label="Тяжкість"      value={
              <span className={`px-2 py-0.5 rounded text-[10px] border ${severity.cls}`}>
                {severity.label}
              </span>
            } />
            <InfoRow label="Дата травми"   value={fmtDate(injury.date_of_injury)} />
            {injury.expected_return_date && (
              <InfoRow label="Очік. RTP" value={fmtDate(injury.expected_return_date)} />
            )}
            {injury.actual_return_date && (
              <InfoRow label="Факт. RTP" value={fmtDate(injury.actual_return_date)} />
            )}
          </div>
        </div>

        {/* Класифікації */}
        {(hasMunich || hasBamic || hasMlgr) && (
          <div className="mb-4">
            <SectionLabel>Класифікація пошкодження</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {classMatch.map((c, i) => {
                const isMunich = c.startsWith("Munich:");
                const isBamic  = c.startsWith("BAMIC:");
                const isMlgr   = c.startsWith("MLG-R:");
                const cls = isMunich
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/25"
                  : isBamic
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/25"
                  : "bg-violet-500/10 text-violet-400 border-violet-500/25";
                const isTjunction = c.includes("c") && isBamic;
                return (
                  <div key={i} className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium ${cls}`}>
                    {c.trim()}
                    {isTjunction && <span className="ml-1 text-[9px]">⚠️ T-junction</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Опис */}
        {descText && (
          <div className="mb-4">
            <SectionLabel>Опис / обставини</SectionLabel>
            <div className="bg-slate-900/80 border border-blue-900/18 rounded-lg px-3 py-2.5 text-[11px] text-slate-400 leading-relaxed">
              {descText}
            </div>
          </div>
        )}

        {/* Журнал оглядів */}
        <div className="mb-4">
          <SectionLabel>Журнал оглядів ({logs?.length ?? 0})</SectionLabel>

          {(!logs || logs.length === 0) && (
            <div className="text-center py-6 text-[11px] text-slate-600">
              Оглядів ще не було
            </div>
          )}

          <div className="flex flex-col gap-2">
            {(logs ?? []).map((log, i) => {
              const parsed = parseLogNote(log.note);
              const isFirst = i === (logs?.length ?? 0) - 1;
              return (
                <div
                  key={log.id}
                  className="bg-slate-900/80 border border-blue-900/15 rounded-lg overflow-hidden"
                >
                  {/* Заголовок запису */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-blue-900/10">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        parsed.dynamics?.includes("Покращення") ? "bg-green-500" :
                        parsed.dynamics?.includes("Погіршення") ? "bg-red-500" : "bg-amber-500"
                      }`} />
                      <span className="text-[11px] font-medium text-slate-300">
                        {fmtDate(log.date)}
                      </span>
                      {isFirst && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Первинний
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {parsed.dynamics && (
                        <span className="text-[10px] text-slate-500">
                          {dynamicsIcon(parsed.dynamics)} {parsed.dynamics}
                        </span>
                      )}
                      {parsed.vas && (
                        <span className={`text-[11px] font-medium ${vasColor(parsed.vas)}`}>
                          ВАШ {parsed.vas}/10
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Тіло запису */}
                  <div className="px-3 py-2 flex flex-col gap-1">
                    {parsed.primary && !parsed.vas && (
                      <p className="text-[11px] text-slate-400 leading-relaxed">{log.note}</p>
                    )}
                    {parsed.mechanism && (
                      <div className="flex gap-1.5">
                        <span className="text-[9px] text-slate-600 w-20 flex-shrink-0">Механізм:</span>
                        <span className="text-[10px] text-slate-400">{parsed.mechanism}</span>
                      </div>
                    )}
                    {parsed.gonio && (
                      <div className="flex gap-1.5">
                        <span className="text-[9px] text-slate-600 w-20 flex-shrink-0">Гоніометрія:</span>
                        <span className="text-[10px] text-slate-400">📐 {parsed.gonio}</span>
                      </div>
                    )}
                    {(parsed.munich || parsed.bamic || parsed.mlgr) && (
                      <div className="flex gap-1.5 flex-wrap mt-0.5">
                        {parsed.munich && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/8 text-blue-400 border border-blue-500/18">
                            Munich {parsed.munich}
                          </span>
                        )}
                        {parsed.bamic && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/8 text-amber-400 border border-amber-500/18">
                            BAMIC {parsed.bamic}
                          </span>
                        )}
                        {parsed.mlgr && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/8 text-violet-400 border border-violet-500/18">
                            MLG-R {parsed.mlgr}
                          </span>
                        )}
                      </div>
                    )}
                    {parsed.notes && (
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                        {parsed.notes}
                      </p>
                    )}
                    {parsed.treatment && (
                      <div className="flex gap-1.5 mt-0.5">
                        <span className="text-[9px] text-slate-600 w-20 flex-shrink-0">Призначення:</span>
                        <span className="text-[10px] text-slate-400">{parsed.treatment}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Кнопки дій */}
        <div className="flex gap-2 pt-2 border-t border-blue-900/12">
          <Link
            href={`/${locale}/exams/new/${id}`}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors text-center"
          >
            + Новий огляд
          </Link>
          <Link
            href={`/${locale}/players/${p?.id}`}
            className="flex-1 py-2.5 rounded-lg text-[12px] font-medium text-blue-400 border border-blue-500/28 bg-blue-500/8 hover:bg-blue-500/15 transition-colors text-center"
          >
            Профіль гравця
          </Link>
        </div>

      </div>
    </div>
  );
}
