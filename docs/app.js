"use strict";

const $ = (id) => document.getElementById(id);
const money = (value) => "₺" + Math.round(value).toLocaleString("en-GB");
const count = (value) => Math.round(value).toLocaleString("en-GB");
const state = { metadata: null, model: null, prediction: null, selected: null, timer: null };

const translations = {
  "Düz": "Manual", "Otomatik": "Automatic", "Yarı Otomatik": "Semi-automatic",
  "Benzin": "Petrol", "Dizel": "Diesel", "Elektrik": "Electric", "Hibrit": "Hybrid",
  "LPG & benzin": "LPG & petrol", "Önden Çekiş": "Front-wheel drive",
  "Arkadan İtiş": "Rear-wheel drive", "4WD (Sürekli)": "Permanent 4WD",
  "AWD (Elektronik)": "Electronic AWD", "Beyaz": "White", "Siyah": "Black",
  "Gri": "Grey", "Gri (Gümüş)": "Silver grey", "Gri (Metalik)": "Metallic grey",
  "Gri (Titanyum)": "Titanium grey", "Füme": "Charcoal", "Mavi": "Blue",
  "Mavi (Metalik)": "Metallic blue", "Kırmızı": "Red", "Yeşil": "Green",
  "Yeşil (Metalik)": "Metallic green", "Lacivert": "Navy", "Bordo": "Burgundy",
  "Altın": "Gold", "Bej": "Beige", "Kahverengi": "Brown", "Sarı": "Yellow",
  "Mor": "Purple", "Pembe": "Pink", "Turkuaz": "Turquoise", "Turuncu": "Orange",
  "Şampanya": "Champagne", "Diğer": "Other",
};

function label(value) {
  if (translations[value]) return translations[value];
  return String(value).replace(/Hatchback\/3/g, "3-door hatchback")
    .replace(/Hatchback\/5/g, "5-door hatchback")
    .replace(/(\d) Koltuk/g, "$1 seats").replace(/^, /, "");
}

function selectOptions(id, values, selected) {
  const element = $(id);
  element.replaceChildren(...values.map((value) => new Option(label(value), value)));
  if (selected !== undefined && values.includes(selected)) element.value = selected;
  element.disabled = false;
}

function unique(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "en")); }

function fillSeries(selectedSeries, selectedModel) {
  const records = state.metadata.catalog.filter((item) => item.brand === $("brand").value);
  selectOptions("series", unique(records.map((item) => item.series)), selectedSeries);
  fillModels(selectedModel);
}

function fillModels(selectedModel) {
  const records = state.metadata.catalog.filter((item) => item.brand === $("brand").value && item.series === $("series").value);
  selectOptions("model", unique(records.map((item) => item.model)), selectedModel);
  fillVehicleDefaults();
}

function fillVehicleDefaults() {
  const vehicle = state.metadata.catalog.find((item) => item.brand === $("brand").value
    && item.series === $("series").value && item.model === $("model").value);
  if (!vehicle) return;
  state.selected = vehicle;
  for (const name of ["year", "mileage_km", "engine_displacement_cc", "engine_power_hp"]) {
    const value = vehicle.defaults[name];
    $(name).value = value === null ? "" : (name === "year" || name === "mileage_km" ? Math.round(value) : value);
  }
  for (const name of ["transmission", "fuel_type", "body_type", "drivetrain", "color"]) {
    const value = vehicle.defaults[name];
    if (value !== null) $(name).value = value;
  }
  $("form-hint").textContent = "Typical specs filled from the dataset. Check every detail against your car.";
  markDirty();
}

function useExample(showMessage = true) {
  const example = state.metadata.initial;
  $("brand").value = example.brand;
  fillSeries(example.series, example.model);
  clearResult();
  $("form-hint").textContent = "Example vehicle loaded. Edit the details to match your car.";
  if (showMessage) toast("Example loaded. You can change any detail.");
}

function readInput() {
  const input = {};
  for (const name of state.model.preprocessing.categorical_names) input[name] = $(name).value;
  for (const name of ["year", "mileage_km", "engine_displacement_cc", "engine_power_hp"]) {
    input[name] = $(name).value === "" ? null : Number($(name).value);
  }
  return input;
}

function markDirty() {
  $("form-error").hidden = true;
  if (state.prediction !== null) {
    $("result-state").textContent = "Details changed — estimate again to update.";
    $("result-state").classList.add("stale");
  }
}

function clearResult() {
  state.prediction = null;
  $("result-empty").hidden = false;
  $("result-filled").hidden = true;
  $("result-state").textContent = "A starting point, backed by data.";
  $("result-state").classList.remove("stale");
  $("summary-vehicle").textContent = "Your next move, made clearer.";
  $("summary-details").textContent = "Your vehicle details are ready to estimate.";
}

