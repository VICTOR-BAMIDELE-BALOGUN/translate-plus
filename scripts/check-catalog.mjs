// node scripts/check-catalog.mjs it  → checks one built-in translation against the English list
import fs from 'node:fs';
const lang = process.argv[2];
const en = JSON.parse(fs.readFileSync('src/i18n/catalogs/_en.json', 'utf8'));
const tx = JSON.parse(fs.readFileSync(`src/i18n/catalogs/${lang}.json`, 'utf8'));
const vars = (s) => [...new Set(s.match(/\{\w+\}/g) || [])].sort().join(' ');
const bad = [];
en.forEach((e, i) => {
  const t = tx[String(i)];
  if (!t) bad.push(`#${i} missing`);
  else {
    if (vars(t) !== vars(e)) bad.push(`#${i} placeholders: ${vars(e)} vs ${vars(t)}`);
    if (/^ /.test(e) && !/^ /.test(t)) bad.push(`#${i} leading space`);
    if (e.includes('\n') && !t.includes('\n')) bad.push(`#${i} line breaks`);
  }
});
if (Object.keys(tx).length !== en.length) bad.push(`${Object.keys(tx).length} entries, expected ${en.length}`);
console.log(`${lang}: ${bad.length ? bad.join('\n') : 'OK'}`);
