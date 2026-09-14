const CACHE_NAME = "smart-farm-prototype-v8";
const FILES = [
  "./",
  "index.html",
  "varieties.html",
  "dashboard.html",
  "styles.css",
  "crop-data.js",
  "crop-nav.js",
  "app.js",
  "manifest.json",
  "assets/smart-farm-icon.svg",
  "assets/device-ac.svg",
  "assets/device-heater.svg",
  "assets/device-fan.svg",
  "assets/device-pump.svg",
  "assets/device-humidity.svg",
  "assets/device-light.svg",
  "assets/device-co2.svg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)));
});
