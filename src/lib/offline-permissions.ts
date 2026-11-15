import type { OfflineMutationType } from "@/types/offline.ts";
import type { UserRole } from "@/types/database.ts";

export const MEDICAL_OFFLINE_TYPES: ReadonlyArray<OfflineMutationType> = [
  "injury",
  "prescription",
];

export const TEAM_STAFF_OFFLINE_TYPES: ReadonlyArray<OfflineMutationType> = [
  "wellness",
  "workload",
];

export function isMedicalOfflineMutation(type: OfflineMutationType): boolean {
  return MEDICAL_OFFLINE_TYPES.includes(type);
}

/**
 * Перевіряє, чи має роль право синхронізувати даний тип офлайн-мутації:
 * - Медичні сутності (injury, prescription) — лише лікар/адмін (assertDoctor)
 * - Тренування та велнес (workload, wellness) — лікар, адмін або тренер (assertTeamStaff)
 */
export function canRoleSyncOfflineMutation(
  role: UserRole | string,
  type: OfflineMutationType
): boolean {
  if (role === "doctor" || role === "admin") {
    return true;
  }
  if (role === "coach") {
    return TEAM_STAFF_OFFLINE_TYPES.includes(type);
  }
  return false;
}
