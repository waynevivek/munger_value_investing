const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../src/server.js');
const { loadPilotDataset } = require('../src/pilot-data.js');

const companies = loadPilotDataset();
const FIXED_NOW = () => new Date('2026-10-22T12:00:00Z');

async function withServer(run) {
  const server = createServer({ companies, now: FIXED_NOW });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('serves health, dataset metadata, and screener rows computed by the scoring modules', async () => {
  await withServer(async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const datasetResponse = await fetch(`${base}/api/dataset?lookbackYears=5`);
    assert.equal(datasetResponse.status, 200);
    const dataset = await datasetResponse.json();
    assert.equal(dataset.dataset.mode, 'manual-local-pilot');
    assert.equal(dataset.dataset.companyCount, 1);
    assert.equal(dataset.dataset.coverage.firstFiscalYear, 2022);
    assert.equal(dataset.dataset.coverage.lastFiscalYear, 2026);
    assert.match(dataset.dataset.ingestion, /No automated NSE collection/);
    assert.equal(dataset.companies[0].companyId, 'TCS');
    assert.equal(dataset.companies[0].qualityScore, 100);

    const companiesResponse = await fetch(`${base}/api/companies?lookbackYears=5`);
    const rows = await companiesResponse.json();
    assert.equal(companiesResponse.status, 200);
    assert.equal(rows.lookbackYears, 5);
    assert.equal(rows.companies[0].valuationStatus, 'price-required');
  });
});

test('returns a full TCS result with calculated intrinsic values and provenance for a manual price', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/companies/TCS?lookbackYears=5&price=3500&asOfDate=2026-10-01&priceSource=manual%20test%20quote`);
    assert.equal(response.status, 200);
    const detail = await response.json();

    assert.equal(detail.screen.status, 'scored');
    assert.equal(detail.screen.qualityScore, 100);
    assert.equal(detail.screen.valuationScore, 0);
    assert.equal(detail.screen.totalScore, 50);
    assert.equal(detail.screen.valuation.scenarios.base.intrinsicValuePerShare, 1210.38);
    assert.equal(detail.screen.valuation.scenarios.low.intrinsicValuePerShare, 744.35);
    assert.equal(detail.screen.valuation.scenarios.high.intrinsicValuePerShare, 1940.77);

    assert.equal(detail.price.isManual, true);
    assert.equal(detail.price.isLive, false);
    assert.equal(detail.price.isStale, true);
    assert.equal(detail.price.source, 'manual test quote');
    assert.equal(detail.provenance.length, 5);
    assert.equal(detail.provenance[0].fields.length, 7);
  });
});

test('withholds valuation and total when no price is supplied', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/companies/TCS?lookbackYears=5`);
    const detail = await response.json();

    assert.equal(response.status, 200);
    assert.equal(detail.screen.qualityScore, 100);
    assert.equal(detail.screen.valuationScore, null);
    assert.equal(detail.screen.totalScore, null);
    assert.equal(detail.price.status, 'missing');
    assert.deepEqual(detail.warnings.map(({ code }) => code), ['price-required']);
  });
});

