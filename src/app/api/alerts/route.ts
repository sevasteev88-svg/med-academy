import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getRiskAlerts } from "@/lib/get-risk-alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ alerts: [] }, { status: 401 });
  }

  const alerts = await getRiskAlerts({
    includePharmacy: user.role !== "coach",
  });

  return NextResponse.json(
    { alerts },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
