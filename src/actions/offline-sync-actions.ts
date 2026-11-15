"use server";

import { createClient } from "@/utils/supabase/server";
import { assertAuth, assertDoctor, assertTeamStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { resolveOfflineConflict, buildConflictAuditMeta } from "@/lib/offline-conflict";
import { saveTeamTrainingAction } from "@/actions/training-session-actions";
import { calculateWellnessReadiness, type WellnessScore } from "@/types/wellness";
import type { OfflineOutboxItem, SyncBatchResult } from "@/types/offline";

/**
 * Пакетна синхронізація черги офлайн-мутацій (травми, велнес, навантаження, призначення)
 * із застосуванням правила Last-Write-Wins (LWW) та аудитом конфліктів.
 */
export async function syncOfflineBatchAction(
  items: OfflineOutboxItem[]
): Promise<{ success: boolean; result?: SyncBatchResult; error?: string }> {
  const auth = await assertAuth();
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
        const docAuth = await assertDoctor();
        if ("error" in docAuth) {
          failed++;
          details.push({ id: item.id, type: "injury", success: false, error: docAuth.error });
          continue;
        }
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
        const playerId = payload.player_id || payload.playerId;
        if (!playerId) {
          failed++;
          details.push({ id: item.id, type: "wellness", success: false, error: "Не вказано гравця" });
          continue;
        }

        const { data: playerRow } = await supabase
          .from("players")
          .select("team_id")
          .eq("id", playerId)
          .maybeSingle();

        if (user.role === "coach" && !playerRow?.team_id) {
          failed++;
          details.push({
            id: item.id,
            type: "wellness",
            success: false,
            error: "Недостатньо прав. Гравець не закріплений за командою.",
          });
          continue;
        }

        const staffAuth = await assertTeamStaff(playerRow?.team_id || undefined);
        if ("error" in staffAuth) {
          failed++;
          details.push({ id: item.id, type: "wellness", success: false, error: staffAuth.error });
          continue;
        }

        const sleepQuality = (payload.sleep_quality ?? payload.sleepQuality ?? 4) as WellnessScore;
        const fatigue = (payload.fatigue ?? payload.fatigue_level ?? payload.fatigueLevel ?? 4) as WellnessScore;
        const soreness = (payload.soreness ?? payload.muscle_soreness ?? payload.muscleSoreness ?? 4) as WellnessScore;
        const stress = (payload.stress ?? payload.stress_level ?? payload.stressLevel ?? 4) as WellnessScore;
        const date = payload.date || item.client_timestamp.split("T")[0];

        const normalizedEntry = {
          player_id: playerId,
          date,
          sleep_quality: sleepQuality,
          fatigue,
          soreness,
          stress,
          pain: payload.pain ?? false,
          pain_vas: payload.pain_vas ?? null,
          pain_locations: payload.pain_locations ?? [],
          illness: payload.illness ?? false,
          comment: payload.comment ?? payload.notes ?? null,
          source: payload.source ?? "staff",
        };

        // Синхронізація форми самопочуття (wellness)
        const { data: existing } = await supabase
          .from("wellness_entries")
          .select("*")
          .eq("player_id", playerId)
          .eq("date", date)
          .maybeSingle();

        if (existing) {
          const resolution = resolveOfflineConflict({
            entityType: "wellness",
            clientPayload: normalizedEntry,
            clientTimestamp: item.client_timestamp,
            serverPayload: existing,
            serverTimestamp: existing.updated_at || existing.created_at,
          });

          if (resolution.isConflict) conflictsResolved++;

          if (resolution.winner === "client") {
            await supabase
              .from("wellness_entries")
              .update({
                ...normalizedEntry,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          }

          if (resolution.isConflict) {
            await logAudit({
              action: "offline_conflict_resolved",
              entity: "wellness",
              entityId: existing.id,
              playerId,
              userId: user.id,
              clubId: user.clubId,
              meta: buildConflictAuditMeta({
                entityType: "wellness",
                resolution,
                entityId: existing.id,
                playerId,
              }),
            });
          }
        } else {
          await supabase.from("wellness_entries").insert({
            ...normalizedEntry,
            club_id: user.clubId,
            submitted_at: item.client_timestamp,
            created_at: item.client_timestamp,
            updated_at: item.client_timestamp,
          });
        }

        // Синхронно оновлюємо wellness_surveys для планшетного кіоску
        const readiness = calculateWellnessReadiness({
          sleep_quality: sleepQuality,
          fatigue_level: fatigue,
          muscle_soreness: soreness,
          stress_level: stress,
        });
        await supabase.from("wellness_surveys").upsert(
          {
            id: payload.id || item.id,
            club_id: user.clubId,
            player_id: playerId,
            date,
            sleep_quality: sleepQuality,
            fatigue_level: fatigue,
            muscle_soreness: soreness,
            stress_level: stress,
            total_score: readiness.total_score,
            readiness_status: readiness.readiness_status,
            notes: normalizedEntry.comment,
            created_at: item.client_timestamp,
          } as any,
          { onConflict: "player_id, date" } as any
        );

        succeeded++;
        details.push({ id: item.id, type: "wellness", success: true });
      } else if (item.type === "workload") {
        const teamId = payload.teamId || payload.team_id;
        if (!teamId) {
          failed++;
          details.push({
            id: item.id,
            type: "workload",
            success: false,
            error: "Не вказано команду для синхронізації навантаження",
          });
          continue;
        }

        const staffAuth = await assertTeamStaff(teamId);
        if ("error" in staffAuth) {
          failed++;
          details.push({ id: item.id, type: "workload", success: false, error: staffAuth.error });
          continue;
        }

        if (Array.isArray(payload.players)) {
          const trainRes = await saveTeamTrainingAction(payload);
          if (!trainRes.success) {
            throw new Error(trainRes.error || "Помилка збереження тренування");
          }
        } else {
          // Синхронізація одиничного навантаження (session-RPE)
          await supabase.from("training_load_records").insert({
            ...payload,
            club_id: user.clubId,
            created_at: item.client_timestamp,
          });
        }

        succeeded++;
        details.push({ id: item.id, type: "workload", success: true });
      } else if (item.type === "prescription") {
        const docAuth = await assertDoctor();
        if ("error" in docAuth) {
          failed++;
          details.push({ id: item.id, type: "prescription", success: false, error: docAuth.error });
          continue;
        }
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
