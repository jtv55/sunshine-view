"use strict";
/* App shell: page router, unlock screen, header controls. */

/* ================= router + unlock ================= */
const PAGES = { weekly, trends, insights };
function route() {
  const name = PAGES[location.hash.slice(1)] ? location.hash.slice(1) : "weekly";
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
  buildModel(store); $("#pw").value = ""; $("#lock").hidden = true; $("#app").hidden = false; $("#asof").textContent = "Updated " + D.updated; route();
});
window.addEventListener("hashchange", route);
$("#lumps").addEventListener("change", e => { D.lumps = e.target.checked; try { localStorage.setItem("lumps", D.lumps ? "1" : "0"); } catch { /* private mode */ } buildModel(D.store); route(); });
$("#lockbtn").addEventListener("click", () => location.reload());
$("#theme").addEventListener("click", () => { const r = document.documentElement, cur = r.dataset.theme; r.dataset.theme = cur === "dark" ? "light" : cur === "light" ? "" : "dark"; if (!r.dataset.theme) r.removeAttribute("data-theme"); resetTheme(); route(); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { resetTheme(); if (!$("#app").hidden) route(); });
