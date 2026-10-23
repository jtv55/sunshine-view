"use strict";
/* Meta, part two: facts about the pipeline itself. SimpleFIN refreshes, GitHub activity, ledger growth, rule health.
   Source: store.meta (run log, GitHub, code, rules written by the nightly job) plus the ledger's own snapshots. */

const nowSec = () => Math.floor(Date.now() / 1000);
const stamp = sec => { const d = new Date(sec * 1000); return `${isoOf(Math.floor(sec / 86400))} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`; };
const runs = () => (D.meta.runs || []);

/* Days on which the pipeline really fetched from SimpleFIN: the ledger keeps a balance snapshot only for those. */
function fetchDays() {
  const days = new Map(Object.entries(D.store.snapshots || {}).filter(([, v]) => Object.keys(v).length).map(([d]) => [dayNum(d), 1]));
  const byDay = new Map(); runs().filter(r => r.mode === "fetch").forEach(r => { const d = Math.floor(r.t / 86400); byDay.set(d, (byDay.get(d) || 0) + 1); });
  byDay.forEach((n, d) => days.set(d, Math.max(n, days.get(d) || 0)));
  return days;
}

/* ---------- how fresh is each account? ---------- */
function freshnessCard() {
  const now = nowSec(), last = {}; D.txs.forEach(t => { last[t.a] = Math.max(last[t.a] ?? 0, t.day); });
  const rows = Object.entries(D.accts).filter(([, a]) => a.kind !== "dup").map(([id, a]) => {
    const age = a.balance_date ? now - a.balance_date : null, status = age == null ? ["info", "unknown"] : age < 36 * 3600 ? ["good", "fresh"] : age < 7 * 86400 ? ["watch", "stale"] : ["watch", "old"];
    return [acctShort(id), age == null ? "not reported" : ago(age), last[id] ? `${isoOf(last[id])} (${Math.max(0, D.asOf - last[id])} d ago)` : "none", h("span", { class: "pill " + (status[0] === "watch" ? "warn" : "") }, status[1])];
  });
  return listCard({ title: "Data freshness by account", sub: "When each bank last refreshed its balance (as reported through SimpleFIN) and the newest transaction we hold", span: 7,
    head: ["Account", "Bank refreshed", "Latest transaction", "Status"], empty: "No accounts.", rows });
}

