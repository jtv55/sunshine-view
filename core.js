"use strict";
/* Core: unlock/decrypt, data model, formatting, theming, chart + card helpers, card reconciliation. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt0 = n => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const fmt2 = n => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n, d = 0) => (n >= 0 ? "+" : "") + (n * 100).toFixed(d) + "%";
const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function groupBy(a, f) { const m = new Map(); for (const x of a) { const k = f(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; }
const dayNum = ds => Math.floor(Date.parse(ds + "T00:00:00Z") / 86400000);
const isoOf = d => new Date(d * 86400000).toISOString().slice(0, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dlabel = d => { const x = new Date(d * 86400000); return MON[x.getUTCMonth()] + " " + x.getUTCDate(); };
const mlabel = m => MON[+m.slice(5) - 1] + " '" + m.slice(2, 4);
const monthShift = (m, k) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5) - 1 + k, 1)); return d.toISOString().slice(0, 7); };

/* ---------- theming ---------- */
let cssCache = null;
const css = n => { cssCache = cssCache || getComputedStyle(document.documentElement); return cssCache.getPropertyValue(n).trim(); };
function resetTheme() { cssCache = null; }
const CAT_ORDER = ["Housing", "Groceries", "Dining", "Shopping", "Transport", "Bills & Utilities", "Subscriptions", "Health"];
const catGroup = c => CAT_ORDER.includes(c) ? c : "Other";
const catColor = c => { const i = CAT_ORDER.indexOf(c); return i < 0 ? css("--other") : css("--s" + (i + 1)); };
const GROUPS = [...CAT_ORDER, "Other"];
function mix(a, b, t) { // blend hex a toward hex b by t (0..1)
  const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function T() {
  return { ink: css("--ink"), ink2: css("--ink2"), muted: css("--muted"), grid: css("--grid"), axis: css("--axis"), surface: css("--surface"),
    accent: css("--accent"), other: css("--other"), up: css("--up"), down: css("--down"), mid: css("--mid"),
    seq: ["--q1", "--q2", "--q3", "--q4", "--q5", "--q6"].map(css) };
}
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
function baseOpt(extra = {}) {
  const c = T();
  return Object.assign({
    textStyle: { fontFamily: FONT, color: c.ink2 },
    animationDuration: 350,
    tooltip: { confine: true, backgroundColor: c.surface, borderColor: c.axis, textStyle: { color: c.ink, fontSize: 12 }, extraCssText: "box-shadow:none;" },
    legend: { top: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 14, textStyle: { color: c.ink2, fontSize: 12 } },
  }, extra);
}
const axisStyle = () => { const c = T(); return { axisLine: { lineStyle: { color: c.axis } }, axisTick: { show: false }, axisLabel: { color: c.muted, fontSize: 11 }, splitLine: { lineStyle: { color: c.grid, type: "solid" } } }; };
const moneyAxis = () => ({ type: "value", ...axisStyle(), axisLine: { show: false }, axisLabel: { color: T().muted, fontSize: 11, formatter: v => fmt0(v) } });

/* ---------- unlock / decrypt ---------- */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decrypt(blob, pass) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(blob.salt), iterations: blob.iter || 600000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(blob.iv) }, key, b64(blob.ct))));
}

/* ---------- data model ---------- */
const D = { accts: {}, txs: [], spend: [], income: [], asOf: 0, months: [] };
const SPEND_KINDS = new Set(["spend", "refund"]);
function buildModel(store) {
  D.accts = store.accounts;
  D.txs = Object.entries(store.transactions).filter(([, t]) => !t.pending && t.kind).map(([id, t]) => {
    const day = Math.floor(t.posted / 86400);
    return { id, a: t.account, day, ds: isoOf(day), m: isoOf(day).slice(0, 7), amt: t.amount, desc: t.description, v: t.vendor || "Unknown", c: t.cat || "Uncategorized", k: t.kind };
  }).sort((x, y) => y.day - x.day);
  D.spend = D.txs.filter(t => SPEND_KINDS.has(t.k)); D.spend.forEach(t => { t.s = -t.amt; t.g = catGroup(t.c); });
  D.income = D.txs.filter(t => t.k === "income");
  const snaps = Object.keys(store.snapshots || {}).sort();
  D.asOf = Math.max(D.txs[0]?.day || 0, snaps.length ? dayNum(snaps[snaps.length - 1]) : 0);
  D.updated = snaps.length ? snaps[snaps.length - 1] : isoOf(D.asOf);
  D.curMonth = isoOf(D.asOf).slice(0, 7);
  D.firstDay = D.txs.length ? D.txs[D.txs.length - 1].day : D.asOf;
}
const inWin = (list, lo, hi) => list.filter(t => t.day >= lo && t.day <= hi);
const completeMonths = n => { const out = []; for (let i = n; i >= 1; i--) out.push(monthShift(D.curMonth, -i)); return out; };
const spendOf = list => sum(list, t => t.s);

