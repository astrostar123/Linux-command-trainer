/* Linux Command Trainer — service worker
 * Cache-first for the app shell so the trainer works offline once visited. */

const CACHE = "lct-v1";
const CORE = [
  "./",
  "./index.html",
  "./commands.html",
  "./simulator.html",
  "./quiz.html",
  "./lessons.html",
  "./progress.html",
  "./settings.html",
  "./about.html",
  "./css/style.css",
  "./js/app.js",
  "./js/store.js",
  "./js/data.js",
  "./js/vfs.js",
  "./js/terminal.js",
  "./js/challenges.js",
  "./js/home.js",
  "./js/commands.js",
  "./js/simulator.js",
  "./js/quiz.js",
  "./js/lessons.js",
  "./js/progress.js",
  "./js/settings.js",
  "./data/commands.json",
  "./data/lessons.json",
  "./manifest.json",
  "./assets/icons/favicon.svg",
  "./assets/icons/icon-192.svg",
  "./assets/icons/icon-512.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // let fonts etc. hit the network

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
          .catch(() => caches.match("./index.html"))
    )
  );
});
