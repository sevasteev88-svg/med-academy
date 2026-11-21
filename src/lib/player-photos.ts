import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  PLAYER_PHOTOS_BUCKET,
  extractStoragePathFromPhotoRef,
} from "@/lib/player-photo-utils";
import type { PlayerPhoto } from "@/types/photo";

/**
 * Перетворює посилання storage:player-photos:<path> на тимчасові підписані URL (1 година),
 * залишаючи готові data:/https: URL без змін.
 */
export async function resolvePlayerPhotoUrls(
  rawByPlayer: Record<string, string | null | undefined>
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const pathToPlayerIds = new Map<string, string[]>();

  for (const [playerId, rawVal] of Object.entries(rawByPlayer)) {
    if (!rawVal || typeof rawVal !== "string") continue;
    const storagePath = extractStoragePathFromPhotoRef(rawVal);
    if (storagePath) {
      const existing = pathToPlayerIds.get(storagePath) ?? [];
      existing.push(playerId);
      pathToPlayerIds.set(storagePath, existing);
    } else {
      result[playerId] = rawVal;
    }
  }

  const uniquePaths = Array.from(pathToPlayerIds.keys());
  if (uniquePaths.length === 0) {
    return result;
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(PLAYER_PHOTOS_BUCKET)
      .createSignedUrls(uniquePaths, 3600);

    if (!error && Array.isArray(data)) {
      data.forEach((item, idx) => {
        const pathKey = item.path || uniquePaths[idx];
        if (!item.signedUrl || !pathKey) return;
        const playerIds = pathToPlayerIds.get(pathKey) ?? [];
        for (const pid of playerIds) {
          result[pid] = item.signedUrl;
        }
      });
    }
  } catch {
    // Graceful degradation якщо Storage тимчасово недоступний або бакет ще не створено
  }

  return result;
}

/**
 * Завантажує фото гравців клубу з players.photo_url (приватний Storage) з безпечним
 * fallback на історичні записи [PLAYER_PHOTO] в injury_logs для зворотньої сумісності.
 */
export async function loadClubPlayerPhotos(
  clubId: string | null | undefined,
  playerIds?: string[]
): Promise<Record<string, string>> {
  const supabase = await createClient();
  const rawMap: Record<string, string> = {};

  // 1. Основне джерело: players.photo_url
  try {
    let q = supabase
      .from("players")
      .select("id, photo_url")
      .not("photo_url", "is", null);

    if (clubId) q = q.eq("club_id", clubId);
    if (playerIds && playerIds.length > 0) {
      q = q.in("id", playerIds);
    }

    const { data } = await q;
    for (const row of (data || []) as Array<{ id: string; photo_url?: string | null }>) {
      if (row.id && row.photo_url && !rawMap[row.id]) {
        rawMap[row.id] = row.photo_url;
      }
    }
  } catch {
    // Колонка photo_url ще не додана в БД — спокійно переходимо до fallback
  }

  // 2. Fallback для старих фото з injury_logs (якщо не всі запитані гравці мають photo_url)
  const missingSpecificIds =
    playerIds && playerIds.length > 0
      ? playerIds.filter((pid) => !rawMap[pid])
      : null;

  const needLegacyFallback = !playerIds || (missingSpecificIds && missingSpecificIds.length > 0);

  if (needLegacyFallback) {
    try {
      const targetSingleId =
        missingSpecificIds && missingSpecificIds.length === 1
          ? missingSpecificIds[0].replace(/[%_\\]/g, "\\$&")
          : null;

      let legacyQuery = supabase
        .from("injury_logs")
        .select("note")
        .like(
          "note",
          targetSingleId
            ? `[PLAYER_PHOTO] %"player_id":"${targetSingleId}"%`
            : "[PLAYER_PHOTO]%"
        )
        .order("date", { ascending: false })
        .limit(targetSingleId ? 5 : 300);

      if (clubId) {
        legacyQuery = legacyQuery.eq("club_id", clubId);
      }

      const { data: legacyLogs } = await legacyQuery;
      const missingSet = missingSpecificIds ? new Set(missingSpecificIds) : null;

      for (const l of legacyLogs || []) {
        try {
          const rawJson = l.note.replace("[PLAYER_PHOTO] ", "");
          const parsed = JSON.parse(rawJson) as PlayerPhoto;
          if (!parsed.player_id || !parsed.photo_url) continue;
          if (missingSet && !missingSet.has(parsed.player_id)) continue;
          if (!rawMap[parsed.player_id]) {
            rawMap[parsed.player_id] = parsed.photo_url;
          }
        } catch {}
      }
    } catch {}
  }

  return resolvePlayerPhotoUrls(rawMap);
}
