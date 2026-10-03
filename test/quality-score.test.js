const test = require('node:test');
const assert = require('node:assert/strict');

const {
  QUALITY_SCORING_CONFIG,
  createEditableQualityScoringConfig,
  scoreQuality,
} = require('../src/quality-score.js');

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

test('scores a strong complete five-year history at the maximum and explains every check', () => {
  const result = scoreQuality({
    companyId: 'fixture-co',
    companyName: 'Fixture Co',
    financialYears: financialYears([2020, 2021, 2022, 2023, 2024]),
  }, 5);

  assert.equal(result.status, 'scored');
  assert.equal(result.qualityScore, 100);
  assert.equal(result.checks.length, 4);
  assert.equal(result.checks.every((check) => check.pointsAwarded === check.weight), true);
  assert.equal(result.checks.every((check) => check.passed === true), true);
  assert.equal(result.checks.every((check) => check.explanation.endsWith('.')), true);
  assert.deepEqual(result.assumptions.configuration, QUALITY_SCORING_CONFIG);
});

test('awards linear partial points between each metric floor and target', () => {
  const years = financialYears(Array.from({ length: 10 }, (_, index) => 2015 + index));
  for (const year of years) {
    year.returnOnCapitalPercent = 7.5;
    year.debtToEquity = 1.125;
    year.netIncome = 100;
    year.operatingCashFlow = 15;
    year.capitalExpenditure = 10;
  }
  for (const year of years.slice(0, 3)) {
    year.netIncome = -1;
    year.operatingCashFlow = 5;
  }

  const result = scoreQuality({ companyId: 'midpoint-co', financialYears: years }, 10);

  assert.equal(result.status, 'scored');
  assert.deepEqual(result.checks.map(({ scorePercent, pointsAwarded, passed }) => [scorePercent, pointsAwarded, passed]), [
    [50, 12.5, false],
    [50, 12.5, false],
    [75, 18.75, false],
    [75, 18.75, false],
  ]);
  assert.equal(result.qualityScore, 62.5);
  assert.deepEqual(result.checks[2].figure, { positiveYears: 7, totalYears: 10, positivePercent: 70 });
});

test('scores annual profitability separately before averaging its graded points', () => {
  const years = financialYears([2020, 2021, 2022, 2023, 2024], {
    2020: { returnOnCapitalPercent: -5 },
    2021: { returnOnCapitalPercent: 5 },
    2022: { returnOnCapitalPercent: 10 },
    2023: { returnOnCapitalPercent: 20 },
    2024: { returnOnCapitalPercent: 25 },
  });

  const result = scoreQuality({ companyId: 'variable-roic-co', financialYears: years }, 5);

  assert.deepEqual(result.checks[0].figure.annualReturnOnCapitalPercent, [-5, 5, 10, 20, 25]);
  assert.equal(result.checks[0].scorePercent, 60);
  assert.equal(result.checks[0].pointsAwarded, 15);
});

test('accepts an edited config and returns the exact config used as score assumptions', () => {
  const config = createEditableQualityScoringConfig();
  config.checks[0].target = 36;
  config.checks[0].weight = 40;
  config.checks[1].weight = 20;
  config.checks[2].weight = 20;
  config.checks[3].weight = 20;

  const result = scoreQuality({
    companyId: 'custom-co',
    financialYears: financialYears([2020, 2021, 2022, 2023, 2024]),
  }, 5, config);

  assert.equal(result.qualityScore, 80);
  assert.deepEqual(result.assumptions.configuration, config);
  assert.equal(result.checks[0].pointsAwarded, 20);
});

test('rejects invalid editable configs instead of calculating a misleading score', () => {
  const config = createEditableQualityScoringConfig();
  config.checks[0].weight = 10;

  assert.throws(
    () => scoreQuality({ companyId: 'fixture-co', financialYears: financialYears([2020, 2021, 2022, 2023, 2024]) }, 5, config),
    /weights must sum to 100/,
  );
});

test('scores exactly the latest selected ten fiscal years', () => {
  const years = financialYears(Array.from({ length: 11 }, (_, index) => 2014 + index));
  years[0].returnOnCapitalPercent = -100;

  const result = scoreQuality({ companyId: 'ten-year-co', financialYears: years }, 10);

  assert.equal(result.status, 'scored');
  assert.equal(result.checks[0].figure.annualReturnOnCapitalPercent.includes(-100), false);
  assert.equal(result.checks[0].figure.annualReturnOnCapitalPercent.length, 10);
});

test('returns insufficient data with null points rather than failing checks when an annual input is missing', () => {
  const years = financialYears([2020, 2021, 2022, 2023, 2024]);
  delete years[2].operatingCashFlow;

  const result = scoreQuality({ companyId: 'incomplete-co', financialYears: years }, 5);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.qualityScore, null);
  assert.deepEqual(result.missingData, [{ fiscalYear: 2022, field: 'operatingCashFlow' }]);
  assert.equal(result.checks.every(({ passed, pointsAwarded, scorePercent }) => passed === null && pointsAwarded === null && scorePercent === null), true);
});

test('returns insufficient data when the selected annual history has a gap', () => {
  const result = scoreQuality({
    companyId: 'gap-co',
    financialYears: financialYears([2020, 2021, 2023, 2024]),
  }, 5);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.qualityScore, null);
  assert.equal(result.missingData.some(({ field }) => field === 'fiscalYear'), true);
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

test('requires capital expenditure as a positive cash outflow', () => {
  const years = financialYears([2020, 2021, 2022, 2023, 2024]);
  years[4].capitalExpenditure = -30;

  assert.throws(
    () => scoreQuality({ companyId: 'negative-capex-co', financialYears: years }, 5),
    /non-negative cash outflow/,
  );
});
