"use strict";
/* Healthcare: open-enrollment plan comparison and an HSA contribution recommendation. Plan terms come from config/benefits.json
   (carried inside the encrypted data as meta.benefits); everything you type here stays in this browser (localStorage). Estimates, not advice. */

const HC_KEY = "hc-inputs";
const HC_SERVICES = ["pcp", "specialist", "urgent", "er", "imaging", "lab", "therapy", "surgery", "admission"];
const HC_LABEL = { pcp: "Primary care visits", specialist: "Specialist visits", urgent: "Urgent care", er: "ER visits", imaging: "MRI / CT / PET", lab: "Lab and diagnostics", therapy: "Therapy visits", surgery: "Outpatient surgeries", admission: "Hospital stays" };

/* What you pay out of pocket in one scenario under one plan. Gold: copays only. Qualified plan: you pay the full allowed price (medical and
   prescriptions share one deductible) until the deductible is met, then copays; both stop at the out-of-pocket maximum. */
function hcMemberCost(plan, tier, sc, cfg) {
  const price = cfg.allowed_price, n = sc.n || {}, rx = sc.rx || {};
  const medAllowed = HC_SERVICES.reduce((s, k) => s + (n[k] || 0) * (price[k] || 0), 0);
  const rxAllowed = (rx.generic || 0) * price.generic + (rx.brand || 0) * price.brand;
  const copays = HC_SERVICES.reduce((s, k) => s + (n[k] || 0) * (plan.copay[k] || 0), 0) + (rx.generic || 0) * plan.rx.generic + (rx.brand || 0) * plan.rx.brand;
  const allowed = medAllowed + rxAllowed, ded = plan.deductible[tier], cap = plan.oop[tier];
  let cost;
  if (!plan.copays_after_deductible || ded === 0) cost = copays;
  else cost = allowed <= ded ? allowed : ded + copays * (allowed - ded) / allowed;
  return { allowed, cost: Math.min(cost, cap), capped: cost >= cap };
}

/* Employer seed is spent first and is free to you; employee HSA dollars used on the bill are pre-tax, so they save your tax rate. */
function hcNetOutOfPocket(oop, seed, contrib, rate) {
  const fromSeed = Math.min(oop, seed), fromYou = Math.min(Math.max(oop - seed, 0), contrib);
  return { net: oop - fromSeed - rate * fromYou, fromSeed, fromYou, taxSaved: rate * fromYou };
}

/* Pay periods per year from how often income lands (biggest payer, median gap in days). */
const HC_EMPLOYER = /payroll/i; // paychecks are ACH credits labelled PAYROLL (the HCR credits are separate, irregular payments)
function hcPaychecks() {
  const inc = D.income.filter(t => t.amt > 200), hcr = inc.filter(t => HC_EMPLOYER.test(t.v) || HC_EMPLOYER.test(t.desc));
  return hcr.length >= 4 ? { list: hcr, from: "payroll" } : { list: inc, from: null };
}
function hcInferPays() {
  const pc = hcPaychecks(), by = groupBy(pc.list, t => t.v), top = [...by].sort((a, b) => b[1].length - a[1].length)[0];
  if (!top || top[1].length < 4) return null;
  const days = [...new Set(top[1].map(t => t.day))].sort((a, b) => a - b), gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b), med = gaps[Math.floor(gaps.length / 2)];
  return med <= 9 ? 52 : med <= 17 ? 26 : med <= 20 ? 24 : 12;
}

/* Kept per month (income minus spending) over the last complete months, to judge what a contribution can safely be. */
function hcPayNet() {
  const pc = hcPaychecks().list, by = [...groupBy(pc, t => t.v)].sort((a, b) => b[1].length - a[1].length)[0];
  if (!by || by[1].length < 4) return null;
  const a = by[1].map(t => t.amt).sort((x, y) => x - y); return a[Math.floor(a.length / 2)];
}
function hcMonthlySurplus() {
  const ms = completeMonths(3);
  if (!ms.length) return null;
  const lo = monthStartDay(ms[0]), hi = monthStartDay(monthShift(ms[ms.length - 1], 1)) - 1;
  return (sum(inWin(D.income, lo, hi), t => t.amt) - spendOf(inWin(D.spend, lo, hi))) / ms.length;
}

