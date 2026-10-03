const REQUIRED_FIELDS = [
  'returnOnCapitalPercent',
  'debtToEquity',
  'netIncome',
  'operatingCashFlow',
  'capitalExpenditure',
];

const CHECK_DEFINITIONS = [
  { id: 'profitability', label: 'Profitability', metric: 'average return on capital', threshold: '>= 15%', limit: 15, weight: 25 },
  { id: 'manageable-debt', label: 'Manageable debt', metric: 'median debt-to-equity', threshold: '<= 0.5; ratios must be non-negative', limit: 0.5, weight: 25 },
  { id: 'earnings-consistency', label: 'Earnings consistency', metric: 'positive net income in selected years', threshold: '>= 80%', limit: 80, weight: 25 },
  {
    id: 'cash-generation',
    label: 'Cash generation',
    metric: 'positive free cash flow years (operating cash flow minus capital expenditure)',
    threshold: '>= 80%',
    limit: 80,
    weight: 25,
  },
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function makeCheck(definition, figure, passed) {
  return {
    id: definition.id,
    label: definition.label,
    figure,
    threshold: definition.threshold,
    passed,
    weight: definition.weight,
    pointsAwarded: passed ? definition.weight : 0,
  };
}

function makeInsufficientResult(companyInfo, missingData) {
  return {
    ...companyInfo,
    status: 'insufficient-data',
    qualityScore: null,
    checks: CHECK_DEFINITIONS.map(({ id, label, threshold, weight }) => ({
      id,
      label,
      figure: null,
      threshold,
      passed: null,
      weight,
      pointsAwarded: null,
    })),
    missingData,
  };
}

function scoreQuality(company, lookbackYears) {
  if (lookbackYears !== 5 && lookbackYears !== 10) {
    throw new RangeError('lookbackYears must be 5 or 10');
  }
  if (!company || !Array.isArray(company.financialYears)) {
    throw new TypeError('company.financialYears must be an array');
  }

  const byYear = new Map();
  for (const year of company.financialYears) {
    if (!year || !Number.isInteger(year.fiscalYear)) {
      throw new TypeError('each financial year must have an integer fiscalYear');
    }
    if (byYear.has(year.fiscalYear)) {
      throw new TypeError(`duplicate financial year: ${year.fiscalYear}`);
    }
    byYear.set(year.fiscalYear, year);
  }

  const companyInfo = {
    companyId: company.companyId,
    ...(company.companyName === undefined ? {} : { companyName: company.companyName }),
    lookbackYears,
    assumptions: {
      checks: CHECK_DEFINITIONS.map(({ id, metric, threshold, weight }) => ({ id, metric, threshold, weight })),
      capitalExpenditureConvention: 'positive cash outflow; free cash flow = operating cash flow - capital expenditure',
    },
  };

  if (byYear.size === 0) {
    return makeInsufficientResult(companyInfo, [{ fiscalYear: null, field: 'financialYears' }]);
  }

  const latestYear = Math.max(...byYear.keys());
  const firstYear = latestYear - lookbackYears + 1;
  const selectedYears = Array.from({ length: lookbackYears }, (_, index) => firstYear + index);
  const missingData = [];
  const selectedRecords = [];

  for (const fiscalYear of selectedYears) {
    const record = byYear.get(fiscalYear);
    if (!record) {
      missingData.push({ fiscalYear, field: 'fiscalYear' });
      continue;
    }
    selectedRecords.push(record);
    for (const field of REQUIRED_FIELDS) {
      if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
        missingData.push({ fiscalYear, field });
      }
    }
    if (typeof record.source !== 'string' || record.source.trim() === '') {
      missingData.push({ fiscalYear, field: 'source' });
    }
    if (typeof record.reportingDate !== 'string' || record.reportingDate.trim() === '') {
      missingData.push({ fiscalYear, field: 'reportingDate' });
    }
  }

  if (missingData.length > 0) {
    return makeInsufficientResult(companyInfo, missingData);
  }

  for (const record of selectedRecords) {
    if (record.capitalExpenditure < 0) {
      throw new RangeError(`capitalExpenditure must be a non-negative cash outflow for fiscal year ${record.fiscalYear}`);
    }
  }

  const roicValues = selectedRecords.map(({ returnOnCapitalPercent }) => returnOnCapitalPercent);
  const debtRatios = selectedRecords.map(({ debtToEquity }) => debtToEquity);
  const positiveEarningsYears = selectedRecords.filter(({ netIncome }) => netIncome > 0).length;
  const freeCashFlowValues = selectedRecords.map(({ operatingCashFlow, capitalExpenditure }) => operatingCashFlow - capitalExpenditure);
  const positiveFreeCashFlowYears = freeCashFlowValues.filter((value) => value > 0).length;
  const positivePercent = (count) => (count / lookbackYears) * 100;

  const averageRoic = average(roicValues);
  const medianDebtToEquity = median(debtRatios);
  const positiveEarningsPercent = positivePercent(positiveEarningsYears);
  const positiveFreeCashFlowPercent = positivePercent(positiveFreeCashFlowYears);
  const [profitability, debt, earningsConsistency, cashGeneration] = CHECK_DEFINITIONS;
  const checks = [
    makeCheck(profitability, { averageReturnOnCapitalPercent: averageRoic }, averageRoic >= profitability.limit),
    makeCheck(debt, { medianDebtToEquity }, debtRatios.every((value) => value >= 0) && medianDebtToEquity <= debt.limit),
    makeCheck(
      earningsConsistency,
      { positiveYears: positiveEarningsYears, totalYears: lookbackYears, positivePercent: positiveEarningsPercent },
      positiveEarningsPercent >= earningsConsistency.limit,
    ),
    makeCheck(
      cashGeneration,
      { positiveFreeCashFlowYears, totalYears: lookbackYears, positivePercent: positiveFreeCashFlowPercent },
      positiveFreeCashFlowPercent >= cashGeneration.limit,
    ),
  ];

  return {
    ...companyInfo,
    status: 'scored',
    qualityScore: checks.reduce((total, check) => total + check.pointsAwarded, 0),
    checks,
    missingData: [],
  };
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

module.exports = { scoreQuality };
