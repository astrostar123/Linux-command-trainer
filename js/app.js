/* app.js - shared layout, theme, toasts, small helpers -------------------- */

import { state, save, levelInfo } from "./store.js";

const NAV = [
  ["index.html", "Home"],
  ["commands.html", "Commands"],
  ["simulator.html", "Terminal"],
  ["lessons.html", "Lessons"],
  ["quiz.html", "Quiz"],
  ["progress.html", "Progress"],
  ["settings.html", "Settings"],
  ["about.html", "About"],
];

/* ----- Layout ------------------------------------------------------------ */

export function renderChrome(activePage) {
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="container nav">
      <a class="brand" href="index.html"><span class="logo-dot">$_</span> Linux Command Trainer</a>
      <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu">☰</button>
      <nav class="nav-links" id="nav-links">
        ${NAV.map(([href, label]) => `<a href="${href}" class="${href === activePage ? "active" : ""}">${label}</a>`).join("")}
      </nav>
      <span class="nav-spacer"></span>
      <span class="nav-xp" id="nav-xp"></span>
    </div>`;
  document.body.prepend(header);

  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="container">
      <span>Linux Command Trainer - learn the shell by using it.</span>
      <span>Open source · MIT License · <a href="about.html">About this project</a></span>
    </div>`;
  document.body.append(footer);

  const toastRoot = document.createElement("div");
  toastRoot.id = "toast-root";
  document.body.append(toastRoot);

  document.getElementById("nav-toggle").addEventListener("click", () => {
    document.getElementById("nav-links").classList.toggle("open");
  });

  updateXPBadge();
  document.addEventListener("state:change", updateXPBadge);
  applySettings();
  registerServiceWorker();
}

function updateXPBadge() {
  const el = document.getElementById("nav-xp");
  if (!el) return;
  const lvl = levelInfo();
  el.textContent = `⚡ ${state.xp} XP · ${lvl.name}`;
}

/* ----- Theme & settings -------------------------------------------------- */

export function applySettings() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.fontSize = state.settings.fontSize + "px";
}

export function setTheme(theme) {
  state.settings.theme = theme;
  save();
  applySettings();
}

/* ----- Toasts ------------------------------------------------------------ */

export function toast(message, ms = 2600) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  root.append(el);
  setTimeout(() => el.remove(), ms);
}

/* ----- Helpers ----------------------------------------------------------- */

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function copyText(text, note = "Copied to clipboard") {
  navigator.clipboard.writeText(text).then(() => toast(note)).catch(() => toast("Copy failed"));
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

export function diffBadge(d) {
  const map = { beginner: "green", intermediate: "amber", advanced: "red" };
  return `<span class="badge ${map[d] || ""}">${esc(d)}</span>`;
}

/* Attach a copy button to a .code-block element. */
export function withCopy(block, text) {
  const btn = el(`<button class="copy-btn" aria-label="Copy command">copy</button>`);
  btn.addEventListener("click", (e) => { e.stopPropagation(); copyText(text); });
  block.append(btn);
  return block;
}

/* Deterministic day-based pick (command of the day, daily challenge). */
export function dayIndex(len) {
  const day = Math.floor(Date.now() / 864e5);
  return len ? day % len : 0;
}

/* ----- PWA --------------------------------------------------------------- */

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
