const { runCollection, getStore, DATA_FILE, MIN_CONFIDENCE } = require("./collector");

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
      if (!blob.includes(String(query.search).toLowerCase())) return false;
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

function buildFeedPayload(query = {}) {
  const store = getStore();
  const filteredRaw = dedupe(filterItems(store, query).sort((a, b) => Date.parse(b.eventAt || 0) - Date.parse(a.eventAt || 0)));
  const filtered = canonicalizeFeedItems(filteredRaw);

  const groups = ["competitor", "partner"];
  const allEntities = Array.isArray(store.entities) ? store.entities : [];
  const entities = allEntities
    .filter((e) => !query.group || query.group === "all" || e.entityType === query.group)
    .map((e) => canonicalEntityName(e.name))
    .sort();

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    appliedFilters: {
      group: query.group || "all",
      entity: query.entity || "all",
      channel: query.channel || "all",
      announcement: query.announcement || "all",
      strategicOnly: query.strategicOnly || "false",
      start: query.start || "",
      end: query.end || "",
      search: query.search || ""
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
      strategic: filtered.filter((i) => ["partnership_agreement", "product_announcement", "business_announcement"].includes(i.announcementType)).length
    },
    items: filtered.slice(0, Number(query.limit || 500))
  };
}

function buildMetaPayload() {
  const store = getStore();
  const entityOptions = {
    competitor: (store.competitors || []).map((e) => canonicalEntityName(e.name)).sort(),
    partner: (store.partners || []).map((e) => canonicalEntityName(e.name)).sort(),
    all: (store.entities || []).map((e) => canonicalEntityName(e.name)).sort()
  };

  return {
    ok: true,
    dataFile: DATA_FILE,
    refreshHours: Number(process.env.REFRESH_HOURS || 4),
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
  };
}

function buildHistoryPayload(query = {}) {
  const store = getStore();
  const byUrl = store.snapshotHistory || {};
  const rows = [];
  Object.entries(byUrl).forEach(([url, versions]) => {
    (versions || []).forEach((v) => rows.push({ url, ...v }));
  });

  const filtered = rows
    .filter((r) => {
      if (query.entity && query.entity !== "all" && r.entity !== query.entity) return false;
      if (query.channel && query.channel !== "all" && r.channel !== query.channel) return false;
      if (query.url && r.url !== query.url) return false;
      return true;
    })
    .sort((a, b) => Date.parse(b.observedAt || 0) - Date.parse(a.observedAt || 0));

  return { ok: true, total: filtered.length, items: filtered.slice(0, Number(query.limit || 300)) };
}

module.exports = {
  runCollection,
  buildFeedPayload,
  buildMetaPayload,
  buildHistoryPayload
};
