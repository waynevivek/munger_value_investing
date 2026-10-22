const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const sortUrl = pathToFileURL(path.join(__dirname, '..', 'public', 'sort.mjs')).href;

const rows = [
  { companyId: 'BETA', companyName: 'Beta', qualityScore: 80, coverage: { annualFilings: 5 } },
  { companyId: 'ALPHA', companyName: 'Alpha', qualityScore: null, coverage: { annualFilings: 3 } },
  { companyId: 'GAMMA', companyName: 'Gamma', qualityScore: 60, coverage: { annualFilings: 5 } },
];

let sortModule;

test.before(async () => {
  sortModule = await import(sortUrl);
});

function ids(sorted) {
  return sorted.map((company) => company.companyId);
}

test('sorts by quality with unscored companies last in both directions', () => {
  assert.deepEqual(ids(sortModule.sortCompanies(rows, { key: 'quality', direction: 'desc' })), ['BETA', 'GAMMA', 'ALPHA']);
  assert.deepEqual(ids(sortModule.sortCompanies(rows, { key: 'quality', direction: 'asc' })), ['GAMMA', 'BETA', 'ALPHA']);
});

test('sorts by company name and fiscal coverage, keeping ties in their original order', () => {
  assert.deepEqual(ids(sortModule.sortCompanies(rows, { key: 'name', direction: 'asc' })), ['ALPHA', 'BETA', 'GAMMA']);
  assert.deepEqual(ids(sortModule.sortCompanies(rows, { key: 'name', direction: 'desc' })), ['GAMMA', 'BETA', 'ALPHA']);
  assert.deepEqual(ids(sortModule.sortCompanies(rows, { key: 'coverage', direction: 'desc' })), ['BETA', 'GAMMA', 'ALPHA']);
  assert.deepEqual(ids(sortModule.sortCompanies(rows, { key: 'coverage', direction: 'asc' })), ['ALPHA', 'BETA', 'GAMMA']);
});

test('toggles the direction of the active column and restores default directions for a new column', () => {
  assert.deepEqual(
    sortModule.nextSort({ key: 'quality', direction: 'desc' }, 'quality'),
    { key: 'quality', direction: 'asc' },
  );
  assert.deepEqual(
    sortModule.nextSort({ key: 'quality', direction: 'asc' }, 'quality'),
    { key: 'quality', direction: 'desc' },
  );
  assert.deepEqual(
    sortModule.nextSort({ key: 'quality', direction: 'desc' }, 'name'),
    { key: 'name', direction: 'asc' },
  );
  assert.deepEqual(
    sortModule.nextSort({ key: 'quality', direction: 'asc' }, 'coverage'),
    { key: 'coverage', direction: 'desc' },
  );
});

test('reports aria-sort only for the active column', () => {
  assert.equal(sortModule.ariaSort({ key: 'quality', direction: 'desc' }, 'quality'), 'descending');
  assert.equal(sortModule.ariaSort({ key: 'quality', direction: 'asc' }, 'quality'), 'ascending');
  assert.equal(sortModule.ariaSort({ key: 'quality', direction: 'asc' }, 'name'), 'none');
});

test('falls back to quality ordering for an unknown sort key and does not mutate input', () => {
  const before = ids(rows);
  const sorted = sortModule.sortCompanies(rows, { key: 'unknown', direction: 'desc' });

  assert.deepEqual(ids(sorted), ['BETA', 'GAMMA', 'ALPHA']);
  assert.deepEqual(ids(rows), before);
});
