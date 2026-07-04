const { getAdminClient, getUserFromRequest } = require("../lib/supabase");

module.exports = async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ message: "Not signed in." });

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

  return res.status(200).json({
    email: user.email,
    rollsUsed: profile.rolls_used,
    rollsLimit: profile.rolls_limit,
    plan: profile.plan,
    rollsLeft: Math.max(0, profile.rolls_limit - profile.rolls_used),
  });
};
