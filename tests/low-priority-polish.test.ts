import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  transliterateCyrillicForPdf,
  buildEhrExportPayload,
  generateEhrTransferPdfBase64,
} from "../src/lib/ehr-transfer.ts";
import { EHR_SECTIONS } from "../src/types/ehr-transfer.ts";

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

test("1. EHR PDF транслитерирует кириллицу для helvetica и корректно собирает PDF с украинскими именами", () => {
  assert.equal(
    transliterateCyrillicForPdf("Шевченко Тарас — ФК «Шахтар»"),
    'Shevchenko Taras - FK "Shakhtar"'
  );

  const payload = buildEhrExportPayload({
    clubOrigin: { id: "c-1", name: "ФК «Шахтар»" },
    doctor: { id: "d-1", name: "Д-р Коваленко" },
    player: {
      first_name: "Тарас",
      last_name: "Степаненко",
      date_of_birth: "1989-08-08",
      position: "ОП",
    },
    consent: {
      consent_confirmed: true,
      purpose: "transfer",
      recipient_club: "ФК Динамо Київ",
      doctor_confirmation_name: "Д-р Коваленко",
      consent_date: "2026-11-22",
    },
    sectionsIncluded: EHR_SECTIONS,
    data: {
      injuries: [
        {
          injury_type: "muscular",
          location: "thigh",
          side: "right",
          date_of_injury: "2026-08-10",
          severity: "moderate",
          mechanism: "non_contact",
          status: "closed",
          description: "Надрив м'яза стегна",
        },
      ],
    },
  });

  const base64 = generateEhrTransferPdfBase64(payload);
  const decoded = Buffer.from(base64, "base64").toString("latin1");
  assert.ok(decoded.startsWith("%PDF-1."));
  assert.ok(decoded.includes("CONFIDENTIAL"));
  assert.ok(decoded.includes("STEPANENKO"));
  assert.ok(decoded.includes("Shakhtar"));
});

test("2. PwaRegister использует динамический clubLogoUrl и не допускает утечки слушателя beforeinstallprompt на iOS", () => {
  const pwaSrc = readWorkspaceFile("src/components/layout/PwaRegister.tsx");
  assert.match(pwaSrc, /clubLogoUrl/);
  assert.match(pwaSrc, /let iosTimer/);
  assert.ok(
    !pwaSrc.includes("return () => clearTimeout(timer);"),
    "PwaRegister must not exit early inside useEffect before returning unified cleanup"
  );
  assert.match(pwaSrc, /window\.removeEventListener\("beforeinstallprompt", handleBeforeInstall\)/);
});

test("3. LayoutMain и AppNav скрывают отступы и меню персонала на публичных порталах", () => {
  const layoutMainSrc = readWorkspaceFile("src/components/layout/LayoutMain.tsx");
  assert.match(layoutMainSrc, /isStandalonePortalPath/);
  assert.match(layoutMainSrc, /\/rehab-portal/);
  assert.match(layoutMainSrc, /\/parent\//);
  assert.match(layoutMainSrc, /\/consent\//);

  const appNavSrc = readWorkspaceFile("src/components/layout/AppNav.tsx");
  assert.match(appNavSrc, /pathname\.startsWith\("\/parent\/"\)/);

  const rootLayoutSrc = readWorkspaceFile("src/app/layout.tsx");
  assert.match(rootLayoutSrc, /LayoutMain/);
  assert.match(rootLayoutSrc, /<PwaRegister clubLogoUrl=\{clubLogoUrl\} clubName=\{clubName\} \/>/);
});
