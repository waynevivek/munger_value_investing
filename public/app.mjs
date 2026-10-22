import {
  checkFigureText,
  describeMissingData,
  escapeHtml,
  formatCurrency,
  formatFieldValue,
  formatNumber,
  formatPercent,
  formatRatio,
  priceSummary,
  scoreTone,
  statusLabel,
  thresholdText,
  FIELD_META,
} from './render.mjs';
import { presetFromGetter, presetValues, validatePreset } from './preset.mjs';
import { DEFAULT_SORT, ariaSort, nextSort, sortCompanies } from './sort.mjs';

const LOOKBACK_STORAGE_KEY = 'munger-screener:lookback';
const PRESET_STORAGE_KEY = 'munger-screener:preset:v1';
const savedPriceKey = (companyId) => `munger-screener:manual-price:${companyId}`;

const state = {
  lookbackYears: readSavedLookback(),
  companyId: new URLSearchParams(window.location.search).get('company'),
  dataset: null,
  companies: [],
  config: null,
  preset: readSavedPreset(),
  presetMessage: null,
  sort: { ...DEFAULT_SORT },
  detail: null,
  loading: true,
  detailLoading: false,
  error: null,
  detailError: null,
};

const elements = {
  banner: document.querySelector('#dataset-banner'),
  lookback: document.querySelector('#lookback'),
  screenerHead: document.querySelector('#screener-head'),
  screenerBody: document.querySelector('#screener-body'),
  screenerMessage: document.querySelector('#screener-message'),
  presetPanel: document.querySelector('#preset-panel'),
  presetMessage: document.querySelector('#preset-message'),
  panel: document.querySelector('#company-panel'),
};

function readSavedLookback() {
  try {
    const value = Number(localStorage.getItem(LOOKBACK_STORAGE_KEY));
    return value === 10 ? 10 : 5;
  } catch {
    return 5;
  }
}

function saveLookback(value) {
  try {
    localStorage.setItem(LOOKBACK_STORAGE_KEY, String(value));
  } catch {
    // Browsers can refuse storage; the selection still works for this page view.
  }
}

