/* מסך המתכון — כיוון א׳ + 1ג׳ במוקאפ (בעל הריפו בחר מול מוקאפ על המתכון
   האמיתי שלו, אחרי שהגרסה הקודמת יצאה "גרועה"):

   · הסרטון הוא המסך, מקצה לקצה, כמו ברילס. ✕ ו-⛶ צפים למעלה; למטה, על
     הצללה, הקטגוריה, השם ושתי שורות נקיות מהמתכון; הפעולות בעמודה בצד,
     ומחיקה רק מאחורי ⋯.
   · "המתכון" מעלה גיליון: ערכים בארבע משבצות, רכיבים לפי קבוצה עם סימון
     (נשמר במכשיר), שלבים אם יש. הסרטון ממשיך לנגן מעליו.
   · בלי מתג "רכיבים | הכנה" (בעל הריפו).
   · באינסטגרם, בפייסבוק ובטיקטוק מנגנים את קובץ הווידאו עצמו. כשאין קובץ —
     הנגן שלהם, בתוך האפליקציה (1.0.12; ב-1ג׳ ▶ יצא לאינסטגרם, וזה קרה כמעט
     תמיד). רק כשאין גם נגן — ▶ פותח את הסרטון אצלם.
   · בקובץ שלנו, כמו ביוטיוב (1.0.19): נגיעה מראה את הפקדים והסרטון ממשיך —
     10 שניות אחורה וקדימה, עצירה, והקו בתחתית נגרר. נגיעה כפולה בצד ימין —
     10 קדימה, בשמאל — 10 אחורה. לחיצה ארוכה — מהירות כפולה. הזמן משמאל
     לימין, כמו בכל נגן (1.0.18).
   · רילס שאינסטגרם חוסמת מחוץ לה (זכויות, כמעט תמיד על המוזיקה): אין קובץ,
     והנגן שלה רק שולח אליה בלחיצה. לכן במקומו — התמונה, הסבר, ו"פתיחה
     באינסטגרם" כבחירה (1.0.17; הבדיקה ב-preview.js, igMedia).

   הנגינה, התמונות והקישור עצמו — videos.js ו-preview.js, כמו קודם. */

import {
  categoryName, listCategories, updateVideo, removeVideo, getVideo,
  platformName, embedUrl, isPortrait, playable, mediaFresh, posterCandidates, readOnly
} from './videos.js';
import { refreshMedia, whyNoFile } from './preview.js';
import { el, icon, toast, whenText, openLayer, onEscape, holdEdge, sheetTone, copyText } from './ui.js';

/* הנגן המשובץ של אלה הוא דף שלם — מנגנים אצלם רק את הקובץ */
const CHROME = new Set(['instagram', 'facebook', 'tiktok']);
const FETCHABLE = new Set(['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'vimeo']);

/* --- ההערה כמתכון ---
   טקסט חופשי שהודבק מאינסטגרם. לא ממציאים מבנה, רק מזהים את הסימנים שכבר
   בו: שורה קצרה שנגמרת בנקודתיים — כותרת ("לרול:"); שורה שמתחילה ב-* · - •
   — רכיב; במספר — שלב; "קלוריות: … | חלבון: …" — ערכים. כל השאר פסקה. */
const BULLET = /^\s*[*\-•·‣▪●◦]\s*/;
const STEP = /^\s*\d{1,2}[.)]\s+/;
const SERVINGS = /^(?:מספר\s+)?מנות\s*[:：]\s*([\d.,]+)/;
const WEIGHT = /^משקל(?:\s+כולל)?\s*[:：]\s*([\d.,]+)\s*(ק"ג|ק״ג|קילו)?/;
const QTY = /^((?:כ-?\s*)?[\d½¼¾⅓⅔.,/\-–]+\s*(?:ק"ג|ק״ג|גרם|ג׳|ג'|ג\b|מ"ל|מ״ל|מל|ליטר|כפיות|כפית|כפות|כף|כוסות|כוס|יחידות|יח׳|ביצים|ביצה)?)\s+/;

export function parseNote(text) {
  const blocks = [];
  let list = null;
  String(text || '').split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) { list = null; return; }
    const bullet = BULLET.test(line), step = STEP.test(line);
    if (bullet || step) {
      const kind = step ? 'steps' : 'items';
      if (!list || list.type !== kind) { list = { type: kind, list: [] }; blocks.push(list); }
      list.list.push(line.replace(step ? STEP : BULLET, ''));
      return;
    }
    list = null;
    const sv = line.match(SERVINGS);
    if (sv) { blocks.push({ type: 'meta', servings: num(sv[1]) }); return; }
    const wt = line.match(WEIGHT);
    if (wt) { blocks.push({ type: 'meta', weight: num(wt[1]) * (wt[2] ? 1000 : 1) }); return; }
    const parts = line.split(/\s*\|\s*/).filter(Boolean);
    if (parts.length > 1 && parts.filter(p => p.includes(':')).length >= 2) {
      /* "ערכים תזונתיים לכל המנה: קלוריות: כ-195" — הכותרת לפני הזוג הראשון */
      const first = parts[0].split(':');
      let label = '';
      if (first.length > 2) { label = first[0].trim(); parts[0] = first.slice(1).join(':').trim(); }
      blocks.push({ type: 'facts', label, basis: basisOf(label), list: parts.map(p => {
        const at = p.indexOf(':');
        return at > 0 ? { k: p.slice(0, at).trim(), v: p.slice(at + 1).trim() } : { k: '', v: p };
      }) });
      return;
    }
    if (line.length <= 32 && /[:：]$/.test(line)) { blocks.push({ type: 'head', text: line.replace(/[:：]$/, '') }); return; }
    blocks.push({ type: 'p', text: line });
  });
  return blocks;
}

