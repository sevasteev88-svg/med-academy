import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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

const AMBRUISENKO_ID = "879967e4-3a2c-4695-a23a-2db88dd68712";
const action = process.argv[2]; // 'lock' або 'unlock'

async function toggle() {
  if (action === "lock") {
    // Встановлюємо статус unpaid (soft-lock)
    await supabase
      .from("player_subscriptions")
      .update({
        status: "unpaid",
        current_period_end: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", AMBRUISENKO_ID);

    console.log("🔒 [LOCK]: Підписку Амбрусієнка заблоковано (status = unpaid)!");
    console.log("👉 Тепер відкрийте його кабінет: перевірте Soft-Lock Paywall");
  } else if (action === "unlock") {
    // Відновлюємо безкоштовний пілотний доступ (comped на 90 днів)
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("player_subscriptions")
      .update({
        status: "comped",
        current_period_end: futureDate,
        updated_at: new Date().toISOString(),
      })
      .eq("player_id", AMBRUISENKO_ID);

    console.log("🔓 [UNLOCK]: Підписку Амбрусієнка розблоковано (status = comped)!");
    console.log("👉 Тепер кабінет та анкети знову повністю доступні");
  } else {
    console.log("Використання: node scripts/toggle-sub.mjs lock | unlock");
  }
}

toggle();
