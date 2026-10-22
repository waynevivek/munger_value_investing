const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createEditableFinancialFitConfig } = require('../src/financial-fit.js');

const presetUrl = pathToFileURL(path.join(__dirname, '..', 'public', 'preset.mjs')).href;

let presetModule;
let config;

test.before(async () => {
  presetModule = await import(presetUrl);
  config = createEditableFinancialFitConfig();
});

function customPreset(overrides = {}) {
  return {
    qualityChecks: [
      { id: 'profitability', floor: 10, target: 20, weight: 40 },
      { id: 'manageable-debt', floor: 2, target: 0.25, weight: 20 },
      { id: 'earnings-consistency', floor: 40, target: 80, weight: 20 },
      { id: 'cash-generation', floor: 40, target: 80, weight: 20 },
    ],
    marginOfSafetyTargetPercent: 25,
    ...overrides,
  };
}

test('derives the editable preset from the production configuration', () => {
  const preset = presetModule.presetFromConfig(config);

  assert.deepEqual(preset.qualityChecks, [
    { id: 'profitability', floor: 0, target: 15, weight: 25 },
    { id: 'manageable-debt', floor: 2, target: 0.25, weight: 25 },
    { id: 'earnings-consistency', floor: 40, target: 80, weight: 25 },
    { id: 'cash-generation', floor: 40, target: 80, weight: 25 },
  ]);
  assert.equal(preset.marginOfSafetyTargetPercent, 25);
});

test('fills missing or malformed preset fields from the defaults instead of showing blanks', () => {
  const values = presetModule.presetValues({
    qualityChecks: [
      { id: 'profitability', floor: 10, target: 'high', weight: 40 },
      { id: 'unknown', floor: 1, target: 2, weight: 3 },
    ],
    marginOfSafetyTargetPercent: Number.NaN,
  }, config);

  assert.deepEqual(values.qualityChecks.map(({ id }) => id), [
    'profitability',
    'manageable-debt',
    'earnings-consistency',
    'cash-generation',
  ]);
  assert.equal(values.qualityChecks[0].floor, 10);
  assert.equal(values.qualityChecks[0].target, 15);
  assert.equal(values.qualityChecks[0].weight, 40);
  assert.equal(values.qualityChecks[1].weight, 25);
  assert.equal(values.marginOfSafetyTargetPercent, 25);
});

test('reads preset form values as numbers and treats blank fields as invalid numbers', () => {
  const submitted = {
    'check:profitability:floor': '10',
    'check:profitability:target': '20',
    'check:profitability:weight': '40',
    'check:manageable-debt:floor': '2',
    'check:manageable-debt:target': '0.25',
    'check:manageable-debt:weight': '20',
    'check:earnings-consistency:floor': '40',
    'check:earnings-consistency:target': '80',
    'check:earnings-consistency:weight': '20',
    'check:cash-generation:floor': '40',
    'check:cash-generation:target': '80',
    'check:cash-generation:weight': '',
    marginOfSafetyTargetPercent: '30',
  };

  const preset = presetModule.presetFromGetter(config, (name) => submitted[name] ?? null);

  assert.equal(preset.qualityChecks[0].weight, 40);
  assert.equal(preset.marginOfSafetyTargetPercent, 30);
  assert.equal(Number.isNaN(preset.qualityChecks[3].weight), true);
  assert.match(presetModule.validatePreset(preset, config), /Cash generation: enter a number for the weight/);
});

test('accepts the default preset and a valid custom preset', () => {
  assert.equal(
    presetModule.validatePreset(presetModule.presetFromConfig(config), config),
    null,
  );
  assert.equal(presetModule.validatePreset(customPreset(), config), null);
});

test('rejects presets with bad weights, ordering, structure, or margin targets', () => {
  const cases = [
    [customPreset({
      qualityChecks: customPreset().qualityChecks.map((check, index) => (
        index === 0 ? { ...check, weight: 30 } : check
      )),
    }), /weights must add to 100/],
    [customPreset({
      qualityChecks: customPreset().qualityChecks.map((check, index) => (
        index === 0 ? { ...check, target: 5, floor: 10 } : check
      )),
    }), /full credit must be above zero credit/],
    [customPreset({
      qualityChecks: customPreset().qualityChecks.map((check, index) => (
        index === 1 ? { ...check, target: 3, floor: 2 } : check
      )),
    }), /full credit must be below zero credit/],
    [customPreset({
      qualityChecks: customPreset().qualityChecks.map((check, index) => (
        index === 0 ? { ...check, weight: -10 } : check
      )),
    }), /weight cannot be negative|weights must add to 100/],
    [customPreset({ marginOfSafetyTargetPercent: 0 }), /must be above 0%/],
    [customPreset({
      qualityChecks: customPreset().qualityChecks.filter((check) => check.id !== 'cash-generation'),
    }), /missing Cash generation/],
    [{ qualityChecks: 'nope' }, /missing its quality checks/],
  ];

  for (const [preset, pattern] of cases) {
    assert.match(presetModule.validatePreset(preset, config), pattern);
  }
});
