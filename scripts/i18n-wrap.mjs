// One-off codemod: wraps on-screen English in t('…'). Edits text in place by position, so
// formatting is kept. Prints every change; anything it is unsure of is left for a person.
//   node scripts/i18n-wrap.mjs <file> [--write]
import fs from 'node:fs';
import ts from 'typescript';

const [file, flag] = process.argv.slice(2);
const src = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const edits = [];
const line = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

const PROPS = new Set(['label', 'title', 'hint', 'placeholder', 'caption', 'accessibilityLabel', 'accessibilityHint']);
const KEYS_SHOWN = new Set(['label', 'text', 'hint', 'title', 'message']);
const SETTERS = /^(setError|setNote|setSaveNote|setMessage|setWarning|setInfo|Alert\.alert)$/;
const isEnglish = (s) => /[A-Za-z]{2,}/.test(s) && !/^[a-z]+([A-Z][a-z]*)*$/.test(s.trim()) && !/^[a-z-]+$/.test(s.trim()) && !/:\/\/|^#|^\.|\/\w/.test(s);
const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const isT = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(t|tk)$/.test(n.expression.text);

function nameFor(expr, used) {
  let base = 'n';
  const txt = expr.getText(sf);
  // the same expression twice in one sentence shares one placeholder
  used.seen = used.seen || new Map();
  if (used.seen.has(txt)) return used.seen.get(txt);
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  else if (ts.isCallExpression(expr) && /langName/.test(expr.expression.getText(sf))) base = 'lang';
  else if (/\.length$/.test(txt)) base = 'count';
  else if (ts.isCallExpression(expr)) base = 'value';
  base = base.replace(/^(s|p|item|props)$/, 'value');
  let name = base;
  for (let i = 2; used.has(name); i++) name = base + i;
  used.add(name);
  used.seen.set(txt, name);
  return name;
}

/** `text ${a} more` → t('text {a} more', { a: a }) */
function templateCall(node) {
  const used = new Set();
  let text = node.head.text;
  const vars = [];
  for (const span of node.templateSpans) {
    const name = nameFor(span.expression, used);
    if (!vars.some((v) => v.startsWith(name + ':'))) vars.push(`${name}: ${span.expression.getText(sf)}`);
    text += `{${name}}` + span.literal.text;
  }
  return `t(${q(text)}, { ${vars.join(', ')} })`;
}

function shownContext(node) {
  // climbs to the nearest place that decides whether this string is displayed
  for (let p = node.parent, child = node; p; child = p, p = p.parent) {
    if (isT(p)) return null;
    if (ts.isJsxAttribute(p)) return PROPS.has(p.name.getText(sf)) ? 'attr' : null;
    if (ts.isJsxExpression(p)) {
      const holder = p.parent;
      if (ts.isJsxAttribute(holder)) return PROPS.has(holder.name.getText(sf)) ? 'attr' : null;
      return 'jsx';
    }
    if (ts.isPropertyAssignment(p)) {
      if (p.name === child) return null;
      return KEYS_SHOWN.has(p.name.getText(sf)) ? 'prop' : null;
    }
    if (ts.isCallExpression(p)) {
      const callee = p.expression.getText(sf);
      if (SETTERS.test(callee) && p.arguments.includes(child)) return 'call';
      return null;
    }
    if (ts.isNewExpression(p)) return p.expression.getText(sf) === 'Error' ? 'call' : null;
    if (ts.isBinaryExpression(p)) {
      if (/^(===|!==|==|!=|<|>|<=|>=|in|instanceof)$/.test(p.operatorToken.getText(sf))) return null;
      continue; // a + b: keep climbing
    }
    if (ts.isConditionalExpression(p)) {
      if (p.condition === child) return null;
      continue;
    }
    if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p)) continue;
    return null;
  }
  return null;
}

/** JSX's whitespace rule: text spanning lines is trimmed line by line and joined with single spaces. */
function jsxWhitespace(raw) {
  if (!raw.includes('\n')) return raw;
  const lines = raw.split('\n');
  return lines
    .map((l, i) => {
      let x = l;
      if (i > 0) x = x.replace(/^\s+/, '');
      if (i < lines.length - 1) x = x.replace(/\s+$/, '');
      return x;
    })
    .filter((x) => x.length)
    .join(' ');
}

/**
 * An element whose children are text with expressions mixed in ("Mic listens in {x}. Pick…")
 * becomes one sentence with placeholders, so translators can reorder it.
 */
