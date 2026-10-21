"use strict";
/* Flow views: cumulative income vs spending by week, and sources & uses. Everything here is derived from transactions
   (flows), never from balances, so any window can be asked about. */

const weekStart = d => d - ((d + 3) % 7); // day number of the Monday of d's week (day 0 = Thu 1970-01-01)

/* ---------- cumulative income vs spending, by week ---------- */
function cumulativeWeekly(lo, hi) {
  const weeks = []; for (let w = weekStart(lo); w <= hi; w += 7) weeks.push(w);
  const inc = new Map(weeks.map(w => [w, 0])), sp = new Map(weeks.map(w => [w, 0]));
  D.income.forEach(t => { if (t.day >= lo && t.day <= hi) inc.set(weekStart(t.day), inc.get(weekStart(t.day)) + t.amt); });
  D.spend.forEach(t => { if (t.day >= lo && t.day <= hi) sp.set(weekStart(t.day), sp.get(weekStart(t.day)) + t.s); });
  let ci = 0, cs = 0;
  return weeks.map(w => ({ w, inc: inc.get(w), sp: sp.get(w), ci: (ci += inc.get(w)), cs: (cs += sp.get(w)) }));
}

function cumulativeCard(lo, hi, { span = 7, height = 340 } = {}) {
  const rows = cumulativeWeekly(lo, hi), last = rows[rows.length - 1];
  const c = card({ title: "Cumulative income vs spending", sub: `Running totals by week from ${dlabel(lo)}. The gap between the lines is what you kept.`, span, height,
    table: () => ({ cols: ["Week of", "Income", "Spending", "Cumulative income", "Cumulative spending", "Kept so far"], num: [1, 2, 3, 4, 5],
      rows: rows.map(r => [dlabel(r.w), fmt0(r.inc), fmt0(r.sp), fmt0(r.ci), fmt0(r.cs), fmt0(r.ci - r.cs)]) }) });
  c.draw(() => {
    const t = T(), x = rows.map(r => dlabel(r.w));
    const line = (name, key, color, w) => ({ name, type: "line", data: rows.map(r => Math.round(r[key])), symbol: "circle", symbolSize: 6, showSymbol: rows.length < 30,
      lineStyle: { color, width: w }, itemStyle: { color, borderColor: t.surface, borderWidth: 2 }, emphasis: { focus: "series" },
      endLabel: { show: true, color: t.ink, fontSize: 12, fontWeight: 600, distance: 8, formatter: p => `${name}\n${fmt0(p.value)}` } });
    return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto", data: ["Income", "Spending"] }, grid: { left: 56, right: 96, top: 30, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: t.axis } },
        formatter: ps => { const r = rows[ps[0].dataIndex], partial = ps[0].dataIndex === rows.length - 1 && hi < r.w + 6;
          return `<b>Week of ${dlabel(r.w)}</b>${partial ? " (to date)" : ""}<br>Income <b>${fmt0(r.ci)}</b> (+${fmt0(r.inc)})<br>Spending <b>${fmt0(r.cs)}</b> (+${fmt0(r.sp)})<br>Kept <b>${fmt0(r.ci - r.cs)}</b>`; } },
      xAxis: { type: "category", data: x, boundaryGap: false, ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(),
      series: [line("Income", "ci", t.ink, 2.5), line("Spending", "cs", t.accent, 2.5)] });
  });
  return { root: c.root, last };
}

/* ---------- sources and uses ---------- */
const neutral = i => mix(css("--ink2"), css("--surface"), [.3, .45, .58, .7, .8][i % 5]); // financing items: lighter grays than income

/* Where money came from and where it went over [lo, hi]. By the cash-flow identity
     income + net new card debt + cash drawn down + outside card credits = spending + investing + paid to untracked cards,
   (negative items move to the other side), so both sides total the same. Anything that doesn't tie, such as a transfer to an
   account outside the feed, is shown as one labeled "Other / unmatched" item instead of being hidden. */
