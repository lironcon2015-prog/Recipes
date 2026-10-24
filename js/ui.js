/* חלקים קטנים שכל המסכים משתמשים בהם: בניית אלמנטים, הודעה קופצת,
   שכבות (גיליון, נגן) שנסגרות ב"חזרה", ונעילת גלילה שעובדת באייפון. */

export const $ = id => document.getElementById(id);

/** el('div.card', {onclick}, child, 'text') */
export function el(spec, attrs, ...kids) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) node[k] = v;
      else if (k === 'text') node.textContent = v;
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  kids.flat().forEach(kid => {
    if (kid === null || kid === undefined || kid === false) return;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  });
  return node;
}

export function icon(name, cls) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'i' + (cls ? ' ' + cls : ''));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.appendChild(use);
  return svg;
}

/* --- הודעה קופצת --- */
let toastTimer = 0;
export function toast(text, action) {
  const box = $('toast');
  box.textContent = '';
  box.appendChild(el('span', { text }));
  if (action) box.appendChild(el('button', { type: 'button', text: action.label, onclick: () => { hideToast(); action.run(); } }));
  box.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 2600);
}
function hideToast() { $('toast').classList.remove('on'); }

/* --- תאריכים --- */
export function whenText(ms) {
  const day = 24 * 60 * 60 * 1000;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const diff = midnight.getTime() - new Date(ms).setHours(0, 0, 0, 0);
  if (diff <= 0) return 'היום';
  if (diff <= day) return 'אתמול';
  return new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}

export function agoText(ms) {
  if (!ms) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return 'לפני ' + mins + ' דק׳';
  const hours = Math.round(mins / 60);
  if (hours < 24) return 'לפני ' + hours + ' שע׳';
  return whenText(ms);
}

/* --- נעילת גלילה ---
   overflow:hidden על ה-body אינו נועל את סאפרי בטלפון (nines נפל בזה
   פעמיים). מקבעים את הדף עצמו במקום שבו הוא נראה, ומחזירים בסגירה. */
let locks = 0;
let lockedAt = 0;
function lock() {
  if (locks++) return;
  lockedAt = window.scrollY || 0;
  Object.assign(document.body.style, { position: 'fixed', top: -lockedAt + 'px', left: '0', right: '0', width: '100%' });
}
function unlock() {
  if (!locks || --locks) return;
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', width: '' });
  window.scrollTo(0, lockedAt);
}

/* --- שכבות ---
   כל שכבה פתוחה מחזיקה צעד אחד בהיסטוריה, כך ש"חזרה" בטלפון סוגרת אותה
   ולא יוצאת מהאפליקציה. סגירה בכפתור מורידה את הצעד בעצמה.

   history.back() הוא אסינכרוני: pushState שנשלח מיד אחריו (סגירת הנגן
   ופתיחת העריכה בלחיצה אחת) נוחת לפני החזרה, והחזרה מורידה אותו במקום
   את הישן — הגיליון החדש נסגר ברגע שנפתח. לכן פתיחה חדשה מחכה עד שכל
   החזרות שנשלחו נחתו (afterLayers). */
const layers = [];
let pendingBacks = 0;
let waiting = [];

/* כמה שכבות שנסגרות באותה נגיעה (⋯ ← עריכה: התפריט והנגן) — צעד אחד,
   history.go(-n). שתי קריאות back() רצופות מתמזגות בסאפרי לצעד אחד, ואז
   popstate השני לא הגיע לעולם: כל פתיחה חיכתה לו (afterLayers), והאפליקציה
   נתקעה — העריכה לא נפתחה, וגם שום סרטון אחריה. ובכל מקרה: אם ה-popstate לא
   מגיע תוך רגע, לא מחכים לו יותר. */
let steps = 0;
let rescue = 0;
let ignore = 0;
let ignoreUntil = 0;
function stepBack() {
  if (steps++) return;
  Promise.resolve().then(() => {
    const n = steps;
    steps = 0;
    pendingBacks++;
    history.go(-n);
    clearTimeout(rescue);
    rescue = setTimeout(() => {
      if (!pendingBacks) return;
      /* אם בכל זאת יגיע באיחור — הוא לא "חזרה" של המשתמש */
      ignore = pendingBacks;
      ignoreUntil = Date.now() + 3000;
      pendingBacks = 0;
      release();
    }, 700);
  });
}
function release() { const run = waiting; waiting = []; run.forEach(fn => fn()); }

window.addEventListener('popstate', () => {
  if (ignore && Date.now() < ignoreUntil) { ignore--; return; }
  ignore = 0;
  if (pendingBacks) {
    pendingBacks--;
    if (!pendingBacks) { clearTimeout(rescue); release(); }
    return;
  }
  const top = layers.pop();
  if (top) top.close(true);
});

export function afterLayers(fn) {
  if (pendingBacks || steps) waiting.push(fn); else fn();
}

