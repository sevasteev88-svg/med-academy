import crypto from "crypto";
import { calculatePlayerAge } from "./consent-constants.ts";
import type {
  PlayerTelegramToken,
  PlayerTelegramBinding,
  TelegramBindingEligibility,
  CoachWeeklyTelegramSummary,
  MorningReminderOptions,
} from "../types/telegram.ts";

export const TELEGRAM_TOKEN_EXPIRATION_SECONDS = 48 * 60 * 60; // 48 годин

/**
 * In-memory сховище токенів та прив'язок (для тестів та fallback до застосування міграції)
 */
export const memoryTelegramTokens = new Map<string, PlayerTelegramToken>();
export const memoryTelegramBindings = new Map<string, PlayerTelegramBinding>();

/**
 * Очищення in-memory сховищ для тестового середовища
 */
export function clearTelegramMemoryStoresForTesting(): void {
  memoryTelegramTokens.clear();
  memoryTelegramBindings.clear();
}

/**
 * Отримує юзернейм бота із серверних змінних оточення
 */
export function getTelegramBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME || "MedAcademyChornomoretsBot";
}

/**
 * Генерує 128-бітний криптографічно стійкий токен прив'язки (16 байт = 32 hex символи)
 */
export function generateTelegramBindingToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Розраховує SHA-256 хэш токена (у базі ніколи не зберігається відкритий токен)
 */
