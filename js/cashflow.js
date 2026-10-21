"use strict";
/* Cash flow: is money coming in faster than it goes out? Everything here follows the range control. */

function cashflow() {
  const page = $("#page"), sc = scopeWindow(scopeState.cashflow), B = bucketData(sc), unit = sc.unit;
  const tot = sum(B, b => b.tot), inc = sum(B, b => b.inc), net = inc - tot, rate = inc > 0 ? net / inc : null, months = Math.max(.5, sc.span / 30.44);
  const tm = typicalMonth(), lastM = completeMonths(1)[0], mtd = spendOf(D.spend.filter(t => t.m === D.curMonth));
  const wcm = completeMonths(12).filter(m => monthStartDay(m) >= sc.lo - 2), avgCm = wcm.length ? sum(wcm, m => spendOf(D.spend.filter(t => t.m === m))) / wcm.length : null;
  const topCat = topN(new Map(GROUPS.map(gp => [gp, sum(B, b => b.g[gp])])), 1)[0], scopeText = sc.key === "all" ? `all ${Math.round(sc.span / 7)} weeks of data` : `the last ${sc.label}`;

  page.replaceChildren(pageHead("Cash flow", `${dlabel(sc.lo)} to ${dlabel(sc.hi)}. Bars by ${unit}${sc.weekly ? "" : "; * marks a partial month"}.`, "cashflow"));
  page.append(lede(`Over ${scopeText} you earned <b>${fmt0(inc)}</b> and spent <b>${fmt0(tot)}</b>, ` + (net >= 0 ? `keeping <b>${fmt0(net)}</b>` + (rate != null ? ` (${Math.round(rate * 100)}% of income).` : ".")
    : `<b>${fmt0(-net)}</b> more than came in.`) + (topCat && topCat[1] > 0 ? ` The biggest category was ${topCat[0]} at ${Math.round(topCat[1] / tot * 100)}% of spending.` : "")));
  page.append(h("div", { class: "kpis" },
    kpi("Income", fmt0(inc), `${fmt0(inc / months)} per month`),
    kpi("Spending", fmt0(tot), `${fmt0(tot / months)} per month`, true),
    kpi("Kept", fmt0(net), rate == null ? "" : rate >= 0 ? `${Math.round(rate * 100)}% savings rate` : "spending exceeds income"),
    lastM && avgCm != null ? kpi(mlabel(lastM) + " vs average", fmt0(spendOf(D.spend.filter(t => t.m === lastM))), delta(spendOf(D.spend.filter(t => t.m === lastM)), avgCm, "vs avg")) : kpi("A typical month", fmt0(tm.value), tm.basis),
    kpi("Month to date", fmt0(mtd), mlabel(D.curMonth))));
  if (!D.lumps && D.unlinked(sc.lo) > 0) page.append(h("div", { class: "note", style: "margin:-4px 0 12px" },
    `Note: ${fmt0(D.unlinked(sc.lo))} of card paydowns in this range have no matching card detail, so they are left out of spending. Periods before a card's history begins can look low. Tick "Count unmatched paydowns" (top right) to include them as one lump.`));
  const g = h("div", { class: "grid" }); page.append(g);

  // income vs spending by category, with a rolling average of spending
  const k = sc.weekly ? 4 : 3, roll = B.map((_, i) => sum(B.slice(Math.max(0, i - k + 1), i + 1), b => b.tot) / Math.min(k, i + 1));
  const c1 = card({ title: `Income vs spending by category, by ${unit}`, sub: "Bars stack to total spending; lines share the same dollar axis", span: 12, height: 380, legend: catLegend(),
    table: () => ({ cols: [unit[0].toUpperCase() + unit.slice(1), ...GROUPS, "Total", "Income"], num: GROUPS.map((_, i) => i + 1).concat([GROUPS.length + 1, GROUPS.length + 2]),
      rows: B.map(b => [b.long, ...GROUPS.map(x => fmt0(b.g[x])), fmt0(b.tot), fmt0(b.inc)]) }) });
  c1.draw(() => {
    const t = T(), ser = GROUPS.map(gp => ({ name: gp, type: "bar", stack: "m", barWidth: "58%", data: B.map(b => Math.round(b.g[gp])), itemStyle: { color: catColor(gp), borderColor: t.surface, borderWidth: 1 }, emphasis: { focus: "series" } }));
    ser.push({ name: "Income", type: "line", data: B.map(b => Math.round(b.inc)), symbol: "circle", symbolSize: 7, lineStyle: { color: t.ink, width: 2 }, itemStyle: { color: t.ink, borderColor: t.surface, borderWidth: 2 }, z: 6 });
    ser.push({ name: `${k}-${unit} avg spending`, type: "line", data: roll.map(Math.round), symbol: "none", smooth: true, lineStyle: { color: t.muted, width: 2 }, itemStyle: { color: t.muted }, z: 5 });
    return baseOpt({ legend: { ...baseOpt().legend, data: ["Income", `${k}-${unit} avg spending`], right: 0, left: "auto" }, grid: { left: 56, right: 12, top: 30, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => `<b>${esc(B[ps[0].dataIndex].long)}</b><br>` + ps.filter(p => p.value).reverse().map(p => `${p.marker}${esc(p.seriesName)}: <b>${fmt0(p.value)}</b>`).join("<br>") },
      xAxis: { type: "category", data: B.map(b => b.label), ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(), series: ser });
  });
  g.append(c1.root);

  // running totals and where the money came from / went
  g.append(cumulativeCard(sc.lo, sc.hi).root, suCard(sc.lo, sc.hi, { title: `Sources and uses, ${sc.key === "all" ? "all data" : sc.label}` }).root);
  g.append(suByPeriodCard(B.map(b => ({ label: b.label, lo: b.lo, hi: b.hi })), { title: `Sources and uses by ${unit}` }).root);

  // net per period + income by source
  const incs = B.map(b => b.inc), tots = B.map(b => b.tot), nets = B.map(b => b.inc - b.tot);
  const c2 = card({ title: `Net per ${unit}`, sub: "Income minus spending: blue = surplus, red = shortfall", span: 6, height: 300,
    table: () => ({ cols: [unit[0].toUpperCase() + unit.slice(1), "Income", "Spending", "Net", "Savings rate"], num: [1, 2, 3, 4], rows: B.map((b, i) => [b.long, fmt0(incs[i]), fmt0(tots[i]), fmt0(nets[i]), incs[i] ? Math.round(nets[i] / incs[i] * 100) + "%" : "-"]) }) });
  c2.draw(() => { const t = T();
    return baseOpt({ legend: { show: false }, grid: { left: 56, right: 8, top: 12, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => { const i = ps[0].dataIndex; return `<b>${esc(B[i].long)}</b><br>Net <b>${fmt0(nets[i])}</b><br>Income ${fmt0(incs[i])}<br>Spending ${fmt0(tots[i])}`; } },
      xAxis: { type: "category", data: B.map(b => b.label), ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(),
      series: [{ type: "bar", barWidth: "58%", data: nets.map(v => ({ value: Math.round(v), itemStyle: { color: v >= 0 ? t.down : t.up, borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3] } })) }] }); });
  g.append(c2.root, incomeBySourceCard(B, { span: 6, height: 300 }).root);

  // year over year (needs a prior year of history)
  const yr = +D.curMonth.slice(0, 4), lastDone = lastM || monthShift(D.curMonth, -1), hasPy = D.firstDay <= dayNum(`${yr - 1}-06-30`);
  if (!hasPy) {
    g.append(h("div", { class: "card span-12" }, h("h2", {}, "Year over year: cumulative spend"), h("div", { class: "note" }, `Needs a prior year of history. You have ${Math.round((D.asOf - D.firstDay) / 7)} weeks so far; this chart appears on its own once there is a year to compare.`)));
  } else {
    const cum = year => { let run = 0; return Array.from({ length: 12 }, (_, i) => { const m = `${year}-${String(i + 1).padStart(2, "0")}`; if (m > lastDone && year === yr) return null; run += spendOf(D.spend.filter(t => t.m === m)); return Math.round(run); }); };
    const cy = cum(yr), py = cum(yr - 1);
    const c3 = card({ title: "Year over year: cumulative spend", sub: `${yr} vs ${yr - 1}, complete months`, span: 12, height: 300,
      table: () => ({ cols: ["Month", String(yr), String(yr - 1)], num: [1, 2], rows: MON.map((m, i) => [m, cy[i] == null ? "-" : fmt0(cy[i]), fmt0(py[i])]) }) });
    c3.draw(() => { const t = T();
      return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 56, right: 12, top: 30, bottom: 28 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", valueFormatter: v => v == null ? "-" : fmt0(v) },
        xAxis: { type: "category", data: MON, ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(),
        series: [{ name: String(yr - 1), type: "line", data: py, symbol: "none", lineStyle: { color: t.other, width: 2 }, itemStyle: { color: t.other } },
          { name: String(yr), type: "line", data: cy, symbol: "circle", symbolSize: 6, lineStyle: { color: t.accent, width: 2.5 }, itemStyle: { color: t.accent, borderColor: t.surface, borderWidth: 2 } }] }); });
    g.append(c3.root);
  }

  page.append(reconSection(sc.lo, sc.hi, sc.key === "all" ? "All data" : `Last ${sc.label}`));
}