/* --- הערכים התזונתיים ---
   שלושה בסיסים: ל-100 גרם, למנה, לכל המנה (הפורמט — AI_PROMPT). מה שחסר ואפשר
   לחשב — מחושב: למנה מכל המנה חלקי המנות, ל-100 גרם מכל המנה והמשקל, וכל המנה
   מהמנה כפול המנות. שורת ערכים בלי כותרת מוכרת — מוצגת כמו פעם. */
export const BASES = [['g100', 'ל-100 גרם'], ['serving', 'למנה'], ['total', 'כל המנה']];
const BASIS_KEY = 'rc:basis';
const MAIN = ['קלורי', 'חלבון', 'פחמימ', 'שומן'];

function basisOf(label) {
  if (/100/.test(label)) return 'g100';
  if (/כל\s*ה?מנה|כל\s*המתכון|סה"?כ|סה״כ/.test(label)) return 'total';
  if (/למנה|מנה\s*אחת|לסועד/.test(label)) return 'serving';
  return null;
}

function num(text) { return parseFloat(String(text).replace(/,/g, '')) || 0; }

/* 2160 → "2,160"; 9.04 → "9" ; 0.45 → "0.5" */
function fmt(n) {
  const r = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
  return r.toLocaleString('en-US');
}

function scale(list, factor) {
  return list.map(f => {
    const m = f.v.match(/^(כ-?\s*)?([\d.,]+)(.*)$/);
    return m ? { k: f.k, v: fmt(num(m[2]) * factor) + m[3] } : f;
  });
}

export function nutrition(blocks) {
  const meta = {};
  blocks.filter(b => b.type === 'meta').forEach(b => Object.assign(meta, b.servings ? { servings: b.servings } : { weight: b.weight }));
  const by = {};
  blocks.filter(b => b.type === 'facts' && b.basis).forEach(b => { if (!by[b.basis]) by[b.basis] = { list: b.list }; });
  const n = meta.servings, w = meta.weight;
  if (!by.total && by.serving && n) by.total = { list: scale(by.serving.list, n), computed: true };
  if (!by.serving && by.total && n > 1) by.serving = { list: scale(by.total.list, 1 / n), computed: true };
  if (!by.g100 && by.total && w) by.g100 = { list: scale(by.total.list, 100 / w), computed: true };
  return { by, meta, bases: BASES.filter(([k]) => by[k]) };
}

export function readBasis(bases) {
  let pref = null;
  try { pref = localStorage.getItem(BASIS_KEY); } catch (e) { /* פרטי — ברירת המחדל */ }
  return bases.some(([k]) => k === pref) ? pref : bases[0][0];
}
function saveBasis(k) { try { localStorage.setItem(BASIS_KEY, k); } catch (e) { /* לא קריטי */ } }

/* קלוריות, חלבון, פחמימות, שומן — בסדר הזה; השאר אחריהם */
function ordered(list) {
  const main = MAIN.map(m => list.find(f => f.k.includes(m))).filter(Boolean);
  return { main, rest: list.filter(f => !main.includes(f)) };
}

/* "כ-195 קק"ל" → "195 קק"ל"; ערך עם יחידה ושם — "34 גרם חלבון" */
function factText(f) {
  const v = f.v.replace(/^כ-?\s*/, '');
  if (/קלורי/.test(f.k)) return /^[\d.,]+$/.test(v) ? v + ' קלוריות' : v;
  if (!f.k) return v;
  return v + ' ' + f.k;
}

/** שתי השורות שמתחת לשם: הערכים, ואז הכותרת הראשונה ושלושה רכיבים */
export function summary(text) {
  const blocks = parseNote(text);
  const out = [];
  const nut = nutrition(blocks);
  if (nut.bases.length) {
    const k = readBasis(nut.bases);
    const { main } = ordered(nut.by[k].list);
    out.push((k === 'g100' ? 'ל-100 ג׳: ' : k === 'serving' ? 'למנה: ' : 'לכל המנה: ') + main.slice(0, 2).map(factText).join(' · ') + '.');
  } else {
    const facts = blocks.find(b => b.type === 'facts');
    if (facts) out.push(facts.list.map(factText).join(' · ') + '.');
  }
  const items = blocks.find(b => b.type === 'items');
  if (items) {
    const at = blocks.indexOf(items);
    const head = blocks.slice(0, at).reverse().find(b => b.type === 'head');
    const names = items.list.slice(0, 3).map(t => t.replace(QTY, ''));
    out.push((head ? head.text + ': ' : '') + names.join(', ') + (items.list.length > 3 ? '…' : ''));
  }
  if (!out.length) {
    out.push(blocks.filter(b => b.type === 'p' || b.type === 'head').map(b => b.text).join(' · '));
  }
  return out.join(' ');
}

/* סימון הרכיבים נשמר במכשיר, לפי סרטון — כדי שמי שעזב את המטבח לרגע
   יחזור לאותו מקום. לא מסתנכרן: זה מצב של בישול אחד, לא של המתכון. */
const CHECK_KEY = id => 'rc:check:' + id;
const readChecks = id => { try { return new Set(JSON.parse(localStorage.getItem(CHECK_KEY(id)) || '[]')); } catch (e) { return new Set(); } };
const saveChecks = (id, set) => { try { localStorage.setItem(CHECK_KEY(id), JSON.stringify([...set])); } catch (e) { /* לא קריטי */ } };

function recipeBody(v, onBasis) {
  const title = v.title;
  const box = el('div.rbody');
  const blocks = parseNote(v.note);
  const checks = readChecks(v.id);
  let n = 0;
  let firstFacts = true;
  const nut = nutrition(blocks);
  if (nut.bases.length) { box.appendChild(nutPanel(nut, onBasis, title)); firstFacts = false; }
  blocks.forEach(b => {
    if (b.type === 'meta' || (b.type === 'facts' && b.basis)) return;
    if (b.type === 'facts' && firstFacts) {
      firstFacts = false;
      const grid = el('div.nut');
      b.list.slice(0, 4).forEach((f, i) => {
        const v1 = f.v.replace(/^כ-?\s*/, '');
        const m = v1.match(/^([\d.,]+)\s*(.*)$/);
        grid.appendChild(el('div' + (i === 0 ? '.k' : ''), null,
          el('b.num', { text: m ? m[1] + (m[2] && !/קק/.test(m[2]) ? ' ' + m[2].replace('גרם', 'ג׳') : '') : v1 }),
          el('small', { text: f.k || (m && m[2]) || '' })));
      });
      box.appendChild(grid);
      if (b.list.length > 4) box.appendChild(el('p.rp', { text: b.list.slice(4).map(f => f.k + ': ' + f.v).join(' · ') }));
      return;
    }
    if (b.type === 'facts') { box.appendChild(el('p.rp', { text: b.list.map(f => (f.k ? f.k + ': ' : '') + f.v).join(' · ') })); return; }
    if (b.type === 'head') { box.appendChild(el('div.grp', { text: b.text })); return; }
    if (b.type === 'p') { box.appendChild(el('p.rp', { text: b.text })); return; }
    if (b.type === 'steps') {
      const ol = el('ol.steps');
      b.list.forEach(t => ol.appendChild(el('li', { text: t })));
      box.appendChild(ol);
      return;
    }
    b.list.forEach(t => {
      const key = String(n++);
      const m = t.match(QTY);
      const row = el('button.ing', { type: 'button', 'aria-pressed': String(checks.has(key)) },
        el('i'), el('span', null, m ? el('b.num', { text: m[1] }) : null, m ? ' ' + t.slice(m[0].length) : t));
      row.onclick = () => {
        if (checks.has(key)) checks.delete(key); else checks.add(key);
        row.setAttribute('aria-pressed', String(checks.has(key)));
        saveChecks(v.id, checks);
      };
      box.appendChild(row);
    });
  });
  if (checks.size) {
    box.appendChild(el('button.uncheck', { type: 'button', text: 'ניקוי הסימונים', onclick: () => {
      checks.clear(); saveChecks(v.id, checks);
      box.querySelectorAll('.ing').forEach(r => r.setAttribute('aria-pressed', 'false'));
    } }));
  }
  return box;
}

function nutCell(f, i) {
  const v1 = f.v.replace(/^כ-?\s*/, '');
  const m = v1.match(/^([\d.,]+)\s*(.*)$/);
  return el('div' + (i === 0 && /קלורי/.test(f.k) ? '.k' : ''), null,
    el('b.num', { text: m ? m[1] + (m[2] && !/קק/.test(m[2]) ? ' ' + m[2].replace('גרם', 'ג׳') : '') : v1 }),
    el('small', { text: f.k || (m && m[2]) || '' }));
}

/** המתג (ל-100 גרם · למנה · כל המנה), ארבעת העיקריים, והשאר בשורה */
function nutPanel(nut, onBasis, title) {
  const wrap = el('div.nutp');
  let cur = readBasis(nut.bases);
  const seg = nut.bases.length > 1 ? el('div.tseg.nseg', { role: 'group', 'aria-label': 'הערכים לפי' }) : null;
  /* נגיעה בערכים מעתיקה אותם — להדבקה ב-Gympro. הטקסט אומר לאיזה בסיס הם,
     כדי שערכים למנה לא יידבקו כאילו הם ל-100 גרם */
  const copy = async () => {
    const { servings, weight } = nut.meta;
    const head = cur === 'g100' ? 'ערכים ל-100 גרם'
      : cur === 'serving' ? 'ערכים למנה' + (servings ? ' (מנה אחת מתוך ' + servings + (weight ? ', ' + fmt(weight / servings) + ' גרם' : '') + ')' : '')
      : 'ערכים לכל המנה' + (servings || weight ? ' (' + [servings ? servings + ' מנות' : '', weight ? fmt(weight) + ' גרם' : ''].filter(Boolean).join(', ') + ')' : '');
    const { main, rest } = ordered(nut.by[cur].list);
    const vals = [...main, ...rest].map(f => f.k + ' ' + f.v.replace(/^כ-?\s*/, '')).join(' | ');
    const ok = await copyText(head + ' — ' + title + ':\n' + vals);
    toast(ok ? 'הועתקו ה' + head.split(' (')[0] : 'לא הצלחנו להעתיק — נסה שוב');
  };
  const grid = el('button.nut', { type: 'button', 'aria-label': 'העתקת הערכים', onclick: copy });
  const more = el('p.rp.nmore', { onclick: copy });
  const basis = el('p.nbasis');
  const { servings, weight } = nut.meta;
  const paint = () => {
    const b = nut.by[cur];
    const { main, rest } = ordered(b.list);
    grid.textContent = '';
    main.forEach((f, i) => grid.appendChild(nutCell(f, i)));
    grid.style.gridTemplateColumns = 'repeat(' + Math.max(main.length, 1) + ', minmax(0, 1fr))';
    grid.hidden = !main.length;
    const extra = main.length ? rest : b.list;
    more.textContent = extra.map(f => (f.k ? f.k + ' ' : '') + f.v.replace(/^כ-?\s*/, '').replace('גרם', 'ג׳')).join(' · ');
    more.hidden = !extra.length;
    const parts = cur === 'serving' ? ['מנה אחת' + (servings ? ' מתוך ' + servings : ''), weight && servings ? fmt(weight / servings) + ' גרם' : '']
      : cur === 'total' ? [servings ? servings + ' מנות' : '', weight ? fmt(weight) + ' גרם' : '']
      : nut.bases.length === 1 ? ['ל-100 גרם'] : [];
    if (b.computed) parts.push('מחושב');
    basis.textContent = parts.filter(Boolean).join(' · ');
    basis.hidden = !basis.textContent;
    if (seg) seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.k === cur)));
  };
  if (seg) nut.bases.forEach(([k, label]) => seg.appendChild(el('button', { type: 'button', 'data-k': k, text: label, onclick: () => { cur = k; saveBasis(k); paint(); if (onBasis) onBasis(); } })));
  paint();
  wrap.append(...[seg, grid, more, basis].filter(Boolean));
  return wrap;
}

