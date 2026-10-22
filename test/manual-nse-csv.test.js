const test = require('node:test');
const assert = require('node:assert/strict');

const { scoreFinancialFit } = require('../src/financial-fit.js');
const { normalizeManualNseCsv, parseCsv } = require('../src/manual-nse-csv.js');

const fields = [
  'returnOnCapitalPercent',
  'debtToEquity',
  'netIncome',
  'operatingCashFlow',
  'capitalExpenditure',
  'ownerEarningsBeforeMaintenanceCapexPerShare',
  'totalCapitalExpenditurePerShare',
];

function csvFor({ companyId = 'TEST', fiscalYear = 2024, missing = [] } = {}) {
  const headers = ['companyId', 'companyName', 'currency', 'fiscalYear', 'source', 'reportingDate'];
  const values = [companyId, 'Test, Limited', 'INR', String(fiscalYear), 'NSE manual filing export', '2025-05-15'];
  for (const field of fields) {
    headers.push(field, `${field}Source`, `${field}ReportingDate`, `${field}Method`);
    values.push(missing.includes(field) ? '' : '12.5');
    values.push(`Annual report ${fiscalYear}`, `2025-05-15`, `manual mapping for ${field}`);
  }
  return `${headers.join(',')}\n${values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')}\n`;
}

test('parses quoted CSV fields, commas, escaped quotes, and CRLF', () => {
  assert.deepEqual(parseCsv('name,note\r\n"A, B","said ""hello"""\r\n'), [
    { name: 'A, B', note: 'said "hello"' },
  ]);
});

test('normalizes checked rows and retains per-input provenance', () => {
  const [company] = normalizeManualNseCsv(`${csvFor({ fiscalYear: 2023 })}${csvFor({ fiscalYear: 2024 }).split('\n').slice(1).join('\n')}`);

  assert.equal(company.companyId, 'TEST');
  assert.deepEqual(company.financialYears.map(({ fiscalYear }) => fiscalYear), [2023, 2024]);
  assert.equal(company.financialYears[1].netIncome, 12.5);
  assert.deepEqual(company.financialYears[1].provenance.netIncome, {
    source: 'Annual report 2024',
    reportingDate: '2025-05-15',
    method: 'manual mapping for netIncome',
  });
});

test('keeps absent values null so the scoring layer can report insufficient history', () => {
  const input = [csvFor({ fiscalYear: 2020, missing: ['ownerEarningsBeforeMaintenanceCapexPerShare'] })];
  for (const fiscalYear of [2021, 2022, 2023, 2024]) {
    input.push(`${csvFor({ fiscalYear }).split('\n')[1]}\n`);
  }
  const [company] = normalizeManualNseCsv(input.join(''));

  assert.equal(company.financialYears[0].ownerEarningsBeforeMaintenanceCapexPerShare, null);
  assert.equal(company.financialYears[0].provenance.ownerEarningsBeforeMaintenanceCapexPerShare, undefined);
  const result = scoreFinancialFit({
    company,
    lookbackYears: 5,
    endOfDayPrice: { pricePerShare: 10, currency: 'INR', asOfDate: '2025-06-30', source: 'manual quote' },
  });
  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.totalScore, null);
  assert.deepEqual(result.missingData, [{ fiscalYear: 2020, scope: 'valuation', field: 'ownerEarningsBeforeMaintenanceCapexPerShare' }]);
});

test('rejects values without field-level source, reporting date, and mapping method', () => {
  const input = csvFor().replace('Annual report 2024', '');

  assert.throws(() => normalizeManualNseCsv(input), /requires returnOnCapitalPercentSource/);
});

test('rejects duplicate company fiscal years and malformed CSV records', () => {
  const row = csvFor();
  assert.throws(() => normalizeManualNseCsv(`${row}${row.split('\n').slice(1).join('\n')}`), /duplicates TEST fiscal year 2024/);
  assert.throws(() => parseCsv('a,b\n1'), /expected 2/);
});
