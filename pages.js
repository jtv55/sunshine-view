"use strict";
/* Pages: weekly update, long-term trends, actionable insights (+ router and unlock). */

const lum = hex => { const p = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * p[0] + .7152 * p[1] + .0722 * p[2]; };
const onColor = bg => lum(bg) > .38 ? "#0b0b0b" : "#ffffff";
const topN = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const catChip = c => h("span", { class: "chip" }, h("i", { class: "dot", style: `background:${catColor(catGroup(c))}` }), c);
const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/* ================= WEEKLY ================= */
function weekly() {
  const page = $("#page"), end = D.asOf;
  const W = [2, 1, 0].map(i => ({ lo: end - 6 - 7 * i, hi: end - 7 * i }));
  W.forEach(w => { w.label = dlabel(w.lo) + " - " + dlabel(w.hi); w.tx = inWin(D.spend, w.lo, w.hi); w.total = spendOf(w.tx); });
  const cur = W[2], prev = W[1], lo3 = end - 20, all3 = inWin(D.spend, lo3, end);
  const inc3 = sum(inWin(D.income, lo3, end), t => t.amt);
  const pay3 = -sum(inWin(D.txs, lo3, end).filter(t => t.k === "card_payment" && t.amt < 0), t => t.amt);
  const base12 = spendOf(inWin(D.spend, end - 83, end)) / Math.max(1, Math.min(12, Math.ceil((end - D.firstDay + 1) / 7)));

  page.replaceChildren(h("div", { class: "pagehead" }, h("h1", {}, "Weekly update"), h("div", { class: "muted" }, `Trailing 3 weeks: ${W[0].label} to ${W[2].label} (weeks end ${isoOf(end)})`)));
  page.append(h("div", { class: "kpis" },
    kpi("Spent, last 7 days", fmt0(cur.total), delta(cur.total, prev.total, "vs prior week"), true),
    kpi("Weekly average (3 wks)", fmt0(spendOf(all3) / 3), `12-week average ${fmt0(base12)}`),
    kpi("Income (3 wks)", fmt0(inc3), (n => `${n} deposit${n === 1 ? "" : "s"}`)(D.income.filter(t => t.day >= lo3).length)),
    kpi("Net (3 wks)", fmt0(inc3 - spendOf(all3)), !inc3 ? "" : inc3 >= spendOf(all3) ? `${Math.round((inc3 - spendOf(all3)) / inc3 * 100)}% of income kept` : "spent more than came in"),
    kpi("Card paydowns (3 wks)", fmt0(pay3), D.unlinked(lo3) > 0 ? `+${fmt0(D.unlinked(lo3))} to cards without detail` : "counted once, not in spend")));
  const g = h("div", { class: "grid" }); page.append(g);

  // 1. stacked weeks by category + 12-week average line (single axis)
  const c1 = card({ title: "Weekly spend by category", sub: "Stacked by category; line is the 12-week average", span: 7, height: 340, legend: catLegend(),
    table: () => ({ cols: ["Category", ...W.map(w => w.label), "3-wk total"], num: [1, 2, 3, 4],
      rows: GROUPS.map(gp => { const v = W.map(w => spendOf(w.tx.filter(t => t.g === gp))); return [gp, ...v.map(fmt0), fmt0(sum(v))]; }).filter(r => r[4] !== "$0") }) });
  c1.draw(() => {
    const c = T(), ser = GROUPS.map(gp => ({ name: gp, type: "bar", stack: "w", barWidth: "46%", data: W.map(w => Math.round(spendOf(w.tx.filter(t => t.g === gp)))),
      itemStyle: { color: catColor(gp), borderColor: c.surface, borderWidth: 1 }, emphasis: { focus: "series" } }));
    ser.push({ name: "12-week average", type: "line", data: W.map(() => Math.round(base12)), symbol: "none", lineStyle: { color: c.ink, width: 2 }, z: 5,
      endLabel: { show: true, formatter: "12-wk avg " + fmt0(base12), color: c.ink2, fontSize: 11, distance: 6 } });
    ser.push({ name: "Total", type: "scatter", data: W.map(w => [w.label, Math.round(w.total)]), symbolSize: 0, silent: true, z: 1,
      label: { show: true, position: "top", color: c.ink, fontSize: 12, fontWeight: 600, formatter: p => fmt0(p.value[1]) }, tooltip: { show: false } });
    return baseOpt({ legend: { show: false }, grid: { left: 56, right: 92, top: 28, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => `<b>${ps[0].axisValue}</b><br>` + ps.filter(p => p.value && p.seriesName !== "Total").reverse().map(p => `${p.marker}${p.seriesName}: <b>${fmt0(p.value)}</b>`).join("<br>") },
      xAxis: { type: "category", data: W.map(w => w.label), ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(), series: ser });
  });
  g.append(c1.root);

  // 2. sunburst category -> vendor
  const c2 = card({ title: "Where it went: category to vendor", sub: "Inner ring category, outer ring vendors (3 weeks)", span: 5, height: 340,
    table: () => ({ cols: ["Category", "Vendor", "Spent"], num: [2], rows: sunRows(all3) }) });
  const sunRows = list => { const out = []; for (const [gp, ts] of groupBy(list, t => t.g)) for (const [v, vs] of groupBy(ts, t => t.v)) { const s = spendOf(vs); if (s > 0) out.push([gp, v, s]); } return out.sort((a, b) => b[2] - a[2]).map(r => [r[0], r[1], fmt0(r[2])]); };
  c2.draw(() => {
    const c = T(), data = [];
    for (const [gp, ts] of groupBy(all3, t => t.g)) {
      const col = catColor(gp), vmap = new Map([...groupBy(ts, t => t.v)].map(([v, vs]) => [v, spendOf(vs)])), vend = topN(vmap, 7).filter(([, s]) => s > 0);
      const known = sum(vend, ([, s]) => s), tot = spendOf(ts);
      if (tot <= 0) continue;
      const kids = vend.map(([v, s]) => ({ name: v, value: Math.round(s), itemStyle: { color: mix(col, c.surface, .38) }, label: { color: onColor(mix(col, c.surface, .38)) } }));
      if (tot - known > 1) kids.push({ name: "Other vendors", value: Math.round(tot - known), itemStyle: { color: mix(col, c.surface, .62) }, label: { show: false } });
      data.push({ name: gp, itemStyle: { color: col }, label: { color: onColor(col) }, children: kids });
    }
    return baseOpt({ legend: { show: false }, tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `${p.marker}${esc(p.name)}: <b>${fmt0(p.value)}</b>` },
      series: [{ type: "sunburst", data, radius: ["12%", "96%"], sort: "desc", nodeClick: false, itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 3 },
        label: { fontSize: 11, minAngle: 16 }, levels: [{}, { r0: "12%", r: "46%", label: { rotate: 0, fontWeight: 600 } }, { r0: "47%", r: "96%", label: { rotate: "radial", align: "center" } }] }] });
  });
  g.append(c2.root);

  // 3. vendor movers (diverging)
  const vm = new Map();
  groupBy(cur.tx, t => t.v).forEach((ts, v) => vm.set(v, [0, spendOf(ts)]));
  groupBy(prev.tx, t => t.v).forEach((ts, v) => { const e = vm.get(v) || [0, 0]; e[0] = spendOf(ts); vm.set(v, e); });
  const moves = [...vm.entries()].map(([v, [p, c_]]) => ({ v, p, c: c_, d: c_ - p })).filter(x => Math.abs(x.d) >= 5);
  const ups = moves.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 8), downs = moves.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 8);
  const mv = [...ups, ...downs].sort((a, b) => a.d - b.d);
  const c3 = card({ title: "Biggest movers vs last week", sub: "Change in spend by vendor: red = spending more, blue = spending less", span: 6, height: Math.max(220, 40 + mv.length * 26),
    table: () => ({ cols: ["Vendor", "Last week", "This week", "Change"], num: [1, 2, 3], rows: mv.slice().reverse().map(x => [x.v, fmt0(x.p), fmt0(x.c), fmt0(x.d)]) }) });
  c3.draw(() => {
    const c = T();
    return baseOpt({ legend: { show: false }, grid: { left: 8, right: 52, top: 6, bottom: 6, containLabel: true },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => { const x = mv[p.dataIndex]; return `<b>${esc(x.v)}</b><br>Last week ${fmt0(x.p)}<br>This week ${fmt0(x.c)}<br>Change <b>${fmt0(x.d)}</b>`; } },
      xAxis: { type: "value", ...axisStyle(), min: -Math.max(...mv.map(x => Math.abs(x.d)), 1) * 1.5, max: Math.max(...mv.map(x => Math.abs(x.d)), 1) * 1.5, axisLine: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: { type: "category", data: mv.map(x => x.v), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: c.ink2, fontSize: 12, width: 110, overflow: "truncate" } },
      series: [{ type: "bar", barWidth: 12, data: mv.map(x => ({ value: Math.round(x.d), itemStyle: { color: x.d > 0 ? c.up : c.down, borderRadius: x.d > 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } })),
        label: { show: true, position: "outside", color: c.ink2, fontSize: 11, formatter: p => fmt0(p.value) } }] });
  });
  g.append(mv.length ? c3.root : h("div", { class: "card span-6" }, h("h2", {}, "Biggest movers vs last week"), h("div", { class: "note" }, "Not enough activity yet.")));

  // 4. daily rhythm
  const days = Array.from({ length: 21 }, (_, i) => lo3 + i);
  const dsp = days.map(d => spendOf(D.spend.filter(t => t.day === d)));
  const c4 = card({ title: "Daily spending", sub: "Last 7 days highlighted; earlier two weeks in gray", span: 6, height: Math.max(220, 40 + mv.length * 26),
    table: () => ({ cols: ["Day", "Spent"], num: [1], rows: days.map((d, i) => [isoOf(d), fmt0(dsp[i])]) }) });
  c4.draw(() => {
    const c = T();
    return baseOpt({ legend: { show: false }, grid: { left: 56, right: 8, top: 12, bottom: 34 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => `<b>${isoOf(days[ps[0].dataIndex])}</b><br>${fmt0(ps[0].value)}` },
      xAxis: { type: "category", data: days.map(d => WEEKDAY[new Date(d * 86400000).getUTCDay()] + "\n" + new Date(d * 86400000).getUTCDate()), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: c.muted, fontSize: 10, interval: 0 } },
      yAxis: moneyAxis(), series: [{ type: "bar", barWidth: "62%", data: dsp.map((v, i) => ({ value: Math.round(v), itemStyle: { color: i >= 14 ? c.accent : c.other, borderRadius: [3, 3, 0, 0] } })) }] });
  });
  g.append(c4.root);

  // 5. vendor x week heat table
  const vt = new Map(); all3.forEach(t => { const e = vt.get(t.v) || { v: t.v, c: t.c, w: [0, 0, 0] }; const wi = W.findIndex(w => t.day >= w.lo && t.day <= w.hi); if (wi >= 0) e.w[wi] += t.s; vt.set(t.v, e); });
  const vrows = [...vt.values()].map(e => ({ ...e, tot: sum(e.w) })).filter(e => e.tot > 0).sort((a, b) => b.tot - a.tot).slice(0, 14);
  const mx = Math.max(1, ...vrows.flatMap(r => r.w));
  const heat = h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Top vendors by week"), h("div", { class: "sub" }, "Shading shows relative size within the table"))),
    h("div", { class: "tablev", style: "max-height:none" }, (() => {
      const t = tableEl(["Vendor", "Category", ...W.map(w => w.label), "3-wk total", "vs prior wk"], [], [2, 3, 4, 5, 6]);
      t.tBodies[0].append(...vrows.map(r => { const tr = h("tr", {}, h("td", {}, r.v), h("td", {}, catChip(r.c)),
        ...r.w.map(v => h("td", { class: "n", style: `background:color-mix(in srgb, var(--accent) ${Math.round(v / mx * 55)}%, transparent)` }, v ? fmt0(v) : "-")),
        h("td", { class: "n" }, h("b", {}, fmt0(r.tot))), h("td", { class: "n" }, r.w[1] ? pct((r.w[2] - r.w[1]) / r.w[1]) : "new")); return tr; }));
      return t; })()));
  g.append(heat);

  // 6. biggest purchases + new vendors
  const big = all3.filter(t => t.amt < 0).sort((a, b) => b.s - a.s).slice(0, 8);
  g.append(h("div", { class: "card span-6" }, h("div", { class: "hd" }, h("h2", {}, "Largest purchases")), tableEl(["Date", "Vendor", "Category", "Amount"],
    big.map(t => [dlabel(t.day), t.v, catChip(t.c), fmt2(t.s)]), [3])));
  const firstSeen = new Map(); [...D.spend].reverse().forEach(t => { if (!firstSeen.has(t.v)) firstSeen.set(t.v, t.day); });
  const hist = end - D.firstDay > 60;
  const fresh = hist ? [...vt.values()].filter(e => firstSeen.get(e.v) >= lo3 && sum(e.w) >= 10).sort((a, b) => sum(b.w) - sum(a.w)).slice(0, 8) : [];
  g.append(h("div", { class: "card span-6" }, h("div", { class: "hd" }, h("h2", {}, "New vendors"), h("div", { class: "sub" }, "First charge ever seen in the last 3 weeks")),
    fresh.length ? tableEl(["Vendor", "Category", "First seen", "Spent"], fresh.map(e => [e.v, catChip(e.c), dlabel(firstSeen.get(e.v)), fmt0(sum(e.w))]), [3]) : h("div", { class: "note" }, "No new vendors this period.")));

  page.append(reconSection(lo3, end, "Last 3 weeks"));
}

