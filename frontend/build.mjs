#!/usr/bin/env node
/**
 * FIELD WX — build step.
 *
 * Compiles the plain-JSX app source in `src/` back into the self-contained
 * `index.html` bundle. The editable application entry script (data layer, shared
 * components, Sites screen, App) lives in `src/*.jsx`; this script concatenates
 * those files (in lexical order) and injects the result as the single inline
 * `<script type="text/babel">` inside the bundle's JSON-encoded `__bundler/template`.
 *
 * Everything else in index.html — the gzipped asset manifest (React, ReactDOM,
 * Babel-standalone, fonts, the vendored component modules) and the page chrome —
 * is preserved untouched. The inline entry script runs last in the browser, so it
 * may override anything the vendored modules define (e.g. TopBar, ScreenSites).
 *
 * Usage:  node build.mjs        (writes index.html, runs all checks)
 *         npm run build
 *
 * No external dependencies. Babel syntax-checking reuses the Babel-standalone
 * that already ships inside the bundle's manifest (best-effort: warns if it
 * cannot be located, hard-fails if it loads and the source has a syntax error).
 */
import fs from 'fs';
import path from 'path';
import url from 'url';
import zlib from 'zlib';
import vm from 'vm';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const IDX = path.join(HERE, 'index.html');
const SRC = path.join(HERE, 'src');
const INLINE_RE = /<script type="text\/babel">[\s\S]*?<\/script>/;

const log = (...a) => console.log('[build]', ...a);
const fail = (m) => { console.error('[build] ERROR:', m); process.exit(1); };

// 1) gather source ---------------------------------------------------------
if (!fs.existsSync(SRC)) fail('missing src/ directory at ' + SRC);
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.jsx')).sort();
if (!files.length) fail('no .jsx files in ' + SRC);
const inline = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('');
log('source:', files.join(' + '), '→', inline.length, 'chars');

// 2) load carrier (index.html) --------------------------------------------
if (!fs.existsSync(IDX)) fail('missing index.html at ' + IDX);
const original = fs.readFileSync(IDX, 'utf8');
const lines = original.split('\n');
const ti = lines.findIndex(l => { const s = l.trim(); return s.startsWith('"<!DOCTYPE html>') && s.endsWith('"'); });
if (ti < 0) fail('could not locate the __bundler/template JSON line');
let tpl;
try { tpl = JSON.parse(lines[ti]); } catch (e) { fail('template line is not valid JSON: ' + e.message); }

const matches = tpl.match(new RegExp(INLINE_RE.source, 'g')) || [];
if (matches.length !== 1) fail('expected exactly 1 inline <script type="text/babel"> block, found ' + matches.length);

// 3) inject ----------------------------------------------------------------
const newTpl = tpl.replace(INLINE_RE, () => '<script type="text/babel">' + inline + '</script>');
const newLine = JSON.stringify(newTpl).replace(/<\/script/g, '<\\/script');

// 4) verify in memory BEFORE writing --------------------------------------
if (newLine.includes('</script')) fail('encoded template still contains a raw </script (would break the outer tag)');
let reparsed;
try { reparsed = JSON.parse(newLine); } catch (e) { fail('re-encoded template does not round-trip through JSON: ' + e.message); }
const back = reparsed.match(INLINE_RE);
if (!back || back[0].indexOf(inline) === -1) fail('injected inline block missing after round-trip');
log('round-trip JSON ok, decoded template', reparsed.length, 'chars');

// 5) Babel syntax gate (best-effort, uses the bundle's own Babel) ----------
const babel = loadBundledBabel(lines);
if (babel) {
  try {
    const res = babel.transform(inline, { presets: ['react'], filename: 'app.jsx' });
    log('Babel transpile ok →', res.code.length, 'chars JS');
  } catch (e) {
    fail('Babel could not transpile the source (syntax error):\n' + String(e.message).split('\n').slice(0, 8).join('\n'));
  }
} else {
  log('WARN: could not locate Babel-standalone in the manifest — skipped syntax check');
}

// 6) write -----------------------------------------------------------------
lines[ti] = newLine;
const out = lines.join('\n');
fs.writeFileSync(IDX, out);

const after = out.split('\n');
const changed = [];
for (let i = 0; i < Math.max(lines.length, original.split('\n').length); i++) {
  if (original.split('\n')[i] !== after[i]) changed.push(i + 1);
}
log('wrote index.html (' + Buffer.byteLength(out, 'utf8') + ' bytes)');
log(changed.length === 0 ? 'no byte change (source matches current bundle)' : 'changed line(s): ' + changed.join(', '));
if (changed.length && (changed.length !== 1 || changed[0] !== ti + 1)) {
  fail('unexpected lines changed — only the template line (' + (ti + 1) + ') should change');
}
log('DONE');

// -------------------------------------------------------------------------
function loadBundledBabel(allLines) {
  const manLine = allLines.find(l => { const s = l.trim(); return s.startsWith('{"') && s.length > 100000; });
  if (!manLine) return null;
  let man;
  try { man = JSON.parse(manLine); } catch (e) { return null; }
  for (const k of Object.keys(man)) {
    const v = man[k];
    let src;
    try {
      const buf = Buffer.from(v.data, 'base64');
      src = v.compressed ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    } catch (e) { continue; }
    if (src.indexOf('@babel/standalone') < 0 && src.indexOf('availablePresets') < 0) continue;
    const sandbox = { console, setTimeout, clearTimeout, setInterval, clearInterval };
    sandbox.window = sandbox; sandbox.self = sandbox; sandbox.global = sandbox; sandbox.globalThis = sandbox;
    try {
      vm.createContext(sandbox);
      vm.runInContext(src, sandbox, { timeout: 30000 });
      if (sandbox.Babel && sandbox.Babel.transform) return sandbox.Babel;
    } catch (e) { /* try next asset */ }
  }
  return null;
}
