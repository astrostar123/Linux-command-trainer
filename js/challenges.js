/* challenges.js - practice tasks verified against the live simulator ------ */

/* Each challenge:
 *   id, title, prompt, hint, xp
 *   check(term, lastCmd) → true when solved.
 * Checks inspect real simulator state (filesystem, services, history),
 * so only genuinely working commands pass. */

export const CHALLENGES = [
  {
    id: "make-folder", title: "Create a folder", xp: 15,
    prompt: "Create a directory called practice in your home directory.",
    hint: "mkdir creates directories. You start in /home/student.",
    check: (t) => t.node("/home/student/practice")?.type === "dir",
  },
  {
    id: "make-file", title: "Create a file", xp: 15,
    prompt: "Create an empty file named hello.txt in your home directory.",
    hint: "touch creates empty files.",
    check: (t) => t.node("/home/student/hello.txt")?.type === "file",
  },
  {
    id: "write-file", title: "Write into a file", xp: 20,
    prompt: "Put the text 'linux is fun' into a file called fun.txt (in your home).",
    hint: "echo plus the > redirection writes output into a file.",
    check: (t) => (t.node("/home/student/fun.txt")?.content || "").toLowerCase().includes("linux is fun"),
  },
  {
    id: "delete-file", title: "Delete a file", xp: 15,
    prompt: "Delete the file notes.txt from your home directory.",
    hint: "rm removes files - permanently, so aim carefully.",
    check: (t, last) => !t.node("/home/student/notes.txt") && /(^|\s)rm(\s|$)/.test(last),
  },
  {
    id: "copy-dir", title: "Copy a directory", xp: 25,
    prompt: "Copy the entire projects directory to a new directory called projects-backup (in your home).",
    hint: "Directories need cp's recursive flag.",
    check: (t) => t.node("/home/student/projects-backup")?.type === "dir" && t.node("/home/student/projects-backup/backup.sh"),
  },
  {
    id: "find-file", title: "Find a file", xp: 25,
    prompt: "Use find to locate index.html somewhere under /var.",
    hint: "find PATH -name PATTERN - quote the pattern.",
    check: (t, last) => /find\s+\/var/.test(last) && /index\.html/.test(last),
  },
  {
    id: "grep-log", title: "Search a log file", xp: 25,
    prompt: "Use grep to find the line containing ERROR in /var/log/syslog.",
    hint: "grep PATTERN FILE. Case matters unless you add -i.",
    check: (t, last) => /grep\s+.*\/var\/log\/syslog/.test(last) && /error/i.test(last),
  },
  {
    id: "chmod-exec", title: "Change permissions", xp: 25,
    prompt: "Make the file projects/backup.sh readable by everyone but writable only by you: set its permissions to 644.",
    hint: "chmod takes an octal mode and a path.",
    check: (t) => t.node("/home/student/projects/backup.sh")?.mode === "-rw-r--r--",
  },
  {
    id: "compress", title: "Compress a folder", xp: 30,
    prompt: "Create a compressed archive called site.tar.gz containing the projects/website directory.",
    hint: "tar czf ARCHIVE TARGET - Create Zip File.",
    check: (t) => (t.node("/home/student/site.tar.gz")?.content || "").startsWith("TARBALL:"),
  },
  {
    id: "pipe-count", title: "Count with a pipeline", xp: 30,
    prompt: "Count the number of lines in /var/log/syslog using cat piped into wc -l.",
    hint: "The pipe | sends one command's output into the next.",
    check: (t, last) => /cat\s+\/var\/log\/syslog\s*\|\s*wc\s+-l/.test(last),
  },
  {
    id: "service-restart", title: "Restart a service", xp: 30,
    prompt: "Restart the nginx service (remember who is allowed to manage services).",
    hint: "systemctl restart - with the right privileges.",
    check: (t, last) => /sudo\s+systemctl\s+restart\s+nginx/.test(last),
  },
  {
    id: "stop-start", title: "Enable at boot", xp: 30,
    prompt: "Enable the docker service so it starts at boot AND start it right now - in a single command.",
    hint: "systemctl has a flag that combines enable with start.",
    check: (t) => t.services.docker.enabled && t.services.docker.active,
  },
];

/* Daily challenge = deterministic rotation through the list. */
export function dailyChallenge() {
  const day = Math.floor(Date.now() / 864e5);
  return CHALLENGES[day % CHALLENGES.length];
}