function mixedChildren(node) {
  if (!ts.isJsxElement(node)) return false;
  const kids = node.children.filter((c) => !(ts.isJsxText(c) && !c.getText(sf).trim()));
  const hasText = kids.some((c) => ts.isJsxText(c) && isEnglish(c.getText(sf)));
  const hasExpr = kids.some((c) => ts.isJsxExpression(c) && c.expression);
  if (!hasText || !hasExpr) return false;
  // an expression may become a placeholder unless it holds markup or English of its own
  const plainExpr = (e) => {
    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return false;
    let english = false;
    const look = (n) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && isEnglish(n.text) && !isT(n.parent)) english = true;
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) english = true;
      ts.forEachChild(n, look);
    };
    look(e);
    return !english;
  };
  if (!kids.every((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && c.expression && plainExpr(c.expression)))) return false;
  const used = new Set();
  let text = '';
  const vars = [];
  for (const c of node.children) {
    if (ts.isJsxText(c)) text += jsxWhitespace(src.slice(c.pos, c.end));
    else if (ts.isJsxExpression(c) && c.expression) {
      // {' '} and other plain strings are just text
      if (ts.isStringLiteral(c.expression)) {
        text += c.expression.text;
        continue;
      }
      const name = nameFor(c.expression, used);
      if (!vars.some((v) => v.startsWith(name + ':'))) vars.push(`${name}: ${c.expression.getText(sf)}`);
      text += `{${name}}`;
    }
  }
  text = text.replace(/\s+/g, ' ').trim();
  const start = node.openingElement.getEnd();
  const end = node.closingElement.getStart(sf);
  edits.push({ start, end, text: `{t(${q(text)}, { ${vars.join(', ')} })}`, why: 'sentence', was: text });
  return true;
}

function visit(node) {
  if (isT(node)) return;
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
  if (mixedChildren(node)) {
    // the attributes of this element may still hold text
    ts.forEachChild(node.openingElement, visit);
    return;
  }

  if (ts.isJsxText(node)) {
    const raw = src.slice(node.pos, node.end);
    const text = jsxWhitespace(raw).replace(/\s+/g, ' ').trim();
    if (text && isEnglish(text)) {
      const lead = /^[ \t]/.test(raw) && !/^\s*\n/.test(raw) ? "{' '}" : '';
      const trail = /[ \t]$/.test(raw) && !/\n\s*$/.test(raw) ? "{' '}" : '';
      const indent = /^\s*\n/.test(raw) ? raw.match(/^\s*/)[0] : '';
      const outdent = /\n\s*$/.test(raw) ? raw.match(/\s*$/)[0] : '';
      edits.push({ start: node.pos, end: node.end, text: `${indent}${lead}{t(${q(text)})}${trail}${outdent}`, why: 'text', was: text });
    }
    return;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (isEnglish(node.text)) {
      const ctx = shownContext(node);
      if (ctx === 'attr' && ts.isJsxAttribute(node.parent)) {
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `{t(${q(node.text)})}`, why: 'attr', was: node.text });
      } else if (ctx) {
        edits.push({ start: node.getStart(sf), end: node.getEnd(), text: `t(${q(node.text)})`, why: ctx, was: node.text });
      }
    }
    return;
  }

  if (ts.isTemplateExpression(node)) {
    const plain = node.head.text + node.templateSpans.map((s) => s.literal.text).join('');
    if (isEnglish(plain) && shownContext(node)) {
      edits.push({ start: node.getStart(sf), end: node.getEnd(), text: templateCall(node), why: 'template', was: node.getText(sf) });
      return;
    }
  }
  ts.forEachChild(node, visit);
}

visit(sf);
edits.sort((a, b) => b.start - a.start);
let out = src;
for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
for (const e of [...edits].reverse()) console.log(`${line(e.start)}\t${e.why}\t${e.was.slice(0, 90).replace(/\n/g, ' ')}`);

if (edits.length && !/import \{[^}]*\bt\b[^}]*\} from '[./a-z]*i18n(\/t)?'/.test(out)) {
  const norm = '/' + file.replace(/\\/g, '/').replace(/^\.?\//, '');
  const inSrc = norm.includes('/src/');
  const depth = inSrc ? norm.split('/src/')[1].split('/').length : 0;
  const rel = !inSrc ? './src/i18n' : depth <= 1 ? './i18n' : '../'.repeat(depth - 1) + 'i18n';
  const lastImport = [...out.matchAll(/^import .*;$/gm)].pop();
  const at = lastImport ? lastImport.index + lastImport[0].length : 0;
  out = out.slice(0, at) + `\nimport { t } from '${rel}/t';` + out.slice(at);
}
if (flag === '--write') fs.writeFileSync(file, out);
console.log(`${edits.length} edits${flag === '--write' ? ' written' : ' (dry run)'}`);