/* ---------- SimpleFIN refresh history and stats ---------- */
function refreshCards() {
  const out = [], days = fetchDays(), hi = D.asOf, lo = hi - 59, series = Array.from({ length: 60 }, (_, i) => days.get(lo + i) || 0), done = series.filter(Boolean).length;
  const c = card({ title: "Data refreshes, last 60 days", sub: `${done} of the last 60 days brought in fresh data from SimpleFIN. Gaps are days the pipeline didn't fetch.`, span: 7, height: 240,
    table: () => ({ cols: ["Day", "Refreshes"], num: [1], rows: series.map((n, i) => [isoOf(lo + i), String(n)]) }) });
  c.draw(() => { const t = T();
    return baseOpt({ legend: { show: false }, grid: { left: 36, right: 8, top: 12, bottom: 30 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" }, formatter: ps => `<b>${isoOf(lo + ps[0].dataIndex)}</b><br>${ps[0].value ? ps[0].value + " refresh" + (ps[0].value > 1 ? "es" : "") : "no refresh"}` },
      xAxis: { type: "category", data: series.map((_, i) => dlabel(lo + i)), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 10, interval: 6 } },
      yAxis: { type: "value", minInterval: 1, ...axisStyle(), axisLine: { show: false }, axisLabel: { color: t.muted, fontSize: 11 } },
      series: [{ type: "bar", barWidth: "70%", data: series.map(v => ({ value: v, itemStyle: { color: v ? t.accent : t.grid, borderRadius: [2, 2, 0, 0] } })) }] }); });
  out.push(c.root);

  // stats table
  const fetchRuns = runs().filter(r => r.mode === "fetch"), today = Math.floor(nowSec() / 86400), todayReq = sum(fetchRuns.filter(r => Math.floor(r.t / 86400) === today), r => r.requests);
  const dayList = [...days.keys()].sort((a, b) => a - b).filter(d => d >= lo), gaps = dayList.slice(1).map((d, i) => d - dayList[i]), msgs = new Map();
  runs().forEach(r => (r.messages || []).forEach(m => msgs.set(m, (msgs.get(m) || 0) + 1)));
  const seenLag = (() => { const perDay = groupBy(D.txs.filter(t => t.seen), t => t.seen), lags = []; perDay.forEach(ts => { if (ts.length <= 60) ts.forEach(t => lags.push(dayNum(t.seen) - t.day)); }); return lags; })();
  const facts = [
    ["Fresh-data days (last 30)", `${[...days.keys()].filter(d => d > hi - 30).length} of 30`, "days with a real fetch"],
    ["Longest gap between refreshes", gaps.length ? `${Math.max(...gaps)} days` : "n/a", "within the last 60 days"],
    ["Fetch runs logged", String(fetchRuns.length), runs().length ? `${runs().length - fetchRuns.length} re-derive-only runs also logged` : "the log starts with the next update"],
    ["Average fetch time", fetchRuns.length ? `${(sum(fetchRuns, r => r.seconds) / fetchRuns.length).toFixed(1)} s` : "n/a", "whole run, including re-deriving"],
    ["Requests per fetch", fetchRuns.length ? (sum(fetchRuns, r => r.requests) / fetchRuns.length).toFixed(1) : "n/a", `${sum(fetchRuns, r => r.retries)} retries so far`],
    ["Requests today (UTC)", `${todayReq} of about 24`, "SimpleFIN's daily allowance"],
    ["Median posting lag", seenLag.length >= 10 ? `${median(seenLag)} days` : "collecting", seenLag.length >= 10 ? "posted date to first appearing here" : "needs a few nightly runs"],
    ["SimpleFIN messages", String(msgs.size), msgs.size ? [...msgs].sort((a, b) => b[1] - a[1])[0][0].slice(0, 70) : "none logged"]];
  out.push(listCard({ title: "SimpleFIN refresh stats", span: 5, head: ["Measure", "Value", "Note"], rows: facts.map(f => [f[0], h("b", {}, f[1]), h("span", { class: "muted" }, f[2])]), num: [] }));

  const recent = runs().slice(-15).reverse();
  out.push(listCard({ title: "Recent runs", sub: "Newest first. Failed runs never write a row; they show in the GitHub section below.", span: 12, head: ["When", "Kind", "New transactions", "Total", "Seconds", "Requests", "Retries", "Messages"], num: [2, 3, 4, 5, 6, 7],
    empty: "The run log starts with the next update.", rows: recent.map(r => [stamp(r.t), r.mode === "fetch" ? "Fetch from SimpleFIN" : "Re-derive only", String(r.new), String(r.tx), String(r.seconds), String(r.requests), String(r.retries), r.messages && r.messages.length ? h("span", { title: r.messages.join(" | ") }, String(r.messages.length)) : "0"]) }));
  return out;
}

