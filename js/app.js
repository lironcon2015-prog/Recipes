/* הניתוב והאתחול.

   #/        המתכונים
   #/c       קטגוריות
   #/s       הגדרות וסנכרון לדרייב
   #/join/…  הצטרפות לספרייה משותפת (קישור שנשלח) */

import { mountLibrary } from './library.js';
import { mountCategories } from './categories.js';
import { mountSync } from './sync.js';
import { migrate } from './videos.js';
import * as cloud from './cloud.js';
import { $, afterLayers, watchTheme } from './ui.js';

let current = null;
let shared = null;

function parse() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'c') return { view: 'cats' };
  if (parts[0] === 's') return { view: 'sync' };
  if (parts[0] === 'join' && parts[1]) return { view: 'sync', join: parts[1] };
  return { view: 'lib' };
}

/* מעבר מסך מחכה ש"חזרה" שנשלחה בסגירת גיליון תנחת — אחרת היא נוחתת
   אחרי המעבר ומבטלת אותו. גיליון פתוח לא נסגר כאן: הוא מכסה את המסך,
   ואין ממנו קישור למסך אחר. */
function route() {
  afterLayers(show);
}

function show() {
  if (current) { current.destroy(); current = null; }
  const r = parse();
  ['lib', 'cats', 'sync'].forEach(id => { $(id).hidden = id !== r.view; });
  window.scrollTo(0, 0);
  if (r.view === 'cats') current = mountCategories($('cats'));
  else if (r.view === 'sync') current = mountSync($('sync'), r.join ? cloud.decodeJoin('#/join/' + r.join) : null);
  else {
    const prefill = shared;
    shared = null;
    current = mountLibrary($('lib'), prefill);
  }
}

/* שיתוף אל האפליקציה (share_target ב-manifest, אנדרואיד אחרי התקנה):
   הקישור מגיע כ-?url= או בתוך ?text= — הניקוי ב-normalizeUrl */
function readShare() {
  const params = new URLSearchParams(location.search);
  if (!params.has('url') && !params.has('text') && !params.has('title')) return;
  shared = { url: params.get('url') || params.get('text') || '', title: params.get('title') || '' };
  /* שהקישור לא ייפתח שוב ברענון */
  history.replaceState(null, '', location.pathname + '#/');
}

async function boot() {
  watchTheme();
  readShare();
  await migrate().catch(() => {});
  window.addEventListener('hashchange', route);
  show();

  if ('serviceWorker' in navigator) {
    /* גרסה חדשה משתלטת מיד (skipWaiting + claim), והדף מתרענן פעם אחת —
       אלא אם גיליון פתוח: אז מחכים, כדי לא למחוק מתכון באמצע ההקלדה */
    let reloaded = false;
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || reloaded) return;
      reloaded = true;
      const go = () => location.reload();
      if (document.querySelector('.sheet, .player')) {
        const wait = setInterval(() => { if (!document.querySelector('.sheet, .player')) { clearInterval(wait); go(); } }, 1000);
      } else go();
    });
    /* הדפדפן בודק אם יש sw.js חדש רק בפתיחה מאפס. אפליקציה שחוזרת מהרקע
       (באייפון — כמעט תמיד) לא נפתחת מאפס, ונשארה על הגרסה הישנה ימים.
       לכן בודקים גם בכל חזרה לאפליקציה. */
    navigator.serviceWorker.register('sw.js').then(reg => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  }
  /* בקשה שהדפדפן לא יפנה את המתכונים כשהטלפון מתמלא. לא מציל מניקוי ידני. */
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

boot();
