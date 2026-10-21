"use strict";
/* Savings ideas: where could spending be cut? Levers, recurring charges, habit leaks, fixed vs flexible spending. */

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
  const page = $("#page"), aw = analysisWindow(12), M = aw.M, lo = aw.lo, Mtxt = aw.partial ? M.toFixed(1) : String(M);
  const rows = D.spend.filter(t => t.day >= aw.lo && t.day <= aw.hi), ann = f => spendOf(rows.filter(f)) / M * 12;
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

  page.replaceChildren(pageHead("Savings ideas", aw.partial ? `Based on ${Mtxt} months of data (fewer than 2 complete months yet). Figures are annualized.` : `Based on the last ${Mtxt} complete months. Figures are annualized.`));
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
  const allM = completeMonths(12), recentM = allM.slice(-3), priorM = allM.slice(0, -3).slice(-9);
  const cats = priorM.length < 2 ? [] : GROUPS.map(gp => { const a = spendOf(D.spend.filter(t => t.g === gp && recentM.includes(t.m))) / recentM.length, b = spendOf(D.spend.filter(t => t.g === gp && priorM.includes(t.m))) / priorM.length; return { gp, a, b, d: a - b }; }).filter(x => x.b > 20);
  const rise = cats.filter(x => x.d > 0).sort((a, b) => b.d - a.d)[0];
  if (rise && rise.d / rise.b > .1) bullets.push(`<b>${rise.gp}</b> is trending up: ${fmt0(rise.a)}/mo over the last ${recentM.length} months versus ${fmt0(rise.b)}/mo before, a rise of ${pct(rise.d / rise.b)}. Returning to the earlier level saves ${fmt0(rise.d * 12)} a year.`);
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

  // fixed vs flexible: how much of spending is committed, and how much is open to change
  const isC = committedTest(), sw = scopeWindow(completeMonths(12).length >= 2 ? "12m" : "3m"), SB = bucketData(sw);
  const fixedBy = SB.map(b => sum(b.tx.filter(isC), t => t.s)), flexBy = SB.map((b, i) => b.tot - fixedBy[i]), fixedAll = sum(fixedBy), flexAll = sum(flexBy), shareFixed = fixedAll + flexAll > 0 ? fixedAll / (fixedAll + flexAll) : 0;
  const c4 = card({ title: "Fixed vs flexible spending", span: 6, height: 320,
    sub: `${Math.round(shareFixed * 100)}% is committed (housing, bills, subscriptions, tuition, steady recurring charges). The other ${Math.round((1 - shareFixed) * 100)}% is where cuts are realistic.`,
    table: () => ({ cols: [sw.unit[0].toUpperCase() + sw.unit.slice(1), "Committed", "Flexible", "Committed share"], num: [1, 2, 3], rows: SB.map((b, i) => [b.long, fmt0(fixedBy[i]), fmt0(flexBy[i]), b.tot ? Math.round(fixedBy[i] / b.tot * 100) + "%" : "-"]) }) });
  c4.draw(() => { const t = T(), colors = [t.ink, mix(t.ink, t.surface, .6)];
    return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 56, right: 12, top: 30, bottom: 28 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => `<b>${esc(SB[ps[0].dataIndex].long)}</b><br>` + ps.slice().reverse().map(p => `${p.marker}${p.seriesName}: <b>${fmt0(p.value)}</b>`).join("<br>") },
      xAxis: { type: "category", data: SB.map(b => b.label), ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(),
      series: [["Committed", fixedBy], ["Flexible", flexBy]].map(([name, data], i) => ({ name, type: "bar", stack: "f", barWidth: "58%", data: data.map(Math.round), itemStyle: { color: colors[i], borderColor: t.surface, borderWidth: 1 } })) }); });
  g.append(c4.root);

  // creep dumbbell
  const c3 = card({ title: "Category creep", sub: `Monthly average: prior ${priorM.length} months (hollow) to last ${recentM.length} months (filled)`, span: 6, height: 320,
    table: () => ({ cols: ["Category", `Prior ${priorM.length} mo avg`, `Last ${recentM.length} mo avg`, "Change"], num: [1, 2, 3], rows: cats.map(x => [x.gp, fmt0(x.b), fmt0(x.a), pct(x.a / x.b - 1)]) }) });
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
  g.append(cats.length ? c3.root : h("div", { class: "card span-6" }, h("h2", {}, "Category creep"), h("div", { class: "note" }, "Needs about four complete months of history: three to compare against at least two earlier ones.")));

  // fees list
  const feeRows = rows.filter(t => t.c === "Fees & Interest").sort((a, b) => b.day - a.day);
  g.append(h("div", { class: "card span-4" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Fees and interest"), h("div", { class: "sub" }, `${fmt0(sum(feeRows, t => t.s))} over ${Mtxt} months`))),
    feeRows.length ? h("div", { class: "tablev" }, tableEl(["Date", "What", "Amount"], feeRows.map(t => [dlabel(t.day), t.desc.slice(0, 44), fmt2(t.s)]), [2])) : h("div", { class: "note ok" }, "No fees or interest found. Nice.")));

  // recurring ledger
  g.append(h("div", { class: "card span-8" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Recurring charges"), h("div", { class: "sub" }, `${rec.length} detected, ${fmt0(sum(rec, r => r.annual))} a year in total. Detection needs 3+ similar charges at a steady cadence.`))),
    h("div", { class: "tablev", style: "max-height:420px" }, tableEl(["Vendor", "Category", "Cadence", "Typical", "Per year", "Last charge", "Flags"],
      rec.map(r => [r.v, catChip(r.c), r.cad, fmt2(r.typ), fmt0(r.annual), dlabel(r.last), h("span", {}, r.change > .03 && r.n >= 4 ? h("span", { class: "pill warn" }, "price up " + Math.round(r.change * 100) + "%") : "", STREAM.test(r.v) && stream.length >= 3 ? h("span", { class: "pill" }, " streaming") : "")]), [3, 4]))));

  page.append(reconSection(aw.lo, D.asOf, aw.partial ? "All data" : `Last ${Mtxt} months`));
}