/* ---------- chart + card helpers ---------- */
let charts = [], redraws = [], observers = [];
function disposeAll() { observers.forEach(o => o.disconnect()); charts.forEach(c => c.dispose()); charts = []; redraws = []; observers = []; }
window.addEventListener("resize", () => charts.forEach(c => c.resize()));

function card({ title, sub, height = 320, span = 12, table, legend }) {
  const root = h("div", { class: "card span-" + span });
  const tbtn = table ? h("button", { class: "ghost", "aria-pressed": "false", title: "Show the data behind this chart" }, "Table") : null;
  root.append(h("div", { class: "hd" }, h("div", {}, h("h2", {}, title), sub ? h("div", { class: "sub" }, sub) : null), tbtn));
  if (legend) root.append(legend);
  const chartEl = h("div", { class: "chart", role: "img", "aria-label": title, style: `height:${height}px` });
  const tv = h("div", { class: "tablev", hidden: "" });
  root.append(chartEl, tv);
  if (table) tbtn.addEventListener("click", () => {
    const on = tv.hidden; tv.hidden = !on; chartEl.hidden = on; tbtn.setAttribute("aria-pressed", on);
    if (on) { const t = table(); tv.replaceChildren(tableEl(t.cols, t.rows, t.num)); } else resizeSoon();
  });
  return { root, chartEl, draw: optFn => lazyChart(chartEl, optFn) };
}
/* Init only once the container is attached and has a width (cards are appended after draw() is called). */
function lazyChart(el, optFn, opts = {}) {
  let ch = null, latest = null;
  const go = () => { if (ch) { ch.setOption(optFn(), true); if (latest) ch.setOption(latest); } };
  const ro = new ResizeObserver(() => {
    if (!ch) { if (el.clientWidth > 0) { ch = echarts.init(el, null, { renderer: "svg" }); charts.push(ch); go(); } } else ch.resize();
  });
  ro.observe(el); observers.push(ro); redraws.push(go);
  return { setOption(o) { latest = o; if (ch) ch.setOption(o); } };
}
const resizeSoon = () => setTimeout(() => charts.forEach(c => c.resize()), 0);
function tableEl(cols, rows, num = []) {
  const t = h("table");
  t.append(h("thead", {}, h("tr", {}, cols.map((c, i) => h("th", { class: num.includes(i) ? "n" : "" }, c)))));
  t.append(h("tbody", {}, rows.map(r => h("tr", {}, r.map((v, i) => h("td", { class: num.includes(i) ? "n" : "" }, v))))));
  return t;
}
function catLegend(cats = GROUPS) {
  return h("div", { class: "legend" }, cats.map(c => h("span", { class: "chip" }, h("i", { class: "dot", style: `background:${catColor(c)}` }), c)));
}
function kpi(label, value, detail, hero) {
  return h("div", { class: "kpi" + (hero ? " hero" : "") }, h("div", { class: "l" }, label), h("div", { class: "v" }, value), h("div", { class: "d" }, detail || " "));
}
const delta = (cur, prev, label) => {
  if (!prev) return "";
  const d = cur - prev, p = d / Math.abs(prev);
  return (d >= 0 ? "▲ " : "▼ ") + fmt0(Math.abs(d)) + " (" + pct(p) + ") " + label;
};

/* ---------- credit-card reconciliation ---------- */
function recon(lo, hi) {
  const cards = Object.entries(D.accts).filter(([, a]) => a.kind === "card");
  const rows = cards.map(([id, a]) => {
    const t = D.txs.filter(x => x.a === id && x.day >= lo && x.day <= hi);
    const charges = sum(t.filter(x => x.amt < 0), x => -x.amt);
    const refunds = sum(t.filter(x => x.k === "refund"), x => x.amt);
    const matched = t.filter(x => x.k === "card_payment"), other = t.filter(x => x.k === "card_payment_in_unlinked");
    const net = sum(t, x => x.amt), owedNow = -a.balance, owedOpen = owedNow + net;
    return { id, name: a.name, org: a.org, n: t.length, charges, refunds, payMatched: sum(matched, x => x.amt), nMatched: matched.length,
      payOther: sum(other, x => x.amt), nOther: other.length, owedOpen, owedNow };
  });
  const bankSide = D.txs.filter(x => x.day >= lo && x.day <= hi && D.accts[x.a].kind !== "card");
  const toLinked = bankSide.filter(x => x.k === "card_payment");
  const toUnlinked = bankSide.filter(x => x.k === "card_payment_out_unlinked");
  return { rows, toLinked: { n: toLinked.length, amt: -sum(toLinked, x => x.amt) }, toUnlinked: { n: toUnlinked.length, amt: -sum(toUnlinked, x => x.amt) } };
}

