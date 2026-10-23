"use strict";
/* Rule picker: choose a category for a merchant and copy the rule that makes the pipeline file it that way.
   Two uses: merchants no rule recognizes (goes in the `rules` list) and merchants filed wrongly (goes in `overrides`,
   which beats every rule). Corrections live in the private config, never in the public site. */

const NOISE = new Set("pos purchase debit card ach web ppd ccd online pmt payment pay bill visa vis sq tst pp paypal checkcard recurring authorized auth on the spo sp deposit withdrawal".split(" "));
const rawTokens = desc => desc.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(w => w.length > 1 && !/\d/.test(w) && !NOISE.has(w));
const categoryChoices = () => [...new Set([...PREF.slice(0, 18), ...D.spend.map(t => t.c)])].filter(c => !["Uncategorized", "Transfers", "Income", "Investing", "Card spending (no detail)"].includes(c)).sort();

/* A pattern built from the bank's own wording that matches every one of this merchant's lines. Each variant gets the shortest
   whole-word pattern that doesn't also catch other merchants; variants are joined with "|" (e.g. amazon|amzn). */
const wordPattern = toks => "\\b" + toks.map(escRe).join(" ?") + "\\b";
function collateral(pattern, g) { // other merchants the pattern would also catch: the first matching rule wins, so this matters
  const rx = new RegExp(pattern, "i");
  return [...new Set(D.txs.filter(t => t.v !== g.v && rx.test(t.desc)).map(t => t.v))].slice(0, 4);
}
function patternFor(g) {
  const parts = [];
  for (const t of g.ts) {
    if (parts.some(p => new RegExp(p, "i").test(t.desc))) continue;
    const toks = rawTokens(t.desc);
    if (!toks.length) { parts.push(escRe(t.desc.toLowerCase().slice(0, 24))); continue; }
    const options = [1, 2, 3].map(k => wordPattern(toks.slice(0, k))), safe = options.find(p => !collateral(p, g).length);
    parts.push(safe || options[options.length - 1]);
    if (parts.length >= 4) break;
  }
  return parts.join("|");
}
const entryFor = (g, cat) => [patternFor(g), g.v, cat];
const ruleFor = (g, cat) => JSON.stringify(entryFor(g, cat));
/* What the Copy button puts on the clipboard: one line the workflow's add_rules box accepts. */
const payloadFor = (listKey, entries) => JSON.stringify({ [listKey]: entries });

function vendorGroups() { // every merchant with a real category, biggest first
  return [...groupBy(D.spend.filter(t => t.amt < 0 && !["Uncategorized", "Transfers", "Card spending (no detail)"].includes(t.c)), t => t.v)].map(([v, ts]) => ({ v, c: ts[0].c, ts: ts.sort((a, b) => b.day - a.day),
    n: ts.length, total: spendOf(ts), accts: [...new Set(ts.map(t => t.a))], channels: [...new Set(ts.map(channelOf))], ends: [...new Set(ts.map(cardEnding).filter(Boolean))] })).sort((a, b) => b.total - a.total);
}

