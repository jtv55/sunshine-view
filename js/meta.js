"use strict";
/* Meta: how the dashboard itself is doing, and the loose ends only you can resolve.
   This file: the action lists (unrecognized merchants, unreconciled lines) and card / payment-method stats.
   pipelinestats.js: SimpleFIN refreshes, GitHub activity, ledger growth, rule health. */

/* ---------- reading the bank's own wording ---------- */
const ISSUERS = [["Bank of America", /bank of america|bofa|\bboa\b/i], ["Chase", /chase/i], ["American Express", /amex|american express/i], ["Capital One", /capital one/i],
  ["Citi", /\bciti/i], ["Discover", /discover/i], ["Apple Card", /apple card|gs bank/i], ["Synchrony", /synchrony/i], ["Barclays", /barclay/i], ["Wells Fargo", /wells fargo/i]];
const issuerOf = desc => (ISSUERS.find(([, rx]) => rx.test(desc)) || [])[0] || null;
const cardsOfIssuer = issuer => { const rx = (ISSUERS.find(([n]) => n === issuer) || [])[1]; return rx ? Object.entries(D.accts).filter(([, a]) => a.kind === "card" && rx.test(`${a.org} ${a.name}`)) : []; };
const acctLabel = id => { const a = D.accts[id]; return a ? `${a.org} ${a.name}` : "Unknown account"; };
const acctShort = id => { const a = D.accts[id]; return a ? `${a.org.replace(/ Bank$/, "")} ${a.name.replace(/\s*\(\d+\)\s*$/, "")}`.trim() : "?"; };

/* How a transaction was paid, read from the description and the account type. */
function channelOf(t) {
  const d = t.desc.toUpperCase(), kind = (D.accts[t.a] || {}).kind;
  if (kind === "card") return "Credit card";
  if (/ONLINE PMT|BILL ?PAY|\bACH\b|\bPPD\b|\bCCD\b|\bWEB\b/.test(d)) return "Online bill pay / ACH";
  if (/ZELLE|VENMO|CASH ?APP/.test(d)) return "Zelle / P2P";
  if (/\bATM\b|CASH WITHDRAWAL/.test(d)) return "ATM / cash";
  if (/\bCHECK\b|\bCHK\b/.test(d)) return "Check";
  if (/\bPOS\b|DEBIT CARD|PURCHASE|\bVIS\b/.test(d)) return "Debit card";
  return "Other";
}
const cardEnding = t => { const m = t.desc.match(/[*x](\d{4})\b/gi); return m ? m[m.length - 1].slice(1) : null; };
const firstDayByAccount = () => { const f = {}; D.txs.forEach(t => { f[t.a] = Math.min(f[t.a] ?? Infinity, t.day); }); return f; };
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dcell = d => h("span", { class: "nw" }, isoOf(d));
const ago = sec => sec < 5400 ? `${Math.max(1, Math.round(sec / 60))} min ago` : sec < 172800 ? `${Math.round(sec / 3600)} h ago` : `${Math.round(sec / 86400)} days ago`;

async function copyText(text, btn, after) {
  const old = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; setTimeout(() => { btn.textContent = old; }, 1600); }
  catch { window.prompt("Copy this:", text); }
  if (after) after();
}

/* A table whose body is built from DOM rows, in a card that scrolls. */
const listCard = ({ title, sub, head, rows, num = [], empty, span = 12, count }) => h("div", { class: `card span-${span}` },
  h("div", { class: "hd" }, h("div", {}, h("h2", {}, title, count != null ? h("span", { class: "count" }, String(count)) : null), sub ? h("div", { class: "sub" }, sub) : null)),
  rows.length ? h("div", { class: "tablev", style: "max-height:420px" }, tableEl(head, rows, num)) : h("div", { class: "note ok" }, empty));

