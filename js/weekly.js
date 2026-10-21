"use strict";
/* Page 1: weekly update (trailing 3 weeks). */

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

  // 5. running income vs spending (up to 26 weeks) and where the money came from / went
  g.append(cumulativeCard(Math.max(D.firstDay, end - 181), end).root, suCard(lo3, end, { title: "Sources and uses, last 3 weeks" }).root);

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
