const fs = require('node:fs');
const path = require('node:path');

const { normalizeManualNseCsv } = require('./manual-nse-csv.js');

const DEFAULT_DATASET_PATH = path.join(__dirname, '..', 'data', 'normalized', 'nse-pilot.csv');

function loadPilotDataset(csvPath = DEFAULT_DATASET_PATH) {
  const companies = normalizeManualNseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (companies.length === 0) {
    throw new Error(`pilot dataset ${csvPath} contains no companies`);
  }
  return companies;
}

function coverageFor(company) {
  const fiscalYears = company.financialYears.map(({ fiscalYear }) => fiscalYear).sort((a, b) => a - b);
  return {
    fiscalYears,
    firstFiscalYear: fiscalYears[0],
    lastFiscalYear: fiscalYears[fiscalYears.length - 1],
    annualFilings: fiscalYears.length,
  };
}

function datasetSummary(companies) {
  const coverage = companies.map(coverageFor);
  const fiscalYears = [...new Set(coverage.flatMap((item) => item.fiscalYears))].sort((a, b) => a - b);

  return {
    id: 'nse-pilot',
    name: 'India value-investing screener — local pilot',
    mode: 'manual-local-pilot',
    companyCount: companies.length,
    coverage: {
      fiscalYears,
      firstFiscalYear: fiscalYears[0],
      lastFiscalYear: fiscalYears[fiscalYears.length - 1],
    },
    ingestion: 'Manual transcription of NSE financial-results PDFs and annual reports. No automated NSE collection.',
    verifiedOn: 'October 2026',
    redistribution: 'NSE-derived figures are stored locally for analysis. Rights to redistribute them publicly are not verified.',
    disclaimer: 'Scores are a research aid, not investment advice or a buy/sell recommendation. They are not an official Buffett or Munger formula.',
    limitations: [
      'One company with five fiscal years. The other four pilot companies and ten-year coverage are deferred.',
      'No live, intraday, or stored market price. A dated price must be entered manually.',
      'Annual statements only. Quarterly results are not included.',
    ],
  };
}

module.exports = {
  DEFAULT_DATASET_PATH,
  coverageFor,
  datasetSummary,
  loadPilotDataset,
};