/* ---------- unrecognized merchants ---------- */
function unrecognizedGroups() {
  return [...groupBy(D.spend.filter(t => t.c === "Uncategorized" && t.amt < 0), t => t.v)].map(([v, ts]) => ({ v, ts: ts.sort((a, b) => b.day - a.day), n: ts.length, total: spendOf(ts),
    accts: [...new Set(ts.map(t => t.a))], channels: [...new Set(ts.map(channelOf))], ends: [...new Set(ts.map(cardEnding).filter(Boolean))],
    first: Math.min(...ts.map(t => t.day)), last: Math.max(...ts.map(t => t.day)) })).sort((a, b) => b.total - a.total);
}
/* ---------- unreconciled lines ---------- */
function paydownDiagnosis(t, firstDay) {
  const issuer = issuerOf(t.desc);
  if (!issuer) return ["info", "Can't tell which card this paid from the wording. Check the raw line."];
  const cards = cardsOfIssuer(issuer);
  if (!cards.length) return ["watch", `No ${issuer} card is connected. Add it in SimpleFIN so its purchases can be itemized.`];
  const start = Math.min(...cards.map(([id]) => firstDay[id] ?? Infinity));
  if (t.day < start) return ["info", `Your ${issuer} card history starts ${isoOf(start)}, after this payment. Nothing to fix.`];
  const near = D.txs.filter(x => cards.some(([id]) => id === x.a) && x.k === "card_payment_in_unlinked" && Math.abs(x.day - t.day) <= 10);
  return near.length ? ["watch", `${issuer} has an unmatched credit of ${near.map(x => `${fmt2(x.amt)} on ${dlabel(x.day)}`).join(", ")} near this date. A split or partial payment?`]
    : ["watch", `${issuer} history covers this date but shows no unmatched credit near it. It may have gone to a different card, or still be pending.`];
}
const pill = (lvl, text) => h("span", { class: "pill " + (lvl === "watch" ? "warn" : "") }, text);

