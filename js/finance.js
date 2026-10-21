"use strict";
/* Financial helpers (math only, no drawing): position, typical month, runway, month-to-date pace, fixed vs flexible spending,
   reconstructed balances, and data-quality figures. Pure functions of the data model D. */

/* ---------- where things stand ---------- */
function position() {
  const accts = Object.values(D.accts);
  const cash = sum(accts.filter(a => a.kind === "bank"), a => a.balance);
  const owed = -sum(accts.filter(a => a.kind === "card"), a => a.balance);
  return { cash, owed, net: cash - owed };
}

/* A typical month: the median of complete months, so one-offs (tuition, a trip) don't drag it around. */
function typicalMonth() {
  const spends = completeMonths(12).map(m => spendOf(D.spend.filter(t => t.m === m)));
  if (spends.length >= 2) return { value: median(spends), months: spends.length, basis: `median of ${spends.length} complete months` };
  const days = Math.max(1, D.asOf - D.firstDay + 1);
  return { value: spendOf(D.spend) / days * 30.44, months: 0, basis: "all data, scaled to a 30-day month" };
}
const runwayMonths = () => { const t = typicalMonth().value, p = position(); return t > 0 ? Math.max(0, p.cash) / t : null; };

/* The window insights and averages are based on: up to `maxMonths` complete months, or all data if there are fewer than 2. */
function analysisWindow(maxMonths = 12) {
  const months = completeMonths(maxMonths);
  if (months.length >= 2) return { months, M: months.length, lo: monthStartDay(months[0]), hi: monthStartDay(monthShift(months[months.length - 1], 1)) - 1, partial: false };
  return { months, M: Math.max(1, (D.asOf - D.firstDay + 1) / 30.44), lo: D.firstDay, hi: D.asOf, partial: true };
}

/* ---------- month-to-date pace ---------- */
function paceSeries() {
  const cur = D.curMonth, dom = +isoOf(D.asOf).slice(8), dim = new Date(Date.UTC(+cur.slice(0, 4), +cur.slice(5), 0)).getUTCDate();
  const cum = m => { const a = Array(31).fill(0); D.spend.filter(t => t.m === m).forEach(t => { a[+t.ds.slice(8) - 1] += t.s; }); for (let i = 1; i < 31; i++) a[i] += a[i - 1]; return a; };
  const prior = completeMonths(3), curCum = cum(cur).slice(0, dom);
  let typ = null;
  if (prior.length) { const arrs = prior.map(cum); typ = Array.from({ length: dim }, (_, i) => sum(arrs, a => a[i]) / arrs.length); }
  const now = curCum[dom - 1] || 0;
  const projected = typ ? now + (typ[dim - 1] - typ[dom - 1]) : now / dom * dim;
  return { dom, dim, cur: curCum, typ, now, typToDate: typ ? typ[dom - 1] : null, typFull: typ ? typ[dim - 1] : null, projected, months: prior.length };
}

/* ---------- fixed vs flexible ---------- */
const COMMITTED_CATS = new Set(["Housing", "Bills & Utilities", "Subscriptions", "Education"]);
/* Committed = rent/mortgage, bills, subscriptions, tuition and loans, plus any vendor that charges on a steady schedule. */
function committedTest() {
  const vendors = new Set(recurring().map(r => r.v));
  return t => COMMITTED_CATS.has(t.c) || vendors.has(t.v);
}

/* ---------- balances over time, rebuilt from transactions ---------- */
function balanceSeries(lo, hi) {
  const bank = D.txs.filter(t => D.accts[t.a].kind === "bank"), card = D.txs.filter(t => D.accts[t.a].kind === "card"), now = position();
  const days = []; for (let d = hi; d >= lo; d -= 7) days.push(d);
  days.reverse();
  return days.map(d => { const cash = now.cash - sum(bank.filter(t => t.day > d), t => t.amt), owed = now.owed + sum(card.filter(t => t.day > d), t => t.amt); return { day: d, cash, owed, net: cash - owed }; });
}

/* ---------- how far to trust the numbers ---------- */
function dataQuality() {
  const days = D.asOf - D.firstDay + 1, sp90 = D.spend.filter(t => t.day >= D.asOf - 89 && t.amt < 0);
  const total = spendOf(sp90), unc = sp90.filter(t => t.c === "Uncategorized");
  const uncTop = [...groupBy(unc, t => t.v)].map(([v, ts]) => [v, spendOf(ts)]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const perAcct = [...groupBy(D.txs, t => t.a)].map(([id, ts]) => ({ id, n: ts.length, first: Math.min(...ts.map(t => t.day)), last: Math.max(...ts.map(t => t.day)) }));
  const unlinked = D.txs.filter(t => t.k === "card_payment_out_unlinked" && t.day >= D.asOf - 89);
  const shortHistory = perAcct.filter(a => D.accts[a.id] && a.first > D.firstDay + 14 && D.accts[a.id].kind !== "dup");
  return { days, weeks: Math.round(days / 7), uncategorizedPct: total ? spendOf(unc) / total : 0, uncategorized: spendOf(unc), uncTop, perAcct,
    unlinked: { n: unlinked.length, amt: -sum(unlinked, t => t.amt) }, shortHistory, dups: Object.values(D.accts).filter(a => a.kind === "dup").length };
}
