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

   הנגינה, התמונות והקישור עצמו — videos.js ו-preview.js, כמו קודם. */

import {
  categoryName, listCategories, updateVideo, removeVideo, getVideo,
  platformName, embedUrl, isPortrait, playable, mediaFresh, posterCandidates, readOnly
} from './videos.js';
import { refreshMedia } from './preview.js';
import { el, icon, toast, whenText, openLayer, onEscape } from './ui.js';

/* הנגן המשובץ של אלה הוא דף שלם — מנגנים אצלם רק את הקובץ */
const CHROME = new Set(['instagram', 'facebook', 'tiktok']);
const FETCHABLE = new Set(['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'vimeo']);

/* --- ההערה כמתכון ---
   טקסט חופשי שהודבק מאינסטגרם. לא ממציאים מבנה, רק מזהים את הסימנים שכבר
   בו: שורה קצרה שנגמרת בנקודתיים — כותרת ("לרול:"); שורה שמתחילה ב-* · - •
   — רכיב; במספר — שלב; "קלוריות: … | חלבון: …" — ערכים. כל השאר פסקה. */
const BULLET = /^\s*[*\-•·‣▪●◦]\s*/;
const STEP = /^\s*\d{1,2}[.)]\s+/;
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
    const parts = line.split(/\s*\|\s*/).filter(Boolean);
    if (parts.length > 1 && parts.filter(p => p.includes(':')).length >= 2) {
      /* "ערכים תזונתיים לכל המנה: קלוריות: כ-195" — הכותרת לפני הזוג הראשון */
      const first = parts[0].split(':');
      if (first.length > 2) parts[0] = first.slice(1).join(':').trim();
      blocks.push({ type: 'facts', list: parts.map(p => {
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

/* "כ-195 קק"ל" → "195 קק"ל"; ערך עם יחידה ושם — "34 גרם חלבון" */
function factText(f) {
  const v = f.v.replace(/^כ-?\s*/, '');
  if (!f.k || /קלורי/.test(f.k)) return v;
  return v + ' ' + f.k;
}

/** שתי השורות שמתחת לשם: הערכים, ואז הכותרת הראשונה ושלושה רכיבים */
export function summary(text) {
  const blocks = parseNote(text);
  const out = [];
  const facts = blocks.find(b => b.type === 'facts');
  if (facts) out.push(facts.list.map(factText).join(' · ') + '.');
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

function recipeBody(v) {
  const box = el('div.rbody');
  const blocks = parseNote(v.note);
  const checks = readChecks(v.id);
  let n = 0;
  let firstFacts = true;
  blocks.forEach(b => {
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
  const progress = el('div.progress', { hidden: true }, el('i'));

  let offKey = null;
  let video = null;
  const close = openLayer(() => {
    if (offKey) offKey();
    if (fsEl()) leaveFull();
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    layer.remove();
  });

  /* --- מה מנגנים ---
     file: קובץ הווידאו (נקי, ממלא את המסך) · embed: נגן נקי (יוטיוב וכו')
     · out: אין קובץ — 1ג׳, התמונה ו"מתנגן באינסטגרם" · null: עוד לא ידוע */
  let mode = v.media && mediaFresh(v) ? 'file' : (embed ? 'embed' : null);
  let pending = null;
  const resolve = () => {
    if (mode || pending) return pending;
    if (!canFetch) { mode = fallback ? 'embed' : 'out'; return null; }
    pending = refreshMedia(v.url).then(got => {
      pending = null;
      if (got.media) {
        if (owner) updateVideo(v.id, { media: got.media });
        v.media = got.media; v.mediaAt = Date.now();
        mode = 'file';
      } else mode = fallback ? 'embed' : 'out';
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
  const cta = el('div.cta', null, bigPlay, outLink);
  cover.appendChild(cta);
  const paintCover = () => {
    /* 1ג׳: ▶ עצמו פותח את אינסטגרם — אותה לחיצה, יעד אחר, והתווית אומרת לאן */
    outLink.hidden = mode !== 'out';
    bigPlay.classList.toggle('busy', !!pending);
  };
  paintCover();
  stage.appendChild(cover);
  /* יודעים מראש אם יש קובץ, כדי ש-▶ יתנהג נכון כבר בלחיצה הראשונה */
  resolve();

  const playFile = src => {
    video = el('video', { src, playsInline: true, preload: 'auto', autoplay: true });
    video.setAttribute('playsinline', '');
    if (still) video.poster = still;
    /* סרטון לרוחב לא נחתך למילוי — רק סרטון לאורך ממלא */
    video.addEventListener('loadedmetadata', () => { video.classList.toggle('wide', video.videoWidth > video.videoHeight); });
    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      progress.hidden = false;
      progress.firstChild.style.width = (video.currentTime / video.duration * 100) + '%';
    });
    video.addEventListener('pause', () => layer.classList.add('paused'));
    video.addEventListener('play', () => layer.classList.remove('paused'));
    /* כתובת חתומה שפגה — מרעננים פעם אחת; לא הצליח — חוזרים ל-1ג׳ */
    let retried = false;
    video.onerror = async () => {
      if (retried) { toVideoOut(); return; }
      retried = true;
      const fresh = await refreshMedia(v.url);
      if (fresh.media && fresh.media !== video.src) {
        if (owner) updateVideo(v.id, { media: fresh.media });
        video.src = fresh.media;
        video.load();
        video.play().catch(() => {});
        return;
      }
      toVideoOut();
    };
    stage.textContent = '';
    stage.appendChild(video);
    video.play().catch(() => layer.classList.add('paused'));
  };
  const toVideoOut = () => {
    if (video) { video.remove(); video = null; }
    progress.hidden = true;
    if (fallback) { mode = 'embed'; playEmbed(fallback); paintRail(); return; }
    mode = 'out';
    if (video) { video.remove(); video = null; }
    stage.textContent = '';
    stage.appendChild(cover);
    progress.hidden = true;
    paintCover();
    paintRail();
  };
  const playEmbed = src => {
    const frame = el('iframe', { src, title: v.title, allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share', allowFullscreen: true });
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    if (isPortrait(playable(v))) frame.classList.add('tall');
    stage.textContent = '';
    stage.appendChild(frame);
  };

  bigPlay.onclick = async () => {
    if (mode === 'out') { window.open(v.url, '_blank', 'noopener'); return; }
    if (!mode) {
      await resolve();
      /* אחרי המתנה לרשת הדפדפן כבר לא מתייחס לזה כלחיצה, ולא יפתח חלון —
         מתברר שאין קובץ? התווית "מתנגן באינסטגרם" מופיעה, ולוחצים שוב */
      if (mode === 'out') return;
    }
    if (mode === 'file') playFile(v.media);
    else if (mode === 'embed') playEmbed(embed || fallback);
  };
  /* נגיעה בסרטון שמתנגן עוצרת וממשיכה — כמו ברילס */
  stage.addEventListener('click', e => {
    if (!video || e.target !== video) return;
    if (video.paused) video.play().catch(() => {}); else video.pause();
  });

  /* --- מסך מלא: מסתיר את כל מה שצף, ובאייפון — המסך המלא של המערכת --- */
  let immersive = false;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const setImmersive = on => { immersive = on; layer.classList.toggle('immersive', on); };
  const enterFull = async () => {
    const canElement = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    if (video && !canElement && video.webkitEnterFullscreen) { try { video.webkitEnterFullscreen(); return; } catch (e) { /* נופלים למצב הממלא */ } }
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
    /* ב-1ג׳ ▶ כבר פותח את אינסטגרם, ואין צורך בשני כפתורים לאותו מקום */
    if (mode !== 'out') rail.appendChild(railBtn('ext', name, null, v.url));
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
    panel.append(grab, head, meta, recipeBody(v));
    layer.appendChild(panel);
    layer.classList.add('reading');
    const shutRecipe = openLayer(() => {
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
  layer.append(stage, el('div.scrim-t'), el('div.scrim-b'), topov, cap, rail, progress, exitFull);
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
