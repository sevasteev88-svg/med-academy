import type { CoachTelegramBinding, CoachTelegramSessionDraft } from "../types/telegram.ts";

export interface MemoryCoachToken {
  id: string;
  coach_user_id: string;
  club_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export const memoryCoachTokens = new Map<string, MemoryCoachToken>();
export const memoryCoachBindings = new Map<string, CoachTelegramBinding>();
export const memoryCoachSessions = new Map<string, { current_step: string; session_draft: CoachTelegramSessionDraft }>();
