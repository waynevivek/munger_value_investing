const {
  QUALITY_SCORING_CONFIG,
  scoreQuality,
} = require('./quality-score.js');

const FINANCIAL_FIT_CONFIG = deepFreeze({
  version: 1,
  quality: QUALITY_SCORING_CONFIG,
  valuation: {
    forecastYears: 5,
    valueMethod: 'five-year owner-earnings growth plus stable-growth terminal value',
    normalizedOwnerEarningsMethod: 'median selected-year pre-maintenance owner earnings per share less scenario maintenance capex',
    terminalValueMethod: 'year-five owner earnings grown at terminal rate divided by discount rate minus terminal rate',
    discountRateBasis: 'required return on equity; cash flow is owner earnings after interest and tax',
    scenarios: {
      low: {
        label: 'Low value',
        ownerEarningsGrowthRatePercent: 0,
        terminalGrowthRatePercent: 0,
        discountRatePercent: 15,
        maintenanceCapexPercentOfTotalCapex: 100,
      },
      base: {
        label: 'Base value',
        ownerEarningsGrowthRatePercent: 3,
        terminalGrowthRatePercent: 2,
        discountRatePercent: 12,
        maintenanceCapexPercentOfTotalCapex: 75,
      },
      high: {
        label: 'High value',
        ownerEarningsGrowthRatePercent: 6,
        terminalGrowthRatePercent: 3,
        discountRatePercent: 10,
        maintenanceCapexPercentOfTotalCapex: 50,
      },
    },
    marginOfSafetyFloorPercent: 0,
    marginOfSafetyTargetPercent: 25,
    marginOfSafetyScoredAgainst: 'base-case intrinsic value per share',
  },
  combinedScore: {
    maximumScore: 100,
    qualityWeight: 50,
    valuationWeight: 50,
  },
  inputConventions: {
    ownerEarningsBeforeMaintenanceCapexPerShare: 'median historical per-share earnings after interest and tax, plus selected non-cash charges, less additional working capital needed to maintain operations; before maintenance capex',
    totalCapitalExpenditurePerShare: 'positive reported capex divided by a corporate-action-adjusted diluted share count',
    endOfDayPrice: 'price per share, date, source, and currency must use the same corporate-action basis and currency as the per-share financial history',
  },
});

const VALUATION_FIELDS = [
  'ownerEarningsBeforeMaintenanceCapexPerShare',
  'totalCapitalExpenditurePerShare',
];

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