/* ---------- GitHub activity ---------- */
function githubCards() {
  const gh = D.meta.github, out = [];
  if (!gh) return [h("div", { class: "card span-12" }, h("h2", {}, "GitHub activity"), h("div", { class: "note" }, "Appears after the next workflow run, which reads this repository's history through the GitHub API."))];
  const now = nowSec(), d30 = now - 30 * 86400, commits = gh.commits || [], wf = gh.runs || [], wf30 = wf.filter(r => r[0] >= d30), done30 = wf30.filter(r => r[2] !== "in_progress" && r[2] !== "queued");
  const ok30 = done30.filter(r => r[2] === "success"), sched = done30.filter(r => r[1] === "schedule"), schedOk = sched.filter(r => r[2] === "success"), secs = done30.map(r => r[3]).filter(Boolean);
  const kp = h("div", { class: "kpis" },
    kpi("Commits (30 days)", String(commits.filter(c => c[0] >= d30).length), `${commits.filter(c => c[0] >= d30 && c[1]).length} automatic data updates`),
    kpi("Workflow runs (30 days)", String(wf30.length), `${wf30.filter(r => r[1] === "schedule").length} nightly, ${wf30.filter(r => r[1] !== "schedule").length} manual`),
    kpi("Success rate", done30.length ? Math.round(ok30.length / done30.length * 100) + "%" : "n/a", `${done30.length - ok30.length} failed in 30 days`),
    kpi("Nightly runs that passed", sched.length ? `${schedOk.length} of ${sched.length}` : "none yet", "scheduled runs only"),
    kpi("Typical run time", secs.length ? `${Math.round(median(secs))} s` : "n/a", "median, finished runs"),
    kpi("Site publishes (30 days)", String((gh.publishes || []).filter(t => t >= d30).length), "updates to the public page repo"));
  out.push(h("div", { class: "span-12" }, kp));

  // commits per week, people vs the data bot
  const wk = []; for (let w = weekStart(D.asOf) - 11 * 7; w <= weekStart(D.asOf); w += 7) wk.push(w);
  const per = w => commits.filter(c => weekStart(Math.floor(c[0] / 86400)) === w), human = wk.map(w => per(w).filter(c => !c[1]).length), bot = wk.map(w => per(w).filter(c => c[1]).length);
  const c1 = card({ title: "Commits per week", sub: "Changes you (and Claude) made vs the nightly bot's data updates", span: 6, height: 260, table: () => ({ cols: ["Week of", "Changes", "Bot data updates"], num: [1, 2], rows: wk.map((w, i) => [dlabel(w), String(human[i]), String(bot[i])]) }) });
  c1.draw(() => { const t = T(), s = (name, data, color) => ({ name, type: "bar", stack: "c", barWidth: "58%", data, itemStyle: { color, borderColor: t.surface, borderWidth: 1 } });
    return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 36, right: 8, top: 30, bottom: 28 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: wk.map(dlabel), ...axisStyle(), splitLine: { show: false } }, yAxis: { type: "value", minInterval: 1, ...axisStyle(), axisLine: { show: false } },
      series: [s("Changes", human, t.ink), s("Bot data updates", bot, mix(t.ink, t.surface, .6))] }); });
  out.push(c1.root);

  // workflow runs per day by result
  const d0 = D.asOf - 29, dayRuns = Array.from({ length: 30 }, (_, i) => wf.filter(r => Math.floor(r[0] / 86400) === d0 + i));
  const kinds = [["Succeeded", r => r[2] === "success", T().ink], ["Failed", r => r[2] === "failure", css("--s8")], ["Other", r => !["success", "failure"].includes(r[2]), css("--muted")]];
  const c2 = card({ title: "Workflow runs per day", sub: "Each nightly job and manual run for the last 30 days, by result", span: 6, height: 260,
    table: () => ({ cols: ["Day", "Succeeded", "Failed", "Other"], num: [1, 2, 3], rows: dayRuns.map((rs, i) => [isoOf(d0 + i), ...kinds.map(([, f]) => String(rs.filter(f).length))]) }) });
  c2.draw(() => { const t = T();
    return baseOpt({ legend: { ...baseOpt().legend, right: 0, left: "auto" }, grid: { left: 36, right: 8, top: 30, bottom: 28 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: dayRuns.map((_, i) => dlabel(d0 + i)), ...axisStyle(), splitLine: { show: false }, axisLabel: { color: t.muted, fontSize: 10, interval: 6 } }, yAxis: { type: "value", minInterval: 1, ...axisStyle(), axisLine: { show: false } },
      series: kinds.map(([name, f, color]) => ({ name, type: "bar", stack: "r", barWidth: "62%", data: dayRuns.map(rs => rs.filter(f).length), itemStyle: { color: name === "Succeeded" ? t.ink : color, borderColor: t.surface, borderWidth: 1 } })) }); });
  out.push(c2.root);

  // codebase
  const code = D.meta.code, firstCommit = commits.length ? Math.min(...commits.map(c => c[0])) : null, lastHuman = commits.filter(c => !c[1]).map(c => c[0]).sort((a, b) => b - a)[0];
  if (code) {
    const langs = Object.entries(code.lines).sort((a, b) => b[1] - a[1]), total = sum(langs, l => l[1]);
    out.push(listCard({ title: "The codebase", sub: `${code.files} files, ${total.toLocaleString()} lines, ${code.tests} unit tests, ${code.rules} merchant rules`, span: 5, head: ["Language", "Lines", "Share"], num: [1, 2],
      rows: [...langs.map(([l, n]) => [l, n.toLocaleString(), Math.round(n / total * 100) + "%"]), ["Project age", firstCommit ? `${Math.max(1, Math.round((now - firstCommit) / 86400))} days` : "n/a", firstCommit ? `since ${isoOf(Math.floor(firstCommit / 86400))}` : ""], ["Last change by you", lastHuman ? ago(now - lastHuman) : "n/a", ""]] }));
  }
  if (gh.errors) out.push(h("div", { class: "note span-12" }, `Some GitHub sections could not be read: ${esc(gh.errors.join(", "))}.`));
  return out;
}

