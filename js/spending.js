"use strict";
/* Spending: where does the money go? Category and vendor breakdowns over the chosen range. */

function spending() {
  const page = $("#page"), sc = scopeWindow(scopeState.spending), B = bucketData(sc), unit = sc.unit;
  const rows = inWin(D.spend, sc.lo, sc.hi), total = spendOf(rows), prevRows = sc.prev.ok ? inWin(D.spend, sc.prev.lo, sc.prev.hi) : null, prevTotal = prevRows ? spendOf(prevRows) : 0;
  const byCat = new Map(GROUPS.map(gp => [gp, sum(B, b => b.g[gp])])), vt = [...groupBy(rows, t => t.v)].map(([v, ts]) => ({ v, g: ts[0].g, c: ts[0].c, s: spendOf(ts), n: ts.length })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  const topCat = topN(byCat, 1)[0], topV = vt[0], buys = rows.filter(t => t.amt < 0), weeks = Math.max(1, sc.span / 7);
  const scopeText = sc.key === "all" ? `all ${Math.round(sc.span / 7)} weeks of data` : `the last ${sc.label}`;

  page.replaceChildren(pageHead("Spending", `${dlabel(sc.lo)} to ${dlabel(sc.hi)}. Where the money goes, by category and vendor.`, "spending"));
  page.append(lede(`In ${scopeText} you spent <b>${fmt0(total)}</b> across ${buys.length} purchases at ${vt.length} vendors.` +
    (topCat && topCat[1] > 0 ? ` <b>${topCat[0]}</b> was the biggest category (${Math.round(topCat[1] / total * 100)}%)` : "") + (topV ? ` and <b>${esc(topV.v)}</b> the biggest vendor (${fmt0(topV.s)}).` : ".") +
    (prevRows && prevTotal > 0 ? ` That is ${Math.abs(Math.round((total / prevTotal - 1) * 100))}% ${total <= prevTotal ? "less" : "more"} than the ${sc.label} before.` : "")));
  page.append(h("div", { class: "kpis" },
    kpi("Spent", fmt0(total), prevRows ? delta(total, prevTotal, `vs prior ${sc.label}`) : `${dlabel(sc.lo)} to ${dlabel(sc.hi)}`, true),
    kpi("Per week", fmt0(total / weeks), `${fmt0(total / Math.max(1, sc.span))} per day`),
    kpi("Top category", topCat ? topCat[0] : "n/a", topCat ? `${fmt0(topCat[1])} (${Math.round(topCat[1] / total * 100)}%)` : ""),
    kpi("Top vendor", topV ? topV.v : "n/a", topV ? `${fmt0(topV.s)} over ${topV.n} purchase${topV.n === 1 ? "" : "s"}` : ""),
    kpi("Purchases", String(buys.length), buys.length ? `${fmt0(total / buys.length)} average` : "")));
  const g = h("div", { class: "grid" }); page.append(g);

  // category -> vendor sunburst, and the vendor map (treemap)
  const sunRows = () => { const out = []; for (const [gp, ts] of groupBy(rows, t => t.g)) for (const [v, vs] of groupBy(ts, t => t.v)) { const s = spendOf(vs); if (s > 0) out.push([gp, v, s]); } return out.sort((a, b) => b[2] - a[2]).map(r => [r[0], r[1], fmt0(r[2])]); };
  const c1 = card({ title: "Where it went: category to vendor", sub: "Inner ring category, outer ring vendors", span: 5, height: 420, table: () => ({ cols: ["Category", "Vendor", "Spent"], num: [2], rows: sunRows() }) });
  c1.draw(() => {
    const t = T(), data = [];
    for (const [gp, ts] of groupBy(rows, x => x.g)) {
      const col = catColor(gp), vmap = new Map([...groupBy(ts, x => x.v)].map(([v, vs]) => [v, spendOf(vs)])), vend = topN(vmap, 7).filter(([, s]) => s > 0), tot = spendOf(ts);
      if (tot <= 0) continue;
      const kids = vend.map(([v, s]) => ({ name: v, value: Math.round(s), itemStyle: { color: mix(col, t.surface, .38) }, label: { color: onColor(mix(col, t.surface, .38)) } }));
      if (tot - sum(vend, ([, s]) => s) > 1) kids.push({ name: "Other vendors", value: Math.round(tot - sum(vend, ([, s]) => s)), itemStyle: { color: mix(col, t.surface, .62) }, label: { show: false } });
      data.push({ name: gp, itemStyle: { color: col }, label: { color: onColor(col) }, children: kids });
    }
    return baseOpt({ legend: { show: false }, tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `${p.marker}${esc(p.name)}: <b>${fmt0(p.value)}</b>` },
      series: [{ type: "sunburst", data, radius: ["12%", "96%"], sort: "desc", nodeClick: false, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
        label: { fontSize: 11, minAngle: 16 }, levels: [{}, { r0: "12%", r: "46%", label: { rotate: 0, fontWeight: 600 } }, { r0: "47%", r: "96%", label: { rotate: "radial", align: "center" } }] }] });
  });
  const c2 = card({ title: "Vendor map", sub: "Area = spend; top 40 vendors, colored by category", span: 7, height: 420, legend: catLegend(),
    table: () => ({ cols: ["Vendor", "Category", "Spent", "Per week"], num: [2, 3], rows: vt.slice(0, 40).map(x => [x.v, x.c, fmt0(x.s), fmt0(x.s / weeks)]) }) });
  c2.draw(() => { const t = T(), kids = new Map();
    vt.slice(0, 40).forEach(x => { const col = catColor(x.g), bg = mix(col, t.surface, .12); (kids.get(x.g) || kids.set(x.g, []).get(x.g)).push({ name: x.v, value: Math.round(x.s), itemStyle: { color: bg }, label: { color: onColor(bg) } }); });
    const data = [...kids].map(([gp, ch]) => ({ name: gp, itemStyle: { color: catColor(gp) }, children: ch }));
    return baseOpt({ legend: { show: false }, tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `${p.marker}${esc(p.name)}: <b>${fmt0(p.value)}</b>` },
      series: [{ type: "treemap", data, roam: false, nodeClick: false, breadcrumb: { show: false }, width: "100%", height: "100%", top: 0, left: 0, right: 0, bottom: 0,
        label: { show: true, formatter: p => p.name + "\n" + fmt0(p.value), fontSize: 11, overflow: "truncate", position: "insideTopLeft", padding: 4 }, upperLabel: { show: true, height: 20, color: t.ink, fontWeight: 600, fontSize: 11 },
        levels: [{ itemStyle: { borderColor: t.surface, borderWidth: 0, gapWidth: 3 } }, { itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2 }, upperLabel: { show: true } }, { itemStyle: { borderColor: t.surface, borderWidth: 1, gapWidth: 1 } }] }] }); });
  g.append(c1.root, c2.root);

  // category by period heatmap
  const present = GROUPS.filter(gp => B.some(b => b.g[gp] > 0)), cells = [];
  present.forEach((gp, y) => B.forEach((b, x) => cells.push([x, y, Math.round(b.g[gp])])));
  const c3 = card({ title: `Category by ${unit}`, sub: "Darker = more spend in that period", span: 12, height: Math.max(260, 110 + present.length * 34),
    table: () => ({ cols: ["Category", ...B.map(b => b.label)], num: B.map((_, i) => i + 1), rows: present.map(gp => [gp, ...B.map(b => fmt0(b.g[gp]))]) }) });
  c3.draw(() => { const t = T(), mxv = Math.max(1, ...cells.map(x => x[2]));
    return baseOpt({ legend: { show: false }, grid: { left: 110, right: 150, top: 8, bottom: 30 },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `<b>${present[p.value[1]]}</b>, ${esc(B[p.value[0]].long)}<br><b>${fmt0(p.value[2])}</b>` },
      xAxis: { type: "category", data: B.map(b => b.label), ...axisStyle(), splitArea: { show: false }, splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 11, interval: 0 } },
      yAxis: { type: "category", data: present, inverse: true, ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.ink2, fontSize: 12 } },
      visualMap: { min: 0, max: mxv, orient: "vertical", right: 8, top: "middle", itemWidth: 12, itemHeight: 140, calculable: false, text: [fmt0(mxv), "$0"], textStyle: { color: t.muted, fontSize: 11 }, inRange: { color: t.seq } },
      series: [{ type: "heatmap", data: cells, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: t.ink } } }] }); });
  g.append(c3.root);

  // movers vs the previous period, and the largest purchases
  g.append(sc.prev.ok ? moversCard({ curLo: sc.lo, curHi: sc.hi, prevLo: sc.prev.lo, prevHi: sc.prev.hi, title: `Biggest movers vs the ${sc.label} before`, curName: "This period", prevName: "Prior period", span: 6, height: 320 })
    : h("div", { class: "card span-6" }, h("h2", {}, "Biggest movers"), h("div", { class: "note" }, `Needs a full earlier ${sc.label} of data to compare against. Pick a shorter range to see movers.`)),
    largestCard(sc.lo, sc.hi, { title: `Largest purchases, ${sc.key === "all" ? "all data" : sc.label}` }));

  // vendor x period table with shading
  const vrows = vt.slice(0, 14).map(x => ({ ...x, per: B.map(b => spendOf(inWin(rows, b.lo, b.hi).filter(t => t.v === x.v))) })), mx = Math.max(1, ...vrows.flatMap(r => r.per)), nb = B.length;
  g.append(h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, `Top vendors by ${unit}`), h("div", { class: "sub" }, "Shading shows relative size within the table"))),
    h("div", { class: "tablev", style: "max-height:none" }, (() => {
      const t = tableEl(["Vendor", "Category", ...B.map(b => b.label), "Total", `vs prior ${unit}`], [], B.map((_, i) => i + 2).concat([nb + 2, nb + 3]));
      t.tBodies[0].append(...vrows.map(r => h("tr", {}, h("td", {}, r.v), h("td", {}, catChip(r.c)),
        ...r.per.map(v => h("td", { class: "n", style: `background:color-mix(in srgb, var(--accent) ${Math.round(v / mx * 55)}%, transparent)` }, v ? fmt0(v) : "-")),
        h("td", { class: "n" }, h("b", {}, fmt0(r.s))), h("td", { class: "n" }, nb > 1 && r.per[nb - 2] ? pct((r.per[nb - 1] - r.per[nb - 2]) / r.per[nb - 2]) : nb > 1 ? "new" : "-"))));
      return t; })())));

  // a small chart per top vendor
  const sm = h("div", { class: "sm" });
  g.append(h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, `Top vendors ${unit} by ${unit}`), h("div", { class: "sub" }, "Each panel has its own scale; color is the vendor's category"))), sm));
  vt.slice(0, 12).forEach(x => {
    const series = B.map(b => spendOf(inWin(rows, b.lo, b.hi).filter(t => t.v === x.v))), avg = sum(series) / B.length, lastv = series[series.length - 1], box = h("div", { style: "height:64px" });
    sm.append(h("div", { class: "cell" }, h("div", { class: "t", title: x.v }, x.v), box, h("div", { class: "s" }, `${fmt0(avg)}/${unit} avg, last ${fmt0(lastv)} `, h("b", {}, avg ? pct((lastv - avg) / avg) : ""))));
    lazyChart(box, () => ({ animation: false, grid: { left: 0, right: 0, top: 4, bottom: 0 }, xAxis: { type: "category", show: false, data: B.map(b => b.label) }, yAxis: { type: "value", show: false },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "none" }, formatter: ps => `${esc(ps[0].axisValue)}: <b>${fmt0(ps[0].value)}</b>` },
      series: [{ type: "bar", data: series.map(Math.round), barWidth: "70%", itemStyle: { color: catColor(x.g), borderRadius: [2, 2, 0, 0] } }] }));
  });

  page.append(reconSection(sc.lo, sc.hi, sc.key === "all" ? "All data" : `Last ${sc.label}`));
}
