/* data.js - loads and indexes the command & lesson datasets --------------- */

let commandsCache = null;
let lessonsCache = null;

export async function loadCommands() {
  if (commandsCache) return commandsCache;
  const res = await fetch("data/commands.json");
  commandsCache = await res.json();
  return commandsCache;
}

export async function loadLessons() {
  if (lessonsCache) return lessonsCache;
  const res = await fetch("data/lessons.json");
  lessonsCache = await res.json();
  return lessonsCache;
}

export async function getCommand(name) {
  const all = await loadCommands();
  return all.find((c) => c.name === name) || null;
}

export async function categories() {
  const all = await loadCommands();
  return [...new Set(all.map((c) => c.category))].sort();
}

/* Full-text search across name, alias, description, category. */
export function searchCommands(all, query, { category = "", difficulty = "" } = {}) {
  const q = query.trim().toLowerCase();
  return all.filter((c) => {
    if (category && c.category !== category) return false;
    if (difficulty && c.difficulty !== difficulty) return false;
    if (!q) return true;
    const hay = [c.name, c.description, c.category, ...(c.aliases || [])].join(" ").toLowerCase();
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}
