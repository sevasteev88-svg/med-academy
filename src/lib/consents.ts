import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_CLUB_ID } from "@/lib/auth";
import type {
  ConsentScope,
  ConsentDocument,
  Consent,
  Guardian,
} from "@/types/database";

export const ALL_CONSENT_SCOPES: ConsentScope[] = [
  "data_processing",
  "ai_processing",
  "wearables",
  "supplements",
  "gps",
  "photo",
];

export const CONSENT_SCOPE_META: Record<
  ConsentScope,
  {
    label: string;
    shortLabel: string;
    icon: string;
    description: string;
    isOptional: boolean;
  }
> = {
  data_processing: {
    label: "Базова обробка персональних та медичних даних",
    shortLabel: "Базові дані",
    icon: "📋",
    description:
      "Ведення електронної медичної картки, облік травм, клінічних оглядів та медичного допуску до тренувань і матчів.",
    isOptional: false,
  },
  ai_processing: {
    label: "Аналіз даних за допомогою ШІ-консультанта",
    shortLabel: "ШІ-аналіз",
    icon: "🧠",
    description:
      "Використання моделей штучного інтелекту для формування допоміжних рекомендацій з реабілітації, прехабу та оцінки ризику рецидивів.",
    isOptional: true,
  },
  wearables: {
    label: "Збір біометрії з носимих пристроїв (Wearables)",
    shortLabel: "Носимі (Wearables)",
    icon: "⌚",
    description:
      "Синхронізація показників варіабельності серцевого ритму (HRV), пульсу спокою та сну (WHOOP, Apple Watch, Garmin).",
    isOptional: true,
  },
  supplements: {
    label: "Протокол спортивних добавок та нутриціології",
    shortLabel: "Добавки",
    icon: "🥤",
    description:
      "Призначення та облік дозволених WADA вітамінів і спортивних суплементів (колаген, протеїн, креатин, омега-3).",
    isOptional: true,
  },
  gps: {
    label: "GPS-трекінг та моніторинг навантажень",
    shortLabel: "GPS / Навантаження",
    icon: "📡",
    description:
      "Збір даних GPS-трекерів під час тренувань та ігор (дистанція, швидкісні спринти, ACWR).",
    isOptional: true,
  },
  photo: {
    label: "Фотографія профілю у медичній системі",
    shortLabel: "Фото",
    icon: "📷",
    description:
      "Зберігання та відображення портретної фотографії гравця у внутрішній медичній картці клубу.",
    isOptional: true,
  },
};

export const GUARDIAN_RELATION_UA: Record<string, string> = {
  mother: "Мати",
  father: "Батько",
  guardian: "Опікун / Піклувальник",
  other: "Інший законний представник",
};

/**
 * Базові шаблони документів українською мовою (використовуються як резерв,
 * якщо таблиця consent_documents ще не застосована в БД, та для сторінки /privacy).
 * Кожен шаблон позначений «шаблон, потребує перевірки юристом».
 */
export const DEFAULT_CONSENT_TEMPLATES: Record<
  ConsentScope,
  Omit<ConsentDocument, "id" | "club_id">
