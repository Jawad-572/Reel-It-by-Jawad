// netlify/functions/generate-video.js
//
// Receives the product photo + direction from the browser, submits a
// job to fal.ai's queue API, and returns a request id for polling.
// The FAL_KEY never leaves this server-side function.
//
// Env var required (set in Netlify dashboard, not in code):
//   FAL_KEY = your fal.ai API key
//
// Optional env var to swap models without touching code:
//   FAL_MODEL = e.g. "fal-ai/kling-video/v1.6/standard/image-to-video"
// Cheaper models (Kling standard, Wan) keep cost near $0.05-0.10/sec.
// Check fal.ai's model page for the current path + required params
// before going live — these change as providers ship new versions.

const { getAdminClient, getUserFromRequest } = require("./_supabase");

const FAL_MODEL = process.env.FAL_MODEL || "fal-ai/kling-video/v1.6/standard/image-to-video";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    return json(500, { message: "Server isn't configured with a FAL_KEY yet." });
  }

  // ---- auth + credit check happen before we spend any fal.ai money ----
  const user = await getUserFromRequest(event);
  if (!user) return json(401, { message: "Sign in to start rolling." });

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
    return json(402, { message: "Out of rolls. Upgrade to keep shooting." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return json(400, { message: "Bad request." });
  }

  const { image, direction, scene, lengthSeconds } = payload;
  if (!image) {
    return json(400, { message: "No photo received." });
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
    // fal.ai's queue endpoint: submit now, poll separately.
    // `image_url` accepts a data: URI directly for most fal models —
    // for higher-volume production, upload to fal storage first
    // (https://fal.ai/docs/storage) and pass that URL instead, since
    // large base64 payloads are slower to submit.
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
      return json(502, { message: "The studio's camera didn't respond. Try again shortly." });
    }

    const data = await submitRes.json();

    // Consume the roll now — same logic as real film: you pay for the
    // take when you shoot it, not only when it comes out well.
    const { data: updated } = await admin
      .from("profiles")
      .update({ rolls_used: profile.rolls_used + 1 })
      .eq("id", user.id)
      .select("rolls_used, rolls_limit")
      .single();

    // fal.ai returns { request_id, status_url, response_url, ... }
    return json(200, {
      requestId: data.request_id,
      statusUrl: data.status_url,
      responseUrl: data.response_url,
      rollsLeft: Math.max(0, (updated?.rolls_limit ?? profile.rolls_limit) - (updated?.rolls_used ?? profile.rolls_used + 1)),
    });

  } catch (err) {
    console.error(err);
    return json(500, { message: "Unexpected error starting the shoot." });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