/* ---------- ledger growth and rule health ---------- */
function ledgerCards() {
  const out = [], lo = D.asOf - 83, wk = Array.from({ length: 12 }, (_, i) => weekStart(lo) + i * 7);
  const counts = wk.map(w => D.txs.filter(t => t.day >= w && t.day < w + 7).length);
  const c1 = card({ title: "Transactions per week", sub: `${D.txs.length.toLocaleString()} transactions held across ${Object.values(D.accts).filter(a => a.kind !== "dup").length} accounts, ${dlabel(D.firstDay)} to ${dlabel(D.asOf)}`, span: 6, height: 240,
    table: () => ({ cols: ["Week of", "Transactions"], num: [1], rows: wk.map((w, i) => [dlabel(w), String(counts[i])]) }) });
  c1.draw(() => { const t = T();
    return baseOpt({ legend: { show: false }, grid: { left: 40, right: 8, top: 12, bottom: 28 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "category", data: wk.map(dlabel), ...axisStyle(), splitLine: { show: false } }, yAxis: { type: "value", ...axisStyle(), axisLine: { show: false } },
      series: [{ type: "bar", barWidth: "58%", data: counts, itemStyle: { color: t.accent, borderRadius: [3, 3, 0, 0] } }] }); });
  out.push(c1.root);

  const cov = runs().filter(r => r.coverage != null);
  const c2 = card({ title: "Categorized share over time", sub: cov.length >= 3 ? "Share of spending (by dollars) with a real category, at each logged run" : "Needs a few logged runs. It starts recording with the next update.", span: 6, height: 240,
    table: () => ({ cols: ["Run", "Categorized"], num: [1], rows: cov.map(r => [stamp(r.t), (r.coverage * 100).toFixed(1) + "%"]) }) });
  if (cov.length >= 3) c2.draw(() => { const t = T();
    return baseOpt({ legend: { show: false }, grid: { left: 44, right: 12, top: 12, bottom: 28 }, tooltip: { ...baseOpt().tooltip, trigger: "axis", valueFormatter: v => v.toFixed(1) + "%" },
      xAxis: { type: "category", data: cov.map(r => dlabel(Math.floor(r.t / 86400))), ...axisStyle(), splitLine: { show: false } }, yAxis: { type: "value", min: Math.max(0, Math.floor(Math.min(...cov.map(r => r.coverage * 100)) - 2)), max: 100, ...axisStyle(), axisLine: { show: false }, axisLabel: { color: t.muted, formatter: v => v + "%" } },
      series: [{ type: "line", data: cov.map(r => +(r.coverage * 100).toFixed(1)), symbol: "circle", symbolSize: 6, lineStyle: { color: t.accent, width: 2.5 }, itemStyle: { color: t.accent, borderColor: t.surface, borderWidth: 2 } }] }); });
  out.push(cov.length >= 3 ? c2.root : h("div", { class: "card span-6" }, h("h2", {}, "Categorized share over time"), h("div", { class: "note" }, "Needs a few logged runs. It starts recording with the next update.")));

  // how the fine-grained categories roll up into the 8 chart colors
  const sp = D.spend.filter(t => t.day >= D.asOf - 89), tot = spendOf(sp) || 1;
  const roll = GROUPS.map(gp => ({ gp, v: spendOf(sp.filter(t => t.g === gp)), members: gp === "Other" ? OTHER_CATS : (GROUP_MEMBERS[gp] || [gp]) })), otherShare = roll[roll.length - 1].v / tot;
  out.push(listCard({ title: "How categories roll up", span: 12, sub: `Gray Other is ${(otherShare * 100).toFixed(1)}% of the last 90 days of spending. Edit "groups" in config/vendors.json to re-group; the fine-grained categories stay intact underneath.`,
    head: ["Color group", "Includes", "Spent (90 days)", "Share"], num: [2, 3], empty: "No spending yet.",
    rows: roll.map(r => [h("span", { class: "chip" }, h("i", { class: "dot", style: `background:${catColor(r.gp)}` }), r.gp), r.members.length ? r.members.join(", ") : "nothing", fmt0(r.v), (r.v / tot * 100).toFixed(1) + "%"]) }));

  const rep = D.meta.rules;
  if (rep) out.push(h("div", { class: "card span-12" }, h("div", { class: "hd" }, h("div", {}, h("h2", {}, "Rule health"), h("div", { class: "sub" }, `${rep.total} merchant rules; ${rep.unused_n} never matched anything in your data (harmless, but candidates to prune)`))),
    h("div", { class: "grid" }, h("div", { class: "span-5" }, tableEl(["Most-used rules", "Matches"], rep.top.map(([n, c]) => [n, String(c)]), [1])),
      h("div", { class: "span-7" }, h("details", {}, h("summary", {}, `Unused rules (${rep.unused_n})`), h("div", { class: "rawlines" }, rep.unused.map(u => h("div", {}, u))))))));
  return out;
}
