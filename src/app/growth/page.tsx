import GrowthDashboard from "@/components/growth/GrowthDashboard";

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;
  return <GrowthDashboard selectedTeam={team} />;
}
