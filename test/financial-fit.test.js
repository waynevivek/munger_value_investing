const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FINANCIAL_FIT_CONFIG,
  createEditableFinancialFitConfig,
  scoreFinancialFit,
} = require('../src/financial-fit.js');

function annualHistory(years, overrides = {}) {
  return years.map((fiscalYear) => ({
    fiscalYear,
    source: 'hand-written fixture',
    reportingDate: `${fiscalYear + 1}-05-15`,
    returnOnCapitalPercent: 20,
    debtToEquity: 0.1,
    netIncome: 100,
    operatingCashFlow: 140,
    capitalExpenditure: 30,
    ownerEarningsBeforeMaintenanceCapexPerShare: 10,
    totalCapitalExpenditurePerShare: 2,
    ...overrides[fiscalYear],
  }));
}

function input({ years = [2020, 2021, 2022, 2023, 2024], price = 10, overrides = {}, financialOverrides = {} } = {}) {
  return {
    company: {
      companyId: 'fixture-co',
      companyName: 'Fixture Co',
      currency: 'INR',
      financialYears: annualHistory(years, financialOverrides),
    },
    lookbackYears: 5,
    endOfDayPrice: {
      pricePerShare: price,
      currency: 'INR',
      asOfDate: '2025-06-30',
      source: 'hand-written fixture',
      ...overrides,
    },
  };
}

test('returns low/base/high values, scenario margins of safety, assumptions, and a 50/50 total', () => {
  const result = scoreFinancialFit(input({ price: 10 }));

  assert.equal(result.status, 'scored');
  assert.equal(result.qualityScore, 100);
  assert.equal(result.valuationScore, 100);
  assert.equal(result.totalScore, 100);
  assert.deepEqual(result.componentWeights, { quality: 50, valuation: 50 });
  assert.deepEqual(Object.keys(result.valuation.scenarios), ['low', 'base', 'high']);
  assert.ok(result.valuation.scenarios.low.intrinsicValuePerShare <= result.valuation.scenarios.base.intrinsicValuePerShare);
  assert.ok(result.valuation.scenarios.base.intrinsicValuePerShare <= result.valuation.scenarios.high.intrinsicValuePerShare);
  assert.equal(result.valuation.scenarios.low.assumptions.maintenanceCapexPercentOfTotalCapex, 100);
  assert.equal(result.valuation.scenarios.base.assumptions.ownerEarningsGrowthRatePercent, 3);
  assert.equal(result.valuation.scenarios.high.assumptions.discountRatePercent, 10);
  assert.equal(result.valuation.marginOfSafety.base, result.valuation.baseMarginOfSafetyPercent);
  assert.deepEqual(result.assumptions.configuration, FINANCIAL_FIT_CONFIG);
});

test('values a level owner-earnings stream at its 15% perpetuity amount in the low case', () => {
  const result = scoreFinancialFit(input({ price: 1 }));

  assert.equal(result.valuation.scenarios.low.normalizedOwnerEarningsPerShare, 8);
  assert.equal(result.valuation.scenarios.low.intrinsicValuePerShare, 53.33);
});

test('great-but-expensive and cheap-but-weak companies retain separate scores beside the total', () => {
  const greatButExpensive = scoreFinancialFit(input({ price: 200 }));
  const cheapButWeak = scoreFinancialFit(input({
    price: 10,
    financialOverrides: {
      2020: { returnOnCapitalPercent: -5, debtToEquity: 4, netIncome: -10, operatingCashFlow: 100, capitalExpenditure: 200 },
      2021: { returnOnCapitalPercent: -5, debtToEquity: 4, netIncome: -10, operatingCashFlow: 100, capitalExpenditure: 200 },
      2022: { returnOnCapitalPercent: -5, debtToEquity: 4, netIncome: -10, operatingCashFlow: 100, capitalExpenditure: 200 },
      2023: { returnOnCapitalPercent: -5, debtToEquity: 4, netIncome: -10, operatingCashFlow: 100, capitalExpenditure: 200 },
      2024: { returnOnCapitalPercent: -5, debtToEquity: 4, netIncome: -10, operatingCashFlow: 100, capitalExpenditure: 200 },
    },
  }));

  assert.equal(greatButExpensive.qualityScore, 100);
  assert.equal(greatButExpensive.valuationScore, 0);
  assert.equal(greatButExpensive.totalScore, 50);
  assert.equal(cheapButWeak.qualityScore, 0);
  assert.equal(cheapButWeak.valuationScore, 100);
  assert.equal(cheapButWeak.totalScore, 50);
});

test('uses an edited scenario and valuation-score config and snapshots it with the result', () => {
  const config = createEditableFinancialFitConfig();
  config.valuation.scenarios.base.discountRatePercent = 13;
  config.valuation.scenarios.base.ownerEarningsGrowthRatePercent = 0;
  config.valuation.scenarios.base.terminalGrowthRatePercent = 0;
  config.valuation.scenarios.base.maintenanceCapexPercentOfTotalCapex = 100;
  config.valuation.marginOfSafetyTargetPercent = 1000;

  const result = scoreFinancialFit(input({ price: 10 }), config);

  assert.deepEqual(result.assumptions.configuration, config);
  assert.equal(result.valuation.scenarios.base.assumptions.discountRatePercent, 13);
  assert.ok(result.valuation.baseMarginOfSafetyPercent > 0);
  assert.equal(result.valuationScore, Math.round(result.valuation.baseMarginOfSafetyPercent / 10 * 100) / 100);
});

test('returns insufficient data without a total when a selected year lacks owner-earnings input', () => {
  const value = input();
  delete value.company.financialYears[2].ownerEarningsBeforeMaintenanceCapexPerShare;

  const result = scoreFinancialFit(value);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.totalScore, null);
  assert.equal(result.valuationScore, null);
  assert.deepEqual(result.missingData, [{ fiscalYear: 2022, scope: 'valuation', field: 'ownerEarningsBeforeMaintenanceCapexPerShare' }]);
});

test('returns insufficient data without a total when end-of-day price provenance is incomplete', () => {
  const value = input({ overrides: { source: '', asOfDate: '' } });

  const result = scoreFinancialFit(value);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.totalScore, null);
  assert.equal(result.qualityScore, 100);
  assert.equal(result.valuationScore, null);
  assert.deepEqual(result.missingData, [
    { scope: 'price', field: 'asOfDate' },
    { scope: 'price', field: 'source' },
  ]);
});

test('returns insufficient data without a total when a required quality input is missing', () => {
  const value = input();
  delete value.company.financialYears[0].debtToEquity;

  const result = scoreFinancialFit(value);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.totalScore, null);
  assert.equal(result.qualityScore, null);
  assert.equal(result.valuationScore, 100);
  assert.equal(result.missingData[0].scope, 'quality');
});

test('does not compute valuation when selected financial history has a gap', () => {
  const result = scoreFinancialFit(input({ years: [2020, 2021, 2023, 2024] }));

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.totalScore, null);
  assert.equal(result.missingData.some(({ scope, field }) => scope === 'valuation' && field === 'fiscalYear'), true);
});

test('rejects mismatched price and financial currencies', () => {
  const value = input({ overrides: { currency: 'USD' } });

  const result = scoreFinancialFit(value);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.totalScore, null);
  assert.deepEqual(result.missingData, [{ scope: 'price', field: 'currency' }]);
});