function unreconciledCards() {
  const first = firstDayByAccount(), out = [];
  const unl = D.txs.filter(t => t.k === "card_payment_out_unlinked").sort((a, b) => b.day - a.day);
  out.push(listCard({ title: "Card paydowns with no matching credit", count: unl.length, sub: `${fmt0(-sum(unl, t => t.amt))} left your accounts for cards the data can't match. They stay out of spending (counted in "Cards (no detail)" if you tick the toggle).`,
    head: ["Date", "Amount", "From", "Raw line", "Which card?", "Diagnosis"], num: [1], empty: "Every paydown is matched to a card credit.", rows: unl.slice(0, 40).map(t => { const [lvl, txt] = paydownDiagnosis(t, first);
      return [dcell(t.day), fmt2(-t.amt), acctShort(t.a), h("span", { class: "muted", title: t.desc }, t.desc.slice(0, 44)), issuerOf(t.desc) || "unknown", h("span", {}, pill(lvl, lvl === "watch" ? "check" : "ok"), " " + txt)]; }) }));

  const cin = D.txs.filter(t => t.k === "card_payment_in_unlinked").sort((a, b) => b.day - a.day), bankStart = Math.min(...Object.entries(D.accts).filter(([, a]) => a.kind === "bank").map(([id]) => first[id] ?? Infinity));
  out.push(listCard({ title: "Card credits with no matching bank debit", count: cin.length, sub: "Money that reached a card from somewhere the data can't see.", span: 6,
    head: ["Date", "Amount", "Card", "Hint"], num: [1], empty: "Every card payment traces back to a bank debit.",
    rows: cin.slice(0, 30).map(t => [dcell(t.day), fmt2(t.amt), acctShort(t.a), t.day < bankStart ? "Before your bank history starts" : "From an account that isn't connected, or another amount"]) }));

  const tr = D.txs.filter(t => t.k === "transfer" && !t.match).sort((a, b) => b.day - a.day);
  out.push(listCard({ title: "Transfers with no other side", count: tr.length, sub: "Looks like a move between your own accounts, but the other end isn't in the data.", span: 6,
    head: ["Date", "Amount", "Account", "Raw line"], num: [1], empty: "Every transfer has both ends.", rows: tr.slice(0, 30).map(t => [dcell(t.day), fmt2(t.amt), acctShort(t.a), h("span", { class: "muted", title: t.desc }, t.desc.slice(0, 48))]) }));

  out.push(listCard({ title: "Pending at the bank", count: D.pending.length, sub: "Not posted yet, so left out of every total until they clear.", span: 6, head: ["Date", "Amount", "Account", "Raw line"], num: [1],
    empty: "Nothing pending.", rows: D.pending.slice(0, 30).map(t => [dcell(t.day), fmt2(t.amt), acctShort(t.a), h("span", { class: "muted", title: t.desc }, t.desc.slice(0, 48))]) }));

  const dupKey = t => `${t.a}|${t.day}|${t.amt}|${t.desc}`, dups = [...groupBy(D.txs.filter(t => ["spend", "refund", "income"].includes(t.k)), dupKey)].filter(([, ts]) => ts.length > 1);
  out.push(listCard({ title: "Possible duplicate charges", count: dups.length, sub: "Same account, day, amount and wording more than once. Often legitimate (two coffees), sometimes a double charge.", span: 6,
    head: ["Date", "Amount", "Times", "Account", "Vendor"], num: [1, 2], empty: "No repeats found.", rows: dups.slice(0, 20).map(([, ts]) => [dcell(ts[0].day), fmt2(Math.abs(ts[0].amt)), String(ts.length), acctShort(ts[0].a), ts[0].v]) }));

  const pairs = D.txs.filter(t => t.match && t.amt < 0 && ["card_payment", "transfer"].includes(t.k)).sort((a, b) => b.day - a.day), byId = new Map(D.txs.map(t => [t.id, t]));
  out.push(h("details", { class: "card span-12 audit" }, h("summary", {}, h("b", {}, "Matched pairs"), h("span", { class: "muted" }, ` ${pairs.length} paydowns and transfers matched one-to-one and counted once (audit trail)`)),
    h("div", { class: "tablev", style: "max-height:360px" }, tableEl(["Out on", "Amount", "From", "In on", "To", "Kind"], pairs.slice(0, 60).map(t => { const o = byId.get(t.match); return [dcell(t.day), fmt2(-t.amt), acctShort(t.a), o ? dcell(o.day) : "?", o ? acctShort(o.a) : "?", t.k === "card_payment" ? "Card paydown" : "Own-account transfer"]; }), [1]))));
  return out;
}