function reconSection(lo, hi, label) {
  const r = recon(lo, hi), root = h("section", { class: "recon" });
  root.append(h("h2", {}, "Credit card reconciliation"), h("div", { class: "sub" },
    `${label}. Card paydowns are matched one-to-one between the bank debit and the card credit, so each is counted once and kept out of the spending charts above. Vendor detail comes from the card purchases themselves.`));
  if (!r.rows.length) { root.append(h("div", { class: "card" }, "No credit-card accounts were found in the feed. If a card is missing, add its name to scripts/accounts.json.")); return root; }
  const T_ = k => sum(r.rows, x => x[k]);
  const tot = { owedOpen: T_("owedOpen"), charges: T_("charges"), refunds: T_("refunds"), payMatched: T_("payMatched"), payOther: T_("payOther"), owedNow: T_("owedNow") };
  const wf = card({ title: "Where the balance came from", sub: "All cards combined: implied balance owed at the start of the window, to balance owed now", span: 5, height: 300,
    table: () => ({ cols: ["Step", "Amount"], num: [1], rows: [["Owed at start (implied)", fmt0(tot.owedOpen)], ["+ Charges", fmt0(tot.charges)], ["- Refunds", fmt0(-tot.refunds)],
      ["- Paydowns from linked accounts (de-duplicated)", fmt0(-tot.payMatched)], ["- Paydowns from other sources", fmt0(-tot.payOther)], ["= Owed now (reported)", fmt0(tot.owedNow)]] }) });
  wf.draw(() => {
    const c = T(), steps = [["Owed at start", tot.owedOpen, "total"], ["Charges", tot.charges, "up"], ["Refunds", -tot.refunds, "down"],
      ["Paydowns (linked)", -tot.payMatched, "down"], ["Paydowns (other)", -tot.payOther, "down"], ["Owed now", tot.owedNow, "total"]];
    let run = 0; const base = [], up = [], down = [], total = [];
    steps.forEach(([, v, t]) => {
      if (t === "total") { base.push(0); total.push(v); up.push(0); down.push(0); run = v; }
      else if (v >= 0) { base.push(run); up.push(v); down.push(0); total.push(0); run += v; }
      else { run += v; base.push(Math.max(run, 0)); down.push(-v); up.push(0); total.push(0); }
    });
    const s = (name, data, color) => ({ name, type: "bar", stack: "w", data, itemStyle: { color, borderColor: c.surface, borderWidth: 1 }, barWidth: "56%" });
    return baseOpt({ legend: { show: false }, grid: { left: 56, right: 8, top: 12, bottom: 44 },
      tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "none" }, formatter: ps => { const i = ps[0].dataIndex; return `${steps[i][0]}<br><b>${fmt0(Math.abs(steps[i][1]))}</b>`; } },
      xAxis: { type: "category", data: steps.map(x => x[0]), ...axisStyle(), axisLabel: { color: c.muted, fontSize: 11, interval: 0, width: 66, overflow: "break" } }, yAxis: moneyAxis(),
      series: [{ name: "b", type: "bar", stack: "w", data: base, itemStyle: { color: "transparent" }, silent: true, tooltip: { show: false } },
        s("Total", total, c.ink2), s("Increase", up, css("--s2")), s("Decrease", down, css("--s1"))] });
  });
  const tbl = h("div", { class: "card span-7" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "By card"), h("div", { class: "sub" }, "Owed = balance reported by the bank. Start-of-window balance is inferred: owed now + paydowns + refunds - charges."))),
    h("div", { class: "tablev", style: "max-height:none" }, tableEl(["Card", "Owed at start", "Charges", "Refunds", "Paydowns", "Owed now"],
      [...r.rows.map(x => [x.org + " " + x.name, fmt0(x.owedOpen), fmt0(x.charges), fmt0(-x.refunds), fmt0(-(x.payMatched + x.payOther)) + (x.nMatched + x.nOther ? ` (${x.nMatched + x.nOther})` : ""), fmt0(x.owedNow)]),
        ["All cards", fmt0(tot.owedOpen), fmt0(tot.charges), fmt0(-tot.refunds), fmt0(-(tot.payMatched + tot.payOther)), fmt0(tot.owedNow)]], [1, 2, 3, 4, 5])));
  const flags = [];
  const unl = r.toUnlinked, paidIn = tot.payMatched + tot.payOther, paidOut = r.toLinked.amt + unl.amt;
  flags.push(`Bank paydowns to cards in this feed: ${r.toLinked.n} payments, ${fmt0(r.toLinked.amt)}. Matching card credits: ${fmt0(tot.payMatched)}. ` +
    (Math.abs(r.toLinked.amt - tot.payMatched) < 1 ? "These tie out." : "The difference is timing at the window edge or an unmatched payment."));
  if (unl.n) flags.push(`${fmt0(unl.amt)} in ${unl.n} payment(s) went to cards that are not in the feed. Their purchases can't be itemised by vendor, so they stay out of spending and are shown only here.`);
  if (tot.payOther) flags.push(`${fmt0(tot.payOther)} of card credits arrived from accounts that are not in the feed (not matched to any bank debit).`);
  r.rows.filter(x => x.owedOpen < -1).forEach(x => flags.push(`${x.name}: the inferred starting balance is negative (${fmt0(x.owedOpen)}), which usually means older history is missing from the feed.`));
  tbl.append(h("ul", { class: "bul note", style: "margin-top:12px" }, flags.map(f => h("li", {}, f))));
  root.append(h("div", { class: "grid" }, wf.root, tbl));
  return root;
}
