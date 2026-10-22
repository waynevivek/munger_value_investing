const test = require('node:test');
const assert = require('node:assert/strict');

const { loadPilotDataset } = require('../src/pilot-data.js');
const {
  RequestError,
  listCompanies,
  screenCompany,
} = require('../src/screen-service.js');

const companies = loadPilotDataset();
const NOW = new Date('2026-10-22T12:00:00Z');

function params(overrides = {}) {
  return {
    companyId: 'TCS',
    lookbackYears: '5',
    price: '3500',
    asOfDate: '2026-10-01',
    priceSource: 'manual test quote',
    ...overrides,
  };
}

function screen(overrides = {}, now = NOW) {
  return screenCompany(companies, params(overrides), { now });
}

test('computes the verified TCS five-year result from the CSV through the production scorers', () => {
  const detail = screen();

  assert.equal(detail.screen.status, 'scored');
  assert.equal(detail.screen.qualityScore, 100);
  assert.equal(detail.screen.valuationScore, 0);
  assert.equal(detail.screen.totalScore, 50);
  assert.equal(detail.screen.valuation.scenarios.low.intrinsicValuePerShare, 744.35);
  assert.equal(detail.screen.valuation.scenarios.base.intrinsicValuePerShare, 1210.38);
  assert.equal(detail.screen.valuation.scenarios.high.intrinsicValuePerShare, 1940.77);
  assert.equal(detail.screen.valuation.baseMarginOfSafetyPercent, -189.17);
  assert.deepEqual(detail.company.fiscalYears, [2022, 2023, 2024, 2025, 2026]);
  assert.equal(detail.coverage.complete, true);
});

test('labels a manually entered price as manual, not live, and stale after seven days', () => {
  const detail = screen();

  assert.equal(detail.price.status, 'supplied');
  assert.equal(detail.price.isManual, true);
  assert.equal(detail.price.isLive, false);
  assert.equal(detail.price.currency, 'INR');
  assert.equal(detail.price.ageDays, 21);
  assert.equal(detail.price.isStale, true);
  assert.deepEqual(detail.warnings.map(({ code }) => code), ['stale-price']);
});

test('does not confuse an absent price with a zero valuation or zero total', () => {
  const detail = screen({ price: undefined, asOfDate: undefined, priceSource: undefined });

  assert.equal(detail.screen.status, 'insufficient-data');
  assert.equal(detail.screen.qualityScore, 100);
  assert.equal(detail.screen.valuationScore, null);
  assert.equal(detail.screen.totalScore, null);
  assert.equal(detail.screen.valuation.status, 'insufficient-data');
  assert.equal(detail.screen.valuation.scenarios, null);
  assert.equal(detail.price.status, 'missing');
  assert.deepEqual(detail.warnings.map(({ code }) => code), ['price-required']);
});

test('reports missing ten-year coverage by fiscal year instead of scoring five years as ten', () => {
  const detail = screen({
    lookbackYears: '10',
    price: undefined,
    asOfDate: undefined,
    priceSource: undefined,
  });

  assert.deepEqual(detail.coverage.missingYears, [2017, 2018, 2019, 2020, 2021]);
  assert.equal(detail.coverage.complete, false);
  assert.equal(detail.screen.status, 'insufficient-data');
  assert.equal(detail.screen.qualityScore, null);
  assert.equal(detail.screen.totalScore, null);
  assert.equal(detail.warnings[0].code, 'insufficient-coverage');
  assert.match(detail.warnings[0].message, /FY2017–FY2021/);
});

