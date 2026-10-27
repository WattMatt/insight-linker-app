# mcp-fortress

A local **stdio MCP server** that lets Claude read and update **Fortress_Fund** site COC records and
verdicts in Insight Linker (WM Compliance) without a browser.

- **Scope:** COC certificate rows (`coc_certificates`) and their verdicts, for sites of the
  `Fortress_Fund` client only. Every site-scoped call checks the site's client first.
- **Out of scope:** asset registers, other clients, Building Ops data.
- **June 2026 import batches are read-only.** They show up in reads, but this server never updates
  or supersedes their rows.

## Remote server (claude.ai custom connector)

The same tools (plus seven more) are served over Streamable HTTP at
`https://watsonmattheus.com/api/mcp`, with OAuth 2.1 (DCR, PKCE S256, client ID metadata documents).
Code: `src/lib/mcp/` and the routes under `src/app/{api/mcp,oauth,.well-known}`. The remote server
reuses `src/core.mjs`, `src/tools.mjs` and `src/store.mjs` (the store takes an injected Supabase
client that acts as the signed-in staff user; snapshots and the write log go to the
`mcp_fortress_snapshots` / `mcp_audit_log` tables instead of local files). `json_path` is refused
remotely. Migration: `supabase/migrations/20261027140000_mcp_remote_oauth.sql`.

## How writes work

`replace_cocs` follows the app's re-verification model (migration `20261023120000`). It reuses the
app's planner, `src/lib/siteCoc/reverification.ts`, so this server and the import scripts can't drift
apart.

- **What it writes:**
  - New records are inserted as `review_status = 'proposed'` with `verdict = NULL`. It never sets a
    final verdict and never signs anything off.
  - Earlier re-verification rows (rows with a `record_key`) are updated when the source changed.
  - Earlier re-verification rows the source no longer contains are marked superseded.
- **What it leaves alone:**
  - Legacy workbook rows. New rows list them in `supersedes_ids`, and they are only superseded when an
    Admin signs off in the app (`sign_off_coc_certificate`).
  - Signed-off rows, which a database trigger already protects.
  - June 2026 rows.
- **No deletes.**
- **One transaction.** All writes go through one database function,
  [`sql/fortress_replace_cocs.sql`](sql/fortress_replace_cocs.sql). It runs with the caller's own
  permissions and re-checks the rules above inside the transaction. It then verifies the row counts,
  and if any count is off it rolls the whole write back.
