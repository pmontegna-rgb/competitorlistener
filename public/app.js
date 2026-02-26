const state = {
  loading: false,
  items: [],
  entitiesByGroup: { competitor: [], partner: [], all: [] },
  entities: [],
  counts: null,
  meta: null
};

const els = {
  stats: document.getElementById("stats"),
  feed: document.getElementById("feed"),
  group: document.getElementById("groupFilter"),
  entity: document.getElementById("entityFilter"),
  channel: document.getElementById("channelFilter"),
  announcement: document.getElementById("announcementFilter"),
  strategic: document.getElementById("strategicFilter"),
  timeframe: document.getElementById("timeframeFilter"),
  start: document.getElementById("startDate"),
  end: document.getElementById("endDate"),
  search: document.getElementById("searchInput"),
  refresh: document.getElementById("refreshBtn"),
  itemTemplate: document.getElementById("itemTemplate")
};

function formatDate(v) {
  const d = new Date(v || "");
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toLocaleString();
}

function asDateInputValue(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function setPresetRange(value) {
  if (value === "custom") return;
  const end = new Date();
  const start = new Date();
  const days = value === "7d" ? 7 : value === "90d" ? 90 : 30;
  start.setDate(end.getDate() - days + 1);
  els.start.value = asDateInputValue(start);
  els.end.value = asDateInputValue(end);
}

function buildQuery() {
  const q = new URLSearchParams({
    group: els.group.value,
    entity: els.entity.value,
    channel: els.channel.value,
    announcement: els.announcement.value,
    strategicOnly: els.strategic.value,
    start: els.start.value,
    end: els.end.value,
    search: els.search.value.trim(),
    limit: "500"
  });
  return q.toString();
}

function renderStats() {
  const list = [
    ["Filtered", String(state.counts?.filtered || 0)],
    ["Competitor", String(state.counts?.competitor || 0)],
    ["Partner", String(state.counts?.partner || 0)],
    ["RSS", String(state.counts?.rss || 0)],
    ["Web", String(state.counts?.web || 0)],
    ["LinkedIn", String(state.counts?.linkedin || 0)],
    ["Strategic", String(state.counts?.strategic || 0)],
    ["Last Run", formatDate(state.meta?.lastRunAt)]
  ];

  els.stats.innerHTML = "";
  list.forEach(([k, v]) => {
    const card = document.createElement("div");
    card.className = "stat";
    card.innerHTML = `<div class=\"k\">${k}</div><div class=\"v\">${v}</div>`;
    els.stats.appendChild(card);
  });
}

function renderEntities() {
  const group = els.group.value || "all";
  const base = state.entitiesByGroup[group] || [];
  state.entities = base;

  const cur = els.entity.value || "all";
  const opts = ['<option value="all">All</option>', ...base.map((e) => `<option value="${e}">${e}</option>`)];
  els.entity.innerHTML = opts.join("");
  if (state.entities.includes(cur)) els.entity.value = cur;
}

function renderFeed() {
  if (state.loading) {
    els.feed.innerHTML = '<div class="empty">Loading...</div>';
    return;
  }

  if (!state.items.length) {
    els.feed.innerHTML = '<div class="empty">No results for current filters.</div>';
    return;
  }

  els.feed.innerHTML = "";
  state.items.forEach((item) => {
    const node = els.itemTemplate.content.firstElementChild.cloneNode(true);
    node.href = item.url;
    node.querySelector(".entity").textContent = item.entity;
    node.querySelector(".chip.label").textContent = item.label;
    node.querySelector(".chip.channel").textContent = item.channel;
    node.querySelector(".title").textContent = item.title;
    node.querySelector(".announcement").textContent = `Classification: ${item.announcementType || "general_update"}`;
    node.querySelector(".summary").textContent = item.summary || "No summary available.";
    const note = item.analystNote || {};
    node.querySelector(".an-what").textContent = `What happened: ${note.whatHappened || "Analysis unavailable."}`;
    node.querySelector(".an-why").textContent = `Why it matters: ${note.whyItMatters || "Analysis unavailable."}`;
    node.querySelector(".an-watch").textContent = `What to watch: ${note.whatToWatch || "Analysis unavailable."}`;
    node.querySelector(".timestamp").textContent = formatDate(item.eventAt);
    node.querySelector(".confidence").textContent = `Confidence ${Math.round((item.confidence || 0) * 100)}%`;
    els.feed.appendChild(node);
  });
}

async function loadMetaOptions() {
  try {
    const res = await fetch("/api/meta");
    const payload = await res.json();
    state.entitiesByGroup = payload.entityOptions || { competitor: [], partner: [], all: [] };
  } catch {
    // Fallback will be hydrated from /api/feed response.
  }
  renderEntities();
}

async function loadFeed() {
  state.loading = true;
  renderFeed();

  const res = await fetch(`/api/feed?${buildQuery()}`);
  const payload = await res.json();

  state.items = payload.items || [];
  state.counts = payload.counts || null;
  state.meta = payload.meta || null;
  const feedEntities = Array.isArray(payload.entities) ? payload.entities : [];
  const group = els.group.value || "all";
  if (feedEntities.length > 0) {
    state.entitiesByGroup[group] = feedEntities;
    if (group !== "all") {
      const merged = new Set([...(state.entitiesByGroup.all || []), ...feedEntities]);
      state.entitiesByGroup.all = Array.from(merged).sort();
    } else {
      state.entitiesByGroup.all = feedEntities;
    }
  }

  state.loading = false;
  renderEntities();
  renderStats();
  renderFeed();
}

let timer = null;

function bindEvents() {
  els.group.addEventListener("change", () => {
    els.entity.value = "all";
    renderEntities();
    loadFeed();
  });

  [els.entity, els.channel].forEach((el) => {
    el.addEventListener("change", () => loadFeed());
  });

  [els.announcement, els.strategic].forEach((el) => {
    el.addEventListener("change", () => loadFeed());
  });

  els.timeframe.addEventListener("change", () => {
    setPresetRange(els.timeframe.value);
    loadFeed();
  });

  [els.start, els.end].forEach((el) => {
    el.addEventListener("change", () => {
      els.timeframe.value = "custom";
      loadFeed();
    });
  });

  els.search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(loadFeed, 250);
  });

  els.refresh.addEventListener("click", async () => {
    els.refresh.disabled = true;
    els.refresh.textContent = "Refreshing...";
    try {
      await fetch("/api/refresh", { method: "POST" });
      await loadMetaOptions();
      await loadFeed();
    } finally {
      els.refresh.disabled = false;
      els.refresh.textContent = "Refresh";
    }
  });
}

bindEvents();
setPresetRange("30d");
loadMetaOptions().then(loadFeed);
