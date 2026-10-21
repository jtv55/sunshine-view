"use strict";
/* Cards used by more than one page: biggest movers, daily spending, largest purchases, new vendors. */

/* Vendor-level change in spending between two windows (diverging bars: red = more, blue = less). */
function moversCard({ curLo, curHi, prevLo, prevHi, title, curName, prevName, span = 6, height = 300 }) {
  const vm = new Map();
  groupBy(inWin(D.spend, curLo, curHi), t => t.v).forEach((ts, v) => vm.set(v, [0, spendOf(ts)]));
  groupBy(inWin(D.spend, prevLo, prevHi), t => t.v).forEach((ts, v) => { const e = vm.get(v) || [0, 0]; e[0] = spendOf(ts); vm.set(v, e); });
  const moves = [...vm.entries()].map(([v, [p, c_]]) => ({ v, p, c: c_, d: c_ - p })).filter(x => Math.abs(x.d) >= 5);
  const ups = moves.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 8), downs = moves.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 8);
  const mv = [...ups, ...downs].sort((a, b) => a.d - b.d);
  if (!mv.length) return h("div", { class: `card span-${span}` }, h("h2", {}, title), h("div", { class: "note" }, "Not enough activity yet."));
  const c = card({ title, sub: "Change in spend by vendor: red = spending more, blue = spending less", span, height: Math.max(height, 40 + mv.length * 26),
    table: () => ({ cols: ["Vendor", prevName, curName, "Change"], num: [1, 2, 3], rows: mv.slice().reverse().map(x => [x.v, fmt0(x.p), fmt0(x.c), fmt0(x.d)]) }) });
  c.draw(() => {
    const t = T(), big = Math.max(...mv.map(x => Math.abs(x.d)), 1);
    return baseOpt({ legend: { show: false }, grid: { left: 8, right: 52, top: 6, bottom: 6, containLabel: true },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => { const x = mv[p.dataIndex]; return `<b>${esc(x.v)}</b><br>${prevName} ${fmt0(x.p)}<br>${curName} ${fmt0(x.c)}<br>Change <b>${fmt0(x.d)}</b>`; } },
      xAxis: { type: "value", ...axisStyle(), min: -big * 1.5, max: big * 1.5, axisLine: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: "category", data: mv.map(x => x.v), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.ink2, fontSize: 12, width: 110, overflow: "truncate" } },
      series: [{ type: "bar", barWidth: 12, data: mv.map(x => ({ value: Math.round(x.d), itemStyle: { color: x.d > 0 ? t.up : t.down, borderRadius: x.d > 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } })),
        label: { show: true, position: "outside", color: t.ink2, fontSize: 11, formatter: p => fmt0(p.value) } }] });
  });
  return c.root;
}

/* The last 21 days, one bar per day; the latest 7 are highlighted. */
function dailyCard({ span = 6, height = 300 } = {}) {
  const lo = D.asOf - 20, days = Array.from({ length: 21 }, (_, i) => lo + i), dsp = days.map(d => spendOf(D.spend.filter(t => t.day === d)));
  const c = card({ title: "Daily spending", sub: "Last 7 days highlighted; earlier two weeks in gray", span, height,
    table: () => ({ cols: ["Day", "Spent"], num: [1], rows: days.map((d, i) => [isoOf(d), fmt0(dsp[i])]) }) });
  c.draw(() => {
    const t = T();
    return baseOpt({ legend: { show: false }, grid: { left: 56, right: 8, top: 12, bottom: 34 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => `<b>${isoOf(days[ps[0].dataIndex])}</b><br>${fmt0(ps[0].value)}` },
      xAxis: { type: "category", data: days.map(d => WEEKDAY[new Date(d * 86400000).getUTCDay()] + "\n" + new Date(d * 86400000).getUTCDate()), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 10, interval: 0 } },
      yAxis: moneyAxis(), series: [{ type: "bar", barWidth: "62%", data: dsp.map((v, i) => ({ value: Math.round(v), itemStyle: { color: i >= 14 ? t.accent : t.other, borderRadius: [3, 3, 0, 0] } })) }] });
  });
  return c.root;
}

function largestCard(lo, hi, { title = "Largest purchases", span = 6 } = {}) {
  const big = inWin(D.spend, lo, hi).filter(t => t.amt < 0).sort((a, b) => b.s - a.s).slice(0, 8);
  return h("div", { class: `card span-${span}` }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, title), h("div", { class: "sub" }, `${dlabel(lo)} to ${dlabel(hi)}`))),
    big.length ? tableEl(["Date", "Vendor", "Category", "Amount"], big.map(t => [dlabel(t.day), t.v, catChip(t.c), fmt2(t.s)]), [3]) : h("div", { class: "note" }, "No purchases in this range."));
}

/* Vendors whose first-ever charge falls inside the window. Needs ~2 months of history to mean anything. */
function newVendorsCard(lo, hi, { span = 6 } = {}) {
  const firstSeen = new Map(); [...D.spend].reverse().forEach(t => { if (!firstSeen.has(t.v)) firstSeen.set(t.v, t.day); });
  const hist = D.asOf - D.firstDay > 60;
  const fresh = hist ? [...groupBy(inWin(D.spend, lo, hi), t => t.v)].map(([v, ts]) => ({ v, c: ts[0].c, s: spendOf(ts) })).filter(e => firstSeen.get(e.v) >= lo && e.s >= 10).sort((a, b) => b.s - a.s).slice(0, 8) : [];
  return h("div", { class: `card span-${span}` }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "New vendors"), h("div", { class: "sub" }, `First charge ever seen between ${dlabel(lo)} and ${dlabel(hi)}`))),
    fresh.length ? tableEl(["Vendor", "Category", "First seen", "Spent"], fresh.map(e => [e.v, catChip(e.c), dlabel(firstSeen.get(e.v)), fmt0(e.s)]), [3]) : h("div", { class: "note" }, hist ? "No new vendors in this range." : "Needs about two months of history."));
}
