import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { isSubscriptionAccessGranted } from "./src/lib/billing.ts";

const envPath = path.resolve(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const envVars = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const idx = trimmed.indexOf("=");
    if (idx !== -1) {
      const k = trimmed.substring(0, idx).trim();
      const v = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, "");
      envVars[k] = v;
    }
  }
}

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function verifyLock() {
  const { data: sub } = await supabase
    .from("player_subscriptions")
    .select("*")
    .eq("player_id", "879967e4-3a2c-4695-a23a-2db88dd68712")
    .single();

  const isGranted = isSubscriptionAccessGranted({
    status: sub.status,
    currentPeriodEnd: sub.current_period_end,
    gracePeriodEndsAt: sub.grace_period_ends_at,
  });

  console.log("=== СТАТУС ПЕРЕВІРКИ БІЛІНГУ ===");
  console.log("Статус підписки в базі:", sub.status);
  console.log("Чи надається доступ:", isGranted);
  console.log("Чи ввімкнено Soft-Lock Paywall:", !isGranted);
}

verifyLock();
