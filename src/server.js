const http = require("http");
const fs = require("fs");
const path = require("path");

function loadDotEnvFile() {
  const dotenvPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(dotenvPath)) return;
  const raw = fs.readFileSync(dotenvPath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnvFile();

const { runCollection, getStore, DATA_FILE, MIN_CONFIDENCE } = require("./collector");

const PORT = Number(process.env.PORT || 8787);
const REFRESH_HOURS = Number(process.env.REFRESH_HOURS || 4);
const PUBLIC_DIR = path.join(process.cwd(), "public");

let activeRun = null;

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  res.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(res);
}

function parseUrl(reqUrl) {
  const u = new URL(reqUrl, "http://localhost");
  return { pathname: u.pathname, query: Object.fromEntries(u.searchParams.entries()) };
}

function asDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function canonicalEntityName(name) {
  if (name === "Popmen") return "Popmenu";
  return name;
}

function toLegacyEntityNames(name) {
  if (name === "Popmenu") return new Set(["Popmenu", "Popmen"]);
  return new Set([name]);
}

function filterItems(store, query) {
  const start = asDate(query.start);
  const end = asDate(query.end);

  return (store.items || []).filter((item) => {
    if (item.schemaVersion !== 2) return false;
    if (!item.isConfirmed) return false;
    if ((item.confidence || 0) < MIN_CONFIDENCE) return false;

    const ts = asDate(item.eventAt) || asDate(item.collectedAt);
    if (!ts) return false;
    if (start && ts < start) return false;
    if (end && ts > new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1)) return false;

    if (query.group && query.group !== "all" && item.entityType !== query.group) return false;
    if (query.entity && query.entity !== "all") {
      const allowed = toLegacyEntityNames(query.entity);
      if (!allowed.has(item.entity)) return false;
    }
    if (query.channel && query.channel !== "all" && item.channel !== query.channel) return false;
    if (query.announcement && query.announcement !== "all" && item.announcementType !== query.announcement) return false;
    if (query.strategicOnly === "true") {
      const strategic = new Set(["partnership_agreement", "product_announcement", "business_announcement"]);
      if (!strategic.has(item.announcementType)) return false;
    }

    if (query.search) {
      const blob = `${item.title} ${item.summary} ${item.entity}`.toLowerCase();
      if (!blob.includes(query.search.toLowerCase())) return false;
    }

    return true;
  });
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => {
    const sig = i.signature || `${i.entity}|${i.channel}|${i.title}|${i.url}|${i.eventAt}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

function canonicalizeFeedItems(items) {
  return items.map((item) => ({ ...item, entity: canonicalEntityName(item.entity) }));
}

async function ensureCollection(reason) {
  if (activeRun) return activeRun;

  activeRun = runCollection()
    .then((summary) => {
      console.log(`[collector] ${reason} finished`, summary);
      return summary;
    })
    .finally(() => {
      activeRun = null;
    });

  return activeRun;
}

function scheduleCollection() {
  const everyMs = REFRESH_HOURS * 60 * 60 * 1000;
  setInterval(() => {
    ensureCollection("scheduled").catch(() => {});
  }, everyMs);
}

async function handleApi(req, res, parsed) {
  if (parsed.pathname === "/api/refresh" && req.method === "POST") {
    try {
      const summary = await ensureCollection("manual");
      return sendJson(res, 200, { ok: true, summary });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message || "refresh failed" });
    }
  }

  if (parsed.pathname === "/api/feed" && req.method === "GET") {
    const store = getStore();
    const filteredRaw = dedupe(
      filterItems(store, parsed.query).sort((a, b) => Date.parse(b.eventAt || 0) - Date.parse(a.eventAt || 0))
    );
    const filtered = canonicalizeFeedItems(filteredRaw);

    const groups = ["competitor", "partner"];
    const allEntities = Array.isArray(store.entities) ? store.entities : [];
    const entities = allEntities
      .filter((e) => !parsed.query.group || parsed.query.group === "all" || e.entityType === parsed.query.group)
      .map((e) => canonicalEntityName(e.name))
      .sort();

    return sendJson(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      appliedFilters: {
        group: parsed.query.group || "all",
        entity: parsed.query.entity || "all",
        channel: parsed.query.channel || "all",
        announcement: parsed.query.announcement || "all",
        strategicOnly: parsed.query.strategicOnly || "false",
        start: parsed.query.start || "",
        end: parsed.query.end || "",
        search: parsed.query.search || ""
      },
      minConfidence: MIN_CONFIDENCE,
      meta: store.meta,
      groups,
      announcements: [
        "product_announcement",
        "business_announcement",
        "partnership_agreement",
        "pricing_update",
        "leadership_hiring",
        "press_coverage",
        "general_update"
      ],
      entities,
      counts: {
        filtered: filtered.length,
        competitor: filtered.filter((i) => i.entityType === "competitor").length,
        partner: filtered.filter((i) => i.entityType === "partner").length,
        rss: filtered.filter((i) => i.channel === "rss").length,
        web: filtered.filter((i) => i.channel === "web").length,
        linkedin: filtered.filter((i) => i.channel === "linkedin").length,
        strategic: filtered.filter((i) =>
          ["partnership_agreement", "product_announcement", "business_announcement"].includes(i.announcementType)
        ).length
      },
      items: filtered.slice(0, Number(parsed.query.limit || 500))
    });
  }

  if (parsed.pathname === "/api/meta" && req.method === "GET") {
    const store = getStore();
    const entityOptions = {
      competitor: (store.competitors || []).map((e) => e.name).sort(),
      partner: (store.partners || []).map((e) => e.name).sort(),
      all: (store.entities || []).map((e) => e.name).sort()
    };
    return sendJson(res, 200, {
      ok: true,
      dataFile: DATA_FILE,
      refreshHours: REFRESH_HOURS,
      minConfidence: MIN_CONFIDENCE,
      meta: store.meta,
      entityOptions,
      totals: {
        items: (store.items || []).length,
        competitors: (store.competitors || []).length,
        partners: (store.partners || []).length,
        historySources: Object.keys(store.snapshotHistory || {}).length,
        observations: (store.observations || []).length
      }
    });
  }

  if (parsed.pathname === "/api/history" && req.method === "GET") {
    const store = getStore();
    const byUrl = store.snapshotHistory || {};
    const rows = [];
    Object.entries(byUrl).forEach(([url, versions]) => {
      (versions || []).forEach((v) => rows.push({ url, ...v }));
    });

    const filtered = rows
      .filter((r) => {
        if (parsed.query.entity && parsed.query.entity !== "all" && r.entity !== parsed.query.entity) return false;
        if (parsed.query.channel && parsed.query.channel !== "all" && r.channel !== parsed.query.channel) return false;
        if (parsed.query.url && r.url !== parsed.query.url) return false;
        return true;
      })
      .sort((a, b) => Date.parse(b.observedAt || 0) - Date.parse(a.observedAt || 0));

    return sendJson(res, 200, {
      ok: true,
      total: filtered.length,
      items: filtered.slice(0, Number(parsed.query.limit || 300))
    });
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

function handleStatic(req, res, parsed) {
  let target = parsed.pathname;
  if (target === "/") target = "/index.html";

  const safeTarget = path.normalize(target).replace(/^\.\.(\/|\\|$)+/, "");
  const filePath = path.join(PUBLIC_DIR, safeTarget);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  serveFile(res, filePath);
}

async function bootstrap() {
  if (process.argv.includes("--collect-once")) {
    const summary = await runCollection();
    console.log("Collection complete", summary);
    process.exit(0);
  }

  ensureCollection("startup").catch(() => {});
  scheduleCollection();

  const server = http.createServer((req, res) => {
    const parsed = parseUrl(req.url || "/");
    if (parsed.pathname.startsWith("/api/")) return handleApi(req, res, parsed);
    return handleStatic(req, res, parsed);
  });

  server.listen(PORT, () => {
    console.log(`Competitor News server running on http://localhost:${PORT}`);
    console.log(`Refresh cadence: every ${REFRESH_HOURS} hours`);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
