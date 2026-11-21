export const PLAYER_PHOTOS_BUCKET = "player-photos";
export const STORAGE_PHOTO_PREFIX = "storage:player-photos:";
export const MAX_PLAYER_PHOTO_BYTES = 3 * 1024 * 1024; // 3 MB

export type ParsedDataUrlImage = {
  mimeType: string;
  ext: "jpg" | "png" | "webp";
  buffer: Buffer;
};

/**
 * Валідує та декодує Base64 data URL зображення (JPEG / PNG / WEBP) з обмеженням розміру.
 */
export function parseDataUrlImage(
  dataUrl: string
): ParsedDataUrlImage | { error: string } {
  if (!dataUrl || typeof dataUrl !== "string") {
    return { error: "Не передано зображення гравця." };
  }

  const trimmed = dataUrl.trim();
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    trimmed
  );

  if (!match) {
    return {
      error: "Непідтримуваний формат зображення. Дозволено лише JPEG, PNG або WEBP.",
    };
  }

  const rawMime = match[1].toLowerCase();
  const base64Body = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64Body, "base64");

  if (!buffer || buffer.byteLength === 0) {
    return { error: "Файл зображення порожній або пошкоджений." };
  }

  if (buffer.byteLength > MAX_PLAYER_PHOTO_BYTES) {
    return {
      error: "Розмір фото перевищує допустимий ліміт (максимум 3 МБ).",
    };
  }

  let mimeType = "image/jpeg";
  let ext: "jpg" | "png" | "webp" = "jpg";

  if (rawMime === "image/png") {
    mimeType = "image/png";
    ext = "png";
  } else if (rawMime === "image/webp") {
    mimeType = "image/webp";
    ext = "webp";
  }

  return { mimeType, ext, buffer };
}

export function formatStoragePhotoRef(storagePath: string): string {
  return `${STORAGE_PHOTO_PREFIX}${storagePath}`;
}

export function extractStoragePathFromPhotoRef(
  ref: string | null | undefined
): string | null {
  if (!ref || typeof ref !== "string") return null;
  if (!ref.startsWith(STORAGE_PHOTO_PREFIX)) return null;
  const path = ref.slice(STORAGE_PHOTO_PREFIX.length).trim();
  return path.length > 0 ? path : null;
}
