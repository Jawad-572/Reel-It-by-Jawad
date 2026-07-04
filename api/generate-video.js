const { getAdminClient, getUserFromRequest } = require("../lib/supabase");

const FAL_MODEL = process.env.FAL_MODEL || "fal-ai/kling-video/v1.6/standard/image-to-video";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    return res.status(500).json({ message: "Server isn't configured with a FAL_KEY yet." });
  }

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ message: "Sign in to start rolling." });

  const admin = getAdminClient();
  let { data: profile } = await admin
    .from("profiles")
    .select("rolls_used, rolls_limit")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const { data: created } = await admin
      .from("profiles")
      .insert({ id: user.id, email: user.email })
      .select("rolls_used, rolls_limit")
      .single();
    profile = created;
  }

  if (profile.rolls_used >= profile.rolls_limit) {
    return res.status(402).json({ message: "Out of rolls. Upgrade to keep shooting." });
  }

  const { image, direction, scene, lengthSeconds } = req.body;
  if (!image) {
    return res.status(400).json({ message: "No photo received." });
  }

  const scenePrompts = {
    studio: "clean studio product shot, soft even lighting, seamless backdrop",
    lifestyle: "in-use lifestyle setting, natural light, everyday context",
    unboxing: "hands unboxing the product, tabletop, warm indoor light",
    macro: "extreme close-up macro detail shot, shallow depth of field",
  };

  const prompt = [
    scenePrompts[scene] || scenePrompts.studio,
    direction || "gentle camera movement, subtle product highlight",
  ].join(", ");

  try {
    const submitRes = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: image,
        prompt,
        duration: String(lengthSeconds || "5"),
      }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      console.error("fal.ai submit failed:", submitRes.status, errText);
      return res.status(502).json({ message: "The studio's camera didn't respond. Try again shortly." });
    }

    const data = await submitRes.json();

    const { data: updated } = await admin
      .from("profiles")
      .update({ rolls_used: profile.rolls_used + 1 })
      .eq("id", user.id)
      .select("rolls_used, rolls_limit")
      .single();

    return res.status(200).json({
      requestId: data.request_id,
      statusUrl: data.status_url,
      responseUrl: data.response_url,
      rollsLeft: Math.max(0, (updated?.rolls_limit ?? profile.rolls_limit) - (updated?.rolls_used ?? profile.rolls_used + 1)),
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Unexpected error starting the shoot." });
  }
};
