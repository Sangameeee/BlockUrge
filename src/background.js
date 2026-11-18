/* background.js
   Firefox: loaded as the second file in "background.scripts", after storage.js,
            so the global `Store` is already available.
   Chrome:  importScripts pulls storage.js in when run as a service worker. */
if (typeof importScripts === "function") {
  importScripts("storage.js");
}

const EXT_URL = (path) => chrome.runtime.getURL(path);
const ALARM_PREFIX = "session:";

function blockedPageUrl(site, aid, url, extra = "") {
  return `${EXT_URL("blocked.html")}?site=${encodeURIComponent(site)}&aid=${encodeURIComponent(aid)}&url=${encodeURIComponent(url)}${extra}`;
}

async function handleBeforeNavigate(details) {
  if (details.frameId !== 0 || details.tabId < 0) return; // main frame only
  let url;
  try {
    url = new URL(details.url);
  } catch (e) {
    return;
  }
  if (!/^https?:$/.test(url.protocol)) return;

  const matchedSite = await Store.findBlockedEntryForHost(url.hostname);
  if (!matchedSite) return;

  // an active time pass lets everything on that site through until it expires
  if (await Store.getActiveSession(matchedSite)) return;

  const attemptId = await Store.logAttempt(matchedSite, details.url);
  chrome.tabs.update(details.tabId, { url: blockedPageUrl(matchedSite, attemptId, details.url) });
}

chrome.webNavigation.onBeforeNavigate.addListener(handleBeforeNavigate);

// When a pass runs out, send every open tab on that site back to the block page.
async function expireSession(site) {
  await Store.endSession(site);
  chrome.alarms.clear(ALARM_PREFIX + site);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    let host;
    try {
      const u = new URL(tab.url);
      if (!/^https?:$/.test(u.protocol)) continue;
      host = Store.normalizeHost(u.hostname);
    } catch (e) {
      continue;
    }
    if (!Store.hostMatchesEntry(host, site)) continue;
    const aid = await Store.logAttempt(site, tab.url);
    chrome.tabs.update(tab.id, { url: blockedPageUrl(site, aid, tab.url, "&expired=1") });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(ALARM_PREFIX)) {
    expireSession(alarm.name.slice(ALARM_PREFIX.length));
  }
});

// Alarms can be missed if the browser was closed; catch up on startup.
async function reconcileSessions() {
  const { sessions } = await Store.getAll();
  const now = Date.now();
  for (const [site, exp] of Object.entries(sessions)) {
    if (exp <= now) expireSession(site);
    else chrome.alarms.create(ALARM_PREFIX + site, { when: exp });
  }
}

chrome.runtime.onStartup.addListener(reconcileSessions);

chrome.runtime.onInstalled.addListener(async () => {
  const data = await Store.getAll();
  await Store.set(data); // persist defaults + migrate v1.0 data
  // drop v1.0-only keys
  await chrome.storage.local.remove(["overrideSite", "allowOnce"]);
  reconcileSessions();
});

// messages from popup / blocked / options pages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "BLOCK_SITE": {
        const host = await Store.addBlockedSite(msg.host, msg.mode);
        sendResponse({ ok: true, host });
        break;
      }
      case "GET_HOST_STATUS": {
        const site = await Store.findBlockedEntryForHost(msg.host);
        const expiry = site ? await Store.getActiveSession(site) : 0;
        sendResponse({ blocked: !!site, site, expiry });
        break;
      }
      case "SUBMIT_REASON": {
        await Store.updateAttempt(msg.site, msg.aid, {
          reason: msg.reason || "",
          searchQuery: msg.searchQuery || ""
        });
        sendResponse({ ok: true });
        break;
      }
      case "START_SESSION": {
        const tabId = sender.tab?.id;
        const data = await Store.getAll();
        const meta = data.blockedSites[msg.site];
        if (!meta) {
          sendResponse({ ok: false, reason: "That site is no longer blocked." });
          break;
        }
        if (meta.mode === "strict") {
          sendResponse({ ok: false, reason: "This site is strict. There's no way through." });
          break;
        }
        const minutes = Store.clamp(msg.minutes, 1, data.settings.maxSessionMinutes);
        const expiry = await Store.startSession(msg.site, minutes);
        chrome.alarms.create(ALARM_PREFIX + msg.site, { when: expiry });
        await Store.updateAttempt(msg.site, msg.aid, {
          proceeded: true,
          minutes,
          searchQuery: msg.searchQuery || ""
        });

        let dest = msg.url;
        if (meta.mode === "youtube" && msg.searchQuery) {
          dest = `https://www.youtube.com/results?search_query=${encodeURIComponent(msg.searchQuery)}`;
        }
        if (tabId) chrome.tabs.update(tabId, { url: dest });
        sendResponse({ ok: true, expiry });
        break;
      }
      case "END_SESSION": {
        await expireSession(msg.site);
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, reason: "unknown message" });
    }
  })();
  return true; // keep the message channel open for the async response
});
