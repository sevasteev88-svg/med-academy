import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";

let mockConsentDocsRows: any[] = [];
let mockSeedUpsertCalls: Array<{ rows: any[]; options: any }> = [];
let mockConsentRecordsRows: any[] = [];
let mockPlayerRow: any = { date_of_birth: "2014-06-01", club_id: "13a6744b-6e76-4a6e-986e-5710ebe093c8" };

const mockSupabaseClient = {
  from(table: string) {
    if (table === "consent_documents") {
      return {
        select() {
          const filters: Record<string, any> = {};
          const chain: any = {
            eq(col: string, val: any) {
              filters[col] = val;
              return chain;
            },
            then(resolve: any) {
              const filtered = mockConsentDocsRows.filter((row) =>
                Object.entries(filters).every(([k, v]) => row[k] === v)
              );
              return Promise.resolve({ data: filtered, error: null }).then(resolve);
            },
          };
          return chain;
        },
        upsert(rows: any[], options: any) {
          mockSeedUpsertCalls.push({ rows, options });
          for (const row of rows) {
            const exists = mockConsentDocsRows.some(
              (r) =>
                r.club_id === row.club_id &&
                r.scope === row.scope &&
                r.version === row.version
            );
            if (!exists) {
              mockConsentDocsRows.push({
                id: crypto.randomUUID(),
                ...row,
              });
            }
          }
          return Promise.resolve({ error: null });
        },
      };
    }

    if (table === "consents") {
      return {
        select() {
          const chain: any = {
            eq() { return chain; },
            order() {
              return Promise.resolve({ data: mockConsentRecordsRows, error: null });
            },
          };
          return chain;
        },
      };
    }

    if (table === "guardians") {
      return {
        select() {
          const chain: any = {
            eq() { return chain; },
            order() {
              return Promise.resolve({ data: [], error: null });
            },
          };
          return chain;
        },
      };
    }

    if (table === "players") {
      return {
        select() {
          const chain: any = {
            eq() { return chain; },
            maybeSingle() {
              return Promise.resolve({ data: mockPlayerRow, error: null });
            },
          };
          return chain;
        },
      };
    }

    return {
      select() {
        const chain: any = {
          eq() { return chain; },
          like() { return chain; },
          order() { return chain; },
          limit() { return Promise.resolve({ data: [], error: null }); },
        };
        return chain;
      },
    };
  },
};

(globalThis as any).__TEST_MOCK_ADMIN_CLIENT__ = () => mockSupabaseClient;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/utils/supabase/server") {
      return { shortCircuit: true, url: "test://supabase-server" };
    }
    if (specifier === "@/utils/supabase/admin") {
      return { shortCircuit: true, url: "test://supabase-admin" };
    }
    if (specifier === "@/lib/auth") {
      return { shortCircuit: true, url: "test://lib-auth" };
    }
    if (specifier === "@/types/database") {
      return { shortCircuit: true, url: "test://types-database" };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "test://supabase-server") {
      return {
        shortCircuit: true,
        format: "module",
        source: "export async function createClient() { return globalThis.__TEST_MOCK_ADMIN_CLIENT__(); }",
      };
    }
    if (url === "test://supabase-admin") {
      return {
        shortCircuit: true,
        format: "module",
        source: "export function createAdminClient() { return globalThis.__TEST_MOCK_ADMIN_CLIENT__(); }",
      };
    }
    if (url === "test://lib-auth") {
      return {
        shortCircuit: true,
        format: "module",
        source: 'export const DEFAULT_CLUB_ID = "00000000-0000-0000-0000-000000000001";',
      };
    }
    if (url === "test://types-database") {
      return {
        shortCircuit: true,
        format: "module",
        source: "export {};",
      };
    }
    return nextLoad(url, context);
  },
});

const {
  isValidUuid,
  getActiveConsentDocuments,
  getPlayerConsentSummary,
} = await import("../src/lib/consents.ts");

test("isValidUuid validates UUIDs and rejects synthetic fallback IDs", () => {
  assert.equal(isValidUuid("13a6744b-6e76-4a6e-986e-5710ebe093c8"), true);
  assert.equal(isValidUuid("00000000-0000-0000-0000-000000000001"), true);
  assert.equal(isValidUuid("default_data_processing_v1.0"), false);
  assert.equal(isValidUuid("default_ai_processing_v1.0"), false);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(isValidUuid(""), false);
  assert.equal(isValidUuid(null), false);
  assert.equal(isValidUuid(undefined), false);
});

test("getActiveConsentDocuments auto-seeds missing consent_documents for a club with 0 rows", async () => {
  const clubId = "13a6744b-6e76-4a6e-986e-5710ebe093c8";
  mockConsentDocsRows = [];
  mockSeedUpsertCalls = [];

  const docs = await getActiveConsentDocuments(clubId);

  assert.equal(mockSeedUpsertCalls.length, 1);
  assert.equal(mockSeedUpsertCalls[0].rows.length, 6);
  assert.deepEqual(mockSeedUpsertCalls[0].options, {
    onConflict: "club_id,scope,version",
    ignoreDuplicates: true,
  });

  for (const scope of ["data_processing", "ai_processing", "wearables", "supplements", "gps", "photo"] as const) {
    assert.equal(isValidUuid(docs[scope].id), true, `Expected real UUID for ${scope}`);
    assert.equal(docs[scope].club_id, clubId);
    assert.equal(docs[scope].version, "1.0");
  }
});

test("getPlayerConsentSummary reads both signer_full_name and legacy signer_name", async () => {
  const clubId = "13a6744b-6e76-4a6e-986e-5710ebe093c8";
  const playerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  mockConsentDocsRows = [];
  const docs = await getActiveConsentDocuments(clubId);

  mockConsentRecordsRows = [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      club_id: clubId,
      player_id: playerId,
      guardian_id: null,
      scope: "data_processing",
      document_id: docs.data_processing.id,
      method: "e_signature",
      granted_at: "2026-11-19T20:00:00Z",
      revoked_at: null,
      evidence: {
        signer_name: "Бабілова Ольга",
        document_version: "1.0",
      },
      scan_path: null,
      collected_by: null,
    },
  ];

  const summary = await getPlayerConsentSummary(playerId, "2014-11-02", clubId, docs);
  assert.equal(summary.scopes.data_processing.status, "granted");
  assert.equal(summary.scopes.data_processing.signerName, "Бабілова Ольга");
});

test("source checks: consents.ts auto-seeds and parent-portal-actions.ts validates document UUID & writes signer_full_name + retention_status", () => {
  const consentsSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/consents.ts"), "utf8");
  assert.match(consentsSrc, /export function isValidUuid/);
  assert.match(consentsSrc, /onConflict:\s*"club_id,scope,version"/);
  assert.match(consentsSrc, /ignoreDuplicates:\s*true/);
  assert.match(consentsSrc, /signer_full_name/);
  assert.match(consentsSrc, /signer_name/);

  const parentActionsSrc = fs.readFileSync(
    path.join(process.cwd(), "src/actions/parent-portal-actions.ts"),
    "utf8"
  );
  assert.match(parentActionsSrc, /isValidUuid\(doc\?\.id\)/);
  assert.match(parentActionsSrc, /signer_full_name:/);
  assert.match(parentActionsSrc, /retention_status:\s*"active"/);
  assert.match(parentActionsSrc, /revalidatePath\("\/consents"\)/);
});
