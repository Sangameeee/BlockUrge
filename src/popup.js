(async function () {
  const $ = (id) => document.getElementById(id);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  if (tab?.url) {
    try {
      const url = new URL(tab.url);
      if (/^https?:$/.test(url.protocol)) host = url.hostname;
    } catch (e) {
      host = "";
    }
  }

  const show = (id) => {
    for (const s of document.querySelectorAll(".state")) s.classList.add("hidden");
    $(id).classList.remove("hidden");
  };

  if (!host) {
    $("currentHost").textContent = "No blockable site on this tab.";
  } else {
    $("currentHost").textContent = host;
    const status = await chrome.runtime.sendMessage({ type: "GET_HOST_STATUS", host });
    if (status?.blocked && status.expiry) {
      startCountdown(status.site, status.expiry);
    } else if (status?.blocked) {
      show("stateAlready");
    } else {
      if (Store.isYouTubeHost(host)) $("ytBtn").classList.remove("hidden");
      show("stateAsk");
    }
  }

  async function block(mode) {
    await chrome.runtime.sendMessage({ type: "BLOCK_SITE", host, mode });
    show("stateDone");
    if (tab?.id) chrome.tabs.reload(tab.id);
  }

  $("ytBtn").addEventListener("click", () => block("youtube"));
  $("timedBtn").addEventListener("click", () => block("timed"));

  // strict is permanent, so ask for a second click instead of a confirm() dialog
  // (dialogs close the popup in Firefox)
  let strictArmed = false;
  $("strictBtn").addEventListener("click", () => {
    if (!strictArmed) {
      strictArmed = true;
      $("strictBtn").textContent = "Click again to make it strict";
      $("strictConfirm").textContent = "Strict sites are locked. You can't remove them or loosen them later.";
      return;
    }
    block("strict");
  });

  function startCountdown(site, expiry) {
    show("stateSession");
    const tick = () => {
      const left = Math.max(0, expiry - Date.now());
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      $("countdown").textContent = `${m}:${String(s).padStart(2, "0")}`;
      if (left <= 0) clearInterval(iv);
    };
    tick();
    const iv = setInterval(tick, 1000);
    $("endBtn").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "END_SESSION", site });
      window.close();
    });
  }

  $("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  $("openReport").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
  });
})();
