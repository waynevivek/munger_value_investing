export const DEFAULT_SORT = { key: 'quality', direction: 'desc' };

const DEFAULT_DIRECTIONS = {
  name: 'asc',
  coverage: 'desc',
  quality: 'desc',
};

function companyName(company) {
  return company.companyName ?? company.companyId ?? '';
}

function qualityValue(company) {
  return Number.isFinite(company.qualityScore) ? company.qualityScore : null;
}

function coverageValue(company) {
  return Number.isFinite(company.coverage?.annualFilings) ? company.coverage.annualFilings : 0;
}

function compareNullableNumbers(left, right, direction) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const result = left - right;
  return direction === 'asc' ? result : -result;
}

const COMPARATORS = {
  name: (left, right, direction) => {
    const result = companyName(left).localeCompare(companyName(right), 'en', { sensitivity: 'base' });
    return direction === 'asc' ? result : -result;
  },
  coverage: (left, right, direction) => (
    compareNullableNumbers(coverageValue(left), coverageValue(right), direction)
  ),
  quality: (left, right, direction) => (
    compareNullableNumbers(qualityValue(left), qualityValue(right), direction)
  ),
};

export function sortCompanies(companies, { key = DEFAULT_SORT.key, direction = DEFAULT_SORT.direction } = {}) {
  const compare = COMPARATORS[key] ?? COMPARATORS.quality;
  const ordered = companies.map((company, index) => ({ company, index }));

  ordered.sort((left, right) => {
    const result = compare(left.company, right.company, direction);
    if (result !== 0) return result;
    return left.index - right.index;
  });

  return ordered.map(({ company }) => company);
}

export function nextSort(current, key) {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: DEFAULT_DIRECTIONS[key] ?? 'desc' };
}

export function ariaSort(current, key) {
  if (current.key !== key) return 'none';
  return current.direction === 'asc' ? 'ascending' : 'descending';
}