> = {
  data_processing: {
    scope: "data_processing",
    version: "1.0",
    title: "Згода на базову обробку персональних та медичних даних спортсмена",
    effective_from: "2026-01-01T00:00:00Z",
    is_active: true,
    body_markdown: `⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**

### 1. Хто обробляє дані (Володілець даних)
Футбольний клуб / Академія (далі — Клуб) та уповноважений медичний штаб Клубу.

### 2. Які дані обробляються
Прізвище, ім'я, по батькові, дата народження, антропометричні показники, дані клінічних оглядів, інформація про спортивні травми та реабілітацію.

### 3. Мета обробки (Навіщо)
Забезпечення медичного супроводу спортсмена, допуск до тренувань та змагань, профілактика травматизму та безпечне повернення до гри (Return-to-Play).

### 4. Строк зберігання
Протягом усього періоду перебування спортсмена в Клубі та протягом строку, визначеного законодавством України для первинної медичної документації після завершення виступів.

### 5. Права суб'єкта даних та законного представника
Право на доступ до даних, виправлення неточностей, обмеження обробки, отримання копії даних та відкликання згоди.

### 6. Як відкликати згоду
Через персональне посилання «Мої згоди» з підтвердженням одноразовим кодом (OTP) або шляхом подання письмової заяви до медичного департаменту Клубу.

### 7. Контакти
Медичний департамент та відповідальна особа з питань захисту даних Клубу (privacy@club-academy.ua).`,
  },
  ai_processing: {
    scope: "ai_processing",
    version: "1.0",
    title: "Згода на використання систем штучного інтелекту (ШІ) для аналізу спортивно-медичних показників",
    effective_from: "2026-01-01T00:00:00Z",
    is_active: true,
    body_markdown: `⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**

### 1. Хто обробляє дані
Медичний штаб Клубу із залученням захищених хмарних сервісів аналітики штучного інтелекту (Google Gemini API / Anthropic Claude API).

### 2. Які дані обробляються
Знеособлені або структуровані показники віку, фази росту (PHV), біометрії, локалізації травм та навантажень.

### 3. Мета обробки (Навіщо)
Формування допоміжних рекомендацій для спортивного лікаря щодо індивідуального прехабу, оцінки ризиків рецидиву та планування відновлення. Остаточне рішення завжди приймає лікар.

### 4. Строк зберігання
Протягом строку дії згоди; при відкликанні згоди функція ШІ-аналізу негайно вимикається.

### 5. Права суб'єкта даних
Відмова від автоматизованої обробки у будь-який момент без жодного впливу на базове медичне обслуговування в Клубі.

### 6. Як відкликати згоду
На сторінці «Мої згоди» за допомогою OTP-коду або через звернення до лікаря чи адміністратора Клубу.

### 7. Контакти
Медичний департамент Клубу (privacy@club-academy.ua).`,
  },
  wearables: {
    scope: "wearables",
    version: "1.0",
    title: "Згода на збір та обробку біометричних даних із носимих пристроїв (Wearables)",
    effective_from: "2026-01-01T00:00:00Z",
    is_active: true,
    body_markdown: `⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**

### 1. Хто обробляє дані
Медичний штаб та фахівці з фізичної підготовки Клубу.

### 2. Які дані обробляються
Показники варіабельності серцевого ритму (HRV RMSSD), пульсу у спокої (RHR), тривалості та ефективності сну, індексу відновлення (Recovery Score) з пристроїв WHOOP, Apple Watch, Garmin, Oura.

### 3. Мета обробки (Навіщо)
Моніторинг відновлення вегетативної нервової системи та попередження перетренованості й безконтактних м'язових травм.

### 4. Строк зберігання
Протягом спортивного сезону або до моменту відкликання згоди законним представником чи гравцем.

### 5. Права суб'єкта даних
Перегляд зібраних показників, вимога видалення або знеособлення історії біометрії при відкликанні згоди.

### 6. Як відкликати згоду
Перемикачем у кабінеті «Мої згоди» (після перевірки OTP) або за письмовою заявою.

### 7. Контакти
Медичний департамент Клубу (privacy@club-academy.ua).`,
  },
  supplements: {
    scope: "supplements",
    version: "1.0",
    title: "Згода на призначення та облік спортивних добавок (нутрицевтиків)",
    effective_from: "2026-01-01T00:00:00Z",
    is_active: true,
    body_markdown: `⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**

### 1. Хто обробляє дані
Спортивний лікар та нутриціолог Клубу.

### 2. Які дані обробляються
Відомості про харчові алергії, тип дієти, стоматологічний статус та протокол дозволених WADA спортивних добавок (вітаміни, колаген, протеїн, омега-3, препарати заліза).

### 3. Мета обробки (Навіщо)
Безпечна нутриціологічна підтримка організму в період росту та підвищених фізичних навантажень, виключення алергічних реакцій.

### 4. Строк зберігання
На період дії контракту / навчання в Академії Клубу або до відкликання згоди.

### 5. Права суб'єкта даних
Отримання повної інформації про склад нутрицевтиків, право у будь-який момент припинити програму суплементації.

### 6. Як відкликати згоду
На сторінці «Мої згоди» (підтвердження по SMS OTP) або через медичний штаб Клубу.

### 7. Контакти
Медичний департамент Клубу (privacy@club-academy.ua).`,
  },
  gps: {
    scope: "gps",
    version: "1.0",
    title: "Згода на GPS-трекінг та моніторинг зовнішнього тренувального навантаження",
    effective_from: "2026-01-01T00:00:00Z",
    is_active: true,
    body_markdown: `⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**

### 1. Хто обробляє дані
Тренерський та медичний штаб Клубу.

### 2. Які дані обробляються
Дані GPS-датчиків під час тренувань і матчів (дистанція, швидкісні спринти, прискорення, гальмування, оцінка RPE та тренувальне навантаження в умовних одиницях AU).

### 3. Мета обробки (Навіщо)
Контроль гострого та хронічного навантаження (ACWR) для запобігання перевантаженню зон росту у юних футболістів.

### 4. Строк зберігання
Протягом навчання в Академії або до моменту відкликання згоди.

### 5. Права суб'єкта даних
Доступ до звітів навантаження, право відкликати згоду з видаленням або знеособленням GPS-треків.

### 6. Як відкликати згоду
Через посилання «Мої згоди» з OTP-підтвердженням або письмовим зверненням.

### 7. Контакти
Медичний департамент Клубу (privacy@club-academy.ua).`,
  },
  photo: {
    scope: "photo",
    version: "1.0",
    title: "Згода на використання фотографії профілю та візуальних матеріалів у медичній картці",
    effective_from: "2026-01-01T00:00:00Z",
    is_active: true,
    body_markdown: `⚠️ **ШАБЛОН, ПОТРЕБУЄ ПЕРЕВІРКИ ЮРИСТОМ**

### 1. Хто обробляє дані
Медичний та адміністративний штаб Клубу.

### 2. Які дані обробляються
Портретне фото профілю гравця у внутрішній системі медичного обліку Клубу.

### 3. Мета обробки (Навіщо)
Швидка візуальна ідентифікація спортсмена медичним персоналом під час оглядів, тестувань та формування заявки на матч.

### 4. Строк зберігання
До моменту відкликання згоди або завершення виступів гравця за Клуб.

### 5. Права суб'єкта даних
Право вимагати негайного видалення фотографії профілю без будь-яких обмежень для тренувального процесу.

### 6. Як відкликати згоду
На сторінці «Мої згоди» (через OTP) або зверненням до адміністратора Клубу.

### 7. Контакти
Медичний департамент Клубу (privacy@club-academy.ua).`,
  },
};

