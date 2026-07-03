// netlify/functions/get-profile.js
//
// Called right after sign-in, and after each roll, to show accurate
// credits. Creates a profile row on first call as a safety net in
// case the DB trigger hasn't fired yet.

const { getAdminClient, getUserFromRequest } = require("./_supabase");

exports.handler = async (event) => {
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { message: "Not signed in." });

  const admin = getAdminClient();

  let { data: profile } = await admin
    .from("profiles")
    .select("rolls_used, rolls_limit, plan")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const { data: created } = await admin
      .from("profiles")
      .insert({ id: user.id, email: user.email })
      .select("rolls_used, rolls_limit, plan")
      .single();
    profile = created;
  }

  return json(200, {
    email: user.email,
    rollsUsed: profile.rolls_used,
    rollsLimit: profile.rolls_limit,
    plan: profile.plan,
    rollsLeft: Math.max(0, profile.rolls_limit - profile.rolls_used),
  });
};

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
