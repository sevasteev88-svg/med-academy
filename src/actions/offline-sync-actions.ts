"use server";

import { createClient } from "@/utils/supabase/server";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { resolveOfflineConflict, buildConflictAuditMeta } from "@/lib/offline-conflict";
import type { OfflineOutboxItem, SyncBatchResult } from "@/types/offline";

/**
 * Пакетна синхронізація черги офлайн-мутацій (травми, велнес, навантаження, призначення)
 * із застосуванням правила Last-Write-Wins (LWW) та аудитом конфліктів.
 */
export async function syncOfflineBatchAction(
  items: OfflineOutboxItem[]
): Promise<{ success: boolean; result?: SyncBatchResult; error?: string }> {
  const auth = await assertDoctor();
  if ("error" in auth) {
    return { success: false, error: auth.error };
  }

  const { user } = auth;
  const supabase = await createClient();

  const details: SyncBatchResult["details"] = [];
  let succeeded = 0;
  let failed = 0;
  let conflictsResolved = 0;

  for (const item of items) {
    const payload = item.plain_payload;
    if (!payload) {
      details.push({ id: item.id, type: item.type, success: false, error: "Порожній payload" });
      failed++;
      continue;
    }

    try {
      if (item.type === "injury") {
        // Синхронізація форми «Фіксувати травму»
        const injuryId = payload.id || item.id;
        const { data: existing } = await supabase
          .from("injuries")
          .select("*")
          .eq("id", injuryId)
          .maybeSingle();

        if (existing) {
          const resolution = resolveOfflineConflict({
            entityType: "injury",
            clientPayload: payload,
            clientTimestamp: item.client_timestamp,
            serverPayload: existing,
            serverTimestamp: existing.updated_at || existing.created_at,
          });

          if (resolution.isConflict) conflictsResolved++;

          if (resolution.winner === "client") {
            await supabase
              .from("injuries")
              .update({
                ...payload,
                updated_at: new Date().toISOString(),
              })
              .eq("id", injuryId);
          }

          if (resolution.isConflict) {
            await logAudit({
              action: "offline_conflict_resolved",
              entity: "injury",
              entityId: injuryId,
              playerId: payload.player_id,
              userId: user.id,
              clubId: user.clubId,
              meta: buildConflictAuditMeta({
                entityType: "injury",
                resolution,
                entityId: injuryId,
                playerId: payload.player_id,
              }),
            });
          }
        } else {
          // Новий запис травми
          await supabase.from("injuries").insert({
            ...payload,
            id: injuryId,
            club_id: user.clubId,
            created_at: item.client_timestamp,
            updated_at: item.client_timestamp,
          });

          await logAudit({
            action: "create_injury",
            entity: "injury",
            entityId: injuryId,
            playerId: payload.player_id,
            userId: user.id,
            clubId: user.clubId,
            meta: { source: "offline_outbox" },
          });
        }

        succeeded++;
        details.push({ id: item.id, type: "injury", success: true });
      } else if (item.type === "wellness") {
        // Синхронізація форми самопочуття (wellness)
        const { data: existing } = await supabase
          .from("wellness_entries")
          .select("*")
          .eq("player_id", payload.player_id)
          .eq("date", payload.date)
          .maybeSingle();

        if (existing) {
          const resolution = resolveOfflineConflict({
            entityType: "wellness",
            clientPayload: payload,
            clientTimestamp: item.client_timestamp,
            serverPayload: existing,
            serverTimestamp: existing.updated_at || existing.created_at,
          });

          if (resolution.isConflict) conflictsResolved++;

          if (resolution.winner === "client") {
            await supabase
              .from("wellness_entries")
              .update({
                ...payload,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          }

          if (resolution.isConflict) {
            await logAudit({
              action: "offline_conflict_resolved",
              entity: "wellness",
              entityId: existing.id,
              playerId: payload.player_id,
              userId: user.id,
              clubId: user.clubId,
              meta: buildConflictAuditMeta({
                entityType: "wellness",
                resolution,
                entityId: existing.id,
                playerId: payload.player_id,
              }),
            });
          }
        } else {
          await supabase.from("wellness_entries").insert({
            ...payload,
            club_id: user.clubId,
            created_at: item.client_timestamp,
            updated_at: item.client_timestamp,
          });
        }

        succeeded++;
        details.push({ id: item.id, type: "wellness", success: true });
      } else if (item.type === "workload") {
        // Синхронізація навантаження (session-RPE)
        await supabase.from("training_load_records").insert({
          ...payload,
          club_id: user.clubId,
          created_at: item.client_timestamp,
        });

        succeeded++;
        details.push({ id: item.id, type: "workload", success: true });
      } else if (item.type === "prescription") {
        // Синхронізація призначень медикаментів (аптека)
        await supabase.from("medical_treatments").insert({
          ...payload,
          club_id: user.clubId,
          created_at: item.client_timestamp,
        });

        succeeded++;
        details.push({ id: item.id, type: "prescription", success: true });
      }
    } catch (err: any) {
      failed++;
      details.push({
        id: item.id,
        type: item.type,
        success: false,
        error: err?.message || "Помилка збереження",
      });
    }
  }

  revalidatePath("/injuries");
  revalidatePath("/wellness");
  revalidatePath("/training");

  return {
    success: true,
    result: {
      totalProcessed: items.length,
      succeeded,
      failed,
      conflictsResolved,
      details,
    },
  };
}
