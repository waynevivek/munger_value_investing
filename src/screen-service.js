const {
  FINANCIAL_FIT_CONFIG,
  createEditableFinancialFitConfig,
  scoreFinancialFit,
} = require('./financial-fit.js');
const { NORMALIZED_FIELDS } = require('./manual-nse-csv.js');
const { coverageFor } = require('./pilot-data.js');

const STALE_PRICE_AFTER_DAYS = 7;
const MAX_PRICE_SOURCE_LENGTH = 200;
const MAX_PRESET_LENGTH = 8000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

class RequestError extends Error {
  constructor(message, { statusCode = 400, code = 'invalid-request' } = {}) {
    super(message);
    this.name = 'RequestError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function invalidPreset(message) {
  return new RequestError(message, { code: 'invalid-preset' });
}

function parsePreset(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') {
    if (Array.isArray(value)) throw invalidPreset('The preset must be a JSON object, not an array.');
    return value;
  }

  const text = String(value);
  if (text.length > MAX_PRESET_LENGTH) {
    throw invalidPreset(`The preset must be ${MAX_PRESET_LENGTH} characters or fewer.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalidPreset('The preset must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidPreset('The preset must be a JSON object.');
  }
  return parsed;
}

function buildPresetConfig(preset) {
  const config = createEditableFinancialFitConfig();
  if (!preset) return config;

  if (preset.qualityChecks !== undefined) {
    if (!Array.isArray(preset.qualityChecks)) {
      throw invalidPreset('qualityChecks must be an array.');
    }

    const known = new Map(config.quality.checks.map((check) => [check.id, check]));
    const seen = new Set();
    for (const entry of preset.qualityChecks) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw invalidPreset('Each quality check override must be an object.');
      }
      if (typeof entry.id !== 'string') {
        throw invalidPreset('Each quality check override needs an id.');
      }
      const check = known.get(entry.id);
      if (!check) throw invalidPreset(`Unknown quality check “${entry.id}”.`);
      if (seen.has(entry.id)) throw invalidPreset(`Quality check “${entry.id}” is listed more than once.`);
      seen.add(entry.id);

      for (const field of ['floor', 'target', 'weight']) {
        if (typeof entry[field] !== 'number' || !Number.isFinite(entry[field])) {
          throw invalidPreset(`${check.label} ${field} must be a finite number.`);
        }
      }
      if (entry.weight < 0) throw invalidPreset(`${check.label} weight cannot be negative.`);

      check.floor = entry.floor;
      check.target = entry.target;
      check.weight = entry.weight;
    }

    const total = config.quality.checks.reduce((sum, check) => sum + check.weight, 0);
    if (Math.abs(total - config.quality.maximumScore) > 1e-9) {
      throw invalidPreset(`Quality check weights must add to ${config.quality.maximumScore}; they currently add to ${Math.round(total * 100) / 100}.`);
    }
  }

  if (preset.marginOfSafetyTargetPercent !== undefined) {
    if (typeof preset.marginOfSafetyTargetPercent !== 'number'
      || !Number.isFinite(preset.marginOfSafetyTargetPercent)) {
      throw invalidPreset('marginOfSafetyTargetPercent must be a finite number.');
    }
    config.valuation.marginOfSafetyTargetPercent = preset.marginOfSafetyTargetPercent;
  }

  return config;
}

function scoreWithPreset(company, lookbackYears, endOfDayPrice, preset) {
  const config = preset ? buildPresetConfig(preset) : null;
  try {
    return scoreFinancialFit(
      { company, lookbackYears, endOfDayPrice },
      config ?? FINANCIAL_FIT_CONFIG,
    );
  } catch (error) {
    if (config && (error instanceof TypeError || error instanceof RangeError)) {
      throw invalidPreset(`The custom preset is invalid: ${error.message}`);
    }
    throw error;
  }
}

function parseLookbackYears(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 5;
  const text = String(value).trim();
  if (text !== '5' && text !== '10') {
    throw new RequestError('lookbackYears must be 5 or 10.', { code: 'invalid-lookback' });
  }
  return Number(text);
}

function findCompany(companies, companyId) {
  const wanted = String(companyId ?? '').trim().toLowerCase();
  const company = companies.find(({ companyId: id }) => id.toLowerCase() === wanted);
  if (!company) {
    throw new RequestError(`No covered company matches “${companyId ?? ''}”.`, {
      statusCode: 404,
      code: 'company-not-found',
    });
  }
  return company;
}

function utcDay(value) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function parseDateOnly(value, label) {
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new RequestError(`${label} must use YYYY-MM-DD.`, { code: 'invalid-price-date' });
  }
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RequestError(`${label} is not a real calendar date.`, { code: 'invalid-price-date' });
  }
  return date;
}

function readManualPrice(params, company, now) {
  const supplied = [params.price, params.asOfDate, params.priceSource]
    .some((value) => value !== undefined && value !== null && String(value).trim() !== '');
  if (!supplied) return null;

  if (params.price === undefined || String(params.price).trim() === '') {
    throw new RequestError('Enter a price per share.', { code: 'price-incomplete' });
  }
  if (params.asOfDate === undefined || String(params.asOfDate).trim() === '') {
    throw new RequestError('Enter the date the price was observed.', { code: 'price-incomplete' });
  }
  if (params.priceSource === undefined || String(params.priceSource).trim() === '') {
    throw new RequestError('Enter a short source note for the price.', { code: 'price-incomplete' });
  }

  const pricePerShare = Number(params.price);
  if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) {
    throw new RequestError('Price per share must be a number greater than zero.', { code: 'invalid-price' });
  }

  const source = String(params.priceSource).trim();
  if (source.length > MAX_PRICE_SOURCE_LENGTH) {
    throw new RequestError(`The price source note must be ${MAX_PRICE_SOURCE_LENGTH} characters or fewer.`, {
      code: 'invalid-price-source',
    });
  }

  const asOfDate = String(params.asOfDate).trim();
  const observedOn = parseDateOnly(asOfDate, 'The price as-of date');
  const today = utcDay(now);
  if (observedOn > today) {
    throw new RequestError('The price as-of date cannot be in the future.', { code: 'future-price-date' });
  }
  const ageDays = Math.max(0, Math.round((today - observedOn) / DAY_IN_MS));

  return {
    endOfDayPrice: {
      pricePerShare,
      asOfDate,
      source,
      currency: company.currency,
    },
    price: {
      status: 'supplied',
      isManual: true,
      isLive: false,
      pricePerShare,
      currency: company.currency,
      asOfDate,
      source,
      ageDays,
      isStale: ageDays > STALE_PRICE_AFTER_DAYS,
      staleAfterDays: STALE_PRICE_AFTER_DAYS,
    },
  };
}

function formatYears(years) {
  if (years.length === 0) return '';
  const sorted = [...years].sort((a, b) => a - b);
  const contiguous = sorted.every((year, index) => index === 0 || year === sorted[index - 1] + 1);
  if (contiguous && sorted.length > 1) return `FY${sorted[0]}–FY${sorted[sorted.length - 1]}`;
  return sorted.map((year) => `FY${year}`).join(', ');
}

function requestedCoverage(company, lookbackYears) {
  const available = coverageFor(company);
  const requestedYears = Array.from(
    { length: lookbackYears },
    (_, index) => available.lastFiscalYear - lookbackYears + 1 + index,
  );
  const missingYears = requestedYears.filter((year) => !available.fiscalYears.includes(year));
  return {
    ...available,
    requestedLookbackYears: lookbackYears,
    requestedYears,
    missingYears,
    complete: missingYears.length === 0,
  };
}

function buildWarnings(coverage, price) {
  const warnings = [];

  if (!coverage.complete) {
    warnings.push({
      code: 'insufficient-coverage',
      message: `A ${coverage.requestedLookbackYears}-year lookback needs ${formatYears(coverage.requestedYears)}; `
        + `${formatYears(coverage.missingYears)} ${coverage.missingYears.length === 1 ? 'is' : 'are'} not in the pilot dataset.`,
    });
  }

  if (!price) {
    warnings.push({
      code: 'price-required',
      message: 'No dated manual price was supplied, so valuation and the combined score are not calculated.',
    });
  } else if (price.isStale) {
    warnings.push({
      code: 'stale-price',
      message: `This manual price is ${price.ageDays} days old. It is treated as stale after ${price.staleAfterDays} days.`,
    });
  }

  return warnings;
}

function buildProvenance(company) {
  return company.financialYears.map((year) => ({
    fiscalYear: year.fiscalYear,
    reportingDate: year.reportingDate,
    source: year.source,
    fields: NORMALIZED_FIELDS.map((field) => ({
      field,
      value: year[field],
      source: year.provenance[field]?.source ?? null,
      reportingDate: year.provenance[field]?.reportingDate ?? null,
      method: year.provenance[field]?.method ?? null,
    })),
  }));
}

function screenCompany(companies, params = {}, { now = new Date() } = {}) {
  const company = findCompany(companies, params.companyId);
  const lookbackYears = parseLookbackYears(params.lookbackYears);
  const preset = parsePreset(params.preset);
  const manualPrice = readManualPrice(params, company, now);

  const result = scoreWithPreset(
    company,
    lookbackYears,
    manualPrice?.endOfDayPrice ?? null,
    preset,
  );

  const coverage = requestedCoverage(company, lookbackYears);

  return {
    company: {
      companyId: company.companyId,
      companyName: company.companyName,
      currency: company.currency,
      fiscalYears: coverage.fiscalYears,
    },
    coverage,
    price: manualPrice?.price ?? {
      status: 'missing',
      isManual: true,
      isLive: false,
      staleAfterDays: STALE_PRICE_AFTER_DAYS,
    },
    screen: result,
    warnings: buildWarnings(coverage, manualPrice?.price ?? null),
    provenance: buildProvenance(company),
  };
}

function listCompanies(companies, { lookbackYears = 5, now = new Date(), preset = null } = {}) {
  const requestedLookback = parseLookbackYears(lookbackYears);
  const parsedPreset = parsePreset(preset);

  return companies.map((company) => {
    const detail = screenCompany(companies, {
      companyId: company.companyId,
      lookbackYears: requestedLookback,
      preset: parsedPreset,
    }, { now });
    return {
      companyId: detail.company.companyId,
      companyName: detail.company.companyName,
      currency: detail.company.currency,
      coverage: detail.coverage,
      qualityScore: detail.screen.qualityScore,
      qualityStatus: detail.screen.qualityScore === null ? 'insufficient-data' : 'scored',
      valuationStatus: 'price-required',
      warnings: detail.warnings,
    };
  });
}

module.exports = {
  RequestError,
  STALE_PRICE_AFTER_DAYS,
  buildPresetConfig,
  buildProvenance,
  findCompany,
  listCompanies,
  parseLookbackYears,
  parsePreset,
  requestedCoverage,
  screenCompany,
};
