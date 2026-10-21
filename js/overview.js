"use strict";
/* Overview: how am I doing right now? Position, pace, what needs attention, what changed this week. */

/* Things worth a look, most important first. Each is a short sentence with the number that matters. */
function attentionItems() {
  const items = [], dq = dataQuality(), pace = paceSeries(), say = (lvl, html) => items.push({ lvl, html });
  if (pace.typ) {
    if (pace.projected > pace.typFull * 1.1) say("watch", `<b>Spending pace.</b> On track for ${fmt0(pace.projected)} this month, ${pct(pace.projected / pace.typFull - 1)} above a typical month (${fmt0(pace.typFull)}).`);
    else if (pace.projected < pace.typFull * .9) say("good", `<b>Spending pace.</b> On track for ${fmt0(pace.projected)} this month, ${pct(pace.projected / pace.typFull - 1)} versus a typical month (${fmt0(pace.typFull)}).`);
  }
  const tickets = D.spend.filter(t => t.amt < 0).map(t => t.s), cutoff = Math.max(500, 3 * median(tickets));
  const isFixed = committedTest();
  D.spend.filter(t => t.day >= D.asOf - 20 && t.amt < 0 && t.s >= cutoff && !isFixed(t)).sort((a, b) => b.s - a.s).slice(0, 2)
    .forEach(t => say("watch", `<b>Large purchase.</b> ${fmt0(t.s)} at ${esc(t.v)} on ${dlabel(t.day)}. One-offs like this inflate averages; the typical-month figures use medians to damp them.`));
  recurring().filter(r => r.change > .03 && r.n >= 4 && r.c !== "Bills & Utilities").sort((a, b) => b.change * b.annual - a.change * a.annual).slice(0, 2)
    .forEach(r => say("watch", `<b>Price increase.</b> ${esc(r.v)} is up ${Math.round(r.change * 100)}% to ${fmt2(r.lastAmt)}.`));
  if (dq.unlinked.n) say("info", `<b>Card paydowns without detail.</b> ${dq.unlinked.n} payment${dq.unlinked.n === 1 ? "" : "s"} (${fmt0(dq.unlinked.amt)}) in the last 90 days went to cards with no matching history, so their purchases aren't itemized.`);
  if (dq.uncategorizedPct > .03) say("info", `<b>Uncategorized spending.</b> ${Math.round(dq.uncategorizedPct * 100)}% of the last 90 days (${fmt0(dq.uncategorized)}) has no category, mostly ${esc(dq.uncTop.slice(0, 3).map(x => x[0]).join(", "))}.`);
  const su = sourcesUses(D.asOf - 89, D.asOf), plug = [...su.src, ...su.use].find(x => x.plug);
  if (plug && plug.value > .02 * su.total) say("info", `<b>Unmatched money.</b> ${fmt0(plug.value)} of the last 90 days' flows can't be matched to an account, often a transfer to an account that isn't connected.`);
  if (dq.days < 120) say("info", `<b>Short history.</b> The data covers ${dq.weeks} weeks, so year-over-year and long-range views fill in as history builds up nightly.`);
  return items;
}