function toast(message) {
  clearTimeout(state.timer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  state.timer = setTimeout(() => { $("toast").hidden = true; }, 3200);
}

function route() {
  const page = ["estimate", "model", "notes"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "estimate";
  for (const name of ["estimate", "model", "notes"]) $("page-" + name).hidden = name !== page;
  for (const link of document.querySelectorAll("[data-page]")) {
    const active = link.dataset.page === page;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function fillModelInformation() {
  const metadata = state.metadata;
  $("metric-r2").textContent = metadata.test_r2.toFixed(3);
  $("metric-mae").textContent = "₺" + Math.round(metadata.test_mae / 1000) + "k";
  for (const [title, value] of [["Original listings", metadata.raw_rows], ["Clean training rows", metadata.training_rows], ["Held-out test rows", metadata.test_rows], ["Decision trees", metadata.tree_count]]) {
    const card = document.createElement("div");
    card.className = "stat-card";
    const heading = document.createElement("span");
    const number = document.createElement("strong");
    heading.textContent = title;
    number.textContent = count(value);
    card.append(heading, number);
    $("model-stats").append(card);
  }
  for (const record of metadata.comparison) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = record.Model;
    if (record.Model === metadata.model_name) {
      row.className = "winner";
      const badge = document.createElement("span");
      badge.className = "winner-label";
      badge.textContent = "SELECTED";
      name.append(badge);
    }
    row.append(name);
    for (const value of [money(record["CV MAE (TRY)"]), money(record["Test MAE (TRY)"]), record["Test R2 (TRY)"].toFixed(4)]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    $("comparison-table").append(row);
  }
  $("coverage-note").textContent = `The source has ${count(metadata.raw_rows)} listings. The model was trained on ${count(metadata.training_rows)} cleaned rows, using ${metadata.reference_year} to calculate vehicle age. The project's price scope is ₺100,000–₺100,000,000.`;
}

$("brand").addEventListener("change", () => fillSeries());
$("series").addEventListener("change", () => fillModels());
$("model").addEventListener("change", fillVehicleDefaults);
$("vehicle-form").addEventListener("input", markDirty);
$("vehicle-form").addEventListener("change", markDirty);
$("use-example").addEventListener("click", () => { if (state.metadata) useExample(); });
$("reset-estimate").addEventListener("click", () => useExample(false));
$("copy-estimate").addEventListener("click", async () => {
  if (state.prediction === null) return;
  try {
    await navigator.clipboard.writeText(`${$("summary-vehicle").textContent}\nEstimated listing price: ${$("estimate-price").textContent}\n${$("summary-details").textContent}\nMotorValue model estimate; not a guaranteed sale price.`);
    toast("Estimate copied.");
  } catch { toast("Select the estimate text to copy it manually."); }
});
$("vehicle-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.model || !$("vehicle-form").reportValidity()) return;
  const button = $("estimate-button");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const input = readInput();
    const prediction = CarPredictor.predict(input, state.model, state.metadata.reference_year);
    if (!Number.isFinite(prediction) || prediction <= 0) throw new Error("This combination could not produce a valid estimate. Please check the vehicle details.");
    state.prediction = prediction;
    $("estimate-price").textContent = money(Math.round(prediction / 1000) * 1000);
    $("result-empty").hidden = true;
    $("result-filled").hidden = false;
    $("result-state").classList.remove("stale");
    $("result-state").textContent = "Estimate updated for your vehicle.";
    $("summary-vehicle").textContent = `${input.brand} ${input.series}`;
    $("summary-details").textContent = `${input.year} · ${count(input.mileage_km)} km · ${label(input.transmission)}`;
    $("form-error").hidden = true;
    if (window.innerWidth < 761) document.querySelector(".estimate-card").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    $("form-error").textContent = error.message || "The estimate could not be calculated. Please try again.";
    $("form-error").hidden = false;
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
});
window.addEventListener("hashchange", route);
route();

(async function loadApplication() {
  try {
    const responses = await Promise.all([fetch("catalog.json"), fetch("model.json")]);
    if (responses.some((response) => !response.ok)) throw new Error("Model files are unavailable.");
    [state.metadata, state.model] = await Promise.all(responses.map((response) => response.json()));
    for (const name of ["transmission", "fuel_type", "body_type", "drivetrain", "color"]) {
      selectOptions(name, state.metadata.options[name]);
    }
    selectOptions("brand", unique(state.metadata.catalog.map((item) => item.brand)));
    useExample(false);
    fillModelInformation();
    $("estimate-button").disabled = false;
    $("model-status").classList.add("ready");
    $("model-status").lastElementChild.textContent = "Model ready";
  } catch (error) {
    $("model-status").classList.add("failed");
    $("model-status").lastElementChild.textContent = "Model unavailable";
    $("form-error").textContent = "The prediction model could not load. Please reload this page to try again.";
    $("form-error").hidden = false;
  }
})();
