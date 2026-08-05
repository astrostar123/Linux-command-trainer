/* store.js — persistent app state (Local Storage) ------------------------- */

export const STORE_KEY = "lct-state-v1";

const DEFAULT_STATE = {
  xp: 0,
  completedLessons: [],      // lesson ids
  completedQuizzes: [],      // { id, score, total, date }
  completedChallenges: [],   // challenge ids
  viewedCommands: [],        // most recent first, max 12
  favorites: [],             // command names
  notes: {},                 // command name -> text
  streak: { count: 0, lastDay: null },
  dailyChallengeDone: null,  // date string of last completed daily challenge
  commandRuns: 0,            // commands executed in the simulator
  quizHistory: [],           // last 14 scores as percentages (for chart)
  settings: { theme: "dark", fontSize: 16, sound: false, username: "student" },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return Object.assign(structuredClone(DEFAULT_STATE), JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export const state = loadState();

export function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  document.dispatchEvent(new CustomEvent("state:change"));
}

export function resetProgress() {
  const settings = state.settings;
  Object.assign(state, structuredClone(DEFAULT_STATE));
  state.settings = settings;
  save();
}

/* ----- XP & levels ------------------------------------------------------- */

export const LEVELS = [
  { name: "Newbie", xp: 0 },
  { name: "User", xp: 100 },
  { name: "Power User", xp: 300 },
  { name: "Sysadmin", xp: 700 },
  { name: "Kernel Hacker", xp: 1400 },
  { name: "root", xp: 2500 },
];

export function levelInfo() {
  let i = 0;
  while (i + 1 < LEVELS.length && state.xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1] || null;
  const pct = next ? Math.min(100, Math.round(((state.xp - cur.xp) / (next.xp - cur.xp)) * 100)) : 100;
  return { index: i, name: cur.name, next, pct };
}

export function addXP(amount, reason = "") {
  state.xp += amount;
  touchStreak();
  save();
  return { amount, reason };
}

/* ----- Streak ------------------------------------------------------------ */

function todayStr() { return new Date().toISOString().slice(0, 10); }

export function touchStreak() {
  const today = todayStr();
  const last = state.streak.lastDay;
  if (last === today) return;
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  state.streak.count = last === yesterday ? state.streak.count + 1 : 1;
  state.streak.lastDay = today;
}

/* ----- Recording activity ------------------------------------------------ */

export function markLesson(id) {
  if (!state.completedLessons.includes(id)) {
    state.completedLessons.push(id);
    addXP(40, "lesson");
  }
}

export function recordQuiz(id, score, total) {
  state.completedQuizzes.push({ id, score, total, date: todayStr() });
  state.quizHistory.push(Math.round((score / total) * 100));
  if (state.quizHistory.length > 14) state.quizHistory.shift();
  addXP(score * 10, "quiz");
}

export function markChallenge(id, xp = 25) {
  if (!state.completedChallenges.includes(id)) {
    state.completedChallenges.push(id);
    addXP(xp, "challenge");
    return true;
  }
  return false;
}

export function viewCommand(name) {
  state.viewedCommands = [name, ...state.viewedCommands.filter((n) => n !== name)].slice(0, 12);
  save();
}

export function toggleFavorite(name) {
  const i = state.favorites.indexOf(name);
  if (i >= 0) state.favorites.splice(i, 1);
  else state.favorites.push(name);
  save();
  return i < 0;
}

/* ----- Achievements ------------------------------------------------------ */

export const ACHIEVEMENTS = [
  { id: "first-cmd", icon: "⌨️", name: "Hello, shell", desc: "Run your first command in the simulator", test: (s) => s.commandRuns >= 1 },
  { id: "cmd-50", icon: "🖥️", name: "Terminal regular", desc: "Run 50 commands in the simulator", test: (s) => s.commandRuns >= 50 },
  { id: "cmd-200", icon: "🧙", name: "Shell wizard", desc: "Run 200 commands in the simulator", test: (s) => s.commandRuns >= 200 },
  { id: "first-lesson", icon: "📗", name: "Student", desc: "Complete your first lesson", test: (s) => s.completedLessons.length >= 1 },
  { id: "lessons-5", icon: "🎓", name: "Scholar", desc: "Complete 5 lessons", test: (s) => s.completedLessons.length >= 5 },
  { id: "first-quiz", icon: "❓", name: "Quiz taker", desc: "Finish your first quiz", test: (s) => s.completedQuizzes.length >= 1 },
  { id: "perfect-quiz", icon: "💯", name: "Perfectionist", desc: "Score 100% on a quiz", test: (s) => s.completedQuizzes.some((q) => q.score === q.total && q.total > 0) },
  { id: "challenges-5", icon: "🏗️", name: "Builder", desc: "Solve 5 practice challenges", test: (s) => s.completedChallenges.length >= 5 },
  { id: "streak-3", icon: "🔥", name: "On a roll", desc: "Keep a 3-day streak", test: (s) => s.streak.count >= 3 },
  { id: "streak-7", icon: "☄️", name: "Unstoppable", desc: "Keep a 7-day streak", test: (s) => s.streak.count >= 7 },
  { id: "fav-5", icon: "⭐", name: "Curator", desc: "Bookmark 5 favorite commands", test: (s) => s.favorites.length >= 5 },
  { id: "xp-1000", icon: "🏆", name: "Grinder", desc: "Reach 1000 XP", test: (s) => s.xp >= 1000 },
];

export function earnedAchievements() {
  return ACHIEVEMENTS.filter((a) => a.test(state));
}
