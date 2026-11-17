// Verifies an exported web build is installable: manifest, icons, service worker,
// and a bundle path that matches where the site is actually served from.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'dist';
const fail = (m) => {
  console.error('web build check failed:', m);
  process.exit(1);
};

const html = readFileSync(join(dir, 'index.html'), 'utf8');
for (const needle of ['manifest.json', 'apple-touch-icon', 'serviceWorker', 'theme-color']) {
  if (!html.includes(needle)) fail(`index.html is missing ${needle}`);
}

const script = html.match(/<script src="([^"]+)"/)?.[1];
if (!script) fail('index.html has no bundle script');
// a relative path is what makes the same folder work at a domain root or in a subfolder
if (!script.startsWith('./_expo/')) fail(`bundle path ${script} is not relative — run scripts/make-portable.mjs`);
if (!existsSync(join(dir, script.replace('./', '')))) fail(`bundle ${script} is not in the output`);
for (const ref of html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)) fail(`absolute path ${ref[1]} breaks in a subfolder`);

const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
if (manifest.display !== 'standalone') fail('manifest must use display: standalone to install');
if (!manifest.icons?.some((i) => i.purpose === 'maskable')) fail('manifest needs a maskable icon for Android');
for (const icon of manifest.icons) {
  const rel = icon.src.replace(/^\.\//, '');
  if (!existsSync(join(dir, rel))) fail(`manifest icon ${icon.src} is missing`);
}
if (!existsSync(join(dir, 'sw.js'))) fail('sw.js is missing');

console.log(`web build OK: ${manifest.icons.length} icons, bundle at ${script}`);