function createEditableFinancialFitConfig() {
  return copyConfig(FINANCIAL_FIT_CONFIG);
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function validateConfig(config) {
  if (!config || !config.quality || !config.valuation || !config.combinedScore) {
    throw new TypeError('config must include quality, valuation, and combinedScore sections');
  }
  const { valuation, combinedScore } = config;
  if (!Number.isInteger(valuation.forecastYears) || valuation.forecastYears <= 0) {
    throw new TypeError('valuation.forecastYears must be a positive integer');
  }
  if (!valuation.scenarios
    || Object.keys(valuation.scenarios).length !== 3
    || !['low', 'base', 'high'].every((name) => valuation.scenarios[name])) {
    throw new TypeError('valuation.scenarios must define low, base, and high cases');
  }
  for (const [name, scenario] of Object.entries(valuation.scenarios)) {
    const values = [
      scenario.ownerEarningsGrowthRatePercent,
      scenario.terminalGrowthRatePercent,
      scenario.discountRatePercent,
      scenario.maintenanceCapexPercentOfTotalCapex,
    ];
    if (!values.every(Number.isFinite)) {
      throw new TypeError(`${name} scenario assumptions must be finite numbers`);
    }
    if (scenario.ownerEarningsGrowthRatePercent <= -100 || scenario.terminalGrowthRatePercent < 0) {
      throw new RangeError(`${name} scenario growth rates are outside the supported range`);
    }
    if (scenario.discountRatePercent <= scenario.terminalGrowthRatePercent) {
      throw new RangeError(`${name} scenario discount rate must exceed its terminal growth rate`);
    }
    if (scenario.maintenanceCapexPercentOfTotalCapex < 0 || scenario.maintenanceCapexPercentOfTotalCapex > 100) {
      throw new RangeError(`${name} scenario maintenance capex must be between 0 and 100 percent of total capex`);
    }
  }
  const [low, base, high] = ['low', 'base', 'high'].map((name) => valuation.scenarios[name]);
  if (low.ownerEarningsGrowthRatePercent > base.ownerEarningsGrowthRatePercent
    || base.ownerEarningsGrowthRatePercent > high.ownerEarningsGrowthRatePercent
    || low.terminalGrowthRatePercent > base.terminalGrowthRatePercent
    || base.terminalGrowthRatePercent > high.terminalGrowthRatePercent
    || low.discountRatePercent < base.discountRatePercent
    || base.discountRatePercent < high.discountRatePercent
    || low.maintenanceCapexPercentOfTotalCapex < base.maintenanceCapexPercentOfTotalCapex
    || base.maintenanceCapexPercentOfTotalCapex < high.maintenanceCapexPercentOfTotalCapex) {
    throw new RangeError('low, base, and high assumptions must preserve conservative-to-optimistic order');
  }
  if (!Number.isFinite(valuation.marginOfSafetyFloorPercent)
    || !Number.isFinite(valuation.marginOfSafetyTargetPercent)
    || valuation.marginOfSafetyTargetPercent <= valuation.marginOfSafetyFloorPercent) {
    throw new TypeError('valuation margin-of-safety floor and target must be finite and target must exceed floor');
  }
  if (![combinedScore.maximumScore, combinedScore.qualityWeight, combinedScore.valuationWeight].every(Number.isFinite)
    || combinedScore.maximumScore <= 0
    || combinedScore.qualityWeight < 0
    || combinedScore.valuationWeight < 0
    || Math.abs(combinedScore.qualityWeight + combinedScore.valuationWeight - combinedScore.maximumScore) > 1e-9) {
    throw new RangeError('combined score weights must be non-negative and sum to the maximum score');
  }
}

function selectedHistory(company, lookbackYears) {
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
  if (byYear.size === 0) return { years: [], missing: [{ fiscalYear: null, field: 'financialYears' }] };

  const lastYear = Math.max(...byYear.keys());
  const years = [];
  const missing = [];
  for (let offset = lookbackYears - 1; offset >= 0; offset -= 1) {
    const fiscalYear = lastYear - offset;
    const record = byYear.get(fiscalYear);
    if (!record) {
      missing.push({ fiscalYear, field: 'fiscalYear' });
      continue;
    }
    years.push(record);
    for (const field of VALUATION_FIELDS) {
      if (typeof record[field] !== 'number' || !Number.isFinite(record[field])) {
        missing.push({ fiscalYear, field });
      }
    }
    if (record.totalCapitalExpenditurePerShare < 0) {
      throw new RangeError(`totalCapitalExpenditurePerShare must be non-negative for fiscal year ${fiscalYear}`);
    }
  }
  return { years, missing };
}

function calculateScenario(scenario, years, price, valuationConfig) {
  const ownerEarningsGrowthRate = scenario.ownerEarningsGrowthRatePercent / 100;
  const terminalGrowthRate = scenario.terminalGrowthRatePercent / 100;
  const discountRate = scenario.discountRatePercent / 100;
  const normalizedPreMaintenanceOwnerEarningsPerShare = median(
    years.map(({ ownerEarningsBeforeMaintenanceCapexPerShare }) => ownerEarningsBeforeMaintenanceCapexPerShare),
  );
  const averageTotalCapitalExpenditurePerShare = years.reduce(
    (total, year) => total + year.totalCapitalExpenditurePerShare,
    0,
  ) / years.length;
  const maintenanceCapexPerShare = averageTotalCapitalExpenditurePerShare
    * scenario.maintenanceCapexPercentOfTotalCapex / 100;
  const normalizedOwnerEarningsPerShare = normalizedPreMaintenanceOwnerEarningsPerShare - maintenanceCapexPerShare;

  const forecast = [];
  let presentValue = 0;
  for (let year = 1; year <= valuationConfig.forecastYears; year += 1) {
    const ownerEarningsPerShare = normalizedOwnerEarningsPerShare * ((1 + ownerEarningsGrowthRate) ** year);
    const discountedOwnerEarningsPerShare = ownerEarningsPerShare / ((1 + discountRate) ** year);
    forecast.push({
      year,
      ownerEarningsPerShare: round(ownerEarningsPerShare),
      presentValuePerShare: round(discountedOwnerEarningsPerShare),
    });
    presentValue += discountedOwnerEarningsPerShare;
  }

  const finalForecastOwnerEarningsPerShare = normalizedOwnerEarningsPerShare
    * ((1 + ownerEarningsGrowthRate) ** valuationConfig.forecastYears);
  const terminalValuePerShare = finalForecastOwnerEarningsPerShare * (1 + terminalGrowthRate)
    / (discountRate - terminalGrowthRate);
  const discountedTerminalValuePerShare = terminalValuePerShare
    / ((1 + discountRate) ** valuationConfig.forecastYears);
  const intrinsicValuePerShare = round(presentValue + discountedTerminalValuePerShare);
  const marginOfSafetyPercent = intrinsicValuePerShare > 0
    ? round((intrinsicValuePerShare - price.pricePerShare) / intrinsicValuePerShare * 100)
    : null;
  const upsideDownsidePercent = price.pricePerShare > 0
    ? round((intrinsicValuePerShare - price.pricePerShare) / price.pricePerShare * 100)
    : null;

  return {
    label: scenario.label,
    normalizedPreMaintenanceOwnerEarningsPerShare: round(normalizedPreMaintenanceOwnerEarningsPerShare),
    averageTotalCapitalExpenditurePerShare: round(averageTotalCapitalExpenditurePerShare),
    maintenanceCapexPerShare: round(maintenanceCapexPerShare),
    normalizedOwnerEarningsPerShare: round(normalizedOwnerEarningsPerShare),
    forecast,
    terminalValuePerShare: round(terminalValuePerShare),
    discountedTerminalValuePerShare: round(discountedTerminalValuePerShare),
    intrinsicValuePerShare,
    marginOfSafetyPercent,
    upsideDownsidePercent,
    assumptions: { ...scenario, forecastYears: valuationConfig.forecastYears, terminalValueMethod: valuationConfig.terminalValueMethod },
  };
}

function missingPriceFields(price, companyCurrency) {
  const missing = [];
  if (!price || !Number.isFinite(price.pricePerShare) || price.pricePerShare <= 0) {
    missing.push({ scope: 'price', field: 'pricePerShare' });
  }
  if (!price || typeof price.asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(price.asOfDate)) {
    missing.push({ scope: 'price', field: 'asOfDate' });
  }
  if (!price || typeof price.source !== 'string' || price.source.trim() === '') {
    missing.push({ scope: 'price', field: 'source' });
  }
  if (!price || typeof price.currency !== 'string' || price.currency !== companyCurrency) {
    missing.push({ scope: 'price', field: 'currency' });
  }
  return missing;
}

function scoreFinancialFit(input, config = FINANCIAL_FIT_CONFIG) {
  if (!input || !input.company || !Array.isArray(input.company.financialYears)) {
    throw new TypeError('input.company.financialYears must be an array');
  }
  if (input.lookbackYears !== 5 && input.lookbackYears !== 10) {
    throw new RangeError('lookbackYears must be 5 or 10');
  }
  validateConfig(config);

  const quality = scoreQuality(input.company, input.lookbackYears, config.quality);
  const { years, missing: valuationMissing } = selectedHistory(input.company, input.lookbackYears);
  const missingData = [
    ...quality.missingData.map((missing) => ({ scope: 'quality', ...missing })),
    ...valuationMissing.map((missing) => ({ scope: 'valuation', ...missing })),
    ...missingPriceFields(input.endOfDayPrice, input.company.currency),
  ];
  const valuationInputsMissing = [...valuationMissing, ...missingPriceFields(input.endOfDayPrice, input.company.currency)];
  const assumptions = { configuration: copyConfig(config) };

  const resultBase = {
    companyId: input.company.companyId,
    ...(input.company.companyName === undefined ? {} : { companyName: input.company.companyName }),
    lookbackYears: input.lookbackYears,
    qualityScore: quality.qualityScore,
    valuationScore: null,
    totalScore: null,
    componentWeights: {
      quality: config.combinedScore.qualityWeight,
      valuation: config.combinedScore.valuationWeight,
    },
    qualityChecks: quality.checks,
    assumptions,
    missingData,
  };

  let valuation = {
    status: 'insufficient-data',
    scenarios: null,
    price: input.endOfDayPrice ?? null,
    baseMarginOfSafetyPercent: null,
    marginOfSafety: null,
    scorePercent: null,
  };
  let valuationScore = null;
  if (valuationInputsMissing.length === 0) {
    const scenarios = Object.fromEntries(Object.entries(config.valuation.scenarios).map(([name, scenario]) => [
      name,
      calculateScenario(scenario, years, input.endOfDayPrice, config.valuation),
    ]));
    const baseMarginOfSafety = scenarios.base.marginOfSafetyPercent;
    if (baseMarginOfSafety !== null) {
      const valuationScorePercent = Math.max(0, Math.min(100, (baseMarginOfSafety - config.valuation.marginOfSafetyFloorPercent)
        / (config.valuation.marginOfSafetyTargetPercent - config.valuation.marginOfSafetyFloorPercent) * 100));
      valuationScore = round(valuationScorePercent);
      valuation = {
        status: 'scored',
        scenarios,
        price: {
          pricePerShare: input.endOfDayPrice.pricePerShare,
          asOfDate: input.endOfDayPrice.asOfDate,
          source: input.endOfDayPrice.source,
          currency: input.endOfDayPrice.currency,
        },
        baseMarginOfSafetyPercent: baseMarginOfSafety,
        marginOfSafety: Object.fromEntries(Object.entries(scenarios).map(([name, scenario]) => [name, scenario.marginOfSafetyPercent])),
        scorePercent: valuationScore,
        scoreAssumption: {
          scoredAgainst: config.valuation.marginOfSafetyScoredAgainst,
          floorPercent: config.valuation.marginOfSafetyFloorPercent,
          targetPercent: config.valuation.marginOfSafetyTargetPercent,
        },
      };
    } else {
      valuation = {
        ...valuation,
        status: 'not-valuatable',
        scenarios,
        price: input.endOfDayPrice,
        marginOfSafety: Object.fromEntries(Object.entries(scenarios).map(([name, scenario]) => [name, scenario.marginOfSafetyPercent])),
      };
    }
  }

  if (missingData.length > 0) {
    return {
      ...resultBase,
      status: 'insufficient-data',
      valuationScore,
      valuation,
    };
  }

  if (valuation.status === 'not-valuatable') {
    return {
      ...resultBase,
      status: 'not-valuatable',
      valuation,
    };
  }

  const totalScore = round((quality.qualityScore * config.combinedScore.qualityWeight
    + valuationScore * config.combinedScore.valuationWeight) / config.combinedScore.maximumScore);

  return {
    ...resultBase,
    status: 'scored',
    valuationScore,
    totalScore,
    valuation,
  };
}

module.exports = {
  FINANCIAL_FIT_CONFIG,
  createEditableFinancialFitConfig,
  scoreFinancialFit,
};
