/* Measured calibration MAPE and held-out permutation importance for the frozen model. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { readCsv, partition } = require('./calibrate_interval.cjs');
const predictor = require('../docs/predictor.js');
const HERE = __dirname;
const read = file => JSON.parse(fs.readFileSync(path.join(HERE, '../docs', file), 'utf8'));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function random(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
function shuffle(values, rng) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function cohorts(rows, columns, minRows) {
  const groups = new Map();
  for (const row of rows) {
    const key = JSON.stringify(columns.map(column => row[column]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].filter(group => group.length >= minRows).map(group => ({
    ...Object.fromEntries(columns.map(column => [column, group[0][column]])),
    rows: group.length, mape: mean(group.map(row => row.ape)),
  }));
}
function buildAnalytics(rows, model, referenceYear) {
  const scored = rows.map(row => ({ ...row,
    ape: Math.abs(predictor.predict(row, model, referenceYear) - row.price_try) / row.price_try }));
  const split = partition(scored);
  const calibration = split.calibration.flatMap(group => group.rows);
  const evaluation = split.evaluation.flatMap(group => group.rows);
  const analytics = {
    method: 'measured_mape_display_band', min_margin: 0.08, max_margin: 0.10,
    series_min_rows: 30, brand_min_rows: 50,
    series_mape: cohorts(calibration, ['brand', 'series'], 30),
    brand_mape: cohorts(calibration, ['brand'], 50),
    global_mape: { rows: calibration.length, mape: mean(calibration.map(row => row.ape)) },
    test_mape: mean(scored.map(row => row.ape)),
    evaluation_rows: evaluation.length,
    model_sha256: crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex'),
  };
  analytics.band_evaluation_coverage = mean(evaluation.map(row => {
    const prediction = predictor.predict(row, model, referenceYear);
    const band = predictor.mapeBand(prediction, row, analytics);
    return Number(band.lower <= row.price_try && row.price_try <= band.upper);
  }));

  // Fixed sample and repeats keep the diagnostic reproducible and inexpensive.
  const sample = evaluation.slice(0, 600);
  const baseline = mean(sample.map(row => Math.abs(predictor.predict(row, model, referenceYear) - row.price_try)));
  const definitions = [
    ['identity', 'categorical', ['brand', 'series', 'model']],
    ['age', 'numeric', ['year']], ['mileage', 'numeric', ['mileage_km']],
    ['power', 'numeric', ['engine_power_hp']], ['engine', 'numeric', ['engine_displacement_cc']],
    ['transmission', 'categorical', ['transmission']], ['fuel', 'categorical', ['fuel_type']],
    ['body', 'categorical', ['body_type']], ['drive', 'categorical', ['drivetrain']],
    ['colour', 'categorical', ['color']],
  ];
  analytics.importance = { method: 'held_out_permutation_mae', sample_rows: sample.length,
    repeats: 3, baseline_mae: baseline, features: definitions.map(([id, group, columns], index) => {
      const changes = Array.from({ length: 3 }, (_, repeat) => {
        const donors = shuffle(sample, random(42 + index * 100 + repeat));
        return mean(sample.map((row, i) => {
          const changed = { ...row };
          for (const column of columns) changed[column] = donors[i][column];
          return Math.abs(predictor.predict(changed, model, referenceYear) - row.price_try);
        })) - baseline;
      });
      return { id, group, columns, mae_increase: mean(changes) };
    }).sort((a, b) => b.mae_increase - a.mae_increase) };
  return analytics;
}
if (require.main === module) {
  const index = process.argv.indexOf('--input');
  const rows = index >= 0 ? JSON.parse(fs.readFileSync(process.argv[index + 1], 'utf8'))
    : readCsv(fs.readFileSync(path.join(HERE, '../results/car_dataset_test.csv'), 'utf8'));
  const result = buildAnalytics(rows, read('model.json'), read('catalog.json').reference_year);
  fs.writeFileSync(path.join(HERE, '../docs/analytics.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ calibrationMAPE: result.global_mape.mape,
    testMAPE: result.test_mape, bandCoverage: result.band_evaluation_coverage,
    importanceRows: result.importance.sample_rows, features: result.importance.features.length }));
}
module.exports = { buildAnalytics };
