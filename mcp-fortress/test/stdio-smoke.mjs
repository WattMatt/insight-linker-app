#!/usr/bin/env node
// Starts src/server.mjs over stdio exactly as Claude Code would, lists the tools, calls list_sites and
// get_site, and checks no credential value appears in anything the server returned or logged.
//   node --env-file=.env.dev test/stdio-smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const env = { ...process.env };
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", new URL("../src/server.mjs", import.meta.url).pathname],
  env, stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", d => { stderr += d; });
const client = new Client({ name: "smoke", version: "0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(`tools: ${tools.map(t => t.name).join(", ")}`);
const sites = await client.callTool({ name: "list_sites", arguments: { filter: "thembi" } });
console.log(`list_sites(thembi): ${sites.content[0].text.replace(/\s+/g, " ").slice(0, 200)}`);
const bad = await client.callTool({ name: "get_site", arguments: { site_id: "00000000-0000-4000-8000-000000000000" } });
console.log(`get_site(non-Fortress): isError=${bad.isError} — ${bad.content[0].text}`);
await client.close();

const everything = JSON.stringify({ tools, sites, bad }) + stderr;
const leaked = ["FORTRESS_MCP_PASSWORD", "SUPABASE_ANON_KEY"].filter(k => env[k] && everything.includes(env[k]));
console.log(leaked.length ? `FAIL: output contains ${leaked.join(", ")}` : "PASS: no credential values in tool output or stderr");
console.log(`stderr: ${stderr.trim() || "(empty)"}`);
process.exit(leaked.length || tools.length !== 7 || !bad.isError ? 1 : 0);
