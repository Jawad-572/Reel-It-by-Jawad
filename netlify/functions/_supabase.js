// api/_supabase.js
//
// Two clients, two jobs:
//  - anonClient: only used to verify the user's access token
//  - adminClient: uses the service role key, bypasses RLS, is the
//    only thing allowed to read/write credit balances
//
// Env vars required (set in Netlify dashboard):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   <- keep this one secret, server-only

const { createClient } = require("@supabase/supabase-js");

function getAdminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Verifies the bearer token sent from the browser and returns the user,
// or null if the token is missing/invalid.
async function getUserFromRequest(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

module.exports = { getAdminClient, getUserFromRequest };
