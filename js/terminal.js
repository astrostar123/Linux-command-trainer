/* terminal.js — the interactive Linux terminal simulator ------------------
 *
 * A self-contained shell engine over the virtual filesystem in vfs.js.
 * Supports: pipes (|), output redirection (> and >>), environment variables
 * ($VAR expansion, VAR=value, export), command history (arrow keys),
 * tab completion for commands and paths, a tiny modal editor for nano,
 * and ~50 simulated commands with realistic output.
 * ------------------------------------------------------------------------ */

import {
  createFS, normalize, resolve, parentOf, mkfile, mkdirNode,
  cloneNode, walk, sizeOf,
} from "./vfs.js";

const HOME = "/home/student";

export class Terminal {
  constructor(bodyEl, { onCommand = null, greeting = true } = {}) {
    this.body = bodyEl;
    this.onCommand = onCommand;         // hook: (cmdline, terminal) after each run
    this.fs = createFS();
    this.cwd = HOME;
    this.env = {
      USER: "student", HOME, HOSTNAME: "trainer", SHELL: "/bin/bash",
      PATH: "/usr/local/bin:/usr/bin:/bin", EDITOR: "nano", TERM: "xterm-256color",
    };
    this.historyList = [];
    this.histIndex = -1;
    this.mode = null;                   // { type:"editor", path, lines } while in nano
    this.services = {
      ssh: { active: true, enabled: true, desc: "OpenBSD Secure Shell server" },
      nginx: { active: true, enabled: true, desc: "A high performance web server" },
      cron: { active: true, enabled: true, desc: "Regular background program processing daemon" },
      docker: { active: false, enabled: false, desc: "Docker Application Container Engine" },
    };
    this._buildUI();
    if (greeting) {
      this.print(`Welcome to the Linux Command Trainer simulator.
Type <span class="exec">help</span> to list supported commands. Tab completes, ↑/↓ browse history.\n`, true);
    }
    this._newPrompt();
  }

  /* ---------- UI ---------- */

  _buildUI() {
    this.out = document.createElement("div");
    this.body.append(this.out);
    this.inputRow = document.createElement("div");
    this.inputRow.className = "terminal-input-row";
    this.promptEl = document.createElement("span");
    this.input = document.createElement("input");
    this.input.className = "terminal-input";
    this.input.setAttribute("aria-label", "Terminal input");
    this.input.autocomplete = "off"; this.input.spellcheck = false;
    this.inputRow.append(this.promptEl, this.input);
    this.body.append(this.inputRow);
    this.body.addEventListener("click", () => this.input.focus());
    this.input.addEventListener("keydown", (e) => this._onKey(e));
  }

  promptHTML() {
    if (this.mode?.type === "editor") return `<span class="dim">editor&gt;</span> `;
    const path = this.cwd === HOME ? "~" : this.cwd.startsWith(HOME + "/") ? "~" + this.cwd.slice(HOME.length) : this.cwd;
    return `<span class="prompt">student@trainer</span>:<span class="path">${path}</span>$ `;
  }

  _newPrompt() {
    this.promptEl.innerHTML = this.promptHTML();
    this.input.value = "";
    this.input.focus({ preventScroll: true });
    this.body.scrollTop = this.body.scrollHeight;
  }

  print(text, isHTML = false) {
    const div = document.createElement("div");
    if (isHTML) div.innerHTML = text;
    else div.textContent = text;
    this.out.append(div);
    this.body.scrollTop = this.body.scrollHeight;
  }

  echoLine(cmdline) {
    this.print(this.promptHTML() + escapeHTML(cmdline), true);
  }