test('shows an insufficient-data ten-year selection with the missing fiscal years', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/companies/TCS?lookbackYears=10`);
    const detail = await response.json();

    assert.equal(response.status, 200);
    assert.equal(detail.screen.status, 'insufficient-data');
    assert.equal(detail.screen.totalScore, null);
    assert.deepEqual(detail.coverage.missingYears, [2017, 2018, 2019, 2020, 2021]);
    assert.equal(detail.warnings[0].code, 'insufficient-coverage');
  });
});

test('uses saved manual prices for screener valuation and combined scores', async () => {
  await withServer(async (base) => {
    const prices = encodeURIComponent(JSON.stringify({
      TCS: { price: 3500, asOfDate: '2026-10-01', source: 'saved quote' },
    }));

    const datasetResponse = await fetch(`${base}/api/dataset?lookbackYears=5&prices=${prices}`);
    assert.equal(datasetResponse.status, 200);
    const dataset = await datasetResponse.json();
    assert.equal(dataset.companies[0].valuationScore, 0);
    assert.equal(dataset.companies[0].totalScore, 50);
    assert.equal(dataset.companies[0].valuationStatus, 'scored');

    const rowsResponse = await fetch(`${base}/api/companies?lookbackYears=5&prices=${prices}`);
    const rows = await rowsResponse.json();
    assert.equal(rowsResponse.status, 200);
    assert.equal(rows.companies[0].totalScore, 50);
  });
});

test('rejects invalid requests with clear JSON errors', async () => {
  await withServer(async (base) => {
    const cases = [
      [`${base}/api/companies/TCS?lookbackYears=7`, 400, 'invalid-lookback'],
      [`${base}/api/companies/TCS?price=3500`, 400, 'price-incomplete'],
      [`${base}/api/companies/TCS?price=0&asOfDate=2026-10-01&priceSource=test`, 400, 'invalid-price'],
      [`${base}/api/companies/TCS?price=3500&asOfDate=2026-02-31&priceSource=test`, 400, 'invalid-price-date'],
      [`${base}/api/companies/TCS?price=3500&asOfDate=2027-01-01&priceSource=test`, 400, 'future-price-date'],
      [`${base}/api/companies/NOPE`, 404, 'company-not-found'],
      [`${base}/api/companies?prices=${encodeURIComponent('{')}`, 400, 'invalid-prices'],
      [`${base}/api/unknown`, 404, 'not-found'],
    ];

    for (const [url, status, code] of cases) {
      const response = await fetch(url);
      assert.equal(response.status, status, url);
      const body = await response.json();
      assert.equal(body.error.code, code, url);
      assert.equal(typeof body.error.message, 'string');
    }
  });
});

function presetQuery(preset) {
  return new URLSearchParams({ preset: JSON.stringify(preset) }).toString();
}

const customPreset = {
  qualityChecks: [
    { id: 'profitability', floor: 90, target: 100, weight: 40 },
    { id: 'manageable-debt', floor: 2, target: 0.25, weight: 20 },
    { id: 'earnings-consistency', floor: 40, target: 80, weight: 20 },
    { id: 'cash-generation', floor: 40, target: 80, weight: 20 },
  ],
  marginOfSafetyTargetPercent: 50,
};

test('exposes the default configuration and applies a custom preset through the API', async () => {
  await withServer(async (base) => {
    const configResponse = await fetch(`${base}/api/config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.equal(config.configuration.quality.checks.length, 4);
    assert.equal(config.configuration.quality.maximumScore, 100);
    assert.equal(config.configuration.valuation.marginOfSafetyTargetPercent, 25);
    assert.equal(config.configuration.combinedScore.qualityWeight, 50);
    assert.equal(config.configuration.combinedScore.valuationWeight, 50);

    const query = presetQuery(customPreset);
    const detailResponse = await fetch(
      `${base}/api/companies/TCS?lookbackYears=5&price=3500&asOfDate=2026-10-01&priceSource=manual%20test%20quote&${query}`,
    );
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.screen.qualityScore, 60);
    assert.equal(detail.screen.totalScore, 30);
    assert.deepEqual(detail.screen.componentWeights, { quality: 50, valuation: 50 });
    assert.equal(detail.screen.assumptions.configuration.quality.checks[0].weight, 40);

    const screenerResponse = await fetch(`${base}/api/companies?lookbackYears=5&${query}`);
    const screener = await screenerResponse.json();
    assert.equal(screenerResponse.status, 200);
    assert.equal(screener.companies[0].qualityScore, 60);

    const datasetResponse = await fetch(`${base}/api/dataset?lookbackYears=5&${query}`);
    const dataset = await datasetResponse.json();
    assert.equal(datasetResponse.status, 200);
    assert.equal(dataset.companies[0].qualityScore, 60);
  });
});

test('rejects malformed or invalid presets without breaking the screener', async () => {
  await withServer(async (base) => {
    const cases = [
      [`${base}/api/companies/TCS?preset=${encodeURIComponent('{')}`],
      [`${base}/api/companies?preset=${encodeURIComponent(JSON.stringify({
        qualityChecks: [{ id: 'unknown', floor: 0, target: 1, weight: 100 }],
      }))}`],
      [`${base}/api/dataset?preset=${encodeURIComponent(JSON.stringify({ marginOfSafetyTargetPercent: 0 }))}`],
    ];

    for (const [url] of cases) {
      const response = await fetch(url);
      assert.equal(response.status, 400, url);
      const body = await response.json();
      assert.equal(body.error.code, 'invalid-preset', url);
      assert.equal(typeof body.error.message, 'string');
    }

    const stillWorks = await fetch(`${base}/api/companies/TCS?lookbackYears=5`);
    assert.equal(stillWorks.status, 200);
    assert.equal((await stillWorks.json()).screen.qualityScore, 100);
  });
});

test('serves the UI with security headers and blocks path traversal', async () => {
  await withServer(async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('cache-control'), 'no-store');
    const html = await page.text();
    assert.match(html, /Munger Screener/);
    assert.match(html, /Not investment advice/);

    const styles = await fetch(`${base}/styles.css`);
    assert.equal(styles.status, 200);
    assert.match(styles.headers.get('content-type'), /text\/css/);

    const module = await fetch(`${base}/app.mjs`);
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /text\/javascript/);

    const traversal = await fetch(`${base}/%2e%2e/package.json`);
    assert.equal(traversal.status, 404);

    const missing = await fetch(`${base}/does-not-exist.js`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'not-found');
  });
});
