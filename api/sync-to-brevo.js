// api/sync-to-brevo.js
//
// Triggered by a Supabase Database Webhook every time a new row is
// inserted into `profiles` (i.e. every new signup). Pushes the email
// into a Brevo contact list so it's ready for a promo campaign —
// no manual export needed.
//
// Env vars required (Vercel dashboard):
//   BREVO_API_KEY   — from Brevo → Settings → SMTP & API → API Keys
//   BREVO_LIST_ID    — the numeric id of the list to add contacts to
//   WEBHOOK_SECRET   — must match the header value in the Supabase webhook

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Only Supabase should be able to call this — check the shared secret.
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const BREVO_LIST_ID = process.env.BREVO_LIST_ID;
  if (!BREVO_API_KEY || !BREVO_LIST_ID) {
    console.error("Missing BREVO_API_KEY or BREVO_LIST_ID");
    return res.status(500).json({ message: "Server not configured." });
  }

  const { record } = req.body;
  const email = record?.email;
  if (!email) {
    return res.status(200).json({ message: "No email on this row — nothing to sync." });
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        listIds: [Number(BREVO_LIST_ID)],
        updateEnabled: true,
      }),
    });

    if (!response.ok && response.status !== 204) {
      const errText = await response.text();
      console.error("Brevo sync failed:", response.status, errText);
      return res.status(502).json({ message: "Brevo rejected the contact." });
    }

    return res.status(200).json({ message: "Synced." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unexpected error syncing to Brevo." });
  }
}
