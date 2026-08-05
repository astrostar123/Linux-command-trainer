/* Linux Command Trainer — progress dashboard
 * Stat cards, SVG quiz-score chart, category completion, achievements,
 * daily goal and a local best-runs leaderboard. */

import { renderChrome, esc } from "./app.js";
import { loadCommands, categories } from "./data.js";
import { state, levelInfo, ACHIEVEMENTS, earnedAchievements } from "./store.js";

renderChrome("progress.html");

const all = await loadCommands();
const cats = await categories();
const $ = (id) => document.getElementById(id);

/* ---------------- stat cards ---------------- */

const lvl = levelInfo();
const stats = [
  { label: "Level", value: lvl.name, sub: lvl.next ? `${state.xp} XP — ${lvl.pct}% to ${lvl.next.name}` : `${state.xp} XP — max level` },
  { label: "Streak", value: `${state.streak.count} day${state.streak.count === 1 ? "" : "s"}`, sub: state.streak.count ? "🔥 keep it alive in the simulator" : "run a command today to start one" },
  { label: "Lessons", value: `${state.completedLessons.length} / 13`, sub: "completed" },
  { label: "Quizzes", value: String(state.completedQuizzes.length), sub: `best ${state.quizHistory.length ? Math.max(...state.quizHistory) + "%" : "—"}` },
  { label: "Commands run", value: String(state.commandRuns || 0), sub: "in the simulator" },
  { label: "Explored", value: `${new Set(state.viewedCommands).size}`, sub: `command pages viewed` },
  { label: "Challenges", value: `${state.completedChallenges.length} / 12`, sub: "solved" },
  { label: "Favorites", value: String(state.favorites.length), sub: "bookmarked commands" },
];

$("stat-cards").innerHTML = stats
  .map(
    (s) => `
  <div class="card">
    <p class="eyebrow" style="margin:0">${esc(s.label)}</p>
    <p class="stat-big" style="margin:6px 0 2px">${esc(s.value)}</p>
    <p class="muted" style="margin:0;font-size:.82rem">${esc(s.sub)}</p>
  </div>`
  )
  .join("");

/* ---------------- quiz score chart (pure SVG) ---------------- */

function renderChart() {
  const svg = $("score-chart");
  const scores = state.quizHistory;
  const W = 560, H = 180, padX = 30, padY = 18;

  if (!scores.length) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="currentColor" opacity=".5" font-size="14">Finish a quiz to start charting your scores</text>`;
    return;
  }

  const n = scores.length;
  const x = (i) => (n === 1 ? W / 2 : padX + (i * (W - padX * 2)) / (n - 1));
  const y = (v) => H - padY - (v / 100) * (H - padY * 2);

  const gridLines = [0, 25, 50, 75, 100]
    .map(
      (v) => `
      <line x1="${padX}" y1="${y(v)}" x2="${W - padX}" y2="${y(v)}" stroke="currentColor" opacity=".12"/>
      <text x="4" y="${y(v) + 4}" font-size="10" fill="currentColor" opacity=".5">${v}</text>`
    )
    .join("");

  const pts = scores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M ${x(0)},${y(scores[0])} ${scores.map((v, i) => `L ${x(i)},${y(v)}`).join(" ")} L ${x(n - 1)},${H - padY} L ${x(0)},${H - padY} Z`;

  const dots = scores
    .map(
      (v, i) => `
      <circle cx="${x(i)}" cy="${y(v)}" r="4" fill="var(--green, #45d48a)">
        <title>Quiz ${i + 1}: ${v}%</title>
      </circle>`
    )
    .join("");

  svg.innerHTML = `
    ${gridLines}
    <path d="${area}" fill="var(--green, #45d48a)" opacity=".12"/>
    <polyline points="${pts}" fill="none" stroke="var(--green, #45d48a)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}`;
}
renderChart();

/* ---------------- category completion ---------------- */

const viewed = new Set(state.viewedCommands);
const runNames = new Set(); // command pages viewed count toward exploration
const catTotals = new Map(cats.map((c) => [c, { total: 0, seen: 0 }]));
for (const c of all) {
  const t = catTotals.get(c.category);
  t.total++;
  if (viewed.has(c.name) || state.favorites.includes(c.name)) t.seen++;
}

const catRows = [...catTotals.entries()]
  .sort((a, b) => b[1].seen / b[1].total - a[1].seen / a[1].total || b[1].total - a[1].total)
  .map(([cat, t]) => {
    const pct = Math.round((t.seen / t.total) * 100);
    return `
    <div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;font-size:.85rem">
        <a href="commands.html?cat=${encodeURIComponent(cat)}" style="text-decoration:none;color:inherit">${esc(cat)}</a>
        <span class="muted mono">${t.seen}/${t.total}</span>
      </div>
      <div class="bar"><div style="width:${pct}%"></div></div>
    </div>`;
  });

$("cat-progress").innerHTML =
  `<p class="muted" style="font-size:.82rem;margin-top:0">Explored = command pages you've opened or bookmarked.</p>` +
  catRows.join("");

/* ---------------- achievements ---------------- */

const earnedIds = new Set(earnedAchievements().map((a) => a.id));
$("achievements").innerHTML = ACHIEVEMENTS.map(
  (a) => `
  <div class="achievement ${earnedIds.has(a.id) ? "earned" : ""}">
    <span style="font-size:1.4rem">${a.icon}</span>
    <div>
      <strong>${esc(a.name)}</strong>
      <p class="muted" style="margin:2px 0 0;font-size:.82rem">${esc(a.desc)}</p>
    </div>
    <span class="badge ${earnedIds.has(a.id) ? "green" : ""}" style="margin-left:auto">${earnedIds.has(a.id) ? "earned" : "locked"}</span>
  </div>`
).join("");

/* ---------------- daily goal ---------------- */

const todayKey = new Date().toISOString().slice(0, 10);
const dailyDone = state.dailyChallengeDone === todayKey;
$("daily-goal").innerHTML = `
  <p style="margin:0 0 8px">${dailyDone ? "✓ Today's challenge is done — streak secured." : "Complete today's terminal challenge to protect your streak."}</p>
  <div class="bar"><div style="width:${dailyDone ? 100 : 0}%"></div></div>
  <a class="btn ${dailyDone ? "" : "amber"} small" href="simulator.html#daily" style="margin-top:12px">${dailyDone ? "Free practice →" : "Go to today's challenge →"}</a>`;

/* ---------------- local leaderboard ---------------- */

const name = state.settings.username || "student";
const best = [...state.completedQuizzes]
  .filter((q) => q.total > 0)
  .sort((a, b) => b.score / b.total - a.score / a.total || b.total - a.total)
  .slice(0, 8);

$("leaderboard").innerHTML = best.length
  ? `<table class="param-table" style="margin-top:8px"><thead><tr><th>#</th><th>Player</th><th>Quiz</th><th>Score</th></tr></thead><tbody>${best
      .map(
        (q, i) => `
      <tr>
        <td class="mono">${["🥇", "🥈", "🥉"][i] || i + 1}</td>
        <td>${esc(name)}</td>
        <td class="muted" style="font-size:.85rem">${esc(q.id)} · ${esc(q.date || "")}</td>
        <td class="mono">${q.score}/${q.total} (${Math.round((q.score / q.total) * 100)}%)</td>
      </tr>`
      )
      .join("")}</tbody></table>`
  : `<p class="muted">No quiz runs yet — your best scores will appear here.</p>`;
