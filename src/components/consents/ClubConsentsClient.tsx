"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import {
  ALL_CONSENT_SCOPES,
  CONSENT_SCOPE_META,
  type ConsentCellStatus,
  type PlayerConsentSummary,
} from "@/lib/consents";
import {
  sendBulkConsentRequestsAction,
  publishNewConsentDocumentVersionAction,
  updateClubPrivacySettingsAction,
} from "@/actions/consent-actions";
import type {
  ConsentScope,
  ConsentChannel,
  ConsentDocument,
  ClubSettings,
} from "@/types/database";

export type ClubPlayerConsentRow = {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string;
  teamName: string;
  dateOfBirth: string;
  summary: PlayerConsentSummary;
};

type Props = {
  players: ClubPlayerConsentRow[];
  teams: Array<{ id: string; name: string }>;
  activeDocuments: Record<ConsentScope, ConsentDocument>;
  clubSettings: ClubSettings;
  isAdminOrDoctor: boolean;
};

export default function ClubConsentsClient({
  players,
  teams,
  activeDocuments,
  clubSettings,
  isAdminOrDoctor,
}: Props) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "granted" | "missing" | "revoked" | "outdated"
  >("all");
  const [ageFilter, setAgeFilter] = useState<"all" | "minor" | "adult">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Вибір гравців для масової відправки запитів
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [bulkChannel, setBulkChannel] = useState<ConsentChannel>("sms");
  const [bulkResult, setBulkResult] = useState<{
    sentCount: number;
    failedCount: number;
    results: Array<{
      playerId: string;
      playerName: string;
      consentUrl?: string;
      error?: string;
    }>;
  } | null>(null);

  // Редактор нової версії документа згоди (п. 8)
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docScope, setDocScope] = useState<ConsentScope>("data_processing");
  const [docVersion, setDocVersion] = useState("1.1");
  const [docTitle, setDocTitle] = useState(
    activeDocuments.data_processing.title
  );
  const [docBody, setDocBody] = useState(
    activeDocuments.data_processing.body_markdown
  );

  // Налаштування клубу (політика при відкликанні + провайдер відправки)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [revocationPolicy, setRevocationPolicy] = useState<
    "delete" | "anonymize"
  >(clubSettings.consent_revocation_policy || "anonymize");
  const [messagingMode, setMessagingMode] = useState<"stub" | "live">(
    clubSettings.messaging?.mode || "stub"
  );
  const [smsProvider, setSmsProvider] = useState<"turbosms" | "twilio" | "stub">(
    clubSettings.messaging?.sms_provider || "stub"
  );
  const [emailProvider, setEmailProvider] = useState<
    "resend" | "smtp" | "stub"
  >(clubSettings.messaging?.email_provider || "stub");
  const [privacyEmail, setPrivacyEmail] = useState(
    clubSettings.privacy_contact_email || "privacy@club-academy.ua"
  );

  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Обчислення відсотка покриття по командах (п. 9)
  const teamCoverage = useMemo(() => {
    return teams.map((t) => {
      const teamPlayers = players.filter((p) => p.teamId === t.id);
      const totalCells = teamPlayers.length * ALL_CONSENT_SCOPES.length;
      let grantedCells = 0;
      let baseGrantedPlayers = 0;

      for (const p of teamPlayers) {
        if (p.summary.scopes.data_processing.status === "granted") {
          baseGrantedPlayers++;
        }
        for (const sc of ALL_CONSENT_SCOPES) {
          if (p.summary.scopes[sc].status === "granted") {
            grantedCells++;
          }
        }
      }

      const fullCoveragePct =
        totalCells > 0 ? Math.round((grantedCells / totalCells) * 100) : 0;
      const baseCoveragePct =
        teamPlayers.length > 0
          ? Math.round((baseGrantedPlayers / teamPlayers.length) * 100)
          : 0;

      return {
        teamId: t.id,
        teamName: t.name,
        playerCount: teamPlayers.length,
        fullCoveragePct,
        baseCoveragePct,
      };
    });
  }, [players, teams]);

  // Фільтрація гравців
  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      if (selectedTeamId !== "all" && p.teamId !== selectedTeamId) return false;
      if (ageFilter === "minor" && !p.summary.isMinor) return false;
      if (ageFilter === "adult" && p.summary.isMinor) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fullName = `${p.lastName} ${p.firstName}`.toLowerCase();
        if (!fullName.includes(q)) return false;
      }

      if (statusFilter !== "all") {
        const statuses = ALL_CONSENT_SCOPES.map(
          (s) => p.summary.scopes[s].status
        );
        if (!statuses.includes(statusFilter)) return false;
      }

      return true;
    });
  }, [players, selectedTeamId, ageFilter, searchQuery, statusFilter]);

  const toggleSelectAllFiltered = () => {
    if (selectedPlayerIds.length === filteredPlayers.length) {
      setSelectedPlayerIds([]);
    } else {
      setSelectedPlayerIds(filteredPlayers.map((p) => p.id));
    }
  };

  const handleBulkSend = () => {
    if (selectedPlayerIds.length === 0) return;
    setErrorMessage(null);
    setInfoMessage(null);

    startTransition(async () => {
      const res = await sendBulkConsentRequestsAction({
        playerIds: selectedPlayerIds,
        channel: bulkChannel,
      });

      if ("error" in res && res.error) {
        setErrorMessage(res.error);
      } else if ("results" in res && res.results) {
        setBulkResult({
          sentCount: res.sentCount || 0,
          failedCount: res.failedCount || 0,
          results: res.results,
        });
        setInfoMessage(
          `Масову розсилку завершено: успішно відправлено ${res.sentCount}, помилок (відсутній контакт батьків) — ${res.failedCount}.`
        );
      }
    });
  };

  const handleScopeChangeInDocEditor = (sc: ConsentScope) => {
    setDocScope(sc);
    const cur = activeDocuments[sc];
    const parts = cur.version.split(".");
    const nextMinor = Number(parts[1] || 0) + 1;
    setDocVersion(`${parts[0]}.${nextMinor}`);
    setDocTitle(cur.title);
    setDocBody(cur.body_markdown);
  };

  const handlePublishNewVersion = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    startTransition(async () => {
      const res = await publishNewConsentDocumentVersionAction({
        scope: docScope,
        newVersion: docVersion,
        title: docTitle,
        bodyMarkdown: docBody,
      });

      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setDocModalOpen(false);
        setInfoMessage(
          `Опубліковано нову версію v${docVersion} для області «${CONSENT_SCOPE_META[docScope].shortLabel}». Попередні згоди по цій області переведено у статус «Потрібне повторне підтвердження» (застаріла).`
        );
      }
    });
  };

  const handleSaveClubSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    startTransition(async () => {
      const res = await updateClubPrivacySettingsAction({
        revocationPolicy,
        messagingMode,
        smsProvider,
        emailProvider,
        privacyContactEmail: privacyEmail,
      });

      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSettingsOpen(false);
        setInfoMessage(
          "Налаштування політики відкликання та адаптера відправки збережено."
        );
      }
    });
  };

  const renderCellBadge = (st: ConsentCellStatus, signedVersion: string | null) => {
    if (st === "granted") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
          <span>є</span>
          {signedVersion && <span className="font-mono opacity-80">v{signedVersion}</span>}
        </span>
      );
    }
    if (st === "revoked") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
          відкликано
        </span>
      );
    }
    if (st === "outdated") {
      return (
        <span
          title="Потрібне повторне підтвердження"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold"
        >
          застаріла ({signedVersion ? `v${signedVersion}` : "стара"})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-slate-400 text-[10px]">
        немає
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-sky-500/15">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span>✍️</span> Згоди батьків та гравців клубу
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Матриця покриття «Гравці × Області згоди», версіонування документів, масова розсилка одноразових посилань та налаштування адаптера.
          </p>
        </div>

        {isAdminOrDoctor && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDocModalOpen(!docModalOpen)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30 text-xs font-bold transition-all"
            >
              📄 Нова версія документа
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
            >
              ⚙️ Налаштування відправки та відкликання
            </button>
            <Link
              href="/privacy"
              className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-semibold transition-all"
            >
              🔒 Сторінка /privacy
            </Link>
          </div>
        )}
      </div>

      {infoMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between">
          <span>✅ {infoMessage}</span>
          <button
            type="button"
            onClick={() => setInfoMessage(null)}
            className="text-emerald-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Покриття по командах (п. 9) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {teamCoverage.map((tc) => (
          <Card
            key={tc.teamId}
            className="p-4 bg-slate-900/60 border border-sky-500/15 space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-white">{tc.teamName}</span>
              <span className="font-mono text-slate-400">
                {tc.playerCount} гравців
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[10px] uppercase text-slate-400">
                  Базова згода
                </div>
                <div className="text-2xl font-black font-mono text-emerald-400">
                  {tc.baseCoveragePct}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase text-slate-400">
                  Усі 6 областей
                </div>
                <div className="text-lg font-bold font-mono text-sky-400">
                  {tc.fullCoveragePct}%
                </div>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full"
                style={{ width: `${tc.baseCoveragePct}%` }}
              />
            </div>
          </Card>
        ))}
      </div>

      {/* Модалка публікації нової версії документа (п. 8) */}
      {docModalOpen && (
        <Card className="p-5 bg-slate-950/95 border border-indigo-500/40 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h2 className="text-sm font-bold text-indigo-300">
                📄 Створення нової версії документа згоди
              </h2>
              <p className="text-[11px] text-slate-400">
                Текст існуючої версії не змінюється. Зміна тексту створює нову версію, після чого у гравців з&apos;являється статус «Потрібне повторне підтвердження» (застаріла).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDocModalOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handlePublishNewVersion} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Область (Scope)</label>
                <select
                  value={docScope}
                  onChange={(e) =>
                    handleScopeChangeInDocEditor(e.target.value as ConsentScope)
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  {ALL_CONSENT_SCOPES.map((sc) => (
                    <option key={sc} value={sc}>
                      {CONSENT_SCOPE_META[sc].shortLabel} (поточна v
                      {activeDocuments[sc].version})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Номер нової версії</label>
                <input
                  type="text"
                  required
                  value={docVersion}
                  onChange={(e) => setDocVersion(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Назва документа</label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Текст нової версії (Markdown, українською мовою, позначений «шаблон, потребує перевірки юристом»)
              </label>
              <textarea
                rows={7}
                required
                value={docBody}
                onChange={(e) => setDocBody(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-slate-200 font-mono text-[11px]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDocModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
              >
                Опублікувати нову версію v{docVersion}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Модалка налаштувань клубу (п. 2, п. 7, п. 12) */}
      {settingsOpen && (
        <Card className="p-5 bg-slate-950/95 border border-sky-500/40 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h2 className="text-sm font-bold text-sky-300">
                ⚙️ Налаштування клубу: Політика відкликання та адаптер повідомлень
              </h2>
              <p className="text-[11px] text-slate-400">
                Конфігурація зберігається в clubs.settings без хардкоду провайдера.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSaveClubSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  Дія з даними при відкликанні згоди (п. 7)
                </label>
                <select
                  value={revocationPolicy}
                  onChange={(e) =>
                    setRevocationPolicy(e.target.value as "delete" | "anonymize")
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  <option value="anonymize">
                    Знеособлення даних (marked_for_anonymization)
                  </option>
                  <option value="delete">
                    Позначення для видалення (marked_for_deletion)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Режим адаптера відправки (п. 12)
                </label>
                <select
                  value={messagingMode}
                  onChange={(e) =>
                    setMessagingMode(e.target.value as "stub" | "live")
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  <option value="stub">
                    🧪 Заглушка відправки (Тестове середовище — запис у лог)
                  </option>
                  <option value="live">🚀 Бойова відправка через провайдера клубу</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  SMS-провайдер клубу
                </label>
                <select
                  value={smsProvider}
                  onChange={(e) => setSmsProvider(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  <option value="stub">Тестова заглушка (Stub)</option>
                  <option value="turbosms">TurboSMS (Україна)</option>
                  <option value="twilio">Twilio SMS</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Email-провайдер клубу
                </label>
                <select
                  value={emailProvider}
                  onChange={(e) => setEmailProvider(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  <option value="stub">Тестова заглушка (Stub)</option>
                  <option value="resend">Resend API</option>
                  <option value="smtp">Клубний SMTP</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Контактний Email з питань конфіденційності
                </label>
                <input
                  type="email"
                  value={privacyEmail}
                  onChange={(e) => setPrivacyEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold"
              >
                Зберегти налаштування клубу
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Панель фільтрів та масової відправки запитів */}
      <Card className="p-4 bg-slate-900/60 border border-sky-500/15 space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-slate-400 mb-1">Команда</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            >
              <option value="all">Усі команди ({players.length})</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Статус згоди</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            >
              <option value="all">Усі статуси</option>
              <option value="granted">✓ Є діюча згода</option>
              <option value="missing">— Немає згоди</option>
              <option value="revoked">✕ Відкликано</option>
              <option value="outdated">⚠️ Застаріла версія (потрібне повторне підтвердження)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Вікова група</label>
            <select
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            >
              <option value="all">Усі гравці</option>
              <option value="minor">Неповнолітні (&lt; 18 років)</option>
              <option value="adult">Повнолітні (18+ років)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Пошук за прізвищем</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Прізвище або ім'я..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
            />
          </div>
        </div>

        {/* Масова відправка запитів (п. 9) */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
            >
              {selectedPlayerIds.length === filteredPlayers.length &&
              filteredPlayers.length > 0
                ? "Зняти виділення"
                : `Виділити всіх у фільтрі (${filteredPlayers.length})`}
            </button>
            <span className="text-slate-400">
              Обрано: <strong className="text-white">{selectedPlayerIds.length}</strong>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkChannel}
              onChange={(e) => setBulkChannel(e.target.value as ConsentChannel)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-white"
            >
              <option value="sms">Канал: SMS</option>
              <option value="telegram">Канал: Telegram</option>
              <option value="email">Канал: Email</option>
            </select>
            <button
              type="button"
              disabled={isPending || selectedPlayerIds.length === 0}
              onClick={handleBulkSend}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold disabled:opacity-50"
            >
              {isPending
                ? "Масова відправка..."
                : `📲 Масова відправка запитів (${selectedPlayerIds.length})`}
            </button>
          </div>
        </div>

        {/* Результати масової відправки з посиланнями для тестування */}
        {bulkResult && (
          <div className="p-3.5 rounded-xl bg-sky-950/50 border border-sky-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sky-300">
                🧪 Результати масової відправки (Тестовий лог посилань):
              </span>
              <button
                type="button"
                onClick={() => setBulkResult(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {bulkResult.results.map((r) => (
                <div
                  key={r.playerId}
                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800"
                >
                  <span className="font-semibold text-white">{r.playerName}</span>
                  {r.consentUrl ? (
                    <a
                      href={r.consentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-400 hover:underline font-mono text-[11px]"
                    >
                      {r.consentUrl} →
                    </a>
                  ) : (
                    <span className="text-rose-400">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Таблиця: Гравці × Області (є / немає / відкликано / застаріла) */}
      <Card className="p-0 overflow-hidden bg-slate-900/60 border border-sky-500/15">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] text-slate-400 uppercase">
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      filteredPlayers.length > 0 &&
                      selectedPlayerIds.length === filteredPlayers.length
                    }
                    onChange={toggleSelectAllFiltered}
                    className="rounded accent-sky-500"
                  />
                </th>
                <th className="p-3">Гравець</th>
                <th className="p-3">Команда / Вік</th>
                <th className="p-3">Батьки / Assent</th>
                {ALL_CONSENT_SCOPES.map((sc) => (
                  <th key={sc} className="p-3 text-center whitespace-nowrap">
                    <div>
                      {CONSENT_SCOPE_META[sc].icon}{" "}
                      {CONSENT_SCOPE_META[sc].shortLabel}
                    </div>
                    <div className="text-[9px] font-mono text-sky-400">
                      v{activeDocuments[sc].version}
                    </div>
                  </th>
                ))}
                <th className="p-3 text-right">Дія</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredPlayers.map((p) => {
                const checked = selectedPlayerIds.includes(p.id);
                const primaryGuardian = p.summary.guardians[0];

                return (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPlayerIds((prev) => [...prev, p.id]);
                          } else {
                            setSelectedPlayerIds((prev) =>
                              prev.filter((id) => id !== p.id)
                            );
                          }
                        }}
                        className="rounded accent-sky-500"
                      />
                    </td>
                    <td className="p-3 font-bold text-white whitespace-nowrap">
                      <Link
                        href={`/players/${p.id}`}
                        className="hover:text-sky-300 transition-colors"
                      >
                        {p.lastName} {p.firstName}
                      </Link>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="text-slate-300">{p.teamName}</span>
                      <span className="mx-1.5 text-slate-600">·</span>
                      <span
                        className={`font-mono font-bold ${
                          p.summary.isMinor ? "text-amber-300" : "text-emerald-300"
                        }`}
                      >
                        {p.summary.age} р.
                      </span>
                    </td>
                    <td className="p-3">
                      {primaryGuardian ? (
                        <div className="text-[11px] text-slate-300">
                          <div>{primaryGuardian.full_name}</div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {primaryGuardian.phone}
                          </div>
                        </div>
                      ) : p.summary.isMinor ? (
                        <span className="text-[10px] text-rose-400">
                          Немає контакту батьків
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-400">
                          Повнолітній (18+)
                        </span>
                      )}
                      {p.summary.isTeenAssentApplicable && (
                        <div className="mt-1">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                              p.summary.assentAcknowledged
                                ? "bg-indigo-500/20 text-indigo-300"
                                : "bg-slate-800 text-slate-500"
                            }`}
                          >
                            {p.summary.assentAcknowledged
                              ? "✓ Ознайомлений (14–17)"
                              : "Не ознайомлений (14–17)"}
                          </span>
                        </div>
                      )}
                    </td>
                    {ALL_CONSENT_SCOPES.map((sc) => {
                      const st = p.summary.scopes[sc];
                      return (
                        <td key={sc} className="p-3 text-center">
                          {renderCellBadge(st.status, st.signedVersion)}
                        </td>
                      );
                    })}
                    <td className="p-3 text-right whitespace-nowrap">
                      <Link
                        href={`/players/${p.id}`}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-semibold text-[11px]"
                      >
                        Картка →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
