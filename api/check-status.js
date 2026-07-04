const FAL_MODEL = process.env.FAL_MODEL || "fal-ai/kling-video/v1.6/standard/image-to-video";

module.exports = async (req, res) => {
  const FAL_KEY = process.env.FAL_KEY;
  if (!FAL_KEY) {
    return res.status(500).json({ status: "failed", message: "Server isn't configured with a FAL_KEY yet." });
  }

  const requestId = req.query.id;
  if (!requestId) {
    return res.status(400).json({ status: "failed", message: "Missing request id." });
  }

  try {
    const statusRes = await fetch(
      `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`,
      { headers: { Authorization: `Key ${FAL_KEY}` } }
    );

    if (!statusRes.ok) {
      return res.status(502).json({ status: "failed", message: "Lost the connection to the studio." });
    }

    const statusData = await statusRes.json();

    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(
        `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
        { headers: { Authorization: `Key ${FAL_KEY}` } }
      );
      const resultData = await resultRes.json();

      const videoUrl = resultData?.video?.url || resultData?.output?.video?.url;
      if (!videoUrl) {
        return res.status(200).json({ status: "failed", message: "The take rendered but no video came back." });
      }
      return res.status(200).json({ status: "completed", videoUrl });
    }

    if (statusData.status === "IN_QUEUE" || statusData.status === "IN_PROGRESS") {
      return res.status(200).json({ status: "processing" });
    }

    return res.status(200).json({ status: "failed", message: "The take didn't come out. Try a different photo." });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "failed", message: "Unexpected error checking the shoot." });
  }
};
