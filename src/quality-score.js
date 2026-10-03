const REQUIRED_FIELDS = [
  'returnOnCapitalPercent',
  'debtToEquity',
  'netIncome',
  'operatingCashFlow',
  'capitalExpenditure',
];

const QUALITY_SCORING_CONFIG = deepFreeze({
  version: 1,
  scoreMethod: 'linear-between-floor-and-target',
  maximumScore: 100,
  inputConventions: {
    capitalExpenditure: 'positive cash outflow; free cash flow = operating cash flow - capital expenditure',
    debtToEquity: 'interest-bearing debt divided by shareholders’ equity',
  },
  checks: [
    {
      id: 'profitability',
      label: 'Profitability',
      measurement: 'Annual return on capital, scored year by year and averaged',
      unit: 'percent',
      floor: 0,
      target: 15,
      direction: 'higher-is-better',
      weight: 25,
      explanation: 'This checks whether the company earns a healthy return on the money invested in its operations.',
    },
    {
      id: 'manageable-debt',
      label: 'Manageable debt',
      measurement: 'Median debt-to-equity ratio over the selected years',
      unit: 'ratio',
      floor: 2,
      target: 0.25,
      direction: 'lower-is-better',
      invalidBelow: 0,
      weight: 25,
      explanation: 'This compares interest-bearing debt with shareholders’ equity; a lower ratio usually means less balance-sheet leverage.',
    },
    {
      id: 'earnings-consistency',
      label: 'Earnings consistency',
      measurement: 'Percent of selected years with positive net income',
      unit: 'percent-of-years',
      floor: 40,
      target: 80,
      direction: 'higher-is-better',
      weight: 25,
      explanation: 'This checks how often the company reported positive net income during the selected period.',
    },
    {
      id: 'cash-generation',
      label: 'Cash generation',
      measurement: 'Percent of selected years with positive free cash flow',
      unit: 'percent-of-years',
      floor: 40,
      target: 80,
      direction: 'higher-is-better',
      weight: 25,
      explanation: 'This checks how often operating cash flow exceeded capital spending during the selected period.',
    },
  ],
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function copyConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function createEditableQualityScoringConfig() {
  return copyConfig(QUALITY_SCORING_CONFIG);
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.checks)) {
    throw new TypeError('config must contain a checks array');
  }
  if (!Number.isFinite(config.maximumScore) || config.maximumScore <= 0) {
    throw new TypeError('config.maximumScore must be a positive number');
  }

  const requiredIds = ['profitability', 'manageable-debt', 'earnings-consistency', 'cash-generation'];
  const checksById = new Map();
  for (const check of config.checks) {
    if (!check || !requiredIds.includes(check.id) || checksById.has(check.id)) {
      throw new TypeError('config.checks must contain each supported check exactly once');
    }
    if (!['higher-is-better', 'lower-is-better'].includes(check.direction)) {
      throw new TypeError(`config check ${check.id} must declare a scoring direction`);
    }
    if (![check.floor, check.target, check.weight].every(Number.isFinite) || check.weight < 0) {
      throw new TypeError(`config check ${check.id} must have finite floor, target, and non-negative weight`);
    }
    if (check.floor === check.target) {
      throw new TypeError(`config check ${check.id} floor and target must differ`);
    }
    if (check.direction === 'higher-is-better' && check.target < check.floor) {
      throw new TypeError(`config check ${check.id} target must exceed its floor`);
    }
    if (check.direction === 'lower-is-better' && check.target > check.floor) {
      throw new TypeError(`config check ${check.id} target must be below its floor`);
    }
    if (typeof check.label !== 'string' || typeof check.explanation !== 'string' || check.explanation.trim() === '') {
      throw new TypeError(`config check ${check.id} must include a label and explanation`);
    }
    checksById.set(check.id, check);
  }

  if (requiredIds.some((id) => !checksById.has(id))) {
    throw new TypeError('config.checks must contain each supported check exactly once');
  }
  const totalWeight = config.checks.reduce((total, check) => total + check.weight, 0);
  if (Math.abs(totalWeight - config.maximumScore) > 1e-9) {
    throw new RangeError(`config weights must sum to ${config.maximumScore}`);
  }
  return checksById;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function linearScorePercent(value, check) {
  if (Number.isFinite(check.invalidBelow) && value < check.invalidBelow) return 0;

  const fraction = check.direction === 'higher-is-better'
    ? (value - check.floor) / (check.target - check.floor)
    : (check.floor - value) / (check.floor - check.target);
  return round(Math.max(0, Math.min(1, fraction)) * 100);
}

function makeCheckResult(definition, figure, scorePercent) {
  const roundedPercent = round(scorePercent);
  const pointsAwarded = round(definition.weight * roundedPercent / 100);
  return {
    id: definition.id,
    label: definition.label,
    explanation: definition.explanation,
    measurement: definition.measurement,
    figure,
    floor: definition.floor,
    target: definition.target,
    direction: definition.direction,
    scorePercent: roundedPercent,
    weight: definition.weight,
    pointsAwarded,
    passed: roundedPercent === 100,
  };
}

function makeInsufficientResult(companyInfo, config, missingData) {
  return {
    ...companyInfo,
    status: 'insufficient-data',
    qualityScore: null,
    checks: config.checks.map((definition) => ({
      id: definition.id,
      label: definition.label,
      explanation: definition.explanation,
      measurement: definition.measurement,
      figure: null,
      floor: definition.floor,
      target: definition.target,
      direction: definition.direction,
      scorePercent: null,
      weight: definition.weight,
      pointsAwarded: null,
      passed: null,
    })),
    missingData,
  };
}

function scoreQuality(company, lookbackYears, config = QUALITY_SCORING_CONFIG) {
  if (lookbackYears !== 5 && lookbackYears !== 10) {
    throw new RangeError('lookbackYears must be 5 or 10');
  }
  if (!company || !Array.isArray(company.financialYears)) {
    throw new TypeError('company.financialYears must be an array');
  }
  const checkDefinitions = validateConfig(config);

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
    assumptions: { configuration: copyConfig(config) },
  };

  if (byYear.size === 0) {
    return makeInsufficientResult(companyInfo, config, [{ fiscalYear: null, field: 'financialYears' }]);
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
    return makeInsufficientResult(companyInfo, config, missingData);
  }

  for (const record of selectedRecords) {
    if (record.capitalExpenditure < 0) {
      throw new RangeError(`capitalExpenditure must be a non-negative cash outflow for fiscal year ${record.fiscalYear}`);
    }
  }

  const annualRoicValues = selectedRecords.map(({ returnOnCapitalPercent }) => returnOnCapitalPercent);
  const debtRatioValues = selectedRecords.map(({ debtToEquity }) => debtToEquity);
  const positiveEarningsYears = selectedRecords.filter(({ netIncome }) => netIncome > 0).length;
  const positiveFreeCashFlowYears = selectedRecords.filter(({ operatingCashFlow, capitalExpenditure }) => (
    operatingCashFlow - capitalExpenditure > 0
  )).length;
  const percentageOfYears = (count) => (count / lookbackYears) * 100;

  const measurements = {
    profitability: {
      figure: {
        annualReturnOnCapitalPercent: annualRoicValues,
        averageReturnOnCapitalPercent: round(average(annualRoicValues)),
      },
      scorePercent: average(annualRoicValues.map((value) => linearScorePercent(value, checkDefinitions.get('profitability')))),
    },
    'manageable-debt': {
      figure: { medianDebtToEquity: median(debtRatioValues) },
      scorePercent: linearScorePercent(median(debtRatioValues), checkDefinitions.get('manageable-debt')),
    },
    'earnings-consistency': {
      figure: {
        positiveYears: positiveEarningsYears,
        totalYears: lookbackYears,
        positivePercent: percentageOfYears(positiveEarningsYears),
      },
      scorePercent: linearScorePercent(percentageOfYears(positiveEarningsYears), checkDefinitions.get('earnings-consistency')),
    },
    'cash-generation': {
      figure: {
        positiveFreeCashFlowYears,
        totalYears: lookbackYears,
        positivePercent: percentageOfYears(positiveFreeCashFlowYears),
      },
      scorePercent: linearScorePercent(percentageOfYears(positiveFreeCashFlowYears), checkDefinitions.get('cash-generation')),
    },
  };

  const checks = config.checks.map(({ id }) => makeCheckResult(
    checkDefinitions.get(id),
    measurements[id].figure,
    measurements[id].scorePercent,
  ));

  return {
    ...companyInfo,
    status: 'scored',
    qualityScore: round(checks.reduce((total, check) => total + check.pointsAwarded, 0)),
    checks,
    missingData: [],
  };
}

module.exports = {
  QUALITY_SCORING_CONFIG,
  createEditableQualityScoringConfig,
  scoreQuality,
};