- **Confirm token.** `dry_run_replace_cocs` returns a token tied to the site, the exact JSON, and the
  exact plan (which reflects the site's rows at that moment). It is valid for 15 minutes and works
  once. `replace_cocs` refuses it for any other site or JSON, or if the site's rows have changed since
  the dry run.
- **Snapshot and log.** Before writing, `replace_cocs` takes a snapshot of the site's COC tables. Every
  write attempt, successful or failed, is appended to `<data dir>/logs/writes.jsonl` with the
  timestamp, host, user, site, planned and written row counts, and the snapshot path.

## Tools

| Tool | Writes? | What it does |
|---|---|---|
| `list_sites(filter?)` | no | Fortress_Fund sites, optionally filtered by name |
| `get_site(site_id)` | no | Site, COC row counts (live, final, proposed, superseded, signed off, legacy, June 2026), import batches |
| `list_cocs(site_id, include_superseded?)` | no | COC certificate rows (live rows by default) |
| `get_verdicts(site_id)` | no | Final and proposed verdict per live row, with failed rules, flags and caveats, plus tallies |
| `export_snapshot(site_id)` | local file only | JSON of the site's `coc_certificates`, `coc_import_batches` and `coc_db_schedule`, written to `<data dir>/snapshots/<yyyy-mm-dd>/` |
| `dry_run_replace_cocs(site_id, json \| json_path)` | **nothing** | Diff counts, sample record lists, stop conditions, confirm token |
| `replace_cocs(site_id, json \| json_path, confirm_token)` | proposed rows for that site | Snapshot, then one transaction through `fortress_replace_cocs` |

`json` is a re-verification `verdicts.json` (`{ site, policy, docs: [...] }`), either as an object or as
text. `json_path` reads the file directly, which is easier for large packs (Mayville is about 120
records).

## Credentials

Credentials are read only from environment variables, which come from an env file. They are never
hard-coded, never printed, and never written into Claude's config. See
[`.env.example`](.env.example):

| Variable | |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Project URL and anon/publishable key, the same values the web app uses |
| `FORTRESS_MCP_EMAIL`, `FORTRESS_MCP_PASSWORD` | A **dedicated staff user** (role `User`, not Client or Contractor). Normal access rules apply. No service-role key. |
| `FORTRESS_MCP_DATA_DIR` | Snapshot and log folder, default `./data` (git-ignored) |
| `FORTRESS_CLIENT_NAME` | Default `Fortress_Fund` |
| `FORTRESS_MCP_TOKEN_SECRET` | Optional. If unset, a random secret is used per process, so tokens die when the server restarts. |

## Register with Claude Code

```bash
cd mcp-fortress && npm install
```

Local dev copy:

```bash
claude mcp add fortress-dev --scope user -- node --env-file=/Users/spud/Documents/DEVELOPER/APPS/insight-linker-app/mcp-fortress/.env.dev --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /Users/spud/Documents/DEVELOPER/APPS/insight-linker-app/mcp-fortress/src/server.mjs
```

Production, only after the go-live steps below:

```bash
claude mcp add fortress --scope user -- node --env-file=/Users/spud/Documents/DEVELOPER/APPS/insight-linker-app/mcp-fortress/.env --disable-warning=MODULE_TYPELESS_PACKAGE_JSON /Users/spud/Documents/DEVELOPER/APPS/insight-linker-app/mcp-fortress/src/server.mjs
```

`--env-file` keeps the credentials in the git-ignored file instead of `~/.claude.json`. The
`--disable-warning` flag only silences Node's notice about loading the app's `.ts` planner.

## Production go-live (NOT done)

1. Create the dedicated staff user in prod and give it the `User` role.
2. Apply [`sql/fortress_replace_cocs.sql`](sql/fortress_replace_cocs.sql) to prod through the
   Management API, then record it with `supabase migration repair`. Never `db push`: prod's migration
   history has diverged. The read tools work without this; `replace_cocs` needs it.
3. Fill in `.env` and register the `fortress` server.
4. Run `dry_run_replace_cocs` against prod and review the diff before any `replace_cocs`.

## Dev copy (how it was tested)

There is no staging project. The local copy is a slimmed-down Supabase stack (database, auth and REST)
on ports **57421** (API) and **57422** (database), in [`dev/supabase`](dev/supabase). It does not use
the app's migration history:

- **Schema:** [`dev/gen-schema.mjs`](dev/gen-schema.mjs) builds it from a **read-only** export of
  prod's live definitions ([`dev/export-ddl.sql`](dev/export-ddl.sql)). Four objects that refer to
  things outside this subset were skipped and are listed on stderr: two links to `auth.users`, and the
  two client-only read rules that call `get_user_visible_site_ids`. They don't affect a staff user.
- **Data:** [`dev/export-sites.sql`](dev/export-sites.sql) is a **read-only** export of Yarona Centre,
  Mayville Mall and Thembi Mall: 261 certificate rows, 9 import batches, 95 schedule rows, linked shops
  and documents, plus the 33 Fortress site rows. [`dev/load-seed.sh`](dev/load-seed.sh) loads it and
  refuses any non-local database. The export file holds real records, so keep it outside the repo.
- **User:** a local staff user `mcp-fortress@dev.local.test`. Its credentials are in the git-ignored
  `.env.dev`.

```bash
cd mcp-fortress/dev && supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor
```

```bash
cd mcp-fortress && npm test
```

```bash
cd mcp-fortress && node --env-file=.env.dev --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/dev-dry-runs.mjs
```

```bash
cd mcp-fortress && node --env-file=.env.dev test/stdio-smoke.mjs
```

## Test output (2026-10-27, local dev copy seeded from prod export)

Unit tests (`npm test`): **5/5 pass**. They cover the token (accepted only for the same site, data and
plan; rejected when expired, forged, malformed or from another process), the June 2026 rule, and
stable hashing.

Dry runs with the October 2026 strict re-verification packs from
`(647) FORTRESS - ASSET AUDITS/10. Re-verification 2026-10 (strict)/<SITE>/verdicts.json`:

| Site | Records | Scored (P/F/R) | Adds | Updates | Unchanged | Superseded now | Blocked | Legacy left live | June rows linked |
|---|---|---|---|---|---|---|---|---|---|
| Yarona Centre | 45 | 31 (0/26/5) | 0 | 0 | 31 | 0 | 0 | 22 | 0 |
| Mayville Mall | 121 | 75 (1/72/2) | 0 | 0 | 75 | 0 | 0 | 76 | 0 |
| Thembi Mall | 34 | 31 (1/29/1) | **2** | **2** | 27 | 0 | 0 | 26 | 0 |

Each dry run left the row count unchanged (53, 151 and 57 rows).

**Thembi difference (unexplained):** prod imported `doc017` (Jet COC, NM 1488984) and `doc019` (Liquor
City COC, ECA 260388) as *copies* folded into `doc016` and `doc013`, because each pair shares a
certificate number. In the `verdicts.json` on disk (modified 2026-10-23 09:22, before the 2026-10-26
import), all four are separate records with `copy_of: null`. So prod was loaded from different input
than this file. Which input it was has not been checked; `_packs/THEMBI_MALL_pack.zip` was not opened.
A replace from this file would add the two as their own proposed rows and clear the `copies` on
`doc013` and `doc016`.

End-to-end checks: full output in [`test/dev-dry-runs.output.txt`](test/dev-dry-runs.output.txt) and
[`test/stdio-smoke.output.txt`](test/stdio-smoke.output.txt). All pass:

- Read tools: `list_sites` (33 sites), `get_site`, `list_cocs` (53 live / 53 total for Yarona),
  `get_verdicts`, and `export_snapshot` (file written, row count matches).
- Refusals: a site outside Fortress, a token used for another site, a token used with different JSON,
  a forged token, and a reused token.
- `replace_cocs` on the **local** copy, with one Thembi record deliberately changed:
  - The snapshot was written first.
  - The write was logged with the snapshot path.
  - The row was written as proposed with no final verdict.
  - A fresh dry run afterwards showed nothing left to write.
  - Mayville's 76 June 2026 rows were untouched.
- Stdio server: 7 tools listed, a site outside Fortress refused, empty stderr, and no credential values
  in any output.

The local copy was re-seeded from the export after these write tests, so it matches prod again.