/* מה שהכפתור בעריכה מעתיק: ההנחיה ל-AI, עם הפורמט שהמתכון קורא */
export const AI_PROMPT = `קח את המתכון שמופיע אחרי ההנחיה, והחזר אותו רק בפורמט הבא — בעברית, בלי שום טקסט לפני או אחרי, בלי הדגשות ובלי כוכביות מלבד אלה שבתבנית. מספרים בלבד, בלי טווחים.

חשב את הערכים התזונתיים מהמרכיבים: לכל מרכיב לפי הכמות שלו, ואז סכום. אם במתכון כבר כתובים ערכים — אל תעתיק אותם: בדוק אותם מול החישוב שלך, ואם הם לא תואמים, כתוב את החישוב שלך. בדוק גם שהקלוריות מתאימות למאקרו (חלבון ופחמימות 4 לגרם, שומן 9 לגרם), בסטייה של עד 10%. הערכים ל-100 גרם הם הערכים לכל המנה חלקי המשקל הכולל, כפול 100. אם חסר נתון — הערכה סבירה.

מנות: <מספר המנות>
משקל כולל: <המשקל של כל המתכון המוכן, בגרם> גרם

ערכים ל-100 גרם: קלוריות: <מספר> | חלבון: <מספר> גרם | פחמימות: <מספר> גרם | שומן: <מספר> גרם | סיבים: <מספר> גרם | סוכרים: <מספר> גרם
ערכים לכל המנה: קלוריות: <מספר> | חלבון: <מספר> גרם | פחמימות: <מספר> גרם | שומן: <מספר> גרם | סיבים: <מספר> גרם | סוכרים: <מספר> גרם

מצרכים:
* <כמות> <מצרך>
* <כמות> <מצרך>

אופן ההכנה:
1. <שלב>
2. <שלב>

טיפים:
<טיפ, אם יש>

המתכון:
`;

