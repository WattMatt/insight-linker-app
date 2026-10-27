#!/usr/bin/env node
// mcp-fortress: stdio MCP server for Fortress site COC records and verdicts.
// Credentials come only from the environment (see README); nothing here prints them.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { makeTokenKit } from "./core.mjs";
import { connect } from "./connect.mjs";
import { createTools } from "./tools.mjs";

const store = await connect();
const tools = createTools(store, makeTokenKit());
const server = new McpServer({ name: "mcp-fortress", version: "0.1.0" });

const siteId = z.string().uuid().describe("sites.id of a Fortress_Fund site");
const source = {
  json: z.union([z.string(), z.record(z.any())]).optional().describe("verdicts.json content (object or text)"),
  json_path: z.string().optional().describe("path to a verdicts.json file, instead of json"),
};

const tool = (name, description, inputSchema, run, readOnly = true) =>
  server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: false } }, async (args) => {
    try {
      return { content: [{ type: "text", text: JSON.stringify(await run(args), null, 1) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
    }
  });

tool("list_sites", "List Fortress_Fund sites, optionally filtered by name.", { filter: z.string().optional() }, tools.list_sites);
tool("get_site", "One Fortress site with its COC row counts and import batches (June 2026 batches marked read-only).", { site_id: siteId }, tools.get_site);
tool("list_cocs", "COC certificate rows for a Fortress site (live rows unless include_superseded).", { site_id: siteId, include_superseded: z.boolean().optional() }, tools.list_cocs);
tool("get_verdicts", "Final and proposed verdicts for a Fortress site's live COC rows, with failed rules.", { site_id: siteId }, tools.get_verdicts);
tool("export_snapshot", "Write a JSON snapshot of the site's COC tables to data/snapshots/<date>/. Writes a local file only.", { site_id: siteId }, tools.export_snapshot);
tool("dry_run_replace_cocs", "Plan replacing a site's COC rows from a re-verification verdicts.json. Writes nothing. Returns the diff and a confirm token.", { site_id: siteId, ...source }, tools.dry_run_replace_cocs);
tool("replace_cocs", "Apply a dry-run plan: snapshot first, then insert PROPOSED rows (no final verdicts, no deletes) for that site only. Needs the confirm token from dry_run_replace_cocs for the same site and JSON.",
  { site_id: siteId, ...source, confirm_token: z.string() }, tools.replace_cocs, false);

await server.connect(new StdioServerTransport());
