"use strict";
/* Time scope: one control (3 weeks / 3 months / 12 months / all data) shared by Cash flow, Spending and Accounts.
   It sets the date window and the bucket size: rolling 7-day weeks for short windows, calendar months for long ones. */

const SCOPES = [{ key: "3w", label: "3 weeks", days: 21 }, { key: "3m", label: "3 months", days: 91 }, { key: "12m", label: "12 months", days: 364 }, { key: "all", label: "All data", days: Infinity }];
const scopeState = { cashflow: "all", spending: "3w", accounts: "all" }; // remembered while the page stays open

function scopeWindow(key) {
  const sc = SCOPES.find(s => s.key === key) || SCOPES[3], hi = D.asOf;
  const lo = sc.days === Infinity ? D.firstDay : Math.max(D.firstDay, hi - sc.days + 1), span = hi - lo + 1, weekly = span <= 100;
  const buckets = [];
  if (weekly) {
    const n = Math.max(1, Math.ceil(span / 7));
    for (let i = n - 1; i >= 0; i--) { const b = { lo: hi - 6 - 7 * i, hi: hi - 7 * i }; b.long = dlabel(b.lo) + " - " + dlabel(b.hi); b.label = n <= 4 ? b.long : dlabel(b.lo); b.partial = false; buckets.push(b); }
  } else {
    for (let m = isoOf(lo).slice(0, 7); m <= isoOf(hi).slice(0, 7); m = monthShift(m, 1)) {
      const s = monthStartDay(m), e = monthStartDay(monthShift(m, 1)) - 1, partial = s < lo - 2 || e > hi;
      buckets.push({ lo: Math.max(s, lo), hi: Math.min(e, hi), label: mlabel(m) + (partial ? "*" : ""), long: mlabel(m) + (partial ? " (partial)" : ""), partial, m });
    }
  }
  return { key: sc.key, label: sc.label, lo, hi, span, weekly, buckets, prev: { lo: lo - span, hi: lo - 1, ok: lo - span >= D.firstDay - 2 }, unit: weekly ? "week" : "month" };
}

/* Spending and income summed into each bucket of the scope. */
function bucketData(sc) {
  return sc.buckets.map(b => {
    const tx = inWin(D.spend, b.lo, b.hi), g = Object.fromEntries(GROUPS.map(x => [x, 0]));
    tx.forEach(t => { g[t.g] += t.s; });
    return { ...b, tx, g, tot: spendOf(tx), inc: sum(inWin(D.income, b.lo, b.hi), t => t.amt) };
  });
}

/* The row of range chips. Choosing one re-renders the page. */
function scopeBar(pageKey) {
  const cov = D.asOf - D.firstDay + 1;
  return h("div", { class: "scope", role: "group", "aria-label": "Time range" }, h("span", { class: "muted" }, "Range"),
    SCOPES.map(s => h("button", { class: "chipbtn", "aria-pressed": String(scopeState[pageKey] === s.key),
      title: s.days !== Infinity && s.days > cov + 7 ? `You have ${Math.round(cov / 7)} weeks of data, so this shows all of it` : "", onclick: () => { scopeState[pageKey] = s.key; route(); } }, s.label)));
}

function pageHead(title, sub, pageKey) {
  return h("div", { class: "pagehead" }, h("div", {}, h("h1", {}, title), sub ? h("div", { class: "muted" }, sub) : null), pageKey ? scopeBar(pageKey) : null);
}
const lede = html => h("p", { class: "lede", html });
const sectionHead = (title, sub) => h("div", { class: "sec" }, h("h2", {}, title), sub ? h("span", { class: "muted" }, sub) : null);
