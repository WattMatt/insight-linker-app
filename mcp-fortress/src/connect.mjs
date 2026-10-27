// stdio server only: signs in as the dedicated staff user from the environment and returns a Store
// that writes snapshots and the write log to local files. Credentials are never printed.
import { createClient } from "@supabase/supabase-js";
import { fileSinks, storeFor } from "./store.mjs";

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing environment variable ${name}`);
  return v;
}

export async function connect() {
  const sb = createClient(required("SUPABASE_URL"), required("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await sb.auth.signInWithPassword({
    email: required("FORTRESS_MCP_EMAIL"), password: required("FORTRESS_MCP_PASSWORD"),
  });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return storeFor(sb, data.user, new URL(process.env.SUPABASE_URL).host, fileSinks());
}