function overview() {
  const page = $("#page"), end = D.asOf, lo3 = end - 20, p = position(), tm = typicalMonth(), rw = runwayMonths(), pace = paceSeries(), dq = dataQuality();
  const curWk = spendOf(inWin(D.spend, end - 6, end)), prevWk = spendOf(inWin(D.spend, end - 13, end - 7)), all3 = inWin(D.spend, lo3, end);
  const inc3 = sum(inWin(D.income, lo3, end), t => t.amt);
  const pay3 = -sum(inWin(D.txs, lo3, end).filter(t => t.k === "card_payment" && t.amt < 0), t => t.amt);
  const d90 = { inc: sum(inWin(D.income, end - 89, end), t => t.amt), sp: spendOf(inWin(D.spend, end - 89, end)) };
  const nBank = Object.values(D.accts).filter(a => a.kind === "bank").length, nCard = Object.values(D.accts).filter(a => a.kind === "card").length;

  page.replaceChildren(pageHead("Overview", `As of ${isoOf(end)}. Your data covers ${dq.weeks} weeks (${isoOf(D.firstDay)} to ${isoOf(end)}).`));

  const parts = [`In the last 7 days you spent <b>${fmt0(curWk)}</b>` + (prevWk ? `, ${curWk <= prevWk ? "down" : "up"} ${Math.abs(Math.round((curWk / prevWk - 1) * 100))}% from the week before.` : ".")];
  parts.push(pace.typ ? `Month to date you're at <b>${fmt0(pace.now)}</b> against ${fmt0(pace.typToDate)} by this day in a typical month, so you're on pace to finish near <b>${fmt0(pace.projected)}</b> (typical ${fmt0(pace.typFull)}).`
    : `Month to date you've spent <b>${fmt0(pace.now)}</b>, which projects to about <b>${fmt0(pace.projected)}</b> for the month.`);
  if (d90.inc > 0) parts.push(d90.inc >= d90.sp ? `Over the last 90 days you kept <b>${fmt0(d90.inc - d90.sp)}</b> of the ${fmt0(d90.inc)} you earned (${Math.round((d90.inc - d90.sp) / d90.inc * 100)}%).`
    : `Over the last 90 days you spent <b>${fmt0(d90.sp - d90.inc)}</b> more than the ${fmt0(d90.inc)} you earned.`);
  if (rw != null) parts.push(`Cash on hand covers about <b>${rw.toFixed(1)} months</b> of typical spending.`);
  page.append(lede(parts.join(" ")));

  page.append(h("div", { class: "kgroup" }, "Where you stand"), h("div", { class: "kpis" },
    kpi("Cash", fmt0(p.cash), `${nBank} bank account${nBank === 1 ? "" : "s"}`),
    kpi("Card debt owed", fmt0(p.owed), `${nCard} card${nCard === 1 ? "" : "s"}`),
    kpi("Net liquid position", fmt0(p.net), "cash minus card debt", true),
    kpi("A typical month", fmt0(tm.value), tm.basis),
    kpi("Runway", rw == null ? "n/a" : rw.toFixed(1) + " months", "cash divided by a typical month")));
  page.append(h("div", { class: "kgroup" }, "Recent activity"), h("div", { class: "kpis" },
    kpi("Spent, last 7 days", fmt0(curWk), delta(curWk, prevWk, "vs prior week")),
    kpi("Weekly average (3 wks)", fmt0(spendOf(all3) / 3), `typical month is ${fmt0(tm.value)}`),
    kpi("Income (3 wks)", fmt0(inc3), (n => `${n} deposit${n === 1 ? "" : "s"}`)(D.income.filter(t => t.day >= lo3).length)),
    kpi("Net (3 wks)", fmt0(inc3 - spendOf(all3)), !inc3 ? "" : inc3 >= spendOf(all3) ? `${Math.round((inc3 - spendOf(all3)) / inc3 * 100)}% of income kept` : "spent more than came in"),
    kpi("Card paydowns (3 wks)", fmt0(pay3), D.unlinked(lo3) > 0 ? `+${fmt0(D.unlinked(lo3))} to cards without detail` : "counted once, not in spend")));

  const g = h("div", { class: "grid" }); page.append(g);

  // month-to-date pace against a typical month (both lines are cumulative and grow)
  const pc = card({ title: "Month-to-date pace", span: 7, height: 320,
    sub: pace.typ ? `${fmt0(pace.now)} so far; on pace for ${fmt0(pace.projected)} versus ${fmt0(pace.typFull)} in a typical month (average of the last ${pace.months} complete month${pace.months === 1 ? "" : "s"})`
      : `${fmt0(pace.now)} so far; projects to ${fmt0(pace.projected)}. A typical-month comparison needs one complete month of data.`,
    table: () => ({ cols: ["Day", "This month", "Typical month"], num: [1, 2], rows: Array.from({ length: pace.dim }, (_, i) => [String(i + 1), i < pace.dom ? fmt0(pace.cur[i]) : "-", pace.typ ? fmt0(pace.typ[i]) : "-"]) }) });
  pc.draw(() => {
    const t = T(), days = Array.from({ length: pace.dim }, (_, i) => String(i + 1));
    const ser = [{ name: "This month", type: "line", data: pace.cur.map(Math.round), symbol: "none", lineStyle: { color: t.accent, width: 3 }, itemStyle: { color: t.accent }, z: 6,
      endLabel: { show: true, formatter: p => `You\n${fmt0(p.value)}`, color: t.ink, fontSize: 12, fontWeight: 600, distance: 8 } }];
    if (pace.typ) ser.unshift({ name: "Typical month", type: "line", data: pace.typ.map(Math.round), symbol: "none", lineStyle: { color: t.muted, width: 2 }, itemStyle: { color: t.muted }, z: 3,
      endLabel: { show: true, formatter: p => `Typical\n${fmt0(p.value)}`, color: t.ink2, fontSize: 11, distance: 8 } });
    return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 56, right: 78, top: 30, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", valueFormatter: v => v == null ? "-" : fmt0(v) },
      xAxis: { type: "category", data: days, boundaryGap: false, ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 11, interval: 4 } }, yAxis: moneyAxis(), series: ser });
  });
  g.append(pc.root);

  // what needs attention
  const items = attentionItems(), glyph = { watch: "!", info: "i", good: "✓" }, word = { watch: "Watch", info: "Note", good: "Good" };
  g.append(h("div", { class: "card span-5" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Needs attention"), h("div", { class: "sub" }, "Generated from your data by fixed rules"))),
    items.length ? h("ul", { class: "attn" }, items.map(it => h("li", {}, h("span", { class: "gl " + it.lvl, "aria-hidden": "true" }, glyph[it.lvl]), h("span", { class: "sr" }, word[it.lvl] + ": "), h("span", { html: it.html }))))
      : h("div", { class: "note ok" }, "Nothing stands out. Spending is on pace and the data ties out.")));

  // what changed this week
  g.append(moversCard({ curLo: end - 6, curHi: end, prevLo: end - 13, prevHi: end - 7, title: "Biggest movers vs last week", curName: "This week", prevName: "Last week", span: 6, height: 300 }), dailyCard({ span: 6, height: 300 }));
  g.append(largestCard(lo3, end, { title: "Largest purchases, last 3 weeks" }), newVendorsCard(lo3, end));

  page.append(reconSection(lo3, end, "Last 3 weeks"));
}
