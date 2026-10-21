"use strict";
/* Page 2: long-term monthly trends. */

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

  // sources & uses, one pair of stacks per month
  g.append(suByPeriodCard(months.map(m => ({ label: mlabel(m), lo: dayNum(m + "-01"), hi: dayNum(monthShift(m, 1) + "-01") - 1 }))).root);

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