export type ConsentCellStatus = "granted" | "missing" | "revoked" | "outdated";

export type ScopeConsentState = {
  scope: ConsentScope;
  status: ConsentCellStatus;
  /** Чи дозволена функція цієї області прямо зараз (для 18+ без відкликання = true, для <18 тільки при status === 'granted') */
  allowed: boolean;
  /** Повідомлення при блокуванні */
  blockReason: string | null;
  activeVersion: string;
  signedVersion: string | null;
  grantedAt: string | null;
  revokedAt: string | null;
  method: string | null;
  signerName: string | null;
  scanPath: string | null;
  consentId: string | null;
};

export type PlayerConsentSummary = {
  playerId: string;
  age: number;
  isMinor: boolean; // < 18
  isTeenAssentApplicable: boolean; // 14-17
  assentAcknowledged: boolean;
  assentAcknowledgedAt: string | null;
  guardians: Guardian[];
  scopes: Record<ConsentScope, ScopeConsentState>;
};

export function calculatePlayerAge(dateOfBirth: string): number {
  if (!dateOfBirth) return 18;
  const dob = new Date(dateOfBirth);
  const diffMs = Date.now() - dob.getTime();
  return Math.floor(diffMs / (365.25 * 86400000));
}

/**
 * Отримує активні версії документів згоди для клубу (з БД або дефолтних шаблонів, якщо міграція ще не застосована)
 */
