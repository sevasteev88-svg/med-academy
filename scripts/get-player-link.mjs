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

async function getAmbru() {
  const { data: p } = await supabase
    .from("players")
    .select("id, first_name, last_name, portal_token")
    .eq("id", "879967e4-3a2c-4695-a23a-2db88dd68712")
    .single();

  const { data: sub } = await supabase
    .from("player_subscriptions")
    .select("status, current_period_end, amount_uah")
    .eq("player_id", "879967e4-3a2c-4695-a23a-2db88dd68712")
    .single();

  console.log("=== ТЕСТОВИЙ ГРАВЕЦЬ ===");
  console.log(`Ім'я: ${p.last_name} ${p.first_name}`);
  console.log(`ID: ${p.id}`);
  console.log(`Portal Token: ${p.portal_token}`);
  console.log(`Посилання активації: http://localhost:3000/a/${p.portal_token}`);
  console.log(`Пряме посилання в кабінет: http://localhost:3000/rehab-portal?token=${p.portal_token}`);
  console.log("Підписка зараз:", sub);
}

getAmbru();
