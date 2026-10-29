/* commands.js - command browser (list + detail) --------------------------- */

import { renderChrome, esc, el, param, diffBadge, withCopy, toast } from "./app.js";
import { state, save, viewCommand, toggleFavorite } from "./store.js";
import { loadCommands, searchCommands } from "./data.js";

renderChrome("commands.html");

const all = await loadCommands();
const selected = param("cmd");

if (selected) renderDetail(selected);
else renderList();

/* ======================= LIST VIEW ======================= */

function renderList() {
  const grid = document.getElementById("cmd-grid");
  const search = document.getElementById("cmd-search");
  const catSel = document.getElementById("cmd-cat");
  const diffSel = document.getElementById("cmd-diff");
  const count = document.getElementById("cmd-count");

  for (const c of [...new Set(all.map((x) => x.category))].sort()) {
    catSel.append(el(`<option value="${esc(c)}">${esc(c)}</option>`));
  }

  function apply() {
    const results = searchCommands(all, search.value, { category: catSel.value, difficulty: diffSel.value });
    grid.innerHTML = "";
    count.textContent = `${results.length} of ${all.length} commands`;
    for (const c of results) {
      const fav = state.favorites.includes(c.name) ? " ⭐" : "";
      grid.append(el(`<a class="card cmd-card" href="commands.html?cmd=${encodeURIComponent(c.name)}">
        <span class="name">${esc(c.name)}${fav}</span>
        <p>${esc(c.description)}</p>
        <div class="cmd-meta"><span class="badge">${esc(c.category)}</span>${diffBadge(c.difficulty)}</div>
      </a>`));
    }
    if (!results.length) grid.append(el(`<p class="muted">Nothing matches those filters. Clear one and try again.</p>`));
  }

  search.addEventListener("input", apply);
  catSel.addEventListener("change", apply);
  diffSel.addEventListener("change", apply);
  // Deep-link filters, e.g. commands.html?cat=Networking
  const cat = param("cat");
  if (cat) catSel.value = cat;
  apply();
}

/* ======================= DETAIL VIEW ======================= */

function renderDetail(name) {
  const c = all.find((x) => x.name === name);
  document.getElementById("cmd-list-view").hidden = true;
  const view = document.getElementById("cmd-detail-view");
  view.hidden = false;
  const root = document.getElementById("cmd-detail");

  if (!c) {
    root.innerHTML = `<h1>Command not found</h1>
      <p class="muted">There's no page for <code>${esc(name)}</code> yet.</p>
      <a class="btn" href="commands.html">← Back to all commands</a>`;
    return;
  }

  viewCommand(c.name);
  document.title = `${c.name} - Linux Command Trainer`;
  const isFav = () => state.favorites.includes(c.name);

  root.innerHTML = `
    <a href="commands.html" class="muted" style="font-size:.9rem">← All commands</a>
    <div class="section-head" style="margin-top:10px">
      <div>
        <h1 class="mono" style="color:var(--green)">${esc(c.name)}</h1>
        <div class="tag-row">
          <a class="chip" href="commands.html?cat=${encodeURIComponent(c.category)}">${esc(c.category)}</a>
          ${diffBadge(c.difficulty)}
          ${(c.aliases || []).map((a) => `<span class="badge">also: ${esc(a)}</span>`).join("")}
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn small" id="fav-btn">${isFav() ? "★ Favorited" : "☆ Favorite"}</button>
        <a class="btn small primary" href="simulator.html">Practice in terminal</a>
        <button class="btn small no-print" onclick="print()">Print / PDF</button>
      </div>
    </div>

    <p style="font-size:1.05rem;max-width:70ch">${esc(c.description)}</p>

    <h2>Syntax</h2>
    <div class="code-block" id="syntax-block">${esc(c.syntax)}</div>

    ${c.params?.length ? `<h2>Parameters</h2>
    <table class="param-table"><thead><tr><th>Option</th><th>Meaning</th></tr></thead>
      <tbody>${c.params.map(([p, d]) => `<tr><td>${esc(p)}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table>` : ""}

    <h2>Examples</h2>
    <div id="examples"></div>

    ${c.mistakes?.length ? `<h2>Common mistakes</h2>
      ${c.mistakes.map((m) => `<div class="callout red">⚠ ${esc(m)}</div>`).join("")}` : ""}

    ${c.tips?.length ? `<h2>Tips</h2>
      ${c.tips.map((t) => `<div class="callout green">💡 ${esc(t)}</div>`).join("")}` : ""}

    ${c.related?.length ? `<h2>Related commands</h2>
      <div class="tag-row">${c.related.map((r) => all.some((x) => x.name === r)
        ? `<a class="chip" href="commands.html?cmd=${encodeURIComponent(r)}"><span class="mono">${esc(r)}</span></a>`
        : `<span class="chip"><span class="mono">${esc(r)}</span></span>`).join("")}</div>` : ""}

    <h2>Your notes</h2>
    <textarea class="input" id="cmd-notes" placeholder="Private notes about ${esc(c.name)} - saved locally as you type."></textarea>

    <hr class="rule">
    <div class="no-print" style="display:flex;gap:10px">
      <a class="btn" href="quiz.html?cat=${encodeURIComponent(c.category)}">Quiz this category</a>
    </div>`;

  // Examples with typing animation + copy buttons
  const exRoot = document.getElementById("examples");
  c.examples.forEach((ex, i) => {
    const block = el(`<div class="code-block"></div>`);
    const cmdSpan = el(`<span>$ </span>`);
    block.append(cmdSpan);
    if (ex.out) block.append(el(`<span class="out">${esc(ex.out)}</span>`));
    withCopy(block, ex.cmd);
    exRoot.append(block);
    typeText(cmdSpan, "$ " + ex.cmd, i * 350);
  });
  withCopy(document.getElementById("syntax-block"), c.syntax);

  // Favorite toggle
  document.getElementById("fav-btn").addEventListener("click", (e) => {
    const nowFav = toggleFavorite(c.name);
    e.target.textContent = nowFav ? "★ Favorited" : "☆ Favorite";
    toast(nowFav ? `${c.name} added to favorites` : `${c.name} removed from favorites`);
  });

  // Notes (persisted per command)
  const notes = document.getElementById("cmd-notes");
  notes.value = state.notes[c.name] || "";
  notes.addEventListener("input", () => { state.notes[c.name] = notes.value; save(); });
}

/* Animated typing effect, honoring reduced-motion. */
function typeText(node, text, delay) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { node.textContent = text + "\n"; return; }
  node.textContent = "";
  setTimeout(() => {
    let i = 0;
    const tick = () => {
      node.textContent = text.slice(0, ++i) + (i < text.length ? "▌" : "\n");
      if (i < text.length) setTimeout(tick, 14);
    };
    tick();
  }, delay);
}
