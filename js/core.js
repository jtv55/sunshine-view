"use strict";
/* Core: formatting, theming, decryption, the in-memory data model, chart + card helpers. Loaded first; the page modules build on it. */

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
/* The palette has 8 category hues. The private config ("groups" in config/vendors.json, carried in the data) says which
   fine-grained categories share each hue, in color order; anything not listed is gray "Other". Data without groups falls back
   to giving the hues to the 8 categories you spend the most on. */
const PREF = ["Housing", "Groceries", "Dining", "Shopping", "Transport", "Bills & Utilities", "Subscriptions", "Health", "Education", "Travel", "Home",
  "Entertainment", "Personal Care", "Fees & Interest", "Pets", "Business", "Cash & ATM", "Gifts & Charity", "P2P", "Card spending (no detail)"];
let CAT_ORDER = PREF.slice(0, 8), GROUPS = [...CAT_ORDER, "Other"], OTHER_CATS = [], GROUP_OF = {}, GROUP_MEMBERS = {};
const catGroup = c => GROUP_OF[c] || (CAT_ORDER.includes(c) ? c : "Other");
const catColor = c => { const i = CAT_ORDER.indexOf(c); return i < 0 ? css("--other") : css("--s" + (i + 1)); };
function pickCats(spendRows) {
  const tot = new Map();
  spendRows.forEach(t => tot.set(t.c, (tot.get(t.c) || 0) + (-t.amt)));
  const defs = ((D.meta || {}).groups || []).slice(0, 8);
  GROUP_OF = {}; GROUP_MEMBERS = {};
  if (defs.length) {
    CAT_ORDER = defs.map(d => d[0]);
    defs.forEach(([g, cats]) => { GROUP_MEMBERS[g] = cats; cats.forEach(c => { GROUP_OF[c] = g; }); });
    GROUPS = [...CAT_ORDER, "Other"];
    OTHER_CATS = [...tot].filter(([c, v]) => v !== 0 && !GROUP_OF[c]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    return;
  }
  const ranked = [...tot].filter(([c, v]) => v > 0 && c !== "Uncategorized").sort((a, b) => b[1] - a[1]);
  const top = new Set(ranked.slice(0, 8).map(x => x[0]));
  CAT_ORDER = [...PREF.filter(c => top.has(c)), ...ranked.map(x => x[0]).filter(c => top.has(c) && !PREF.includes(c))];
  GROUPS = [...CAT_ORDER, "Other"];
  OTHER_CATS = ranked.slice(8).map(x => x[0]).concat(tot.has("Uncategorized") ? ["Uncategorized"] : []);
}
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
const D = { accts: {}, txs: [], spend: [], income: [], asOf: 0, months: [], lumps: false, store: null };
const SPEND_KINDS = new Set(["spend", "refund"]);
function buildModel(store) {
  D.store = store;
  D.accts = store.accounts;
  D.txs = Object.entries(store.transactions).filter(([, t]) => !t.pending && t.kind).map(([id, t]) => {
    const day = Math.floor(t.posted / 86400);
    return { id, a: t.account, day, ds: isoOf(day), m: isoOf(day).slice(0, 7), amt: t.amount, desc: t.description, v: t.vendor || "Unknown", c: t.cat || "Uncategorized", k: t.kind, seen: t.seen, match: t.match };
  }).sort((x, y) => y.day - x.day);
  /* pipeline facts (run log, GitHub, code, rules) and items still pending at the bank, for the Meta page */
  D.meta = store.meta || {};
  D.pending = Object.entries(store.transactions).filter(([, t]) => t.pending).map(([id, t]) => ({ id, a: t.account, day: Math.floor(t.posted / 86400), amt: t.amount, desc: t.description })).sort((x, y) => y.day - x.day);
  D.spend = D.txs.filter(t => SPEND_KINDS.has(t.k));
  if (D.lumps) // optional: paydowns to cards with no itemised history count as one lump of spending
    D.spend = D.spend.concat(D.txs.filter(t => t.k === "card_payment_out_unlinked").map(t => ({ ...t, v: "Card paydown (no detail)", c: "Card spending (no detail)", k: "spend" })));
  pickCats(D.spend);
  D.spend.sort((a, b) => b.day - a.day); D.spend.forEach(t => { t.s = -t.amt; t.g = catGroup(t.c); });
  D.unlinked = day0 => -sum(D.txs.filter(t => t.k === "card_payment_out_unlinked" && t.day >= day0), t => t.amt);
  D.income = D.txs.filter(t => t.k === "income");
  const snaps = Object.keys(store.snapshots || {}).sort();
  D.asOf = Math.max(D.txs[0]?.day || 0, snaps.length ? dayNum(snaps[snaps.length - 1]) : 0);
  D.updated = snaps.length ? snaps[snaps.length - 1] : isoOf(D.asOf);
  D.curMonth = isoOf(D.asOf).slice(0, 7);
  D.firstDay = D.txs.length ? D.txs[D.txs.length - 1].day : D.asOf;
}
const inWin = (list, lo, hi) => list.filter(t => t.day >= lo && t.day <= hi);
/* A month counts as complete only if it is over AND the data covers all of it (the month the data starts in is partial). */
const monthStartDay = m => dayNum(m + "-01");
const monthIsComplete = m => m < D.curMonth && monthStartDay(m) >= D.firstDay - 2;
const completeMonths = n => { const out = []; for (let i = n; i >= 1; i--) { const m = monthShift(D.curMonth, -i); if (monthIsComplete(m)) out.push(m); } return out; };
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
  const items = cats.map(c => h("span", { class: "chip", title: c === "Other" ? OTHER_CATS.join(", ") : (GROUP_MEMBERS[c] || []).join(", ") }, h("i", { class: "dot", style: `background:${catColor(c)}` }), c));
  if (cats.includes("Other") && OTHER_CATS.length) items.push(h("span", { class: "muted" }, "Other = " + OTHER_CATS.slice(0, 6).join(", ") + (OTHER_CATS.length > 6 ? ", ..." : "")));
  return h("div", { class: "legend" }, items);
}
function kpi(label, value, detail, hero) {
  return h("div", { class: "kpi" + (hero ? " hero" : "") }, h("div", { class: "l" }, label), h("div", { class: "v" }, value), h("div", { class: "d" }, detail || " "));
}
const delta = (cur, prev, label) => {
  if (!prev) return "";
  const d = cur - prev, p = d / Math.abs(prev);
  return (d >= 0 ? "▲ " : "▼ ") + fmt0(Math.abs(d)) + " (" + pct(p) + ") " + label;
};

/* ---------- small shared UI helpers ---------- */
const lum = hex => { const p = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * p[0] + .7152 * p[1] + .0722 * p[2]; };
const onColor = bg => lum(bg) > .38 ? "#0b0b0b" : "#ffffff";
const topN = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const catChip = c => h("span", { class: "chip" }, h("i", { class: "dot", style: `background:${catColor(catGroup(c))}` }), c);
const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
