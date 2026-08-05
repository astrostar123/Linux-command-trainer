/* Linux Command Trainer — settings page
 * Theme, font size, display name, and full data export / import / reset. */

import { renderChrome, applySettings, setTheme, toast } from "./app.js";
import { state, save, resetProgress, STORE_KEY } from "./store.js";

renderChrome("settings.html");

const $ = (id) => document.getElementById(id);

/* ---------------- appearance ---------------- */

$("set-theme").value = state.settings.theme;
$("set-theme").addEventListener("change", (e) => {
  setTheme(e.target.value);
  toast(`Theme: ${e.target.value}`);
});

$("set-font").value = state.settings.fontSize;
$("font-val").textContent = state.settings.fontSize;
$("set-font").addEventListener("input", (e) => {
  state.settings.fontSize = Number(e.target.value);
  $("font-val").textContent = e.target.value;
  save();
  applySettings();
});

/* ---------------- profile ---------------- */

$("set-name").value = state.settings.username;
$("set-name").addEventListener("change", (e) => {
  state.settings.username = e.target.value.trim() || "student";
  e.target.value = state.settings.username;
  save();
  toast(`Hello, ${state.settings.username}!`);
});

/* ---------------- export ---------------- */

$("export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `linux-trainer-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Progress exported.");
});

/* ---------------- import ---------------- */

$("import-data").addEventListener("click", () => $("import-file").click());

$("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      // Minimal shape validation before trusting the file.
      if (typeof data !== "object" || data === null || typeof data.xp !== "number" || !Array.isArray(data.completedLessons)) {
        throw new Error("Not a Linux Command Trainer backup file.");
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
      toast("Progress imported — reloading…");
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* ---------------- reset ---------------- */

$("reset-data").addEventListener("click", () => {
  if (!confirm("Wipe ALL progress — XP, lessons, quizzes, notes, favorites? This cannot be undone.")) return;
  resetProgress();
  toast("Everything reset. Fresh start!");
  setTimeout(() => location.reload(), 700);
});
