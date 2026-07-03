// netlify/functions/sync-to-brevo.js
//
// Triggered by a Supabase Database Webhook every time a new row is
// inserted into `profiles` (i.e. every new signup). Pushes the email
// into a Brevo contact list so it's ready for a promo campaign —
// no manual export needed.
//
// Env vars required (Netlify dashboard):
//   BREVO_API_KEY   — from Brevo → Settings → SMTP & API → API Keys
//   BREVO_LIST_ID    — the numeric id of the list to add contacts to
//                      (Brevo → Contacts → Lists → click a list → id is in the URL)
//   WEBHOOK_SECRET   — any random string you make up; must match the
//                      header value you set in the Supabase webhook config

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Only Supabase should be able to call this — check the shared secret.
  const secret = event.headers["x-webhook-secret"] || event.headers["X-Webhook-Secret"];
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const BREVO_LIST_ID = process.env.BREVO_LIST_ID;
  if (!BREVO_API_KEY || !BREVO_LIST_ID) {
    console.error("Missing BREVO_API_KEY or BREVO_LIST_ID");
    return { statusCode: 500, body: "Server not configured." };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Bad request." };
  }

  // Supabase Database Webhooks send { type, table, record, old_record }
  const email = payload?.record?.email;
  if (!email) {
    return { statusCode: 200, body: "No email on this row — nothing to sync." };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
