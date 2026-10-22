const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const renderUrl = pathToFileURL(path.join(__dirname, '..', 'public', 'render.mjs')).href;

let render;

test.before(async () => {
  render = await import(renderUrl);
});

test('formats Indian rupee amounts, crore statement values, percentages, and ratios', () => {
  assert.equal(render.formatCurrency(1210.38), '₹1,210.38');
  assert.equal(render.formatCurrency(744.35), '₹744.35');
  assert.equal(render.formatCurrency(null), '—');
  assert.equal(render.formatCrore(38327), '₹38,327 crore');
  assert.equal(render.formatPercent(37.17), '37.2%');
  assert.equal(render.formatPercent(0, 0), '0%');
  assert.equal(render.formatRatio(0.08783), '0.09×');
});

test('formats each provenance field in its own unit so crore and per-share values cannot be confused', () => {
  assert.equal(render.formatFieldValue('netIncome', 38327), '₹38,327 crore');
  assert.equal(render.formatFieldValue('returnOnCapitalPercent', 37.17), '37.2%');
  assert.equal(render.formatFieldValue('debtToEquity', 0.08702), '0.09×');
  assert.equal(render.formatFieldValue('ownerEarningsBeforeMaintenanceCapexPerShare', 108.58), '₹108.58');
  assert.equal(render.formatFieldValue('netIncome', null), '—');
});

test('describes every quality check figure in plain language', () => {
  assert.equal(
    render.checkFigureText({
      id: 'profitability',
      figure: {
        annualReturnOnCapitalPercent: [37.17, 40.74, 43.39, 44.98, 41.44],
        averageReturnOnCapitalPercent: 41.54,
      },
    }),
    'Average return on capital 41.54% (annual: 37.17%, 40.74%, 43.39%, 44.98%, 41.44%)',
  );
  assert.equal(
    render.checkFigureText({ id: 'manageable-debt', figure: { medianDebtToEquity: 0.08783 } }),
    'Median debt-to-equity 0.09×',
  );
  assert.equal(
    render.checkFigureText({
      id: 'earnings-consistency',
      figure: { positiveYears: 5, totalYears: 5, positivePercent: 100 },
    }),
    '5 of 5 years profitable (100%)',
  );
  assert.equal(
    render.checkFigureText({
      id: 'cash-generation',
      figure: { positiveFreeCashFlowYears: 5, totalYears: 5, positivePercent: 100 },
    }),
    '5 of 5 years with positive free cash flow (100%)',
  );
});

test('labels missing and stale manual prices without ever implying a live quote', () => {
  const missing = render.priceSummary({ status: 'missing' });
  assert.equal(missing.tone, 'warning');
  assert.match(missing.title, /No market price/);

  const stale = render.priceSummary({
    status: 'supplied',
    pricePerShare: 3500,
    currency: 'INR',
    asOfDate: '2026-10-01',
    source: 'manual test quote',
    ageDays: 21,
    isStale: true,
    staleAfterDays: 7,
  });
  assert.equal(stale.tone, 'warning');
  assert.equal(stale.title, 'Stale manual price');
  assert.match(stale.detail, /₹3,500\.00/);
  assert.match(stale.detail, /2026-10-01/);
  assert.match(stale.detail, /manual test quote/);
  assert.match(stale.detail, /21 days old/);

  const fresh = render.priceSummary({
    status: 'supplied',
    pricePerShare: 3500,
    currency: 'INR',
    asOfDate: '2026-10-22',
    source: 'manual entry',
    ageDays: 0,
    isStale: false,
    staleAfterDays: 7,
  });
  assert.equal(fresh.title, 'Manual price — not live');
  assert.match(fresh.detail, /entered today/);
});

test('groups missing inputs by price and fiscal year for an actionable warning list', () => {
  const groups = render.describeMissingData([
    { scope: 'price', field: 'pricePerShare' },
    { scope: 'price', field: 'source' },
    { scope: 'quality', fiscalYear: 2022, field: 'operatingCashFlow' },
  ]);

  assert.deepEqual(groups, [
    { label: 'Market price', detail: 'Price per share, Source' },
    { label: 'FY2022 · quality', detail: 'Operating cash flow' },
  ]);
  assert.deepEqual(render.describeMissingData([]), []);
});

test('explains thresholds for results that do not carry a unit field', () => {
  assert.equal(
    render.thresholdText({ id: 'profitability', floor: 0, target: 15 }),
    'Zero credit at 0%; full credit at 15%',
  );
  assert.equal(
    render.thresholdText({ id: 'manageable-debt', floor: 2, target: 0.25 }),
    'Zero credit at 2.00×; full credit at 0.25×',
  );
});

test('labels statuses, tones, and escapes untrusted strings', () => {
  assert.equal(render.statusLabel('scored'), 'Scored');
  assert.equal(render.statusLabel('insufficient-data'), 'Insufficient data');
  assert.equal(render.statusLabel('not-valuatable'), 'Not valuatable');
  assert.equal(render.scoreTone(100), 'good');
  assert.equal(render.scoreTone(50), 'mid');
  assert.equal(render.scoreTone(0), 'low');
  assert.equal(render.scoreTone(null), 'neutral');
  assert.equal(
    render.escapeHtml('<img src=x onerror="alert(\'x\')">'),
    '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;',
  );
});
