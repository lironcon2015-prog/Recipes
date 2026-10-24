/* שרת הסרטונים: הקובץ של סרטון מאינסטגרם ומפייסבוק, לנגן של המתכונים ושל
   nines. אותה עבודה כמו media ב-apps-script/Code.gs — הנגן המשובץ שלהן נושא את
   הקובץ — אבל בלי ההתעוררות של Apps Script (עד עשרים שניות), וקרוב לטלפון.
   שירות חינמי לכולם (jina) נחסם בגלל אחרים; זה שרת שלך.

   GET /                  → {ok, server: 'cloudflare'} — בדיקה מהדפדפן
   GET /media?url=<קישור> → {ok, media, blocked}

   על הדומיין שלך ולא על workers.dev: הסלולרי של בעל הריפו חוסם את workers.dev
   (כך היה ב-MGivatayim). */

const ORIGINS = ['https://lironcon2015-prog.github.io', 'http://127.0.0.1:8000', 'http://localhost:8000'];
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const DESK_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FETCH_MS = 10000;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin'
    };
    const json = (obj, maxAge) => new Response(JSON.stringify(obj), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? 'public, max-age=' + maxAge : 'no-store', ...cors }
    });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/') return json({ ok: true, server: 'cloudflare', service: 'media' });
    if (url.pathname !== '/media') return json({ ok: false, error: 'לא קיים' });

    const target = url.searchParams.get('url') || '';
    const key = cacheKey(target);
    if (!key) return json({ ok: false, error: 'רק אינסטגרם ופייסבוק' });

    /* אותו סרטון מכמה טלפונים, או ▶ שוב — בלי לפנות שוב לאינסטגרם */
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheReq = new Request('https://media.cache/' + encodeURIComponent(key));
    if (cache) {
      const hit = await cache.match(cacheReq);
      if (hit) return json(await hit.json(), 300);
    }
    let out;
    try {
      out = key.startsWith('ig:') ? await igMedia(key.slice(3)) : await fbMedia(target);
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) });
    }
    /* עד חצי שעה לפני שהקישור לקובץ פג (oe); חסום — יום; בלי קובץ — לא שומרים */
    const ttl = out.media ? Math.min(6 * 3600, Math.max(0, untilExpiry(out.media) - 1800)) : out.blocked ? 86400 : 0;
    if (cache && ttl > 60) {
      ctx.waitUntil(cache.put(cacheReq, new Response(JSON.stringify(out), { headers: { 'Cache-Control': 'max-age=' + ttl } })));
    }
    return json(out);
  }
};

/* ig:<מזהה> לאינסטגרם; fb:<כתובת> לפייסבוק. אחר — null */
export function cacheKey(target) {
  let u;
  try { u = new URL(target); } catch (e) { return null; }
  if (/(^|\.)instagram\.com$/.test(u.hostname)) {
    const m = u.pathname.match(/\/(?:p|reels?|tv)\/([^/?#]+)/);
    return m ? 'ig:' + m[1] : null;
  }
  if (/(^|\.)facebook\.com$/.test(u.hostname)) return 'fb:' + u.origin + u.pathname + u.search;
  return null;
}

async function page(url, ua) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: ctrl.signal });
    return res.ok ? await res.text() : '';
  } finally {
    clearTimeout(timer);
  }
}

/* contextJSON → gql_data.shortcode_media.video_url (בקרוסלה — בפריטים).
   הנתונים מגיעים רק לדפדפן של טלפון. חסום (זכויות, כמעט תמיד על המוזיקה):
   אין קובץ, ו-copyright_blocked — את זה לא עוקפים, רק אומרים מראש */
export async function igMedia(id) {
  const html = await page('https://www.instagram.com/p/' + encodeURIComponent(id) + '/embed/captioned/', PHONE_UA);
  const raw = html.match(/"contextJSON":"((?:\\.|[^"\\])*)"/);
  if (!raw) return { ok: true, media: null, blocked: false };
  const data = JSON.parse(JSON.parse('"' + raw[1] + '"'));
  const sm = data.gql_data && data.gql_data.shortcode_media;
  const kids = (sm && sm.edge_sidecar_to_children && sm.edge_sidecar_to_children.edges) || [];
  const child = kids.find(k => k && k.node && k.node.video_url);
  const file = sm ? (sm.video_url || (child && child.node.video_url)) : null;
  return { ok: true, media: file || null, blocked: !file && !!(data.context && data.context.copyright_blocked) };
}

/* הנגן המשובץ (plugins/video.php): למחשב — hd_src ו-sd_src; לטלפון הוא מפנה
   ל-m.facebook.com ושם רק src (360p) */
export async function fbMedia(href) {
  const plugin = 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(href) + '&show_text=false';
  const desk = await page(plugin, DESK_UA);
  let file = mp4Field(desk, 'hd_src') || mp4Field(desk, 'sd_src');
  if (!file) file = mp4Field((await page(plugin, PHONE_UA)).replace(/&quot;/g, '"').replace(/&amp;/g, '&'), 'src');
  return { ok: true, media: file, blocked: false };
}

/* "key":"https:\/\/…mp4…" — מחרוזת JSON. רק mp4: ל-"src" יש בדף גם תמונות */
export function mp4Field(html, key) {
  const re = new RegExp('"' + key + '":"((?:\\\\.|[^"\\\\])*)"', 'g');
  let m;
  while ((m = re.exec(html))) {
    try {
      const value = JSON.parse('"' + m[1] + '"');
      if (/^https:\/\//.test(value) && /\.mp4/.test(value)) return value;
    } catch (e) { /* מחרוזת פגומה — הבאה בתור */ }
  }
  return null;
}

/* שניות עד ה-oe שבקישור (תפוגה, הקסדצימלי). בלי oe — שעה */
export function untilExpiry(link) {
  const m = /[?&]oe=([0-9A-Fa-f]{8})(?:&|$)/.exec(link);
  return m ? parseInt(m[1], 16) - Math.floor(Date.now() / 1000) : 3600;
}
