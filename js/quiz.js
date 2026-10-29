/* Linux Command Trainer - quiz page
 * Generates MCQ / fill-in-the-blank / true-false questions from the command
 * database, mixes in handwritten questions, supports timed + expert modes,
 * records results, and offers a flashcard mode. */

import { renderChrome, toast, esc } from "./app.js";
import { loadCommands, categories } from "./data.js";
import { recordQuiz } from "./store.js";

renderChrome("quiz.html");

const all = await loadCommands();
const cats = await categories();

const $ = (id) => document.getElementById(id);
const views = { setup: $("quiz-setup"), run: $("quiz-run"), done: $("quiz-done"), flash: $("flash-view") };
function show(name) {
  for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
}

/* Populate category select */
const catSel = $("quiz-cat");
for (const c of cats) {
  const o = document.createElement("option");
  o.value = c;
  o.textContent = c;
  catSel.append(o);
}

/* ---------------- question generation ---------------- */

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function distractors(correct, pool, n = 3) {
  const sameCat = pool.filter((c) => c.name !== correct.name && c.category === correct.category);
  const rest = pool.filter((c) => c.name !== correct.name && c.category !== correct.category);
  return shuffle([...shuffle(sameCat), ...shuffle(rest)]).slice(0, n);
}

function qMCQ(cmd, pool) {
  const wrong = distractors(cmd, pool).map((c) => c.name);
  const options = shuffle([...wrong, cmd.name]);
  return {
    type: "mcq",
    q: `Which command matches this description?`,
    code: cmd.description,
    options,
    answer: options.indexOf(cmd.name),
    explain: `${cmd.name} - ${cmd.description}`,
  };
}

function qFillBlank(cmd, pool) {
  const blanked = cmd.syntax.replace(new RegExp(`\\b${cmd.name}\\b`), "____");
  if (!blanked.includes("____")) return qMCQ(cmd, pool);
  const wrong = distractors(cmd, pool).map((c) => c.name);
  const options = shuffle([...wrong, cmd.name]);
  return {
    type: "fill",
    q: "Fill in the blank to complete this syntax:",
    code: blanked,
    options,
    answer: options.indexOf(cmd.name),
    explain: `Full syntax: ${cmd.syntax}`,
  };
}

function qTrueFalse(cmd, pool) {
  const truthy = Math.random() < 0.5;
  const other = pick(pool.filter((c) => c.name !== cmd.name));
  const desc = truthy ? cmd.description : other.description;
  return {
    type: "tf",
    q: `True or false - the ${cmd.name} command:`,
    code: `“${desc}”`,
    options: ["True", "False"],
    answer: truthy ? 0 : 1,
    explain: truthy
      ? `True. ${cmd.name} - ${cmd.description}`
      : `False. That describes ${other.name}. ${cmd.name} - ${cmd.description}`,
  };
}

function qHandwritten(cmd) {
  const q = pick(cmd.quiz);
  return { type: "hand", q: q.q, code: "", options: q.options, answer: q.answer, explain: q.explain || "" };
}

function buildQuiz({ category, difficulty, count }) {
  let pool = all;
  if (category) pool = pool.filter((c) => c.category === category);
  const expert = difficulty === "expert";
  if (difficulty && !expert) pool = pool.filter((c) => c.difficulty === difficulty);
  if (pool.length < 4) pool = all; // safety net for tiny filtered pools

  const handwritten = shuffle(pool.filter((c) => c.quiz?.length));
  const questions = [];
  const used = new Set();

  // Sprinkle handwritten questions first (up to half the quiz).
  for (const c of handwritten.slice(0, Math.floor(count / 2))) {
    questions.push(qHandwritten(c));
    used.add(c.name);
  }

  const gens = expert
    ? [qMCQ, qFillBlank, qTrueFalse]
    : difficulty === "advanced"
      ? [qFillBlank, qTrueFalse, qMCQ]
      : [qMCQ, qMCQ, qFillBlank, qTrueFalse];

  let guard = 0;
  while (questions.length < count && guard++ < count * 12) {
    const cmd = pick(pool);
    if (used.has(cmd.name) && used.size < pool.length) continue;
    used.add(cmd.name);
    questions.push(pick(gens)(cmd, pool.length >= 4 ? pool : all));
  }
  return shuffle(questions).slice(0, count);
}

/* ---------------- quiz runtime ---------------- */

let quiz = null;

$("quiz-start").addEventListener("click", () => {
  const difficulty = $("quiz-diff").value;
  quiz = {
    questions: buildQuiz({
      category: catSel.value,
      difficulty,
      count: Number($("quiz-len").value),
    }),
    i: 0,
    score: 0,
    review: [],
    timed: $("quiz-timed").checked || difficulty === "expert",
    timer: null,
    label: [catSel.value || "All categories", difficulty || "mixed"].join(" · "),
  };
  if (!quiz.questions.length) {
    toast("Not enough commands in that filter - try a broader one.");
    return;
  }
  show("run");
  renderQuestion();
});

function stopTimer() {
  if (quiz?.timer) clearInterval(quiz.timer);
  if (quiz) quiz.timer = null;
}

