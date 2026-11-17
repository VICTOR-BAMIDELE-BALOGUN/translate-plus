// Rewrites the exported web build to use relative asset paths, so the same folder
// works at a domain root, in a subfolder, or on any static host, with no rebuild.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'dist';
const file = join(dir, 'index.html');
const before = readFileSync(file, 'utf8');
const after = before.replace(/(src|href)="\/(?!\/)/g, '$1="./');
if (before === after) {
  console.log('nothing to rewrite (paths are already relative)');
} else {
  writeFileSync(file, after);
  console.log('made asset paths relative in', file);
}
