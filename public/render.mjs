export const FIELD_META = {
  returnOnCapitalPercent: { label: 'Return on capital', unit: '%' },
  debtToEquity: { label: 'Debt-to-equity', unit: '×' },
  netIncome: { label: 'Net income', unit: '₹ crore' },
  operatingCashFlow: { label: 'Operating cash flow', unit: '₹ crore' },
  capitalExpenditure: { label: 'Capital expenditure', unit: '₹ crore' },
  ownerEarningsBeforeMaintenanceCapexPerShare: { label: 'Owner earnings before maintenance capex', unit: '₹ per share' },
  totalCapitalExpenditurePerShare: { label: 'Total capital expenditure', unit: '₹ per share' },
};

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

export function formatNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

export function formatCurrency(value, { currency = 'INR', decimals = 2 } = {}) {
  if (!Number.isFinite(value)) return '—';
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${formatNumber(value, decimals)}`;
}

export function formatCrore(value) {
  if (!Number.isFinite(value)) return '—';
  return `₹${formatNumber(value, 0)} crore`;
}

export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatRatio(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}×`;
}

export function formatFieldValue(field, value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  switch (field) {
    case 'returnOnCapitalPercent':
      return formatPercent(value);
    case 'debtToEquity':
      return formatRatio(value);
    case 'netIncome':
    case 'operatingCashFlow':
    case 'capitalExpenditure':
      return formatCrore(value);
    case 'ownerEarningsBeforeMaintenanceCapexPerShare':
    case 'totalCapitalExpenditurePerShare':
      return formatCurrency(value);
    default:
      return String(value);
  }
}

export function statusLabel(status) {
  switch (status) {
    case 'scored':
      return 'Scored';
    case 'insufficient-data':
      return 'Insufficient data';
    case 'not-valuatable':
      return 'Not valuatable';
    default:
      return 'Not calculated';
  }
}

export function scoreTone(score) {
  if (!Number.isFinite(score)) return 'neutral';
  if (score >= 70) return 'good';
  if (score >= 40) return 'mid';
  return 'low';
}

export function checkFigureText(check) {
  if (!check || !check.figure) return 'Not calculated';
  const { figure, id } = check;
  switch (id) {
    case 'profitability': {
      const annual = figure.annualReturnOnCapitalPercent ?? [];
      return `Average return on capital ${formatPercent(figure.averageReturnOnCapitalPercent, 2)}`
        + ` (annual: ${annual.map((value) => formatPercent(value, 2)).join(', ')})`;
    }
    case 'manageable-debt':
      return `Median debt-to-equity ${formatRatio(figure.medianDebtToEquity)}`;
    case 'earnings-consistency':
      return `${figure.positiveYears} of ${figure.totalYears} years profitable (${formatPercent(figure.positivePercent, 0)})`;
    case 'cash-generation':
      return `${figure.positiveFreeCashFlowYears} of ${figure.totalYears} years with positive free cash flow`
        + ` (${formatPercent(figure.positivePercent, 0)})`;
    default:
      return 'Not calculated';
  }
}

export function thresholdText(check) {
  const unit = check.unit ?? (check.id === 'manageable-debt' ? 'ratio' : 'percent');
  const format = unit === 'ratio' ? formatRatio : (value) => formatPercent(value, 0);
  return `Zero credit at ${format(check.floor)}; full credit at ${format(check.target)}`;
}

export function priceSummary(price) {
  if (!price || price.status !== 'supplied') {
    return {
      tone: 'warning',
      title: 'No market price supplied',
      detail: 'Valuation and the combined score stay blank until you enter a dated manual price.',
    };
  }
  const age = price.ageDays === 0
    ? 'entered today'
    : `${price.ageDays} day${price.ageDays === 1 ? '' : 's'} old`;
  return {
    tone: price.isStale ? 'warning' : 'neutral',
    title: price.isStale ? 'Stale manual price' : 'Manual price — not live',
    detail: `${formatCurrency(price.pricePerShare)} per share, as of ${price.asOfDate}, from “${price.source}”. `
      + `Entered ${age}; treated as stale after ${price.staleAfterDays} days.`,
  };
}

const PRICE_FIELD_LABELS = {
  pricePerShare: 'Price per share',
  asOfDate: 'As-of date',
  source: 'Source',
  currency: 'Currency',
};

export function describeMissingData(missingData) {
  if (!Array.isArray(missingData) || missingData.length === 0) return [];
  const groups = new Map();

  for (const item of missingData) {
    const isPrice = item.scope === 'price';
    const key = isPrice ? 'price' : `${item.scope ?? 'input'}|${item.fiscalYear ?? 'unknown'}`;
    if (!groups.has(key)) {
      groups.set(key, {
        label: isPrice
          ? 'Market price'
          : `FY${item.fiscalYear ?? '—'} · ${(item.scope ?? 'input').replace('-', ' ')}`,
        fields: new Set(),
      });
    }
    const fieldLabel = isPrice
      ? PRICE_FIELD_LABELS[item.field] ?? item.field
      : item.field === 'fiscalYear'
        ? 'Annual filing'
        : FIELD_META[item.field]?.label ?? item.field;
    groups.get(key).fields.add(fieldLabel);
  }

  return [...groups.values()].map((group) => ({
    label: group.label,
    detail: [...group.fields].join(', '),
  }));
}
