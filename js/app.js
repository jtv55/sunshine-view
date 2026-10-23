"use strict";
/* App shell: page router, unlock screen, header controls. */

const PAGES = { overview, cashflow, spending, savings: insights, accounts, meta };
const ALIASES = { weekly: "overview", trends: "cashflow", insights: "savings" }; // old bookmarks keep working

function route() {
  const key = location.hash.slice(1), name = PAGES[key] ? key : ALIASES[key] || "overview";
  $$("nav a").forEach(a => a.dataset.p === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  disposeAll(); $("#page").replaceChildren();
  if (!D.txs.length) { $("#page").append(h("div", { class: "card" }, "No categorized transactions yet. Run the update workflow once so vendors and categories are added to your data.")); return; }
  PAGES[name](); window.scrollTo(0, 0);
}

$("#f").addEventListener("submit", async e => {
  e.preventDefault(); $("#err").textContent = "Decrypting...";
  let store;
  try { const blob = await fetch("store.enc", { cache: "no-store" }).then(r => r.json()); store = await decrypt(blob, $("#pw").value); }
  catch { $("#err").textContent = "Wrong passphrase, or no data published yet."; return; }
  try { D.lumps = localStorage.getItem("lumps") === "1"; } catch { D.lumps = false; }
  $("#lumps").checked = D.lumps;
  buildModel(store); $("#pw").value = ""; $("#lock").hidden = true; $("#app").hidden = false;
  const build = (document.querySelector('meta[name="build"]') || {}).content || "dev";
  $("#asof").textContent = `Updated ${D.updated} · build ${build}`; $("#asof").title = "The build is the version of the dashboard code this tab is running. If it doesn't match the latest, hard-refresh.";
  route();
});
window.addEventListener("hashchange", route);
$("#lumps").addEventListener("change", e => { D.lumps = e.target.checked; try { localStorage.setItem("lumps", D.lumps ? "1" : "0"); } catch { /* private mode */ } buildModel(D.store); route(); });
$("#lockbtn").addEventListener("click", () => location.reload());
$("#theme").addEventListener("click", () => { const r = document.documentElement, cur = r.dataset.theme; r.dataset.theme = cur === "dark" ? "light" : cur === "light" ? "" : "dark"; if (!r.dataset.theme) r.removeAttribute("data-theme"); resetTheme(); route(); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { resetTheme(); if (!$("#app").hidden) route(); });
