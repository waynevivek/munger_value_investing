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