/* ================= TRENDS ================= */
let trendRange = 12;
function trends() {
  const page = $("#page"), avail = Math.max(1, Math.floor((D.asOf - D.firstDay) / 30.4));
  const N = Math.min(trendRange, Math.max(3, avail)), months = completeMonths(N).filter(m => m >= isoOf(D.firstDay).slice(0, 7));
  const lo = dayNum(months[0] + "-01"), hi = D.asOf;
  const byM = Object.fromEntries(months.map(m => [m, { tot: 0, inc: 0, g: Object.fromEntries(GROUPS.map(x => [x, 0])) }]));
  D.spend.forEach(t => { const e = byM[t.m]; if (e) { e.tot += t.s; e.g[t.g] += t.s; } });
  D.income.forEach(t => { const e = byM[t.m]; if (e) e.inc += t.amt; });
  const tots = months.map(m => byM[m].tot), incs = months.map(m => byM[m].inc);
  const avgSp = sum(tots) / months.length, avgInc = sum(incs) / months.length;
  const last = months[months.length - 1], mtd = spendOf(D.spend.filter(t => t.m === D.curMonth));

  const sel = h("select", { "aria-label": "Range", onchange: e => { trendRange = +e.target.value; route(); } }, [6, 12, 24].map(n => h("option", { value: n, selected: n === trendRange ? "" : null }, `Last ${n} months`)));
  page.replaceChildren(h("div", { class: "pagehead" }, h("h1", {}, "Long-term trends"), h("div", { class: "filters" }, h("span", { class: "muted" }, `${mlabel(months[0])} to ${mlabel(last)} (complete months)`), sel)));
  page.append(h("div", { class: "kpis" },
    kpi("Avg monthly spend", fmt0(avgSp), `${months.length} months`, true),
    kpi("Avg monthly income", fmt0(avgInc), ""),
    kpi("Avg monthly net", fmt0(avgInc - avgSp), !avgInc ? "" : avgInc >= avgSp ? `${Math.round((avgInc - avgSp) / avgInc * 100)}% savings rate` : "spending exceeds income"),
    kpi(mlabel(last) + " vs average", fmt0(byM[last].tot), delta(byM[last].tot, avgSp, "vs avg")),
    kpi("Month to date", fmt0(mtd), mlabel(D.curMonth))));
  if (!D.lumps && D.unlinked(lo) > 0) page.append(h("div", { class: "note", style: "margin:-4px 0 12px" },
    `Note: ${fmt0(D.unlinked(lo))} of card paydowns in this range have no matching card detail, so they are left out of spending. Months before a card's history begins can look low. Tick "Count card paydowns without detail" (top right) to include them as one lump.`));
  const g = h("div", { class: "grid" }); page.append(g);

  // 1. combo: stacked categories + income line + 3-mo avg line
  const roll = tots.map((_, i) => sum(tots.slice(Math.max(0, i - 2), i + 1)) / Math.min(3, i + 1));
  const c1 = card({ title: "Monthly spending by category vs income", sub: "Bars stack to total spend; lines share the same dollar axis", span: 12, height: 380, legend: catLegend(),
    table: () => ({ cols: ["Month", ...GROUPS, "Total", "Income"], num: GROUPS.map((_, i) => i + 1).concat([10, 11]), rows: months.map(m => [mlabel(m), ...GROUPS.map(x => fmt0(byM[m].g[x])), fmt0(byM[m].tot), fmt0(byM[m].inc)]) }) });
  c1.draw(() => {
    const c = T(), ser = GROUPS.map(gp => ({ name: gp, type: "bar", stack: "m", barWidth: "58%", data: months.map(m => Math.round(byM[m].g[gp])), itemStyle: { color: catColor(gp), borderColor: c.surface, borderWidth: 1 }, emphasis: { focus: "series" } }));
    ser.push({ name: "Income", type: "line", data: incs.map(Math.round), symbol: "circle", symbolSize: 7, lineStyle: { color: c.ink, width: 2 }, itemStyle: { color: c.ink, borderColor: c.surface, borderWidth: 2 }, z: 6 });
    ser.push({ name: "3-month avg spend", type: "line", data: roll.map(Math.round), symbol: "none", smooth: true, lineStyle: { color: c.muted, width: 2 }, itemStyle: { color: c.muted }, z: 5 });
    return baseOpt({ legend: { ...baseOpt().legend, data: ["Income", "3-month avg spend"], right: 0, left: "auto" }, grid: { left: 56, right: 12, top: 30, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => `<b>${ps[0].axisValue}</b><br>` + ps.filter(p => p.value).reverse().map(p => `${p.marker}${p.seriesName}: <b>${fmt0(p.value)}</b>`).join("<br>") },
      xAxis: { type: "category", data: months.map(mlabel), ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(), series: ser });
  });
  g.append(c1.root);

  // 2. net per month diverging
  const nets = months.map(m => byM[m].inc - byM[m].tot);
  const c2 = card({ title: "Net per month", sub: "Income minus spending: blue = surplus, red = shortfall", span: 6, height: 300,
    table: () => ({ cols: ["Month", "Income", "Spend", "Net", "Savings rate"], num: [1, 2, 3, 4], rows: months.map((m, i) => [mlabel(m), fmt0(incs[i]), fmt0(tots[i]), fmt0(nets[i]), incs[i] ? Math.round(nets[i] / incs[i] * 100) + "%" : "-"]) }) });
  c2.draw(() => { const c = T();
    return baseOpt({ legend: { show: false }, grid: { left: 56, right: 8, top: 12, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => { const i = ps[0].dataIndex; return `<b>${ps[0].axisValue}</b><br>Net <b>${fmt0(nets[i])}</b><br>Income ${fmt0(incs[i])}<br>Spend ${fmt0(tots[i])}`; } },
      xAxis: { type: "category", data: months.map(mlabel), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: c.muted, fontSize: 11 } }, yAxis: moneyAxis(),
      series: [{ type: "bar", barWidth: "58%", data: nets.map(v => ({ value: Math.round(v), itemStyle: { color: v >= 0 ? c.down : c.up, borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } })) }] }); });
  g.append(c2.root);

  // 3. year over year cumulative
  const yr = +D.curMonth.slice(0, 4), cum = year => { let run = 0; return Array.from({ length: 12 }, (_, i) => { const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    if (m > last && year === yr) return null; const v = spendOf(D.spend.filter(t => t.m === m)); run += v; return Math.round(run); }); };
  const cy = cum(yr), py = cum(yr - 1), hasPy = D.firstDay <= dayNum(`${yr - 1}-06-30`);
  const c3 = card({ title: "Year over year: cumulative spend", sub: hasPy ? `${yr} vs ${yr - 1}, complete months` : "Needs a prior year of history", span: 6, height: 300,
    table: () => ({ cols: ["Month", String(yr), String(yr - 1)], num: [1, 2], rows: MON.map((m, i) => [m, cy[i] == null ? "-" : fmt0(cy[i]), fmt0(py[i])]) }) });
  c3.draw(() => { const c = T();
    return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 56, right: 12, top: 30, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", valueFormatter: v => v == null ? "-" : fmt0(v) },
      xAxis: { type: "category", data: MON, ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(),
      series: [{ name: String(yr - 1), type: "line", data: py, symbol: "none", lineStyle: { color: c.other, width: 2 }, itemStyle: { color: c.other } },
        { name: String(yr), type: "line", data: cy, symbol: "circle", symbolSize: 6, lineStyle: { color: c.accent, width: 2.5 }, itemStyle: { color: c.accent, borderColor: c.surface, borderWidth: 2 } }] }); });
  g.append(c3.root);

  // 4. treemap vendors by category
  const inRange = D.spend.filter(t => t.day >= lo && t.m <= last);
  const vt = [...groupBy(inRange, t => t.v)].map(([v, ts]) => ({ v, g: ts[0].g, c: ts[0].c, s: spendOf(ts) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const c4 = card({ title: "Vendor map", sub: `Area = spend over the range; top 40 vendors, colored by category`, span: 6, height: 440, legend: catLegend(),
    table: () => ({ cols: ["Vendor", "Category", "Spent", "Per month"], num: [2, 3], rows: vt.slice(0, 40).map(x => [x.v, x.c, fmt0(x.s), fmt0(x.s / months.length)]) }) });
  c4.draw(() => { const c = T(), kids = new Map();
    vt.slice(0, 40).forEach(x => { const col = catColor(x.g), bg = mix(col, c.surface, .12); (kids.get(x.g) || kids.set(x.g, []).get(x.g)).push({ name: x.v, value: Math.round(x.s), itemStyle: { color: bg }, label: { color: onColor(bg) } }); });
    const data = [...kids].map(([gp, ch]) => ({ name: gp, itemStyle: { color: catColor(gp) }, children: ch }));
    return baseOpt({ legend: { show: false }, tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `${p.marker}${esc(p.name)}: <b>${fmt0(p.value)}</b>` },
      series: [{ type: "treemap", data, roam: false, nodeClick: false, breadcrumb: { show: false }, width: "100%", height: "100%", top: 0, left: 0, right: 0, bottom: 0,
        label: { show: true, formatter: p => p.name + "\n" + fmt0(p.value), fontSize: 11, overflow: "truncate", position: "insideTopLeft", padding: 4 },
        upperLabel: { show: true, height: 20, color: c.ink, fontWeight: 600, fontSize: 11 },
        levels: [{ itemStyle: { borderColor: c.surface, borderWidth: 0, gapWidth: 3 } }, { itemStyle: { borderColor: c.surface, borderWidth: 2, gapWidth: 2 }, upperLabel: { show: true } }, { itemStyle: { borderColor: c.surface, borderWidth: 1, gapWidth: 1 } }] }] }); });
  g.append(c4.root);

  // 5. heatmap category x month
  const present = GROUPS.filter(gp => months.some(m => byM[m].g[gp] > 0)), cells = [];
  present.forEach((gp, y) => months.forEach((m, x) => cells.push([x, y, Math.round(byM[m].g[gp])])));
  const c5 = card({ title: "Category by month", sub: "Darker = more spend in that month", span: 6, height: 440,
    table: () => ({ cols: ["Category", ...months.map(mlabel)], num: months.map((_, i) => i + 1), rows: present.map(gp => [gp, ...months.map(m => fmt0(byM[m].g[gp]))]) }) });
  c5.draw(() => { const c = T(), mxv = Math.max(1, ...cells.map(x => x[2]));
    return baseOpt({ legend: { show: false }, grid: { left: 96, right: 14, top: 8, bottom: 70 },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `<b>${present[p.value[1]]}</b>, ${mlabel(months[p.value[0]])}<br><b>${fmt0(p.value[2])}</b>` },
      xAxis: { type: "category", data: months.map(mlabel), ...axisStyle(), splitArea: { show: false }, splitLine: { show: false }, axisLabel: { color: c.muted, fontSize: 10, rotate: months.length > 12 ? 45 : 0 } },
      yAxis: { type: "category", data: present, inverse: true, ...axisStyle(), splitLine: { show: false }, axisLabel: { color: c.ink2, fontSize: 12 } },
      visualMap: { min: 0, max: mxv, orient: "horizontal", left: "center", bottom: 4, itemWidth: 12, itemHeight: 140, calculable: false, text: [fmt0(mxv), "$0"], textStyle: { color: c.muted, fontSize: 11 }, inRange: { color: c.seq } },
      series: [{ type: "heatmap", data: cells, itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: c.ink } } }] }); });
  g.append(c5.root);

  // 6. vendor small multiples
  const top12 = vt.slice(0, 12), sm = h("div", { class: "sm" });
  const smCard = h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Top vendors month by month"), h("div", { class: "sub" }, "Each panel has its own scale; color is the vendor's category"))), sm);
  g.append(smCard);
  top12.forEach(x => {
    const series = months.map(m => spendOf(inRange.filter(t => t.v === x.v && t.m === m))), avg = sum(series) / months.length, lastv = series[series.length - 1];
    const box = h("div", { style: "height:64px" });
    sm.append(h("div", { class: "cell" }, h("div", { class: "t", title: x.v }, x.v), box, h("div", { class: "s" }, `${fmt0(avg)}/mo avg, ${mlabel(last)} ${fmt0(lastv)} `, h("b", {}, avg ? pct((lastv - avg) / avg) : ""))));
    lazyChart(box, () => ({ animation: false, grid: { left: 0, right: 0, top: 4, bottom: 0 }, xAxis: { type: "category", show: false, data: months.map(mlabel) }, yAxis: { type: "value", show: false },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "none" }, formatter: ps => `${ps[0].axisValue}: <b>${fmt0(ps[0].value)}</b>` },
      series: [{ type: "bar", data: series.map(Math.round), barWidth: "70%", itemStyle: { color: catColor(x.g), borderRadius: [2, 2, 0, 0] } }] }));
  });

  page.append(reconSection(lo, hi, `${mlabel(months[0])} through today`));
}

