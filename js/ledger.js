"use strict";
/* Ledger: every transaction in the Accounts page's range, filterable and sortable, with a CSV download of exactly what the
   filters show. Includes transfers, card paydowns and brokerage moves (labelled by kind), so money in/out here is larger than
   on the spending pages. Built in the browser from the decrypted data; nothing is sent anywhere. */

const KIND_NAME = { spend: "Spending", refund: "Refund", income: "Income", transfer: "Transfer", card_payment: "Card paydown", card_payment_out_unlinked: "Card paydown (no card match)",
  card_payment_in_unlinked: "Card credit (no bank match)", loan_credit: "Loan credit", investing: "Investing" };
const LEDGER_PAGE = 100;

function ledgerRows(lo, hi) {
  return D.txs.filter(t => t.day >= lo && t.day <= hi && t.k !== "duplicate").map(t => ({ day: t.day, date: t.ds, accountId: t.a, account: acctShort(t.a), desc: t.desc, vendor: t.v, category: t.c,
    group: t.k === "spend" || t.k === "refund" ? catGroup(t.c) : "", kindKey: t.k, kind: KIND_NAME[t.k] || t.k, amount: t.amt }));
}

/* One CSV cell. Text that starts with = + - @ (or a tab/CR) would be run as a formula by Excel, so it is prefixed with an apostrophe. */
function csvCell(value, isText) {
  let s = String(value ?? "");
  if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
/* Excel-friendly CSV: UTF-8 with a byte-order mark, CRLF line ends, amounts as plain signed numbers (negative = money out). */
function ledgerCsv(rows) {
  const head = ["Date", "Account", "Description", "Vendor", "Category", "Group", "Kind", "Amount"];
  const body = rows.map(r => [r.date, r.account, r.desc, r.vendor, r.category, r.group, r.kind].map(v => csvCell(v, true)).concat(r.amount.toFixed(2)).join(","));
  return "﻿" + [head.join(","), ...body].join("\r\n") + "\r\n";
}
function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })), a = h("a", { href: url, download: filename });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function ledgerCard(sc) {
  const all = ledgerRows(sc.lo, sc.hi), root = h("div", { class: "card span-12" });
  const state = { account: "", kind: "", group: "", q: "", sort: "day", dir: -1, shown: LEDGER_PAGE };
  const opts = (label, items) => [h("option", { value: "" }, label), ...items.map(([v, t]) => h("option", { value: v }, t))];
  const accts = [...new Map(all.map(r => [r.accountId, r.account]))].sort((a, b) => a[1].localeCompare(b[1]));
  const kinds = [...new Map(all.map(r => [r.kindKey, r.kind]))].sort((a, b) => a[1].localeCompare(b[1]));
  const groups = [...new Set(all.map(r => r.group).filter(Boolean))];
  const selAcct = h("select", { "aria-label": "Account" }, opts("All accounts", accts)), selKind = h("select", { "aria-label": "Kind" }, opts("All kinds", kinds));
  const selGroup = h("select", { "aria-label": "Category group" }, opts("All groups", groups.map(g => [g, g]))), box = h("input", { type: "search", placeholder: "Search description or vendor", "aria-label": "Search", style: "min-width:220px" });
  const csvBtn = h("button", { class: "primary" }, "Download CSV"), summary = h("div", { class: "muted ledger-sum" }), more = h("button", { class: "ghost" }, "Show more");
  const COLS = [["day", "Date"], ["account", "Account"], ["desc", "Description"], ["vendor", "Vendor"], ["category", "Category"], ["kind", "Kind"], ["amount", "Amount"]];
  const ths = COLS.map(([key, label]) => h("th", { class: key === "amount" ? "n" : "", "aria-sort": "none" }, h("button", { class: "sortbtn", onclick: () => { state.dir = state.sort === key ? -state.dir : (key === "amount" || key === "day" ? -1 : 1); state.sort = key; state.shown = LEDGER_PAGE; draw(); } }, label)));
  const body = h("tbody"), table = h("table", {}, h("thead", {}, h("tr", {}, ths)), body);

  const filtered = () => {
    const q = state.q.toLowerCase();
    return all.filter(r => (!state.account || r.accountId === state.account) && (!state.kind || r.kindKey === state.kind) && (!state.group || r.group === state.group)
      && (!q || r.desc.toLowerCase().includes(q) || r.vendor.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)))
      .sort((a, b) => { const x = a[state.sort], y = b[state.sort]; return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * state.dir || b.day - a.day; });
  };
  function draw() {
    const rows = filtered(), money = sum(rows.filter(r => r.amount > 0), r => r.amount), out = sum(rows.filter(r => r.amount < 0), r => r.amount);
    summary.textContent = `${rows.length.toLocaleString()} transaction${rows.length === 1 ? "" : "s"} · money in ${fmt0(money)} · money out ${fmt0(-out)} · net ${fmt0(Math.abs(money + out) < 0.5 ? 0 : money + out)}`;
    csvBtn.textContent = `Download CSV (${rows.length.toLocaleString()} rows)`; csvBtn.toggleAttribute("disabled", !rows.length);
    COLS.forEach(([key], i) => ths[i].setAttribute("aria-sort", state.sort === key ? (state.dir > 0 ? "ascending" : "descending") : "none"));
    body.replaceChildren(...rows.slice(0, state.shown).map(r => h("tr", {}, h("td", { class: "nw" }, r.date), h("td", {}, r.account), h("td", { class: "muted", title: r.desc }, r.desc.length > 60 ? r.desc.slice(0, 60) + "..." : r.desc),
      h("td", {}, r.vendor), h("td", {}, r.group ? catChip(r.category) : r.category), h("td", {}, r.kind), h("td", { class: "n " + (r.amount < 0 ? "" : "pos") }, fmt2(r.amount)))));
    if (!rows.length) body.replaceChildren(h("tr", {}, h("td", { colspan: COLS.length, class: "muted" }, "No transactions match these filters.")));
    more.hidden = rows.length <= state.shown; more.textContent = `Show ${Math.min(LEDGER_PAGE, rows.length - state.shown)} more`;
    return rows;
  }
  const refilter = () => { state.shown = LEDGER_PAGE; draw(); };
  selAcct.addEventListener("change", () => { state.account = selAcct.value; refilter(); }); selKind.addEventListener("change", () => { state.kind = selKind.value; refilter(); });
  selGroup.addEventListener("change", () => { state.group = selGroup.value; refilter(); }); box.addEventListener("input", () => { state.q = box.value.trim(); refilter(); });
  more.addEventListener("click", () => { state.shown += LEDGER_PAGE; draw(); });
  csvBtn.addEventListener("click", () => { const rows = filtered(); downloadText(`sunshine-ledger_${sc.key}_${isoOf(D.asOf)}.csv`, ledgerCsv(rows)); });

  root.append(h("div", { class: "hd" }, h("div", {}, h("h2", {}, "All transactions"), h("div", { class: "sub" }, `${isoOf(sc.lo)} to ${isoOf(sc.hi)}, following the range above. Includes transfers and card paydowns (labelled by kind), so money in and out is larger than on the spending pages. Negative amounts are money out.`)), csvBtn),
    h("div", { class: "ledger-controls" }, selAcct, selKind, selGroup, box), summary, h("div", { class: "tablev", style: "max-height:640px" }, table), h("div", { class: "ledger-more" }, more),
    h("div", { class: "note" }, "The CSV has every filtered row (not just the ones shown), UTF-8 for Excel. It is an unencrypted file on your computer, so treat it like a bank statement."));
  draw();
  return root;
}