function rulePickerCard({ title, sub, groups, showCurrent = false, search = false, listKey, empty }) {
  const cats = categoryChoices(), chosen = new Map(), root = h("div", { class: "card span-12" }), o = showCurrent ? 1 : 0;
  const copyAll = h("button", { class: "primary", disabled: "" }, "Copy chosen rules");
  const refresh = () => { const n = chosen.size; copyAll.textContent = n ? `Copy ${n} chosen rule${n === 1 ? "" : "s"}` : "Copy chosen rules"; copyAll.toggleAttribute("disabled", !n); };
  const repo = (D.meta.github || {}).repo, runUrl = repo ? `https://github.com/${repo}/actions/workflows/update.yml` : null;
  const next = h("div", { class: "nextstep", hidden: "" }, h("b", {}, "Copied. Nothing has changed yet. "), "To apply it: open Run workflow, paste into the ", h("b", {}, "add_rules"), " box, and press Run. About a minute later, refresh this page.",
    runUrl ? h("a", { class: "linkbtn", href: runUrl, target: "_blank", rel: "noopener" }, "Open Run workflow") : null);
  const showNext = () => { next.hidden = false; };
  copyAll.addEventListener("click", () => copyText(payloadFor(listKey, [...chosen.values()]), copyAll, showNext));
  const box = search ? h("input", { type: "search", placeholder: "Find a merchant", "aria-label": "Find a merchant", style: "width:200px" }) : null;
  root.append(h("div", { class: "hd" }, h("div", {}, h("h2", {}, title, h("span", { class: "count" }, String(groups.length))), h("div", { class: "sub" }, sub)), h("div", { class: "row-actions" }, box, copyAll)));
  if (!groups.length) { root.append(h("div", { class: "note ok" }, empty)); return root; }
  const head = ["Merchant", "What the bank prints", "Where it hit", "How it was paid", ...(showCurrent ? ["Filed as"] : []), "Charges", "Total", "Change to", ""];
  const table = tableEl(head, [], [4 + o, 5 + o]), body = table.tBodies[0];
  const rowFor = g => {
    const guess = !showCurrent && g.channels.includes("Online bill pay / ACH") ? "Bills & Utilities" : "", pat = patternFor(g), clash = collateral(pat, g);
    const sel = h("select", { "aria-label": `Category for ${g.v}` }, h("option", { value: "" }, "Choose..."), cats.map(c => h("option", { value: c, selected: c === guess ? "" : null }, c)));
    const btn = h("button", { class: "ghost", disabled: "" }, "Copy rule");
    const sync = () => { const cat = sel.value; btn.toggleAttribute("disabled", !cat || cat === g.c); if (cat && cat !== g.c) chosen.set(g.v, entryFor(g, cat)); else chosen.delete(g.v); refresh(); };
    sel.addEventListener("change", sync); btn.addEventListener("click", () => copyText(payloadFor(listKey, [entryFor(g, sel.value)]), btn, showNext));
    const lines = h("div", { class: "rawlines" }, g.ts.slice(0, 12).map(t => h("div", {}, `${isoOf(t.day)}  ${fmt2(t.s)}  ${acctShort(t.a)}  ${t.desc}`)),
      h("div", { class: clash.length ? "warnline" : "muted" }, `Pattern: ${pat}` + (clash.length ? `  (would also match: ${clash.join(", ")})` : "")));
    const ends = g.ends.length ? ` (card ending ${g.ends.join(", ")})` : "";
    const tr = h("tr", {}, h("td", {}, h("details", {}, h("summary", {}, g.v), lines)), h("td", { class: "muted", title: g.ts[0].desc }, g.ts[0].desc.slice(0, 54) + (g.ts[0].desc.length > 54 ? "..." : "")),
      h("td", {}, g.accts.map(acctShort).join(", ")), h("td", {}, g.channels.join(", ") + ends), ...(showCurrent ? [h("td", {}, catChip(g.c))] : []),
      h("td", { class: "n" }, String(g.n)), h("td", { class: "n" }, fmt0(g.total)), h("td", {}, sel), h("td", {}, btn));
    if (guess) queueMicrotask(sync);
    return tr;
  };
  const draw = () => { const q = box ? box.value.trim().toLowerCase() : ""; body.replaceChildren(...groups.filter(g => !q || g.v.toLowerCase().includes(q) || g.ts[0].desc.toLowerCase().includes(q)).slice(0, 25).map(rowFor)); };
  if (box) box.addEventListener("input", draw);
  draw();
  root.append(next, h("div", { class: "tablev", style: "max-height:560px" }, table),
    h("div", { class: "note" }, `Shows the 25 largest${search ? " matches" : ""} of ${groups.length}. Copy only puts the rule on your clipboard; it takes effect when you run the workflow with it pasted into add_rules. The whole history is then re-filed and the rule is saved to your private config.`));
  return root;
}

const unrecognizedCard = () => rulePickerCard({ title: "Unrecognized merchants", sub: "No rule knows these yet. Pick a category and copy the rule.", groups: unrecognizedGroups(), listKey: "rules", empty: "Every merchant in the data has a category." });
const recategorizeCard = () => rulePickerCard({ title: "Fix a category", sub: "Is a merchant filed under the wrong category? Choose the right one. Corrections are saved as overrides, which beat every other rule.",
  groups: vendorGroups(), showCurrent: true, search: true, listKey: "overrides", empty: "No categorized merchants yet." });