/* ================= INSIGHTS ================= */
const STREAM = /netflix|hulu|disney|\bmax\b|paramount|peacock|youtube|apple (tv|services)|prime video|amazon prime|crunchyroll|sirius|spotify|audible/i;
function recurring() {
  const out = [];
  for (const [v, ts0] of groupBy(D.spend.filter(t => t.amt < 0), t => t.v)) {
    const ts = ts0.sort((a, b) => a.day - b.day); if (ts.length < 3) continue;
    const gaps = ts.slice(1).map((t, i) => t.day - ts[i].day), mg = median(gaps), amts = ts.map(t => t.s), typ = median(amts);
    const tol = ts[0].c === "Bills & Utilities" ? .35 : .12, stable = median(amts.map(a => Math.abs(a - typ))) <= tol * typ;
    const cad = mg >= 26 && mg <= 35 ? ["Monthly", 12] : mg >= 85 && mg <= 95 ? ["Quarterly", 4] : mg >= 350 && mg <= 380 ? ["Annual", 1] : mg >= 12 && mg <= 16 ? ["Biweekly", 26] : null;
    if (!cad || !stable) continue;
    const lastAmt = ts[ts.length - 1].s, before = median(amts.slice(0, -1));
    if (D.asOf - ts[ts.length - 1].day > mg * 2.2 + 10) continue; // lapsed
    out.push({ v, c: ts[0].c, g: ts[0].g, cad: cad[0], typ, annual: typ * cad[1], last: ts[ts.length - 1].day, n: ts.length, change: before ? (lastAmt - before) / before : 0, lastAmt });
  }
  return out.sort((a, b) => b.annual - a.annual);
}

