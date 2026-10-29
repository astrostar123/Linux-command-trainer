/* vfs.js - an in-memory Unix-like filesystem for the simulator ------------ */

function dir(children = {}, mode = "drwxr-xr-x", owner = "root") {
  return { type: "dir", children, mode, owner };
}
function file(content = "", mode = "-rw-r--r--", owner = "root") {
  return { type: "file", content, mode, owner };
}

/* Seed filesystem: a believable little Ubuntu-ish world. */
export function createFS() {
  return dir({
    home: dir({
      student: dir({
        "notes.txt": file("Remember: ls -la shows hidden files.\nPractice tar tomorrow.\n", "-rw-r--r--", "student"),
        "todo.md": file("# TODO\n- finish the permissions lesson\n- back up projects/\n", "-rw-r--r--", "student"),
        projects: dir({
          website: dir({
            "index.html": file("<!doctype html>\n<title>My site</title>\n<h1>Hello</h1>\n", "-rw-r--r--", "student"),
            "style.css": file("body { font-family: sans-serif; }\n", "-rw-r--r--", "student"),
          }, "drwxr-xr-x", "student"),
          "backup.sh": file("#!/bin/bash\ntar czf backup.tar.gz ~/projects/website\n", "-rwxr-xr-x", "student"),
        }, "drwxr-xr-x", "student"),
        ".bashrc": file("alias ll='ls -la'\nexport EDITOR=nano\n", "-rw-r--r--", "student"),
        ".ssh": dir({}, "drwx------", "student"),
      }, "drwxr-x---", "student"),
    }),
    etc: dir({
      hostname: file("trainer\n"),
      hosts: file("127.0.0.1 localhost\n127.0.1.1 trainer\n"),
      "os-release": file('NAME="Ubuntu"\nVERSION="24.04.2 LTS (Noble Numbat)"\nPRETTY_NAME="Ubuntu 24.04.2 LTS"\n'),
      passwd: file("root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nstudent:x:1000:1000:Student:/home/student:/bin/bash\n"),
      fstab: file("UUID=3f1c9a2e-8b1d-4f6a-9c3e-2d7b1a5e8f01 / ext4 defaults 0 1\n"),
      ssh: dir({ sshd_config: file("Port 22\nPermitRootLogin no\nPasswordAuthentication yes\n") }),
    }),
    var: dir({
      log: dir({
        syslog: file(
          "Aug  5 09:00:01 trainer CRON[1201]: (root) CMD (logrotate)\n" +
          "Aug  5 09:12:44 trainer kernel: usb 1-3: new high-speed USB device\n" +
          "Aug  5 09:14:11 trainer sshd[912]: Accepted publickey for student from 192.168.1.20\n" +
          "Aug  5 10:02:17 trainer app[1450]: ERROR database connection timed out\n" +
          "Aug  5 10:02:19 trainer app[1450]: retrying connection\n" +
          "Aug  5 10:02:21 trainer app[1450]: connected\n"),
        "auth.log": file("Aug  5 09:14:11 trainer sshd[912]: Accepted publickey for student\nAug  5 08:01:32 trainer sshd[877]: Failed password for invalid user admin from 203.0.113.99\n"),
      }),
      www: dir({ html: dir({ "index.html": file("<h1>It works!</h1>\n") }) }),
    }),
    tmp: dir({}, "drwxrwxrwx"),
    usr: dir({ bin: dir({}), share: dir({}) }),
    root: dir({}, "drwx------", "root"),
    mnt: dir({}),
    opt: dir({}),
  });
}

/* ---- Path helpers ------------------------------------------------------- */

export function normalize(path, cwd, home = "/home/student") {
  if (!path) return cwd;
  if (path === "~") path = home;
  else if (path.startsWith("~/")) path = home + path.slice(1);
  const abs = path.startsWith("/") ? path : cwd.replace(/\/$/, "") + "/" + path;
  const parts = [];
  for (const seg of abs.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return "/" + parts.join("/");
}

export function resolve(fs, path) {
  if (path === "/") return fs;
  let node = fs;
  for (const seg of path.split("/").filter(Boolean)) {
    if (!node || node.type !== "dir" || !(seg in node.children)) return null;
    node = node.children[seg];
  }
  return node;
}

export function parentOf(fs, path) {
  const clean = path.replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  const parentPath = idx <= 0 ? "/" : clean.slice(0, idx);
  const name = clean.slice(idx + 1);
  return { parent: resolve(fs, parentPath), parentPath, name };
}

export function mkfile(content, owner = "student") { return file(content, "-rw-r--r--", owner); }
export function mkdirNode(owner = "student") { return dir({}, "drwxr-xr-x", owner); }

/* Deep-clone a node (for cp -r). */
export function cloneNode(node) {
  if (node.type === "file") return { ...node };
  const children = {};
  for (const [k, v] of Object.entries(node.children)) children[k] = cloneNode(v);
  return { ...node, children };
}

/* Recursive listing helper for find/du/tree. */
export function walk(node, path, cb) {
  cb(node, path);
  if (node.type === "dir") {
    for (const [name, child] of Object.entries(node.children)) {
      walk(child, path === "/" ? "/" + name : path + "/" + name, cb);
    }
  }
}

export function sizeOf(node) {
  if (node.type === "file") return node.content.length;
  let total = 4096;
  for (const child of Object.values(node.children)) total += sizeOf(child);
  return total;
}
