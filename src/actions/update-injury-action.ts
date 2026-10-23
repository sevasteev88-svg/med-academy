"use server";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDoctor } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export type UpdateInjuryState = { error?: string };

export async function updateInjuryAction(_prev: UpdateInjuryState, formData: FormData): Promise<UpdateInjuryState> {
  const auth = await assertDoctor();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const injuryId = formData.get("injuryId") as string;
  const injuryType = formData.get("injuryType") as string;
  const location = formData.get("location") as string;
  const side = formData.get("side") as string;
  const severity = formData.get("severity") as string;
  const mechanism = formData.get("mechanism") as string;
  const dateOfInjury = formData.get("dateOfInjury") as string;
  const expectedReturnDate = formData.get("expectedReturnDate") as string;
  const actualReturnDate = (formData.get("actualReturnDate") as string) || null;
  const description = formData.get("description") as string;
  const osiicsCode = (formData.get("osiicsCode") as string) || null;
  const onset = (formData.get("onset") as string) || "unknown";
  const occurrence = (formData.get("occurrence") as string) || "unknown";
  const previousInjuryId = (formData.get("previousInjuryId") as string) || null;

  if (!injuryId || !injuryType || !location || !side || !severity || !dateOfInjury) {
    return { error: "Заповніть всі обов'язкові поля" };
  }

  const { data: existingInjury } = await supabase
    .from("injuries")
    .select("player_id")
    .eq("id", injuryId)
    .single();

  let timeLossDays: number | null = null;
  if (actualReturnDate && dateOfInjury) {
    const start = new Date(dateOfInjury);
    const end = new Date(actualReturnDate);
    timeLossDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
  }

  const updatePayload: Record<string, unknown> = {
    injury_type: injuryType,
    location,
    side,
    severity,
    mechanism: mechanism || "non_contact",
    date_of_injury: dateOfInjury,
    expected_return_date: expectedReturnDate || null,
    actual_return_date: actualReturnDate,
    description: description?.trim() || null,
    osiics_code: osiicsCode?.trim() || null,
    onset,
    occurrence,
    previous_injury_id: previousInjuryId,
  };

  if (timeLossDays !== null) {
    updatePayload.time_loss_days = timeLossDays;
  }

  const { error } = await supabase.from("injuries").update(updatePayload).eq("id", injuryId);

  if (error) return { error: error.message };

  await logAudit({
    action: "update_injury",
    entity: "injury",
    entityId: injuryId,
    playerId: existingInjury?.player_id,
    meta: {
      location,
      side,
    },
    userId: auth.user.id,
    clubId: auth.user.clubId,
  });

  revalidatePath(`/injuries/${injuryId}`);
  revalidatePath("/");
  revalidatePath("/players");
  redirect(`/injuries/${injuryId}`);
}
