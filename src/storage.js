/* storage.js — shared data layer. Loaded as a plain script everywhere
   (background, popup, options, blocked page, report) so it must not
   use import/export — just attaches a global `Store` object. */

const Store = (() => {
  const LIMITS = {
    timerMin: 5,
    timerMax: 600,
    timerStep: 5,
    sessionMin: 1,
    sessionMax: 240
  };

  const DEFAULTS = {
    blockedSites: {},   // { "youtube.com": { addedAt, mode } }  mode: "timed" | "strict" | "youtube"
    settings: {
      timerSeconds: 30,       // breathing pause length
      maxSessionMinutes: 30   // most time you can grant yourself per visit
    },
    attempts: {},       // { "youtube.com": [ {id, timestamp, url, reason, searchQuery, proceeded, minutes} ] }
    sessions: {}        // { "youtube.com": expiryTimestampMs } — active time passes
  };

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, Math.round(n)));
  }

  const MODES = ["timed", "strict", "youtube"];

  function defaultModeFor(host) {
    return isYouTubeHost(host) ? "youtube" : "timed";
  }

  async function getAll() {
    const data = await chrome.storage.local.get(DEFAULTS);
    // fill in settings keys added in later versions
    data.settings = { ...DEFAULTS.settings, ...(data.settings || {}) };
    // v1.0 entries had no mode — derive one
    for (const [host, meta] of Object.entries(data.blockedSites)) {
      if (!MODES.includes(meta.mode)) meta.mode = defaultModeFor(host);
    }
    return data;
  }

  function set(partial) {
    return chrome.storage.local.set(partial);
  }

  // normalize "www.Example.com" / "m.youtube.com" -> "example.com" / "youtube.com"
  function normalizeHost(hostname) {
    let h = (hostname || "").trim().toLowerCase();
    h = h.replace(/^www\./, "").replace(/^m\./, "").replace(/\.$/, "");
    return h;
  }

  // turn user input like "https://www.reddit.com/r/foo" into "reddit.com"
  function parseHostInput(raw) {
    let s = (raw || "").trim();
    if (!s) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
    try {
      const host = normalizeHost(new URL(s).hostname);
      return /^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(host) ? host : "";
    } catch (e) {
      return "";
    }
  }

  function hostMatchesEntry(host, entryHost) {
    return host === entryHost || host.endsWith("." + entryHost);
  }

  async function findBlockedEntryForHost(host) {
    const { blockedSites } = await getAll();
    const norm = normalizeHost(host);
    for (const site of Object.keys(blockedSites)) {
      if (hostMatchesEntry(norm, site)) return site;
    }
    return null;
  }

  async function addBlockedSite(rawHost, mode) {
    const host = normalizeHost(rawHost);
    if (!host) return null;
    const data = await getAll();
    if (!data.blockedSites[host]) {
      if (!MODES.includes(mode) || (mode === "youtube" && !isYouTubeHost(host))) {
        mode = defaultModeFor(host);
      }
      data.blockedSites[host] = { addedAt: Date.now(), mode };
    }
    await set({ blockedSites: data.blockedSites });
    return host;
  }

  async function setSiteMode(host, mode) {
    const data = await getAll();
    const meta = data.blockedSites[host];
    if (!meta) return { ok: false, reason: "That site is not blocked." };
    if (!MODES.includes(mode)) return { ok: false, reason: "Unknown mode." };
    if (mode === "youtube" && !isYouTubeHost(host)) {
      return { ok: false, reason: "YouTube search mode only works for YouTube." };
    }
    if (meta.mode === "strict" && mode !== "strict") {
      return { ok: false, reason: "Strict sites are locked. They can't be loosened." };
    }
    meta.mode = mode;
    if (mode === "strict") delete data.sessions[host];
    await set({ blockedSites: data.blockedSites, sessions: data.sessions });
    return { ok: true };
  }

  async function removeBlockedSite(host) {
    const data = await getAll();
    if (data.blockedSites[host]?.mode === "strict") {
      return { ok: false, reason: "Strict sites are locked and can't be removed." };
    }
    delete data.blockedSites[host];
    delete data.sessions[host];
    await set({ blockedSites: data.blockedSites, sessions: data.sessions });
    return { ok: true };
  }

  async function updateSettings(patch) {
    const data = await getAll();
    const s = { ...data.settings, ...patch };
    s.timerSeconds = clamp(s.timerSeconds, LIMITS.timerMin, LIMITS.timerMax);
    s.maxSessionMinutes = clamp(s.maxSessionMinutes, LIMITS.sessionMin, LIMITS.sessionMax);
    await set({ settings: s });
    return s;
  }

  function genId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  async function logAttempt(host, url) {
    const data = await getAll();
    const id = genId();
    const record = {
      id,
      timestamp: Date.now(),
      url,
      reason: "",
      searchQuery: "",
      proceeded: false,
      minutes: 0
    };
    if (!data.attempts[host]) data.attempts[host] = [];
    data.attempts[host].push(record);
    await set({ attempts: data.attempts });
    return id;
  }

  async function updateAttempt(host, id, patch) {
    const data = await getAll();
    const list = data.attempts[host] || [];
    const idx = list.findIndex((r) => r.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...patch };
      data.attempts[host] = list;
      await set({ attempts: data.attempts });
    }
  }

  /* ---- timed access sessions ---- */

  async function startSession(host, minutes) {
    const data = await getAll();
    const expiry = Date.now() + minutes * 60 * 1000;
    data.sessions[host] = expiry;
    await set({ sessions: data.sessions });
    return expiry;
  }

  async function endSession(host) {
    const data = await getAll();
    delete data.sessions[host];
    await set({ sessions: data.sessions });
  }

  // returns expiry ms if `host` (a blocked-list entry) has an active pass, else 0
  async function getActiveSession(host) {
    const { sessions } = await getAll();
    const exp = sessions[host];
    return exp && exp > Date.now() ? exp : 0;
  }

  async function pruneSessions() {
    const data = await getAll();
    const now = Date.now();
    const expired = [];
    for (const [h, exp] of Object.entries(data.sessions)) {
      if (exp <= now) {
        delete data.sessions[h];
        expired.push(h);
      }
    }
    if (expired.length) await set({ sessions: data.sessions });
    return expired;
  }

  function isYouTubeHost(host) {
    const h = normalizeHost(host);
    return h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be";
  }

  return {
    LIMITS,
    MODES,
    DEFAULTS,
    clamp,
    getAll,
    set,
    normalizeHost,
    parseHostInput,
    hostMatchesEntry,
    findBlockedEntryForHost,
    addBlockedSite,
    removeBlockedSite,
    setSiteMode,
    updateSettings,
    logAttempt,
    updateAttempt,
    startSession,
    endSession,
    getActiveSession,
    pruneSessions,
    isYouTubeHost
  };
})();
