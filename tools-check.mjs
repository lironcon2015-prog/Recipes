/* בדיקה לפני כל פרסום: node tools-check.mjs

   שלושה דברים שנכשלים בשקט בלעדיה (כולם כבר קרו ב-nines):
   · VERSION ב-sw.js וב-js/version.js שונים — המסך מציג גרסה אחת והמטמון
     מחזיק אחרת, ואי אפשר לדעת אם העדכון הגיע.
   · קובץ JS שלא ב-ASSETS — לא נשמר, והאפליקציה נשברת בלי רשת.
   · קובץ JS שלא ב-modulepreload — סבב רשת נוסף בכל פתיחה ראשונה.
   ובנוסף: הגרסה גבוהה מזו שב-origin/main, כשהקוד השתנה. */

import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const fail = [];
const sw = readFileSync('sw.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const swVersion = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
const appVersion = (readFileSync('js/version.js', 'utf8').match(/VERSION = '([^']+)'/) || [])[1];

if (!swVersion || swVersion !== appVersion) fail.push(`VERSION שונה: sw.js=${swVersion} · js/version.js=${appVersion}`);

for (const f of readdirSync('js').filter(f => f.endsWith('.js'))) {
  if (!sw.includes(`'./js/${f}'`)) fail.push(`js/${f} חסר ב-ASSETS ב-sw.js`);
  if (f !== 'app.js' && !html.includes(`href="js/${f}"`)) fail.push(`js/${f} חסר ב-modulepreload ב-index.html`);
  try { execSync(`node --check js/${f}`, { stdio: 'pipe' }); }
  catch (e) { fail.push(`js/${f}: שגיאת תחביר\n${e.stderr}`); }
}
for (const m of sw.matchAll(/'\.\/([^']+\.[a-z0-9]+)'/g)) {
  try { readFileSync(m[1]); } catch (e) { fail.push(`${m[1]} ב-ASSETS אבל לא קיים`); }
}

/* מול מה שכבר פורסם: שינוי קוד בלי העלאת גרסה לא יגיע לטלפון */
try {
  execSync('git fetch -q origin main', { stdio: 'ignore' });
  const published = (execSync('git show origin/main:sw.js', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().match(/const VERSION = '([^']+)'/) || [])[1];
  const code = execSync('git diff --name-only origin/main -- index.html css js sw.js manifest.webmanifest icons fonts').toString().trim();
  if (published && code && published === swVersion) fail.push(`הקוד השתנה מול origin/main אבל הגרסה עדיין ${swVersion}`);
  console.log(`פורסם: ${published || '—'} · כאן: ${swVersion}${code ? '' : ' (אין שינוי קוד)'}`);
} catch (e) {
  console.log('origin/main עוד בלי האפליקציה — בדיקת הגרסה מול הפרסום דולגה');
}

if (fail.length) { console.error('✗ ' + fail.join('\n✗ ')); process.exit(1); }
console.log('✓ גרסה ' + swVersion + ' · כל הקבצים במטמון ובטעינה מוקדמת');