/* ---------- cards and payment methods ---------- */
function cardStatsCards() {
  const lo = D.asOf - 89, cards = Object.entries(D.accts).filter(([, a]) => a.kind === "card"), first = firstDayByAccount(), out = [];
  const rows = cards.map(([id, a]) => {
    const t = inWin(D.txs.filter(x => x.a === id), lo, D.asOf), sp = t.filter(x => x.amt < 0 && !["card_payment_out_unlinked"].includes(x.k)), cat = topN(new Map([...groupBy(sp, x => x.c)].map(([c, ts]) => [c, sum(ts, x => -x.amt)])), 1)[0];
    const all = D.txs.filter(x => x.a === id);
    return { id, name: acctShort(id), owed: -a.balance, charges: sum(sp, x => -x.amt), n: sp.length, refunds: sum(t.filter(x => x.k === "refund"), x => x.amt), fees: sum(sp.filter(x => x.c === "Fees & Interest"), x => -x.amt),
      paid: sum(t.filter(x => x.k === "card_payment" || x.k === "card_payment_in_unlinked"), x => x.amt), top: cat ? `${cat[0]} (${fmt0(cat[1])})` : "-", from: first[id], last: all.length ? Math.max(...all.map(x => x.day)) : null };
  });
  const totalCharges = sum(rows, r => r.charges) || 1;
  out.push(listCard({ title: "Your cards, last 90 days", sub: "Owed is the bank's reported balance. Charges exclude paydowns.", span: 7, head: ["Card", "Owed now", "Charges", "Share", "Purchases", "Avg", "Refunds", "Fees", "Paid down", "Top category", "History from"],
    num: [1, 2, 3, 4, 5, 6, 7, 8], empty: "No credit cards connected.", rows: rows.map(r => [r.name, fmt0(r.owed), fmt0(r.charges), Math.round(r.charges / totalCharges * 100) + "%", String(r.n), r.n ? fmt0(r.charges / r.n) : "-", fmt0(r.refunds), fmt0(r.fees), fmt0(r.paid), r.top, r.from ? isoOf(r.from) : "-"]) }));

  const c1 = card({ title: "Which card for what", sub: "Spending by card, split by category (last 90 days)", span: 5, height: Math.max(220, 90 + rows.length * 44), legend: catLegend(),
    table: () => ({ cols: ["Card", ...GROUPS, "Total"], num: GROUPS.map((_, i) => i + 1).concat([GROUPS.length + 1]), rows: rows.map(r => { const sp = D.spend.filter(t => t.a === r.id && t.day >= lo); return [r.name, ...GROUPS.map(gp => fmt0(spendOf(sp.filter(t => t.g === gp)))), fmt0(spendOf(sp))]; }) }) });
  c1.draw(() => {
    const t = T();
    return baseOpt({ legend: { show: false }, grid: { left: 8, right: 16, top: 8, bottom: 24, containLabel: true }, tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: v => fmt0(v) },
      xAxis: { type: "value", ...axisStyle(), axisLine: { show: false }, axisLabel: { color: t.muted, fontSize: 11, formatter: v => fmt0(v) } },
      yAxis: { type: "category", inverse: true, data: rows.map(r => r.name), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.ink2, fontSize: 12, width: 130, overflow: "truncate" } },
      series: GROUPS.map(gp => ({ name: gp, type: "bar", stack: "c", barWidth: 22, data: rows.map(r => Math.round(spendOf(D.spend.filter(x => x.a === r.id && x.day >= lo && x.g === gp)))), itemStyle: { color: catColor(gp), borderColor: t.surface, borderWidth: 1 } })) });
  });
  out.push(rows.length ? c1.root : h("div", { class: "card span-5" }, "No cards."));

  // how things get paid: channel mix, and which debit cards are in use
  const sp90 = D.spend.filter(t => t.day >= lo && t.amt < 0), byCh = [...groupBy(sp90, channelOf)].map(([ch, ts]) => ({ ch, total: spendOf(ts), n: ts.length })).sort((a, b) => b.total - a.total);
  const c2 = card({ title: "How you pay", sub: "Spending by payment method, last 90 days. Read from the bank's wording and the account type.", span: 7, height: Math.max(220, 70 + byCh.length * 36),
    table: () => ({ cols: ["Method", "Spent", "Purchases", "Average"], num: [1, 2, 3], rows: byCh.map(x => [x.ch, fmt0(x.total), String(x.n), fmt0(x.total / x.n)]) }) });
  c2.draw(() => { const t = T();
    return baseOpt({ legend: { show: false }, grid: { left: 8, right: 70, top: 6, bottom: 6, containLabel: true }, tooltip: { ...baseOpt().tooltip, trigger: "item", formatter: p => `<b>${esc(byCh[p.dataIndex].ch)}</b><br>${fmt0(byCh[p.dataIndex].total)} over ${byCh[p.dataIndex].n} purchases` },
      xAxis: { type: "value", show: false }, yAxis: { type: "category", inverse: true, data: byCh.map(x => x.ch), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.ink2, fontSize: 12 } },
      series: [{ type: "bar", barWidth: 16, data: byCh.map(x => Math.round(x.total)), itemStyle: { color: t.accent, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: "right", color: t.ink2, fontSize: 11, formatter: p => fmt0(p.value) } }] }); });
  out.push(c2.root);

  const debit = sp90.filter(t => channelOf(t) === "Debit card" && cardEnding(t)), byEnd = [...groupBy(debit, cardEnding)].map(([e, ts]) => ({ e, accts: [...new Set(ts.map(t => acctShort(t.a)))].join(", "), total: spendOf(ts), n: ts.length })).sort((a, b) => b.total - a.total);
  out.push(listCard({ title: "Debit cards in use", sub: "Last four digits that appear in the bank's descriptions", span: 5, head: ["Card ending", "Account", "Purchases", "Spent"], num: [2, 3],
    empty: "No debit-card digits found in the descriptions.", rows: byEnd.map(x => ["•••• " + x.e, x.accts, String(x.n), fmt0(x.total)]) }));
  return out;
}