export function hashTokenSha256(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Формує deep-link для прив'язки до Telegram-бота:
 * t.me/<бот>?start=<токен>
 */
export function buildTelegramDeepLink(rawToken: string, botUsername?: string): string {
  const username = botUsername || getTelegramBotUsername();
  return `https://t.me/${username}?start=${rawToken.trim()}`;
}

/**
 * Перевірка права прив'язки Telegram для гравця.
 * Вимога 5: Для гравців молодше 18 років прив'язка допустима лише за наявності згоди батьків.
 */
export function checkTelegramEligibility(player: {
  id: string;
  date_of_birth?: string | null;
  hasParentConsent?: boolean;
}): TelegramBindingEligibility {
  const dob = player.date_of_birth;
  const age = dob ? calculatePlayerAge(dob) : 20; // якщо вік невідомий за замовчуванням дорослий
  const isMinor = age < 18;
  const hasParentConsent = player.hasParentConsent ?? true;

  if (isMinor && !hasParentConsent) {
    return {
      eligible: false,
      isMinor: true,
      age,
      hasParentConsent: false,
      reason:
        "Для гравців молодше 18 років прив'язка до Telegram дозволена лише за наявності офіційної згоди батьків або законних представників на обробку персональних даних.",
    };
  }

  return {
    eligible: true,
    isMinor,
    age,
    hasParentConsent,
  };
}

/**
 * Обробка команди /start <rawToken> від Telegram-бота:
 * 1. Хэшування токена SHA-256.
 * 2. Перевірка наявності та терміну дії.
 * 3. Перевірка одноразовості (used_at IS NULL).
 * 4. Фіксація використаного токена та збереження зв'язки з telegram_chat_id.
 */
export function processTokenBindingInMemory(
  rawToken: string,
  chatId: string | number,
  username?: string | null,
  options?: {
    isMinor?: boolean;
    hasParentConsent?: boolean;
    clubId?: string;
  }
): {
  success: boolean;
  error?: string;
  playerId?: string;
  binding?: PlayerTelegramBinding;
} {
  const trimmed = rawToken.trim();
  if (!trimmed) {
    return { success: false, error: "Токен прив'язки не вказано" };
  }

  const tokenHash = hashTokenSha256(trimmed);
  const tokenRecord = memoryTelegramTokens.get(tokenHash);

  if (!tokenRecord) {
    return {
      success: false,
      error: "Недійсний токен прив'язки або термін його дії закінчився.",
    };
  }

  if (tokenRecord.used_at) {
    return {
      success: false,
      error: "Цей одноразовий токен прив'язки вже був використаний раніше.",
    };
  }

  const now = new Date();
  const expiresAt = new Date(tokenRecord.expires_at);
  if (now > expiresAt) {
    return {
      success: false,
      error: "Термін дії токена прив'язки минув. Будь ласка, згенеруйте новий QR-код.",
    };
  }

  // Перевірка неповнолітніх
  if (options?.isMinor && !options?.hasParentConsent) {
    return {
      success: false,
      error: "Прив'язка заборонена: відсутня обов'язкова згода батьків для неповнолітнього гравця.",
    };
  }

  // Маркуємо токен використаним
  tokenRecord.used_at = now.toISOString();

  // Створюємо або оновлюємо прив'язку
  const chatIdStr = String(chatId);
  const bindingKey = `${tokenRecord.player_id}:${chatIdStr}`;
  const binding: PlayerTelegramBinding = {
    id: crypto.randomUUID(),
    player_id: tokenRecord.player_id,
    club_id: options?.clubId || tokenRecord.club_id,
    telegram_chat_id: chatIdStr,
    telegram_username: username || null,
    status: "active",
    created_at: now.toISOString(),
  };

  memoryTelegramBindings.set(bindingKey, binding);

  return {
    success: true,
    playerId: tokenRecord.player_id,
    binding,
  };
}

/**
 * Відписка / відкликання прив'язки за playerId в один клік (UI або сервер)
 */
export function unlinkPlayerTelegramInMemory(playerId: string): {
  success: boolean;
  unlinkedCount: number;
} {
  let count = 0;
  const nowIso = new Date().toISOString();

  for (const [key, binding] of memoryTelegramBindings.entries()) {
    if (binding.player_id === playerId && binding.status === "active") {
      binding.status = "unlinked";
      binding.unlinked_at = nowIso;
      count++;
    }
  }

  return { success: true, unlinkedCount: count };
}

/**
 * Відписка за telegram_chat_id (команди /stop або /unbind в боті)
 */
export function unlinkTelegramByChatIdInMemory(chatId: string | number): {
  success: boolean;
  unlinkedCount: number;
} {
  const chatIdStr = String(chatId);
  let count = 0;
  const nowIso = new Date().toISOString();

  for (const [key, binding] of memoryTelegramBindings.entries()) {
    if (binding.telegram_chat_id === chatIdStr && binding.status === "active") {
      binding.status = "unlinked";
      binding.unlinked_at = nowIso;
      count++;
    }
  }

  return { success: true, unlinkedCount: count };
}

/**
 * Вимога 2: Утреннее напоминание «Заповни анкету самопочуття» со ссылкой на PWA.
 * У повідомленні НЕМАЄ медичних даних, симптомів, ВАШ і прізвищ інших гравців.
 */
export function formatMorningWellnessReminder(options: MorningReminderOptions): string {
  const greeting = options.playerName ? `Привіт, ${options.playerName}!` : "Доброго ранку!";
  const clubPrefix = options.clubName ? ` [${options.clubName}]` : "";

  return (
    `⚽ ${greeting}${clubPrefix}\n\n` +
    `Будь ласка, заповни коротку ранкову анкету самопочуття на сьогодні.\n` +
    `Це займе менше 1 хвилини та допоможе тренерському штабу запланувати тренувальне навантаження.\n\n` +
    `📲 Перейти до анкети:\n${options.wellnessUrl}`
  );
}

/**
 * Вимога 3: Недельный отчёт тренеру (Telegram и PDF).
 * Процент заполнения по команде, число жёлтых и красных флажков за неделю (без имён, только счётчики), общая нагрузка.
 * Список игроков «потребують уваги» тренер смотрит в приложении.
 */
export function formatCoachWeeklyReport(summary: CoachWeeklyTelegramSummary): string {
  return (
    `📋 *Тижневий звіт готовності команди: ${summary.teamName}*\n` +
    `📅 Період: ${summary.weekStart} — ${summary.weekEnd}\n\n` +
    `📊 *Дисципліна заповнення:* ${summary.compliancePct}%\n` +
    `   (Отримано ${summary.completedSurveysCount} із ${summary.totalSurveysExpected} очікуваних анкет)\n\n` +
    `🚦 *Світлофор ризиків за тиждень (сумарно):*\n` +
    `   🟡 Жовті прапорці (потребують уваги): *${summary.yellowFlagsCount}*\n` +
    `   🔴 Червоні прапорці (високий ризик / обмеження): *${summary.redFlagsCount}*\n\n` +
    `⚡ *Загальне навантаження команди:*\n` +
    `   • Стан: *${summary.overallWorkloadDescription}*\n` +
    `   • Сер. бал свіжості/бадьорості: *${summary.averageFatigueScore.toFixed(1)}/5*\n` +
    `   • Сер. стан м'язів: *${summary.averageSorenessScore.toFixed(1)}/5*\n\n` +
    `👥 *Потребують уваги тренерського штабу сьогодні:* ${summary.requiresAttentionCount} гравців\n\n` +
    `🔒 _З метою збереження медичної таємниці персональні списки гравців та рекомендації дивіться в захищеному додатку:_\n` +
    `👉 [Відкрити кабінет тренера](${summary.appReadinessUrl})`
  );
}

/**
 * Перевірка відсутності медичних даних та прізвищ партнерів (для тестів безпеки)
 */
export function assertNoMedicalDataOrOtherPlayers(
  messageText: string,
  forbiddenNames: string[] = []
): { safe: boolean; detectedLeakedTerms: string[] } {
  const sensitiveMedicalTerms = [
    "травма",
    "розрив",
    "хрестоподіб",
    "меніск",
    "діагноз",
    "вас",
    "vas",
    "біль у",
    "запалення",
    "розтягнення",
    "пахова грижа",
    "перелом",
  ];

  const lower = messageText.toLowerCase();
  const detected: string[] = [];

  for (const term of sensitiveMedicalTerms) {
    if (lower.includes(term)) {
      detected.push(term);
    }
  }

  for (const name of forbiddenNames) {
    if (name && lower.includes(name.toLowerCase())) {
      detected.push(`Name:${name}`);
    }
  }

  return {
    safe: detected.length === 0,
    detectedLeakedTerms: detected,
  };
}
