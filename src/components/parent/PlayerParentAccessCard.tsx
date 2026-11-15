"use client";

import { useState, useTransition } from "react";
import QRCode from "qrcode";
import Card from "@/components/ui/Card";
import {
  generateParentPortalLinkAction,
  markParentMessagesReadAction,
  revokeParentPortalTokenAction,
} from "@/actions/parent-portal-actions";
import {
  PARENT_MESSAGE_CATEGORY_META,
  type ParentMessageRecord,
  type ParentPortalTokenInfo,
} from "@/types/parent-portal";

type Props = {
  playerId: string;
  playerName: string;
  initialTokens: ParentPortalTokenInfo[];
  initialMessages: ParentMessageRecord[];
};

export default function PlayerParentAccessCard({
  playerId,
  playerName,
  initialTokens,
  initialMessages,
}: Props) {
  const [tokens, setTokens] = useState<ParentPortalTokenInfo[]>(initialTokens);
  const [messages, setMessages] = useState<ParentMessageRecord[]>(initialMessages);
  const [label, setLabel] = useState("Сімейний доступ (Батьки)");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const unreadCount = messages.filter((m) => !m.is_read_by_staff).length;

  const handleGenerate = () => {
    setErrorMsg(null);
    setCopied(false);
    startTransition(async () => {
      const res = await generateParentPortalLinkAction({
        playerId,
        label: label.trim() || "Сімейний доступ",
      });

      if (res.error || !res.url) {
        setErrorMsg(res.error || "Не вдалося створити посилання.");
        return;
      }

      const fullUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}${res.url}`
          : res.url;

      setGeneratedUrl(fullUrl);
      try {
        const qr = await QRCode.toDataURL(fullUrl, { width: 180, margin: 1 });
        setQrDataUrl(qr);
      } catch {
        setQrDataUrl(null);
      }

      setTokens((prev) => [
        {
          id: `temp_${Date.now()}`,
          label: label.trim() || "Сімейний доступ",
          is_active: true,
          first_opened_at: null,
          last_opened_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    });
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {}
  };

  const handleRevoke = (tokenId: string) => {
    startTransition(async () => {
      const res = await revokeParentPortalTokenAction(tokenId, playerId);
      if (res.success) {
        setTokens((prev) =>
          prev.map((t) => (t.id === tokenId ? { ...t, is_active: false } : t))
        );
      }
    });
  };

  const handleMarkRead = () => {
    startTransition(async () => {
      await markParentMessagesReadAction(playerId);
      setMessages((prev) => prev.map((m) => ({ ...m, is_read_by_staff: true })));
    });
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <span>👨‍👩‍👦</span>
            <span>Сімейний кабінет для батьків</span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {unreadCount} нових повідомлень
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Персональне посилання без пароля для батьків гравця {playerName}: статус
            допуску, домашнє ЛФК, пам&apos;ятка PHV/струсу, зв&apos;язок з лікарем та
            надання всіх дозволів при першому вході.
          </p>
        </div>
      </div>

      {/* Генерація нового посилання */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Напр.: Мама (Олена)"
          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer shrink-0"
        >
          {isPending ? "Створення..." : "+ Створити сімейне посилання"}
        </button>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Згенероване посилання + QR */}
      {generatedUrl && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/35 space-y-3">
          <div className="text-xs font-bold text-emerald-300">
            ✓ Сімейне посилання створено! Надішліть його батькам у месенджер або дайте
            відсканувати QR:
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR-код для батьків"
                className="w-28 h-28 rounded-lg bg-white p-1.5 shrink-0"
              />
            )}
            <div className="flex-1 min-w-0 w-full space-y-2">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200 break-all">
                {generatedUrl}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer"
              >
                {copied ? "✓ Скопійовано" : "📋 Копіювати посилання"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Список виданих доступів */}
      {tokens.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Видані доступи ({tokens.length})
          </div>
          <div className="space-y-1.5">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">{t.label}</div>
                  <div className="text-[10px] text-slate-500">
                    {t.last_opened_at
                      ? `Останній вхід: ${new Date(t.last_opened_at).toLocaleString("uk-UA")}`
                      : "Ще не відкривалось"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      t.is_active
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {t.is_active ? "Активне" : "Відкликано"}
                  </span>
                  {t.is_active && !t.id.startsWith("temp_") && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(t.id)}
                      className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                    >
                      Відкликати
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Повідомлення від батьків */}
      {messages.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Повідомлення від батьків ({messages.length})
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkRead}
                className="text-[11px] text-sky-400 hover:underline cursor-pointer"
              >
                Позначити всі прочитаними
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {messages.slice(0, 5).map((m) => {
              const meta = PARENT_MESSAGE_CATEGORY_META[m.category];
              return (
                <div
                  key={m.id}
                  className={`p-2.5 rounded-xl border text-xs ${
                    m.is_read_by_staff
                      ? "bg-slate-950/60 border-slate-800/70"
                      : "bg-amber-500/10 border-amber-500/35"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 mb-0.5">
                    <span className="font-bold text-sky-300">
                      {meta?.icon} {meta?.label || m.category}
                    </span>
                    <span>
                      {new Date(m.created_at).toLocaleString("uk-UA", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-slate-200">{m.message}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