function hcState(cfg) {
  const def = { tier: "family", pays: hcInferPays() || 26, premGold: 0, premQ: 0, fed: 22, state: 3.07, fica: 7.65, age55: false, bonus: 0, ...(cfg.defaults || {}) };
  try { return { ...def, ...(JSON.parse(localStorage.getItem(HC_KEY) || "{}")) }; } catch { return def; }
}

function healthcare() {
  const page = $("#page"), cfg = D.meta.benefits;
  page.replaceChildren(pageHead("Healthcare " + (cfg && cfg.year || ""), "Open-enrollment plan comparison and an HSA contribution recommendation."));
  if (!cfg || !cfg.plans) { page.append(h("div", { class: "card" }, "No plan data yet. Add config/benefits.json and run the update workflow once.")); return; }
  const S = hcState(cfg), save = () => { try { localStorage.setItem(HC_KEY, JSON.stringify(S)); } catch { /* private mode */ } };
  const results = h("div");
  const num = (key, label, opts = {}) => {
    const el = h("input", { type: "number", min: "0", step: opts.step || "1", value: String(S[key]), "aria-label": label, style: "width:96px" });
    el.addEventListener("change", () => { S[key] = Math.max(0, Number(el.value) || 0); save(); refresh(); });
    return h("label", { class: "muted", style: "display:flex;flex-direction:column;gap:4px;font-size:12px" }, label, el);
  };
  const tierSel = h("select", { "aria-label": "Coverage" }, h("option", { value: "family" }, "Family (you and your wife)"), h("option", { value: "self" }, "Just me"));
  tierSel.value = S.tier; tierSel.addEventListener("change", () => { S.tier = tierSel.value; save(); refresh(); });
  const age = h("input", { type: "checkbox" }); age.checked = !!S.age55; age.addEventListener("change", () => { S.age55 = age.checked; save(); refresh(); });
  const inferred = hcInferPays();
  page.append(h("div", { class: "card" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Your inputs"), h("div", { class: "sub" }, (S.premPaid ? "Your employer pays the premiums." : "Premiums are per paycheck, from the enrollment portal.") + " Saved in this browser only." + (inferred ? ` Pay periods are inferred from your ${hcPaychecks().from || "income"} deposits (${inferred} per year).` : "")))),
    h("div", { class: "ledger-controls" }, h("label", { class: "muted", style: "display:flex;flex-direction:column;gap:4px;font-size:12px" }, "Coverage", tierSel), num("pays", "Paychecks per year"), ...(S.premPaid ? [] : [num("premGold", "Gold $0 premium / paycheck", { step: "0.01" }), num("premQ", "HSA plan premium / paycheck", { step: "0.01" })]),
      num("fed", "Federal tax bracket %"), num("state", "State tax %", { step: "0.01" }), num("bonus", "Annual bonus % of salary"), num("fica", "Payroll tax saved %", { step: "0.01" }), h("label", { class: "muted", style: "display:flex;gap:6px;align-items:center;font-size:12px" }, age, "Age 55+ (catch-up)"))));
  page.append(results);

  function refresh() {
    disposeAll(); results.replaceChildren(build());
  }
  function build() {
    const wrap = h("div"), tier = S.tier, G = cfg.plans.gold, Q = cfg.plans.qhdhp, seed = cfg.hsa.employer_seed[tier], pays = Math.max(1, S.pays), rate = (S.fed + S.state + S.fica) / 100;
    const limit = cfg.hsa.irs_limit[tier] + (S.age55 ? cfg.hsa.catch_up_55 : 0), maxEmp = limit - seed, worst = Q.oop[tier] - seed;
    const premDiffYr = (S.premGold - S.premQ) * pays, havePrem = !!S.premPaid || S.premGold > 0 || S.premQ > 0;
    const rows = cfg.scenarios.map(sc => { const g = hcMemberCost(G, tier, sc, cfg), q = hcMemberCost(Q, tier, sc, cfg); return { sc, g, q }; });
    const typical = rows.find(r => r.sc.name === "Typical") || rows[1], deductGap = Math.max(0, Q.deductible[tier] - seed), typicalGap = Math.max(0, typical.q.cost - seed);

    /* recommendation: cover a typical year at minimum, fund the worst case if the budget allows, never past the IRS limit; judged against what you actually keep each month */
    const surplus = hcMonthlySurplus(), keepYr = surplus == null ? null : surplus * 12;
    const roundPay = v => Math.round(v / 5) * 5, perPay = yr => yr / pays;
    const floorYr = Math.min(maxEmp, Math.max(deductGap, typicalGap));
    const payNet = hcPayNet(), takeHomeCap = payNet ? 0.1 * payNet * pays / (1 - rate) : null; // a contribution is affordable if its take-home hit is under 10% of a paycheck
    const affordYr = takeHomeCap != null ? takeHomeCap : keepYr == null ? maxEmp : Math.max(0, 0.5 * keepYr / (1 - rate));
    const recYr = Math.min(maxEmp, Math.max(floorYr, affordYr)), recPay = Math.min(maxEmp / pays, Math.max(roundPay(perPay(recYr)), 0)), recAnnual = recPay * pays;
    const fullMax = recAnnual >= maxEmp - pays * 2.5;
    const hit = recPay * (1 - rate), taxYr = recAnnual * rate;

    wrap.append(h("div", { class: "kpis", style: "margin-top:18px" },
      kpi("Recommended HSA contribution", fmt2(recPay) + " / paycheck", `${fmt0(recAnnual)} a year${fullMax ? " (the most the plan allows after your employer's seed)" : ""}`, true),
      kpi("Your take-home drops by", fmt2(hit) + " / paycheck", `pre-tax: the other ${fmt2(recPay - hit)} is tax you would have paid`),
      kpi("Taxes saved", fmt0(taxYr) + " / yr", `at ${Math.round(rate * 100)}% combined (federal, state, payroll)`),
      kpi("Employer seed", fmt0(seed), `${Math.round(seed / Q.deductible[tier] * 100)}% of the ${fmt0(Q.deductible[tier])} deductible, paid up front`),
      kpi("Most you can add", fmt0(maxEmp) + " / yr", `${fmt2(maxEmp / pays)} per paycheck; limit ${fmt0(limit)} minus the seed`)));

    const why = [`<b>Floor ${fmt2(floorYr / pays)}/paycheck (${fmt0(floorYr)}/yr).</b> The employer seed of ${fmt0(seed)} already covers ${seed >= Q.deductible[tier] ? "the whole deductible" : Math.round(seed / Q.deductible[tier] * 100) + "% of the deductible"}; this tops up to a typical year's ${fmt0(typical.q.cost)} bill.`,
      `<b>Ceiling ${fmt2(maxEmp / pays)}/paycheck (${fmt0(maxEmp)}/yr).</b> Seed plus this equals ${fmt0(limit)}. The worst case on this plan is ${fmt0(Q.oop[tier])} out of pocket, so ${fmt0(worst)} from you plus the seed covers even that, and unspent money stays yours, invested if you like, tax-free for medical costs.`,
      payNet ? `<b>Your budget:</b> a typical paycheck is ${fmt0(payNet)}, so the ${fmt2(hit)} take-home drop is ${(hit / payNet * 100).toFixed(1)}% of it.` + (surplus != null && surplus < 0 ? ` Months with big one-off spending have left you ${fmt0(-surplus)} a month short lately, so keep cash for those before adding more than you need.` : surplus != null ? ` You've kept about ${fmt0(surplus)} a month lately.` : "") : "Not enough history to judge affordability from your accounts."];
    if (recAnnual < maxEmp - 1) why.push(`<b>Room to grow:</b> if your emergency cash covers 3 to 6 months of bills, raising it to ${fmt2(maxEmp / pays)}/paycheck is the best-value place for extra savings: pre-tax going in, tax-free growing, tax-free for medical costs.`);
    wrap.append(h("div", { class: "card", style: "margin-top:18px" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "How the recommendation is built"))), h("ul", { class: "attn" }, why.map(x => h("li", {}, h("span", { html: x }))))));

    /* scenario comparison */
    const g = h("div", { class: "grid", style: "margin-top:18px" }); wrap.append(g);
    const trs = rows.map(r => {
      const qn = hcNetOutOfPocket(r.q.cost, seed, recAnnual, rate), need = (qn.net - r.g.cost + 0) / pays;
      return { name: r.sc.name, note: r.sc.note, gold: r.g.cost, q: r.q.cost, qNet: qn.net, diff: qn.net - r.g.cost, need };
    });
    const premLine = S.premPaid ? "Your employer pays the premiums on both plans, so only what you pay for care and the HSA matter." : havePrem ? `Premiums add ${fmt0(S.premGold * pays)} (Gold) vs ${fmt0(S.premQ * pays)} (HSA plan) a year, so the HSA plan is ${premDiffYr >= 0 ? fmt0(premDiffYr) + " cheaper" : fmt0(-premDiffYr) + " more expensive"} before any care.` : "Enter both premiums above to include them. Until then, the last column shows how much lower the Gold premium would have to be, per paycheck, for Gold to come out ahead.";
    const tableCols = ["Year of care", "Gold $0 you pay", "HSA plan you pay", "HSA plan after seed + tax", "HSA plan vs Gold", havePrem ? "Total with premiums" : "Gold wins only if its premium is"];
    const tbl = tableEl(tableCols, trs.map(r => [`${r.name}: ${r.note}`, fmt0(r.gold), fmt0(r.q), fmt0(r.qNet), (r.diff <= 0 ? "HSA plan saves " : "HSA plan costs ") + fmt0(Math.abs(r.diff)), havePrem ? `${r.diff - premDiffYr <= 0 ? "HSA plan" : "Gold"} ahead by ${fmt0(Math.abs(r.diff - premDiffYr))}` : (r.need >= 0 ? "Gold is already cheaper" : fmt2(-r.need) + " cheaper than the HSA plan's")]), [1, 2, 3, 4, 5]);
    g.append(h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "What each plan costs you in four kinds of year"), h("div", { class: "sub" }, "Out of pocket for care and prescriptions, using the plan grids and typical prices. " + premLine))), h("div", { class: "tablev", style: "max-height:none" }, tbl),
      h("div", { class: "note" }, "'After seed + tax' subtracts the employer's HSA deposit and the tax you save paying bills with pre-tax HSA dollars.")));

    /* every option side by side, for the whole household */
    const hhd = cfg.household, who = hhd ? `you, your wife and ${hhd.kids} kid${hhd.kids === 1 ? "" : "s"}` : "your household";
    const fsaE = Math.min(cfg.fsa.health, Math.ceil(typical.g.cost / 100) * 100), premG = S.premGold * pays, premQ = S.premQ * pays;
    const fsaNet = oop => oop - rate * Math.min(oop, fsaE) + Math.max(0, fsaE - oop) * (1 - rate);
    const opts = [
      { name: "Gold $0, no tax account", cost: oop => premG + oop.g, worst: premG + G.oop[tier], upfront: 0, kept: 0, taxSaved: 0 },
      { name: `Gold $0 + health FSA (${fmt0(fsaE)})`, cost: oop => premG + fsaNet(oop.g), worst: premG + fsaNet(G.oop[tier]), upfront: 0, kept: 0, taxSaved: rate * fsaE },
      { name: `HSA plan + starter HSA (${fmt0(floorYr)}/yr)`, cost: oop => premQ + hcNetOutOfPocket(oop.q, seed, floorYr, rate).net, worst: premQ + hcNetOutOfPocket(Q.oop[tier], seed, floorYr, rate).net, upfront: 0, kept: seed + floorYr, taxSaved: rate * floorYr },
      { name: `HSA plan + recommended HSA (${fmt0(recAnnual)}/yr)`, cost: oop => premQ + hcNetOutOfPocket(oop.q, seed, recAnnual, rate).net, worst: premQ + hcNetOutOfPocket(Q.oop[tier], seed, recAnnual, rate).net, upfront: 0, kept: seed + recAnnual, taxSaved: rate * recAnnual }];
    const optRows = opts.map(o => [o.name, ...rows.map(r => fmt0(o.cost({ g: r.g.cost, q: r.q.cost }))), fmt0(o.worst), o.taxSaved ? fmt0(o.taxSaved) : "none"]);
    const best = rows.map((r, i) => opts.map(o => o.cost({ g: r.g.cost, q: r.q.cost })).reduce((bi, v, j, a) => v < a[bi] ? j : bi, 0));
    g.append(h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, `Your options, for ${who}`), h("div", { class: "sub" }, `Total cost for the year by option: premiums${havePrem ? "" : " (not entered yet, so $0)"} plus what you pay for care, after the employer's HSA deposit and tax savings. Lower is better.`))),
      h("div", { class: "tablev", style: "max-height:none" }, tableEl(["Option", ...rows.map(r => r.sc.name), "Worst case (out-of-pocket max)", "Tax saved by the account"], optRows, [1, 2, 3, 4, 5, 6])),
      h("div", { class: "note" }, "Cheapest in each kind of year: " + rows.map((r, i) => `${r.sc.name}: ${opts[best[i]].name}`).join("; ") + ". HSA money you don't spend stays yours and rolls over; FSA money you don't spend is forfeited.")));
    const trade = [
      ["Gold $0, no tax account", "Predictable copays, no deductible, nothing to manage. Lowest worst-case surprise on any single visit.", "Highest worst-case exposure (" + fmt0(G.oop[tier]) + " family limit), no employer deposit, no tax break on the bills you pay.", "You expect lots of care, hate bills that arrive before insurance helps, or can't spare cash for the deductible."],
      [`Gold $0 + health FSA`, "Pre-tax dollars for copays you will pay anyway, spendable on day one of the year.", `Use-it-or-lose-it: unspent money is forfeited. It blocks HSA contributions, so you can't switch half-way and still fund one.`, "You choose Gold and want a small tax break; elect only what you are sure to spend."],
      [`HSA plan + starter HSA`, `The employer deposit of ${fmt0(seed)} covers ${Math.round(seed / Q.deductible[tier] * 100)}% of the deductible, so you start with money in the account.`, `Costs more per visit until the ${fmt0(Q.deductible[tier])} deductible is met; less cushion if a major event comes early.`, "You want the plan's low out-of-pocket maximum without committing much of your paycheck."],
      [`HSA plan + recommended HSA`, `Lowest worst-case (${fmt0(Q.oop[tier])} family limit); every dollar is pre-tax going in, tax-free growing and tax-free for medical costs; unspent money is yours forever and can be invested.`, `Cash leaves each paycheck (about ${fmt2(hit)} of take-home); you must keep coverage free of other plans, and your wife can't use a general-purpose FSA.`, "You can absorb a bill early in the year and want the best tax treatment."],
      ["Add-on: dependent-care FSA", `Up to ${fmt0(cfg.fsa.dependent_care)} pre-tax for childcare, summer camp and after-school care for kids under 13. Works with any option above.`, "Forfeited if unspent; only for care that lets you and your wife work.", `Worth about ${fmt0(cfg.fsa.dependent_care * rate)} a year in taxes if you really spend it, so check what childcare costs ${hhd ? "your " + hhd.kids + " kids" : "you"} actually run.`]];
    g.append(h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Trade-offs at a glance"))),
      h("div", { class: "tablev", style: "max-height:none" }, tableEl(["Option", "What you gain", "What you give up", "Best if"], trade))));

    /* the verdict, shown first */
    const wins = best.filter(i => i >= 2).length, hsaBest = wins >= 3;
    const saveTyp = opts[0].cost({ g: typical.g.cost, q: typical.q.cost }) - opts[3].cost({ g: typical.g.cost, q: typical.q.cost });
    const verdict = h("div", { class: "card", style: "border-left:4px solid var(--accent, currentColor)" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "The short answer"))),
      h("p", { class: "lede", html: hsaBest
        ? `<b>Take the HSA plan with family coverage and put ${fmt2(recPay)} into the HSA every paycheck (${fmt0(recAnnual)} a year).</b> It costs you less than Gold in ${wins} of 4 kinds of year${saveTyp > 0 ? `, about ${fmt0(saveTyp)} less in a typical year` : ""}, caps your worst year at ${fmt0(opts[3].worst)} instead of ${fmt0(opts[0].worst)}, and saves about ${fmt0(taxYr)} a year in taxes. Your take-home drops about ${fmt2(hit)} per paycheck.`
        : `<b>On these numbers the Gold $0 plan comes out about even or ahead, so the HSA plan is not clearly better for you.</b> Check the table below before choosing.` }),
      h("div", { class: "muted" }, "The trade: you pay full price for care until the deductible is met (your employer's HSA deposit covers most of it), and about " + fmt2(hit) + " leaves each paycheck. Enroll by " + cfg.enrollment.closes + "."));
    wrap.prepend(verdict);

    /* curve: out of pocket as care gets more expensive */
    const copayShareG = typical.g.allowed ? typical.g.cost / typical.g.allowed : .2, copayShareQ = typical.q.allowed > Q.deductible[tier] ? (typical.q.cost - Q.deductible[tier]) / (typical.q.allowed - Q.deductible[tier]) : .1;
    const xs = []; for (let s = 0; s <= 30000; s += 1000) xs.push(s);
    const goldAt = s => Math.min(G.oop[tier], copayShareG * s), qAt = s => Math.max(0, Math.min(Q.oop[tier], s <= Q.deductible[tier] ? s : Q.deductible[tier] + copayShareQ * (s - Q.deductible[tier])) - seed);
    const c1 = card({ title: "Out of pocket as care gets more expensive", span: 12, height: 300,
      sub: `Total price of your care on the x-axis; what you pay on the y-axis (HSA plan shown after the ${fmt0(seed)} employer seed). Excludes premiums.`,
      table: () => ({ cols: ["Price of care", "Gold $0", "HSA plan after seed"], num: [0, 1, 2], rows: xs.map(s => [fmt0(s), fmt0(goldAt(s)), fmt0(qAt(s))]) }) });
    c1.draw(() => {
      const t = T(), line = (name, fn, color, w) => ({ name, type: "line", data: xs.map(fn), symbol: "none", lineStyle: { color, width: w }, itemStyle: { color }, endLabel: { show: true, formatter: p => `${name}\n${fmt0(p.value)}`, color: t.ink, fontSize: 11, distance: 8 } });
      return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 60, right: 110, top: 30, bottom: 36 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", valueFormatter: v => fmt0(v) },
        xAxis: { type: "category", data: xs.map(s => fmt0(s)), boundaryGap: false, name: "Price of care", nameLocation: "middle", nameGap: 26, ...axisStyle(), splitLine: { show: false } }, yAxis: moneyAxis(),
        series: [line("Gold $0", goldAt, t.ink, 2), line("HSA plan", qAt, t.accent, 3)] });
    });
    g.append(c1.root);

    /* what you actually pay today: spending filed under Health, by month, so the scenarios above can be checked against reality */
    const hs = D.spend.filter(t => t.c === "Health"), ms = completeMonths(12), hm = ms.map(m => [m, sum(hs.filter(t => t.m === m), t => t.s)]);
    if (ms.length) {
      const tot = sum(hm, x => x[1]), cnt = hs.filter(t => ms.includes(t.m)).length, top = [...groupBy(hs.filter(t => ms.includes(t.m)), t => t.v)].map(([v, ts]) => [v, sum(ts, t => t.s), ts.length]).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const c2 = card({ title: `What you actually spent on Health, last ${ms.length} month${ms.length === 1 ? "" : "s"}`, span: 7, height: 260,
        sub: `${fmt0(tot)} over ${cnt} charge${cnt === 1 ? "" : "s"}, about ${fmt0(tot / ms.length * 12)} a year at this pace. Compare with the four years above.`,
        table: () => ({ cols: ["Month", "Health spending"], num: [1], rows: hm.map(([m, v]) => [m, fmt0(v)]) }) });
      c2.draw(() => { const t = T(); return baseOpt({ grid: { left: 56, right: 10, top: 16, bottom: 28 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", valueFormatter: v => fmt0(v) },
        xAxis: { type: "category", data: hm.map(x => x[0]), ...axisStyle() }, yAxis: moneyAxis(), series: [{ type: "bar", data: hm.map(x => Math.round(x[1])), itemStyle: { color: t.accent } }] }); });
      g.append(c2.root, h("div", { class: "card span-5" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Where it went"), h("div", { class: "sub" }, "Biggest payees in the Health category"))),
        h("div", { class: "tablev", style: "max-height:none" }, tableEl(["Payee", "Charges", "Total"], top.map(([v, a, n]) => [v, String(n), fmt0(a)]), [1, 2]))));
    }

    /* eligibility and traps */
    const early = Math.min(6, pays), ssSpread = .062 * recAnnual * early / pays, ssFront = .062 * recAnnual;
    const bonusNote = S.bonus > 0 ? `<b>Your bonus.</b> A ${S.bonus}% bonus can push your pay past the Social Security wage base (about $185,000) early in the year, after which HSA dollars no longer save the 6.2% Social Security tax, so the payroll-tax saving above is an average. Putting the year's amount into the first ${early} paychecks instead of spreading it would save about ${fmt0(ssFront - ssSpread)} more, but each of those paychecks would drop about ${fmt0(recAnnual / early * (1 - rate))} instead of ${fmt0(hit)}.` : null;
    const warn = [bonusNote,
      `<b>Eligibility.</b> You can only put money in the HSA while covered by the HSA plan and nothing else that pays medical bills first. Nobody on the plan can also be covered by a general health FSA, a non-HSA plan, or Medicare.`,
      `<b>FSA.</b> A regular health FSA (${fmt0(cfg.fsa.health)} limit) blocks HSA contributions. A limited-purpose (dental and vision) FSA is allowed, and the dependent-care FSA (${fmt0(cfg.fsa.dependent_care)}) is unaffected.`,
      `<b>One limit for the household.</b> The ${fmt0(cfg.hsa.irs_limit.family)} family limit covers both of you together, including the employer seed. If your wife has her own HSA, split it.`,
      `<b>Pennsylvania.</b> Payroll HSA contributions are excluded from PA withholding (Dept. of Revenue ruling PIT-06-005), so the state rate above is included. The ruling is old; confirm on your tax return.`,
      `<b>Deadlines.</b> Enrollment closes ${cfg.enrollment.closes}; coverage starts ${cfg.enrollment.effective}. You can change the payroll amount during the year, so starting at the recommendation and adjusting is fine.`,
      `<b>Limits.</b> Estimates use typical prices and your plan grids. Real bills vary, and out-of-network care costs more. This is not tax or medical advice.`];
    g.append(h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Before you enroll"))), h("ul", { class: "attn" }, warn.filter(Boolean).map(x => h("li", {}, h("span", { html: x }))))));
    return wrap;
  }
  refresh();
}