function renderQuestion() {
  const q = quiz.questions[quiz.i];
  $("quiz-counter").textContent = `Question ${quiz.i + 1} of ${quiz.questions.length}`;
  $("quiz-bar").style.width = `${(quiz.i / quiz.questions.length) * 100}%`;
  $("quiz-q").textContent = q.q;
  $("quiz-code").innerHTML = q.code ? `<div class="code-block"><pre>${esc(q.code)}</pre></div>` : "";
  $("quiz-explain").hidden = true;
  $("quiz-next").hidden = true;

  const box = $("quiz-options");
  box.innerHTML = q.options
    .map((o, i) => `<button class="quiz-option" data-i="${i}">${esc(o)}</button>`)
    .join("");
  box.querySelectorAll(".quiz-option").forEach((btn) =>
    btn.addEventListener("click", () => answer(Number(btn.dataset.i)))
  );

  const timerEl = $("quiz-timer");
  stopTimer();
  if (quiz.timed) {
    let left = 20;
    timerEl.hidden = false;
    timerEl.textContent = `⏱ ${left}s`;
    quiz.timer = setInterval(() => {
      left--;
      timerEl.textContent = `⏱ ${left}s`;
      if (left <= 0) answer(-1); // timeout counts as wrong
    }, 1000);
  } else {
    timerEl.hidden = true;
  }
}

function answer(choice) {
  stopTimer();
  const q = quiz.questions[quiz.i];
  const correct = choice === q.answer;
  if (correct) quiz.score++;
  quiz.review.push({ q, choice, correct });

  $("quiz-options").querySelectorAll(".quiz-option").forEach((b, i) => {
    b.disabled = true;
    if (i === q.answer) b.classList.add("correct");
    else if (i === choice) b.classList.add("wrong");
  });

  const ex = $("quiz-explain");
  ex.hidden = false;
  ex.className = `callout ${correct ? "green" : "red"}`;
  ex.textContent =
    (correct ? "✓ Correct. " : choice === -1 ? "⏱ Time's up. " : "✗ Not quite. ") + (q.explain || "");

  const next = $("quiz-next");
  next.hidden = false;
  next.textContent = quiz.i + 1 < quiz.questions.length ? "Next question" : "See results";
  next.focus();
}

$("quiz-next").addEventListener("click", () => {
  quiz.i++;
  if (quiz.i < quiz.questions.length) renderQuestion();
  else finish();
});

function finish() {
  stopTimer();
  const { score, questions, review, label } = quiz;
  const total = questions.length;
  const pct = Math.round((score / total) * 100);
  recordQuiz(label, score, total);

  const verdict =
    pct === 100 ? "Flawless. root would be proud." :
    pct >= 80 ? "Strong run - nearly there." :
    pct >= 50 ? "Solid base. Review the misses below." :
    "Rough one - the lessons page has your back.";

  $("quiz-done").innerHTML = `
    <div class="card raised" style="max-width:720px">
      <p class="eyebrow">Quiz complete</p>
      <h2 style="margin:4px 0">${score} / ${total} - ${pct}% <span class="badge ${pct >= 80 ? "green" : pct >= 50 ? "amber" : "red"}">+${score * 10} XP</span></h2>
      <p class="muted">${verdict}</p>
      <div class="rule"></div>
      ${review
        .map(
          (r, i) => `
        <div style="margin:12px 0">
          <p style="margin:0"><strong>${r.correct ? "✓" : "✗"} Q${i + 1}.</strong> ${esc(r.q.q)}</p>
          ${r.q.code ? `<p class="mono muted" style="margin:4px 0;font-size:.85rem">${esc(r.q.code)}</p>` : ""}
          <p class="muted" style="margin:4px 0;font-size:.88rem">
            Answer: <strong>${esc(String(r.q.options[r.q.answer]))}</strong>
            ${!r.correct && r.choice >= 0 ? ` · you picked ${esc(String(r.q.options[r.choice]))}` : r.choice === -1 ? " · timed out" : ""}
          </p>
        </div>`
        )
        .join("")}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
        <button class="btn primary" id="quiz-again">Try another quiz</button>
        <a class="btn" href="progress.html">View progress</a>
      </div>
    </div>`;
  show("done");
  $("quiz-again").addEventListener("click", () => show("setup"));
  toast(`Quiz saved: ${pct}% (+${score * 10} XP)`);
}

/* ---------------- flashcards ---------------- */

$("flash-start").addEventListener("click", () => {
  show("flash");
  renderFlashcards();
});
$("flash-back").addEventListener("click", () => show("setup"));

function renderFlashcards() {
  const pool = catSel.value ? all.filter((c) => c.category === catSel.value) : all;
  const cards = shuffle(pool).slice(0, 12);
  const grid = $("flash-grid");
  grid.innerHTML = cards
    .map(
      (c) => `
    <div class="flashcard" tabindex="0" role="button" aria-label="Flashcard for a Linux command">
      <div class="inner">
        <div class="face"><div><div class="mono" style="font-size:1.3rem">${esc(c.name)}</div><div class="muted" style="font-size:.8rem;margin-top:8px">tap to flip</div></div></div>
        <div class="face back"><div><div style="font-size:.9rem">${esc(c.description)}</div><div class="mono muted" style="font-size:.78rem;margin-top:10px">${esc(c.syntax)}</div></div></div>
      </div>
    </div>`
    )
    .join("");
  grid.querySelectorAll(".flashcard").forEach((card) => {
    const flip = () => card.classList.toggle("flipped");
    card.addEventListener("click", flip);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
    });
  });
}
