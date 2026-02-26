const { runCollection } = require("../src/api-core");

module.exports = async function handler(req, res) {
  const configured = process.env.CRON_SECRET || "";
  const received = req.headers["x-cron-secret"] || req.query?.secret || "";
  if (configured && configured !== received) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const summary = await runCollection();
    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "cron failed" });
  }
};
