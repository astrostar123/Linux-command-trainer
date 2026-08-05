/* Linux Command Trainer — lessons page
 * List of learning paths + single-lesson view with sections, tasks and a mini quiz. */

import { renderChrome, toast, esc, withCopy } from "./app.js";
import { loadLessons, loadCommands } from "./data.js";
import { state, markLesson } from "./store.js";

renderChrome("lessons.html");

const listView = document.getElementById("lesson-list-view");
const lessonView = document.getElementById("lesson-view");
const listEl = document.getElementById("lesson-list");
const contentEl = document.getElementById("lesson-content");

const [lessons, commands] = await Promise.all([loadLessons(), loadCommands()]);
const byName = new Map(commands.map((c) => [c.name, c]));

const params = new URLSearchParams(location.search);
const lessonId = params.get("lesson");

if (lessonId) {
  const lesson = lessons.find((l) => l.id === lessonId);
  if (lesson) showLesson(lesson);
  else showList();
} else {
  showList();
}

/* ---------------- list view ---------------- */

function showList() {
  listView.hidden = false;
  lessonView.hidden = true;
  document.title = "Lessons — Linux Command Trainer";

  listEl.innerHTML = lessons
    .map((l, i) => {
      const isDone = state.completedLessons.includes(l.id);
      return `
      <a class="lesson-item ${isDone ? "earned" : ""}" href="lessons.html?lesson=${l.id}"
         style="display:block;text-decoration:none;color:inherit;margin-top:12px">
        <div style="display:flex;gap:14px;align-items:center">
          <span style="font-size:1.5rem">${l.icon}</span>
          <div style="flex:1">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
              <strong>${i + 1}. ${esc(l.title)}</strong>
              <span class="badge ${isDone ? "green" : "blue"}">${isDone ? "✓ complete" : esc(l.level)}</span>
            </div>
            <p class="muted" style="margin:5px 0 0;font-size:.9rem">${esc(l.summary)}</p>
          </div>
        </div>
      </a>`;
    })
    .join("");
}

/* ---------------- lesson view ---------------- */

function showLesson(lesson) {
  listView.hidden = true;
  lessonView.hidden = false;
  document.title = `${lesson.title} — Linux Command Trainer`;

  const idx = lessons.indexOf(lesson);
  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];
  const isDone = state.completedLessons.includes(lesson.id);

  const sectionsHTML = lesson.sections
    .map(
      (s) => `
      <h2>${esc(s.h)}</h2>
      <p>${esc(s.p)}</p>
      ${s.code ? codeBlock(s.code) : ""}`
    )
    .join("");

  const chipsHTML = lesson.commands
    .map((n) => `<a class="chip" href="commands.html?cmd=${encodeURIComponent(n)}">${esc(n)}</a>`)
    .join("");

  const tasksHTML = lesson.tasks
    .map((t, i) => `<li style="margin:6px 0">${esc(t)} <span class="muted mono" style="font-size:.8rem">(try it in the <a href="simulator.html">simulator</a>)</span>${i === 0 ? "" : ""}</li>`)
    .join("");

  contentEl.innerHTML = `
    <p><a class="muted" href="lessons.html" style="font-size:.9rem">← All lessons</a></p>
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap">
      <h1 style="margin:6px 0">${lesson.icon} ${esc(lesson.title)}</h1>
      <span class="badge ${isDone ? "green" : "blue"}">${isDone ? "✓ complete" : esc(lesson.level)}</span>
    </div>
    <p class="lede">${esc(lesson.summary)}</p>
    <div class="tag-row" style="margin:12px 0 4px">${chipsHTML}</div>
    ${sectionsHTML}
    <h2>Hands-on tasks</h2>
    <ol style="padding-left:20px">${tasksHTML}</ol>
    <h2>Mini quiz</h2>
    <div id="mini-quiz"></div>
    <div class="rule"></div>
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <div>${prev ? `<a class="btn small" href="lessons.html?lesson=${prev.id}">← ${esc(prev.title)}</a>` : ""}</div>
      <button class="btn primary" id="lesson-complete" ${isDone ? "disabled" : ""}>
        ${isDone ? "✓ Lesson completed" : "Mark lesson complete (+40 XP)"}
      </button>
      <div>${next ? `<a class="btn small" href="lessons.html?lesson=${next.id}">${esc(next.title)} →</a>` : ""}</div>
    </div>`;

  contentEl.querySelectorAll(".code-block").forEach((b) => withCopy(b, b.dataset.raw));

  renderMiniQuiz(lesson);

  document.getElementById("lesson-complete").addEventListener("click", (e) => {
    markLesson(lesson.id);
    e.target.disabled = true;
    e.target.textContent = "✓ Lesson completed";
    toast("Lesson complete! +40 XP");
    if (next) setTimeout(() => toast(`Up next: ${next.title}`), 900);
  });
}

function codeBlock(code) {
  return `<div class="code-block" data-raw="${esc(code)}"><pre>${esc(code)}</pre></div>`;
}

/* ---------------- mini quiz ---------------- */

function buildMiniQuiz(lesson) {
  // Prefer handwritten quiz questions attached to this lesson's commands.
  const qs = [];
  for (const name of lesson.commands) {
    const c = byName.get(name);
    if (c?.quiz?.length) {
      for (const q of c.quiz) qs.push({ ...q, cmd: name });
    }
  }
  // Fill up to 3 with auto-generated "which command does this?" questions.
  const pool = lesson.commands.map((n) => byName.get(n)).filter(Boolean);
  let guard = 0;
  while (qs.length < 3 && pool.length >= 2 && guard++ < 20) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (qs.some((q) => q.cmd === c.name && q.auto)) continue;
    const wrong = commands
      .filter((x) => x.name !== c.name)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((x) => x.name);
    const options = [...wrong, c.name].sort(() => Math.random() - 0.5);
    qs.push({
      q: `Which command matches: “${c.description}”?`,
      options,
      answer: options.indexOf(c.name),
      explain: `${c.name} — ${c.description}`,
      cmd: c.name,
      auto: true,
    });
  }
  return qs.slice(0, 3);
}

function renderMiniQuiz(lesson) {
  const box = document.getElementById("mini-quiz");
  const qs = buildMiniQuiz(lesson);
  if (!qs.length) {
    box.innerHTML = `<p class="muted">No quiz for this lesson yet — head to the <a href="quiz.html">quiz arena</a> instead.</p>`;
    return;
  }
  box.innerHTML = qs
    .map(
      (q, qi) => `
    <div class="card" style="margin-top:12px" data-q="${qi}">
      <p style="margin-top:0"><strong>Q${qi + 1}.</strong> ${esc(q.q)}</p>
      ${q.options
        .map((o, oi) => `<button class="quiz-option" data-oi="${oi}">${esc(o)}</button>`)
        .join("")}
      <p class="muted" data-explain hidden style="margin:10px 0 0;font-size:.88rem"></p>
    </div>`
    )
    .join("");

  box.querySelectorAll("[data-q]").forEach((card) => {
    const q = qs[Number(card.dataset.q)];
    const explain = card.querySelector("[data-explain]");
    card.querySelectorAll(".quiz-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (card.dataset.locked) return;
        card.dataset.locked = "1";
        const oi = Number(btn.dataset.oi);
        card.querySelectorAll(".quiz-option").forEach((b, bi) => {
          if (bi === q.answer) b.classList.add("correct");
          else if (bi === oi) b.classList.add("wrong");
          b.disabled = true;
        });
        explain.hidden = false;
        explain.textContent = (oi === q.answer ? "✓ Correct. " : "✗ Not quite. ") + (q.explain || "");
      });
    });
  });
}
