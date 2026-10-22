const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createServer } = require('../src/server.js');
const { loadPilotDataset } = require('../src/pilot-data.js');

function elementStub() {
  return {
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    files: [],
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
}

async function waitFor(predicate, message, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for: ${message}`);
}

test('renders TCS with manual prices, presets, watchlist, reviews, and JSON backup', async () => {
  const companies = loadPilotDataset();
  const server = createServer({
    companies,
    now: () => new Date('2026-10-22T12:00:00Z'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const elements = new Map([
    ['#dataset-banner', elementStub()],
    ['#lookback', elementStub()],
    ['#watchlist-filter', elementStub()],
    ['#screener-head', elementStub()],
    ['#screener-body', elementStub()],
    ['#screener-message', elementStub()],
    ['#preset-panel', elementStub()],
    ['#preset-message', elementStub()],
    ['#company-panel', elementStub()],
    ['#export-research', elementStub()],
    ['#import-research', elementStub()],
    ['#backup-status', elementStub()],
  ]);
  const storage = new Map([
    ['munger-screener:manual-price:TCS', JSON.stringify({
      price: 3500,
      asOfDate: '2026-10-01',
      source: 'saved test quote',
    })],
  ]);

  let documentClickHandler = null;
  let exportedClicks = 0;
  let capturedBlob = null;
  const documentStub = {
    title: '',
    querySelector: (selector) => elements.get(selector) ?? null,
    addEventListener: (type, handler) => {
      if (type === 'click') documentClickHandler = handler;
    },
    createElement: () => ({
      className: '',
      id: '',
      setAttribute() {},
      textContent: '',
      before() {},
      click() { exportedClicks += 1; },
      remove() {},
    }),
  };

  const realFetch = global.fetch;
  const realFormData = global.FormData;
  global.window = {
    location: { search: '?company=TCS', href: `${base}/?company=TCS` },
    history: { replaceState() {} },
  };
  global.document = documentStub;
  global.localStorage = {
    get length() { return storage.size; },
    key: (index) => [...storage.keys()][index] ?? null,
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const presetFormValues = {
    'check:profitability:floor': '90',
    'check:profitability:target': '100',
    'check:profitability:weight': '40',
    'check:manageable-debt:floor': '2',
    'check:manageable-debt:target': '0.25',
    'check:manageable-debt:weight': '20',
    'check:earnings-consistency:floor': '40',
    'check:earnings-consistency:target': '80',
    'check:earnings-consistency:weight': '20',
    'check:cash-generation:floor': '40',
    'check:cash-generation:target': '80',
    'check:cash-generation:weight': '20',
    marginOfSafetyTargetPercent: '50',
  };

  const reviewFormValues = {
    'reviewed:moat': 'on',
    'notes:moat': 'Pricing power from switching costs.',
    'reviewed:management': null,
    'notes:management': '',
    'reviewed:circle': 'on',
    'notes:circle': 'Understands IT services.',
  };

  const realCreateObjectURL = URL.createObjectURL;
  const realRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => {
    capturedBlob = blob;
    return 'blob:ui-test';
  };
  URL.revokeObjectURL = () => {};

  global.fetch = (input, init) => realFetch(new URL(input, base), init);
  global.FormData = class {
    constructor(form) {
      this.form = form;
    }

    get(name) {
      if (this.form?.id === 'preset-form') return presetFormValues[name] ?? null;
      if (this.form?.id === 'review-form') return reviewFormValues[name] ?? null;
      return { price: '3500', asOfDate: '2026-10-22', source: 'ui test quote' }[name] ?? null;
    }
  };

  try {
    const appUrl = `${pathToFileURL(path.join(__dirname, '..', 'public', 'app.mjs')).href}?ui-test`;
    await import(appUrl);

    const panel = elements.get('#company-panel');
    const screenerBody = elements.get('#screener-body');

    await waitFor(
      () => panel.innerHTML.includes('₹1,210.38') && panel.innerHTML.includes('Stale manual price'),
      'the initial company render with the saved manual price',
    );

    assert.match(panel.innerHTML, /Tata Consultancy Services Limited/);
    assert.match(panel.innerHTML, /Combined score/);
    assert.match(panel.innerHTML, /50<small>\/100<\/small>/);
    assert.match(panel.innerHTML, /100<small>\/100<\/small>/);
    assert.match(panel.innerHTML, /₹744\.35/);
    assert.match(panel.innerHTML, /₹1,210\.38/);
    assert.match(panel.innerHTML, /₹1,940\.77/);
    assert.match(panel.innerHTML, /Margin of safety -189\.2%/);
    assert.match(panel.innerHTML, /Stale manual price/);
    assert.match(panel.innerHTML, /saved test quote/);
    assert.match(panel.innerHTML, /FY2026/);
    assert.match(panel.innerHTML, /data\/raw\/nse\/TCS/);
    assert.match(panel.innerHTML, /not a quality failure/);
    assert.doesNotMatch(panel.innerHTML, /undefined|NaN/);

    assert.match(screenerBody.innerHTML, /Tata Consultancy Services Limited/);
    assert.match(screenerBody.innerHTML, /50\/100/);
    assert.match(screenerBody.innerHTML, /100\/100/);
    assert.match(screenerBody.innerHTML, /Stale|stale/);
    assert.match(elements.get('#dataset-banner').innerHTML, /No automated NSE collection/);
    assert.match(elements.get('#dataset-banner').innerHTML, /Redistribution unverified/);

    const submitHandler = panel.listeners.submit;
    assert.equal(typeof submitHandler, 'function');
    await submitHandler({ target: { id: 'price-form' }, preventDefault() {} });

    await waitFor(
      () => panel.innerHTML.includes('ui test quote') && panel.innerHTML.includes('Manual price — not live'),
      'the refreshed render after submitting a fresh price',
    );
    assert.match(panel.innerHTML, /50<small>\/100<\/small>/);
    assert.match(panel.innerHTML, /₹1,210\.38/);
    assert.equal(
      JSON.parse(storage.get('munger-screener:manual-price:TCS')).source,
      'ui test quote',
    );

    assert.equal(typeof documentClickHandler, 'function');
    await documentClickHandler({
      target: {
        closest: (selector) => (selector === '#clear-price' ? {} : null),
      },
    });

    await waitFor(
      () => panel.innerHTML.includes('No market price supplied'),
      'the no-price state after clearing the saved price',
    );
    assert.equal(storage.has('munger-screener:manual-price:TCS'), false);
    assert.match(panel.innerHTML, /Quality is ready; valuation needs a price/);
    assert.match(panel.innerHTML, /100<small>\/100<\/small>/);
    assert.match(panel.innerHTML, /Enter a dated manual price to calculate LOW, BASE, and HIGH intrinsic values\./);
    assert.match(screenerBody.innerHTML, /Price needed/);

    const presetPanel = elements.get('#preset-panel');
    const presetMessage = elements.get('#preset-message');
    const screenerHead = elements.get('#screener-head');

    await waitFor(() => presetPanel.innerHTML.includes('preset-form'), 'the default preset form');
    assert.match(presetPanel.innerHTML, /default preset/);
    assert.match(presetPanel.innerHTML, /name="check:profitability:floor"[^>]*value="0"/);
    assert.match(presetPanel.innerHTML, /name="check:profitability:weight"[^>]*value="25"/);
    assert.match(presetPanel.innerHTML, /name="marginOfSafetyTargetPercent"[^>]*value="25"/);
    assert.match(presetPanel.innerHTML, /id="reset-preset" disabled/);

    assert.match(screenerHead.innerHTML, /data-sort="name"/);
    assert.match(screenerHead.innerHTML, /data-sort="combined"/);
    assert.match(screenerHead.innerHTML, /data-sort="quality"/);
    assert.match(screenerHead.innerHTML, /data-sort="valuation"/);
    assert.match(screenerHead.innerHTML, /aria-sort="descending"/);

    const presetSubmit = presetPanel.listeners.submit;
    assert.equal(typeof presetSubmit, 'function');
    await presetSubmit({ target: { id: 'preset-form' }, preventDefault() {} });

    await waitFor(
      () => panel.innerHTML.includes('60<small>/100</small>') && screenerBody.innerHTML.includes('60/100'),
      'the recalculated quality score after applying a custom preset',
    );
    assert.equal(presetMessage.textContent, '');
    assert.match(presetPanel.innerHTML, /Custom preset/);
    assert.match(elements.get('#screener-message').innerHTML, /custom preset/i);
    const savedPreset = JSON.parse(storage.get('munger-screener:preset:v1'));
    assert.equal(savedPreset.qualityChecks.find(({ id }) => id === 'profitability').weight, 40);
    assert.equal(savedPreset.marginOfSafetyTargetPercent, 50);

    await documentClickHandler({
      target: {
        closest: (selector) => (selector === '[data-sort]' ? { dataset: { sort: 'name' } } : null),
      },
    });
    assert.match(screenerHead.innerHTML, /aria-sort="ascending"/);

    await documentClickHandler({
      target: {
        closest: (selector) => (selector === '#reset-preset' ? {} : null),
      },
    });
    await waitFor(
      () => panel.innerHTML.includes('100<small>/100</small>') && !storage.has('munger-screener:preset:v1'),
      'the default quality score after resetting the preset',
    );
    assert.match(screenerBody.innerHTML, /100\/100/);
    assert.match(presetPanel.innerHTML, /default preset/);

    await waitFor(() => panel.innerHTML.includes('Your qualitative review'), 'the review form');
    assert.match(panel.innerHTML, /id="watchlist-toggle" data-company="TCS">/);
    assert.doesNotMatch(panel.innerHTML, /aria-label="On your watchlist"/);

    const watchlistFilter = elements.get('#watchlist-filter');
    assert.equal(typeof panel.listeners.change, 'function');
    panel.listeners.change({
      target: { id: 'watchlist-toggle', checked: true, dataset: { company: 'TCS' } },
    });

    await waitFor(
      () => screenerBody.innerHTML.includes('aria-label="On your watchlist"'),
      'the watchlist indicator in the screener',
    );
    assert.deepEqual(
      JSON.parse(storage.get('munger-screener:research:v1')).watchlist,
      ['TCS'],
    );

    watchlistFilter.checked = true;
    watchlistFilter.listeners.change();
    assert.match(screenerBody.innerHTML, /Tata Consultancy Services Limited/);
    assert.match(elements.get('#screener-message').innerHTML, /watchlisted companies only/i);

    const reviewSubmit = panel.listeners.submit;
    await reviewSubmit({ target: { id: 'review-form' }, preventDefault() {} });

    await waitFor(
      () => panel.innerHTML.includes('Review saved in this browser.'),
      'the saved review status',
    );
    assert.match(panel.innerHTML, /Pricing power from switching costs\./);
    assert.match(panel.innerHTML, /Understands IT services\./);
    assert.match(panel.innerHTML, /100<small>\/100<\/small>/);
    assert.match(panel.innerHTML, /never used by the financial score or valuation/);

    const savedResearch = JSON.parse(storage.get('munger-screener:research:v1'));
    assert.equal(savedResearch.reviews.TCS.sections.moat.reviewed, true);
    assert.equal(savedResearch.reviews.TCS.sections.moat.notes, 'Pricing power from switching costs.');
    assert.equal(savedResearch.reviews.TCS.sections.management.reviewed, false);
    assert.equal(savedResearch.reviews.TCS.sections.management.notes, '');
    assert.match(screenerBody.innerHTML, /review saved/);

    elements.get('#export-research').listeners.click();
    assert.equal(exportedClicks, 1);
    const exported = JSON.parse(await capturedBlob.text());
    assert.equal(exported.format, 'munger-screener-research');
    assert.equal(exported.version, 1);
    assert.deepEqual(exported.watchlist, ['TCS']);
    assert.equal(exported.reviews.TCS.sections.moat.notes, 'Pricing power from switching costs.');
    assert.match(elements.get('#backup-status').textContent, /Backup downloaded/);

    panel.listeners.change({
      target: { id: 'watchlist-toggle', checked: false, dataset: { company: 'TCS' } },
    });
    await waitFor(
      () => screenerBody.innerHTML.includes('No watchlisted companies'),
      'the empty watchlist filter state',
    );
    assert.deepEqual(
      JSON.parse(storage.get('munger-screener:research:v1')).watchlist,
      [],
    );

    watchlistFilter.checked = false;
    watchlistFilter.listeners.change();
    assert.match(screenerBody.innerHTML, /Tata Consultancy Services Limited/);
    assert.match(screenerBody.innerHTML, /review saved/);
    assert.doesNotMatch(screenerBody.innerHTML, /aria-label="On your watchlist"/);

    const importInput = elements.get('#import-research');
    const backupStatus = elements.get('#backup-status');
    importInput.files = [{ text: async () => '{' }];
    await importInput.listeners.change();

    assert.match(backupStatus.textContent, /not valid JSON/);
    assert.match(backupStatus.textContent, /left unchanged/);
    assert.equal(
      JSON.parse(storage.get('munger-screener:research:v1')).reviews.TCS.sections.moat.notes,
      'Pricing power from switching costs.',
    );

    const importedBackup = {
      format: 'munger-screener-research',
      version: 1,
      exportedAt: '2026-10-22T12:00:00.000Z',
      watchlist: ['TCS'],
      reviews: {
        TCS: {
          sections: {
            moat: { reviewed: true, notes: 'Imported note' },
            management: { reviewed: false, notes: '' },
            circle: { reviewed: true, notes: 'Imported circle' },
          },
          updatedAt: '2026-10-22T12:00:00.000Z',
        },
      },
    };
    importInput.files = [{ text: async () => JSON.stringify(importedBackup) }];
    await importInput.listeners.change();

    await waitFor(
      () => panel.innerHTML.includes('Imported note'),
      'the imported review notes',
    );
    assert.match(backupStatus.textContent, /Previous local research was replaced/);
    assert.deepEqual(
      JSON.parse(storage.get('munger-screener:research:v1')).watchlist,
      ['TCS'],
    );
    assert.doesNotMatch(panel.innerHTML, /Pricing power from switching costs\./);
    assert.match(screenerBody.innerHTML, /aria-label="On your watchlist"/);
  } finally {
    URL.createObjectURL = realCreateObjectURL;
    URL.revokeObjectURL = realRevokeObjectURL;
    global.fetch = realFetch;
    global.FormData = realFormData;
    delete global.window;
    delete global.document;
    delete global.localStorage;
    await new Promise((resolve) => server.close(resolve));
  }
});
