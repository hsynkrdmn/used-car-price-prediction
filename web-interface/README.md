# MotorValue Web Interface

An English web interface for the used-car price project. It runs the trained CatBoost model in the browser. Estimates are computed from exported decision trees, not a price formula or a simulated response.

## Run locally

From this folder:

```bash
python -m http.server 8080 --directory dist
```

Open `http://localhost:8080` in a browser. Use an HTTP server; opening the HTML file directly does not allow the model files to load.

## Rebuild the model

Install the project's Python requirements, then run:

```bash
python export_model.py
node check_predictions.cjs
```

The exporter reads `../car_price_analysis_simple.py`, repeats its preparation and training split, and trains only CatBoost. It does not run the full model comparison again or change the notebook. The browser's numeric and one-hot preprocessing matches the fitted pipeline.

`check_predictions.cjs` checks both the prepared feature path and the form-input path against 50 Python predictions. It also checks the mileage boundary rule, confirms that no tramer features are exported, and verifies that legacy damage inputs cannot change a prediction.

## Files

- `dist/index.html`: estimator, model results and data notes.
- `dist/styles.css`: responsive layout.
- `dist/app.js`: form controls and page interaction.
- `dist/predictor.js`: browser preprocessing and tree inference.
- `dist/model.json`: exported trees and preprocessing values.
- `dist/catalog.json`: model metrics, vehicle options and example specs.

The exported model excludes all tramer and damage-history features. No training rows are removed based on damage amounts. The form has no damage-amount field, and its English notes explain that damage history is not included in an estimate. The interface reports the model's held-out error and limitations. It does not claim an individual confidence interval or a guaranteed sale price.

The built site has no external runtime dependencies. Vehicle details are processed in the browser and are not sent to a prediction API.
