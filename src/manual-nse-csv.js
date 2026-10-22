const NORMALIZED_FIELDS = [
  'returnOnCapitalPercent',
  'debtToEquity',
  'netIncome',
  'operatingCashFlow',
  'capitalExpenditure',
  'ownerEarningsBeforeMaintenanceCapexPerShare',
  'totalCapitalExpenditurePerShare',
];

function parseCsv(text) {
  if (typeof text !== 'string') throw new TypeError('CSV input must be a string');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      if (cell.length > 0) throw new SyntaxError('quote must begin at the start of a CSV field');
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      row.push(cell);
      cell = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      cell += character;
    }
  }
  if (quoted) throw new SyntaxError('unterminated quoted CSV field');
  row.push(cell);
  if (row.some((value) => value !== '')) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => header === '')) throw new TypeError('CSV headers must not be empty');
  if (new Set(headers).size !== headers.length) throw new TypeError('CSV headers must be unique');

  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new TypeError(`CSV row ${index + 2} has ${values.length} values; expected ${headers.length}`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
}

function optionalNumber(value, label) {
  if (value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number or blank`);
  return number;
}

function normalizeManualNseCsv(csvText) {
  const rows = parseCsv(csvText);
  const byCompany = new Map();

  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const companyId = row.companyId?.trim();
    const companyName = row.companyName?.trim();
    const currency = row.currency?.trim();
    const fiscalYear = Number(row.fiscalYear);
    if (!companyId || !companyName || !currency) {
      throw new TypeError(`CSV row ${line} must include companyId, companyName, and currency`);
    }
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 9999) {
      throw new TypeError(`CSV row ${line} must include a valid fiscalYear`);
    }
    const source = row.source?.trim();
    const reportingDate = row.reportingDate?.trim();
    if (!source || !reportingDate) {
      throw new TypeError(`CSV row ${line} must include source and reportingDate`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportingDate)) {
      throw new TypeError(`CSV row ${line} reportingDate must use YYYY-MM-DD`);
    }

    if (!byCompany.has(companyId)) {
      byCompany.set(companyId, {
        companyId,
        companyName,
        currency,
        financialYears: [],
      });
    }
    const company = byCompany.get(companyId);
    if (company.companyName !== companyName || company.currency !== currency) {
      throw new TypeError(`CSV row ${line} changes the company name or currency for ${companyId}`);
    }
    if (company.financialYears.some((year) => year.fiscalYear === fiscalYear)) {
      throw new TypeError(`CSV row ${line} duplicates ${companyId} fiscal year ${fiscalYear}`);
    }

    const financialYear = { fiscalYear, source, reportingDate, provenance: {} };
    for (const field of NORMALIZED_FIELDS) {
      financialYear[field] = optionalNumber(row[field], `${field} on CSV row ${line}`);
      const fieldSource = row[`${field}Source`]?.trim();
      const fieldReportingDate = row[`${field}ReportingDate`]?.trim();
      const method = row[`${field}Method`]?.trim();
      if (financialYear[field] !== null) {
        if (!fieldSource || !fieldReportingDate || !method) {
          throw new TypeError(`CSV row ${line} requires ${field}Source, ${field}ReportingDate, and ${field}Method when ${field} is present`);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fieldReportingDate)) {
          throw new TypeError(`CSV row ${line} ${field}ReportingDate must use YYYY-MM-DD`);
        }
        financialYear.provenance[field] = {
          source: fieldSource,
          reportingDate: fieldReportingDate,
          method,
        };
      }
    }
    company.financialYears.push(financialYear);
  }

  for (const company of byCompany.values()) {
    company.financialYears.sort((left, right) => left.fiscalYear - right.fiscalYear);
  }
  return [...byCompany.values()];
}

module.exports = { NORMALIZED_FIELDS, parseCsv, normalizeManualNseCsv };
