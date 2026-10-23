import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { getPharmacyStockAction } from "@/actions/pharmacy-actions";
import ClubPharmacyClient from "@/components/pharmacy/ClubPharmacyClient";
import type { MedicalTreatmentEntry } from "@/types/pharmacy";

export const metadata: Metadata = {
  title: "Аптека та Медичний Склад | ФК Чорноморець",
  description: "Облік медикаментів, ін'єкцій, витратних матеріалів та антидопінговий контроль WADA",
};

export default async function PharmacyPage() {
  const supabase = await createClient();

  const [stock, treatmentsRes, playersRes] = await Promise.all([
    getPharmacyStockAction(),
    supabase
      .from("injury_logs")
      .select("*")
      .like("note", "[TREATMENT]%")
      .order("date", { ascending: false }),
    supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, teams(name), injuries(id, injury_type, description, status)")
      .order("last_name"),
  ]);

  const allTreatments: MedicalTreatmentEntry[] = (treatmentsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[TREATMENT] ", "");
        const parsed = JSON.parse(rawJson) as MedicalTreatmentEntry;
        parsed.log_id = l.id;
        return parsed;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as MedicalTreatmentEntry[];

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
    <div className="max-w-7xl mx-auto px-4 py-8">
      <ClubPharmacyClient
        initialStock={stock}
        allTreatments={allTreatments}
        players={players}
      />
    </div>
  );
}
