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
      .select("id, first_name, last_name, teams(name), injuries(id, status)")
      .order("last_name"),
  ]);

  const allTreatments: MedicalTreatmentEntry[] = (treatmentsRes.data || [])
    .map((l) => {
      try {
        const rawJson = l.note.replace("[TREATMENT] ", "");
        return JSON.parse(rawJson) as MedicalTreatmentEntry;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as MedicalTreatmentEntry[];

  const players = (playersRes.data || []).map((p: any) => {
    const activeInjury = p.injuries?.find((inj: any) => inj.status === "active");
    return {
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      team_name: p.teams?.name || "Основний склад",
      active_injury_id: activeInjury ? activeInjury.id : null,
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
