const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { createServer } = require('../src/server.js');
const { loadPilotDataset } = require('../src/pilot-data.js');

function elementStub() {
  return {
    innerHTML: '',
    value: '',
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

test('renders TCS, accepts a manual price, and clears it back to a no-price state', async () => {
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
    ['#screener-body', elementStub()],
    ['#screener-message', elementStub()],
    ['#company-panel', elementStub()],
  ]);
  const storage = new Map([
    ['munger-screener:manual-price:TCS', JSON.stringify({
      price: 3500,
      asOfDate: '2026-10-01',
      source: 'saved test quote',
    })],
  ]);

  let documentClickHandler = null;
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
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  global.fetch = (input, init) => realFetch(new URL(input, base), init);
  global.FormData = class {
    get(name) {
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
    assert.match(screenerBody.innerHTML, /100\/100/);
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
  } finally {
    global.fetch = realFetch;
    global.FormData = realFormData;
    delete global.window;
    delete global.document;
    delete global.localStorage;
    await new Promise((resolve) => server.close(resolve));
  }
});
