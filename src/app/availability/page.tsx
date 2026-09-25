import { createClient } from "@/utils/supabase/server";
import AvailabilityClient from "@/components/availability/AvailabilityClient";

export default async function AvailabilityPage() {
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("teams")
    .select(`
      id,
      name,
      category,
      sort_order,
      players (
        id,
        first_name,
        last_name,
        position,
        injuries (
          id,
          status,
          vas_score,
          location,
          injury_type,
          date_of_injury,
          expected_return_date,
          diagnosis
        ),
        maturation_assessments (
          risk_zone,
          growth_phase,
          consensus_offset,
          created_at
        )
      )
    `)
    .order("sort_order", { ascending: true });

  return <AvailabilityClient teams={(teams as any) ?? []} />;
}