test('keeps complete source, reporting date, and method for every displayed input', () => {
  const detail = screen();
  const years = detail.provenance.map(({ fiscalYear }) => fiscalYear);

  assert.deepEqual(years, [2022, 2023, 2024, 2025, 2026]);
  for (const year of detail.provenance) {
    assert.equal(year.fiscalYear >= 2022, true);
    assert.equal(year.fields.length, 7);
    for (const field of year.fields) {
      assert.equal(Number.isFinite(field.value), true, `${year.fiscalYear} ${field.field} should be numeric`);
      assert.equal(typeof field.source, 'string');
      assert.equal(typeof field.reportingDate, 'string');
      assert.equal(typeof field.method, 'string');
      assert.match(field.reportingDate, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test('rejects lookbacks that are not five or ten years', () => {
  assert.throws(
    () => screen({ lookbackYears: '7' }),
    (error) => error instanceof RequestError
      && error.statusCode === 400
      && error.code === 'invalid-lookback',
  );
});

test('requires price, as-of date, and source together', () => {
  assert.throws(
    () => screen({ asOfDate: undefined, priceSource: undefined }),
    (error) => error instanceof RequestError && error.code === 'price-incomplete',
  );
  assert.throws(
    () => screen({ price: '0' }),
    (error) => error instanceof RequestError && error.code === 'invalid-price',
  );
});

test('rejects impossible, future, and over-long price entries', () => {
  assert.throws(
    () => screen({ asOfDate: '2026-02-31' }),
    (error) => error instanceof RequestError && error.code === 'invalid-price-date',
  );
  assert.throws(
    () => screen({ asOfDate: '2026-10-23' }),
    (error) => error instanceof RequestError && error.code === 'future-price-date',
  );
  assert.throws(
    () => screen({ priceSource: 'x'.repeat(201) }),
    (error) => error instanceof RequestError && error.code === 'invalid-price-source',
  );
});

test('returns a 404-style error for an unknown company', () => {
  assert.throws(
    () => screen({ companyId: 'NOPE' }),
    (error) => error instanceof RequestError
      && error.statusCode === 404
      && error.code === 'company-not-found',
  );
});

test('screener rows expose quality but never invent a valuation without a price', () => {
  const rows = listCompanies(companies, { lookbackYears: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].companyId, 'TCS');
  assert.equal(rows[0].qualityScore, 100);
  assert.equal(rows[0].qualityStatus, 'scored');
  assert.equal(rows[0].valuationStatus, 'price-required');
  assert.deepEqual(rows[0].coverage.fiscalYears, [2022, 2023, 2024, 2025, 2026]);
});

function customPreset(overrides = {}) {
  return {
    qualityChecks: [
      { id: 'profitability', floor: 90, target: 100, weight: 40 },
      { id: 'manageable-debt', floor: 2, target: 0.25, weight: 20 },
      { id: 'earnings-consistency', floor: 40, target: 80, weight: 20 },
      { id: 'cash-generation', floor: 40, target: 80, weight: 20 },
    ],
    marginOfSafetyTargetPercent: 50,
    ...overrides,
  };
}

test('applies custom thresholds and check weights through the production scorer', () => {
  const detail = screen({ preset: JSON.stringify(customPreset()) });
  const config = detail.screen.assumptions.configuration;

  assert.equal(detail.screen.status, 'scored');
  assert.equal(detail.screen.qualityScore, 60);
  assert.equal(detail.screen.valuationScore, 0);
  assert.equal(detail.screen.totalScore, 30);
  assert.deepEqual(detail.screen.componentWeights, { quality: 50, valuation: 50 });
  assert.equal(config.quality.checks.find(({ id }) => id === 'profitability').weight, 40);
  assert.equal(config.quality.checks.find(({ id }) => id === 'profitability').floor, 90);
  assert.equal(config.quality.maximumScore, 100);
});

test('keeps the 50/50 combined weights and valuation scenarios out of the editable preset', () => {
  const preset = customPreset({
    combinedScore: { maximumScore: 100, qualityWeight: 0, valuationWeight: 100 },
    valuation: {
      marginOfSafetyTargetPercent: 90,
      scenarios: { base: { discountRatePercent: 1 } },
    },
  });
  const detail = screen({ preset: JSON.stringify(preset) });
  const config = detail.screen.assumptions.configuration;

  assert.deepEqual(detail.screen.componentWeights, { quality: 50, valuation: 50 });
  assert.equal(config.combinedScore.qualityWeight, 50);
  assert.equal(config.combinedScore.valuationWeight, 50);
  assert.equal(config.valuation.marginOfSafetyTargetPercent, 50);
  assert.equal(config.valuation.scenarios.base.discountRatePercent, 12);
});

test('recalculates the valuation score from an edited margin-of-safety target', () => {
  const base = screen({ price: '500' });
  const custom = screen({
    price: '500',
    preset: JSON.stringify({ marginOfSafetyTargetPercent: 80 }),
  });

  assert.equal(base.screen.valuationScore, 100);
  assert.ok(custom.screen.valuation.baseMarginOfSafetyPercent > 0);
  const expectedValuation = Math.round(
    (custom.screen.valuation.baseMarginOfSafetyPercent / 80) * 100 * 100,
  ) / 100;
  assert.equal(custom.screen.valuationScore, expectedValuation);
  assert.ok(expectedValuation > 0 && expectedValuation < 100);
  assert.equal(custom.screen.qualityScore, 100);
  assert.equal(
    custom.screen.totalScore,
    Math.round(((100 * 50 + expectedValuation * 50) / 100) * 100) / 100,
  );
});

test('applies a custom preset to screener rows', () => {
  const rows = listCompanies(companies, {
    lookbackYears: 5,
    preset: JSON.stringify(customPreset()),
  });

  assert.equal(rows[0].qualityScore, 60);
  assert.equal(rows[0].qualityStatus, 'scored');
});

test('rejects malformed and out-of-range presets with a 400 invalid-preset error', () => {
  const cases = [
    ['{', /valid JSON/],
    ['[]', /JSON object/],
    [JSON.stringify({ qualityChecks: 'nope' }), /must be an array/],
    [JSON.stringify({ qualityChecks: [{ id: 'unknown', floor: 0, target: 1, weight: 100 }] }), /Unknown quality check/],
    [JSON.stringify({ qualityChecks: [customPreset().qualityChecks[0], customPreset().qualityChecks[0]] }), /more than once/],
    [JSON.stringify({ qualityChecks: [{ id: 'profitability', floor: 0, target: 15, weight: 90 }] }), /weights must add/],
    [JSON.stringify({
      qualityChecks: [{ id: 'profitability', floor: '0', target: 15, weight: 100 }],
    }), /finite number/],
    [JSON.stringify({
      qualityChecks: [{ id: 'profitability', floor: 0, target: 15, weight: -10 }],
    }), /cannot be negative/],
    [JSON.stringify({ marginOfSafetyTargetPercent: 0 }), /invalid/],
    [JSON.stringify({ marginOfSafetyTargetPercent: 25 }).padEnd(8100, ' '), /characters or fewer/],
    [JSON.stringify(customPreset({ marginOfSafetyTargetPercent: Number.NaN })), /finite number|invalid/],
  ];

  for (const [preset, pattern] of cases) {
    assert.throws(
      () => screen({ preset }),
      (error) => error instanceof RequestError
        && error.statusCode === 400
        && error.code === 'invalid-preset'
        && pattern.test(error.message),
      preset,
    );
  }
});
