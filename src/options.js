(async function () {
  const $ = (id) => document.getElementById(id);
  const L = Store.LIMITS;
  const STEPPERS = {
    timerSeconds: { min: L.timerMin, max: L.timerMax, step: L.timerStep },
    maxSessionMinutes: { min: L.sessionMin, max: L.sessionMax, step: 5 }
  };
  const MODE_LABELS = { timed: "Timed", strict: "Strict", youtube: "YouTube search" };

  /* ---------- steppers ---------- */
  let savedTimer;
  async function saveSetting(key, value) {
    const s = await Store.updateSettings({ [key]: value });
    $(key).value = s[key];
    $("savedMsg").classList.remove("hidden");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => $("savedMsg").classList.add("hidden"), 1200);
  }

  for (const el of document.querySelectorAll(".stepper")) {
    const key = el.dataset.key;
    const cfg = STEPPERS[key];
    const input = $(key);
    input.min = cfg.min;
    input.max = cfg.max;
    input.step = 1;
    el.querySelectorAll(".step-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = Number(btn.dataset.dir);
        const cur = Number(input.value) || cfg.min;
        // snap to the step grid, then move one step (1 → 5, 7 → 10, etc.)
        let next = dir > 0
          ? Math.floor(cur / cfg.step) * cfg.step + cfg.step
          : Math.ceil(cur / cfg.step) * cfg.step - cfg.step;
        next = Math.min(cfg.max, Math.max(cfg.min, next));
        saveSetting(key, next);
      });
    });
    input.addEventListener("change", () => saveSetting(key, input.value));
  }

  /* ---------- site list ---------- */
  function cell(content) {
    const td = document.createElement("td");
    if (content instanceof Node) td.appendChild(content);
    else td.textContent = content;
    return td;
  }

  function modeSelect(site, current) {
    if (current === "strict") {
      const span = document.createElement("span");
      span.className = "tag strict";
      span.textContent = "Strict (locked)";
      return span;
    }
    const sel = document.createElement("select");
    sel.className = "mode-select";
    const modes = Store.isYouTubeHost(site) ? ["youtube", "timed", "strict"] : ["timed", "strict"];
    for (const m of modes) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = MODE_LABELS[m];
      o.selected = m === current;
      sel.appendChild(o);
    }
    sel.addEventListener("change", async () => {
      if (sel.value === "strict" && !confirm(`Make ${site} strict?\n\nStrict sites have no way through and are locked: you won't be able to remove them or switch them back.`)) {
        sel.value = current;
        return;
      }
      const res = await Store.setSiteMode(site, sel.value);
      if (!res.ok) alert(res.reason);
      render();
    });
    return sel;
  }

  async function render() {
    const data = await Store.getAll();
    $("timerSeconds").value = data.settings.timerSeconds;
    $("maxSessionMinutes").value = data.settings.maxSessionMinutes;

    const body = $("sitesBody");
    const sites = Object.entries(data.blockedSites).sort((a, b) => a[0].localeCompare(b[0]));
    $("siteCount").textContent = sites.length ? `(${sites.length})` : "";
    body.textContent = "";

    if (!sites.length) {
      const tr = document.createElement("tr");
      const td = cell("No sites blocked yet.");
      td.colSpan = 5;
      td.className = "empty";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    for (const [site, meta] of sites) {
      const attempts = data.attempts[site] || [];
      const last = attempts.length ? new Date(attempts[attempts.length - 1].timestamp) : null;
      const tr = document.createElement("tr");
      tr.appendChild(cell(site));
      tr.appendChild(cell(modeSelect(site, meta.mode)));
      tr.appendChild(cell(String(attempts.length)));
      tr.appendChild(cell(last ? last.toLocaleString() : "—"));

      let action = "";
      if (meta.mode !== "strict") {
        const btn = document.createElement("button");
        btn.className = "remove-btn";
        btn.textContent = "Unblock";
        btn.addEventListener("click", async () => {
          const typed = prompt(`Type UNBLOCK to remove ${site} from your blocked list.`);
          if (typed === "UNBLOCK") {
            const res = await Store.removeBlockedSite(site);
            if (!res.ok) alert(res.reason);
            render();
          }
        });
        action = btn;
      }
      tr.appendChild(cell(action));
      body.appendChild(tr);
    }
  }

  /* ---------- add site ---------- */
  const newSite = $("newSite");
  const newMode = $("newMode");
  const ytOpt = document.createElement("option");
  ytOpt.value = "youtube";
  ytOpt.textContent = "YouTube search";

  // only offer YouTube search mode when a YouTube address is typed
  newSite.addEventListener("input", () => {
    $("addError").classList.add("hidden");
    const isYT = Store.isYouTubeHost(Store.parseHostInput(newSite.value));
    if (isYT && !ytOpt.parentNode) {
      newMode.prepend(ytOpt);
      newMode.value = "youtube";
    } else if (!isYT && ytOpt.parentNode) {
      ytOpt.remove();
    }
  });

  newSite.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("addBtn").click();
    }
  });

  $("addBtn").addEventListener("click", async () => {
    const host = Store.parseHostInput(newSite.value);
    if (!host) {
      $("addError").classList.remove("hidden");
      return;
    }
    const mode = newMode.value;
    if (mode === "strict" && !confirm(`Block ${host} as strict?\n\nStrict sites have no way through and are locked: you won't be able to remove them or switch them back.`)) {
      return;
    }
    await Store.addBlockedSite(host, mode);
    newSite.value = "";
    ytOpt.remove();
    newMode.value = "timed";
    render();
  });

  /* ---------- host permission check (users can revoke it in Firefox) ---------- */
  const ALL = { origins: ["<all_urls>"] };
  async function checkPerm() {
    const ok = await chrome.permissions.contains(ALL);
    $("permCard").classList.toggle("hidden", ok);
  }
  $("permBtn").addEventListener("click", async () => {
    await chrome.permissions.request(ALL);
    checkPerm();
  });
  chrome.permissions.onAdded?.addListener(checkPerm);
  chrome.permissions.onRemoved?.addListener(checkPerm);
  checkPerm();

  render();
})();
