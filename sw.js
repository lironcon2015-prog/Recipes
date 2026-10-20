/* Service Worker — האפליקציה נפתחת גם בלי רשת.

   הקוד מוגש cache-first ממטמון שנושא את מספר הגרסה, כדי שכל הקבצים
   שנטענים יהיו מאותה גרסה. אחרי שינוי קוד חובה להעלות את VERSION כאן
   ואת VERSION ב-js/version.js (tools-check.mjs משווה ביניהם) — בלי זה
   הטלפון ממשיך להגיש את הקוד הישן.

   אותו מקור (lironcon2015-prog.github.io) משרת גם את nines ואת MGivatayim,
   והמטמונים (Cache Storage) משותפים לכל המקור. לכן מוחקים רק מטמון
   שמתחיל ב-"recipes-", וקובץ שחסר במטמון (אפליקציה אחרת מחקה אותו)
   נלקח מהרשת ונשמר שוב, במקום להפיל את האפליקציה. */

const VERSION = '1.0.6';
const PREFIX = 'recipes-';
const SHELL = PREFIX + VERSION;

const ASSETS = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/ui.js', './js/version.js', './js/library.js', './js/categories.js', './js/sync.js',
  './js/videos.js', './js/preview.js', './js/cloud.js', './js/posters.js',
  './fonts/assistant-hebrew.woff2', './fonts/assistant-latin.woff2',
  './fonts/rubik-hebrew.woff2', './fonts/rubik-latin.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];

/* cache:'reload' — לא למלא מטמון חדש מעותקים ישנים במטמון ה-HTTP */
const fresh = url => new Request(url, { cache: 'reload' });

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(ASSETS.map(fresh));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* הסקריפט בדרייב, אינסטגרם, שירותי התצוגה המקדימה — לא שלנו */
  if (url.origin !== location.origin) return;
  /* רק מה שבתוך התיקייה של האפליקציה */
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;

  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    /* ניווט (כולל ?url= משיתוף) — תמיד ה-index שבמטמון */
    const key = req.mode === 'navigate' ? './index.html' : req;
    const hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
      return res;
    } catch (err) {
      const fallback = req.mode === 'navigate' ? await cache.match('./index.html') : null;
      return fallback || Response.error();
    }
  })());
});