  _onKey(e) {
    if (e.key === "Enter") {
      const line = this.input.value;
      this.echoLine(line);
      this.input.value = "";
      this.handleLine(line);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this.histIndex < this.historyList.length - 1) this.histIndex++;
      this.input.value = this.historyList[this.historyList.length - 1 - this.histIndex] || "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this.histIndex > 0) { this.histIndex--; this.input.value = this.historyList[this.historyList.length - 1 - this.histIndex]; }
      else { this.histIndex = -1; this.input.value = ""; }
    } else if (e.key === "Tab") {
      e.preventDefault();
      this._complete();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault(); this.out.innerHTML = "";
    }
  }

  /* Tab completion: first word → command names; otherwise → paths. */
  _complete() {
    const val = this.input.value;
    const parts = val.split(/\s+/);
    const isFirst = parts.length <= 1;
    const frag = parts[parts.length - 1] || "";
    let options = [];
    if (isFirst) {
      options = Object.keys(COMMANDS).filter((c) => c.startsWith(frag));
    } else {
      const slash = frag.lastIndexOf("/");
      const dirPart = slash >= 0 ? frag.slice(0, slash + 1) : "";
      const base = slash >= 0 ? frag.slice(slash + 1) : frag;
      const dirNode = resolve(this.fs, normalize(dirPart || ".", this.cwd));
      if (dirNode?.type === "dir") {
        options = Object.keys(dirNode.children)
          .filter((n) => n.startsWith(base))
          .map((n) => dirPart + n + (dirNode.children[n].type === "dir" ? "/" : ""));
      }
    }
    if (options.length === 1) {
      parts[parts.length - 1] = options[0];
      this.input.value = parts.join(" ") + (options[0].endsWith("/") ? "" : " ");
    } else if (options.length > 1) {
      this.print(options.map((o) => o.replace(/\/$/, "")).join("  "));
    }
  }

  /* ---------- Shell execution ---------- */

  handleLine(rawLine) {
    // Editor (nano) mode intercepts input.
    if (this.mode?.type === "editor") { this._editorLine(rawLine); this._newPrompt(); return; }

    const line = rawLine.trim();
    if (line) { this.historyList.push(line); this.histIndex = -1; }
    if (line) this.run(line);
    this._newPrompt();
    if (line && this.onCommand) this.onCommand(line, this);
  }

  run(line) {
    // VAR=value assignment (no command)
    const assign = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (assign && !assign[2].includes(" ")) { this.env[assign[1]] = stripQuotes(assign[2]); return; }

    // Redirection: split off "> file" / ">> file" at the end.
    let redirect = null;
    const rmatch = line.match(/^(.*?)\s*(>>?)\s*(\S+)\s*$/);
    let pipeline = line;
    if (rmatch && !insideQuotes(line, line.lastIndexOf(rmatch[2]))) {
      pipeline = rmatch[1]; redirect = { append: rmatch[2] === ">>", target: rmatch[3] };
    }

    const stages = splitTop(pipeline, "|");
    let input = "";
    let output = "";
    for (const stage of stages) {
      const res = this.execOne(stage.trim(), input);
      if (res.err) { this.print(res.err, false); this._colorizeLast("err"); return; }
      if (res.clear) { this.out.innerHTML = ""; return; }
      input = res.out || "";
      output = input;
    }

    if (redirect) {
      const path = normalize(redirect.target, this.cwd);
      const { parent, name } = parentOf(this.fs, path);
      if (!parent || parent.type !== "dir") { this.print(`bash: ${redirect.target}: No such file or directory`); return; }
      const existing = parent.children[name];
      const text = output.endsWith("\n") || output === "" ? output : output + "\n";
      if (existing?.type === "file" && redirect.append) existing.content += text;
      else parent.children[name] = mkfile(text);
      return;
    }
    if (output) this.print(output.replace(/\n$/, ""));
  }

  _colorizeLast(cls) { this.out.lastElementChild?.classList.add(cls); }

  execOne(stage, input) {
    if (!stage) return { out: input };
    let args = tokenize(stage).map((t) => this._expand(t));
    let sudo = false;
    if (args[0] === "sudo") { sudo = true; args = args.slice(1); if (!args.length) return { out: "usage: sudo command" }; }
    const name = args[0];
    const fn = COMMANDS[name];
    if (!fn) return { err: `${name}: command not found\nType 'help' to see supported commands.` };
    try {
      return fn(this, args.slice(1), { input, sudo }) || { out: "" };
    } catch (e) {
      return { err: `${name}: ${e.message}` };
    }
  }

  _expand(token) {
    if (token.quoted === "single") return token.text;
    return token.text.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, v) => this.env[v] ?? "");
  }

  /* ---------- Editor (nano) ---------- */

  openEditor(path) {
    const abs = normalize(path, this.cwd);
    const node = resolve(this.fs, abs);
    const lines = node?.type === "file" ? node.content.replace(/\n$/, "").split("\n") : [];
    this.mode = { type: "editor", path: abs, lines: node?.type === "file" ? lines : [] };
    this.print(`GNU nano (simulated) — editing ${abs}`, false);
    if (node?.type === "file" && node.content) this.print(node.content.replace(/\n$/, ""));
    this.print(`— type lines to append · ':wq' save & exit · ':q!' discard & exit —`, false);
    this._colorizeLast("dim");
  }

  _editorLine(line) {
    if (line.trim() === ":wq") {
      const { parent, name } = parentOf(this.fs, this.mode.path);
      const content = this.mode.lines.length ? this.mode.lines.join("\n") + "\n" : "";
      if (parent?.type === "dir") parent.children[name] = mkfile(content);
      this.print(`[ Wrote ${this.mode.lines.length} lines to ${this.mode.path} ]`);
      this.mode = null;
    } else if (line.trim() === ":q!") {
      this.print("[ Discarded changes ]");
      this.mode = null;
    } else {
      this.mode.lines.push(line);
    }
  }

  /* Convenience for tests/challenges */
  node(path) { return resolve(this.fs, normalize(path, this.cwd)); }
}

/* ========================================================================
 * Parsing helpers
 * ====================================================================== */

function tokenize(line) {
  const tokens = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1] !== undefined) tokens.push({ text: m[1], quoted: "single" });
    else if (m[2] !== undefined) tokens.push({ text: m[2], quoted: "double" });
    else tokens.push({ text: m[3], quoted: null });
  }
  return tokens;
}

function splitTop(line, sep) {
  const parts = []; let cur = ""; let q = null;
  for (const ch of line) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === sep) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function insideQuotes(line, idx) {
  let q = null;
  for (let i = 0; i < idx; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; }
    else if (ch === "'" || ch === '"') q = ch;
  }
  return q !== null;
}

