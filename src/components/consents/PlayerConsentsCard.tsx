"use client";

import { useState, useTransition } from "react";
import QRCode from "qrcode";
import Card from "@/components/ui/Card";
import {
  ALL_CONSENT_SCOPES,
  CONSENT_SCOPE_META,
  GUARDIAN_RELATION_UA,
  type PlayerConsentSummary,
} from "@/lib/consent-constants";
import {
  saveGuardianAction,
  deleteGuardianAction,
  togglePlayerAssentAction,
  sendConsentRequestAction,
  confirmPaperConsentAction,
  revokeConsentByStaffAction,
} from "@/actions/consent-actions";
import type {
  ConsentScope,
  ConsentChannel,
  ConsentDocument,
  Guardian,
} from "@/types/database";

type Props = {
  playerId: string;
  playerName: string;
  teamName: string;
  dateOfBirth: string;
  initialSummary: PlayerConsentSummary;
  activeDocuments: Record<ConsentScope, ConsentDocument>;
};

export default function PlayerConsentsCard({
  playerId,
  playerName,
  teamName,
  dateOfBirth,
  initialSummary,
  activeDocuments,
}: Props) {
  const [summary, setSummary] = useState<PlayerConsentSummary>(initialSummary);
  const [guardians, setGuardians] = useState<Guardian[]>(
    initialSummary.guardians
  );
  const [isPending, startTransition] = useTransition();

  // Повідомлення та тестове прев'ю (п. 12)
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [testLinkPreview, setTestLinkPreview] = useState<{
    url: string;
    channel: string;
    recipient: string;
    expiresAt: string;
  } | null>(null);

  // Додавання законного представника
  const [guardianFormOpen, setGuardianFormOpen] = useState(false);
  const [gName, setGName] = useState("");
  const [gRelation, setGRelation] = useState("mother");
  const [gPhone, setGPhone] = useState("+380");
  const [gEmail, setGEmail] = useState("");
  const [gTelegram, setGTelegram] = useState("");
  const [gPrimary, setGPrimary] = useState(true);

  // Модалка Способу А «Надіслати запит на згоду»
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedGuardianId, setSelectedGuardianId] = useState<string>(
    initialSummary.guardians[0]?.id || ""
  );
  const [selectedChannel, setSelectedChannel] = useState<ConsentChannel>("sms");
  const [adultPhone, setAdultPhone] = useState("+380");
  const [adultEmail, setAdultEmail] = useState("");

  // Модалка Способу Б «Паперова форма» (завантаження скану)
  const [paperModalOpen, setPaperModalOpen] = useState(false);
  const [paperDocNumber, setPaperDocNumber] = useState(
    `DOC-${playerId.slice(0, 6).toUpperCase()}-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}`
  );
  const [paperSignerName, setPaperSignerName] = useState(
    initialSummary.guardians[0]?.full_name ||
      (!initialSummary.isMinor ? playerName : "")
  );
  const [paperSignerRelation, setPaperSignerRelation] = useState(
    initialSummary.guardians[0]?.relation ||
      (!initialSummary.isMinor ? "self" : "mother")
  );
  const [paperSignedScopes, setPaperSignedScopes] = useState<ConsentScope[]>([
    "data_processing",
  ]);
  const [paperScanName, setPaperScanName] = useState("");
  const [paperScanBase64, setPaperScanBase64] = useState<string | undefined>(
    undefined
  );
  const [paperAssent, setPaperAssent] = useState(summary.assentAcknowledged);

  const handleAddGuardian = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    startTransition(async () => {
      const res = await saveGuardianAction({
        playerId,
        fullName: gName,
        relation: gRelation,
        phone: gPhone,
        email: gEmail || null,
        telegramChatId: gTelegram || null,
        isPrimary: gPrimary,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.guardian) {
        const next = [res.guardian, ...guardians];
        setGuardians(next);
        setSelectedGuardianId(res.guardian.id);
        setPaperSignerName(res.guardian.full_name);
        setGuardianFormOpen(false);
        setGName("");
        setGPhone("+380");
        setGEmail("");
        setGTelegram("");
        setSuccessMsg("Контакт законного представника збережено.");
      }
    });
  };

  const handleDeleteGuardian = (gid: string) => {
    startTransition(async () => {
      await deleteGuardianAction({ guardianId: gid, playerId });
      setGuardians((prev) => prev.filter((g) => g.id !== gid));
    });
  };

  const handleToggleAssent = (checked: boolean) => {
    startTransition(async () => {
      const res = await togglePlayerAssentAction({
        playerId,
        acknowledged: checked,
      });
      if (!res.error) {
        setSummary((prev) => ({
          ...prev,
          assentAcknowledged: checked,
          assentAcknowledgedAt: res.at || null,
        }));
      }
    });
  };

  const handleSendConsentLink = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await sendConsentRequestAction({
        playerId,
        guardianId: summary.isMinor ? selectedGuardianId : selectedGuardianId || null,
        channel: selectedChannel,
        adultPhone: !summary.isMinor ? adultPhone : undefined,
        adultEmail: !summary.isMinor ? adultEmail : undefined,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.consentUrl) {
        setSendModalOpen(false);
        setTestLinkPreview({
          url: res.consentUrl,
          channel: res.channel || selectedChannel,
          recipient: res.recipient || "",
          expiresAt: res.expiresAt || "",
        });
        setSuccessMsg(
          `Запит на згоду сформовано та відправлено через канал «${selectedChannel.toUpperCase()}» (термін дії 7 днів).`
        );
      }
    });
  };

  // Спосіб Б: друк паперової форми з QR для звірки (п. 3)
  const handlePrintPaperForm = async () => {
    const verifyUrl = `${window.location.origin}/consents?doc=${encodeURIComponent(
      paperDocNumber
    )}&player=${encodeURIComponent(playerId)}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 120,
      margin: 1,
    });

    const printWin = window.open("", "_blank", "width=900,height=900");
    if (!printWin) return;

    const scopesHtml = ALL_CONSENT_SCOPES.map((sc) => {
      const doc = activeDocuments[sc];
      const meta = CONSENT_SCOPE_META[sc];
      return `
        <div style="border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px; margin-bottom:10px; page-break-inside:avoid;">
          <div style="display:flex; align-items:center; justify-content:space-between; font-weight:bold; font-size:13px; margin-bottom:6px;">
            <span>☐ Я ДАЮ ЗГОДУ: ${meta.label}</span>
            <span style="font-size:11px; color:#475569;">Версія v${doc.version}</span>
          </div>
          <div style="font-size:10px; color:#334155; white-space:pre-line; line-height:1.35;">${doc.body_markdown.replace(
            /### /g,
            ""
          )}</div>
        </div>
      `;
    }).join("");

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="utf-8" />
        <title>Паперова форма згоди — ${playerName}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; padding: 24px; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          .meta-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 12px; }
          .sig-box { margin-top: 20px; border-top: 2px solid #0f172a; padding-top: 14px; font-size: 12px; page-break-inside: avoid; }
          .row { display: flex; justify-content: space-between; margin-bottom: 10px; gap: 16px; }
          .line { border-bottom: 1px solid #0f172a; flex: 1; min-height: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div style="font-size:18px; font-weight:bold;">МЕДИЧНИЙ ДЕПАРТАМЕНТ АКАДЕМІЇ ФУТБОЛУ</div>
            <div style="font-size:13px; color:#334155; margin-top:4px;">ПАПЕРОВА ФОРМА ІНФОРМОВАНОЇ ЗГОДИ ЗАКОННОГО ПРЕДСТАВНИКА / ГРАВЦЯ</div>
            <div style="font-size:12px; font-family:monospace; margin-top:6px;">Номер документа: <strong>${paperDocNumber}</strong></div>
          </div>
          <div style="text-align:center;">
            <img src="${qrDataUrl}" alt="QR для звірки" width="96" height="96" />
            <div style="font-size:9px; color:#475569;">QR для звірки</div>
          </div>
        </div>

        <div class="meta-box">
          <div><strong>ПІБ гравця (спортсмена):</strong> ${playerName}</div>
          <div style="margin-top:4px;"><strong>Дата народження:</strong> ${new Date(
            dateOfBirth
          ).toLocaleDateString("uk-UA")} (${summary.age} років) · <strong>Команда:</strong> ${teamName}</div>
          <div style="margin-top:4px;"><strong>Законний представник:</strong> ${
            paperSignerName || "____________________________________________"
          }</div>
        </div>

        <div style="font-size:11px; margin-bottom:10px; color:#334155;">
          Відмітьте галочкою (☑) ті області обробки персональних та медичних даних, на які Ви надаєте добровільну згоду:
        </div>

        ${scopesHtml}

        <div class="sig-box">
          ${
            summary.isTeenAssentApplicable
              ? `<div style="margin-bottom:14px; padding:8px; border:1px dashed #64748b; border-radius:6px;">
                  ☐ <strong>Гравець ознайомлений (14–17 років):</strong> Підпис гравця _______________________ (${playerName})
                </div>`
              : ""
          }
          <div class="row">
            <span>ПІБ законного представника (або гравця 18+):</span>
            <span class="line">&nbsp;${paperSignerName}</span>
          </div>
          <div class="row">
            <span>Ступінь спорідненості:</span>
            <span class="line">&nbsp;${
              GUARDIAN_RELATION_UA[paperSignerRelation] || paperSignerRelation
            }</span>
            <span>Дата підписання:</span>
            <span class="line">&nbsp;${new Date().toLocaleDateString("uk-UA")}</span>
          </div>
          <div class="row" style="margin-top:16px;">
            <span>Особистий підпис:</span>
            <span class="line"></span>
            <span>Підпис співробітника клубу:</span>
            <span class="line"></span>
          </div>
        </div>
        <script>window.onload = () => { window.print(); };</script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  const handlePaperScanFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPaperScanName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPaperScanBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmPaperConsent = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await confirmPaperConsentAction({
        playerId,
        guardianId: selectedGuardianId || null,
        signerFullName: paperSignerName,
        signerRelation: paperSignerRelation,
        signedScopes: paperSignedScopes,
        documentNumber: paperDocNumber,
        scanFileName: paperScanName,
        scanFileBase64: paperScanBase64,
        playerAssent: paperAssent,
      });

      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setPaperModalOpen(false);
        // Оновлюємо локальний стейт
        const updatedScopes = { ...summary.scopes };
        for (const sc of paperSignedScopes) {
          updatedScopes[sc] = {
            ...updatedScopes[sc],
            status: "granted",
            allowed: true,
            blockReason: null,
            signedVersion: activeDocuments[sc].version,
            grantedAt: res.grantedAt || new Date().toISOString(),
            revokedAt: null,
            method: "paper",
            signerName: paperSignerName,
            scanPath: res.scanPath || null,
          };
        }
        setSummary((prev) => ({
          ...prev,
          assentAcknowledged: prev.assentAcknowledged || paperAssent,
          scopes: updatedScopes,
        }));
        setSuccessMsg(
          `Паперову форму (${paperDocNumber}) підтверджено, скан збережено у приватне сховище (${res.scanPath}).`
        );
      }
    });
  };

  const handleStaffRevoke = (scope: ConsentScope) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await revokeConsentByStaffAction({
        playerId,
        scope,
      });
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSummary((prev) => ({
          ...prev,
          scopes: {
            ...prev.scopes,
            [scope]: {
              ...prev.scopes[scope],
              status: "revoked",
              allowed: !prev.isMinor || scope === "data_processing",
              blockReason: prev.isMinor
                ? "Потрібна згода батьків (згоду було відкликано)"
                : null,
              revokedAt: new Date().toISOString(),
            },
          },
        }));
        setSuccessMsg(
          `Згоду по області «${CONSENT_SCOPE_META[scope].shortLabel}» відкликано. Дані позначено згідно з налаштуванням клубу (${res.retentionStatus}).`
        );
      }
    });
  };

  const statusBadge = (status: string) => {
    if (status === "granted") {
      return (
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
          ✓ Діє (є)
        </span>
      );
    }
    if (status === "revoked") {
      return (
        <span className="px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
          ✕ Відкликано
        </span>
      );
    }
    if (status === "outdated") {
      return (
        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
          ⚠️ Потрібне повторне підтвердження
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-bold">
        — Немає
      </span>
    );
  };

  return (
    <Card className="p-5 md:p-6 bg-slate-900/60 backdrop-blur-xl border border-sky-500/20 shadow-2xl space-y-5">
      {/* Шапка */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-sky-500/15">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-black text-white tracking-tight flex items-center gap-2">
              <span>✍️</span> Згоди законних представників (батьків) та гравця
            </h2>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                summary.isMinor
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              }`}
            >
              {summary.isMinor
                ? `Неповнолітній (${summary.age} р.) — потрібна згода батьків`
                : `Повнолітній (${summary.age} р. / 18+) — дає згоду сам (adult_self)`}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Отримання, зберігання та відкликання згод за областями обробки даних. Основний облік лікаря (травми, огляди) не блокується.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSendModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 transition-all flex items-center gap-1.5"
          >
            <span>📲</span>
            <span>Надіслати запит на згоду</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPaperForm}
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <span>🖨️</span>
            <span>Роздрукувати форму</span>
          </button>

          <button
            type="button"
            onClick={() => setPaperModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <span>📄</span>
            <span>Підтвердити скан паперової</span>
          </button>
        </div>
      </div>

      {/* Тестовий банер зі згенерованим одноразовим посиланням (п. 12) */}
      {testLinkPreview && (
        <div className="p-4 rounded-2xl bg-sky-950/70 border border-sky-400/40 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sky-300 flex items-center gap-1.5">
              <span>🧪</span> Тестове середовище (Заглушка відправки — без реального SMS/Email)
            </span>
            <button
              type="button"
              onClick={() => setTestLinkPreview(null)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="text-slate-300">
            Канал: <strong className="uppercase">{testLinkPreview.channel}</strong> · Отримувач:{" "}
            <strong>{testLinkPreview.recipient}</strong>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
            <input
              type="text"
              readOnly
              value={testLinkPreview.url}
              className="flex-1 bg-slate-950 border border-sky-500/30 rounded-xl px-3 py-2 font-mono text-[11px] text-sky-200"
            />
            <a
              href={testLinkPreview.url}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-center whitespace-nowrap"
            >
              Відкрити сторінку батьків →
            </a>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <span>✅ {successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <span>⚠️ {errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Для 14–17 років: відмітка «Гравець ознайомлений» (assent, п. 5) */}
      {summary.isTeenAssentApplicable && (
        <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-indigo-200 flex items-center gap-2">
              <span>🎓</span> Вікова категорія 14–17 років ({summary.age} р.): Відмітка «Гравець ознайомлений» (Assent)
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Додаткова позначка про особисте ознайомлення неповнолітнього спортсмена. Вона не замінює обов&apos;язкову згоду батьків.
            </p>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer bg-slate-900/80 px-3.5 py-2 rounded-xl border border-indigo-500/30 shrink-0">
            <input
              type="checkbox"
              checked={summary.assentAcknowledged}
              onChange={(e) => handleToggleAssent(e.target.checked)}
              disabled={isPending}
              className="w-4 h-4 rounded accent-indigo-500"
            />
            <span className="text-xs font-bold text-white">
              Гравець ознайомлений
            </span>
          </label>
        </div>
      )}

      {/* Законні представники (guardians) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Законні представники (батьки / опікуни)
          </h3>
          <button
            type="button"
            onClick={() => setGuardianFormOpen(!guardianFormOpen)}
            className="text-xs font-semibold text-sky-400 hover:text-sky-300"
          >
            {guardianFormOpen ? "Скасувати" : "+ Додати представника"}
          </button>
        </div>

        {guardians.length === 0 ? (
          <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400">
            Контакти батьків ще не додані. Додайте законного представника для відправки одноразового посилання та OTP.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {guardians.map((g) => (
              <div
                key={g.id}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>{g.full_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25">
                      {GUARDIAN_RELATION_UA[g.relation] || g.relation}
                    </span>
                    {g.is_primary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                        Основний
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    📱 {g.phone}
                    {g.email ? ` · ✉️ ${g.email}` : ""}
                    {g.telegram_chat_id ? ` · TG: ${g.telegram_chat_id}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteGuardian(g.id)}
                  className="text-slate-500 hover:text-rose-400 text-xs px-2 py-1"
                  title="Видалити контакт"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}

        {guardianFormOpen && (
          <form
            onSubmit={handleAddGuardian}
            className="p-4 rounded-xl bg-slate-950/80 border border-sky-500/25 space-y-3 text-xs"
          >
            <div className="font-bold text-sky-300">
              Новий законний представник гравця
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">ПІБ повністю *</label>
                <input
                  type="text"
                  required
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  placeholder="Коваленко Олена Іванівна"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Ступінь спорідненості *
                </label>
                <select
                  value={gRelation}
                  onChange={(e) => setGRelation(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="mother">Мати</option>
                  <option value="father">Батько</option>
                  <option value="guardian">Опікун / Піклувальник</option>
                  <option value="other">Інший законний представник</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Телефон (для OTP) *
                </label>
                <input
                  type="tel"
                  required
                  value={gPhone}
                  onChange={(e) => setGPhone(e.target.value)}
                  placeholder="+380671234567"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Email (для квитанції)
                </label>
                <input
                  type="email"
                  value={gEmail}
                  onChange={(e) => setGEmail(e.target.value)}
                  placeholder="parent@example.com"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Telegram Chat ID (необов&apos;язково)
                </label>
                <input
                  type="text"
                  value={gTelegram}
                  onChange={(e) => setGTelegram(e.target.value)}
                  placeholder="123456789"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gPrimary}
                    onChange={(e) => setGPrimary(e.target.checked)}
                    className="rounded accent-sky-500"
                  />
                  <span>Основний контакт</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold"
              >
                Зберегти представника
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Сітка 6 областей згоди гравця */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ALL_CONSENT_SCOPES.map((scope) => {
          const st = summary.scopes[scope];
          const meta = CONSENT_SCOPE_META[scope];
          return (
            <div
              key={scope}
              className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/90 flex flex-col justify-between gap-2.5 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{meta.icon}</span>
                  <div>
                    <div className="font-bold text-white">{meta.shortLabel}</div>
                    <div className="text-[10px] text-slate-400">
                      Актуальна версія: v{st.activeVersion}
                      {st.signedVersion ? ` · Підписана: v${st.signedVersion}` : ""}
                    </div>
                  </div>
                </div>
                {statusBadge(st.status)}
              </div>

              {st.signerName && (
                <div className="text-[11px] text-slate-400">
                  Підписант: <strong className="text-slate-200">{st.signerName}</strong>{" "}
                  ({st.method === "paper" ? "Паперова форма" : st.method === "adult_self" ? "Особисто 18+" : "Посилання + OTP"})
                  {st.grantedAt &&
                    ` · ${new Date(st.grantedAt).toLocaleDateString("uk-UA")}`}
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                <span className="text-[10px] text-slate-500">
                  {st.allowed
                    ? "🟢 Функція дозволена"
                    : `🔒 ${st.blockReason || "Потрібна згода батьків"}`}
                </span>
                {st.status === "granted" && (
                  <button
                    type="button"
                    onClick={() => handleStaffRevoke(scope)}
                    disabled={isPending}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold underline"
                  >
                    Відкликати
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* МОДАЛКА СПОСОБУ А: Надіслати запит на згоду */}
      {sendModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSendModalOpen(false)}
        >
          <div
            className="w-full max-w-xl p-6 rounded-3xl bg-slate-900 border border-sky-500/40 shadow-2xl space-y-4 text-xs relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSendConsentLink} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📲</span>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      {summary.isMinor
                        ? "Спосіб А «Посилання батькам»"
                        : "Спосіб А «Посилання гравцю 18+»"}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      128-бітний токен, 7 днів дії, OTP-підтвердження
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSendModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {summary.isMinor ? (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Оберіть контакт батьків *
                    </label>
                    {guardians.length === 0 ? (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] space-y-2">
                        <p>⚠️ У гравця ще немає контактів законних представників.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSendModalOpen(false);
                            setGuardianFormOpen(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold underline"
                        >
                          + Додати законного представника
                        </button>
                      </div>
                    ) : (
                      <select
                        value={selectedGuardianId}
                        onChange={(e) => setSelectedGuardianId(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 outline-none"
                      >
                        {guardians.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.full_name} ({GUARDIAN_RELATION_UA[g.relation] || g.relation}) — {g.phone}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Телефон гравця 18+ (для OTP) *
                    </label>
                    <input
                      type="tel"
                      value={adultPhone}
                      onChange={(e) => setAdultPhone(e.target.value)}
                      placeholder="+380..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-sky-500 outline-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Повнолітній гравець (18+) дає згоду особисто (adult_self).
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Канал відправки посилання *
                  </label>
                  <select
                    value={selectedChannel}
                    onChange={(e) =>
                      setSelectedChannel(e.target.value as ConsentChannel)
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 outline-none"
                  >
                    <option value="sms">SMS-повідомлення</option>
                    <option value="telegram">Telegram-бот</option>
                    <option value="email">Email (Електронна пошта)</option>
                    <option value="manual">Вручну (скопіювати посилання)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    «Вручну» створить посилання для прямого відкриття або копіювання.
                  </p>
                </div>
              </div>

              {!summary.isMinor && selectedChannel === "email" && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Email гравця
                  </label>
                  <input
                    type="email"
                    value={adultEmail}
                    onChange={(e) => setAdultEmail(e.target.value)}
                    placeholder="player@example.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSendModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isPending || (summary.isMinor && guardians.length === 0)}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {isPending ? "Відправка..." : "Згенерувати та надіслати"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛКА СПОСОБУ Б: Завантаження скану паперової форми */}
      {paperModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setPaperModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl p-6 rounded-3xl bg-slate-900 border border-emerald-500/40 shadow-2xl space-y-4 text-xs relative my-auto max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleConfirmPaperConsent} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📄</span>
                  <div>
                    <h3 className="font-bold text-emerald-300 text-sm">
                      Спосіб Б «Паперова форма»
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Завантаження скану та підтвердження отримання оригіналів
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaperModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Номер документа</label>
                  <input
                    type="text"
                    value={paperDocNumber}
                    onChange={(e) => setPaperDocNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    ПІБ підписанта (батьків / гравця 18+) *
                  </label>
                  <input
                    type="text"
                    required
                    value={paperSignerName}
                    onChange={(e) => setPaperSignerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Ступінь спорідненості
                  </label>
                  <select
                    value={paperSignerRelation}
                    onChange={(e) => setPaperSignerRelation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-emerald-500 outline-none"
                  >
                    <option value="mother">Мати</option>
                    <option value="father">Батько</option>
                    <option value="guardian">Опікун</option>
                    <option value="self">Особисто (18+)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Відмітьте області, які підписані у паперовій формі:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_CONSENT_SCOPES.map((sc) => {
                    const checked = paperSignedScopes.includes(sc);
                    return (
                      <label
                        key={sc}
                        className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPaperSignedScopes((prev) => [...prev, sc]);
                            } else {
                              setPaperSignedScopes((prev) =>
                                prev.filter((x) => x !== sc)
                              );
                            }
                          }}
                          className="rounded accent-emerald-500"
                        />
                        <span>
                          {CONSENT_SCOPE_META[sc].icon}{" "}
                          {CONSENT_SCOPE_META[sc].shortLabel} (v
                          {activeDocuments[sc].version})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Скан або фото підписаної форми (приватне сховище) *
                  </label>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    onChange={handlePaperScanFileChange}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-300 text-xs"
                  />
                </div>

                {summary.isTeenAssentApplicable && (
                  <label className="flex items-center gap-2 cursor-pointer pt-4">
                    <input
                      type="checkbox"
                      checked={paperAssent}
                      onChange={(e) => setPaperAssent(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>Підпис гравця 14–17 р. «Гравець ознайомлений» присутній</span>
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPaperModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors"
                >
                  {isPending ? "Збереження..." : "Підтвердити отримання"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
