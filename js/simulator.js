/* Linux Command Trainer — simulator page
 * Full-screen terminal + practice challenges verified against the live sandbox. */

import { renderChrome, toast, esc } from "./app.js";
import { Terminal } from "./terminal.js";
import { CHALLENGES, dailyChallenge } from "./challenges.js";
import { state, save, markChallenge, touchStreak } from "./store.js";

renderChrome("simulator.html");

const termEl = document.getElementById("terminal");
const listEl = document.getElementById("challenge-list");
const daily = dailyChallenge();
const todayKey = new Date().toISOString().slice(0, 10);

let term = null;
let lastCmd = "";

function done(id) {
  return state.completedChallenges.includes(id);
}

function bootTerminal() {
  termEl.innerHTML = "";
  term = new Terminal(termEl, {
    onCommand: (line, t) => {
      lastCmd = line;
      state.commandRuns = (state.commandRuns || 0) + 1;
      touchStreak();
      save();
      verify(t);
    },
  });
}

function verify(t) {
  let earned = false;
  for (const ch of CHALLENGES) {
    if (done(ch.id)) continue;
    let ok = false;
    try { ok = !!ch.check(t, lastCmd); } catch { ok = false; }
    if (!ok) continue;
    markChallenge(ch.id, ch.xp);
    earned = true;
    toast(`✓ Challenge complete: ${ch.title} (+${ch.xp} XP)`);
    if (ch.id === daily.id && state.dailyChallengeDone !== todayKey) {
      state.dailyChallengeDone = todayKey;
      save();
      toast("★ Daily challenge done — streak fuel secured.");
    }
  }
  if (earned) renderChallenges();
}

function renderChallenges() {
  const isDailyToday = state.dailyChallengeDone === todayKey;
  listEl.innerHTML = CHALLENGES.map((ch) => {
    const isDone = done(ch.id);
    const isDaily = ch.id === daily.id;
    return `
      <div class="lesson-item ${isDone ? "earned" : ""}" id="ch-${ch.id}" style="margin-top:10px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
          <strong>${isDone ? "✓ " : ""}${esc(ch.title)}</strong>
          <span class="badge ${isDone ? "green" : isDaily ? "amber" : "blue"}">${
            isDone ? "done" : isDaily ? (isDailyToday ? "daily ✓" : "daily") : ch.xp + " XP"
          }</span>
        </div>
        <p class="muted" style="margin:6px 0 0;font-size:.88rem">${esc(ch.prompt)}</p>
        ${
          isDone
            ? ""
            : `<button class="btn small" data-hint="${ch.id}" style="margin-top:8px">Show hint</button>
               <p class="muted mono" data-hint-text="${ch.id}" hidden style="margin:8px 0 0;font-size:.82rem">${esc(ch.hint)}</p>`
        }
      </div>`;
  }).join("");

  listEl.querySelectorAll("[data-hint]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = listEl.querySelector(`[data-hint-text="${btn.dataset.hint}"]`);
      p.hidden = !p.hidden;
      btn.textContent = p.hidden ? "Show hint" : "Hide hint";
    });
  });
}

document.getElementById("reset-term").addEventListener("click", () => {
  bootTerminal();
  toast("Sandbox reset — fresh filesystem, same challenges.");
});

bootTerminal();
renderChallenges();

/* Deep link from homepage daily-challenge card: simulator.html#daily */
if (location.hash === "#daily") {
  const el = document.getElementById(`ch-${daily.id}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.outline = "2px solid var(--amber, #f2a93b)";
    setTimeout(() => (el.style.outline = ""), 2600);
  }
}
