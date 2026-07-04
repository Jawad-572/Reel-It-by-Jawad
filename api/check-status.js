// netlify/functions/check-status.js
//
// Polled every ~3s by the browser while a video is rendering.
// Reconstructs fal.ai's queue status/response URLs from the request id
// so we don't need to persist any state between calls.

const FAL_MODEL = process.env.FAL_MODEL || "fal-ai/kling-video/v1.6/standard/image-to-video";

exports.handler = async (event) => {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    return json(500, { status: "failed", message: "Server isn't configured with a FAL_KEY yet." });
  }

  const requestId = event.queryStringParameters && event.queryStringParameters.id;
  if (!requestId) {
    return json(400, { status: "failed", message: "Missing request id." });
  }

  try {
    const statusRes = await fetch(
      `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`,
      { headers: { Authorization: `Key ${FAL_KEY}` } }
    );

    if (!statusRes.ok) {
      return json(502, { status: "failed", message: "Lost the connection to the studio." });
    }

    const statusData = await statusRes.json();

    // fal.ai statuses: IN_QUEUE, IN_PROGRESS, COMPLETED
    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
        { headers: { Authorization: `Key ${FAL_KEY}` } }
      );
      const resultData = await resultRes.json();

      // Shape varies slightly by model — check fal.ai's docs for your
      // chosen model's exact response schema before going live.
      const videoUrl = resultData?.video?.url || resultData?.output?.video?.url;
      if (!videoUrl) {
        return json(200, { status: "failed", message: "The take rendered but no video came back." });
      }
      return json(200, { status: "completed", videoUrl });
    }

    if (statusData.status === "IN_QUEUE" || statusData.status === "IN_PROGRESS") {
      return json(200, { status: "processing" });
    }

    return json(200, { status: "failed", message: "The take didn't come out. Try a different photo." });

  } catch (err) {
    console.error(err);
    return json(500, { status: "failed", message: "Unexpected error checking the shoot." });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