function insights() {
  const page = $("#page"), avail = Math.max(1, Math.floor((D.asOf - D.firstDay) / 30.4)), N = Math.min(12, Math.max(3, avail));
  const months = completeMonths(N).filter(m => m >= isoOf(D.firstDay).slice(0, 7)), M = months.length, lo = dayNum(months[0] + "-01");
  const rows = D.spend.filter(t => t.day >= lo && t.m <= months[M - 1]), ann = f => spendOf(rows.filter(f)) / M * 12;
  const rec = recurring(), recNonEss = rec.filter(r => ["Subscriptions", "Entertainment", "Education", "Personal Care"].includes(r.c) || r.c === "Subscriptions");
  const subsBase = Math.max(ann(t => t.c === "Subscriptions"), sum(recNonEss, r => r.annual));
  const levers = [
    { k: "subs", name: "Subscriptions and recurring extras", base: subsBase, pct: 20, max: 60, how: "cancel or rotate services you barely use" },
    { k: "din", name: "Dining and delivery", base: ann(t => t.c === "Dining"), pct: 15, max: 60, how: "cook or order in a little less" },
    { k: "shp", name: "Shopping", base: ann(t => t.c === "Shopping"), pct: 15, max: 60, how: "add a 48-hour wait on non-essentials" },
    { k: "trn", name: "Transport (fuel, rideshare, parking)", base: ann(t => t.c === "Transport"), pct: 10, max: 50, how: "bundle trips and avoid surge rides" },
    { k: "bil", name: "Bills and utilities", base: ann(t => t.c === "Bills & Utilities"), pct: 8, max: 30, how: "renegotiate phone, internet and insurance annually" },
    { k: "fee", name: "Fees and interest", base: ann(t => t.c === "Fees & Interest"), pct: 100, max: 100, how: "avoidable with autopay, alerts and paying statements in full" },
  ].filter(l => l.base > 0);
  const save = l => l.base * l.pct / 100;

  page.replaceChildren(h("div", { class: "pagehead" }, h("h1", {}, "Actionable insights"), h("div", { class: "muted" }, `Based on the last ${M} complete months. All figures annualized.`)));
  const g = h("div", { class: "grid" }); page.append(g);

  // hero + sliders
  const heroV = h("div", { class: "v", style: "font-size:34px;font-weight:650;letter-spacing:-.02em" }), heroS = h("div", { class: "d muted" });
  const sl = h("div", { class: "sliders", style: "margin-top:12px" });
  let leverChart = null;
  const refresh = () => { const tot = sum(levers, save); heroV.textContent = fmt0(tot) + " / yr"; heroS.textContent = `${fmt0(tot / 12)} per month, ${Math.round(tot / Math.max(1, ann(() => true)) * 100)}% of total spend`;
    leverChart && leverChart.setOption({ series: [{ data: levers.map(l => Math.round(save(l))) }] }); };
  levers.forEach(l => { const out = h("output", {}, l.pct + "%"), inp = h("input", { type: "range", min: 0, max: l.max, value: l.pct, "aria-label": l.name,
    oninput: e => { l.pct = +e.target.value; out.textContent = l.pct + "%"; refresh(); } });
    sl.append(h("div", { class: "sl" }, h("label", {}, l.name, h("span", { class: "muted" }, " " + fmt0(l.base) + "/yr")), out, inp)); });
  g.append(h("div", { class: "card span-4" }, h("div", { class: "l muted" }, "Savings opportunity (adjustable)"), heroV, heroS, h("div", { class: "note" }, "Drag a slider to see what a different target is worth. Defaults are conservative."), sl));

  // vendor frequency / ticket stats (quadrant + narrative)
  const vstat = [...groupBy(rows.filter(t => t.amt < 0), t => t.v)].map(([v, ts]) => ({ v, c: ts[0].c, n: ts.length, tot: spendOf(ts), freq: ts.length / M, tick: spendOf(ts) / ts.length }))
    .filter(x => x.n >= 4 && x.tot >= 60).sort((a, b) => b.tot - a.tot).slice(0, 90);
  const mxF = median(vstat.map(x => x.freq)) || 1, mxT = median(vstat.map(x => x.tick)) || 1;
  vstat.forEach(x => { x.q = x.freq >= mxF ? (x.tick <= mxT ? "Habit leaks" : "Staples") : (x.tick <= mxT ? "Occasional" : "Big bets"); });
  const leaks = vstat.filter(x => x.q === "Habit leaks");

  // narrative
  const bullets = [];
  [...levers].sort((a, b) => save(b) - save(a)).slice(0, 4).forEach(l => {
    const gp = { subs: "Subscriptions", din: "Dining", shp: "Shopping", trn: "Transport", bil: "Bills & Utilities" }[l.k];
    const top = gp ? topN(new Map([...groupBy(rows.filter(t => t.c === gp), t => t.v)].map(([v, ts]) => [v, spendOf(ts)])), 3).map(([v, s]) => `${v} (${fmt0(s / M * 12)})`).join(", ") : "";
    bullets.push(`<b>${l.name}:</b> ${fmt0(l.base)} a year (${fmt0(l.base / 12)}/mo). If you ${l.how} and cut ${l.pct}%, that is about <b>${fmt0(save(l))}</b> a year.${top ? " Largest: " + esc(top) + "." : ""}`);
  });
  const stream = rec.filter(r => STREAM.test(r.v));
  if (stream.length >= 3) bullets.push(`<b>Streaming overlap:</b> ${stream.length} services (${stream.map(r => esc(r.v)).join(", ")}) cost ${fmt0(sum(stream, r => r.annual))} a year. Keeping the two you use most and rotating the rest could save roughly ${fmt0(sum(stream, r => r.annual) * .5)}.`);
  const hikes = rec.filter(r => r.change > .03 && r.n >= 4 && r.c !== "Bills & Utilities").sort((a, b) => b.change * b.annual - a.change * a.annual).slice(0, 3);
  if (hikes.length) bullets.push(`<b>Price creep:</b> ${hikes.map(r => `${esc(r.v)} is up ${Math.round(r.change * 100)}% to ${fmt2(r.lastAmt)}`).join("; ")}. Worth a call or a plan downgrade.`);
  const cats = GROUPS.map(gp => { const rec3 = completeMonths(3), prior = completeMonths(12).slice(0, 9);
    const a = spendOf(D.spend.filter(t => t.g === gp && rec3.includes(t.m))) / 3, b = spendOf(D.spend.filter(t => t.g === gp && prior.includes(t.m))) / 9; return { gp, a, b, d: a - b }; }).filter(x => x.b > 20);
  const rise = cats.filter(x => x.d > 0).sort((a, b) => b.d - a.d)[0];
  if (rise && rise.d / rise.b > .1) bullets.push(`<b>${rise.gp}</b> is trending up: ${fmt0(rise.a)}/mo over the last 3 months versus ${fmt0(rise.b)}/mo before, a rise of ${pct(rise.d / rise.b)}. Returning to the earlier level saves ${fmt0(rise.d * 12)} a year.`);
  if (leaks.length >= 3) bullets.push(`<b>Habit leaks:</b> ${leaks.length} vendors are frequent, small purchases that add up to ${fmt0(sum(leaks, x => x.tot / M * 12))} a year (largest: ${esc(leaks.slice(0, 3).map(x => x.v).join(", "))}). Individually they feel harmless; together they are real money.`);
  const fees = ann(t => t.c === "Fees & Interest"); if (fees > 0) bullets.push(`<b>Fees and interest</b> cost ${fmt0(fees)} a year. These buy nothing, so they are the easiest dollars to remove.`);
  g.append(h("div", { class: "card span-8" }, h("div", { class: "hd" }, h("h2", {}, "What the data says")), bullets.length ? h("ul", { class: "bul" }, bullets.map(b => h("li", { html: b }))) : h("div", { class: "note" }, "Not enough history yet."),
    h("div", { class: "note" }, "These notes are generated from your transactions by fixed rules, not by a person. Check each one before acting.")));

  // lever bars
  const c1 = card({ title: "Savings by lever", sub: "Annual savings at the slider settings", span: 6, height: 300,
    table: () => ({ cols: ["Lever", "Annual spend", "Target cut", "Annual savings"], num: [1, 2, 3], rows: levers.map(l => [l.name, fmt0(l.base), l.pct + "%", fmt0(save(l))]) }) });
  leverChart = c1.draw(() => { const c = T();
    return baseOpt({ legend: { show: false }, grid: { left: 8, right: 56, top: 6, bottom: 6, containLabel: true },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `${esc(levers[p.dataIndex].name)}<br><b>${fmt0(p.value)}</b> a year` },
      xAxis: { type: "value", show: false }, yAxis: { type: "category", inverse: true, data: levers.map(l => l.name), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: c.ink2, fontSize: 12, width: 200, overflow: "truncate" } },
      series: [{ type: "bar", barWidth: 14, data: levers.map(l => Math.round(save(l))), itemStyle: { color: c.accent, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: "right", color: c.ink2, fontSize: 11, formatter: p => fmt0(p.value) } }] }); });
  g.append(c1.root); refresh();

  // quadrant
  const c2 = card({ title: "Frequency vs ticket size", sub: "Each dot is a vendor. Orange = frequent small purchases (habit leaks). Size = annual spend", span: 6, height: 420,
    table: () => ({ cols: ["Vendor", "Quadrant", "Charges / mo", "Avg ticket", "Annual spend"], num: [2, 3, 4], rows: vstat.map(x => [x.v, x.q, x.freq.toFixed(1), fmt2(x.tick), fmt0(x.tot / M * 12)]) }) });
  c2.draw(() => { const c = T(), hot = css("--s2"), pt = x => ({ value: [x.freq, x.tick, x.tot / M * 12], name: x.v, q: x.q, c: x.c });
    const lab = new Set(leaks.slice(0, 6).concat(vstat.filter(x => x.q !== "Habit leaks").slice(0, 3)).map(x => x.v));
    const mk = (name, list, color, op) => ({ name, type: "scatter", data: list.map(pt), symbolSize: d => Math.max(8, Math.min(44, Math.sqrt(d[2]) * .9)), itemStyle: { color, opacity: op, borderColor: c.surface, borderWidth: 2 },
      label: { show: true, formatter: p => lab.has(p.name) ? p.name : "", position: "right", color: c.ink2, fontSize: 11 }, labelLayout: { hideOverlap: true }, emphasis: { scale: 1.2 } });
    const q = (x, y, t) => ({ type: "text", left: x, top: y, style: { text: t, fill: c.muted, font: `600 12px ${FONT}` } });
    return baseOpt({ legend: { show: false }, grid: { left: 54, right: 84, top: 16, bottom: 44 },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `<b>${esc(p.name)}</b> (${esc(p.data.c)})<br>${p.value[0].toFixed(1)} charges/mo, avg ${fmt2(p.value[1])}<br>Annual spend <b>${fmt0(p.value[2])}</b><br><i>${p.data.q}</i>` },
      xAxis: { type: "log", name: "charges per month", nameLocation: "middle", nameGap: 26, nameTextStyle: { color: c.muted, fontSize: 11 }, ...axisStyle(), axisLabel: { color: c.muted, fontSize: 11, formatter: v => v < 1 ? v.toFixed(1) : v } },
      yAxis: { type: "log", name: "", ...axisStyle(), axisLabel: { color: c.muted, fontSize: 11, formatter: v => "$" + v } },
      graphic: [q(60, 20, "BIG BETS"), q("78%", 20, "STAPLES"), q(60, "78%", "OCCASIONAL"), q("74%", "78%", "HABIT LEAKS")],
      series: [{ ...mk("Other vendors", vstat.filter(x => x.q !== "Habit leaks"), c.other, .75), markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: c.axis, width: 1, type: "solid" }, data: [{ xAxis: mxF }, { yAxis: mxT }] } },
        mk("Habit leaks", leaks, hot, .92)] }); });
  g.append(c2.root);

  // creep dumbbell
  const c3 = card({ title: "Category creep", sub: "Monthly average: prior 9 months (hollow) to last 3 months (filled)", span: 6, height: 320,
    table: () => ({ cols: ["Category", "Prior 9 mo avg", "Last 3 mo avg", "Change"], num: [1, 2, 3], rows: cats.map(x => [x.gp, fmt0(x.b), fmt0(x.a), pct(x.a / x.b - 1)]) }) });
  cats.sort((a, b) => b.d - a.d);
  c3.draw(() => { const c = T(), mx = Math.max(...cats.flatMap(x => [x.a, x.b]), 1);
    return baseOpt({ legend: { show: false }, grid: { left: 8, right: 24, top: 10, bottom: 24, containLabel: true },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => { const x = cats[p.dataIndex]; return `<b>${x.gp}</b><br>Prior ${fmt0(x.b)}/mo<br>Recent ${fmt0(x.a)}/mo<br>${pct(x.a / x.b - 1)}`; } },
      xAxis: { type: "value", max: mx * 1.1, ...axisStyle(), axisLine: { show: false }, axisLabel: { color: c.muted, fontSize: 11, formatter: v => fmt0(v) } },
      yAxis: { type: "category", inverse: true, data: cats.map(x => x.gp), ...axisStyle(), splitLine: { show: false } },
      series: [{ type: "custom", z: 1, data: cats.map((x, i) => [i, x.b, x.a]), renderItem: (p, api) => { const y = api.coord([0, api.value(0)])[1], x0 = api.coord([api.value(1), api.value(0)])[0], x1 = api.coord([api.value(2), api.value(0)])[0];
          return { type: "line", shape: { x1: x0, y1: y, x2: x1, y2: y }, style: { stroke: x1 > x0 ? c.up : c.down, lineWidth: 2 } }; }, tooltip: { show: false }, silent: true },
        { type: "scatter", symbolSize: 11, data: cats.map(x => [x.b, x.gp]), itemStyle: { color: c.surface, borderColor: c.ink2, borderWidth: 2 } },
        { type: "scatter", symbolSize: 11, data: cats.map(x => [x.a, x.gp]), itemStyle: { color: c.ink, borderColor: c.surface, borderWidth: 2 } }] }); });
  g.append(cats.length ? c3.root : h("div", { class: "card span-6" }, h("h2", {}, "Category creep"), h("div", { class: "note" }, "Needs a few months of history.")));

  // fees list
  const feeRows = rows.filter(t => t.c === "Fees & Interest").sort((a, b) => b.day - a.day);
  g.append(h("div", { class: "card span-6" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Fees and interest"), h("div", { class: "sub" }, `${fmt0(sum(feeRows, t => t.s))} over ${M} months`))),
    feeRows.length ? h("div", { class: "tablev" }, tableEl(["Date", "What", "Amount"], feeRows.map(t => [dlabel(t.day), t.desc.slice(0, 44), fmt2(t.s)]), [2])) : h("div", { class: "note ok" }, "No fees or interest found. Nice.")));

  // recurring ledger
  g.append(h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Recurring charges"), h("div", { class: "sub" }, `${rec.length} detected, ${fmt0(sum(rec, r => r.annual))} a year in total. Detection needs 3+ similar charges at a steady cadence.`))),
    h("div", { class: "tablev", style: "max-height:420px" }, tableEl(["Vendor", "Category", "Cadence", "Typical", "Per year", "Last charge", "Flags"],
      rec.map(r => [r.v, catChip(r.c), r.cad, fmt2(r.typ), fmt0(r.annual), dlabel(r.last), h("span", {}, r.change > .03 && r.n >= 4 ? h("span", { class: "pill warn" }, "price up " + Math.round(r.change * 100) + "%") : "", STREAM.test(r.v) && stream.length >= 3 ? h("span", { class: "pill" }, " streaming") : "")]), [3, 4]))));

  page.append(reconSection(lo, D.asOf, `Last ${M} months`));
}

