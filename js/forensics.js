"use strict";
/* Forensics: does the ledger look like real money? Benford's law says the leading digits of naturally occurring amounts
   are not uniform: about 30% start with 1 and under 5% with 9. Departures are a prompt to look (duplicated loads, rounded
   amounts, one dominant payee), not proof of anything. Ported from the web session's chart, extended to compare groups. */

const benfordExpected = d => Math.log10(1 + 1 / d);

/* Leading-digit shares for a list of dollar amounts, with Nigrini's mean absolute deviation (MAD) test. */
function benfordStats(amounts) {
  const counts = Array(10).fill(0);
  amounts.map(Math.abs).filter(a => a >= 1).forEach(a => { counts[+String(Math.floor(a))[0]]++; });
  const n = sum(counts), obs = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => n ? counts[d] / n : 0);
  const mad = n ? obs.reduce((acc, o, i) => acc + Math.abs(o - benfordExpected(i + 1)), 0) / 9 : 0;
  const verdict = n < 100 ? "too few amounts to judge" : mad < 0.006 ? "close conformity" : mad < 0.012 ? "acceptable conformity" : mad < 0.015 ? "marginal conformity" : "nonconformity";
  const flagged = n < 100 ? [] : obs.map((o, i) => { const e = benfordExpected(i + 1), z = (Math.abs(o - e) - 1 / (2 * n)) / Math.sqrt(e * (1 - e) / n); return { d: i + 1, o, e, z }; }).filter(x => x.z > 1.96);
  return { n, obs, mad, verdict, flagged };
}

function benfordCard() {
  const isFixed = committedTest();
  const groups = [
    { name: "Every transaction", sub: "all spending and income", amounts: D.txs.filter(t => ["spend", "refund", "income"].includes(t.k)).map(t => t.amt) },
    { name: "Flexible spending only", sub: "excludes rent, bills, subscriptions and steady recurring charges", amounts: D.spend.filter(t => t.amt < 0 && !isFixed(t)).map(t => t.amt) }];
  groups.forEach(g => { g.st = benfordStats(g.amounts); });
  const main = groups[1].st.n >= 100 ? groups[1] : groups[0];
  const c = card({ title: "Benford's law check", span: 12, height: 300,
    sub: `${main.name}: ${main.st.n.toLocaleString()} amounts, MAD ${main.st.mad.toFixed(4)}, ${main.st.verdict}.`,
    table: () => ({ cols: ["Leading digit", "Expected", ...groups.map(g => g.name)], num: [1, 2, 3], rows: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => [String(d), (benfordExpected(d) * 100).toFixed(1) + "%", ...groups.map(g => (g.st.obs[d - 1] * 100).toFixed(1) + "%")]) }) });
  c.draw(() => {
    const t = T(), shades = [t.accent, mix(t.ink, t.surface, .55)], digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const bars = groups.map((g, i) => ({ name: `${g.name} (${g.st.n.toLocaleString()})`, type: "bar", barGap: "8%", barWidth: "28%", data: g.st.obs.map(o => +(o * 100).toFixed(1)), itemStyle: { color: shades[i], borderRadius: [3, 3, 0, 0] } }));
    const line = { name: "Expected by Benford", type: "line", data: digits.map(d => +(benfordExpected(d) * 100).toFixed(1)), symbol: "diamond", symbolSize: 9, lineStyle: { color: t.ink, width: 2 }, itemStyle: { color: t.ink, borderColor: t.surface, borderWidth: 2 }, z: 5 };
    return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 44, right: 12, top: 34, bottom: 28 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: v => v + "%" },
      xAxis: { type: "category", data: digits.map(d => "Starts with " + d), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 11, formatter: v => v.slice(-1) } },
      yAxis: { type: "value", ...axisStyle(), axisLine: { show: false }, axisLabel: { color: t.muted, fontSize: 11, formatter: v => v + "%" } }, series: [...bars, line] });
  });
  const notes = groups.map(g => `<b>${g.name}</b> (${g.sub}): ${g.st.n.toLocaleString()} amounts, MAD ${g.st.mad.toFixed(4)}, ${g.st.verdict}.` +
    (g.st.flagged.length ? ` Off by more than chance: ${g.st.flagged.map(x => `digit ${x.d} is ${(x.o * 100).toFixed(1)}% vs ${(x.e * 100).toFixed(1)}% expected`).join("; ")}.` : ""));
  c.root.append(h("ul", { class: "bul note", style: "margin-top:10px" }, notes.map(n => h("li", { html: n }))),
    h("div", { class: "note" }, "How to read it: bars are the share of amounts starting with each digit, the diamonds are what Benford's law predicts. Steady repeating amounts (rent, paychecks, subscriptions) legitimately distort the first group, so the second is the fairer test. Deviation isn't proof of a problem; it's a prompt to look for duplicated loads, rounded amounts or one payee dominating."));
  return c.root;
}
