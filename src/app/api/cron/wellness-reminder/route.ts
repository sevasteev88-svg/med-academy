import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendMorningWellnessRemindersAction } from "@/actions/telegram-actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Перевірка CRON_SECRET (Vercel Cron надсилає Authorization: Bearer <CRON_SECRET>)
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = createAdminClient();

    // 2. Знаходимо команду U19 (або Ю19)
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name");

    const u19Team = (teams || []).find(
      (t) =>
        t.name.toLowerCase().includes("u19") ||
        t.name.toLowerCase().includes("ю19") ||
        t.name.toLowerCase().includes("u-19")
    );

    // 3. Відправляємо нагадування (лише тим, хто ще не заповнив анкету)
    const res = await sendMorningWellnessRemindersAction({
      isCron: true,
      teamId: u19Team?.id,
    });

    return NextResponse.json({
      success: true,
      team: u19Team ? u19Team.name : "Усі команди",
      teamId: u19Team?.id || null,
      sentCount: res.sentCount || 0,
      skippedCount: res.skippedCount || 0,
      message: res.message || "Нагадування успішно опрацьовано",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
