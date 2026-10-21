"use strict";
/* Credit-card reconciliation: implied opening balance + charges - refunds - paydowns = owed now. */

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
