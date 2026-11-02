# Used Car Market Value Analysis

**[Hüseyin Karaduman](https://github.com/hsynkrdmn) · Data Science & Analytics · B.Sc. Statistics**

Data cleaning, model comparison and price estimation for used car listings in Türkiye. The trained CatBoost model runs directly in the browser: visitors need no Python installation, API key or IDE.

## Try the application

<!-- live-demo:start -->
**[Open the interactive application](https://hsynkrdmn.github.io/used-car-price-prediction/)** · [GitHub repository](https://github.com/hsynkrdmn/used-car-price-prediction)

The application is live on GitHub Pages. Open the link and use it directly in your browser. Deployment checks are available in [GitHub Actions](https://github.com/hsynkrdmn/used-car-price-prediction/actions/workflows/pages.yml).
<!-- live-demo:end -->

Choose Turkish or English, adjust the brand, series, trim, year and mileage, then select **Calculate estimate**. Check the prefilled specifications against your vehicle. The interface opens in dark mode; the sun/moon button switches to light mode. Language and theme preferences are remembered on your device.

GitHub's file viewer does not run `index.html`. Use the GitHub Pages link for the interactive application.

![English-language used car price analysis interface in dark mode](assets/preview.png)

## Features

- Real CatBoost point predictions computed locally in the browser.
- Cyan and emerald glass panels, a decorative vehicle blueprint, a digital price gauge and diverging effect bars.
- An indicative band based on MAPE for comparable brand/series groups, limited to an 8–10% display margin.
- A separate, expandable calibrated prediction interval targeting 95% coverage.
- Illustrative effects for trim, mileage and age, clearly labelled as **simulations**.
- A Model tab with CatBoost / LightGBM / XGBoost comparisons and measured permutation importance charts.
- Turkish and English interfaces, dark and light themes, and locally saved preferences. Vehicle details are not sent to a prediction service.

## Model results

The raw dataset contains **26,533 listings and 26 columns**. After cleaning, **20,069 training** and **5,011 test** listings remain. Similar vehicle specifications are kept in the same group, with no overlap between training and test groups. Imputation, encoding and scaling are fitted within the training folds.

Models learn `log1p(price_try)`. The price errors below are calculated after transforming predictions back to TRY. Model selection uses mean MAE from five-fold grouped cross-validation, rather than test-set performance.

| Model | CV MAE (TRY) | Test MAE (TRY) | Test RMSE (TRY) | Test R² |
| --- | ---: | ---: | ---: | ---: |
| **CatBoost** | **134,451** | **128,155** | **293,529** | **0.9589** |
| XGBoost | 141,666 | 136,375 | 315,408 | 0.9526 |
| LightGBM | 143,306 | 138,119 | 335,300 | 0.9464 |
| Ridge | 151,511 | 149,390 | 577,448 | 0.8411 |
| Lasso | 220,172 | 223,372 | 745,725 | 0.7350 |
| Median baseline | 682,787 | 691,303 | 1,462,958 | -0.0199 |

MAE is the mean absolute error; RMSE gives more weight to large errors. R² is not the percentage of correct predictions. See the [saved notebook](car_price_prediction.ipynb) and [results table](results/model_comparison.csv) for details.

![CatBoost predictions and residuals](results/figure_2.png)

## Understanding the two price ranges

The original test data is divided by vehicle group into **2,500 calibration** and **2,511 separate evaluation** listings.

| Display | Method | Observed listing coverage |
| --- | --- | ---: |
| Narrow MAPE band | Brand/series MAPE, falling back to brand and then global calibration data when samples are insufficient. The display margin is limited to 8–10%. | 59.9% |
| Prediction interval targeting 95% coverage | Split conformal interval using absolute log-price errors in calibration groups, with a finite-sample correction. | 94.2% |

The narrow MAPE band is not a statistical confidence interval. The 95% target is not a guarantee for each vehicle. Evaluation prices are not used for calibration. Illustrative price effects are not computed SHAP values; feature importance in the Model tab is measured on 600 separate evaluation listings over three repeats.

## Repository structure

```text
.github/workflows/pages.yml    # Checks and GitHub Pages deployment
assets/preview.png            # README screenshot
data/car_dataset_raw.csv      # Unmodified raw listing data
docs/                         # Canonical frontend source and deployment directory
results/                      # Required train/test data and analysis outputs
scripts/run_notebook.py       # Builds and executes the notebook from Python source
web-interface/                # Model export, calibration and validation tools
car_price_prediction.ipynb     # Saved analysis and outputs
car_price_prediction.py        # Cell-based Python source for the notebook
requirements.txt              # Analysis dependencies
```

`docs/` is deployed directly. There is no duplicate frontend or frontend build step. See [web-interface/README.md](web-interface/README.md) for development details.

## GitHub Pages deployment

GitHub Pages is already enabled for this repository. Visitors can use the application without following these steps. For a new deployment or fork:

1. Push the project, including `.github/`, to the repository's default branch.
2. Select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Run **Actions → Check and deploy GitHub Pages** on the default branch, or push a commit to that branch.
4. Open the deployed URL shown by the workflow. For this repository, use the [live application](https://hsynkrdmn.github.io/used-car-price-prediction/). For a fork, update the links in the README and the repository's **About → Website** field.

The workflow publishes only `docs/` after the validation checks pass. Raw data, notebooks and development tools are not included in the deployed site. Pull requests run checks; deployment runs only from the default branch.

See GitHub's [publishing source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) for setup details.

## Run locally

From the project root, serve the frontend with:

```bash
python -m http.server 8080 --directory docs
```

Open `http://localhost:8080` in your browser. Use an HTTP server instead of opening the HTML file directly.

To rerun the analysis:

```bash
python -m pip install -r requirements.txt notebook
python scripts/run_notebook.py
```

Alternatively, open `car_price_prediction.ipynb` in Jupyter running from the project root. Rerunning the notebook refreshes the saved outputs and training/test files. Export the web model separately to update the browser application.

## Validation and model export

Web checks run on Node.js 24; no `npm install` is required:

```bash
node web-interface/check_site.cjs
node web-interface/check_predictions.cjs
node web-interface/check_intervals.cjs
node web-interface/check_analytics.cjs
```

To retrain and export the model from the analysis source, install the Python dependencies and Node.js, then run:

```bash
python web-interface/export_model.py
```

This refreshes the model, catalog, calibration and analytics files in `docs/` together. Rerun the checks afterwards. To rebuild only the analytics for the existing model, use `node web-interface/build_analytics.cjs`.

## Limitations

- The target is the advertised listing price, not the final sale price.
- Tramer and damage/condition columns are excluded because their reliability could not be verified. Raw data is preserved; training rows are not removed based on Tramer amounts.
- Damage history, repair quality, location and physical condition are not model inputs.
- Listing dates are unavailable. A high test R² does not establish performance in today's or a future market.
- The prepared listings cover prices from TRY 100,000 to TRY 100,000,000. Vehicle age uses 2026 as the reference year.
- Groups are derived from vehicle specifications and do not identify individual vehicles or VINs. This project does not replace a professional inspection or guarantee a sale price.