/* --- המסך --- */

/**
 * ctx: { posterUrls, onEdit(v), onChanged(), fixPoster(v, after) } — מה שהנגן צריך
 * מהספרייה ולא שייך לו: התמונות השמורות, פתיחת העריכה, וציור הספרייה מחדש.
 */
export function buildPlayer(id, ctx) {
  const v = getVideo(id);
  if (!v) return;
  const name = platformName(v.platform);
  const owner = !readOnly();
  /* באינסטגרם ובחבריה הנגן שלהם הוא רק נפילה, כשאין קובץ — אבל נפילה בתוך
     האפליקציה. 1ג׳ (▶ פותח את אינסטגרם) הוציא מהאפליקציה כמעט כל סרטון
     אינסטגרם, כי את הקובץ שלהם רוב הזמן לא מוצאים (בעל הריפו: "לחיצה על
     כפתור ההפעלה מובילה לאינסטגרם"). */
  const fallback = embedUrl(playable(v));
  const embed = CHROME.has(v.platform) ? null : fallback;
  const canFetch = FETCHABLE.has(v.platform);

  const layer = el('div.player', { role: 'dialog', 'aria-modal': 'true', 'aria-label': v.title });
  const stage = el('div.stage');
  const still = posterCandidates(v, ctx.posterUrls.get(v.id))[0];
  /* הזמן: קו שאפשר לגרור, ו-10 שניות אחורה וקדימה כשעוצרים. משמאל לימין גם
     בעברית — כך זמן זורם בכל נגן (בעל הריפו: "בדרך כלל זה משמאל לימין").
     רק בקובץ שלנו: בנגן של אינסטגרם הפקדים שלה. */
  const fill = el('i');
  const knob = el('span.knob');
  const bubble = el('span.bubble.num');
  const nowAt = el('span.num');
  const total = el('span.num');
  const progress = el('div.progress', { hidden: true, role: 'slider', tabindex: '0', 'aria-label': 'מיקום בסרטון', 'aria-valuemin': '0' },
    el('div.track', null, fill, knob, bubble), el('div.times', null, nowAt, total));

  let offKey = null;
  let video = null;
  /* הפס שאייפון משאיר מתחת לדף — שחור כמו הנגן (ui.js, holdEdge) */
  const edge = holdEdge('#000');
  const close = openLayer(() => {
    if (offKey) offKey();
    edge.release();
    if (fsEl()) leaveFull();
    /* null — כדי שרענון של קובץ שעוד בדרך לא ינגן ברקע אחרי הסגירה */
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); video = null; }
    layer.remove();
  });

  /* --- מה מנגנים ---
     file: קובץ הווידאו (נקי, ממלא את המסך) · embed: נגן נקי (יוטיוב וכו')
     · out: אין קובץ — 1ג׳, התמונה ו"מתנגן באינסטגרם"
     · blocked: אינסטגרם לא מרשה לנגן מחוץ לה — התמונה, הסבר ו"פתיחה באינסטגרם"
     · null: עוד לא ידוע */
  let mode = v.media && mediaFresh(v) ? 'file' : (embed ? 'embed' : null);
  let pending = null;
  const resolve = () => {
    if (mode || pending) return pending;
    if (!canFetch) { mode = fallback ? 'embed' : 'out'; return null; }
    pending = refreshMedia(v.url, v.full).then(got => {
      pending = null;
      if (got.media) {
        if (owner) updateVideo(v.id, { media: got.media });
        v.media = got.media; v.mediaAt = Date.now();
        mode = 'file';
      } else {
        mode = got.blocked ? 'blocked' : (fallback ? 'embed' : 'out');
        /* הנגן שלהם במקום שלנו — אומרים למה, ומה פותר את זה */
        const why = !got.blocked && owner && whyNoFile(got.log, name);
        if (why) toast(why);
      }
      paintCover();
    });
    return pending;
  };

  const cover = el('div.cover');
  if (still) {
    const img = el('img', { alt: '', src: still });
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.remove();
    cover.appendChild(img);
  }
  const bigPlay = el('button.bigp', { type: 'button', 'aria-label': 'ניגון' }, icon('play'));
  const outLink = el('a.out', { href: v.url, target: '_blank', rel: 'noopener noreferrer' }, icon('ext'), 'מתנגן ב' + name);
  const why = el('p.why', { text: name + ' לא מרשה לנגן את הסרטון הזה מחוץ ל' + name + ', בגלל זכויות יוצרים — בדרך כלל על המוזיקה שבו.' });
  const cta = el('div.cta', null, bigPlay, why, outLink);
  cover.appendChild(cta);
  const paintCover = () => {
    /* 1ג׳: ▶ עצמו פותח את אינסטגרם — אותה לחיצה, יעד אחר, והתווית אומרת לאן.
       חסום: אין ▶ בכלל — רק ההסבר, ויציאה כבחירה */
    const blocked = mode === 'blocked';
    bigPlay.hidden = blocked;
    why.hidden = !blocked;
    outLink.hidden = mode !== 'out' && !blocked;
    outLink.lastChild.textContent = (blocked ? 'פתיחה ב' : 'מתנגן ב') + name;
    bigPlay.classList.toggle('busy', !!pending);
  };
  paintCover();
  stage.appendChild(cover);
  /* יודעים מראש אם יש קובץ, כדי ש-▶ יתנהג נכון כבר בלחיצה הראשונה.
     ▶ מסתובב עד שיודעים — ובחסום מתחלף בהסבר */
  resolve();
  paintCover();

  const playFile = src => {
    video = el('video', { src, playsInline: true, preload: 'auto', autoplay: true });
    video.setAttribute('playsinline', '');
    if (still) video.poster = still;
    /* רק סרטון לאורך ממלא את המסך; לרוחב או מרובע נשאר שלם — במילוי נחתך
       ממנו יותר מחצי. video מתאפס כשהקובץ נכשל, ואירוע שכבר בתור עוד מגיע */
    video.addEventListener('loadedmetadata', () => { if (video) video.classList.toggle('wide', video.videoWidth >= video.videoHeight); });
    video.addEventListener('timeupdate', () => {
      if (!video || !video.duration) return;
      progress.hidden = false;
      if (!dragging) paintTime(video.currentTime);
    });
    video.addEventListener('pause', () => { layer.classList.add('paused'); toggleBtn.setAttribute('aria-label', 'המשך ניגון'); });
    video.addEventListener('play', () => { layer.classList.remove('paused'); toggleBtn.setAttribute('aria-label', 'עצירה'); });
    /* כתובת חתומה שפגה — מרעננים פעם אחת; לא הצליח — חוזרים ל-1ג׳ */
    let retried = false;
    video.onerror = async () => {
      if (!video) return;
      if (retried) { toVideoOut(); return; }
      retried = true;
      const fresh = await refreshMedia(v.url, v.full);
      if (!video) return;
      if (fresh.media && fresh.media !== video.src) {
        if (owner) updateVideo(v.id, { media: fresh.media });
        video.src = fresh.media;
        video.load();
        video.play().catch(() => {});
        return;
      }
      toVideoOut(fresh.blocked);
    };
    stage.textContent = '';
    stage.appendChild(video);
    video.play().catch(() => layer.classList.add('paused'));
  };
  /* blocked: הנגן שלהם לא יעזור — רק ישלח אליהם, ולכן לא נופלים אליו */
  const toVideoOut = blocked => {
    if (video) { video.remove(); video = null; }
    progress.hidden = true;
    dragging = false;
    layer.classList.remove('paused', 'seeking');
    if (!blocked && fallback) { mode = 'embed'; playEmbed(fallback); paintRail(); return; }
    mode = blocked ? 'blocked' : 'out';
    stage.textContent = '';
    stage.appendChild(cover);
    paintCover();
    paintRail();
  };
  /* --- הזמן --- */
  const clock = sec => {
    const n = Math.max(0, Math.floor(sec || 0));
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  };
  const paintTime = t => {
    if (!video || !video.duration) return;
    const d = video.duration;
    const at = Math.min(100, Math.max(0, t / d * 100)) + '%';
    fill.style.width = at; knob.style.left = at; bubble.style.left = at;
    nowAt.textContent = clock(t); total.textContent = clock(d);
    bubble.textContent = clock(t) + ' / ' + clock(d);
    progress.setAttribute('aria-valuemax', String(Math.round(d)));
    progress.setAttribute('aria-valuenow', String(Math.round(t)));
    progress.setAttribute('aria-valuetext', clock(t) + ' מתוך ' + clock(d));
  };
  const jump = sec => {
    if (!video || !video.duration) return;
    video.currentTime = Math.min(video.duration - 0.05, Math.max(0, video.currentTime + sec));
    paintTime(video.currentTime);
  };
  /* גרירה: הסרטון נעצר בזמן הגרירה וממשיך אחריה, אם ניגן. fastSeek (סאפרי)
     קופץ למסגרת הקרובה — מהיר תוך כדי; בשחרור — הזמן המדויק. */
  let dragging = false;
  let resume = false;
  const timeAt = x => {
    const r = progress.firstChild.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * video.duration;
  };
  const seekTo = (t, exact) => {
    if (!exact && video.fastSeek) video.fastSeek(t); else video.currentTime = t;
    paintTime(t);
  };
  progress.addEventListener('pointerdown', e => {
    if (!video || !video.duration) return;
    e.preventDefault();
    dragging = true;
    resume = !video.paused;
    /* הקו מתעבה לפני החישוב — המיקום נמדד על הקו שרואים */
    layer.classList.add('seeking');
    try { progress.setPointerCapture(e.pointerId); } catch (err) { /* דפדפן ישן — הגרירה עובדת גם בלי */ }
    video.pause();
    seekTo(timeAt(e.clientX));
  });
  progress.addEventListener('pointermove', e => { if (dragging && video) seekTo(timeAt(e.clientX)); });
  const endDrag = (e, commit) => {
    if (!dragging) return;
    dragging = false;
    layer.classList.remove('seeking');
    if (!video) return;
    if (commit) seekTo(timeAt(e.clientX), true);
    if (resume) video.play().catch(() => {});
    showCtrl();
  };
  progress.addEventListener('pointerup', e => endDrag(e, true));
  /* בלי commit: בביטול (שיחה נכנסת, מחווה של המערכת) המיקום של האצבע לא אמין */
  progress.addEventListener('pointercancel', e => endDrag(e, false));
  progress.addEventListener('keydown', e => {
    const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
    if (!step) return;
    e.preventDefault();
    jump(step);
  });
  /* --- הפקדים: אחורה משמאל, ▶/❚❚ באמצע, קדימה מימין ---
     בעצירה תמיד; בניגון — אחרי נגיעה, ונעלמים אחרי שלוש שניות בלי מגע. כך
     10 השניות עובדות בלי לעצור (בעל הריפו: "צריך לאפשר אותה כשהסרטון רץ"). */
  let ctrlTimer = 0;
  const showCtrl = () => {
    layer.classList.add('ctrl');
    clearTimeout(ctrlTimer);
    ctrlTimer = setTimeout(() => { if (!dragging) layer.classList.remove('ctrl'); }, 3000);
  };
  const hideCtrl = () => { clearTimeout(ctrlTimer); layer.classList.remove('ctrl'); };
  const toggle = () => {
    if (!video) return;
    if (video.paused) video.play().catch(() => {}); else video.pause();
    showCtrl();
  };
  const toggleBtn = el('button.resume', { type: 'button', 'aria-label': 'עצירה', onclick: toggle }, icon('play', 'pl'), icon('pause', 'pz'));
  const mid = el('div.mid', null,
    el('button.skip', { type: 'button', 'aria-label': '10 שניות אחורה', onclick: () => { jump(-10); showCtrl(); } }, icon('back10'), el('span.num', { text: '10' })),
    toggleBtn,
    el('button.skip', { type: 'button', 'aria-label': '10 שניות קדימה', onclick: () => { jump(10); showCtrl(); } }, icon('fwd10'), el('span.num', { text: '10' })));

  /* מה שקרה בנגיעה כפולה ובלחיצה ארוכה — רואים מיד, ונעלם */
  const hint = el('div.seekhint', { 'aria-hidden': 'true' }, icon('fwd10', 'f'), icon('back10', 'b'), el('span.num'));
  let hintTimer = 0;
  const flash = (side, total) => {
    hint.classList.toggle('fwd', side > 0);
    hint.lastChild.textContent = total + ' שניות';
    hint.classList.remove('on');
    void hint.offsetWidth;
    hint.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('on'), 700);
  };
  const fastTag = el('div.fasttag', { 'aria-hidden': 'true' }, el('span.num', { text: '2×' }), icon('ff'));

  const playEmbed = src => {
    const frame = el('iframe', { src, title: v.title, allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share', allowFullscreen: true });
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    stage.textContent = '';
    /* אינסטגרם: רק החלון של הסרטון, בלי הכותרת, הלייקים והתגובות שלהם —
       החישוב ב-.igcrop ב-app.css */
    if (v.platform === 'instagram') {
      const box = el('div.igcrop', null, frame);
      /* בפוסט הקופסה בפרופורציה של התמונה (מרובע, 4:5, לרוחב), ולא יותר
         גבוהה מ-4:5. ברילס היא תמיד 4:5 — התמונה שלו 9:16 ולא תעזור. */
      const img = cover.querySelector('img');
      if (!isPortrait(playable(v)) && img && img.naturalWidth) {
        const r = Math.min(1.25, Math.max(0.52, img.naturalHeight / img.naturalWidth));
        box.style.setProperty('--ig-r', r.toFixed(3));
      }
      stage.appendChild(box);
      return;
    }
    if (isPortrait(playable(v))) frame.classList.add('tall');
    stage.appendChild(frame);
  };

  bigPlay.onclick = async () => {
    if (mode === 'out') { window.open(v.url, '_blank', 'noopener'); return; }
    if (!mode) {
      await resolve();
      /* אחרי המתנה לרשת הדפדפן כבר לא מתייחס לזה כלחיצה, ולא יפתח חלון —
         מתברר שאין קובץ? התווית "מתנגן באינסטגרם" מופיעה, ולוחצים שוב.
         חסום — ההסבר מופיע במקום ▶ */
      if (mode === 'out' || mode === 'blocked') return;
    }
    if (mode === 'file') playFile(v.media);
    else if (mode === 'embed') playEmbed(embed || fallback);
  };
  /* --- מחוות על הסרטון, כמו ביוטיוב ---
     נגיעה: הפקדים מופיעים או נעלמים (ובעצירה — ממשיכים). נגיעה כפולה: ימין
     10 קדימה, שמאל 10 אחורה, וכל נגיעה נוספת מיד אחריה — עוד 10. לחיצה
     ארוכה: מהירות כפולה כל עוד האצבע על המסך. הנגיעה הבודדת מחכה רגע
     (TAP), כדי לדעת שלא באה אחריה שנייה. כשהמתכון פתוח — הנגיעה סוגרת אותו
     (למטה), ולכן כאן לא עושים כלום. */
  const TAP = 300;
  const HOLD = 450;
  let lastTap = null;
  let tapTimer = 0;
  let streak = null;
  let holdTimer = 0;
  let holding = false;
  const onVideo = e => video && e.target === video && !recipe;
  const sideOf = x => { const r = stage.getBoundingClientRect(); return x - r.left > r.width / 2 ? 1 : -1; };
  const stopHold = () => {
    clearTimeout(holdTimer);
    if (holding && video) video.playbackRate = 1;
    holding = false;
    layer.classList.remove('fast');
  };
  stage.addEventListener('pointerdown', e => {
    if (!onVideo(e)) return;
    stopHold();
    if (!video.paused) holdTimer = setTimeout(() => {
      if (!video) return;
      holding = true;
      video.playbackRate = 2;
      layer.classList.add('fast');
    }, HOLD);
  });
  stage.addEventListener('pointerup', e => {
    if (!onVideo(e)) { stopHold(); return; }
    const held = holding;
    stopHold();
    if (held) return;
    const now = Date.now();
    const side = sideOf(e.clientX);
    if (streak && streak.side === side && now - streak.at < 800) {
      clearTimeout(tapTimer); lastTap = null;
      streak.at = now; streak.total += 10;
      jump(10 * side); flash(side, streak.total);
      return;
    }
    if (lastTap && lastTap.side === side && now - lastTap.at < TAP) {
      clearTimeout(tapTimer); lastTap = null;
      streak = { side, at: now, total: 10 };
      jump(10 * side); flash(side, 10);
      return;
    }
    streak = null;
    lastTap = { side, at: now };
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      lastTap = null;
      if (!video) return;
      if (video.paused) toggle();
      else if (layer.classList.contains('ctrl')) hideCtrl();
      else showCtrl();
    }, TAP);
  });
  stage.addEventListener('pointercancel', stopHold);
  /* לחיצה ארוכה באייפון פותחת תפריט של המערכת על הסרטון */
  stage.addEventListener('contextmenu', e => { if (video && e.target === video) e.preventDefault(); });

  /* --- מסך מלא: מסתיר את כל מה שצף, ובאייפון — המסך המלא של המערכת --- */
  let immersive = false;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const setImmersive = on => { immersive = on; layer.classList.toggle('immersive', on); };
  const enterFull = async () => {
    const canElement = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    /* באייפון אין מסך מלא לאלמנט, רק הנגן של המערכת — והוא בלי הנגיעה הכפולה
       והלחיצה הארוכה. סרטון לאורך כבר ממלא את המסך, ולכן אצלנו: רק מסתירים את
       מה שצף. לרוחב — הנגן של המערכת, כי רק הוא מסתובב לרוחב */
    const wide = video && video.classList.contains('wide');
    if (wide && !canElement && video.webkitEnterFullscreen) { try { video.webkitEnterFullscreen(); return; } catch (e) { /* נופלים למצב הממלא */ } }
    setImmersive(true);
    try {
      if (layer.requestFullscreen) await layer.requestFullscreen({ navigationUI: 'hide' });
      else if (layer.webkitRequestFullscreen) layer.webkitRequestFullscreen();
    } catch (e) { /* לא הורשה — המצב הממלא מספיק */ }
  };
  const leaveFull = () => {
    setImmersive(false);
    if (!fsEl()) return;
    try { const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if (r && r.catch) r.catch(() => {}); } catch (e) { /* כבר יצא */ }
  };
  const onFs = () => { if (!fsEl() && immersive) setImmersive(false); };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  /* סגירת הנגן סוגרת קודם את מה שפתוח מעליו (המתכון, ⋯). בלי זה הצעד
     שלהם נשאר בהיסטוריה, ו"חזרה" הבאה בבית לא עשתה כלום. */
  let menuDone = null;
  const shutAll = () => {
    if (menuDone) menuDone();
    if (recipe) recipe.close();
    close();
  };
  const shut = el('button.ibtn', { type: 'button', 'aria-label': 'סגירה', onclick: () => shutAll() }, icon('x'));
  const full = el('button.ibtn', { type: 'button', 'aria-label': 'מסך מלא', onclick: enterFull }, icon('expand'));
  const exitFull = el('button.ibtn.exit-full', { type: 'button', 'aria-label': 'יציאה ממסך מלא', onclick: leaveFull }, icon('shrink'));
  const topov = el('div.topov', null, full, shut);

  /* --- הכיתוב: קטגוריה, שם, שתי שורות, "המתכון" --- */
  const cap = el('div.cap');
  const cat = v.category && categoryName(v.category);
  if (cat) cap.appendChild(el('span.chip', { 'aria-pressed': 'true', text: cat }));
  cap.appendChild(el('h2', { text: v.title }));
  if (v.note) {
    /* div ולא כפתור: באייפון הקיצור לשתי שורות לא עובד על כפתור, ו"שתי שורות" יצאו שמונה */
    const line = el('div.sum', { text: summary(v.note) });
    line.onclick = () => openRecipe();
    const more = el('button.more', { type: 'button', onclick: () => openRecipe() }, icon('up'), 'המתכון');
    cap.append(line, more);
  }

  /* --- העמודה בצד --- */
  const railBtn = (ic, label, fn, href) => {
    const b = href
      ? el('a.ibtn', { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': label }, icon(ic))
      : el('button.ibtn', { type: 'button', 'aria-label': label, onclick: fn }, icon(ic));
    return el('div.rb', null, b, el('span', { text: label }));
  };
  const rail = el('div.side');
  const paintRail = () => {
    rail.textContent = '';
    /* ב-1ג׳ ▶ כבר פותח את אינסטגרם, ובחסום יש "פתיחה באינסטגרם" באמצע —
       אין צורך בשני כפתורים לאותו מקום */
    if (mode !== 'out' && mode !== 'blocked') rail.appendChild(railBtn('ext', name, null, v.url));
    if (owner) rail.appendChild(railBtn('pen', 'עריכה', () => { shutAll(); ctx.onEdit(v); }));
    rail.appendChild(railBtn('dots', 'עוד', () => openMenu()));
  };
  paintRail();
  const repaintCover = paintCover;
  /* כשמתברר שאין קובץ, גם העמודה מתעדכנת */
  const watch = () => { if (pending) pending.then(() => { repaintCover(); paintRail(); }); };
  watch();

  /* --- גיליון המתכון ---
     עולה מלמטה, והסרטון מתכווץ לחלק העליון וממשיך לנגן. גרירת הידית
     למעלה — מתכון מלא; למטה, נגיעה בסרטון, או "חזרה" — סגירה. */
  let recipe = null;
  function openRecipe() {
    if (recipe) return;
    const panel = el('div.rsheet', { role: 'region', 'aria-label': 'המתכון' });
    const grab = el('div.grab-zone', null, el('div.grab'));
    const head = el('div.sh-head', null, el('h3', { text: v.title }),
      el('button.ibtn.flat', { type: 'button', 'aria-label': 'עוד', onclick: () => openMenu() }, icon('dots')));
    const meta = el('div.meta', { text: [cat, name, 'נשמר ' + whenText(v.at)].filter(Boolean).join(' · ') });
    panel.append(el('div.sh-top', null, grab, head), meta, recipeBody(v, () => ctx.onChanged()));
    layer.appendChild(panel);
    layer.classList.add('reading');
    /* הגיליון בתחתית — הפס שמתחתיו בצבע שלו, ולא שחור מתחת ללבן */
    edge.set(sheetTone);
    const shutRecipe = openLayer(() => {
      edge.set('#000');
      layer.classList.remove('reading', 'reading-full');
      panel.classList.add('going');
      setTimeout(() => panel.remove(), 220);
      recipe = null;
    });
    recipe = { close: shutRecipe };
    requestAnimationFrame(() => panel.classList.add('on'));
    /* גרירה בידית ובכותרת */
    let y0 = null;
    const down = e => { y0 = e.clientY; };
    const up = e => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null;
      if (dy < -30) layer.classList.add('reading-full');
      else if (dy > 50) { if (layer.classList.contains('reading-full')) layer.classList.remove('reading-full'); else shutRecipe(); }
      else if (Math.abs(dy) < 6 && e.currentTarget === grab) layer.classList.toggle('reading-full');
    };
    [grab, head].forEach(z => { z.addEventListener('pointerdown', down); z.addEventListener('pointerup', up); });
  }
  /* נגיעה בסרטון כשהגיליון פתוח — חוזרים לסרטון. הסרטון ממלא את הבמה,
     ולכן הנגיעה נוחתת עליו ולא על הבמה; היא לא עוצרת אותו. ▶ נשאר ▶. */
  stage.addEventListener('click', e => {
    if (!recipe || e.target.closest('.cta')) return;
    e.stopPropagation();
    recipe.close();
  }, true);

  /* --- ⋯ --- */
  function openMenu() {
    const dim = el('div.mdim');
    const menu = el('div.amenu', { role: 'menu' });
    const done = openLayer(() => { dim.remove(); menu.remove(); menuDone = null; });
    menuDone = done;
    dim.onclick = () => done();
    const item = (ic, text, fn, cls) => el('button.it' + (cls || ''), { type: 'button', onclick: fn }, icon(ic), text);
    const g1 = el('div.mgrp');
    if (owner) {
      g1.appendChild(item('pen', 'עריכת השם, הקטגוריה וההערה', () => { shutAll(); ctx.onEdit(v); }));
      g1.appendChild(item('tag', 'העברה לקטגוריה אחרת', () => {
        g1.textContent = '';
        [{ id: '', name: 'בלי קטגוריה' }, ...listCategories()].forEach(c => g1.appendChild(item(c.id === (v.category || '') ? 'check' : 'tag', c.name, () => {
          updateVideo(v.id, { category: c.id || null });
          v.category = c.id || null;
          done(); toast('הועבר ל"' + c.name + '"'); ctx.onChanged();
        })));
      }));
    }
    if (v.note) g1.appendChild(item('copy', 'העתקת המתכון', async () => {
      done();
      try { await navigator.clipboard.writeText(v.title + '\n\n' + v.note + '\n\n' + v.url); toast('המתכון הועתק'); }
      catch (e) { toast('הדפדפן לא נתן להעתיק'); }
    }));
    g1.appendChild(el('a.it', { href: v.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => done() }, icon('ext'), 'פתיחה ב' + name));
    if (owner && !ctx.posterUrls.has(v.id)) {
      g1.appendChild(item('sync', 'להביא תמונה מחדש', () => {
        g1.textContent = '';
        g1.appendChild(el('div.it.plain', null, ctx.fixPoster(v, () => {})));
      }));
    }
    menu.appendChild(g1);
    if (owner) {
      const g2 = el('div.mgrp');
      const del = item('trash', 'מחיקת המתכון', () => {
        /* לחיצה שנייה — אחרי שהכפתור אומר בדיוק מה יקרה */
        if (!del.classList.contains('sure')) { del.classList.add('sure'); del.lastChild.textContent = 'למחוק את "' + v.title + '"? לחיצה נוספת מוחקת'; return; }
        removeVideo(v.id);
        shutAll();
        toast('נמחק');
        ctx.onChanged(true);
      }, '.del');
      g2.appendChild(del);
      menu.appendChild(g2);
    }
    menu.appendChild(el('button.mcancel', { type: 'button', text: 'ביטול', onclick: () => done() }));
    layer.append(dim, menu);
  }

  /* Escape סוגר את השכבה העליונה בלבד, כמו "חזרה" */
  offKey = onEscape(() => {
    if (immersive) leaveFull();
    else if (menuDone) menuDone();
    else if (recipe) recipe.close();
    else close();
  });
  layer.append(stage, el('div.scrim-t'), el('div.scrim-b'), hint, fastTag, topov, cap, rail, progress, mid, exitFull);
  document.body.appendChild(layer);
  shut.focus();

  /* ניקוי מאזיני המסך המלא כשהנגן נסגר */
  const obs = new MutationObserver(() => {
    if (layer.isConnected) return;
    document.removeEventListener('fullscreenchange', onFs);
    document.removeEventListener('webkitfullscreenchange', onFs);
    obs.disconnect();
  });
  obs.observe(document.body, { childList: true });
}
