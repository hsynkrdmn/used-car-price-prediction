/* Exact inference for the exported, one-hot-encoded CatBoost model. */
(function (root) {
  "use strict";

  function numberOrMissing(value) {
    if (value === "" || value === null || value === undefined) return NaN;
    const valueNumber = Number(value);
    return Number.isFinite(valueNumber) ? valueNumber : NaN;
  }

  function prepareInput(input, referenceYear = 2026) {
    const features = { ...input };
    // Ignore legacy damage inputs: this model does not use damage history.
    for (const name of Object.keys(features)) {
      if (name.toLowerCase().includes("tramer")) delete features[name];
    }
    let mileage = numberOrMissing(input.mileage_km);
    if (mileage < 0 || [999999, 999990, 1000000].includes(mileage)) mileage = NaN;
    features.mileage_km = mileage;
    for (const name of ["engine_displacement_cc", "engine_power_hp"]) {
      const value = numberOrMissing(input[name]);
      features[name] = value > 0 ? value : NaN;
    }
    const year = numberOrMissing(input.year);
    features.vehicle_age = Number.isInteger(year) && year >= 1886 && year <= referenceYear + 1
      ? referenceYear - year : NaN;
    return features;
  }

  function encode(features, preprocessing) {
    const count = preprocessing.numeric_names.length
      + preprocessing.categories.reduce((sum, categories) => sum + categories.length, 0);
    const vector = new Float32Array(count);
    let offset = 0;
    preprocessing.numeric_names.forEach((name, index) => {
      let value = numberOrMissing(features[name]);
      if (!Number.isFinite(value)) value = preprocessing.numeric_fill[index];
      vector[offset++] = value / preprocessing.numeric_scale[index];
    });
    preprocessing.categorical_names.forEach((name, index) => {
      let value = features[name];
      if (value === null || value === undefined || String(value).trim() === "") {
        value = preprocessing.categorical_fill[index];
      } else value = String(value).trim();
      const categories = preprocessing.categories[index];
      const position = categories.indexOf(value);
      if (position >= 0) vector[offset + position] = 1;
      offset += categories.length;
    });
    return vector;
  }

  function predictFeatures(features, model) {
    const vector = encode(features, model.preprocessing);
    let sum = 0;
    for (const [indices, borders, leaves] of model.trees) {
      let leaf = 0;
      for (let depth = 0; depth < indices.length; depth++) {
        if (vector[indices[depth]] > borders[depth]) leaf |= 1 << depth;
      }
      sum += leaves[leaf];
    }
    const [scale, bias] = model.scale_and_bias;
    return Math.expm1(sum * scale + bias[0]);
  }

  function predict(input, model, referenceYear = 2026) {
    return predictFeatures(prepareInput(input, referenceYear), model);
  }

  const api = { prepareInput, encode, predictFeatures, predict };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CarPredictor = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
