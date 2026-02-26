const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { competitors, partners, entities, linkedinSearchRss, pressSearchRss } = require("./sources");

const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), "data", "store.json");
const MAX_ITEMS = Number(process.env.MAX_ITEMS || 3000);
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE || 0.8);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);
const MAX_HISTORY_PER_SOURCE = Number(process.env.MAX_HISTORY_PER_SOURCE || 80);
const MAX_OBSERVATIONS = Number(process.env.MAX_OBSERVATIONS || 12000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const AI_NOTES_MODE = (process.env.AI_NOTES_MODE || "rules").toLowerCase(); // rules|openai
const MAX_AI_NOTES_PER_RUN = Number(process.env.MAX_AI_NOTES_PER_RUN || 25);

function nowIso() {
  return new Date().toISOString();
}

function sha1(input) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function normalizeUrl(url) {
  const raw = (url || "").trim().replace(/#.*$/, "");
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach((k) => {
      parsed.searchParams.delete(k);
    });
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return raw;
  }
}

function cleanHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTag(text, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = (text || "").match(re);
  return m ? cleanHtml(m[1]) : "";
}

function parseMetaTag(html, attr, value) {
  const p1 = new RegExp(`<meta[^>]*${attr}=["']${value}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const p2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${value}["'][^>]*>`, "i");
  const m = (html || "").match(p1) || (html || "").match(p2);
  return m ? cleanHtml(m[1]) : "";
}

function parseItemsFromXml(xml) {
  const chunks = [...(xml.match(/<item[\s\S]*?<\/item>/gi) || []), ...(xml.match(/<entry[\s\S]*?<\/entry>/gi) || [])];
  return chunks.map((raw) => {
    const title = parseTag(raw, "title");
    const description = parseTag(raw, "description") || parseTag(raw, "summary") || parseTag(raw, "content");
    const pubDate = parseTag(raw, "pubDate") || parseTag(raw, "updated") || parseTag(raw, "published");
    let link = parseTag(raw, "link");
    if (!link) {
      const href = raw.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      link = href ? href[1] : "";
    }
    return { title, description, pubDate, link: normalizeUrl(link) };
  });
}

function extractArticleSnippet(html) {
  const ogDesc = parseMetaTag(html, "property", "og:description") || parseMetaTag(html, "name", "description");
  const title = parseTag(html, "title");
  const body = cleanHtml(html).slice(0, 900);
  return {
    title: ogDesc ? title : title,
    summary: ogDesc || body
  };
}

function safeDate(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toISOString();
}

async function safeFetch(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SpotOn-News-Monitor/2.0" }
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, status: res.status, text: "" };
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: "" };
  }
}

