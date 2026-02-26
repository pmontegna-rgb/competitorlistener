const { buildFeedPayload } = require("../src/api-core");

module.exports = async function handler(req, res) {
  if (req.method && req.method !== "GET") {
    res.statusCode = 405;
    return res.json({ ok: false, error: "Method not allowed" });
  }

  try {
    return res.status(200).json(buildFeedPayload(req.query || {}));
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "feed failed" });
  }
};
