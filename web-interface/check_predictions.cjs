const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const predictor = require('./dist/predictor.js');
const model = JSON.parse(fs.readFileSync(path.join(__dirname, 'dist/model.json'), 'utf8'));
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'prediction-fixtures.json'), 'utf8'));
let largestDifference = 0;
for (const fixture of fixtures) {
  for (const actual of [predictor.predictFeatures(fixture.features, model), predictor.predict(fixture.input, model)]) {
    const difference = Math.abs(actual - fixture.expected);
    largestDifference = Math.max(largestDifference, difference);
    assert.ok(difference < 0.1, `Prediction mismatch: ${difference} TRY`);
  }
}
assert.ok(![...model.preprocessing.numeric_names, ...model.preprocessing.categorical_names]
  .some(name => name.toLowerCase().includes('tramer')));
for (const fixture of fixtures) {
  const expected = predictor.predict(fixture.input, model);
  for (const amount of [null, 0, 999, 1000, 1000000, 5000000000]) {
    assert.equal(predictor.predict({ ...fixture.input, tramer_tl: amount,
      tramer_log: 100, tramer_missing: 1, has_tramer: 1 }, model), expected);
  }
}
assert.ok(Number.isNaN(predictor.prepareInput({ mileage_km: 999999 }).mileage_km));
console.log(JSON.stringify({ fixtures: fixtures.length, largestDifferenceTRY: largestDifference, status: 'passed' }));