function ensureStore() {
  const base = {
    meta: {
      createdAt: nowIso(),
      runCount: 0,
      lastRunAt: null,
      lastRunStatus: "never",
      lastRunSummary: null
    },
    competitors,
    partners,
    entities,
    snapshots: {},
    snapshotHistory: {},
    observations: [],
    aiNotesCache: {},
    items: []
  };

  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(base, null, 2));
    return base;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      ...base,
      ...parsed,
      meta: { ...base.meta, ...(parsed.meta || {}) },
      snapshots: parsed.snapshots || {},
      snapshotHistory: parsed.snapshotHistory || {},
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      aiNotesCache: parsed.aiNotesCache || {},
      items: Array.isArray(parsed.items) ? parsed.items : [],
      competitors: base.competitors,
      partners: base.partners,
      entities: base.entities
    };
  } catch {
    return base;
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function entityLabel(entityType) {
  return entityType === "partner" ? "Partner" : "POS";
}

function normalizeTextKey(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableSignature(item) {
  return sha1(
    [
      item.schemaVersion,
      item.channel,
      item.entityType,
      item.entity,
      item.announcementType || "",
      normalizeTextKey(item.title).slice(0, 140),
      normalizeTextKey(item.summary).slice(0, 220),
      normalizeUrl(item.url)
    ].join("|")
  );
}

function recordSourceVersion(store, sourceUrl, version) {
  const url = normalizeUrl(sourceUrl);
  if (!url) return;
  if (!store.snapshotHistory[url]) store.snapshotHistory[url] = [];
  const history = store.snapshotHistory[url];
  const last = history[history.length - 1];
  if (last && last.digest === version.digest) return;
  history.push(version);
  if (history.length > MAX_HISTORY_PER_SOURCE) {
    store.snapshotHistory[url] = history.slice(history.length - MAX_HISTORY_PER_SOURCE);
  }
}

function recordObservation(store, item) {
  store.observations.unshift({
    observedAt: nowIso(),
    entity: item.entity,
    entityType: item.entityType,
    channel: item.channel,
    sourceType: item.sourceType,
    announcementType: item.announcementType,
    confidence: item.confidence,
    eventAt: item.eventAt,
    url: item.url,
    title: item.title,
    signature: item.signature || stableSignature(item)
  });
  if (store.observations.length > MAX_OBSERVATIONS) {
    store.observations = store.observations.slice(0, MAX_OBSERVATIONS);
  }
}

function defaultAnalystNote(item) {
  const baseType = item.announcementType || "general_update";
  const happenedByType = {
    partnership_agreement: `${item.entity} appears to have a partnership/integration development.`,
    product_announcement: `${item.entity} appears to have a product or feature announcement.`,
    business_announcement: `${item.entity} appears to have a business/corporate announcement.`,
    pricing_update: `${item.entity} appears to have a pricing or packaging update.`,
    leadership_hiring: `${item.entity} appears to have a leadership or hiring update.`,
    press_coverage: `${item.entity} received press/publication coverage for a notable update.`,
    general_update: `${item.entity} has a confirmed update from a monitored source.`
  };

  return {
    whatHappened: happenedByType[baseType] || happenedByType.general_update,
    whyItMatters:
      item.entityType === "competitor"
        ? "This may affect competitive positioning, product parity, or go-to-market pressure."
        : "This may affect ecosystem leverage, integration value, or partner-driven distribution.",
    whatToWatch: "Watch for follow-on announcements, customer references, pricing movement, and integration depth.",
    source: "rules",
    generatedAt: nowIso()
  };
}

function extractResponseText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();

  const out = Array.isArray(payload.output) ? payload.output : [];
  const textParts = [];
  for (const item of out) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const c of content) {
      if (typeof c.text === "string") textParts.push(c.text);
    }
  }
  return textParts.join("\n").trim();
}

function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

async function generateOpenAiAnalystNote(item) {
  const prompt = [
    "You are an executive market analyst.",
    "Return strict JSON with keys: whatHappened, whyItMatters, whatToWatch.",
    "Each value must be one concise sentence (max 24 words).",
    "Do not use markdown.",
    `Entity: ${item.entity}`,
    `EntityType: ${item.entityType}`,
    `Channel: ${item.channel}`,
    `SourceType: ${item.sourceType}`,
    `AnnouncementType: ${item.announcementType}`,
    `Title: ${item.title}`,
    `Summary: ${item.summary}`,
    `URL: ${item.url}`,
    `Confidence: ${Math.round((item.confidence || 0) * 100)}%`
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: "medium" },
      input: prompt
    })
  });

  if (!res.ok) return null;
  const payload = await res.json();
  const raw = extractResponseText(payload);
  const parsed = parseJsonLoose(raw);
  if (!parsed) return null;

  const whatHappened = String(parsed.whatHappened || "").trim();
  const whyItMatters = String(parsed.whyItMatters || "").trim();
  const whatToWatch = String(parsed.whatToWatch || "").trim();
  if (!whatHappened || !whyItMatters || !whatToWatch) return null;

  return {
    whatHappened,
    whyItMatters,
    whatToWatch,
    source: "openai",
    generatedAt: nowIso()
  };
}