function readSavedPrice(companyId) {
  try {
    const raw = localStorage.getItem(savedPriceKey(companyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed
      || !Number.isFinite(parsed.price)
      || parsed.price <= 0
      || typeof parsed.asOfDate !== 'string'
      || typeof parsed.source !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePrice(companyId, price) {
  try {
    localStorage.setItem(savedPriceKey(companyId), JSON.stringify(price));
  } catch {
    // The price is still applied for this request.
  }
}

function clearPrice(companyId) {
  try {
    localStorage.removeItem(savedPriceKey(companyId));
  } catch {
    // Nothing else to clear.
  }
}

function readSavedPreset() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (!Array.isArray(parsed.qualityChecks)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePreset(preset) {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(preset));
  } catch {
    // The preset is still applied for this page view.
  }
}

function clearSavedPreset() {
  try {
    localStorage.removeItem(PRESET_STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Could not reach the local server. Start it with “npm start”, then retry.');
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Fall back to a status-based message below.
  }

  if (!response.ok) {
    const error = new Error(body?.error?.message ?? `The request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatScore(score) {
  if (!Number.isFinite(score)) return '—';
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function formatYearRange(years) {
  if (!years || years.length === 0) return 'no years';
  const sorted = [...years].sort((a, b) => a - b);
  return sorted.length === 1 ? `FY${sorted[0]}` : `FY${sorted[0]}–FY${sorted[sorted.length - 1]}`;
}

function renderBanner() {
  if (state.loading) {
    elements.banner.innerHTML = '<p class="muted">Loading the pilot dataset…</p>';
    return;
  }

  if (state.error) {
    elements.banner.innerHTML = `
      <div class="notice notice-error" role="alert">
        <h2>Could not load the pilot dataset</h2>
        <p>${escapeHtml(state.error)}</p>
        <button class="button" type="button" data-retry="all">Retry</button>
      </div>`;
    return;
  }

  const dataset = state.dataset;
  elements.banner.innerHTML = `
    <h2>${escapeHtml(dataset.name)}</h2>
    <p>${escapeHtml(dataset.ingestion)}</p>
    <ul class="banner-facts">
      <li>${dataset.companyCount} compan${dataset.companyCount === 1 ? 'y' : 'ies'}</li>
      <li>${formatYearRange(dataset.coverage.fiscalYears)}</li>
      <li>Verified ${escapeHtml(dataset.verifiedOn)}</li>
      <li>Manual price only</li>
      <li>Redistribution unverified</li>
    </ul>
    <p class="footnote">${escapeHtml(dataset.redistribution)} ${escapeHtml(dataset.disclaimer)}</p>`;
}

function renderPresetMessage() {
  elements.presetMessage.textContent = state.presetMessage ?? '';
}

function renderPreset() {
  if (!state.config) {
    elements.presetPanel.innerHTML = '';
    return;
  }

  const values = presetValues(state.preset, state.config);
  const custom = state.preset !== null;
  const valuesById = new Map(values.qualityChecks.map((check) => [check.id, check]));

  const rows = state.config.quality.checks.map((check) => {
    const current = valuesById.get(check.id) ?? check;
    const unit = check.unit === 'ratio' ? '×' : check.unit === 'percent-of-years' ? '% of years' : '%';
    return `
      <tr>
        <td>
          ${escapeHtml(check.label)}
          <span class="company-meta">${escapeHtml(check.measurement)} · ${escapeHtml(unit)}</span>
        </td>
        <td class="num">
          <input class="preset-input" type="number" step="any" name="check:${escapeHtml(check.id)}:floor"
            value="${escapeHtml(current.floor)}" aria-label="${escapeHtml(check.label)} zero-credit value">
        </td>
        <td class="num">
          <input class="preset-input" type="number" step="any" name="check:${escapeHtml(check.id)}:target"
            value="${escapeHtml(current.target)}" aria-label="${escapeHtml(check.label)} full-credit value">
        </td>
        <td class="num">
          <input class="preset-input" type="number" min="0" step="any" name="check:${escapeHtml(check.id)}:weight"
            value="${escapeHtml(current.weight)}" aria-label="${escapeHtml(check.label)} weight">
        </td>
      </tr>`;
  }).join('');

  elements.presetPanel.innerHTML = `
    <details class="preset-panel"${custom ? ' open' : ''}>
      <summary>
        Screen settings
        ${custom ? '<span class="chip custom-chip">Custom preset</span>' : '<span class="muted">· default preset</span>'}
      </summary>
      <form id="preset-form" class="preset-form" novalidate>
        <p class="subsection-intro">Edit the thresholds and weights used by the quality scorer. The combined score remains
          50% quality and 50% valuation, and the valuation scenario assumptions stay fixed.</p>
        <div class="table-scroll">
          <table class="data-table preset-table">
            <thead>
              <tr><th scope="col">Check</th><th scope="col">Zero credit</th><th scope="col">Full credit</th><th scope="col">Weight</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <label class="field preset-margin" for="margin-target">
          <span>Margin-of-safety target (%)</span>
          <input id="margin-target" name="marginOfSafetyTargetPercent" type="number" step="any"
            value="${escapeHtml(values.marginOfSafetyTargetPercent)}">
        </label>
        <div class="form-actions">
          <button class="button" type="submit">Apply preset</button>
          <button class="button button-secondary" type="button" id="reset-preset"${custom ? '' : ' disabled'}>Reset to default</button>
        </div>
        <p class="form-help">Weights must add to ${state.config.quality.maximumScore}. These are transparent screening heuristics,
          not an official Buffett or Munger formula.</p>
      </form>
    </details>`;
}

const SORT_COLUMNS = [
  { key: 'name', label: 'Company' },
  { key: 'coverage', label: 'Fiscal coverage' },
  { key: 'quality', label: 'Quality' },
];

function sortHeader(column) {
  const aria = ariaSort(state.sort, column.key);
  const indicator = aria === 'none' ? '↕' : aria === 'ascending' ? '▲' : '▼';
  return `
    <th scope="col" aria-sort="${aria}">
      <button type="button" class="sort-button" data-sort="${column.key}">
        ${escapeHtml(column.label)}<span class="sort-indicator" aria-hidden="true">${indicator}</span>
      </button>
    </th>`;
}

function renderScreenerHead() {
  elements.screenerHead.innerHTML = `<tr>${SORT_COLUMNS.map(sortHeader).join('')}<th scope="col">Analysis</th></tr>`;
}

function renderScreener() {
  renderScreenerHead();

  if (state.loading) {
    elements.screenerBody.innerHTML = '<tr><td colspan="4" class="muted">Loading companies…</td></tr>';
    elements.screenerMessage.innerHTML = '';
    return;
  }

  if (state.error) {
    elements.screenerBody.innerHTML = '<tr><td colspan="4" class="muted">Pilot data unavailable.</td></tr>';
    elements.screenerMessage.innerHTML = '';
    return;
  }

  if (state.companies.length === 0) {
    elements.screenerBody.innerHTML = '';
    elements.screenerMessage.innerHTML = `
      <div class="empty-state">
        <h3>No companies in the pilot</h3>
        <p>The dataset loaded, but it contains no company records.</p>
      </div>`;
    return;
  }

  elements.screenerBody.innerHTML = sortCompanies(state.companies, state.sort).map((company) => {
    const quality = Number.isFinite(company.qualityScore)
      ? `<span class="score-text tone-${scoreTone(company.qualityScore)}">${formatScore(company.qualityScore)}/100</span>`
      : '<span class="score-pill">Insufficient data</span>';
    return `
      <tr>
        <td>
          <a class="company-link" href="?company=${encodeURIComponent(company.companyId)}">${escapeHtml(company.companyName)}</a>
          <span class="company-meta">${escapeHtml(company.companyId)} · ${escapeHtml(company.currency)}</span>
        </td>
        <td>
          ${formatYearRange(company.coverage.fiscalYears)}
          <span class="company-meta">${company.coverage.annualFilings} annual filing${company.coverage.annualFilings === 1 ? '' : 's'}</span>
        </td>
        <td>${quality}</td>
        <td>
          <a href="?company=${encodeURIComponent(company.companyId)}">Open analysis</a>
          <span class="company-meta">Enter a dated price for valuation</span>
        </td>
      </tr>`;
  }).join('');

  const messages = [];
  const incomplete = state.companies.filter((company) => !company.coverage.complete);
  if (incomplete.length > 0) {
    messages.push(`<p class="notice notice-warning">The ${state.lookbackYears}-year lookback is incomplete for `
      + `${incomplete.map((company) => escapeHtml(company.companyId)).join(', ')}. The analysis reports the missing `
      + 'fiscal years and withholds a score instead of treating missing data as poor performance.</p>');
  }
  if (state.preset) {
    messages.unshift('<p class="notice notice-success">A custom preset is applied to quality thresholds and weights. '
      + 'The combined score stays 50/50; reset it in Screen settings.</p>');
  }
  messages.push('<p class="notice">Market price is entered manually in the company view. No price is fetched, so '
    + 'valuation and the combined score remain blank until a dated price is supplied.</p>');
  elements.screenerMessage.innerHTML = messages.join('');
}

function scoreCard({ label, score, note, primary = false, unavailableText = 'Not calculated' }) {
  const hasScore = Number.isFinite(score);
  const value = hasScore
    ? `${formatScore(score)}<small>/100</small>`
    : escapeHtml(unavailableText);
  return `
    <div class="score-card${primary ? ' primary' : ''}">
      <p class="score-label">${escapeHtml(label)}</p>
      <p class="score-value${hasScore ? ` tone-${scoreTone(score)}` : ' text-value'}">${value}</p>
      <p class="score-note">${escapeHtml(note)}</p>
    </div>`;
}

function companyStatus(screen, hasPrice) {
  if (screen.status === 'scored') {
    return { label: 'Scored', tone: scoreTone(screen.totalScore) };
  }
  if (!hasPrice && Number.isFinite(screen.qualityScore)) {
    return { label: 'Quality scored · price needed', tone: 'mid' };
  }
  return { label: statusLabel(screen.status), tone: 'neutral' };
}

function verdictFor(detail) {
  const screen = detail.screen;
  const hasPrice = detail.price.status === 'supplied';

  if (!Number.isFinite(screen.qualityScore)) {
    return 'The selected annual history is incomplete, so nothing is scored. Missing filings and inputs are listed below.';
  }

  const passed = screen.qualityChecks.filter((check) => check.passed).length;
  const qualitySentence = `${passed} of ${screen.qualityChecks.length} quality checks pass over the selected history.`;

  if (!hasPrice) {
    return `${qualitySentence} The intrinsic-value range and combined score appear once you enter a dated manual price.`;
  }
  if (screen.status === 'insufficient-data') {
    return `${qualitySentence} Some required inputs are missing for this selection, so the combined score is withheld rather than shown as low.`;
  }
  if (screen.status === 'not-valuatable') {
    return `${qualitySentence} Normalized owner earnings are not positive, so no intrinsic-value range is presented.`;
  }

  const valuation = screen.valuation;
  const price = valuation.price.pricePerShare;
  let sentence = `${qualitySentence} The base-case intrinsic value is ${formatCurrency(valuation.scenarios.base.intrinsicValuePerShare)} `
    + `per share against the entered price of ${formatCurrency(price)}: a ${formatPercent(valuation.baseMarginOfSafetyPercent)} margin of safety.`;

  if (screen.valuationScore === 0) {
    sentence += ' The valuation component therefore receives 0 of 100 points. That is a price-versus-value result, '
      + 'not a quality failure.';
  } else if (screen.valuationScore === 100) {
    sentence += ' The valuation component receives the full 100 points.';
  } else {
    const target = valuation.scoreAssumption.targetPercent;
    sentence += ` The valuation component receives ${formatScore(screen.valuationScore)} of 100 points, scaled to full `
      + `credit at a ${formatPercent(target, 0)} base-case margin of safety.`;
  }
  return sentence;
}

function renderScenarioCards(detail) {
  const scenarios = detail.screen.valuation.scenarios;
  if (!scenarios) {
    const reason = detail.price.status === 'supplied'
      ? 'No intrinsic-value range can be calculated from the available history.'
      : 'Enter a dated manual price to calculate LOW, BASE, and HIGH intrinsic values.';
    return `<p class="notice">${escapeHtml(reason)}</p>`;
  }

  return ['low', 'base', 'high'].map((name) => {
    const scenario = scenarios[name];
    const margin = scenario.marginOfSafetyPercent;
    const tone = Number.isFinite(margin) ? (margin >= 25 ? 'good' : margin >= 0 ? 'mid' : 'low') : 'neutral';
    return `
      <article class="scenario${name === 'base' ? ' base' : ''}">
        <p class="scenario-label">${escapeHtml(scenario.label)}${name === 'base' ? ' · drives score' : ''}</p>
        <p class="scenario-value">${formatCurrency(scenario.intrinsicValuePerShare)}</p>
        <p class="scenario-mos tone-${tone}">Margin of safety ${formatPercent(margin)}</p>
        <ul class="metric-list">
          <li><span>Normalized owner earnings</span><span>${formatCurrency(scenario.normalizedOwnerEarningsPerShare)}/sh</span></li>
          <li><span>Maintenance capex</span><span>${formatCurrency(scenario.maintenanceCapexPerShare)}/sh</span></li>
          <li><span>OE growth, 5 years</span><span>${formatPercent(scenario.assumptions.ownerEarningsGrowthRatePercent, 0)}</span></li>
          <li><span>Terminal growth</span><span>${formatPercent(scenario.assumptions.terminalGrowthRatePercent, 0)}</span></li>
          <li><span>Discount rate</span><span>${formatPercent(scenario.assumptions.discountRatePercent, 0)}</span></li>
          <li><span>Maintenance share of capex</span><span>${formatPercent(scenario.assumptions.maintenanceCapexPercentOfTotalCapex, 0)}</span></li>
        </ul>
      </article>`;
  }).join('');
}

function renderQualityChecks(screen) {
  return screen.qualityChecks.map((check) => {
    const tone = Number.isFinite(check.scorePercent) ? scoreTone(check.scorePercent) : 'neutral';
    const badge = check.passed === true
      ? '<span class="score-pill tone-good">Pass</span>'
      : check.passed === false
        ? '<span class="score-pill tone-low">Below target</span>'
        : '<span class="score-pill">Not calculated</span>';
    return `
      <article class="check tone-${tone}">
        <div class="check-head">
          <h4>${escapeHtml(check.label)}</h4>
          ${badge}
        </div>
        <p class="check-figure">${escapeHtml(checkFigureText(check))}</p>
        <p class="check-explanation">${escapeHtml(check.explanation)}</p>
        <progress class="progress" value="${Number.isFinite(check.scorePercent) ? check.scorePercent : 0}" max="100"
          aria-label="${escapeHtml(check.label)} score"></progress>
        <div class="check-meta">
          <span>${Number.isFinite(check.scorePercent) ? formatPercent(check.scorePercent, 0) : '—'} of the check</span>
          <span>${check.pointsAwarded === null ? '—' : formatNumber(check.pointsAwarded, 2)} of ${check.weight} points</span>
          <span>${escapeHtml(thresholdText(check))}</span>
        </div>
      </article>`;
  }).join('');
}

function renderCoverage(detail) {
  const coverage = detail.coverage;
  const chips = coverage.requestedYears.map((year) => {
    const included = coverage.fiscalYears.includes(year);
    return `<span class="chip${included ? '' : ' missing'}">FY${year} · ${included ? 'included' : 'not in pilot'}</span>`;
  }).join('');
  return `
    <p>${coverage.requestedLookbackYears}-year selection · ${coverage.annualFilings} annual filing${coverage.annualFilings === 1 ? '' : 's'} available`
    + ` (${formatYearRange(coverage.fiscalYears)}) · ${coverage.complete ? 'complete' : `${coverage.missingYears.length} year${coverage.missingYears.length === 1 ? '' : 's'} missing`}</p>
    <div class="coverage-chips">${chips}</div>`;
}

function renderMissingData(screen) {
  const groups = describeMissingData(screen.missingData);
  if (groups.length === 0) return '';
  return `
    <details>
      <summary>Missing or unverified inputs <span class="muted">(${screen.missingData.length})</span></summary>
      <table class="data-table">
        <thead><tr><th scope="col">Scope</th><th scope="col">Fields</th></tr></thead>
        <tbody>
          ${groups.map((group) => `<tr><td>${escapeHtml(group.label)}</td><td>${escapeHtml(group.detail)}</td></tr>`).join('')}
        </tbody>
      </table>
    </details>`;
}

function configThreshold(unit, value) {
  return unit === 'ratio' ? formatRatio(value) : formatPercent(value, 0);
}

function renderAssumptions(screen) {
  const config = screen.assumptions.configuration;
  const qualityTable = config.quality.checks.map((check) => `
    <tr>
      <td>${escapeHtml(check.label)}</td>
      <td>${escapeHtml(check.measurement)}</td>
      <td class="num">${configThreshold(check.unit, check.floor)}</td>
      <td class="num">${configThreshold(check.unit, check.target)}</td>
      <td class="num">${check.weight}</td>
    </tr>`).join('');

  const valuationTable = Object.entries(config.valuation.scenarios).map(([name, scenario]) => `
    <tr>
      <td>${name === 'base' ? '<strong>Base</strong>' : name.charAt(0).toUpperCase() + name.slice(1)}</td>
      <td class="num">${formatPercent(scenario.ownerEarningsGrowthRatePercent, 0)}</td>
      <td class="num">${formatPercent(scenario.terminalGrowthRatePercent, 0)}</td>
      <td class="num">${formatPercent(scenario.discountRatePercent, 0)}</td>
      <td class="num">${formatPercent(scenario.maintenanceCapexPercentOfTotalCapex, 0)}</td>
    </tr>`).join('');

  return `
    <details>
      <summary>Quality rubric <span class="muted">· config v${escapeHtml(config.quality.version)}</span></summary>
      <p class="subsection-intro">Each check is graded linearly between its zero-credit floor and full-credit target. ROIC is graded year by year and averaged; debt uses the period median; earnings and cash generation use positive-year shares.</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th scope="col">Check</th><th scope="col">Measurement</th><th scope="col">Zero credit</th><th scope="col">Full credit</th><th scope="col">Weight</th></tr></thead>
          <tbody>${qualityTable}</tbody>
        </table>
      </div>
    </details>
    <details>
      <summary>Valuation method <span class="muted">· config v${escapeHtml(config.valuation.version ?? '1')}</span></summary>
      <p class="subsection-intro">${escapeHtml(config.valuation.valueMethod)}. ${escapeHtml(config.valuation.normalizedOwnerEarningsMethod)}. ${escapeHtml(config.valuation.terminalValueMethod)}. ${escapeHtml(config.valuation.discountRateBasis)}</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th scope="col">Case</th><th scope="col">OE growth</th><th scope="col">Terminal growth</th><th scope="col">Discount rate</th><th scope="col">Maintenance capex</th></tr></thead>
          <tbody>${valuationTable}</tbody>
        </table>
      </div>
      <p class="form-help">Forecast ${config.valuation.forecastYears} years. Margin-of-safety score: ${formatPercent(config.valuation.marginOfSafetyFloorPercent, 0)} floor to ${formatPercent(config.valuation.marginOfSafetyTargetPercent, 0)} target, measured on the base case. Combined score: ${config.combinedScore.qualityWeight}% quality + ${config.combinedScore.valuationWeight}% valuation.</p>
    </details>`;
}

function renderProvenance(detail) {
  return detail.provenance.map((year) => {
    const rows = year.fields.map((field) => {
      const meta = FIELD_META[field.field] ?? { label: field.field, unit: '' };
      return `
        <tr>
          <td>${escapeHtml(meta.label)}</td>
          <td class="num">${formatFieldValue(field.field, field.value)}</td>
          <td>${escapeHtml(meta.unit)}</td>
          <td><span class="source-text">${field.source ? escapeHtml(field.source) : 'Not recorded'}</span></td>
          <td class="num">${field.reportingDate ? escapeHtml(field.reportingDate) : '—'}</td>
          <td><span class="method-text">${field.method ? escapeHtml(field.method) : 'Not recorded'}</span></td>
        </tr>`;
    }).join('');
    return `
      <details>
        <summary>FY${year.fiscalYear} <span class="muted">· reported ${escapeHtml(year.reportingDate)} · 7 inputs</span></summary>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr><th scope="col">Input</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Source</th><th scope="col">Reporting date</th><th scope="col">Mapping method</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </details>`;
  }).join('');
}

function renderCompany() {
  if (state.detailLoading && !state.detail) {
    elements.panel.innerHTML = '<p class="loading-state">Loading company analysis…</p>';
    return;
  }

  if (state.detailError && !state.detail) {
    elements.panel.innerHTML = `
      <div class="error-state">
        <h3>Could not load the company analysis</h3>
        <p>${escapeHtml(state.detailError)}</p>
        <button class="button" type="button" data-retry="detail">Retry</button>
    </div>`;
    return;
  }

  if (!state.detail) {
    elements.panel.innerHTML = `
      <div class="empty-state">
        <h3>Select a company</h3>
        <p>Choose a covered company above to see its quality checks, valuation range, and provenance.</p>
      </div>`;
    return;
  }

  const detail = state.detail;
  const screen = detail.screen;
  const company = detail.company;
  const hasPrice = detail.price.status === 'supplied';
  const status = companyStatus(screen, hasPrice);
  const warnings = detail.warnings.map((warning) => `<li class="warning-item">${escapeHtml(warning.message)}</li>`).join('');
  const price = priceSummary(detail.price);
  const saved = readSavedPrice(company.companyId);
  const formValues = saved ?? (hasPrice
    ? { price: detail.price.pricePerShare, asOfDate: detail.price.asOfDate, source: detail.price.source }
    : { price: '', asOfDate: '', source: '' });
  const config = screen.assumptions.configuration;

  const qualityNote = Number.isFinite(screen.qualityScore)
    ? `${screen.qualityChecks.filter((check) => check.passed).length} of ${screen.qualityChecks.length} checks pass`
    : `Requires ${detail.coverage.requestedLookbackYears} complete annual filings`;
  const valuationNote = Number.isFinite(screen.valuationScore)
    ? `Base-case margin of safety ${formatPercent(screen.valuation.baseMarginOfSafetyPercent)}`
    : hasPrice ? 'Not calculated from this history' : 'Needs a dated manual price';
  const totalNote = Number.isFinite(screen.totalScore)
    ? `${config.combinedScore.qualityWeight}% quality + ${config.combinedScore.valuationWeight}% valuation`
    : hasPrice ? 'A complete quality and valuation result is required' : 'Quality is ready; valuation needs a price';

  elements.panel.innerHTML = `
    <div class="company-head">
      <div>
        <p class="eyebrow">${escapeHtml(company.companyId)} · ${escapeHtml(company.currency)} · local pilot</p>
        <h2>${escapeHtml(company.companyName)}</h2>
        <p class="muted">${formatYearRange(company.fiscalYears)} · ${detail.coverage.annualFilings} annual filings · manually transcribed</p>
      </div>
      <span class="score-pill tone-${status.tone}">${escapeHtml(status.label)}</span>
    </div>

    <div class="score-grid">
      ${scoreCard({ label: 'Combined score', score: screen.totalScore, note: totalNote, primary: true })}
      ${scoreCard({ label: `Quality · ${config.combinedScore.qualityWeight}%`, score: screen.qualityScore, note: qualityNote })}
      ${scoreCard({ label: `Valuation · ${config.combinedScore.valuationWeight}%`, score: screen.valuationScore, note: valuationNote })}
    </div>

    <p class="verdict">${escapeHtml(verdictFor(detail))}</p>
    ${warnings ? `<ul class="warning-list">${warnings}</ul>` : ''}

    <section class="price-box" aria-labelledby="price-heading">
      <div class="price-status ${price.tone === 'warning' ? 'is-warning' : ''}">
        <h3 id="price-heading">${escapeHtml(price.title)}</h3>
        <p>${escapeHtml(price.detail)}</p>
      </div>
      <form class="price-form" id="price-form" novalidate>
        <label class="field" for="price-input">
          <span>Price per share (₹)</span>
          <input id="price-input" name="price" type="number" min="0.01" step="0.01" inputmode="decimal"
            value="${escapeHtml(formValues.price)}" required>
        </label>
        <label class="field" for="price-date">
          <span>As-of date</span>
          <input id="price-date" name="asOfDate" type="date" max="${todayIso()}"
            value="${escapeHtml(formValues.asOfDate)}" required>
        </label>
        <label class="field" for="price-source">
          <span>Source</span>
          <input id="price-source" name="source" type="text" maxlength="200"
            placeholder="e.g. broker closing price, entered manually"
            value="${escapeHtml(formValues.source)}" required>
        </label>
        <div class="form-actions">
          <button class="button" type="submit">Apply price</button>
          <button class="button button-secondary" type="button" id="clear-price">Clear</button>
        </div>
      </form>
      ${state.detailError ? `<p class="form-error" id="price-error" role="alert">${escapeHtml(state.detailError)}</p>` : ''}
      <p class="form-help">Manual entry only — the app never fetches a price. Prices older than ${detail.price.staleAfterDays} days are labelled stale. The price is saved in this browser and sent only to the local scoring server.</p>
    </section>

    <section class="subsection" aria-labelledby="range-heading">
      <h3 id="range-heading">Intrinsic value range</h3>
      <p class="subsection-intro">Owner-earnings model in ₹ per share. Margin of safety compares each case with the entered manual price; it is not upside.</p>
      <div class="range-grid">${renderScenarioCards(detail)}</div>
    </section>

    <section class="subsection" aria-labelledby="quality-heading">
      <h3 id="quality-heading">Quality breakdown</h3>
      <p class="subsection-intro">Every check is shown with its figure, grading, points, and thresholds. Missing inputs leave the score blank rather than awarding zero.</p>
      <div class="checks">${renderQualityChecks(screen)}</div>
    </section>

    <section class="subsection" aria-labelledby="coverage-heading">
      <h3 id="coverage-heading">Data coverage</h3>
      ${renderCoverage(detail)}
      ${renderMissingData(screen)}
    </section>

    <section class="subsection" aria-labelledby="provenance-heading">
      <h3 id="provenance-heading">Provenance</h3>
      <p class="subsection-intro">Each input records its filing source, reporting date, and mapping method. Reporting dates are fiscal year ends, not filing publication dates. Monetary statement values are ₹ crore; per-share values are ₹.</p>
      ${renderProvenance(detail)}
    </section>

    <section class="subsection" aria-labelledby="assumptions-heading">
      <h3 id="assumptions-heading">Assumptions</h3>
      ${renderAssumptions(screen)}
    </section>

    <section class="subsection" aria-labelledby="limits-heading">
      <h3 id="limits-heading">What this does not tell you</h3>
      <ul class="risk-list">
        <li>The score is a 50/50 blend, so a strong business at a high price and a weak business at a low price can both land mid-range. Always read the two components separately.</li>
        <li>Terminal value can dominate the intrinsic range, and the maintenance-capex share is a scenario proxy, not a disclosed figure.</li>
        <li>The checks do not assess moat durability, management integrity, governance, capital-allocation skill, or your circle of competence.</li>
        <li>One company and five annual filings are not a diversified screen. The other pilot companies and ten-year history are deferred.</li>
        <li>Nothing here is investment advice, a buy/sell recommendation, or an official Buffett/Munger formula.</li>
      </ul>
    </section>`;

  document.title = `${company.companyName} — Munger Screener`;
}

function datasetParams() {
  const params = new URLSearchParams({ lookbackYears: String(state.lookbackYears) });
  if (state.preset) params.set('preset', JSON.stringify(state.preset));
  return params;
}

async function fetchDataset() {
  const params = datasetParams();
  try {
    return await fetchJson(`/api/dataset?${params.toString()}`);
  } catch (error) {
    if (state.preset && error.status === 400) {
      state.preset = null;
      state.presetMessage = `The saved custom preset was rejected: ${error.message} Defaults were restored.`;
      clearSavedPreset();
      params.delete('preset');
      return fetchJson(`/api/dataset?${params.toString()}`);
    }
    throw error;
  }
}

async function loadApp() {
  state.loading = true;
  state.error = null;
  renderBanner();
  renderScreener();

  try {
    const [data, configData] = await Promise.all([
      fetchDataset(),
      state.config ? Promise.resolve(null) : fetchJson('/api/config'),
    ]);
    if (configData) state.config = configData.configuration;
    state.dataset = data.dataset;
    state.companies = data.companies;
  } catch (error) {
    state.dataset = null;
    state.companies = [];
    state.error = error.message;
    state.loading = false;
    state.detail = null;
    renderBanner();
    renderScreener();
    renderCompany();
    renderPreset();
    renderPresetMessage();
    return;
  }

  state.loading = false;
  renderBanner();
  renderScreener();
  renderPreset();
  renderPresetMessage();

  if (state.companies.length === 0) {
    state.detail = null;
    renderCompany();
    return;
  }

  const selected = state.companyId
    && state.companies.some((company) => company.companyId === state.companyId)
    ? state.companyId
    : state.companies[0].companyId;
  state.companyId = selected;

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('company', selected);
    window.history.replaceState(null, '', url);
  } catch {
    // The analysis still works if history is unavailable.
  }

  await loadDetail();
}

async function loadDetail({ preserve = false } = {}) {
  if (!state.companyId) return;

  if (!preserve) {
    state.detail = null;
    state.detailError = null;
  }
  state.detailLoading = true;
  renderCompany();

  const params = new URLSearchParams({ lookbackYears: String(state.lookbackYears) });
  if (state.preset) params.set('preset', JSON.stringify(state.preset));
  const saved = readSavedPrice(state.companyId);
  if (saved) {
    params.set('price', String(saved.price));
    params.set('asOfDate', saved.asOfDate);
    params.set('priceSource', saved.source);
  }

  const url = `/api/companies/${encodeURIComponent(state.companyId)}?${params.toString()}`;
  try {
    state.detail = await fetchJson(url);
    state.detailError = null;
  } catch (error) {
    if (saved && error.status === 400) {
      const fallbackParams = new URLSearchParams({ lookbackYears: String(state.lookbackYears) });
      try {
        state.detail = await fetchJson(`/api/companies/${encodeURIComponent(state.companyId)}?${fallbackParams.toString()}`);
        state.detailError = `The saved price was ignored: ${error.message} Enter it again.`;
      } catch (fallbackError) {
        state.detailError = fallbackError.message;
        if (!preserve) state.detail = null;
      }
    } else {
      state.detailError = error.message;
      if (!preserve) state.detail = null;
    }
  }

  state.detailLoading = false;
  renderCompany();
}

function showFormError(message) {
  const errorElement = document.querySelector('#price-error');
  if (errorElement) {
    errorElement.textContent = message;
    return;
  }
  const help = document.querySelector('.price-box .form-help');
  if (help) {
    const paragraph = document.createElement('p');
    paragraph.id = 'price-error';
    paragraph.className = 'form-error';
    paragraph.setAttribute('role', 'alert');
    paragraph.textContent = message;
    help.before(paragraph);
  }
}

function showPresetMessage(message) {
  state.presetMessage = message;
  renderPresetMessage();
}

async function handlePresetSubmit(form) {
  if (!state.config) return;

  const data = new FormData(form);
  const preset = presetFromGetter(state.config, (name) => data.get(name));
  const problem = validatePreset(preset, state.config);
  if (problem) {
    showPresetMessage(problem);
    return;
  }

  state.preset = preset;
  state.presetMessage = null;
  savePreset(preset);
  renderPreset();
  renderPresetMessage();
  renderScreener();
  await loadApp();
}

async function handlePresetReset() {
  state.preset = null;
  state.presetMessage = null;
  clearSavedPreset();
  renderPreset();
  renderPresetMessage();
  renderScreener();
  await loadApp();
}

async function handlePriceSubmit(form) {
  const data = new FormData(form);
  const priceText = String(data.get('price') ?? '').trim();
  const asOfDate = String(data.get('asOfDate') ?? '').trim();
  const source = String(data.get('source') ?? '').trim();

  if (!priceText || !asOfDate || !source) {
    showFormError('Enter a price, its as-of date, and a source note.');
    return;
  }
  const price = Number(priceText);
  if (!Number.isFinite(price) || price <= 0) {
    showFormError('Price per share must be a number greater than zero.');
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || asOfDate > todayIso()) {
    showFormError('The as-of date must be a real date in YYYY-MM-DD form and cannot be in the future.');
    return;
  }
  if (source.length > 200) {
    showFormError('The source note must be 200 characters or fewer.');
    return;
  }

  savePrice(state.companyId, { price, asOfDate, source });
  await loadDetail({ preserve: true });
}

elements.lookback.addEventListener('change', async () => {
  state.lookbackYears = Number(elements.lookback.value) === 10 ? 10 : 5;
  saveLookback(state.lookbackYears);
  await loadApp();
});

elements.panel.addEventListener('submit', async (event) => {
  if (event.target.id !== 'price-form') return;
  event.preventDefault();
  await handlePriceSubmit(event.target);
});

elements.presetPanel.addEventListener('submit', async (event) => {
  if (event.target.id !== 'preset-form') return;
  event.preventDefault();
  await handlePresetSubmit(event.target);
});

document.addEventListener('click', async (event) => {
  const retry = event.target.closest('[data-retry]');
  if (retry) {
    if (retry.dataset.retry === 'detail') {
      await loadDetail();
    } else {
      await loadApp();
    }
    return;
  }

  const sortButton = event.target.closest('[data-sort]');
  if (sortButton && sortButton.dataset.sort) {
    state.sort = nextSort(state.sort, sortButton.dataset.sort);
    renderScreener();
    return;
  }

  const presetReset = event.target.closest('#reset-preset');
  if (presetReset) {
    await handlePresetReset();
    return;
  }

  const clear = event.target.closest('#clear-price');
  if (clear && state.companyId) {
    clearPrice(state.companyId);
    await loadDetail();
  }
});

async function init() {
  elements.lookback.value = String(state.lookbackYears);
  renderCompany();
  try {
    await loadApp();
  } catch (error) {
    state.error = error.message;
    state.loading = false;
    renderBanner();
    renderScreener();
  }
}

init();
