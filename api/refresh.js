const { runCollection } = require("../src/api-core");

module.exports = async function handler(req, res) {
  if (req.method && req.method !== "POST") {
    res.statusCode = 405;
    return res.json({ ok: false, error: "Method not allowed" });
  }

  try {
    const summary = await runCollection();
    return res.status(200).json({ ok: true, summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "refresh failed" });
  }
};