export async function getActiveConsentDocuments(
  clubId: string = DEFAULT_CLUB_ID
): Promise<Record<ConsentScope, ConsentDocument>> {
  const result = {} as Record<ConsentScope, ConsentDocument>;
  for (const scope of ALL_CONSENT_SCOPES) {
    const tpl = DEFAULT_CONSENT_TEMPLATES[scope];
    result[scope] = {
      id: `default_${scope}_v1.0`,
      club_id: clubId,
      ...tpl,
    };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("consent_documents")
      .select("*")
      .eq("club_id", clubId)
      .eq("is_active", true);

    if (!error && data && data.length > 0) {
      for (const doc of data) {
        const s = doc.scope as ConsentScope;
        if (ALL_CONSENT_SCOPES.includes(s)) {
          result[s] = doc as ConsentDocument;
        }
      }
    } else {
      // Fallback: перевіряємо чи є кастомні версії в injury_logs з маркером [CONSENT_DOC]
      const { data: logs } = await supabase
        .from("injury_logs")
        .select("note")
        .like("note", "[CONSENT_DOC]%")
        .order("created_at", { ascending: false })
        .limit(50);

      if (logs && logs.length > 0) {
        const seen = new Set<ConsentScope>();
        for (const l of logs) {
          try {
            const parsed = JSON.parse(l.note.replace("[CONSENT_DOC] ", "")) as ConsentDocument;
            if (parsed.is_active && !seen.has(parsed.scope)) {
              result[parsed.scope] = parsed;
              seen.add(parsed.scope);
            }
          } catch {}
        }
      }
    }
  } catch {}

  return result;
}

/**
 * Завантажує всі записи згод гравця (з таблиці consents або резервного логу, якщо міграцію ще не застосовано)
 */
export async function fetchPlayerConsentRecords(playerId: string): Promise<Consent[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("consents")
      .select("*")
      .eq("player_id", playerId)
      .order("granted_at", { ascending: false });

    if (!error && data) {
      return data as Consent[];
    }

    // Резервний режим (якщо таблиця consents ще не створена в БД, оскільки міграцію тільки створено):
    const { data: logs } = await supabase
      .from("injury_logs")
      .select("note")
      .like("note", "[CONSENT_RECORD]%")
      .order("created_at", { ascending: false })
      .limit(200);

    if (logs && logs.length > 0) {
      const map = new Map<string, Consent>();
      for (const l of logs) {
        try {
          const parsed = JSON.parse(l.note.replace("[CONSENT_RECORD] ", "")) as Consent;
          if (parsed.player_id === playerId && !map.has(parsed.id)) {
            map.set(parsed.id, parsed);
          }
        } catch {}
      }
      return Array.from(map.values());
    }
  } catch {}
  return [];
}

/**
 * Завантажує законних представників (батьків) гравця
 */
export async function fetchPlayerGuardians(playerId: string): Promise<Guardian[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("guardians")
      .select("*")
      .eq("player_id", playerId)
      .order("is_primary", { ascending: false });

    if (!error && data) {
      return data as Guardian[];
    }

    // Резервний режим (якщо таблиця guardians ще не створена в БД):
    const { data: logs } = await supabase
      .from("injury_logs")
      .select("note")
      .like("note", "[GUARDIAN]%")
      .order("created_at", { ascending: false })
      .limit(100);

    if (logs && logs.length > 0) {
      const map = new Map<string, Guardian>();
      for (const l of logs) {
        try {
          const parsed = JSON.parse(l.note.replace("[GUARDIAN] ", "")) as Guardian & { deleted?: boolean };
          if (parsed.player_id === playerId && !map.has(parsed.id)) {
            if (!parsed.deleted) {
              map.set(parsed.id, parsed);
            } else {
              map.set(parsed.id, null as any);
            }
          }
        } catch {}
      }
      return Array.from(map.values()).filter(Boolean);
    }
  } catch {}
  return [];
}

/**
 * Обчислює детальний стан згод для одного гравця по всіх 6 областях
 */
