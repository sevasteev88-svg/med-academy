"use client";

import React, { useState, useTransition, useEffect } from "react";
import Image from "next/image";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import {
  getTeamActivationSummaryAction,
  generateTeamActivationBatchAction,
  generatePlayerActivationQrAction,
  revokePlayerDevicesAction,
} from "@/actions/player-device-actions";
import {
  generateTeamCardsPdfBlob,
  generateSingleCardPdfBlob,
  downloadPdfBlob,
  createQrDataUrl,
  INSTRUCTIONS_STEPS_UA,
  CARD_TERMS_UA,
} from "@/lib/qr-pdf-generator";
import type {
  TeamPlayerActivationSummary,
  GeneratedQrCard,
} from "@/types/player-device";

export interface TeamQrCardsClientProps {
  teams: { id: string; name: string }[];
  initialTeamId: string;
  initialPlayers: TeamPlayerActivationSummary[];
  userRole: "doctor" | "coach" | "admin";
  assignedTeamId?: string | null;
}

export default function TeamQrCardsClient({
  teams,
  initialTeamId,
  initialPlayers,
  userRole,
  assignedTeamId,
}: TeamQrCardsClientProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId);
  const [players, setPlayers] = useState<TeamPlayerActivationSummary[]>(initialPlayers);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Стан модального вікна пакетного формування карток
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [forceAllInBatch, setForceAllInBatch] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Стан модального вікна для одного гравця
  const [singlePlayerModal, setSinglePlayerModal] = useState<{
    player: TeamPlayerActivationSummary;
    card?: GeneratedQrCard;
    qrDataUrl?: string;
    loading: boolean;
  } | null>(null);

  // Стан для прямого друку (Print Sheet View)
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [printCards, setPrintCards] = useState<GeneratedQrCard[]>([]);

  const isCoachRole = userRole === "coach";
  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const currentTeamName = currentTeam?.name || "Команда";

  // Підрахунок статистики
  const totalCount = players.length;
  const activeCount = players.filter((p) => p.activationStatus === "active").length;
  const pendingCount = players.filter((p) => p.activationStatus === "pending").length;
  const revokedCount = players.filter((p) => p.activationStatus === "revoked_or_expired").length;
  const notIssuedCount = players.filter((p) => p.activationStatus === "not_issued").length;

  // Оновлення списку при зміні команди
  const loadTeamData = (teamId: string) => {
    setSelectedTeamId(teamId);
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await getTeamActivationSummaryAction(teamId);
      if (res.success && res.players) {
        setPlayers(res.players);
      } else {
        setErrorMsg(res.error || "Не вдалося завантажити дані команди");
      }
    });
  };

  // 1 & 3. Пакетне формування карток та PDF на лету
  const handleBatchGenerate = async () => {
    setIsGeneratingPdf(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await generateTeamActivationBatchAction(selectedTeamId, {
        forceAll: forceAllInBatch,
      });

      if (!res.success || !res.cards) {
        setErrorMsg(res.error || "Помилка формування карток");
        setIsGeneratingPdf(false);
        setShowBatchModal(false);
        return;
      }

      // Оновлюємо статус у списку
      const summaryRes = await getTeamActivationSummaryAction(selectedTeamId);
      if (summaryRes.success && summaryRes.players) {
        setPlayers(summaryRes.players);
      }

      setShowBatchModal(false);

      if (res.cards.length === 0) {
        setSuccessMsg("Усі активні гравці команди вже мають підтверджену активацію. Нових карток не потрібно.");
        setIsGeneratingPdf(false);
        return;
      }

      // Формуємо QR DataURL для кожної картки
      for (const card of res.cards) {
        card.qrDataUrl = await createQrDataUrl(card.activationUrl);
      }

      // Зберігаємо для швидкого друку
      setPrintCards(res.cards);

      // Формуємо A4 PDF на клієнті
      const pdfBlob = await generateTeamCardsPdfBlob(res.cards, currentTeamName);
      const safeFilename = `QR_Cards_${currentTeamName.replace(/\s+/g, "_")}.pdf`;
      downloadPdfBlob(pdfBlob, safeFilename);

      setSuccessMsg(
        `Сформовано ${res.cards.length} QR-карток! PDF завантажено на ваш пристрій. Старі невикористані коди відкликано.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Не вдалося сформувати PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 4. Окремий QR на одного гравця (заміна втраченої картки)
  const handleSinglePlayerOpen = async (player: TeamPlayerActivationSummary) => {
    setSinglePlayerModal({
      player,
      loading: true,
    });

    try {
      const res = await generatePlayerActivationQrAction(player.playerId);
      if (res.success && res.card && res.token) {
        const qrUrl = await createQrDataUrl(res.card.activationUrl);
        setSinglePlayerModal({
          player,
          card: {
            ...res.card,
            qrDataUrl: qrUrl,
          },
          qrDataUrl: qrUrl,
          loading: false,
        });

        // Оновлюємо дані в таблиці
        const summaryRes = await getTeamActivationSummaryAction(selectedTeamId);
        if (summaryRes.success && summaryRes.players) {
          setPlayers(summaryRes.players);
        }
      } else {
        setErrorMsg(res.error || "Не вдалося згенерувати QR для гравця");
        setSinglePlayerModal(null);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Помилка створення картки");
      setSinglePlayerModal(null);
    }
  };

  // Завантажити 1 картку у PDF
  const handleDownloadSingleCardPdf = async () => {
    if (!singlePlayerModal?.card) return;
    try {
      const blob = await generateSingleCardPdfBlob(singlePlayerModal.card);
      const safeName = `QR_Card_${singlePlayerModal.player.lastName}_${singlePlayerModal.player.firstName}.pdf`;
      downloadPdfBlob(blob, safeName);
    } catch (err: any) {
      setErrorMsg(err?.message || "Не вдалося завантажити картку");
    }
  };

  // Відкликати пристрої та токени гравця
  const handleRevokePlayer = (playerId: string) => {
    if (!confirm("Дійсно відкликати всі активні пристрої та токени цього гравця?")) return;

    startTransition(async () => {
      const res = await revokePlayerDevicesAction(playerId);
      if (res.success) {
        setSuccessMsg("Доступ успішно відкликано.");
        const summaryRes = await getTeamActivationSummaryAction(selectedTeamId);
        if (summaryRes.success && summaryRes.players) {
          setPlayers(summaryRes.players);
        }
      } else {
        setErrorMsg(res.error || "Не вдалося відкликати доступ");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Верхня панель: вибір команди та головні кнопки */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-sky-500/15 rounded-3xl p-5 backdrop-blur-md shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>🪪</span> QR-картки команди
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Формування персональних карток для швидкої активації особистого кабінету та велнесу
          </p>
        </div>

        {/* Вибір команди для лікаря/адміна, або фіксована команда для тренера */}
        <div className="flex flex-wrap items-center gap-3">
          {isCoachRole && assignedTeamId ? (
            <div className="px-4 py-2 rounded-xl bg-slate-800/80 border border-sky-500/30 text-xs font-bold text-sky-300 flex items-center gap-2">
              <span>🛡️</span>
              <span>Моя команда: {currentTeamName}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label htmlFor="team-select" className="text-xs text-slate-400 font-semibold">
                Команда:
              </label>
              <select
                id="team-select"
                value={selectedTeamId}
                onChange={(e) => loadTeamData(e.target.value)}
                disabled={isPending}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Головна кнопка «Сформувати картки» */}
          <button
            onClick={() => setShowBatchModal(true)}
            disabled={isPending || isGeneratingPdf || players.length === 0}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <span>✨</span>
            <span>Сформувати картки (A4)</span>
          </button>
        </div>
      </div>

      {/* Оповіщення */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white font-bold text-sm">
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white font-bold text-sm">
            ✕
          </button>
        </div>
      )}

      {/* 2. Блок статистики команди */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-slate-900/60 border-slate-800 text-center">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Всього гравців</div>
          <div className="text-2xl font-black text-white mt-1">{totalCount}</div>
        </Card>

        <Card className="p-4 bg-emerald-950/20 border-emerald-500/20 text-center">
          <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Активовано</span>
          </div>
          <div className="text-2xl font-black text-emerald-300 mt-1">{activeCount}</div>
        </Card>

        <Card className="p-4 bg-amber-950/20 border-amber-500/20 text-center">
          <div className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Не активовано</span>
          </div>
          <div className="text-2xl font-black text-amber-300 mt-1">{pendingCount}</div>
        </Card>

        <Card className="p-4 bg-slate-900/60 border-slate-800 text-center">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            <span>Не сформовано</span>
          </div>
          <div className="text-2xl font-black text-slate-300 mt-1">{notIssuedCount + revokedCount}</div>
        </Card>
      </div>

      {/* 3. Таблиця гравців команди та статусів */}
      <Card className="p-5 bg-slate-900/80 border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Гравці команди · {currentTeamName}
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
              {players.length}
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Термін дії токена: <span className="text-sky-400 font-semibold">14 днів</span> · Сесія:{" "}
            <span className="text-emerald-400 font-semibold">90 днів</span>
          </div>
        </div>

        {players.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            У цій команді поки немає активних гравців.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800/80">
                  <th className="pb-3 font-semibold">Гравець</th>
                  <th className="pb-3 font-semibold">Позиція</th>
                  <th className="pb-3 font-semibold">Статус активації</th>
                  <th className="pb-3 font-semibold">Пристрій / Останній вхід</th>
                  <th className="pb-3 font-semibold">Згода батьків</th>
                  <th className="pb-3 font-semibold text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {players.map((p) => {
                  const isActivated = p.activationStatus === "active";
                  const isPending = p.activationStatus === "pending";
                  const isRevoked = p.activationStatus === "revoked_or_expired";
                  const isNotIssued = p.activationStatus === "not_issued";

                  return (
                    <tr key={p.playerId} className="hover:bg-slate-800/30 transition-colors">
                      {/* Гравець */}
                      <td className="py-3.5 pr-4">
                        <div className="font-bold text-white text-sm">
                          {p.lastName} {p.firstName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">ID: {p.playerId.slice(0, 8)}...</div>
                      </td>

                      {/* Позиція */}
                      <td className="py-3.5 pr-4">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono font-bold text-[11px]">
                          {p.position || "—"}
                        </span>
                      </td>

                      {/* Статус */}
                      <td className="py-3.5 pr-4">
                        {isActivated && (
                          <Badge variant="success" className="gap-1.5 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Активовано</span>
                          </Badge>
                        )}
                        {isPending && (
                          <Badge variant="warning" className="gap-1.5 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            <span>Не активовано</span>
                          </Badge>
                        )}
                        {isRevoked && (
                          <Badge variant="danger" className="gap-1.5 py-1">
                            <span>Відкликано</span>
                          </Badge>
                        )}
                        {isNotIssued && (
                          <Badge variant="neutral" className="gap-1.5 py-1 text-slate-400">
                            <span>Не сформовано</span>
                          </Badge>
                        )}
                      </td>

                      {/* Пристрій */}
                      <td className="py-3.5 pr-4 text-slate-300">
                        {p.activeDeviceName ? (
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span>📱</span>
                              <span>{p.activeDeviceName}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Вхід: {p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleDateString("uk-UA") : "—"}
                            </div>
                          </div>
                        ) : p.tokenExpiresAt ? (
                          <div className="text-[11px] text-amber-400">
                            Дійсний до {new Date(p.tokenExpiresAt).toLocaleDateString("uk-UA")}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Згода батьків */}
                      <td className="py-3.5 pr-4">
                        {p.requiresParentConsent ? (
                          p.hasParentConsent ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-semibold">
                              <span>✓</span> Надана
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                              <span>⚠️</span> Потрібна згода
                            </span>
                          )
                        ) : (
                          <span className="text-[11px] text-slate-500">18+ (повнолітній)</span>
                        )}
                      </td>

                      {/* Дії */}
                      <td className="py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSinglePlayerOpen(p)}
                            title="Сформувати окремий QR-код на заміну"
                            className="px-2.5 py-1 rounded-lg bg-sky-950/60 hover:bg-sky-900 border border-sky-500/30 text-sky-300 hover:text-white font-semibold text-[11px] transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span>🪪</span>
                            <span>QR-картка</span>
                          </button>

                          {isActivated && (
                            <button
                              onClick={() => handleRevokePlayer(p.playerId)}
                              title="Відкликати всі сесії пристрою"
                              className="px-2 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/20 text-rose-400 hover:text-rose-200 text-[11px] transition-all cursor-pointer"
                            >
                              Відкликати
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 4. Діалог підтвердження пакетного формування карток */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-sky-950 border border-sky-500/30 flex items-center justify-center text-2xl mx-auto">
              🪪
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-white">Сформувати QR-картки команди?</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Для кожного активного гравця без діючої активації буде згенеровано новий 128-бітний токен (термін дії:{" "}
                <strong>14 днів</strong>).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <span>⚠️</span> Зверніть увагу:
              </div>
              <p className="text-[11px] text-amber-300/90 leading-relaxed">
                Усі попередні невикористані коди активації будуть <strong>відкликані</strong>. PDF формується «на лету»
                без збереження на сервері та одразу завантажується на ваш пристрій.
              </p>
            </div>

            {/* Опція forceAll */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={forceAllInBatch}
                onChange={(e) => setForceAllInBatch(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-[11px] text-slate-300 leading-tight">
                Перегенерувати також для тих гравців, хто вже має активний пристрій (скинути їх поточний сеанс)
              </span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                disabled={isGeneratingPdf}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Скасувати
              </button>

              <button
                type="button"
                onClick={handleBatchGenerate}
                disabled={isGeneratingPdf}
                className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition-all shadow-lg shadow-sky-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isGeneratingPdf ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Генерація PDF...</span>
                  </>
                ) : (
                  <>
                    <span>📥</span>
                    <span>Сформувати PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Модальне вікно окремого гравця (заміна картки) */}
      {singlePlayerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="max-w-sm w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl text-center">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                Картка заміни · {currentTeamName}
              </span>
              <button
                onClick={() => setSinglePlayerModal(null)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div>
              <h3 className="text-lg font-black text-white">
                {singlePlayerModal.player.lastName} {singlePlayerModal.player.firstName}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Позиція: <span className="text-white font-semibold">{singlePlayerModal.player.position}</span>
              </p>
            </div>

            {singlePlayerModal.loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-sky-400">
                <span className="text-2xl animate-spin">⏳</span>
                <span>Генерація нового токена...</span>
              </div>
            ) : singlePlayerModal.qrDataUrl ? (
              <div className="space-y-4">
                {/* QR-код у рамці */}
                <div className="w-48 h-48 mx-auto bg-white p-3 rounded-2xl shadow-lg border border-slate-700 flex items-center justify-center">
                  <img
                    src={singlePlayerModal.qrDataUrl}
                    alt="QR Код активації"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 space-y-1 text-left">
                  <div className="font-bold text-sky-400">Інструкція для гравця:</div>
                  {INSTRUCTIONS_STEPS_UA.map((s, idx) => (
                    <div key={idx} className="text-slate-400">
                      {s}
                    </div>
                  ))}
                  <div className="text-[10px] text-amber-400 pt-1">🔒 {CARD_TERMS_UA}</div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadSingleCardPdf}
                    className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>📄</span>
                    <span>Завантажити PDF (1 картка)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-rose-400 text-xs">Не вдалося завантажити QR-код</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
