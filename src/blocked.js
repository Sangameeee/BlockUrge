(async function () {
  const params = new URLSearchParams(location.search);
  const site = params.get("site") || "";
  const aid = params.get("aid") || "";
  const originalUrl = params.get("url") || `https://${site}`;
  const $ = (id) => document.getElementById(id);

  const data = await Store.getAll();
  const meta = data.blockedSites[site];
  const mode = meta ? meta.mode : "timed";
  const timerSeconds = data.settings.timerSeconds;
  const maxMinutes = data.settings.maxSessionMinutes;

  // A pass may have started in another tab meanwhile, or the site was removed.
  if (!meta || (await Store.getActiveSession(site))) {
    location.replace(originalUrl);
    return;
  }

  $("siteName").textContent = site;
  document.title = `Blocked: ${site}`;
  if (params.get("expired") === "1") $("expiredNotice").classList.remove("hidden");

  const show = (id) => {
    for (const p of document.querySelectorAll(".panel")) p.classList.add("hidden");
    $(id).classList.remove("hidden");
  };

  /* ---------- step 1: reason ---------- */
  const isYT = mode === "youtube";
  const field = $("answer");
  $("startBtn").textContent = mode === "strict" ? "Submit" : `Start ${formatSecs(timerSeconds)} timer`;
  field.focus();

  let answer = "";
  $("askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    answer = field.value.trim();
    if (answer.length < 3) {
      $("askError").classList.remove("hidden");
      field.focus();
      return;
    }
    chrome.runtime.sendMessage({ type: "SUBMIT_REASON", site, aid, reason: answer });
    if (mode === "strict") {
      show("endPanel");
    } else {
      runTimer();
    }
  });

  /* ---------- step 2: timer (pauses while the tab is hidden) ---------- */
  function runTimer() {
    show("timerPanel");
    const CIRC = 2 * Math.PI * 52;
    const ring = $("ringFg");
    ring.style.strokeDasharray = `${CIRC}`;
    ring.style.strokeDashoffset = "0";

    let remaining = timerSeconds;
    $("timerNum").textContent = remaining;
    const sub = $("breatheSub");
    const subText = sub.textContent;

    const interval = setInterval(() => {
      if (document.hidden) {
        sub.textContent = "Paused. The timer only runs while you stay on this tab.";
        return;
      }
      sub.textContent = subText;
      remaining -= 1;
      $("timerNum").textContent = Math.max(remaining, 0);
      ring.style.strokeDashoffset = `${CIRC * (1 - remaining / timerSeconds)}`;
      if (remaining <= 0) {
        clearInterval(interval);
        askMinutes();
      }
    }, 1000);
  }

  /* ---------- step 3: pick minutes ---------- */
  function askMinutes() {
    show("minutesPanel");
    if (isYT) {
      $("minutesTitle").textContent = "What will you watch, and for how long?";
      $("minutesSub").textContent = "YouTube opens straight to the search results for it, not the home feed. When the time is up, YouTube gets blocked again.";
      $("ytQueryBox").classList.remove("hidden");
      $("ytQuery").focus();
    }
    const presets = [5, 10, 15, 30, 60].filter((m) => m <= maxMinutes);
    if (!presets.includes(maxMinutes) && maxMinutes < 60) presets.push(maxMinutes);
    const chips = $("presetChips");
    chips.textContent = "";
    for (const m of presets) {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = `${m} min`;
      b.addEventListener("click", () => go(m));
      chips.appendChild(b);
    }
    const custom = $("customMinutes");
    custom.max = String(maxMinutes);
    custom.placeholder = `1–${maxMinutes}`;
  }

  $("customForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = Number($("customMinutes").value);
    if (!Number.isInteger(n) || n < 1 || n > maxMinutes) {
      showMinutesError(`Pick a whole number from 1 to ${maxMinutes}.`);
      return;
    }
    go(n);
  });

  function showMinutesError(text) {
    $("minutesError").textContent = text;
    $("minutesError").classList.remove("hidden");
  }

  let going = false;
  function go(minutes) {
    if (going) return;
    const query = isYT ? $("ytQuery").value.trim() : "";
    if (isYT && query.length < 2) {
      showMinutesError("Type what you're going to watch first.");
      $("ytQuery").focus();
      return;
    }
    going = true;
    chrome.runtime.sendMessage(
      {
        type: "START_SESSION",
        site,
        aid,
        minutes,
        url: originalUrl,
        searchQuery: query
      },
      (resp) => {
        if (!resp || !resp.ok) {
          going = false;
          showMinutesError((resp && resp.reason) || "Couldn't start the session.");
        }
      }
    );
  }

  /* ---------- close ---------- */
  for (const btn of document.querySelectorAll(".closeBtn")) {
    btn.addEventListener("click", async () => {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) chrome.tabs.remove(tab.id);
      else window.close();
    });
  }

  function formatSecs(s) {
    if (s < 60) return `${s}-second`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}-minute`;
  }
})();