function sourcesUses(lo, hi) {
  const win = D.txs.filter(t => t.day >= lo && t.day <= hi), kindOf = t => D.accts[t.a].kind;
  const dCash = sum(win.filter(t => kindOf(t) === "bank"), t => t.amt);
  const dOwed = -sum(win.filter(t => kindOf(t) === "card"), t => t.amt);
  const invested = -sum(win.filter(t => t.k === "investing"), t => t.amt);
  const toNoDetail = D.lumps ? 0 : -sum(win.filter(t => t.k === "card_payment_out_unlinked"), t => t.amt); // already in spend when the lump toggle is on
  const outsideIn = sum(win.filter(t => t.k === "card_payment_in_unlinked"), t => t.amt);
  const src = [], use = [];
  const incomeShades = [0, .35, .58, .74].map(a => mix(css("--ink"), css("--surface"), a)); // income: ink tones, never a category hue

  const byVendor = [...groupBy(win.filter(t => t.k === "income"), t => t.v)].map(([v, ts]) => [v, sum(ts, t => t.amt)]).sort((a, b) => b[1] - a[1]);
  byVendor.slice(0, 3).forEach(([v, a], i) => a > 0 && src.push({ name: v, value: a, color: incomeShades[i] }));
  const rest = sum(byVendor.slice(3), x => x[1]);
  if (rest > 0.5) src.push({ name: "Other income", value: rest, color: incomeShades[3] });

  let credits = 0;
  const spend = D.spend.filter(t => t.day >= lo && t.day <= hi);
  GROUPS.forEach(gp => { const a = spendOf(spend.filter(t => t.g === gp)); if (a > 0.5) use.push({ name: gp, value: a, color: catColor(gp) }); else if (a < -0.5) credits -= a; });
  if (credits > 0.5) src.push({ name: "Refunds and credits", value: credits, color: neutral(3) });

  const signed = (v, posSide, posName, negSide, negName, ci) => { const side = v >= 0 ? posSide : negSide; if (Math.abs(v) > 0.5) side.push({ name: v >= 0 ? posName : negName, value: Math.abs(v), color: neutral(ci) }); };
  signed(dOwed, src, "New card debt", use, "Card debt paid", 0);
  signed(-dCash, src, "Cash drawn down", use, "Cash added", 1);
  signed(-invested, src, "From investments", use, "Invested", 2);
  if (outsideIn > 0.5) src.push({ name: "Outside card credits", value: outsideIn, color: neutral(4) });
  if (toNoDetail > 0.5) use.push({ name: "Cards (no detail)", value: toNoDetail, color: neutral(4) });

  const gap = sum(use, x => x.value) - sum(src, x => x.value);
  if (gap > 0.5) src.push({ name: "Other / unmatched", value: gap, color: neutral(3), plug: true });
  else if (gap < -0.5) use.push({ name: "Other / unmatched", value: -gap, color: neutral(3), plug: true });
  return { src, use, total: sum(use, x => x.value) };
}

const suTotal = side => sum(side, x => x.value);
const suRows = p => [...p.src.map(x => ["Source", x.name, fmt0(x.value)]), ...p.use.map(x => ["Use", x.name, fmt0(x.value)])];

