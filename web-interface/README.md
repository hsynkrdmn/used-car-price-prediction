# Web interface — development guide

The deployable application lives only in [`../docs/`](../docs). HTML, CSS, JavaScript, the exported CatBoost model and its metadata are all served from that directory. There is no build step, package installation, API key or prediction backend for visitors.

## Local preview

From the project root:

```bash
python -m http.server 8080 --directory docs
```

Open `http://localhost:8080`. Use localhost or HTTPS because the app verifies model and calibration fingerprints with Web Crypto. Opening `index.html` directly cannot load the JSON files.

## GitHub Pages

The workflow [`../.github/workflows/pages.yml`](../.github/workflows/pages.yml) checks the project and publishes only `docs/` from the default branch. Set **Settings → Pages → Source → GitHub Actions** once, then push or manually run the workflow. Pull requests run checks without deploying. See the [main README](../README.md) for visitor and setup instructions.

All resource URLs are relative, so the application works under a project Pages path such as `/repository-name/`. The static site has no external runtime dependencies. Vehicle details stay in the browser.

## Edit the website

Edit files directly in `docs/`; there is no second site directory to sync.

| File | Purpose |
| --- | --- |
| `index.html` | Valuation, model and data-note views |
| `styles.css`, `theme.css` | Base and responsive visual styles |
| `app.js` | Form state, language switching, result and interval disclosures |
| `i18n.js` | Matching Turkish / English UI messages |
| `predictor.js` | Preprocessing, exact CatBoost inference, MAPE band and simulated effects |
| `model.json` | Frozen trees and learned preprocessing values |
| `catalog.json` | Vehicle options, defaults and saved comparison scores |
| `analytics.json` | Calibration MAPE cohorts and held-out permutation importance |
| `interval.json` | Calibration for the optional 95% prediction interval |

The vehicle summary appears above the price. **Illustrative Price Effects / Temsili Fiyat Etkileri** is labelled as a simulation, rather than SHAP analysis. Language changes preserve inputs, results, stale status and an open interval disclosure.

## Rebuild the model

From the project root, after installing [`requirements.txt`](../requirements.txt):

```bash
python web-interface/export_model.py
```

The exporter reads [`car_price_prediction.py`](../car_price_prediction.py), repeats preparation and grouped train/test splitting, and trains only CatBoost. It writes model and metadata directly to `docs/`, regenerates the 50 reference fixtures, and rebuilds calibration and analytics from that run's held-out rows. It does not repeat the complete model comparison or modify the notebook. Node.js is required.

The saved comparison table comes from [`results/model_comparison.csv`](../results/model_comparison.csv). If you change the training dataset or model setup, rerun the analysis before exporting so the comparison scores describe that setup.

To rebuild only derived data for the existing browser model:

```bash
node web-interface/calibrate_interval.cjs
node web-interface/build_analytics.cjs
```

These read the saved held-out rows in `results/` and do not need Python packages.

## Statistical outputs

Calibration and evaluation are separate groups of the original held-out data: 2,500 calibration listings and 2,511 evaluation listings.

- **MAPE display band:** same-brand/series calibration MAPE with at least 30 rows; brand MAPE with at least 50 rows otherwise; overall calibration MAPE as the final fallback. The requested display margin is constrained to 8–10%. Observed evaluation coverage is 59.9%; this is not a confidence interval.
- **Optional 95% prediction interval:** grouped split conformal interval on absolute log-price errors. Its measured evaluation listing coverage is 94.2%. The target depends on comparable vehicle groups and is not a guarantee for an individual vehicle or a future market. Display endpoints round outwards to ₺1,000.
- **Illustrative local effects:** rule-based simulated trim, mileage and age contributions. They are not SHAP values or an additive decomposition.
- **Global feature importance:** measured change in MAE after shuffling a feature on 600 held-out evaluation listings, averaged over three seeded repeats. Brand, series and model are shuffled together. Correlation and unrealistic combinations can affect this diagnostic; it is not causal.

## Checks

Node.js 24 is sufficient; there are no npm dependencies:

```bash
node web-interface/check_site.cjs
node web-interface/check_predictions.cjs
node web-interface/check_intervals.cjs
node web-interface/check_analytics.cjs
```

`check_site.cjs` checks site assets, relative URLs under a repository prefix, JavaScript syntax, HTML element IDs, documentation links and notebook data paths. The other checks cover parity with 50 Python predictions, excluded damage inputs, held-out group separation, coverage, calibration-only MAPE cohorts, reproducible importance and translations.

## Retained data and generated outputs

`results/car_dataset_cleaned.csv` contains the training subset; `results/car_dataset_test.csv` contains held-out rows. Both are kept because the checks need them. Comparison scores, cleaning/error reports, settings and the residual plot are also retained. The full prepared-data duplicate, per-listing prediction export and first exploratory figure can be regenerated by the notebook and are ignored by Git.