async function attachAnalystNote(store, item, runState) {
  const key = stableSignature(item);
  if (store.aiNotesCache[key]) {
    item.analystNote = store.aiNotesCache[key];
    return item;
  }

  let note = defaultAnalystNote(item);
  const canUseOpenAi =
    AI_NOTES_MODE === "openai" &&
    !!OPENAI_API_KEY &&
    runState &&
    runState.aiNotesUsed < runState.aiNotesBudget;

  if (canUseOpenAi) {
    const generated = await generateOpenAiAnalystNote(item).catch(() => null);
    if (generated) {
      note = generated;
    }
    runState.aiNotesUsed += 1;
  }

  item.analystNote = note;
  store.aiNotesCache[key] = note;
  return item;
}

function insertItem(store, item) {
  if (item.confidence < MIN_CONFIDENCE) return false;

  const sig = stableSignature(item);
  const exists = store.items.find((i) => (i.signature || stableSignature(i)) === sig);
  if (exists) return false;

  const id = sha1(`${sig}|${item.eventAt}`);
  const stored = { id, signature: sig, ...item };
  store.items.unshift(stored);
  recordObservation(store, stored);
  if (store.items.length > MAX_ITEMS) store.items = store.items.slice(0, MAX_ITEMS);
  return true;
}

function classifyAnnouncement(title, summary, sourceType, url) {
  const blob = `${title || ""} ${summary || ""} ${sourceType || ""} ${url || ""}`.toLowerCase();

  if (/partnership|partnered|agreement|integrat|alliance|collaborat/.test(blob)) {
    return { type: "partnership_agreement", confidence: 0.92 };
  }
  if (/launch|released|introduc|new product|new feature|rollout|debut|unveil/.test(blob)) {
    return { type: "product_announcement", confidence: 0.9 };
  }
  if (/press release|announc|acquisition|merger|funding|investment|expan|strategic/.test(blob)) {
    return { type: "business_announcement", confidence: 0.88 };
  }
  if (/pricing|price|subscription|plan|fee|cost/.test(blob)) {
    return { type: "pricing_update", confidence: 0.86 };
  }
  if (/hiring|hired|appoint|executive|ceo|cto|vp|head of|jobs|careers/.test(blob)) {
    return { type: "leadership_hiring", confidence: 0.84 };
  }
  if (/press|newswire|businesswire|globenewswire|einnews|yahoo finance/.test(blob)) {
    return { type: "press_coverage", confidence: 0.82 };
  }
  return { type: "general_update", confidence: 0.8 };
}

function buildItem({ entity, channel, sourceType, url, title, summary, eventAt, confidence, confidenceReason }) {
  const normalizedUrl = normalizeUrl(url);
  const ts = safeDate(eventAt, nowIso());
  const announcement = classifyAnnouncement(title, summary, sourceType, normalizedUrl);
  return {
    schemaVersion: 2,
    entity: entity.name,
    entityType: entity.entityType,
    label: entityLabel(entity.entityType),
    channel,
    sourceType,
    url: normalizedUrl,
    title: title || "Untitled",
    summary: summary || "",
    announcementType: announcement.type,
    announcementClassifierConfidence: announcement.confidence,
    eventAt: ts,
    confidence,
    confidenceReason,
    collectedAt: nowIso(),
    isConfirmed: true
  };
}

