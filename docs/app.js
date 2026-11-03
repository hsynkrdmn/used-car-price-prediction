"use strict";

const $ = id => document.getElementById(id);
let savedLanguage;
try { savedLanguage = localStorage.getItem('car-analysis-language'); } catch {}
const state = { language: savedLanguage === 'en' ? 'en' : 'tr', metadata: null, model: null,
  analytics: null, calibration: null, result: null, dirty: false, status: 'loading', hint: 'defaultsHint', error: null, timer: null };
const t = (key, params) => CarI18n.t(state.language, key, params);
const locale = () => state.language === 'tr' ? 'tr-TR' : 'en-GB';
const number = (value, digits = 0) => Number(value).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = value => '₺' + number(Math.round(value));
const signedMoney = value => (value > 0 ? '+' : value < 0 ? '−' : '') + money(Math.abs(value));

const categoryEnglish = {
  'Düz': 'Manual', 'Otomatik': 'Automatic', 'Yarı Otomatik': 'Semi-automatic',
  'Benzin': 'Petrol', 'Dizel': 'Diesel', 'Elektrik': 'Electric', 'Hibrit': 'Hybrid',
  'LPG & benzin': 'LPG & petrol', 'Önden Çekiş': 'Front-wheel drive',
  'Arkadan İtiş': 'Rear-wheel drive', '4WD (Sürekli)': 'Permanent 4WD',
  'AWD (Elektronik)': 'Electronic AWD', 'Beyaz': 'White', 'Siyah': 'Black',
  'Gri': 'Grey', 'Gri (Gümüş)': 'Silver grey', 'Gri (Metalik)': 'Metallic grey',
  'Gri (Titanyum)': 'Titanium grey', 'Füme': 'Charcoal', 'Mavi': 'Blue',
  'Mavi (Metalik)': 'Metallic blue', 'Kırmızı': 'Red', 'Yeşil': 'Green',
  'Yeşil (Metalik)': 'Metallic green', 'Lacivert': 'Navy', 'Bordo': 'Burgundy',
  'Altın': 'Gold', 'Bej': 'Beige', 'Kahverengi': 'Brown', 'Sarı': 'Yellow',
  'Mor': 'Purple', 'Pembe': 'Pink', 'Turkuaz': 'Turquoise', 'Turuncu': 'Orange',
  'Şampanya': 'Champagne', 'Diğer': 'Other',
};
function label(value) {
  if (state.language === 'tr') return String(value);
  return categoryEnglish[value] || String(value).replace(/Hatchback\/3/g, '3-door hatchback')
    .replace(/Hatchback\/5/g, '5-door hatchback').replace(/(\d) Koltuk/g, '$1 seats').replace(/^, /, '');
}
function selectOptions(id, values, selected) {
  const element = $(id);
  element.replaceChildren(...values.map(value => new Option(label(value), value)));
  if (values.includes(selected)) element.value = selected;
  element.disabled = false;
}
const unique = values => [...new Set(values)].sort((a, b) => a.localeCompare(b, locale()));
function fillSeries(series, model) {
  const rows = state.metadata.catalog.filter(item => item.brand === $('brand').value);
  selectOptions('series', unique(rows.map(item => item.series)), series);
  fillModels(model);
}
function fillModels(model) {
  const rows = state.metadata.catalog.filter(item => item.brand === $('brand').value && item.series === $('series').value);
  selectOptions('model', unique(rows.map(item => item.model)), model);
  fillDefaults();
}
function fillDefaults() {
  const vehicle = state.metadata.catalog.find(item => item.brand === $('brand').value
    && item.series === $('series').value && item.model === $('model').value);
  if (!vehicle) return;
  for (const name of ['year', 'mileage_km', 'engine_displacement_cc', 'engine_power_hp']) {
    const value = vehicle.defaults[name];
    $(name).value = value === null ? '' : ['year', 'mileage_km'].includes(name) ? Math.round(value) : value;
  }
  for (const name of ['transmission', 'fuel_type', 'body_type', 'drivetrain', 'color']) {
    const value = vehicle.defaults[name];
    if (value !== null) $(name).value = value;
  }
  state.hint = 'defaultsHint';
  $('form-hint').textContent = t(state.hint);
  markDirty();
}
function initializeVehicle() {
  if (!state.metadata) return;
  const example = state.metadata.initial;
  $('brand').value = example.brand;
  fillSeries(example.series, example.model);
  clearResult();
  state.hint = 'defaultsHint';
  $('form-hint').textContent = t(state.hint);
}
function readInput() {
  const input = {};
  for (const name of state.model.preprocessing.categorical_names) input[name] = $(name).value;
  for (const name of ['year', 'mileage_km', 'engine_displacement_cc', 'engine_power_hp']) {
    input[name] = $(name).value === '' ? null : Number($(name).value);
  }
  return input;
}
function renderError() {
  $('form-error').hidden = !state.error;
  $('form-error').textContent = state.error ? t(state.error) : '';
}
function markDirty() {
  state.error = null;
  renderError();
  if (state.result) { state.dirty = true; renderResult(); }
}
function clearResult() {
  state.result = null;
  state.dirty = false;
  $('calibrated-details').open = false;
  renderResult();
}
function renderResult() {
  const result = state.result;
  $('result-empty').hidden = Boolean(result);
  $('result-filled').hidden = !result;
  $('impact-card').hidden = !result;
  $('result-state').classList.toggle('stale', state.dirty);
  $('result-filled').classList.toggle('is-stale', state.dirty);
  $('impact-card').classList.toggle('is-stale', state.dirty);
  $('copy-estimate').disabled = !result || state.dirty;
  $('result-state').textContent = t(state.dirty ? 'dirty' : result ? 'rounded' : 'emptyState');
  if (!result) {
    $('summary-vehicle').textContent = t('noEstimate');
    $('summary-details').textContent = t('summaryEmpty');
    $('impact-list').replaceChildren();
    return;
  }
  const { input, prediction, band, impacts, interval } = result;
  const price = money(Math.round(prediction / 1000) * 1000);
  $('estimate-price').textContent = price;
  $('estimate-price').classList.toggle('long-price', price.length > 12);
  $('estimate-range').textContent = `${money(Math.floor(band.lower / 1000) * 1000)} – ${money(Math.ceil(band.upper / 1000) * 1000)}`;
  $('interval-label').textContent = t('bandTitle', { margin: number(band.margin * 100, 1) });
  $('range-point').style.left = '50%';
  $('calibrated-range').textContent = `${money(Math.floor(interval.lower / 1000) * 1000)} – ${money(Math.ceil(interval.upper / 1000) * 1000)}`;
  $('calibrated-note').textContent = t('calibratedNote', {
    rows: number(state.calibration.evaluation_rows), coverage: number(state.calibration.empirical_row_coverage * 100, 1),
  });
  $('summary-vehicle').textContent = `${input.brand} ${input.series} · ${input.model}`;
  $('summary-details').textContent = `${input.year} · ${number(input.mileage_km)} km · ${label(input.transmission)}`;
  const maximumImpact = Math.max(...impacts.map(impact => Math.abs(impact.value)), 1);
  $('impact-list').replaceChildren(...impacts.map(impact => {
    const item = document.createElement('li');
    item.className = impact.value > 0 ? 'impact-positive' : impact.value < 0 ? 'impact-negative' : 'impact-neutral';
    const title = document.createElement('span'), value = document.createElement('strong');
    const key = impact.id === 'mileage' && impact.value > 0 ? 'impactMileageLow'
      : { trim: 'impactTrim', mileage: 'impactMileage', age: 'impactAge' }[impact.id];
    title.textContent = t(key);
    value.textContent = signedMoney(impact.value);
    const heading = document.createElement('div'); heading.className = 'telemetry-heading';
    heading.append(title, value);
    const track = document.createElement('div'), fill = document.createElement('span');
    track.className = 'telemetry-track'; track.setAttribute('aria-hidden', 'true');
    fill.className = 'telemetry-fill';
    fill.style.width = `${48 * Math.abs(impact.value) / maximumImpact}%`;
    track.append(fill); item.append(heading, track);
    return item;
  }));
}
function renderModelInformation() {
  if (!state.metadata || !state.analytics) return;
  const metadata = state.metadata, analytics = state.analytics;
  $('model-stats').replaceChildren(...[
    ['rawRows', number(metadata.raw_rows)], ['trainingRows', number(metadata.training_rows)],
    ['testRows', number(metadata.test_rows)], ['testMape', number(analytics.test_mape * 100, 2) + '%'],
  ].map(([key, value]) => {
    const card = document.createElement('div'); card.className = 'stat-card';
    const title = document.createElement('span'), metric = document.createElement('strong');
    title.textContent = t(key); metric.textContent = value; card.append(title, metric); return card;
  }));
  $('comparison-table').replaceChildren(...['CatBoost', 'LightGBM', 'XGBoost'].map(modelName => {
    const record = metadata.comparison.find(item => item.Model === modelName);
    const row = document.createElement('tr'), name = document.createElement('td');
    name.textContent = record.Model;
    if (record.Model === metadata.model_name) {
      row.className = 'winner';
      const badge = document.createElement('span'); badge.className = 'winner-label'; badge.textContent = t('selected'); name.append(badge);
    }
    row.append(name);
    for (const value of [number(record['Test R2 (TRY)'], 4), money(record['Test MAE (TRY)']), money(record['Test RMSE (TRY)'])]) {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    }
    return row;
  }));
  const importance = analytics.importance;
  const leadingFeatures = [...importance.features].filter(feature => feature.mae_increase > 0)
    .sort((a, b) => b.mae_increase - a.mae_increase).slice(0, 3).map(feature => t(feature.id + 'Feature'));
  $('importance-insight').textContent = t('importanceInsight', {
    features: new Intl.ListFormat(locale(), { style: 'long', type: 'conjunction' }).format(leadingFeatures),
  });
  const maximum = Math.max(...importance.features.map(feature => Math.abs(feature.mae_increase)), 1);
  for (const group of ['categorical', 'numeric']) {
    $('importance-' + group).replaceChildren(...importance.features.filter(feature => feature.group === group).map(feature => {
      const row = document.createElement('li'), heading = document.createElement('div');
      const title = document.createElement('span'), value = document.createElement('strong');
      title.textContent = t(feature.id + 'Feature'); value.textContent = signedMoney(feature.mae_increase);
      heading.append(title, value);
      const track = document.createElement('div'), bar = document.createElement('span');
      track.className = 'importance-track'; track.setAttribute('aria-hidden', 'true');
      bar.style.width = `${100 * Math.abs(feature.mae_increase) / maximum}%`;
      if (feature.mae_increase < 0) bar.className = 'negative-importance';
      track.append(bar); row.append(heading, track); return row;
    }));
  }
  $('importance-description').textContent = t('importanceNote', { rows: number(importance.sample_rows), repeats: importance.repeats });
  $('band-evaluation').textContent = t('bandEvaluation', { rows: number(analytics.evaluation_rows), coverage: number(analytics.band_evaluation_coverage * 100, 1) });
  $('coverage-note').textContent = t('coverage', { raw: number(metadata.raw_rows), train: number(metadata.training_rows), test: number(metadata.test_rows), year: metadata.reference_year });
}
function renderTheme() {
  const light = document.documentElement.dataset.theme === 'light';
  const action = t(light ? 'switchToDark' : 'switchToLight');
  $('theme-toggle').setAttribute('aria-label', action);
  $('theme-toggle').title = action;
  document.querySelector('meta[name="theme-color"]').content = light ? '#eef5f8' : '#080f1b';
}
function setLanguage(language) {
  state.language = language === 'en' ? 'en' : 'tr';
  try { localStorage.setItem('car-analysis-language', state.language); } catch {}
  document.documentElement.lang = state.language;
  document.title = t('title');
  document.querySelector('meta[name="description"]').content = t('description');
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  for (const element of document.querySelectorAll('[data-i18n-alt]')) element.alt = t(element.dataset.i18nAlt);
  for (const button of document.querySelectorAll('[data-lang]')) button.setAttribute('aria-pressed', String(button.dataset.lang === state.language));
  for (const option of document.querySelectorAll('select option')) option.textContent = label(option.value);
  $('model-status-text').textContent = t(state.status);
  $('form-hint').textContent = t(state.hint);
  $('toast').hidden = true;
  renderTheme(); renderError(); renderModelInformation(); renderResult();
}
function toast(key) {
  clearTimeout(state.timer);
  $('toast').textContent = t(key); $('toast').hidden = false;
  state.timer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}
