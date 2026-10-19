import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

// A dependency-free packager for this game's named ES-module exports.
// Each file keeps its own scope (several modules intentionally reuse names).
const root = new URL('../', import.meta.url);
const modules = [
  ['data.js', ['WEAPONS', 'UPGRADES', 'ZONES', 'ENEMY_TYPES', 'generateRoom']],
  ['audio.js', ['AudioEngine']],
  ['render.js', ['Renderer']],
  ['game.js', ['WIDTH', 'HEIGHT', 'GROUND', 'STEP', 'seededRandom', 'segmentRect', 'Game']],
  ['ui.js', ['GameUI']],
  ['main.js', []],
];
const ready = new Set();
const parts = ['(() => {', '"use strict";', 'const __modules = Object.create(null);'];
for (const [file, exports] of modules) {
  let source = await readFile(new URL(`src/${file}`, root), 'utf8');
  source = source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm, (_, names, dependency) => {
    if (!ready.has(dependency)) throw new Error(`Unresolved import ${dependency} in ${file}`);
    if (!names.split(',').every(name => /^\s*[A-Za-z_$][\w$]*\s*$/.test(name))) throw new Error(`Unsupported import in ${file}`);
    return `const {${names}} = __modules[${JSON.stringify(dependency)}];`;
  });
  source = source.replace(/^export\s+(?=(?:const|let|class|function)\b)/gm, '');
  if (/^\s*(?:import|export)\b/m.test(source)) throw new Error(`Unsupported module syntax in ${file}`);
  parts.push(`// ${file}\n__modules[${JSON.stringify(`./${file}`)}] = (() => {\n${source}\nreturn { ${exports.join(', ')} };\n})();`);
  ready.add(`./${file}`);
}
parts.push('})();');
const javascript = parts.join('\n');
new Script(javascript, { filename: 'standalone-game.js' });
const css = (await readFile(new URL('styles.css', root), 'utf8')).replace(/^@charset\s+[^;]+;\s*/i, '');
if (/<\/style/i.test(css) || /@import\b|url\(/i.test(css)) throw new Error('Standalone CSS must contain no external resources');
let html = await readFile(new URL('index.html', root), 'utf8');
const stylesheet = '<link rel="stylesheet" href="./styles.css">';
const entry = '<script type="module" src="./src/main.js"></script>';
if (html.split(stylesheet).length !== 2 || html.split(entry).length !== 2) throw new Error('Expected exactly one stylesheet and module entry');
html = html.replace(stylesheet, () => `<style>\n${css}\n</style>`);
html = html.replace(entry, () => `<script>\n${javascript.replace(/<\/script/gi, '<\\/script')}\n</script>`);
html = html.replace('<!doctype html>', '<!doctype html>\n<!-- Standalone build: npm run build. No external files or server required. -->');
const output = new URL('dist/index.html', root);
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(`Built ${fileURLToPath(output)} (${Buffer.byteLength(html).toLocaleString('en-US')} bytes)`);
