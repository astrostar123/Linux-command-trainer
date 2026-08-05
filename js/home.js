/* home.js — homepage: live hero terminal, search, roadmap, daily widgets -- */

import { renderChrome, esc, el, diffBadge, dayIndex } from "./app.js";
import { state, levelInfo } from "./store.js";
import { loadCommands, loadLessons, searchCommands } from "./data.js";
import { Terminal } from "./terminal.js";
import { dailyChallenge } from "./challenges.js";

renderChrome("index.html");

/* ---- Signature element: a real, live terminal in the hero ---- */
const heroTerm = new Terminal(document.getElementById("hero-terminal"), { greeting: false });
heroTerm.print(`Try a command — this terminal is real. Start with <span class="exec">ls</span>, <span class="exec">pwd</span> or <span class="exec">help</span>.\n`, true);

/* ---- Hero stats ---- */
async function heroStats() {
  const cmds = await loadCommands();
  const lessons = await loadLessons();
  document.getElementById("hero-stats").innerHTML = `
    <div class="stat"><b>${cmds.length}</b><span>commands documented</span></div>
    <div class="stat"><b>${lessons.length}</b><span>guided lessons</span></div>
    <div class="stat"><b>50+</b><span>simulator commands</span></div>`;
}

/* ---- Search ---- */
async function wireSearch() {
  const all = await loadCommands();
  const input = document.getElementById("home-search");
  const results = document.getElementById("home-results");
  input.addEventListener("input", () => {
    const q = input.value.trim();
    results.innerHTML = "";
    if (!q) return;
    for (const c of searchCommands(all, q).slice(0, 6)) {
      results.append(el(`<a class="card cmd-card fade-in" href="commands.html?cmd=${encodeURIComponent(c.name)}">
        <span class="name">${esc(c.name)}</span>
        <p>${esc(c.description)}</p>
        <div class="cmd-meta"><span class="badge">${esc(c.category)}</span>${diffBadge(c.difficulty)}</div>
      </a>`));
    }
    if (!results.children.length) results.append(el(`<p class="muted">No commands match "${esc(q)}" — try a broader term, or browse all commands.</p>`));
  });
}

/* ---- Command of the day ---- */
async function commandOfTheDay() {
  const all = await loadCommands();
  const c = all[dayIndex(all.length)];
  document.getElementById("cotd").innerHTML = `
    <h3 class="mono" style="color:var(--green)">${esc(c.name)}</h3>
    <p class="muted" style="font-size:.92rem">${esc(c.description)}</p>
    <div class="code-block">${esc(c.examples[0]?.cmd || c.syntax)}</div>
    <a class="btn small" href="commands.html?cmd=${encodeURIComponent(c.name)}">Learn ${esc(c.name)}</a>`;
}

/* ---- Daily challenge ---- */
function daily() {
  const ch = dailyChallenge();
  const done = state.dailyChallengeDone === new Date().toISOString().slice(0, 10);
  document.getElementById("daily").innerHTML = `
    <h3>${esc(ch.title)} <span class="badge amber">+${ch.xp} XP</span></h3>
    <p class="muted" style="font-size:.92rem">${esc(ch.prompt)}</p>
    ${done ? `<span class="badge green">✓ completed today</span>` : `<a class="btn small amber" href="simulator.html#daily">Solve in the terminal</a>`}`;
}

/* ---- Progress card ---- */
function progressCard() {
  const lvl = levelInfo();
  document.getElementById("home-progress").innerHTML = `
    <div class="stat-big">${state.xp} XP</div>
    <p class="muted" style="margin:4px 0 8px">Level: ${lvl.name}${lvl.next ? ` — ${lvl.next.xp - state.xp} XP to ${lvl.next.name}` : " (max)"}</p>
    <div class="bar"><div style="width:${lvl.pct}%"></div></div>
    <p class="muted" style="margin-top:10px;font-size:.9rem">🔥 ${state.streak.count}-day streak · ${state.completedLessons.length} lessons · ${state.completedQuizzes.length} quizzes</p>
    <a class="btn small" style="margin-top:6px" href="progress.html">Open dashboard</a>`;
}

/* ---- Roadmap ---- */
async function roadmap() {
  const lessons = await loadLessons();
  const grid = document.getElementById("roadmap");
  for (const l of lessons.slice(0, 8)) {
    const done = state.completedLessons.includes(l.id);
    grid.append(el(`<a class="card cmd-card" href="lessons.html?lesson=${l.id}">
      <div style="font-size:1.4rem">${l.icon}</div>
      <span class="name" style="color:var(--text);font-family:var(--font-display)">${esc(l.title)}</span>
      <p>${esc(l.summary)}</p>
      <div class="cmd-meta">${diffBadge(l.level)}${done ? '<span class="badge green">✓ done</span>' : ""}</div>
    </a>`));
  }
  // Continue button → first incomplete lesson
  const next = lessons.find((l) => !state.completedLessons.includes(l.id));
  if (next) document.getElementById("continue-btn").href = `lessons.html?lesson=${next.id}`;
}

/* ---- Recently viewed ---- */
function recent() {
  if (!state.viewedCommands.length) return;
  document.getElementById("recent-section").hidden = false;
  const row = document.getElementById("recent-cmds");
  for (const name of state.viewedCommands) {
    row.append(el(`<a class="chip" href="commands.html?cmd=${encodeURIComponent(name)}"><span class="mono">${esc(name)}</span></a>`));
  }
}

heroStats(); wireSearch(); commandOfTheDay(); daily(); progressCard(); roadmap(); recent();
