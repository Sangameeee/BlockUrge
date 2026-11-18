(async function () {
  const data = await Store.getAll();
  const now = new Date();

  // tiny DOM helper: el("td", { className: "x" }, "text" | Node, ...)
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.assign(node, props || {});
    for (const c of children) node.append(c instanceof Node ? c : String(c));
    return node;
  }

  function emptyRow(cols, text) {
    return el("tr", null, el("td", { colSpan: cols, className: "empty" }, text));
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  const todayKey = dayKey(now.getTime());

  // flatten all attempts with site attached
  const all = [];
  for (const [site, list] of Object.entries(data.attempts)) {
    for (const a of list) all.push({ ...a, site });
  }

  const todayAttempts = all.filter((a) => dayKey(a.timestamp) === todayKey);
  const last7Cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const last7 = all.filter((a) => a.timestamp >= last7Cutoff);

  // summary cards
  const stat = (num, label) =>
    el("div", { className: "stat" }, el("div", { className: "num" }, num), el("div", { className: "label" }, label));
  document.getElementById("summaryCards").replaceChildren(
    stat(Object.keys(data.blockedSites).length, "Sites blocked"),
    stat(all.length, "Attempts all-time"),
    stat(todayAttempts.length, "Attempts today"),
    stat(last7.length, "Attempts last 7 days")
  );

  // weekly trend: last 7 days, oldest to newest
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const counts = days.map((d) => {
    const key = dayKey(d.getTime());
    return all.filter((a) => dayKey(a.timestamp) === key).length;
  });
  const maxCount = Math.max(1, ...counts);
  document.getElementById("trendChart").replaceChildren(
    ...days.map((d, i) => {
      const bar = el("div", { className: "bar" });
      bar.style.height = `${Math.round((counts[i] / maxCount) * 120) + 2}px`;
      return el(
        "div",
        { className: "bar-col" },
        el("div", { className: "bar-value" }, counts[i]),
        bar,
        el("div", { className: "bar-label" }, d.toLocaleDateString(undefined, { weekday: "short" }))
      );
    })
  );

  // tally by site
  const tallyBody = document.getElementById("tallyBody");
  const siteNames = Object.keys(data.blockedSites);
  if (!siteNames.length) {
    tallyBody.replaceChildren(emptyRow(4, "No sites blocked yet."));
  } else {
    tallyBody.replaceChildren(
      ...siteNames.map((site) => {
        const list = data.attempts[site] || [];
        const week = list.filter((a) => a.timestamp >= last7Cutoff).length;
        const today = list.filter((a) => dayKey(a.timestamp) === todayKey).length;
        return el("tr", null, el("td", null, site), el("td", null, list.length), el("td", null, week), el("td", null, today));
      })
    );
  }

  // today's attempts detail
  const todayBody = document.getElementById("todayBody");
  if (!todayAttempts.length) {
    todayBody.replaceChildren(emptyRow(4, "No attempts logged today."));
  } else {
    todayBody.replaceChildren(
      ...todayAttempts
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((a) => {
          const reason = a.searchQuery
            ? `${a.reason || "—"} (searched: "${a.searchQuery}")`
            : a.reason || "—";
          const outcome = a.proceeded ? `went in for ${a.minutes || "?"} min` : "stayed out";
          return el(
            "tr",
            null,
            el("td", null, new Date(a.timestamp).toLocaleTimeString()),
            el("td", null, a.site),
            el("td", null, reason),
            el("td", null, outcome)
          );
        })
    );
  }
})();
