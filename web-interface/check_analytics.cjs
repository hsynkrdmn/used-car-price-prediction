const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const predictor = require('../docs/predictor.js');
const { readCsv, partition } = require('./calibrate_interval.cjs');
const { buildAnalytics } = require('./build_analytics.cjs');
const { messages, t } = require('../docs/i18n.js');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../docs', name), 'utf8'));
const model = read('model.json'), metadata = read('catalog.json'), analytics = read('analytics.json');
const calibration95 = read('interval.json');
const rows = readCsv(fs.readFileSync(path.join(__dirname, '../results/car_dataset_test.csv'), 'utf8'));
assert.equal(analytics.model_sha256, crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex'));
assert.deepEqual(buildAnalytics(rows, model, metadata.reference_year), analytics);

const { calibration, evaluation } = partition(rows);
const allCalibration = calibration.flatMap(group => group.rows);
const ape = row => Math.abs(predictor.predict(row, model, metadata.reference_year) - row.price_try) / row.price_try;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
assert.equal(analytics.global_mape.rows, allCalibration.length);
assert.equal(analytics.global_mape.mape, mean(allCalibration.map(ape)));
for (const cohort of analytics.series_mape) {
  const members = allCalibration.filter(row => row.brand === cohort.brand && row.series === cohort.series);
  assert.ok(members.length >= 30);
  assert.equal(cohort.rows, members.length);
  assert.equal(cohort.mape, mean(members.map(ape)));
}
for (const cohort of analytics.brand_mape) {
  const members = allCalibration.filter(row => row.brand === cohort.brand);
  assert.ok(members.length >= 50);
  assert.equal(cohort.rows, members.length);
  assert.equal(cohort.mape, mean(members.map(ape)));
}
let covered = 0;
for (const row of evaluation.flatMap(group => group.rows)) {
  const prediction = predictor.predict(row, model, metadata.reference_year);
  const band = predictor.mapeBand(prediction, row, analytics);
  const interval = predictor.predictionInterval(prediction, calibration95);
  assert.ok(band.margin >= 0.08 && band.margin <= 0.10);
  assert.ok(band.lower < prediction && prediction < band.upper);
  assert.ok(interval.lower < band.lower && interval.upper > band.upper, '95% interval and narrow MAPE band must remain distinct.');
  if (band.lower <= row.price_try && row.price_try <= band.upper) covered++;
}
assert.equal(covered / analytics.evaluation_rows, analytics.band_evaluation_coverage);
const unknown = predictor.mapeBand(1e6, { brand: 'Unknown', series: 'Unknown' }, analytics);
assert.equal(unknown.source, 'global');
assert.equal(unknown.margin, Math.min(0.10, Math.max(0.08, analytics.global_mape.mape)));
const known = analytics.series_mape[0];
assert.equal(predictor.mapeBand(1e6, known, analytics).source, 'series');
const brand = analytics.brand_mape[0];
assert.equal(predictor.mapeBand(1e6, { brand: brand.brand, series: 'Unknown' }, analytics).source, 'brand');
const old = { model: 'Highline', mileage_km: 160000, year: 2010 };
const recent = { model: 'Highline', mileage_km: 20000, year: 2025 };
const oldEffects = predictor.simulatedImpacts(old, 1e6);
const recentEffects = predictor.simulatedImpacts(recent, 1e6);
assert.ok(oldEffects[0].value > 0 && oldEffects[1].value < 0 && oldEffects[2].value < 0);
assert.ok(recentEffects[1].value > 0 && recentEffects[2].value > 0);
assert.equal(analytics.importance.features.length, 10);
assert.ok(analytics.importance.features.every(feature => Number.isFinite(feature.mae_increase)));
assert.deepEqual(Object.keys(messages.tr).sort(), Object.keys(messages.en).sort());
const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
for (const [, key] of html.matchAll(/data-i18n(?:-aria-label|-alt)?="([^"]+)"/g)) {
  assert.ok(t('tr', key)); assert.ok(t('en', key));
}
assert.ok(html.includes('https://github.com/hsynkrdmn'));
assert.equal(t('tr', 'impactsHeading'), 'Temsili Fiyat Etkileri');
assert.ok(!/SHAP/i.test(t('en', 'impactsHeading')));
assert.ok(html.indexOf('id="summary-vehicle"') < html.indexOf('id="estimate-price"'));
assert.ok(html.includes('id="calibrated-details"') && html.includes('id="importance-insight"'));
assert.ok(!/motorvalue/i.test(html + fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8')));
for (const name of ['CatBoost', 'LightGBM', 'XGBoost']) {
  const record = metadata.comparison.find(item => item.Model === name);
  assert.ok(Number.isFinite(record['Test R2 (TRY)']) && record['Test RMSE (TRY)'] > 0);
}
console.log(JSON.stringify({ status: 'passed', translations: Object.keys(messages.tr).length,
  features: analytics.importance.features.length, mapeBandEvaluationCoverage: analytics.band_evaluation_coverage,
  calibrationOnlyCohorts: true, modelPredictionsUnchanged: true }));