/* ================= router + unlock ================= */
const PAGES = { weekly, trends, insights };
function route() {
  const name = PAGES[location.hash.slice(1)] ? location.hash.slice(1) : "weekly";
  $$("nav a").forEach(a => a.dataset.p === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  disposeAll(); $("#page").replaceChildren();
  if (!D.txs.length) { $("#page").append(h("div", { class: "card" }, "No categorized transactions yet. Run the update workflow once so vendors and categories are added to your data.")); return; }
  PAGES[name](); window.scrollTo(0, 0);
}
$("#f").addEventListener("submit", async e => {
  e.preventDefault(); $("#err").textContent = "Decrypting...";
  let store;
  try { const blob = await fetch("store.enc", { cache: "no-store" }).then(r => r.json()); store = await decrypt(blob, $("#pw").value); }
  catch { $("#err").textContent = "Wrong passphrase, or no data published yet."; return; }
  try { D.lumps = localStorage.getItem("lumps") === "1"; } catch { D.lumps = false; }
  $("#lumps").checked = D.lumps;
  buildModel(store); $("#pw").value = ""; $("#lock").hidden = true; $("#app").hidden = false; $("#asof").textContent = "Updated " + D.updated; route();
});
window.addEventListener("hashchange", route);
$("#lumps").addEventListener("change", e => { D.lumps = e.target.checked; try { localStorage.setItem("lumps", D.lumps ? "1" : "0"); } catch { /* private mode */ } buildModel(D.store); route(); });
$("#lockbtn").addEventListener("click", () => location.reload());
$("#theme").addEventListener("click", () => { const r = document.documentElement, cur = r.dataset.theme; r.dataset.theme = cur === "dark" ? "light" : cur === "light" ? "" : "dark"; if (!r.dataset.theme) r.removeAttribute("data-theme"); resetTheme(); route(); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { resetTheme(); if (!$("#app").hidden) route(); });
