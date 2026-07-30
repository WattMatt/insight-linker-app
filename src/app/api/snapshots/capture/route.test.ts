import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Row = Record<string, any>;

const { holder } = vi.hoisted(() => ({ holder: { client: null as any } }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => holder.client,
}));

import { GET } from "./route";

const byId = (a: Row, b: Row) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Stands in for PostgREST. A `.range()` without a preceding `.order()` gets an
 * UNSTABLE page: Postgres promises no cross-statement row order, so the second
 * page is served from a source shifted by one row — the shape a concurrent
 * update or autovacuum produces in production.
 */
function fakeSupabase(tables: Record<string, Row[]>) {
  const orderedBy: Record<string, string[]> = {};
  const served: Record<string, Row[]> = {};
  const upserted: { rows: Row[]; options?: Record<string, unknown> } = { rows: [] };

  const select = (table: string) => {
    let ordered = false;
    const builder = {
      order(column: string) {
        (orderedBy[table] ||= []).push(column);
        ordered = true;
        return builder;
      },
      range(from: number, to: number) {
        const all = tables[table] ?? [];
        const source = ordered
          ? [...all].sort(byId)
          : from === 0
            ? all
            : [...all.slice(1), ...all.slice(0, 1)];
        const page = source.slice(from, to + 1);
        (served[table] ||= []).push(...page);
        return Promise.resolve({ data: page, error: null });
      },
    };
    return builder;
  };

  return {
    client: {
      from: (table: string) => ({
        select: () => select(table),
        upsert: (rows: Row[], options?: Record<string, unknown>) => {
          upserted.rows = rows;
          upserted.options = options;
          return Promise.resolve({ error: null });
        },
      }),
    },
    orderedBy,
    served,
    upserted,
  };
}

const subsection = (i: number): Row => ({
  id: `sub-${String(i).padStart(4, "0")}`,
  site_id: "site-1",
  name: `Unit ${i}`,
  coc_status: "Valid",
  is_coc_required: true,
  is_thermal_required: false,
  is_inspection_required: false,
  metering_status: null,
  meter_serial_number: null,
});

const READ_TABLES = [
  "sites",
  "subsections",
  "snags",
  "inspections",
  "site_schematics",
  "site_assets",
  "site_documents",
  "subsection_documents",
];

function request() {
  return new Request("http://localhost/api/snapshots/capture", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

const envKeys = ["CRON_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const savedEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of envKeys) savedEnv[k] = process.env[k];
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

afterEach(() => {
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k]!;
  }
});

describe("snapshot capture — deterministic paging", () => {
  it("orders every table read by id", async () => {
    const fake = fakeSupabase({ sites: [{ id: "site-1", name: "Site One", client_id: "c1" }] });
    holder.client = fake.client;

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(Object.keys(fake.orderedBy).sort()).toEqual([...READ_TABLES].sort());
    for (const table of READ_TABLES) expect(fake.orderedBy[table]).toEqual(["id"]);
  });

  it("pages a >1000-row table without skipping or repeating a row", async () => {
    const subs = Array.from({ length: 1500 }, (_, i) => subsection(i));
    const fake = fakeSupabase({
      sites: [{ id: "site-1", name: "Site One", client_id: "c1" }],
      subsections: subs,
    });
    holder.client = fake.client;

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, captured: 1 });
    expect(fake.served.subsections).toHaveLength(1500);
    expect(new Set(fake.served.subsections.map((r) => r.id)).size).toBe(1500);
    expect(fake.upserted.rows[0]).toMatchObject({ site_id: "site-1", total_subsections: 1500 });
  });
});