export async function getPlayerConsentSummary(
  playerId: string,
  playerDob?: string,
  clubId: string = DEFAULT_CLUB_ID
): Promise<PlayerConsentSummary> {
  const supabase = createAdminClient();

  let dob = playerDob;
  let assentAck = false;
  let assentAckAt: string | null = null;

  if (!dob) {
    const { data: p } = await supabase
      .from("players")
      .select("date_of_birth, club_id, assent_acknowledged, assent_acknowledged_at")
      .eq("id", playerId)
      .maybeSingle();

    dob = p?.date_of_birth || "2010-01-01";
    clubId = p?.club_id || clubId;
    assentAck = Boolean((p as any)?.assent_acknowledged);
    assentAckAt = (p as any)?.assent_acknowledged_at || null;
  }

  const [activeDocs, records, guardians] = await Promise.all([
    getActiveConsentDocuments(clubId),
    fetchPlayerConsentRecords(playerId),
    fetchPlayerGuardians(playerId),
  ]);

  // Перевіряємо чи є позначка assent в записах згоди
  if (!assentAck) {
    const withAssent = records.find((r) => r.player_assent || r.evidence?.player_assent);
    if (withAssent) {
      assentAck = true;
      assentAckAt = withAssent.player_assent_at || withAssent.granted_at;
    }
  }

  const age = calculatePlayerAge(dob!);
  const isMinor = age < 18;
  const isTeenAssentApplicable = age >= 14 && age <= 17;

  const scopes = {} as Record<ConsentScope, ScopeConsentState>;

  for (const scope of ALL_CONSENT_SCOPES) {
    const activeDoc = activeDocs[scope];
    const scopeRecords = records.filter((r) => r.scope === scope);
    const latest = scopeRecords[0] || null;

    let status: ConsentCellStatus = "missing";
    let signedVersion: string | null = null;

    if (latest) {
      signedVersion = latest.evidence?.document_version || "1.0";
      const isCurrentDoc =
        latest.document_id === activeDoc.id || signedVersion === activeDoc.version;

      if (latest.revoked_at) {
        status = "revoked";
      } else if (!isCurrentDoc) {
        status = "outdated";
      } else {
        status = "granted";
      }
    }

    // Правило п. 6:
    // - Основний облік лікаря (data_processing: травми, огляди) не блокується.
    // - Для гравців молодше 18 років (< 18) без діючої згоди (status !== 'granted') блокувати опціональні області
    //   з підказкою «Потрібна згода батьків».
    // - Для гравців 18+ нічого не блокуємо (окрім випадку, якщо гравець 18+ явно натиснув «Відкликати згоду» — тоді поважаємо відкликання? За узгодженням з користувачем: для гравців 18+ не блокуємо нічого).
    let allowed = true;
    let blockReason: string | null = null;

    if (scope !== "data_processing" && isMinor) {
      if (status === "missing") {
        allowed = false;
        blockReason = "Потрібна згода батьків";
      } else if (status === "revoked") {
        allowed = false;
        blockReason = "Потрібна згода батьків (згоду було відкликано)";
      } else if (status === "outdated") {
        allowed = false;
        blockReason = `Потрібна згода батьків (потрібне повторне підтвердження версії v${activeDoc.version})`;
      }
    }

    scopes[scope] = {
      scope,
      status,
      allowed,
      blockReason,
      activeVersion: activeDoc.version,
      signedVersion,
      grantedAt: latest?.granted_at || null,
      revokedAt: latest?.revoked_at || null,
      method: latest?.method || null,
      signerName: latest?.evidence?.signer_full_name || null,
      scanPath: latest?.scan_path || null,
      consentId: latest?.id || null,
    };
  }

  return {
    playerId,
    age,
    isMinor,
    isTeenAssentApplicable,
    assentAcknowledged: assentAck,
    assentAcknowledgedAt: assentAckAt,
    guardians,
    scopes,
  };
}

/**
 * Єдина функція перевірки згоди (п. 6):
 * Тільки вона перевіряє наявність діючої згоди для гравця та області (scope).
 *
 * Повертає boolean (true = дія дозволена, false = заблоковано, потрібна згода батьків).
 */
export async function hasConsent(
  playerId: string,
  scope: ConsentScope
): Promise<boolean> {
  if (!playerId) return true;
  if (scope === "data_processing") {
    // Основний облік лікаря (травми, огляди) від опціональних згод не залежить
    return true;
  }

  const summary = await getPlayerConsentSummary(playerId);
  // Для гравців 18+ нічого не блокуємо
  if (!summary.isMinor) {
    return true;
  }

  return summary.scopes[scope]?.allowed ?? false;
}
