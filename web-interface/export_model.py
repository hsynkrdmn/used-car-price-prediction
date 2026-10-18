"""Export the notebook's CatBoost pipeline for offline browser inference."""
from pathlib import Path
import contextlib
import io
import json
import re

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, root_mean_squared_error, r2_score

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DIST = HERE / "dist"


def clean_json(value):
    if isinstance(value, dict):
        return {str(key): clean_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, np.ndarray)):
        return [clean_json(item) for item in value]
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, (float, np.floating)):
        return float(value) if np.isfinite(value) else None
    if value is pd.NA:
        return None
    return value


def write_json(path, data):
    path.write_text(json.dumps(clean_json(data), ensure_ascii=False, allow_nan=False,
                               separators=(",", ":")), encoding="utf-8")


def main():
    import os
    os.chdir(ROOT)
    source = (ROOT / "car_price_analysis_simple.py").read_text(encoding="utf-8")
    parts = re.split(r"(?m)^# %%([^\n]*)\n", source)
    namespace = {"__name__": "model_export"}
    plt.show = lambda *args, **kwargs: plt.close("all")
    with contextlib.redirect_stdout(io.StringIO()):
        for index in range(1, len(parts), 2):
            if "[markdown]" in parts[index]:
                continue
            body = parts[index + 1].strip()
            if "cv = GroupKFold" in body:
                break
            exec(compile(body, "notebook_export", "exec"), namespace)
            namespace["display"] = lambda *args, **kwargs: None

    pipeline = Pipeline([
        ("preprocessor", clone(namespace["preprocessor"])),
        ("model", clone(namespace["models"]["CatBoost"])),
    ])
    assert not any("tramer" in name.lower() for name in namespace["X_train"].columns)
    pipeline.fit(namespace["X_train"], namespace["y_train"])
    predictions = np.expm1(pipeline.predict(namespace["X_test"]))
    actual = np.expm1(namespace["y_test"])

    native_path = HERE / "catboost-export.json"
    pipeline.named_steps["model"].save_model(str(native_path), format="json")
    native = json.loads(native_path.read_text(encoding="utf-8"))
    feature_lookup = {
        item["feature_index"]: item["flat_feature_index"]
        for item in native["features_info"]["float_features"]
    }
    trees = []
    for tree in native["oblivious_trees"]:
        features, borders = [], []
        for split in tree.get("splits") or []:
            if split["split_type"] != "FloatFeature":
                raise ValueError(f"Unsupported split: {split['split_type']}")
            features.append(feature_lookup[split["float_feature_index"]])
            borders.append(split["border"])
        trees.append([features, borders, tree["leaf_values"]])

    processor = pipeline.named_steps["preprocessor"]
    numeric = processor.named_transformers_["numeric"]
    categorical = processor.named_transformers_["categorical"]
    encoder = categorical.named_steps["encoder"]
    preprocessing = {
        "numeric_names": namespace["numeric_columns"],
        "numeric_fill": numeric.named_steps["imputer"].statistics_.tolist(),
        "numeric_scale": numeric.named_steps["scaler"].scale_.tolist(),
        "categorical_names": namespace["categorical_columns"],
        "categorical_fill": categorical.named_steps["imputer"].statistics_.tolist(),
        "categories": [items.tolist() for items in encoder.categories_],
    }
    packed = {"trees": trees, "scale_and_bias": native["scale_and_bias"],
              "preprocessing": preprocessing}
    DIST.mkdir(exist_ok=True)
    write_json(DIST / "model.json", packed)
    native_path.unlink()

    data = namespace["df_clean"]
    numeric_inputs = ["year", "mileage_km", "engine_displacement_cc", "engine_power_hp"]
    catalog = []
    for keys, rows in data.groupby(["brand", "series", "model"], sort=True):
        defaults = {}
        for name in numeric_inputs:
            values = rows[name].dropna()
            if len(values):
                defaults[name] = float(values.mode().iloc[0]) if name.startswith("engine_") else float(values.median())
            else:
                defaults[name] = None
        for name in namespace["categorical_columns"]:
            modes = rows[name].mode()
            defaults[name] = str(modes.iloc[0]) if len(modes) else None
        catalog.append({"brand": keys[0], "series": keys[1], "model": keys[2],
                        "defaults": defaults})
    options = {name: sorted(data[name].dropna().unique().tolist())
               for name in namespace["categorical_columns"]}
    initial = next((item for item in catalog if item["brand"] == "Volkswagen"
                    and item["series"] == "Golf" and "1.4 TSi Highline" in item["model"]), catalog[0])
    comparison = pd.read_csv(ROOT / "outputs_car_price_simple" / "model_comparison.csv")
    metadata = {
        "model_name": "CatBoost", "tree_count": len(trees),
        "reference_year": namespace["REFERENCE_YEAR"],
        "training_rows": len(namespace["X_train"]),
        "test_rows": len(namespace["X_test"]),
        "raw_rows": len(namespace["df_raw"]),
        "damage_history_used": False,
        "test_mae": mean_absolute_error(actual, predictions),
        "test_rmse": root_mean_squared_error(actual, predictions),
        "test_r2": r2_score(actual, predictions),
        "catalog": catalog, "options": options, "initial": initial,
        "comparison": comparison.to_dict(orient="records"),
    }
    write_json(DIST / "catalog.json", metadata)

    examples = namespace["X_test"].iloc[:50]
    fixtures = []
    for index, row in examples.iterrows():
        form = data.loc[index, namespace["categorical_columns"] + numeric_inputs].to_dict()
        fixtures.append({"input": form, "features": row.to_dict(),
                         "expected": float(np.expm1(pipeline.predict(examples.loc[[index]]))[0])})
    write_json(HERE / "prediction-fixtures.json", fixtures)
    print(json.dumps({"trees": len(trees), "model_bytes": (DIST / 'model.json').stat().st_size,
                      "catalog_items": len(catalog), "test_r2": metadata["test_r2"],
                      "test_mae": metadata["test_mae"]}, indent=2))


if __name__ == "__main__":
    main()