function stripQuotes(s) { return s.replace(/^['"]|['"]$/g, ""); }
function escapeHTML(s) { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

function flagsOf(args) {
  const flags = new Set(); const rest = [];
  for (const a of args) {
    if (/^-[A-Za-z]+$/.test(a)) for (const ch of a.slice(1)) flags.add(ch);
    else rest.push(a);
  }
  return { flags, rest };
}

/* ========================================================================
 * Command implementations
 * Each: (term, args, {input, sudo}) → { out } | { err } | { clear }
 * ====================================================================== */

const COMMANDS = {};
function cmd(names, fn) { for (const n of [].concat(names)) COMMANDS[n] = fn; }

/* ---- Session & help ---- */

cmd("help", () => ({ out:
`Supported commands (this is a simulator — a safe sandbox, not a real shell):

  Files       ls  cd  pwd  mkdir  rmdir  touch  cp  mv  rm  cat  head  tail  nano  tree  file
  Search/text grep  find  wc  sort  uniq  echo  history
  Permissions chmod  chown  whoami  id  sudo
  Processes   ps  top  kill  jobs  sleep
  System      df  du  free  uname  uptime  hostname  date  clear  env  export  which
  Network     ping  curl  wget  ip  ifconfig  ss
  Services    systemctl  service  journalctl
  Packages    apt  yum  dnf
  Archives    tar  zip  unzip
  Remote      ssh  man

Pipes (cmd | cmd), redirection (> and >>), $VARS, Tab completion and ↑ history all work.` }));

cmd("clear", () => ({ clear: true }));

cmd("history", (t, a) => {
  const n = a[0] ? parseInt(a[0], 10) : t.historyList.length;
  const items = t.historyList.slice(-n);
  const start = t.historyList.length - items.length + 1;
  return { out: items.map((c, i) => String(start + i).padStart(5) + "  " + c).join("\n") };
});

cmd("whoami", (t, a, { sudo }) => ({ out: sudo ? "root" : t.env.USER }));
cmd("id", (t) => ({ out: `uid=1000(${t.env.USER}) gid=1000(${t.env.USER}) groups=1000(${t.env.USER}),27(sudo)` }));
cmd("hostname", (t, a) => a[0] === "-I" ? { out: "192.168.1.42" } : { out: t.env.HOSTNAME });
cmd("date", () => ({ out: new Date().toString() }));
cmd("uname", (t, a) => {
  if (a.includes("-a")) return { out: "Linux trainer 6.8.0-40-generic #40-Ubuntu SMP x86_64 GNU/Linux" };
  if (a.includes("-r")) return { out: "6.8.0-40-generic" };
  if (a.includes("-m")) return { out: "x86_64" };
  return { out: "Linux" };
});
cmd("uptime", () => ({ out: ` ${new Date().toTimeString().slice(0, 8)} up 6 days,  2:11,  1 user,  load average: 0.21, 0.18, 0.12` }));
cmd("env", (t) => ({ out: Object.entries(t.env).map(([k, v]) => `${k}=${v}`).join("\n") }));
cmd("export", (t, a) => {
  if (!a.length) return { out: Object.entries(t.env).map(([k, v]) => `declare -x ${k}="${v}"`).join("\n") };
  const m = a.join(" ").match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!m) return { err: "export: usage: export NAME=value" };
  t.env[m[1]] = stripQuotes(m[2]);
  return { out: "" };
});
cmd("which", (t, a) => {
  if (!a[0]) return { err: "which: missing argument" };
  return COMMANDS[a[0]] ? { out: `/usr/bin/${a[0]}` } : { err: `which: no ${a[0]} in (${t.env.PATH})` };
});
cmd("man", (t, a) => a[0]
  ? { out: `Opening the manual for '${a[0]}'...\nIn this trainer, full documentation lives on the command pages —\nvisit Commands → ${a[0]} for syntax, examples and common mistakes.` }
  : { err: "What manual page do you want?\nFor example, try 'man ls'." });
cmd("sleep", (t, a) => a[0] ? { out: "" } : { err: "sleep: missing operand" });
cmd("ssh", (t, a) => a[0]
  ? { out: `ssh: connecting to ${a[0]}...\nThe authenticity of host '${a[0].split("@").pop()}' can't be established.\n(Simulated: remote sessions aren't available in the trainer, but the syntax was correct.)` }
  : { err: "usage: ssh [user@]hostname" });

/* ---- Navigation ---- */

cmd("pwd", (t) => ({ out: t.cwd }));

cmd("cd", (t, a) => {
  let target = a[0] || t.env.HOME;
  if (target === "-") { target = t._prevDir || t.env.HOME; }
  const abs = normalize(target, t.cwd);
  const node = resolve(t.fs, abs);
  if (!node) return { err: `cd: ${a[0]}: No such file or directory` };
  if (node.type !== "dir") return { err: `cd: ${a[0]}: Not a directory` };
  t._prevDir = t.cwd;
  t.cwd = abs;
  return { out: a[0] === "-" ? abs : "" };
});

cmd("ls", (t, a, { input }) => {
  const { flags, rest } = flagsOf(a);
  const path = rest[0] || ".";
  const abs = normalize(path, t.cwd);
  const node = resolve(t.fs, abs);
  if (!node) return { err: `ls: cannot access '${path}': No such file or directory` };
  if (node.type === "file") return { out: path };
  let names = Object.keys(node.children);
  if (!flags.has("a")) names = names.filter((n) => !n.startsWith("."));
  names.sort();
  if (flags.has("t")) names.reverse();
  if (flags.has("l")) {
    const rows = names.map((n) => {
      const c = node.children[n];
      const size = c.type === "file" ? c.content.length : 4096;
      return `${c.mode} 1 ${c.owner.padEnd(7)} ${c.owner.padEnd(7)} ${String(size).padStart(6)} Aug  5 11:00 ${n}${c.type === "dir" ? "/" : ""}`;
    });
    if (flags.has("a")) rows.unshift(`drwxr-xr-x 1 ${node.owner.padEnd(7)} ${node.owner.padEnd(7)}   4096 Aug  5 11:00 .`, `drwxr-xr-x 1 root    root      4096 Aug  5 11:00 ..`);
    return { out: rows.join("\n") };
  }
  return { out: names.map((n) => n + (node.children[n].type === "dir" ? "/" : "")).join("  ") };
});

cmd("tree", (t, a) => {
  const path = a.filter((x) => !x.startsWith("-"))[0] || ".";
  const abs = normalize(path, t.cwd);
  const node = resolve(t.fs, abs);
  if (!node || node.type !== "dir") return { err: `tree: '${path}': No such directory` };
  const lines = [path];
  const rec = (n, prefix) => {
    const entries = Object.entries(n.children).filter(([k]) => !k.startsWith("."));
    entries.forEach(([name, child], i) => {
      const last = i === entries.length - 1;
      lines.push(prefix + (last ? "└── " : "├── ") + name);
      if (child.type === "dir") rec(child, prefix + (last ? "    " : "│   "));
    });
  };
  rec(node, "");
  return { out: lines.join("\n") };
});

/* ---- File management ---- */

cmd("mkdir", (t, a) => {
  const { flags, rest } = flagsOf(a);
  if (!rest.length) return { err: "mkdir: missing operand" };
  for (const path of rest) {
    const abs = normalize(path, t.cwd);
    if (flags.has("p")) {
      let cur = t.fs, curPath = "";
      for (const seg of abs.split("/").filter(Boolean)) {
        curPath += "/" + seg;
        if (!cur.children[seg]) cur.children[seg] = mkdirNode();
        cur = cur.children[seg];
        if (cur.type !== "dir") return { err: `mkdir: cannot create directory '${path}': Not a directory` };
      }
    } else {
      const { parent, name } = parentOf(t.fs, abs);
      if (!parent || parent.type !== "dir") return { err: `mkdir: cannot create directory '${path}': No such file or directory` };
      if (parent.children[name]) return { err: `mkdir: cannot create directory '${path}': File exists` };
      parent.children[name] = mkdirNode();
    }
  }
  return { out: "" };
});

cmd("rmdir", (t, a) => {
  const path = a.filter((x) => !x.startsWith("-"))[0];
  if (!path) return { err: "rmdir: missing operand" };
  const abs = normalize(path, t.cwd);
  const node = resolve(t.fs, abs);
  if (!node) return { err: `rmdir: failed to remove '${path}': No such file or directory` };
  if (node.type !== "dir") return { err: `rmdir: failed to remove '${path}': Not a directory` };
  if (Object.keys(node.children).length) return { err: `rmdir: failed to remove '${path}': Directory not empty` };
  const { parent, name } = parentOf(t.fs, abs);
  delete parent.children[name];
  return { out: "" };
});

cmd("touch", (t, a) => {
  const { rest } = flagsOf(a);
  if (!rest.length) return { err: "touch: missing file operand" };
  for (const path of rest) {
    const abs = normalize(path, t.cwd);
    const { parent, name } = parentOf(t.fs, abs);
    if (!parent || parent.type !== "dir") return { err: `touch: cannot touch '${path}': No such file or directory` };
    if (!parent.children[name]) parent.children[name] = mkfile("");
  }
  return { out: "" };
});

cmd("cat", (t, a, { input }) => {
  const { flags, rest } = flagsOf(a);
  if (!rest.length) return { out: input };
  let out = "";
  for (const path of rest) {
    const node = t.node(path);
    if (!node) return { err: `cat: ${path}: No such file or directory` };
    if (node.type === "dir") return { err: `cat: ${path}: Is a directory` };
    out += node.content;
  }
  if (flags.has("n")) out = out.replace(/\n$/, "").split("\n").map((l, i) => String(i + 1).padStart(6) + "\t" + l).join("\n") + "\n";
  return { out };
});

cmd("head", (t, a, { input }) => sliceLines(t, a, input, "head"));
cmd("tail", (t, a, { input }) => sliceLines(t, a, input, "tail"));
function sliceLines(t, args, input, which) {
  let n = 10; const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n") { n = parseInt(args[++i], 10); }
    else if (/^-\d+$/.test(args[i])) n = parseInt(args[i].slice(1), 10);
    else if (args[i] === "-f") { /* follow: acknowledged below */ }
    else rest.push(args[i]);
  }
  let text = input;
  if (rest[0]) {
    const node = t.node(rest[0]);
    if (!node) return { err: `${which}: cannot open '${rest[0]}' for reading: No such file or directory` };
    if (node.type === "dir") return { err: `${which}: error reading '${rest[0]}': Is a directory` };
    text = node.content;
  }
  const lines = text.replace(/\n$/, "").split("\n");
  const picked = which === "head" ? lines.slice(0, n) : lines.slice(-n);
  const follow = args.includes("-f") ? "\n(-f follow mode is simulated: no new lines will arrive in the sandbox)" : "";
  return { out: picked.join("\n") + follow };
}

cmd("cp", (t, a) => {
  const { flags, rest } = flagsOf(a);
  if (rest.length < 2) return { err: "cp: missing destination file operand" };
  const src = t.node(rest[0]);
  if (!src) return { err: `cp: cannot stat '${rest[0]}': No such file or directory` };
  if (src.type === "dir" && !flags.has("r") && !flags.has("R") && !flags.has("a")) return { err: `cp: -r not specified; omitting directory '${rest[0]}'` };
  const destAbs = normalize(rest[1], t.cwd);
  const destNode = resolve(t.fs, destAbs);
  if (destNode?.type === "dir") {
    const base = normalize(rest[0], t.cwd).split("/").pop();
    destNode.children[base] = cloneNode(src);
  } else {
    const { parent, name } = parentOf(t.fs, destAbs);
    if (!parent || parent.type !== "dir") return { err: `cp: cannot create '${rest[1]}': No such file or directory` };
    parent.children[name] = cloneNode(src);
  }
  return { out: flags.has("v") ? `'${rest[0]}' -> '${rest[1]}'` : "" };
});

cmd("mv", (t, a) => {
  const { flags, rest } = flagsOf(a);
  if (rest.length < 2) return { err: "mv: missing destination file operand" };
  const srcAbs = normalize(rest[0], t.cwd);
  const src = resolve(t.fs, srcAbs);
  if (!src) return { err: `mv: cannot stat '${rest[0]}': No such file or directory` };
  const destAbs = normalize(rest[1], t.cwd);
  const destNode = resolve(t.fs, destAbs);
  const { parent: sp, name: sn } = parentOf(t.fs, srcAbs);
  if (destNode?.type === "dir") {
    destNode.children[sn] = src;
  } else {
    const { parent, name } = parentOf(t.fs, destAbs);
    if (!parent || parent.type !== "dir") return { err: `mv: cannot move '${rest[0]}': No such file or directory` };
    parent.children[name] = src;
  }
  delete sp.children[sn];
  return { out: flags.has("v") ? `renamed '${rest[0]}' -> '${rest[1]}'` : "" };
});

cmd("rm", (t, a) => {
  const { flags, rest } = flagsOf(a);
  if (!rest.length) return { err: "rm: missing operand" };
  for (const path of rest) {
    const abs = normalize(path, t.cwd);
    if (abs === "/") return { err: "rm: refusing to remove '/' — and outside this sandbox, that mistake ends careers." };
    const node = resolve(t.fs, abs);
    if (!node) {
      if (flags.has("f")) continue;
      return { err: `rm: cannot remove '${path}': No such file or directory` };
    }
    if (node.type === "dir" && !flags.has("r") && !flags.has("R")) return { err: `rm: cannot remove '${path}': Is a directory` };
    const { parent, name } = parentOf(t.fs, abs);
    delete parent.children[name];
  }
  return { out: "" };
});

cmd("file", (t, a) => {
  if (!a[0]) return { err: "Usage: file FILE" };
  const node = t.node(a[0]);
  if (!node) return { err: `file: cannot open '${a[0]}': No such file` };
  if (node.type === "dir") return { out: `${a[0]}: directory` };
  if (node.content.startsWith("TARBALL:")) return { out: `${a[0]}: gzip compressed data, from Unix` };
  if (node.content.startsWith("ZIPFILE:")) return { out: `${a[0]}: Zip archive data` };
  if (node.content.startsWith("#!")) return { out: `${a[0]}: Bourne-Again shell script, ASCII text executable` };
  return { out: `${a[0]}: ASCII text` };
});

cmd("nano", (t, a) => {
  if (!a[0]) return { err: "nano: no file name given (usage: nano FILE)" };
  const abs = normalize(a[0], t.cwd);
  const { parent } = parentOf(t.fs, abs);
  if (!parent || parent.type !== "dir") return { err: `nano: ${a[0]}: No such directory` };
  t.openEditor(a[0]);
  return { out: "" };
});

cmd("echo", (t, a) => {
  const noNewline = a[0] === "-n";
  const text = (noNewline ? a.slice(1) : a).join(" ");
  return { out: text + (noNewline ? "" : "\n") };
});

/* ---- Search & text ---- */

cmd("grep", (t, a, { input }) => {
  const { flags, rest } = flagsOf(a);
  if (!rest.length) return { err: "Usage: grep [options] PATTERN [FILE]" };
  const pattern = rest[0];
  let text = input, label = "";
  if (rest[1]) {
    const node = t.node(rest[1]);
    if (!node) return { err: `grep: ${rest[1]}: No such file or directory` };
    if (node.type === "dir" && !flags.has("r")) return { err: `grep: ${rest[1]}: Is a directory` };
    if (node.type === "dir") {
      const hits = [];
      walk(node, normalize(rest[1], t.cwd), (n, p) => {
        if (n.type === "file") n.content.replace(/\n$/, "").split("\n").forEach((l, i) => {
          if (match(l)) hits.push(`${p}:${flags.has("n") ? i + 1 + ":" : ""}${l}`);
        });
      });
      return { out: hits.join("\n") };
    }
    text = node.content;
  }
  function match(line) {
    try {
      const re = new RegExp(pattern, flags.has("i") ? "i" : "");
      const hit = re.test(line);
      return flags.has("v") ? !hit : hit;
    } catch { const hit = line.includes(pattern); return flags.has("v") ? !hit : hit; }
  }
  const lines = text.replace(/\n$/, "").split("\n").map((l, i) => ({ l, i })).filter(({ l }) => match(l));
  if (flags.has("c")) return { out: String(lines.length) };
  return { out: lines.map(({ l, i }) => (flags.has("n") ? i + 1 + ":" : "") + l).join("\n") };
});

cmd("find", (t, a) => {
  const startPath = a[0] && !a[0].startsWith("-") ? a[0] : ".";
  const startAbs = normalize(startPath, t.cwd);
  const startNode = resolve(t.fs, startAbs);
  if (!startNode) return { err: `find: '${startPath}': No such file or directory` };
  let namePat = null, typeF = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "-name" || a[i] === "-iname") namePat = a[++i];
    if (a[i] === "-type") typeF = a[++i];
  }
  const re = namePat ? new RegExp("^" + namePat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i") : null;
  const hits = [];
  walk(startNode, startPath === "." ? "." : startAbs, (n, p) => {
    if (typeF === "f" && n.type !== "file") return;
    if (typeF === "d" && n.type !== "dir") return;
    const base = p.split("/").pop() || p;
    if (re && !re.test(base)) return;
    hits.push(p);
  });
  return { out: hits.join("\n") };
});

cmd("wc", (t, a, { input }) => {
  const { flags, rest } = flagsOf(a);
  let text = input, label = "";
  if (rest[0]) {
    const node = t.node(rest[0]);
    if (!node || node.type !== "file") return { err: `wc: ${rest[0]}: No such file or directory` };
    text = node.content; label = " " + rest[0];
  }
  const lines = text ? text.replace(/\n$/, "").split("\n").length : 0;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const bytes = text.length;
  if (flags.has("l")) return { out: lines + label };
  if (flags.has("w")) return { out: words + label };
  if (flags.has("c")) return { out: bytes + label };
  return { out: `${String(lines).padStart(4)} ${String(words).padStart(4)} ${String(bytes).padStart(5)}${label}` };
});

cmd("sort", (t, a, { input }) => {
  const { flags, rest } = flagsOf(a);
  let text = input;
  if (rest[0]) {
    const node = t.node(rest[0]);
    if (!node || node.type !== "file") return { err: `sort: cannot read: ${rest[0]}` };
    text = node.content;
  }
  let lines = text.replace(/\n$/, "").split("\n");
  lines.sort(flags.has("n") ? (x, y) => parseFloat(x) - parseFloat(y) : undefined);
  if (flags.has("r")) lines.reverse();
  if (flags.has("u")) lines = [...new Set(lines)];
  return { out: lines.join("\n") };
});

cmd("uniq", (t, a, { input }) => {
  const { flags } = flagsOf(a);
  const lines = input.replace(/\n$/, "").split("\n");
  const out = []; let prev = null, count = 0;
  const flush = () => { if (prev !== null) out.push(flags.has("c") ? String(count).padStart(7) + " " + prev : prev); };
  for (const l of lines) {
    if (l === prev) count++;
    else { flush(); prev = l; count = 1; }
  }
  flush();
  return { out: out.join("\n") };
});

/* ---- Permissions ---- */

cmd("chmod", (t, a) => {
  const { rest } = flagsOf(a);
  if (rest.length < 2) return { err: "chmod: missing operand" };
  const [mode, path] = rest;
  const node = t.node(path);
  if (!node) return { err: `chmod: cannot access '${path}': No such file or directory` };
  const type = node.type === "dir" ? "d" : "-";
  if (/^[0-7]{3,4}$/.test(mode)) {
    const oct = mode.slice(-3);
    const trip = (d) => (d & 4 ? "r" : "-") + (d & 2 ? "w" : "-") + (d & 1 ? "x" : "-");
    node.mode = type + [...oct].map((d) => trip(parseInt(d, 8))).join("");
    return { out: "" };
  }
  if (/^[ugoa]*[+-=][rwx]+$/.test(mode)) {
    // Simplified symbolic handling: apply to all three triplets.
    let bits = node.mode.slice(1).split("");
    const op = mode.match(/[+-=]/)[0];
    const perms = mode.split(/[+-=]/)[1];
    const positions = { r: [0, 3, 6], w: [1, 4, 7], x: [2, 5, 8] };
    for (const p of perms) for (const pos of positions[p]) bits[pos] = op === "-" ? "-" : p;
    node.mode = type + bits.join("");
    return { out: "" };
  }
  return { err: `chmod: invalid mode: '${mode}'` };
});

cmd("chown", (t, a, { sudo }) => {
  const { rest } = flagsOf(a);
  if (rest.length < 2) return { err: "chown: missing operand" };
  if (!sudo) return { err: "chown: changing ownership: Operation not permitted (try sudo)" };
  const node = t.node(rest[1]);
  if (!node) return { err: `chown: cannot access '${rest[1]}': No such file or directory` };
  node.owner = rest[0].split(":")[0];
  return { out: "" };
});

/* ---- Processes ---- */

const PROCS = [
  ["root", 1, 0.0, 0.1, "/sbin/init"],
  ["root", 610, 0.0, 0.3, "sshd: /usr/sbin/sshd -D"],
  ["root", 812, 0.0, 0.2, "nginx: master process"],
  ["www-data", 813, 0.1, 0.2, "nginx: worker process"],
  ["root", 901, 0.0, 0.1, "/usr/sbin/cron -f"],
  ["student", 1450, 1.8, 2.4, "node server.js"],
  ["student", 1502, 0.0, 0.1, "-bash"],
];

cmd("ps", (t, a) => {
  const rows = PROCS.concat(t._userProcs || []);
  const header = "USER       PID %CPU %MEM COMMAND";
  return { out: [header, ...rows.map(([u, p, c, m, cmd]) =>
    `${u.padEnd(9)}${String(p).padStart(5)} ${c.toFixed(1).padStart(4)} ${m.toFixed(1).padStart(4)} ${cmd}`)].join("\n") };
});

cmd("top", (t) => ({ out:
`top - ${new Date().toTimeString().slice(0, 8)} up 6 days,  2:11,  1 user,  load average: 0.21, 0.18, 0.12
Tasks:  ${PROCS.length + 92} total,   1 running, ${PROCS.length + 91} sleeping
%Cpu(s):  2.4 us,  0.8 sy,  0.0 ni, 96.5 id
MiB Mem :   7823.4 total,   1174.2 free,   2903.1 used,   3746.1 buff/cache

  PID USER      %CPU %MEM COMMAND
 1450 student    1.8  2.4 node server.js
  813 www-data   0.1  0.2 nginx: worker
    1 root       0.0  0.1 init
(top is interactive on a real system — press q there to quit)` }));

cmd("kill", (t, a) => {
  const pid = a.filter((x) => !x.startsWith("-")).map(Number)[0];
  if (!pid) return { err: "kill: usage: kill [-9] pid" };
  const known = PROCS.some(([, p]) => p === pid);
  if (!known) return { err: `kill: (${pid}) - No such process` };
  if (pid === 1) return { err: "kill: (1) - Operation not permitted" };
  return { out: a.includes("-9")
    ? `Process ${pid} killed with SIGKILL (no chance to clean up — prefer plain kill first).`
    : `Sent SIGTERM to process ${pid}. It can now shut down cleanly.` };
});

cmd("jobs", (t) => ({ out: t._jobs?.length ? t._jobs.map((j, i) => `[${i + 1}]+  Running   ${j} &`).join("\n") : "" }));

/* ---- Disk & memory ---- */

cmd("df", (t, a) => {
  const h = a.includes("-h");
  return { out: h
    ? `Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda2        98G   41G   52G  45% /\ntmpfs           3.9G     0  3.9G   0% /dev/shm`
    : `Filesystem     1K-blocks     Used Available Use% Mounted on\n/dev/sda2      102687672 42990412  54437828  45% /` };
});

cmd("du", (t, a) => {
  const { flags, rest } = flagsOf(a);
  const path = rest[0] || ".";
  const node = t.node(path);
  if (!node) return { err: `du: cannot access '${path}': No such file or directory` };
  const human = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + "M" : b > 1024 ? (b / 1024).toFixed(1) + "K" : b + "";
  const size = sizeOf(node);
  if (flags.has("s")) return { out: `${flags.has("h") ? human(size) : Math.ceil(size / 1024)}\t${path}` };
  const lines = [];
  walk(node, path, (n, p) => { if (n.type === "dir") lines.push(`${flags.has("h") ? human(sizeOf(n)) : Math.ceil(sizeOf(n) / 1024)}\t${p}`); });
  return { out: lines.reverse().join("\n") };
});

cmd("free", (t, a) => a.includes("-h")
  ? { out: `               total        used        free      shared  buff/cache   available\nMem:           7.6Gi       2.8Gi       1.1Gi       180Mi       3.7Gi       4.4Gi\nSwap:          2.0Gi          0B       2.0Gi` }
  : { out: `               total        used        free      shared  buff/cache   available\nMem:         8011168     2972904     1202444      184320     3835820     4612340\nSwap:        2097148           0     2097148` });

/* ---- Network ---- */

cmd("ping", (t, a) => {
  const host = a.filter((x) => !x.startsWith("-")).pop();
  if (!host) return { err: "ping: usage error: Destination address required" };
  let count = 4;
  const ci = a.indexOf("-c");
  if (ci >= 0) count = Math.min(parseInt(a[ci + 1], 10) || 4, 10);
  const ip = host === "localhost" ? "127.0.0.1" : "93.184.215.14";
  const lines = [`PING ${host} (${ip}) 56(84) bytes of data.`];
  const times = [];
  for (let i = 1; i <= count; i++) {
    const ms = (10 + Math.random() * 8).toFixed(1);
    times.push(parseFloat(ms));
    lines.push(`64 bytes from ${ip}: icmp_seq=${i} ttl=56 time=${ms} ms`);
  }
  lines.push(`\n--- ${host} ping statistics ---`);
  lines.push(`${count} packets transmitted, ${count} received, 0% packet loss`);
  lines.push(`rtt min/avg/max = ${Math.min(...times)}/${(times.reduce((s, x) => s + x, 0) / count).toFixed(1)}/${Math.max(...times)} ms`);
  return { out: lines.join("\n") };
});

cmd("curl", (t, a) => {
  const url = a.filter((x) => !x.startsWith("-")).pop();
  if (!url) return { err: "curl: try 'curl URL'" };
  if (a.includes("-I")) return { out: `HTTP/2 200\ncontent-type: text/html; charset=UTF-8\ncontent-length: 1256\nserver: ECS (sab/56BD)` };
  return { out: `<!doctype html>\n<html>\n<head><title>Example Domain</title></head>\n<body><h1>Example Domain</h1>\n<p>This domain is for use in illustrative examples.</p></body>\n</html>` };
});

cmd("wget", (t, a) => {
  const url = a.filter((x) => !x.startsWith("-")).pop();
  if (!url) return { err: "wget: missing URL" };
  const name = url.split("/").pop() || "index.html";
  const cur = resolve(t.fs, t.cwd);
  cur.children[name] = mkfile(`(simulated download from ${url})\n`);
  return { out: `--${new Date().toISOString()}--  ${url}\nResolving host... 93.184.215.14\nHTTP request sent, awaiting response... 200 OK\nSaving to: '${name}'\n\n${name}   100%[==================>]  14.2K  --.-KB/s    in 0.01s\n\n'${name}' saved` };
});

cmd("ip", (t, a) => {
  const sub = a[0] || "";
  if (sub.startsWith("r")) return { out: `default via 192.168.1.1 dev eth0 proto dhcp metric 100\n192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.42` };
  if (sub.startsWith("a") || sub === "") return { out:
`1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN
    inet 127.0.0.1/8 scope host lo
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP
    inet 192.168.1.42/24 brd 192.168.1.255 scope global dynamic eth0` };
  if (sub.startsWith("l")) return { out: `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500` };
  return { err: `ip: unknown object "${sub}" (try: ip addr, ip route, ip link)` };
});
cmd("ifconfig", () => ({ out:
`eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.168.1.42  netmask 255.255.255.0  broadcast 192.168.1.255
        RX packets 184220  bytes 212045133 (212.0 MB)
        TX packets 90211   bytes 12981222 (12.9 MB)

lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0` }));

cmd("ss", (t, a) => ({ out:
`Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process
tcp   LISTEN 0      511          0.0.0.0:80         0.0.0.0:*     users:(("nginx",pid=812,fd=6))
tcp   LISTEN 0      128          0.0.0.0:22         0.0.0.0:*     users:(("sshd",pid=610,fd=3))
tcp   ESTAB  0      0       192.168.1.42:22    192.168.1.20:51824 users:(("sshd",pid=912,fd=4))` }));

/* ---- Services ---- */

cmd("systemctl", (t, a, { sudo }) => {
  const [action, unitArg] = a.filter((x) => !x.startsWith("--"));
  const unit = unitArg?.replace(/\.service$/, "");
  const now = a.includes("--now");
  if (!action || action === "list-units") {
    return { out: Object.entries(t.services).map(([n, s]) =>
      `${(n + ".service").padEnd(18)} loaded ${s.active ? "active   running" : "inactive dead   "} ${s.desc}`).join("\n") };
  }
  if (!unit || !t.services[unit]) return { err: `Unit ${unitArg || "?"}.service could not be found.` };
  const svc = t.services[unit];
  const needRoot = ["start", "stop", "restart", "enable", "disable"].includes(action);
  if (needRoot && !sudo) return { err: `Failed to ${action} ${unit}.service: Access denied (try sudo)` };
  switch (action) {
    case "status":
      return { out:
`● ${unit}.service - ${svc.desc}
     Loaded: loaded (/lib/systemd/system/${unit}.service; ${svc.enabled ? "enabled" : "disabled"})
     Active: ${svc.active ? "active (running)" : "inactive (dead)"} since Tue 2026-08-04 09:00:12 AEST
   Main PID: ${svc.active ? 812 : "n/a"}` };
    case "start": svc.active = true; return { out: "" };
    case "stop": svc.active = false; return { out: "" };
    case "restart": svc.active = true; return { out: "" };
    case "enable": svc.enabled = true; if (now) svc.active = true;
      return { out: `Created symlink /etc/systemd/system/multi-user.target.wants/${unit}.service → /lib/systemd/system/${unit}.service.` };
    case "disable": svc.enabled = false; return { out: `Removed "/etc/systemd/system/multi-user.target.wants/${unit}.service".` };
    case "is-enabled": return { out: svc.enabled ? "enabled" : "disabled" };
    case "is-active": return { out: svc.active ? "active" : "inactive" };
    default: return { err: `Unknown command verb '${action}'.` };
  }
});

cmd("service", (t, a, ctx) => {
  if (a.length < 2) return { err: "Usage: service NAME {start|stop|restart|status}" };
  return COMMANDS.systemctl(t, [a[1], a[0]], ctx);
});

cmd("journalctl", (t, a) => {
  const ui = a.indexOf("-u");
  const unit = ui >= 0 ? a[ui + 1]?.replace(/\.service$/, "") : null;
  const entries = {
    nginx: `Aug 05 09:00:12 trainer systemd[1]: Started A high performance web server.\nAug 05 09:00:12 trainer nginx[812]: nginx: configuration ok\nAug 05 10:41:03 trainer nginx[813]: 192.168.1.20 - GET / HTTP/2 200`,
    ssh: `Aug 05 09:14:11 trainer sshd[912]: Accepted publickey for student from 192.168.1.20\nAug 05 08:01:32 trainer sshd[877]: Failed password for invalid user admin from 203.0.113.99`,
    cron: `Aug 05 09:00:01 trainer CRON[1201]: (root) CMD (logrotate)`,
  };
  if (unit) return entries[unit] ? { out: entries[unit] } : { err: `-- No entries for unit ${unit} --` };
  return { out: Object.values(entries).join("\n") };
});

/* ---- Packages ---- */

function pkgManager(nameShown) {
  return (t, a, { sudo }) => {
    const action = a[0]; const pkg = a.filter((x) => !x.startsWith("-"))[1];
    t._pkgs = t._pkgs || new Set(["bash", "coreutils", "nano", "curl"]);
    if (action === "update" || action === "check-update")
      return sudo ? { out: `Reading package lists... Done\nAll package indexes are up to date.` } : { err: `${nameShown}: Permission denied — package operations need sudo` };
    if (action === "search") return { out: `htop/stable 3.3.0 amd64\n  interactive process viewer\ntree/stable 2.1.1 amd64\n  displays an indented directory tree` };
    if (action === "list") return { out: [...t._pkgs].sort().map((p) => p + "/stable [installed]").join("\n") };
    if (action === "install") {
      if (!pkg) return { err: `${nameShown} install: missing package name` };
      if (!sudo) return { err: `E: Could not open lock file - open (13: Permission denied)\nTry: sudo ${nameShown} install ${pkg}` };
      t._pkgs.add(pkg);
      return { out: `Reading package lists... Done\nThe following NEW packages will be installed:\n  ${pkg}\nSetting up ${pkg} ...\nDone.` };
    }
    if (action === "remove" || action === "purge") {
      if (!sudo) return { err: `E: Permission denied — try sudo` };
      t._pkgs.delete(pkg);
      return { out: `Removing ${pkg} ...\nDone.` };
    }
    return { err: `${nameShown}: unknown or missing command (try: update, install PKG, remove PKG, search TERM)` };
  };
}
cmd("apt", pkgManager("apt"));
cmd("yum", pkgManager("yum"));
cmd("dnf", pkgManager("dnf"));

/* ---- Archives ---- */

cmd("tar", (t, a) => {
  const flags = (a[0] || "").replace(/^-/, "");
  const archive = a[1]; const target = a[2];
  if (!flags.includes("f") || !archive) return { err: "tar: refusing to read/write archive without -f FILE (try: tar czf out.tar.gz DIR  |  tar xzf out.tar.gz)" };
  if (flags.includes("c")) {
    if (!target) return { err: "tar: Cowardly refusing to create an empty archive" };
    const srcAbs = normalize(target, t.cwd);
    const src = resolve(t.fs, srcAbs);
    if (!src) return { err: `tar: ${target}: Cannot stat: No such file or directory` };
    const { parent, name } = parentOf(t.fs, normalize(archive, t.cwd));
    parent.children[name] = mkfile("TARBALL:" + JSON.stringify({ name: srcAbs.split("/").pop(), node: cloneNode(src) }));
    return { out: flags.includes("v") ? listPaths(src, target).join("\n") : "" };
  }
  const node = t.node(archive);
  if (!node || node.type !== "file" || !node.content.startsWith("TARBALL:")) return { err: `tar: ${archive}: not a tar archive (create one with tar czf)` };
  const payload = JSON.parse(node.content.slice(8));
  if (flags.includes("t")) return { out: listPaths(payload.node, payload.name).join("\n") };
  if (flags.includes("x")) {
    let destDir = resolve(t.fs, t.cwd);
    const ci = a.indexOf("-C");
    if (ci >= 0) {
      destDir = t.node(a[ci + 1]);
      if (!destDir || destDir.type !== "dir") return { err: `tar: ${a[ci + 1]}: Cannot chdir: No such file or directory` };
    }
    destDir.children[payload.name] = cloneNode(payload.node);
    return { out: flags.includes("v") ? listPaths(payload.node, payload.name).join("\n") : "" };
  }
  return { err: "tar: specify one of -c (create), -x (extract), -t (list)" };
});

function listPaths(node, base) {
  const out = [];
  walk(node, base, (n, p) => out.push(p + (n.type === "dir" ? "/" : "")));
  return out;
}

cmd("zip", (t, a) => {
  const { flags, rest } = flagsOf(a);
  const [archive, target] = rest;
  if (!archive || !target) return { err: "zip: usage: zip [-r] archive.zip files" };
  const src = t.node(target);
  if (!src) return { err: `zip: nothing to do (${target} not found)` };
  if (src.type === "dir" && !flags.has("r")) return { err: `zip warning: ${target} is a directory — use -r to include its contents` };
  const { parent, name } = parentOf(t.fs, normalize(archive, t.cwd));
  parent.children[name] = mkfile("ZIPFILE:" + JSON.stringify({ name: normalize(target, t.cwd).split("/").pop(), node: cloneNode(src) }));
  return { out: `  adding: ${target} (deflated 61%)` };
});

cmd("unzip", (t, a) => {
  const { rest } = flagsOf(a);
  const archive = rest[0];
  if (!archive) return { err: "unzip: usage: unzip archive.zip [-d DIR]" };
  const node = t.node(archive);
  if (!node || !node.content.startsWith("ZIPFILE:")) return { err: `unzip: cannot find or open ${archive} (create one with zip -r)` };
  const payload = JSON.parse(node.content.slice(8));
  if (a.includes("-l")) return { out: "Archive:  " + archive + "\n" + listPaths(payload.node, payload.name).join("\n") };
  let dest = resolve(t.fs, t.cwd);
  const di = a.indexOf("-d");
  if (di >= 0) {
    const destPath = a[di + 1];
    dest = t.node(destPath);
    if (!dest || dest.type !== "dir") return { err: `unzip: cannot create extraction directory ${destPath}` };
  }
  dest.children[payload.name] = cloneNode(payload.node);
  return { out: `Archive:  ${archive}\n  inflating: ${payload.name}` };
});