/* ---------- the page ---------- */
function meta() {
  const page = $("#page"), dq = dataQuality(), lastFetch = runs().filter(r => r.mode === "fetch").slice(-1)[0];
  const snapDays = [...fetchDays().keys()].sort((a, b) => b - a), lastSec = lastFetch ? lastFetch.t : snapDays.length ? snapDays[0] * 86400 : null, age = lastSec ? nowSec() - lastSec : null;
  const groups = unrecognizedGroups(), unl = D.txs.filter(t => t.k === "card_payment_out_unlinked"), cin = D.txs.filter(t => t.k === "card_payment_in_unlinked"), tr = D.txs.filter(t => t.k === "transfer" && !t.match);
  const open = groups.length + unl.length + cin.length + tr.length, gh = D.meta.github, sched = gh ? (gh.runs || []).filter(r => r[1] === "schedule" && r[0] >= nowSec() - 30 * 86400 && r[2] !== "in_progress") : [];
  const unrecTotal = sum(groups, g => g.total);

  page.replaceChildren(pageHead("Meta", "How the dashboard itself is doing: data freshness, loose ends only you can resolve, and the pipeline behind it."));
  page.append(lede((age != null ? `Data was last refreshed <b>${ago(age)}</b>. ` : "") + (open ? `<b>${open}</b> thing${open === 1 ? "" : "s"} could use a look: ${groups.length} merchant${groups.length === 1 ? "" : "s"} without a category (${fmt0(unrecTotal)}), ` +
    `${unl.length} card paydown${unl.length === 1 ? "" : "s"} that can't be matched, ${cin.length} unmatched card credit${cin.length === 1 ? "" : "s"} and ${tr.length} one-sided transfer${tr.length === 1 ? "" : "s"}.` : "Everything is categorized and every line reconciles.") +
    (D.pending.length ? ` ${D.pending.length} item${D.pending.length === 1 ? " is" : "s are"} still pending at the bank.` : "")));
  page.append(h("div", { class: "kpis" },
    kpi("Last refresh", age != null ? ago(age) : "unknown", lastSec ? stamp(lastSec) : "no run logged yet", true),
    kpi("Nightly runs that passed", sched.length ? `${sched.filter(r => r[2] === "success").length} of ${sched.length}` : "n/a", sched.length ? "scheduled runs, last 30 days" : "no scheduled run logged yet"),
    kpi("Transactions held", D.txs.length.toLocaleString(), lastFetch ? `${lastFetch.new} new in the latest fetch` : `${dq.weeks} weeks of history`),
    kpi("Categorized", Math.round((1 - dq.uncategorizedPct) * 100) + "%", "of the last 90 days of spending"),
    kpi("Items to review", String(open), open ? "merchants and unreconciled lines below" : "nothing outstanding")));

  const section = (title, sub, nodes) => { page.append(sectionHead(title, sub)); const g = h("div", { class: "grid" }); nodes.forEach(n => g.append(n)); page.append(g); };
  section("Needs your decision", "Merchants no rule recognizes, and merchants filed under the wrong category", [unrecognizedCard(), recategorizeCard()]);
  section("Unreconciled lines", "Money movements the data can't tie together", unreconciledCards());
  section("Cards and payment methods", "How each card and account is used", cardStatsCards());
  section("SimpleFIN refreshes", "How often, how fresh, how much of the daily allowance", [freshnessCard(), ...refreshCards()]);
  section("GitHub activity", "This repository's own history", githubCards());
  section("Data forensics", "Does the ledger look like real money?", [benfordCard()]);
  section("Ledger and rules", "How the data and the merchant rules are holding up", ledgerCards());
}
