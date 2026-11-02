const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const predictor = require('../docs/predictor.js');
const { readCsv, groupKey, partition, quantile, calibrate } = require('./calibrate_interval.cjs');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../docs', name), 'utf8'));
const model = read('model.json'), metadata = read('catalog.json'), interval = read('interval.json');
const test = readCsv(fs.readFileSync(path.join(__dirname, '../results/car_dataset_test.csv'), 'utf8'));
const train = readCsv(fs.readFileSync(path.join(__dirname, '../results/car_dataset_cleaned.csv'), 'utf8'));
const trainGroups = new Set(train.map(groupKey));
assert.equal(test.length, metadata.test_rows);
assert.ok(test.every(row => !trainGroups.has(groupKey(row))), 'Calibration/evaluation must be held out from training.');
const split = partition(test);
const calibrationGroups = new Set(split.calibration.map(group => group.key));
assert.ok(split.evaluation.every(group => !calibrationGroups.has(group.key)));
assert.deepEqual(calibrate(test, model, metadata.reference_year), interval);
assert.equal(interval.coverage, 0.95);
const previousInterval = calibrate(test, model, metadata.reference_year, 0.9);
assert.ok(interval.log_radius > previousInterval.log_radius, '95% coverage should widen the previous 90% interval.');
assert.equal(interval.model_sha256, crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex'));
assert.equal(quantile([4, 1, 3, 2], 0.6), 3);
assert.throws(() => quantile([1], 0.99));
assert.throws(() => predictor.predictionInterval(NaN, interval));
assert.throws(() => predictor.predictionInterval(100000, { ...interval, log_radius: -1 }));

// Evaluation targets must never influence the calibrated quantile.
const evaluationGroups = new Set(split.evaluation.map(group => group.key));
const changedTargets = test.map(row => evaluationGroups.has(groupKey(row))
  ? { ...row, price_try: row.price_try * 10 } : row);
assert.equal(calibrate(changedTargets, model, metadata.reference_year).log_radius, interval.log_radius);

let covered = 0, error = 0;
for (const row of test) {
  const value = predictor.predict(row, model, metadata.reference_year);
  const range = predictor.predictionInterval(value, interval);
  const previousRange = predictor.predictionInterval(value, previousInterval);
  assert.ok(range.lower <= previousRange.lower && range.upper >= previousRange.upper);
  assert.ok(0 <= range.lower && range.lower < value && value < range.upper);
  const lower = Math.floor(range.lower / 1000) * 1000;
  const upper = Math.ceil(range.upper / 1000) * 1000;
  assert.ok(lower <= range.lower && upper >= range.upper, 'Display rounding must preserve coverage.');
  assert.ok(lower <= Math.round(value / 1000) * 1000 && upper >= Math.round(value / 1000) * 1000);
  error += Math.abs(value - row.price_try);
  if (evaluationGroups.has(groupKey(row)) && range.lower <= row.price_try && row.price_try <= range.upper) covered++;
}
assert.ok(Math.abs(error / test.length - metadata.test_mae) < 0.1, 'Stored metrics must match this model.');
assert.equal(covered / interval.evaluation_rows, interval.empirical_row_coverage);

console.log(JSON.stringify({ status: 'passed', calibrationRows: interval.calibration_rows,
  evaluationRows: interval.evaluation_rows, evaluationCoverage: interval.empirical_row_coverage,
  checkedPredictions: test.length, trainingGroupsDisjoint: true }));