/* Sources and uses for one window as two stacked bars. */
function suCard(lo, hi, { title = "Sources and uses", span = 5, height = 340, sub } = {}) {
  const p = sourcesUses(lo, hi), names = new Map();
  [...p.src, ...p.use].forEach(x => names.set(x.name, x.color));
  const c = card({ title, sub: sub || `${dlabel(lo)} to ${dlabel(hi)}: where the money came from, and where it went`, span, height, table: () => ({ cols: ["Side", "Item", "Amount"], num: [2], rows: suRows(p) }) });
  c.draw(() => {
    const t = T(), top = Math.max(suTotal(p.src), suTotal(p.use), 1), val = (side, n) => sum(side.filter(x => x.name === n), x => x.value);
    const series = [...names].map(([n, color]) => ({ name: n, type: "bar", stack: "t", barWidth: "46%", data: [Math.round(val(p.src, n)), Math.round(val(p.use, n))],
      itemStyle: { color, borderColor: t.surface, borderWidth: 1 }, emphasis: { focus: "series" },
      label: { show: true, position: "inside", fontSize: 11, width: 112, overflow: "truncate", color: onColor(color), formatter: q => q.value >= top * .07 ? `${n}\n${fmt0(q.value)}` : "" } }));
    series.push({ name: "Total", type: "scatter", data: [["Sources", Math.round(suTotal(p.src))], ["Uses", Math.round(suTotal(p.use))]], symbolSize: 0, silent: true,
      label: { show: true, position: "top", color: t.ink, fontSize: 12, fontWeight: 600, formatter: q => fmt0(q.value[1]) }, tooltip: { show: false } });
    return baseOpt({ legend: { show: false }, grid: { left: 56, right: 12, top: 28, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: q => `${q.marker}${esc(q.seriesName)}: <b>${fmt0(q.value)}</b>` },
      xAxis: { type: "category", data: ["Sources", "Uses"], ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.ink2, fontSize: 13, fontWeight: 600 } }, yAxis: moneyAxis(), series });
  });
  return c;
}

/* Sources and uses for each of several consecutive windows: a Sources stack and a Uses stack side by side per column. */
function suByPeriodCard(periods, { title = "Sources and uses by month", span = 12, height = 440 } = {}) {
  const parts = periods.map(p => ({ ...p, ...sourcesUses(p.lo, p.hi) }));
  const both = new Set(), seenSrc = new Set();
  parts.forEach(p => p.src.forEach(x => seenSrc.add(x.name)));
  parts.forEach(p => p.use.forEach(x => seenSrc.has(x.name) && both.add(x.name)));
  const keyed = []; // one series per (side, item), colored by item
  const add = (side, label, x) => { const key = `${side}|${x.name}`; if (!keyed.find(k => k.key === key)) keyed.push({ key, side, name: x.name, label: both.has(x.name) ? `${x.name} (${side === "S" ? "source" : "use"})` : x.name, color: x.color }); };
  parts.forEach(p => { p.src.forEach(x => add("S", "", x)); p.use.forEach(x => add("U", "", x)); });
  const c = card({ title, sub: "Left stack = where the money came from, right stack = where it went. The two stacks are always equal.", span, height,
    table: () => ({ cols: ["Period", "Side", "Item", "Amount"], num: [3], rows: parts.flatMap(p => [...p.src.map(x => [p.label, "Source", x.name, fmt0(x.value)]), ...p.use.map(x => [p.label, "Use", x.name, fmt0(x.value)])]) }) });
  c.draw(() => {
    const t = T(), val = (p, k) => Math.round(sum((k.side === "S" ? p.src : p.use).filter(x => x.name === k.name), x => x.value));
    const series = keyed.map(k => ({ name: k.label, type: "bar", stack: k.side === "S" ? "Sources" : "Uses", barGap: "6%", barWidth: "34%", data: parts.map(p => val(p, k)),
      itemStyle: { color: k.color, borderColor: t.surface, borderWidth: 1 }, emphasis: { focus: "series" } }));
    return baseOpt({ legend: { ...baseOpt().legend, type: "scroll", top: "auto", bottom: 0, data: keyed.map(k => k.label) }, grid: { left: 56, right: 12, top: 16, bottom: 64 },
      tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: q => `<b>${esc(q.seriesName)}</b><br>${parts[q.dataIndex].label}: <b>${fmt0(q.value)}</b>` },
      xAxis: { type: "category", data: parts.map(p => p.label), ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(), series });
  });
  return c;
}
