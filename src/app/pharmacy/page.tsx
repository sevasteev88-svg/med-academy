import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { getPharmacyStockAction } from "@/actions/pharmacy-actions";
import ClubPharmacyClient from "@/components/pharmacy/ClubPharmacyClient";
import type { MedicalTreatmentEntry } from "@/types/pharmacy";

export const metadata: Metadata = {
  title: "Аптека та Медичний Склад | Спортивна Академія",
  description: "Облік медикаментів, ін'єкцій, витратних матеріалів та антидопінговий контроль WADA",
};

export default async function PharmacyPage() {
  const supabase = await createClient();

  const [stock, treatmentsRes, playersRes] = await Promise.all([
    getPharmacyStockAction(),
    supabase
      .from("medical_treatments")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, teams(name), injuries(id, injury_type, description, status)")
      .order("last_name"),
  ]);

  const allTreatments: MedicalTreatmentEntry[] = (treatmentsRes.data || []).map((row: any) => ({
    ...((row.data as MedicalTreatmentEntry) || {}),
    id: row.legacy_entry_id || row.id,
    log_id: row.id,
    injury_id: row.injury_id,
    player_id: row.player_id,
    date: row.date,
    category: row.category,
    title: row.title,
    dosage_or_params: row.dosage_or_params,
    duration_days: row.duration_days,
    duration_note: row.duration_note,
    reason: row.reason,
    doctor_name: row.doctor_name,
    wada_status: row.wada_status,
    doctor_wada_confirmed: row.doctor_wada_confirmed,
    doctor_confirmation_note: row.doctor_confirmation_note,
    notes: row.notes,
    pharmacy_item_id: row.pharmacy_item_id,
    units_deducted: row.units_deducted != null ? Number(row.units_deducted) : null,
    created_at: row.created_at,
  }));

  const players = (playersRes.data || []).map((p: any) => {
    const activeInjuries = (p.injuries || []).filter(
      (inj: any) => inj.status === "active" || inj.status === "rehabilitation"
    );
    const primaryInjury = activeInjuries[0] || null;

    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      date_of_birth: p.date_of_birth || null,
      team_name: p.teams?.name || "Основний склад",
      active_injury_id: primaryInjury ? primaryInjury.id : null,
      active_injuries: activeInjuries.map((inj: any) => ({
        id: inj.id,
        injury_type: inj.injury_type,
        description: inj.description,
      })),
    };
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
      <ClubPharmacyClient
        initialStock={stock}
        allTreatments={allTreatments}
        players={players}
      />
    </div>
  );
}
