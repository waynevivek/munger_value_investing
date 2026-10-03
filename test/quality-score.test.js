const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreQuality } = require('../src/quality-score.js');

function financialYears(years, overrides = {}) {
  return years.map((fiscalYear) => ({
    fiscalYear,
    source: 'hand-written test fixture',
    reportingDate: `${fiscalYear + 1}-05-15`,
    returnOnCapitalPercent: 18,
    debtToEquity: 0.25,
    netIncome: 100,
    operatingCashFlow: 140,
    capitalExpenditure: 30,
    ...overrides[fiscalYear],
  }));
}

test('scores a complete five-year history and exposes its checks and assumptions', () => {
  const result = scoreQuality({
    companyId: 'fixture-co',
    companyName: 'Fixture Co',
    financialYears: financialYears([2020, 2021, 2022, 2023, 2024]),
  }, 5);

  assert.deepEqual(result, {
    companyId: 'fixture-co',
    companyName: 'Fixture Co',
    lookbackYears: 5,
    status: 'scored',
    qualityScore: 100,
    assumptions: {
      checks: [
        { id: 'profitability', metric: 'average return on capital', threshold: '>= 15%', weight: 25 },
        { id: 'manageable-debt', metric: 'median debt-to-equity', threshold: '<= 0.5; ratios must be non-negative', weight: 25 },
        { id: 'earnings-consistency', metric: 'positive net income in selected years', threshold: '>= 80%', weight: 25 },
        { id: 'cash-generation', metric: 'positive free cash flow years (operating cash flow minus capital expenditure)', threshold: '>= 80%', weight: 25 },
      ],
      capitalExpenditureConvention: 'positive cash outflow; free cash flow = operating cash flow - capital expenditure',
    },
    checks: [
      { id: 'profitability', label: 'Profitability', figure: { averageReturnOnCapitalPercent: 18 }, threshold: '>= 15%', passed: true, weight: 25, pointsAwarded: 25 },
      { id: 'manageable-debt', label: 'Manageable debt', figure: { medianDebtToEquity: 0.25 }, threshold: '<= 0.5; ratios must be non-negative', passed: true, weight: 25, pointsAwarded: 25 },
      { id: 'earnings-consistency', label: 'Earnings consistency', figure: { positiveYears: 5, totalYears: 5, positivePercent: 100 }, threshold: '>= 80%', passed: true, weight: 25, pointsAwarded: 25 },
      { id: 'cash-generation', label: 'Cash generation', figure: { positiveFreeCashFlowYears: 5, totalYears: 5, positivePercent: 100 }, threshold: '>= 80%', passed: true, weight: 25, pointsAwarded: 25 },
    ],
    missingData: [],
  });
});

test('scores a complete ten-year history using exactly the selected ten fiscal years', () => {
  const years = financialYears(Array.from({ length: 11 }, (_, index) => 2014 + index));
  years[0].returnOnCapitalPercent = 1;

  const result = scoreQuality({ companyId: 'ten-year-co', financialYears: years }, 10);

  assert.equal(result.status, 'scored');
  assert.equal(result.qualityScore, 100);
  assert.equal(result.checks[0].figure.averageReturnOnCapitalPercent, 18);
  assert.equal(result.checks[2].figure.totalYears, 10);
  assert.equal(result.assumptions.checks.every((check) => check.weight === 25), true);
});

test('reports observed failures as zero points while retaining the measured figures', () => {
  const years = financialYears([2020, 2021, 2022, 2023, 2024], {
    2020: { returnOnCapitalPercent: 5, debtToEquity: 1.2, netIncome: -3, operatingCashFlow: 10, capitalExpenditure: 20 },
    2021: { returnOnCapitalPercent: 8, debtToEquity: 1.1, netIncome: 50, operatingCashFlow: 10, capitalExpenditure: 20 },
    2022: { returnOnCapitalPercent: 9, debtToEquity: 1.3, netIncome: 50, operatingCashFlow: 10, capitalExpenditure: 20 },
    2023: { returnOnCapitalPercent: 10, debtToEquity: 1.1, netIncome: 50, operatingCashFlow: 10, capitalExpenditure: 20 },
  });

  const result = scoreQuality({ companyId: 'weak-co', financialYears: years }, 5);

  assert.equal(result.status, 'scored');
  assert.equal(result.qualityScore, 25);
  assert.deepEqual(result.checks.map(({ passed, pointsAwarded }) => [passed, pointsAwarded]), [
    [false, 0], [false, 0], [true, 25], [false, 0],
  ]);
  assert.equal(result.checks[2].figure.positiveYears, 4);
  assert.equal(result.checks[3].figure.positiveFreeCashFlowYears, 1);
});

test('returns insufficient data without a score or failed checks when an annual input is missing', () => {
  const years = financialYears([2020, 2021, 2022, 2023, 2024]);
  delete years[2].operatingCashFlow;

  const result = scoreQuality({ companyId: 'incomplete-co', financialYears: years }, 5);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.qualityScore, null);
  assert.deepEqual(result.missingData, [{ fiscalYear: 2022, field: 'operatingCashFlow' }]);
  assert.equal(result.checks.every(({ passed, pointsAwarded }) => passed === null && pointsAwarded === null), true);
});

test('returns insufficient data when the selected annual history has a gap', () => {
  const result = scoreQuality({
    companyId: 'gap-co',
    financialYears: financialYears([2020, 2021, 2023, 2024]),
  }, 5);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.qualityScore, null);
  assert.equal(result.missingData.some(({ field }) => field === 'fiscalYear'), true);
  assert.equal(result.checks.every(({ passed }) => passed === null), true);
});

test('requires source and reporting date for every selected fiscal year', () => {
  const years = financialYears([2020, 2021, 2022, 2023, 2024]);
  years[4].source = '';
  years[4].reportingDate = null;

  const result = scoreQuality({ companyId: 'no-provenance-co', financialYears: years }, 5);

  assert.equal(result.status, 'insufficient-data');
  assert.deepEqual(result.missingData, [
    { fiscalYear: 2024, field: 'source' },
    { fiscalYear: 2024, field: 'reportingDate' },
  ]);
});

test('rejects lookbacks other than five or ten years', () => {
  assert.throws(() => scoreQuality({ companyId: 'fixture-co', financialYears: [] }, 7), /5 or 10/);
});

test('rejects negative capital expenditure because normalized capex is a positive cash outflow', () => {
  const years = financialYears([2020, 2021, 2022, 2023, 2024]);
  years[4].capitalExpenditure = -30;

  assert.throws(
    () => scoreQuality({ companyId: 'negative-capex-co', financialYears: years }, 5),
    /non-negative cash outflow/,
  );
});