function route() {
  const page = ['estimate', 'model', 'notes'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'estimate';
  for (const name of ['estimate', 'model', 'notes']) $('page-' + name).hidden = name !== page;
  for (const link of document.querySelectorAll('[data-page]')) {
    const active = link.dataset.page === page; link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

$('brand').addEventListener('change', () => fillSeries());
$('series').addEventListener('change', () => fillModels());
$('model').addEventListener('change', fillDefaults);
$('vehicle-form').addEventListener('input', markDirty);
$('vehicle-form').addEventListener('change', markDirty);
$('theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('car-analysis-theme', theme); } catch {}
  renderTheme();
});
$('reset-estimate').addEventListener('click', clearResult);
for (const button of document.querySelectorAll('[data-lang]')) button.addEventListener('click', () => setLanguage(button.dataset.lang));
$('copy-estimate').addEventListener('click', async () => {
  if (!state.result || state.dirty) return;
  try {
    const calibrated = $('calibrated-details').open
      ? `\n${t('calibratedTitle')}: ${$('calibrated-range').textContent}\n${t('calibratedCopy', { coverage: number(state.calibration.empirical_row_coverage * 100, 1) })}` : '';
    await navigator.clipboard.writeText(`${$('summary-vehicle').textContent}\n${$('summary-details').textContent}\n${t('listingEstimate')}: ${$('estimate-price').textContent}\n${$('interval-label').textContent}: ${$('estimate-range').textContent}\n${t('copyDisclaimer')}${calibrated}\nHüseyin Karaduman | Data Science & Analytics`);
    toast('copied');
  } catch { toast('copyFailed'); }
});
$('vehicle-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.model || !state.analytics || !$('vehicle-form').reportValidity()) return;
  const button = $('estimate-button'); button.disabled = true; button.setAttribute('aria-busy', 'true');
  try {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const input = readInput(), prediction = CarPredictor.predict(input, state.model, state.metadata.reference_year);
    if (!Number.isFinite(prediction) || prediction <= 0) throw new Error('Invalid prediction');
    const band = CarPredictor.mapeBand(prediction, input, state.analytics);
    const impacts = CarPredictor.simulatedImpacts(input, prediction, state.metadata.reference_year);
    const interval = CarPredictor.predictionInterval(prediction, state.calibration);
    state.result = { input, prediction, band, impacts, interval }; state.dirty = false; state.error = null;
    renderResult(); renderError();
    if (window.innerWidth < 701) document.querySelector('.estimate-card').scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  } catch { state.error = 'invalidPrediction'; renderError(); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
});
window.addEventListener('hashchange', route);
setLanguage(state.language); route();
(async function loadApplication() {
  try {
    const responses = await Promise.all(['catalog.json', 'model.json', 'analytics.json', 'interval.json'].map(file => fetch(file)));
    if (responses.some(response => !response.ok)) throw new Error('Missing model data');
    [state.metadata, state.model, state.analytics, state.calibration] = await Promise.all(responses.map(response => response.json()));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(state.model)));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (fingerprint !== state.analytics.model_sha256 || fingerprint !== state.calibration.model_sha256) throw new Error('Analytics/model mismatch');
    if (state.calibration.coverage !== 0.95) throw new Error('Expected 95% interval calibration');
    CarPredictor.predictionInterval(1, state.calibration);
    $('year').max = state.metadata.reference_year + 1;
    for (const name of ['transmission', 'fuel_type', 'body_type', 'drivetrain', 'color']) selectOptions(name, state.metadata.options[name]);
    selectOptions('brand', unique(state.metadata.catalog.map(item => item.brand)));
    initializeVehicle(); renderModelInformation();
    $('estimate-button').disabled = false;
    state.status = 'ready'; $('model-status').classList.add('ready'); $('model-status-text').textContent = t(state.status);
  } catch {
    state.status = 'unavailable'; state.error = 'loadError'; $('model-status').classList.add('failed');
    $('model-status-text').textContent = t(state.status); renderError();
  }
})();
