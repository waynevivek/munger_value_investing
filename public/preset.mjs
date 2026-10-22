export function presetFromConfig(config) {
  return {
    qualityChecks: config.quality.checks.map(({ id, floor, target, weight }) => ({
      id,
      floor,
      target,
      weight,
    })),
    marginOfSafetyTargetPercent: config.valuation.marginOfSafetyTargetPercent,
  };
}

export function presetValues(preset, config) {
  const defaults = presetFromConfig(config);
  const overrides = new Map(
    (Array.isArray(preset?.qualityChecks) ? preset.qualityChecks : [])
      .filter((check) => check && typeof check.id === 'string')
      .map((check) => [check.id, check]),
  );

  return {
    qualityChecks: defaults.qualityChecks.map((check) => {
      const override = overrides.get(check.id);
      return {
        id: check.id,
        floor: Number.isFinite(override?.floor) ? override.floor : check.floor,
        target: Number.isFinite(override?.target) ? override.target : check.target,
        weight: Number.isFinite(override?.weight) ? override.weight : check.weight,
      };
    }),
    marginOfSafetyTargetPercent: Number.isFinite(preset?.marginOfSafetyTargetPercent)
      ? preset.marginOfSafetyTargetPercent
      : defaults.marginOfSafetyTargetPercent,
  };
}

function readNumber(getValue, name) {
  const raw = getValue(name);
  if (raw === null || raw === undefined || String(raw).trim() === '') return Number.NaN;
  return Number(raw);
}

export function presetFromGetter(config, getValue) {
  return {
    qualityChecks: config.quality.checks.map((check) => ({
      id: check.id,
      floor: readNumber(getValue, `check:${check.id}:floor`),
      target: readNumber(getValue, `check:${check.id}:target`),
      weight: readNumber(getValue, `check:${check.id}:weight`),
    })),
    marginOfSafetyTargetPercent: readNumber(getValue, 'marginOfSafetyTargetPercent'),
  };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function rounded(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validatePreset(preset, config) {
  if (!preset || !Array.isArray(preset.qualityChecks)) {
    return 'The preset is missing its quality checks.';
  }

  const defaults = new Map(config.quality.checks.map((check) => [check.id, check]));
  const seen = new Set();

  for (const entry of preset.qualityChecks) {
    if (!entry || typeof entry !== 'object') return 'Each quality check override must be a record.';
    const check = defaults.get(entry.id);
    if (!check) return `Unknown quality check “${entry.id}”.`;
    if (seen.has(entry.id)) return `${check.label} is listed more than once.`;
    seen.add(entry.id);

    for (const field of ['floor', 'target', 'weight']) {
      if (!Number.isFinite(entry[field])) {
        return `${check.label}: enter a number for the ${field === 'floor' ? 'zero-credit' : field === 'target' ? 'full-credit' : 'weight'} value.`;
      }
    }
    if (entry.weight < 0) return `${check.label}: weight cannot be negative.`;
    if (entry.floor === entry.target) {
      return `${check.label}: zero-credit and full-credit values must differ.`;
    }
    if (check.direction === 'higher-is-better' && entry.target <= entry.floor) {
      return `${check.label}: full credit must be above zero credit for a higher-is-better check.`;
    }
    if (check.direction === 'lower-is-better' && entry.target >= entry.floor) {
      return `${check.label}: full credit must be below zero credit for a lower-is-better check.`;
    }
  }

  const missing = config.quality.checks.filter((check) => !seen.has(check.id));
  if (missing.length > 0) {
    return `The preset is missing ${missing.map((check) => check.label).join(', ')}.`;
  }

  const total = sum(preset.qualityChecks.map((entry) => entry.weight));
  if (Math.abs(total - config.quality.maximumScore) > 1e-9) {
    return `Check weights must add to ${config.quality.maximumScore}; they currently add to ${rounded(total)}.`;
  }

  if (!Number.isFinite(preset.marginOfSafetyTargetPercent)) {
    return 'Enter a number for the margin-of-safety target.';
  }
  if (preset.marginOfSafetyTargetPercent <= config.valuation.marginOfSafetyFloorPercent) {
    return `The margin-of-safety target must be above ${config.valuation.marginOfSafetyFloorPercent}%.`;
  }

  return null;
}