async function collectRss(store, runState) {
  let newItems = 0;
  const errors = [];

  for (const entity of entities) {
    for (const feedUrl of entity.rss || []) {
      const res = await safeFetch(feedUrl);
      if (!res.ok) {
        errors.push({ type: "rss", entity: entity.name, url: feedUrl, status: res.status });
        continue;
      }

      const entries = parseItemsFromXml(res.text);
      for (const e of entries.slice(0, 30)) {
        if (!e.link || !e.title) continue;
        const item = buildItem({
          entity,
          channel: "rss",
          sourceType: "rss",
          url: e.link,
          title: e.title,
          summary: e.description,
          eventAt: e.pubDate || nowIso(),
          confidence: 0.95,
          confidenceReason: "Official RSS publication"
        });
        recordSourceVersion(store, e.link, {
          observedAt: nowIso(),
          entity: entity.name,
          entityType: entity.entityType,
          channel: "rss",
          sourceType: "rss",
          digest: sha1(`${e.title}|${e.description || ""}`),
          title: e.title || "",
          summary: (e.description || "").slice(0, 900),
          eventAt: safeDate(e.pubDate, nowIso()),
          confidence: 0.95
        });
        await attachAnalystNote(store, item, runState);
        if (insertItem(store, item)) newItems += 1;
      }
    }
  }

  return { newItems, errors };
}

