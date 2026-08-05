# 🐧 Linux Command Trainer

An interactive, fully client-side website for learning the Linux command line — with a **realistic in-browser terminal simulator**, a searchable **command database**, structured **lessons**, **quizzes with explanations**, hands-on **challenges**, and gamified **progress tracking**.

Built with **pure HTML5, CSS3 and vanilla ES6 JavaScript**. No frameworks, no build step, no backend. Deploys anywhere static files are served — including GitHub Pages.

> **Live demo:** enable GitHub Pages on this repo (see [Deployment](#-deployment)) and your trainer is online in under a minute.

---

## ✨ Features

### 🖥️ Terminal simulator
- Realistic virtual filesystem seeded like a fresh Ubuntu machine (`/home/student`, `/etc`, `/var/log`, …)
- **50+ working commands**: `ls`, `cd`, `cat`, `grep`, `find`, `chmod`, `chown`, `tar`, `zip`, `ps`, `kill`, `df`, `du`, `free`, `ping`, `curl`, `ip`, `ss`, `systemctl`, `journalctl`, `apt`, `nano` (modal editor!), and more
- Pipes (`|`), redirection (`>`, `>>`), environment variables (`$VAR`, `export`), `sudo`
- Tab completion for commands **and** paths, command history with ↑/↓, `Ctrl+L` to clear
- Simulated services (`systemctl start/stop/enable nginx`…) and package manager
- **12 practice challenges** verified against the *actual sandbox state* — not string matching
- A rotating **daily challenge** that feeds your streak

### 📚 Command database
- **166 fully documented commands** across **24 categories** — every entry handwritten with description, syntax, parameter table, real examples with output, common mistakes, pro tips and related commands
- Instant multi-word search + category & difficulty filters
- Detail pages with copy buttons, animated typing demo, personal notes and printable cheat sheets
- ⭐ Favorites system

### 🎓 Lessons
- 13 structured lessons from *"What is the shell?"* to advanced administration
- Each lesson: explanations, copy-ready code blocks, hands-on tasks, and a mini quiz
- Completion tracking with XP rewards and prev/next navigation

### ❓ Quiz system
- Question types: **multiple choice**, **fill-in-the-blank** (syntax completion), **true/false**, plus 36 handwritten questions
- Filters: category, difficulty (easy → **expert**, which forces timed mode and all question types)
- Optional **timed mode** (20 s per question)
- Explanations after every answer + full review screen
- **Flashcard mode** with 3-D flip cards

### 📊 Progress & gamification
- XP and levels (*Newbie* → *root*), daily streaks, 12 achievements
- Pure-SVG chart of your last 14 quiz scores
- Per-category exploration bars, daily goal widget, local leaderboard
- Export / import your progress as JSON; everything lives in `localStorage`

### 🧩 Extras
- 🌗 Dark (default) & light themes, adjustable base font size
- 📱 Fully responsive; installable **PWA** with offline support (service worker)
- ♿ Keyboard-navigable flashcards, reduced-motion support, semantic HTML

---

## 🚀 Quick start

Because the app uses `fetch()` for its JSON data, run it from any static server (opening `index.html` directly via `file://` will block data loading in most browsers):

```bash
git clone https://github.com/<you>/linux-command-trainer.git
cd linux-command-trainer

# any of these:
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

---

## 🌐 Deployment

### GitHub Pages (recommended)
1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under *Build and deployment*, choose **Deploy from a branch**, select `main` and `/ (root)`, and save.
4. Your site appears at `https://<you>.github.io/linux-command-trainer/` within a minute or two.

All paths are relative, so it works from a project subpath out of the box. The service worker enables offline use after the first visit.

Netlify / Vercel / Cloudflare Pages: drag-and-drop the folder or point them at the repo — no build command needed.

---

## 📁 Project structure

```
linux-command-trainer/
├── index.html          # Home: live hero terminal, search, daily challenge
├── commands.html       # Database browser + command detail view (?cmd=…)
├── simulator.html      # Full terminal sandbox + challenges
├── quiz.html           # Quiz arena + flashcards
├── lessons.html        # Lesson list + lesson view (?lesson=…)
├── progress.html       # Dashboard, chart, achievements, leaderboard
├── settings.html       # Theme, font, name, export/import/reset
├── about.html
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (cache-first app shell)
├── css/
│   └── style.css       # Full design system (dark/light, glassmorphism)
├── js/
│   ├── app.js          # Shared chrome (header/footer), toasts, helpers
│   ├── store.js        # localStorage state, XP/levels, achievements
│   ├── data.js         # JSON loading, search
│   ├── vfs.js          # Virtual filesystem
│   ├── terminal.js     # Terminal engine + 50 commands
│   ├── challenges.js   # Sandbox-verified challenges
│   └── *.js            # One controller per page
├── data/
│   ├── commands.json   # 166 commands, 24 categories, quiz questions
│   └── lessons.json    # 13 lessons
└── assets/icons/       # SVG favicon + PWA icons
```

---

## 🗃️ Dataset & contributing

`data/commands.json` is a plain array — adding a command is a pull request away:

```json
{
  "name": "mycommand",
  "aliases": ["mc"],
  "category": "File Management",
  "difficulty": "beginner",
  "description": "One-line summary of what it does.",
  "syntax": "mycommand [OPTIONS] FILE",
  "params": [["-v", "Verbose output"]],
  "examples": [{ "cmd": "mycommand -v notes.txt", "out": "processed notes.txt" }],
  "mistakes": ["Forgetting the file argument."],
  "tips": ["Combine with xargs for batch runs."],
  "related": ["othercmd"],
  "quiz": [
    {
      "q": "What does mycommand do?",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explain": "Because…"
    }
  ]
}
```

Only `name`, `category`, `difficulty`, `description` and `syntax` are required — the UI degrades gracefully. The database currently ships **166 fully written commands** (each with examples, mistakes and tips — no filler); the schema is designed so the community can grow it toward 300+.

### Roadmap
- [ ] More commands (target: 300+)
- [ ] More terminal commands (`awk`, `sed` scripting, `rsync`)
- [ ] Guided multi-step scenario challenges ("recover the crashed web server")
- [ ] i18n

---

## 🛠️ Tech notes

- **Zero dependencies** — no framework, bundler or CDN scripts (only Google Fonts)
- ES modules throughout; state changes broadcast via a `state:change` event
- The chart on the dashboard is hand-rolled SVG; the terminal is a from-scratch engine over a JSON virtual filesystem
- Challenge verification inspects the live VFS (e.g. *did a directory called `practice` really appear in `/home/student`?*), so copy-pasting answers won't fool it

## 📄 License

[MIT](LICENSE) — use it, fork it, teach with it.