/** פותח שכבה. close(fromBack) מסיר אותה מהמסך. מחזיר פונקציית סגירה. */
export function openLayer(remove) {
  const layer = { close: null };
  let closed = false;
  layer.close = fromBack => {
    if (closed) return;
    closed = true;
    remove();
    unlock();
    if (!fromBack) {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
      if (history.state && history.state.rcLayer) stepBack();
    }
  };
  lock();
  layers.push(layer);
  try { history.pushState({ rcLayer: layers.length }, '', location.href); } catch (e) { /* בלי היסטוריה — סוגרים בכפתור */ }
  return () => layer.close(false);
}

export function closeAllLayers() {
  while (layers.length) layers[layers.length - 1].close(false);
}

export function onEscape(fn) {
  const h = e => { if (e.key === 'Escape') fn(); };
  document.addEventListener('keydown', h);
  return () => document.removeEventListener('keydown', h);
}

/** גיליון תחתון. מחזיר {body, close}. */
export function sheet(title, build) {
  const edge = holdEdge(sheetTone);
  const scrim = el('div.scrim');
  const box = el('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const head = el('div.sheet-head', null, el('h2', { text: title }));
  const shut = el('button.icon-btn', { type: 'button', 'aria-label': 'סגירה' }, icon('x'));
  head.appendChild(shut);
  const body = el('div');
  box.append(el('div.grab'), head, body);
  let offKey = null;
  const close = openLayer(() => {
    if (offKey) offKey();
    edge.release();
    scrim.classList.remove('on');
    box.classList.remove('on');
    setTimeout(() => { scrim.remove(); box.remove(); }, 260);
  });
  scrim.onclick = close;
  shut.onclick = close;
  offKey = onEscape(close);
  document.body.append(scrim, box);
  requestAnimationFrame(() => { scrim.classList.add('on'); box.classList.add('on'); });
  build(body, close);
  return { body, close };
}

/** אישור בתוך הדף — confirm() לא קיים בכל מקום ולא נראה כמו האפליקציה */
export function confirmBox(text, yes, onYes, onNo) {
  const box = el('div.confirm', null, el('span', { text }));
  const row = el('div.row');
  row.append(
    el('button.btn.sm', { type: 'button', text: yes, onclick: onYes }),
    el('button.btn.sm.quiet', { type: 'button', text: 'ביטול', onclick: () => { box.remove(); if (onNo) onNo(); } })
  );
  box.appendChild(row);
  return box;
}

/** הדבקה מהלוח. באייפון מופיעה בועת "הדבק" — זה תקין. */
export async function readClipboard() {
  try {
    return (await navigator.clipboard.readText()) || '';
  } catch (e) {
    return null;
  }
}

/* --- ערכת הצבעים ---
   כהה כברירת מחדל — מי שלא בחר לא רואה שינוי. בהיר נוח במטבח באור יום;
   "כמו המכשיר" מתחלף לבד עם הטלפון. הסקריפט הקטן ב-index.html מחיל את
   הבחירה לפני הציור הראשון, כדי שלא יהיה הבזק כהה אצל מי שבחר בהיר. */
const THEME_KEY = 'rc:theme';
const sysLight = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;

export function themePref() {
  try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'auto' ? t : 'dark'; }
  catch (e) { return 'dark'; }
}

function paintTheme() {
  const pref = themePref();
  const light = pref === 'light' || (pref === 'auto' && !!sysLight && sysLight.matches);
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  const top = edges[edges.length - 1];
  const tone = top ? (typeof top.color === 'function' ? top.color() : top.color) : null;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = tone || (light ? '#F4F5F8' : '#0A1321');
  document.documentElement.style.background = tone || '';
}

/* --- הקצה התחתון באייפון ---
   באפליקציה שבמסך הבית אייפון לא מצייר את הדף עד תחתית המסך: נשאר פס
   בגובה שורת השעה, ובראש המסך שכבה דקה מעל התוכן — בצבע הרקע של הערכה.
   מתחת לנגן השחור זה יצא פס בהיר (צילומים של בעל הריפו). הפס מחוץ לדף,
   ולכן אי אפשר להאריך אליו את הנגן — רק לצבוע אותו, דרך theme-color
   והרקע של html, בצבע של מה שבתחתית: שחור לנגן, צבע הגיליון לגיליון.
   מחסנית, כי גיליון המתכון נפתח מעל הנגן וחוזר אליו. */
const edges = [];
export const sheetTone = () => getComputedStyle(document.documentElement).getPropertyValue('--surface-solid').trim() || null;

/** צבע לקצה כל עוד השכבה פתוחה: צבע, או פונקציה שמחזירה צבע לפי הערכה */
export function holdEdge(color) {
  const hold = { color };
  edges.push(hold);
  paintTheme();
  return {
    set(next) { hold.color = next; paintTheme(); },
    release() {
      const i = edges.indexOf(hold);
      if (i < 0) return;
      edges.splice(i, 1);
      paintTheme();
    }
  };
}

export function setTheme(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch (e) { /* לא קריטי — חל עד הפתיחה הבאה */ }
  paintTheme();
}

export function watchTheme() {
  if (sysLight && sysLight.addEventListener) sysLight.addEventListener('change', () => { if (themePref() === 'auto') paintTheme(); });
  paintTheme();
}