function pageFingerprint(html) {
  const title = parseTag(html, "title");
  const body = cleanHtml(html).slice(0, 9000);
  const updatedMatch = html.match(/(last\s*updated|updated|published)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
  const updatedAt = updatedMatch ? updatedMatch[2] : null;
  const digest = sha1(`${title}|${body}`);
  return { title, body, updatedAt, digest };
}

async function collectWeb(store, runState) {
  let newItems = 0;
  const errors = [];

  for (const entity of entities) {
    for (const url of entity.webPages || []) {
      const normalized = normalizeUrl(url);
      const res = await safeFetch(normalized);
      if (!res.ok) {
        errors.push({ type: "web", entity: entity.name, url: normalized, status: res.status });
        continue;
      }

      const fp = pageFingerprint(res.text);
      const prev = store.snapshots[normalized];
      store.snapshots[normalized] = {
        entity: entity.name,
        entityType: entity.entityType,
        digest: fp.digest,
        title: fp.title,
        updatedAt: fp.updatedAt,
        checkedAt: nowIso()
      };
      recordSourceVersion(store, normalized, {
        observedAt: nowIso(),
        entity: entity.name,
        entityType: entity.entityType,
        channel: "web",
        sourceType: "web",
        digest: fp.digest,
        title: fp.title || "",
        summary: fp.body.slice(0, 900),
        eventAt: safeDate(fp.updatedAt, nowIso()),
        confidence: 0.86
      });

      if (!prev) continue;
      if (prev.digest === fp.digest && !(fp.updatedAt && prev.updatedAt !== fp.updatedAt)) continue;

      const item = buildItem({
        entity,
        channel: "web",
        sourceType: "web",
        url: normalized,
        title: fp.title || `${entity.name} page updated`,
        summary: `Verified page change detected on monitored web source${fp.updatedAt ? ` (updated ${fp.updatedAt})` : ""}.`,
        eventAt: fp.updatedAt || nowIso(),
        confidence: 0.86,
        confidenceReason: "Content fingerprint changed on monitored page"
      });
      await attachAnalystNote(store, item, runState);

      if (insertItem(store, item)) newItems += 1;
    }
  }

  return { newItems, errors };
}

function feedEntityByName(feedName) {
  const matched = entities.find((e) => feedName.toLowerCase().includes(e.name.toLowerCase()));
  return matched || null;
}

function isLinkedinUrl(url) {
  return /linkedin\.com/i.test(url || "");
}

async function collectLinkedinRss(store, runState) {
  let newItems = 0;
  const errors = [];

  for (const feed of linkedinSearchRss) {
    const res = await safeFetch(feed.url);
    if (!res.ok) {
      errors.push({ type: "linkedin-rss", url: feed.url, status: res.status });
      continue;
    }

    const expectedEntity = feedEntityByName(feed.name);
    const rows = parseItemsFromXml(res.text);

    for (const row of rows.slice(0, 25)) {
      if (!row.link || !row.title || !isLinkedinUrl(row.link)) continue;

      let entity = expectedEntity;
      if (!entity) {
        const blob = `${row.title} ${row.description}`.toLowerCase();
        entity = entities.find((e) => blob.includes(e.name.toLowerCase()));
      }
      if (!entity) continue;

      const blob = `${row.title} ${row.description}`.toLowerCase();
      const employeeSignal = /employee|vp|director|manager|head of|founder|cto|ceo|chief/i.test(blob);

      const item = buildItem({
        entity,
        channel: "linkedin",
        sourceType: employeeSignal ? "linkedin-employee" : "linkedin-company",
        url: row.link,
        title: row.title,
        summary: row.description || "LinkedIn update captured from monitored feed.",
        eventAt: row.pubDate || nowIso(),
        confidence: employeeSignal ? 0.84 : 0.9,
        confidenceReason: employeeSignal
          ? "LinkedIn employee-related mention matched tracked entity"
          : "LinkedIn company-related mention matched tracked entity"
      });
      recordSourceVersion(store, row.link, {
        observedAt: nowIso(),
        entity: entity.name,
        entityType: entity.entityType,
        channel: "linkedin",
        sourceType: employeeSignal ? "linkedin-employee" : "linkedin-company",
        digest: sha1(`${row.title}|${row.description || ""}`),
        title: row.title || "",
        summary: (row.description || "").slice(0, 900),
        eventAt: safeDate(row.pubDate, nowIso()),
        confidence: employeeSignal ? 0.84 : 0.9
      });
      await attachAnalystNote(store, item, runState);

      if (insertItem(store, item)) newItems += 1;
    }
  }

  return { newItems, errors };
}

function hasPressSignal(text) {
  return /press release|announc|launch|partnership|agreement|acquisition|funding|new product|rollout|unveil/i.test(
    text || ""
  );
}

function pressConfidenceScore(entity, row, articleSummary) {
  const blob = `${row.title || ""} ${row.description || ""} ${articleSummary || ""}`.toLowerCase();
  let score = 0.5;
  if (blob.includes(entity.name.toLowerCase())) score += 0.22;
  if (hasPressSignal(blob)) score += 0.2;
  if (/prnewswire|businesswire|globenewswire|einnews|yahoo/i.test(row.link || "")) score += 0.1;
  if (/partnership|integration|launch|announces|press release/i.test(row.title || "")) score += 0.08;
  return Math.min(0.98, score);
}

async function collectPressRss(store, runState) {
  let newItems = 0;
  const errors = [];

  for (const feed of pressSearchRss) {
    const res = await safeFetch(feed.url);
    if (!res.ok) {
      errors.push({ type: "press-rss", url: feed.url, status: res.status });
      continue;
    }

    const expectedEntity = feedEntityByName(feed.name);
    const rows = parseItemsFromXml(res.text);

    for (const row of rows.slice(0, 20)) {
      if (!row.link || !row.title) continue;

      let entity = expectedEntity;
      if (!entity) {
        const blob = `${row.title} ${row.description}`.toLowerCase();
        entity = entities.find((e) => blob.includes(e.name.toLowerCase()));
      }
      if (!entity) continue;

      const page = await safeFetch(row.link);
      const article = page.ok ? extractArticleSnippet(page.text) : { title: row.title, summary: row.description || "" };
      const confidence = pressConfidenceScore(entity, row, article.summary);

      const item = buildItem({
        entity,
        channel: "web",
        sourceType: "press-publication",
        url: row.link,
        title: article.title || row.title,
        summary: article.summary || row.description || "Press/publication update captured.",
        eventAt: row.pubDate || nowIso(),
        confidence,
        confidenceReason: "Entity-matched press/publication signal from web-wide RSS monitoring"
      });
      recordSourceVersion(store, row.link, {
        observedAt: nowIso(),
        entity: entity.name,
        entityType: entity.entityType,
        channel: "web",
        sourceType: "press-publication",
        digest: sha1(`${article.title || row.title}|${article.summary || row.description || ""}`),
        title: article.title || row.title || "",
        summary: (article.summary || row.description || "").slice(0, 900),
        eventAt: safeDate(row.pubDate, nowIso()),
        confidence
      });
      await attachAnalystNote(store, item, runState);

      if (insertItem(store, item)) newItems += 1;
    }
  }

  return { newItems, errors };
}

async function collectLinkedinPages(store, runState) {
  let newItems = 0;
  const errors = [];

  for (const entity of entities) {
    for (const linkedinUrl of entity.linkedinCompanyPages || []) {
      const normalized = normalizeUrl(linkedinUrl);
      const res = await safeFetch(normalized);
      if (!res.ok) {
        errors.push({ type: "linkedin-page", entity: entity.name, url: normalized, status: res.status });
        continue;
      }

      const fp = pageFingerprint(res.text);
      const ogTitle = parseMetaTag(res.text, "property", "og:title");
      const ogDesc = parseMetaTag(res.text, "property", "og:description") || parseMetaTag(res.text, "name", "description");

      const prev = store.snapshots[normalized];
      store.snapshots[normalized] = {
        entity: entity.name,
        entityType: entity.entityType,
        digest: fp.digest,
        title: ogTitle || fp.title,
        updatedAt: fp.updatedAt,
        checkedAt: nowIso()
      };
      recordSourceVersion(store, normalized, {
        observedAt: nowIso(),
        entity: entity.name,
        entityType: entity.entityType,
        channel: "linkedin",
        sourceType: "linkedin-company-page",
        digest: fp.digest,
        title: ogTitle || fp.title || "",
        summary: (ogDesc || "").slice(0, 900),
        eventAt: safeDate(fp.updatedAt, nowIso()),
        confidence: strong ? 0.9 : 0.82
      });

      if (!prev) continue;
      if (prev.digest === fp.digest && !(fp.updatedAt && prev.updatedAt !== fp.updatedAt)) continue;

      const summary = ogDesc || "Verified LinkedIn company page change detected.";
      const strong = /integration|partnership|launch|announc|release|new|hiring/i.test(`${ogTitle} ${ogDesc}`.toLowerCase());

      const item = buildItem({
        entity,
        channel: "linkedin",
        sourceType: "linkedin-company-page",
        url: normalized,
        title: ogTitle || fp.title || `${entity.name} LinkedIn page updated`,
        summary,
        eventAt: fp.updatedAt || nowIso(),
        confidence: strong ? 0.9 : 0.82,
        confidenceReason: strong
          ? "LinkedIn company page changed with explicit update language"
          : "LinkedIn company page fingerprint changed"
      });
      await attachAnalystNote(store, item, runState);

      if (insertItem(store, item)) newItems += 1;
    }
  }

  return { newItems, errors };
}

async function runCollection() {
  const store = ensureStore();
  const start = Date.now();
  const runState = {
    aiNotesBudget: MAX_AI_NOTES_PER_RUN,
    aiNotesUsed: 0
  };

  const [rss, web, linkedinRss, linkedinPages, press] = await Promise.all([
    collectRss(store, runState),
    collectWeb(store, runState),
    collectLinkedinRss(store, runState),
    collectLinkedinPages(store, runState),
    collectPressRss(store, runState)
  ]);

  store.meta.runCount += 1;
  store.meta.lastRunAt = nowIso();
  store.meta.lastRunStatus = "ok";
  store.meta.lastRunSummary = {
    durationMs: Date.now() - start,
    totalNewItems: rss.newItems + web.newItems + linkedinRss.newItems + linkedinPages.newItems + press.newItems,
    rss,
    web,
    linkedinRss,
    linkedinPages,
    press,
    aiNotes: {
      mode: AI_NOTES_MODE,
      used: runState.aiNotesUsed,
      budget: runState.aiNotesBudget
    }
  };

  saveStore(store);
  return store.meta.lastRunSummary;
}

function getStore() {
  return ensureStore();
}

module.exports = {
  runCollection,
  getStore,
  DATA_FILE,
  MIN_CONFIDENCE
};
