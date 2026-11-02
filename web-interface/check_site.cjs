/* Checks the deployable site without Python packages or a browser installation. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const SITE = path.join(ROOT, 'docs');
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(SITE, 'app.js'), 'utf8');

// Repository Pages serves under /repository-name/, not necessarily at the origin root.
const base = new URL('https://example.github.io/repository-name/');
for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (reference.startsWith('#') || /^https?:\/\//.test(reference)) continue;
  const resolved = new URL(reference, base);
  assert.ok(resolved.pathname.startsWith(base.pathname), `Project-subpath URL escapes: ${reference}`);
  const file = path.join(SITE, decodeURIComponent(resolved.pathname.slice(base.pathname.length)));
  assert.ok(fs.statSync(file).isFile(), `Missing site asset: ${reference}`);
}
for (const name of ['catalog.json', 'model.json', 'analytics.json', 'interval.json']) {
  assert.ok(fs.statSync(path.join(SITE, name)).isFile());
  JSON.parse(fs.readFileSync(path.join(SITE, name), 'utf8'));
}
for (const file of fs.readdirSync(SITE).filter(name => name.endsWith('.js'))) {
  new vm.Script(fs.readFileSync(path.join(SITE, file), 'utf8'), { filename: file });
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML IDs');
for (const [, id] of app.matchAll(/\$\(['"]([^'"]+)['"]\)/g)) {
  assert.ok(ids.includes(id), `Application references missing element: ${id}`);
}
for (const name of ['.nojekyll', 'index.html']) assert.ok(fs.existsSync(path.join(SITE, name)));
for (const file of ['README.md', 'web-interface/README.md']) {
  const markdown = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const [, target] of markdown.matchAll(/\]\(([^\s)]+)\)/g)) {
    if (target.startsWith('#') || /^[a-z]+:/i.test(target)) continue;
    const cleanTarget = target.split('#')[0];
    assert.ok(fs.existsSync(path.resolve(path.dirname(path.join(ROOT, file)), cleanTarget)), `Broken documentation link: ${file} -> ${target}`);
  }
}
const notebook = JSON.parse(fs.readFileSync(path.join(ROOT, 'car_price_prediction.ipynb'), 'utf8'));
const notebookSource = notebook.cells.map(cell => cell.source.join('')).join('\n');
assert.ok(notebookSource.includes('data/car_dataset_raw.csv') && notebookSource.includes('Path("results")'));
for (const file of ['data/car_dataset_raw.csv', 'results/car_dataset_cleaned.csv',
  'results/car_dataset_test.csv', 'results/model_comparison.csv', 'assets/preview.png']) {
  assert.ok(fs.statSync(path.join(ROOT, file)).isFile(), `Missing project input: ${file}`);
}
console.log(JSON.stringify({ status: 'passed', site: 'docs/', projectSubpathCompatible: true,
  documentationLinksValid: true, notebookPathsValid: true }));
