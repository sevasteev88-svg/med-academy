export interface PlayerActivationToken {
  id: string;
  player_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PlayerDevice {
  id: string;
  player_id: string;
  device_token_hash: string;
  device_name: string;
  user_agent?: string | null;
  ip_address?: string | null;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface PlayerDeviceSessionPayload {
  playerId: string;
  deviceId: string;
  sessionToken: string;
  issuedAt: number;
  expiresAt: number;
}

export interface ActivationResult {
  success: boolean;
  error?: string;
  requiresConsent?: boolean;
  lockedUntilMinutes?: number;
  playerId?: string;
}
