"use strict";
/* Accounts: what is connected, what it holds, how far to trust the numbers, and the full card reconciliation. */

const KIND_LABEL = { bank: "Bank account", card: "Credit card", loan: "Loan", dup: "Duplicate listing (ignored)" };

function accounts() {
  const page = $("#page"), sc = scopeWindow(scopeState.accounts), p = position(), dq = dataQuality(), perAcct = Object.fromEntries(dq.perAcct.map(a => [a.id, a]));
  page.replaceChildren(pageHead("Accounts and data quality", "What is connected, what it holds, and how far to trust the numbers.", "accounts"));
  page.append(h("div", { class: "kpis" },
    kpi("Cash", fmt0(p.cash), `${Object.values(D.accts).filter(a => a.kind === "bank").length} bank accounts`),
    kpi("Card debt owed", fmt0(p.owed), `${Object.values(D.accts).filter(a => a.kind === "card").length} cards`),
    kpi("Net liquid position", fmt0(p.net), "cash minus card debt", true),
    kpi("Data covers", `${dq.weeks} weeks`, `${isoOf(D.firstDay)} to ${isoOf(D.asOf)}`),
    kpi("Categorized", `${Math.round((1 - dq.uncategorizedPct) * 100)}%`, "of the last 90 days of spending")));
  const g = h("div", { class: "grid" }); page.append(g);

  // balances over time, rebuilt backwards from today's balances and the transactions
  const series = balanceSeries(Math.max(sc.lo, D.firstDay), sc.hi);
  const c1 = card({ title: "Cash and card debt over time", span: 12, height: 320,
    sub: `Rebuilt weekly from today's balances and your transactions, so it is only reliable from ${isoOf(D.firstDay)}, where your data starts.`,
    table: () => ({ cols: ["Week ending", "Cash", "Card debt owed", "Net liquid"], num: [1, 2, 3], rows: series.map(r => [dlabel(r.day), fmt0(r.cash), fmt0(r.owed), fmt0(r.net)]) }) });
  c1.draw(() => {
    const t = T(), x = series.map(r => dlabel(r.day));
    const line = (name, key, color, w, endLbl) => ({ name, type: "line", data: series.map(r => Math.round(r[key])), symbol: "circle", symbolSize: 5, showSymbol: series.length < 30, lineStyle: { color, width: w }, itemStyle: { color, borderColor: t.surface, borderWidth: 2 },
      endLabel: { show: true, formatter: p => `${endLbl}\n${fmt0(p.value)}`, color: t.ink, fontSize: 11, distance: 8 } });
    return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 60, right: 92, top: 30, bottom: 28 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", valueFormatter: v => fmt0(v) },
      xAxis: { type: "category", data: x, boundaryGap: false, ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(),
      series: [line("Cash", "cash", t.ink, 2, "Cash"), line("Card debt owed", "owed", t.muted, 2, "Owed"), line("Net liquid", "net", t.accent, 3, "Net")] });
  });
  g.append(c1.root);

  // accounts table
  const order = { bank: 0, card: 1, loan: 2, dup: 3 };
  const list = Object.entries(D.accts).sort((a, b) => (order[a[1].kind] ?? 9) - (order[b[1].kind] ?? 9) || b[1].balance - a[1].balance);
  const tbl = tableEl(["Account", "Type", "Balance", "Transactions", "First", "Last"],
    list.map(([id, a]) => { const s = perAcct[id]; return [`${a.org} ${a.name}`, KIND_LABEL[a.kind] || a.kind, fmt2(a.balance), s ? String(s.n) : "0", s ? dlabel(s.first) : "-", s ? dlabel(s.last) : "-"]; }), [2, 3]);
  [...tbl.tBodies[0].rows].forEach((tr, i) => { if (list[i][1].kind === "dup") tr.className = "dim"; });
  g.append(h("div", { class: "card span-7" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Accounts"), h("div", { class: "sub" }, "Card balances are negative when you owe money"))), h("div", { class: "tablev", style: "max-height:none" }, tbl)));

  // data quality
  const su = sourcesUses(D.asOf - 89, D.asOf), plug = [...su.src, ...su.use].find(x => x.plug), checks = [];
  const add = (lvl, html) => checks.push({ lvl, html });
  add(dq.days >= 120 ? "good" : "info", `<b>History:</b> ${dq.weeks} weeks of data. ` + (dq.days >= 120 ? "Enough for trends." : "Long-range charts fill in as history builds up nightly; banks only share about 90 days at a time."));
  if (dq.shortHistory.length) add("info", `<b>Shorter history:</b> ${esc(dq.shortHistory.map(a => D.accts[a.id].name).join(", "))} start${dq.shortHistory.length === 1 ? "s" : ""} later than the rest of your data, so older balances and card matches may be incomplete.`);
  add(dq.uncategorizedPct <= .03 ? "good" : "watch", `<b>Categories:</b> ${Math.round((1 - dq.uncategorizedPct) * 100)}% of the last 90 days is categorized.` + (dq.uncTop.length ? ` Biggest gaps: ${esc(dq.uncTop.map(x => x[0]).join(", "))}.` : ""));
  add(dq.unlinked.n ? "info" : "good", dq.unlinked.n ? `<b>Card paydowns:</b> ${dq.unlinked.n} payment${dq.unlinked.n === 1 ? "" : "s"} (${fmt0(dq.unlinked.amt)}) in 90 days have no matching card credit, so those purchases aren't itemized.` : "<b>Card paydowns:</b> every paydown in the last 90 days is matched to a card.");
  add(!plug || plug.value <= .02 * su.total ? "good" : "info", plug ? `<b>Money in vs out:</b> ${fmt0(plug.value)} (${(plug.value / su.total * 100).toFixed(1)}%) of 90-day flows can't be matched to an account.` : "<b>Money in vs out:</b> income, spending and balances tie out exactly over the last 90 days.");
  if (dq.dups) add("info", `<b>Duplicates:</b> ${dq.dups} duplicate account listing${dq.dups === 1 ? " is" : "s are"} ignored so nothing is counted twice.`);
  const glyph = { good: "✓", watch: "!", info: "i" }, word = { good: "Good", watch: "Watch", info: "Note" };
  g.append(h("div", { class: "card span-5" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Data quality"), h("div", { class: "sub" }, "How far to trust each part of the dashboard"))),
    h("ul", { class: "attn" }, checks.map(it => h("li", {}, h("span", { class: "gl " + it.lvl, "aria-hidden": "true" }, glyph[it.lvl]), h("span", { class: "sr" }, word[it.lvl] + ": "), h("span", { html: it.html }))))));

  page.append(reconSection(sc.lo, sc.hi, sc.key === "all" ? "All data" : `Last ${sc.label}`, { open: true }));
}
