/* Calibrate the frozen browser model; never fit on calibration/evaluation rows. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const predictor = require('../docs/predictor.js');

const GROUP_COLUMNS = ['brand', 'series', 'model', 'transmission', 'fuel_type',
  'body_type', 'color', 'drivetrain', 'year', 'mileage_km',
  'engine_displacement_cc', 'engine_power_hp'];
const NUMERIC_COLUMNS = new Set(['year', 'mileage_km', 'engine_displacement_cc',
  'engine_power_hp', 'price_try', 'vehicle_age', 'source_row']);

function readCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if (c === '\n' && !quoted) {
      row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = '';
    } else value += c;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(row => row.length === headers.length).map(row => Object.fromEntries(
    headers.map((key, i) => [key, NUMERIC_COLUMNS.has(key) ? (row[i] === '' ? null : Number(row[i])) : (row[i] || null)])));
}

function groupKey(row) {
  return JSON.stringify(GROUP_COLUMNS.map(key => row[key] ?? null));
}

function partition(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  // Random-looking, reproducible assignment that never uses targets or residuals.
  const ordered = [...groups].map(([key, rows]) => ({ key, rows,
    hash: crypto.createHash('sha256').update('motorvalue-interval-v1:42:' + key).digest('hex')
  })).sort((a, b) => a.hash.localeCompare(b.hash, 'en'));
  const midpoint = Math.floor(ordered.length / 2);
  return { calibration: ordered.slice(0, midpoint), evaluation: ordered.slice(midpoint) };
}

function quantile(scores, coverage) {
  assert.ok(coverage > 0 && coverage < 1);
  const rank = Math.ceil((scores.length + 1) * coverage);
  assert.ok(rank <= scores.length, 'Not enough calibration groups for this coverage.');
  return [...scores].sort((a, b) => a - b)[rank - 1];
}

function calibrate(rows, model, referenceYear, coverage = 0.95) {
  assert.ok(rows.length > 100, 'Calibration requires a held-out dataset.');
  const prepared = rows.map(row => {
    assert.ok(Number.isFinite(row.price_try) && row.price_try > 0);
    const prediction = predictor.predict(row, model, referenceYear);
    assert.ok(Number.isFinite(prediction) && prediction > 0);
    return { ...row, score: Math.abs(Math.log1p(row.price_try) - Math.log1p(prediction)) };
  });
  const { calibration, evaluation } = partition(prepared);
  // One score per vehicle group prevents repeated listings dominating calibration.
  const q = quantile(calibration.map(group => Math.max(...group.rows.map(row => row.score))), coverage);
  const evaluationRows = evaluation.flatMap(group => group.rows);
  const rowCoverage = evaluationRows.filter(row => row.score <= q).length / evaluationRows.length;
  const groupCoverage = evaluation.filter(group => group.rows.every(row => row.score <= q)).length / evaluation.length;
  return {
    method: 'group_split_conformal_log', coverage, log_radius: q,
    calibration_rows: calibration.reduce((sum, group) => sum + group.rows.length, 0),
    calibration_groups: calibration.length,
    evaluation_rows: evaluationRows.length, evaluation_groups: evaluation.length,
    empirical_row_coverage: rowCoverage, empirical_group_coverage: groupCoverage,
    model_sha256: crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex'),
    split_seed: 42,
    assumption: 'Coverage is marginal across exchangeable vehicle groups, not a guarantee for an individual car or a future market.',
  };
}

if (require.main === module) {
  const inputIndex = process.argv.indexOf('--input');
  const rows = inputIndex >= 0
    ? JSON.parse(fs.readFileSync(process.argv[inputIndex + 1], 'utf8'))
    : readCsv(fs.readFileSync(path.join(__dirname, '../results/car_dataset_test.csv'), 'utf8'));
  const model = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/model.json'), 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/catalog.json'), 'utf8'));
  const result = calibrate(rows, model, metadata.reference_year);
  fs.writeFileSync(path.join(__dirname, '../docs/interval.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
module.exports = { readCsv, groupKey, partition, quantile, calibrate };
