// Interface-language tooling.
//   node scripts/i18n.mjs keys    → writes src/i18n/keys.ts from every t('…') in the code
//   node scripts/i18n.mjs check   → lists on-screen English that is not wrapped in t()
//   node scripts/i18n.mjs missing → per built-in language, the keys it does not translate yet
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SRC = [path.join(root, 'App.tsx'), ...walk(path.join(root, 'src'))].filter(
  // the i18n folder's own index.ts holds a message too; the generated and table files do not
  (f) => /\.(ts|tsx)$/.test(f) && !/[\\/]i18n[\\/](keys|t|machine)\.ts$|[\\/]catalogs[\\/]/.test(f) && !f.includes(`${path.sep}learn${path.sep}italian.ts`)
);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function parse(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (c) => visit(c, fn));
}

const isT = (node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === 't' || node.expression.text === 'tk');

/** Every literal passed as the first argument to t(). */
function collectKeys() {
  const keys = new Set();
  const problems = [];
  for (const file of SRC) {
    const sf = parse(file);
    visit(sf, (node) => {
      if (!isT(node)) return;
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) keys.add(arg.text);
      // t(variable) translates text marked with tk() where it was defined
      else if (node.expression.text === 'tk') problems.push(`${path.relative(root, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} tk() needs a plain string`);
    });
  }
  return { keys, problems };
}

function languageNames() {
  const src = fs.readFileSync(path.join(root, 'src', 'languages.ts'), 'utf8');
  return [...src.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
}

const PROPS = new Set(['label', 'title', 'hint', 'placeholder', 'caption', 'accessibilityLabel', 'accessibilityHint']);
const english = (s) => /[A-Za-z]{2,}/.test(s) && !/^[a-z]+([A-Z][a-z]*)*$/.test(s.trim()); // not an identifier

/** On-screen strings that are not translated: JSX text, text props, and messages shown to people. */
function check() {
  const found = [];
  for (const file of SRC) {
    const sf = parse(file);
    const where = (n) => `${path.relative(root, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    visit(sf, (node) => {
      if (ts.isJsxText(node) && english(node.text) && node.text.trim()) found.push(`${where(node)}  text  ${node.text.trim().slice(0, 70)}`);
      if (ts.isJsxAttribute(node) && PROPS.has(node.name.getText()) && node.initializer) {
        const init = node.initializer;
        if (ts.isStringLiteral(init) && english(init.text)) found.push(`${where(node)}  ${node.name.getText()}  ${init.text}`);
      }
      // string literals inside JSX expressions or calls that show messages
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && english(node.getText().slice(1, -1))) {
        let p = node.parent;
        if (p && isT(p)) return;
        // skip imports, object keys, styles, comparisons and other non-display uses
        if (!p || ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isPropertyAssignment(p) && p.name === node) return;
        if (ts.isBinaryExpression(p) && /===|!==|==|!=/.test(p.operatorToken.getText())) return;
        if (ts.isCaseClause(p) || ts.isElementAccessExpression(p)) return;
        const shown = (n) => {
          for (let q = n.parent, depth = 0; q && depth < 6; q = q.parent, depth++) {
            if (ts.isJsxExpression(q)) return true;
            if (ts.isCallExpression(q)) {
              const name = q.expression.getText();
              if (/^(setError|setNote|setSaveNote|setMessage|setStatusText|Alert\.alert|setWarning|setInfo)$/.test(name)) return true;
              if (name === 't') return false;
              return false;
            }
            if (ts.isNewExpression(q) && q.expression.getText() === 'Error') return true;
            if (ts.isPropertyAssignment(q) && /^(label|title|text|hint|message)$/.test(q.name.getText())) return true;
          }
          return false;
        };
        if (shown(node)) found.push(`${where(node)}  string  ${node.getText().slice(0, 80)}`);
      }
    });
  }
  return found;
}

const cmd = process.argv[2];
if (cmd === 'keys') {
  const { keys, problems } = collectKeys();
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  for (const n of [...languageNames(), 'Detect language']) keys.add(n);
  const list = [...keys].sort();
  const version = crypto.createHash('sha1').update(list.join('\n')).digest('hex').slice(0, 10);
  const out =
    '// Generated by `node scripts/i18n.mjs keys` — do not edit by hand.\n' +
    '// Every English interface string, which is also its own translation key.\n' +
    `export const KEYS_VERSION = '${version}';\n\n` +
    `export const KEYS: string[] = ${JSON.stringify(list, null, 2)};\n`;
  fs.writeFileSync(path.join(root, 'src', 'i18n', 'keys.ts'), out);
  console.log(`${list.length} keys, version ${version}`);
} else if (cmd === 'check') {
  const found = check();
  console.log(found.join('\n') || 'nothing untranslated found');
  console.log(`\n${found.length} found`);
} else if (cmd === 'missing') {
  const { keys } = collectKeys();
  for (const n of [...languageNames(), 'Detect language']) keys.add(n);
  const dir = path.join(root, 'src', 'i18n', 'catalogs');
  for (const f of fs.readdirSync(dir).filter((f) => /^[a-z]{2}(-[A-Z]{2})?\.json$/.test(f))) {
    const cat = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const miss = [...keys].filter((k) => !(k in cat));
    console.log(`${f}: ${miss.length} missing${miss.length ? '\n  ' + miss.slice(0, 15).join('\n  ') : ''}`);
  }
} else {
  console.log('usage: node scripts/i18n.mjs keys|check|missing');
}
