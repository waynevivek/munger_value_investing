const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const researchUrl = pathToFileURL(path.join(__dirname, '..', 'public', 'research.mjs')).href;

let researchModule;

test.before(async () => {
  researchModule = await import(researchUrl);
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('starts with an empty versioned research record', () => {
  assert.deepEqual(researchModule.emptyResearch(), {
    version: 1,
    watchlist: [],
    reviews: {},
  });
});

test('normalizes unknown or malformed saved research instead of trusting it', () => {
  assert.deepEqual(researchModule.normalizeResearch({ version: 99, watchlist: ['TCS'] }), researchModule.emptyResearch());
  assert.deepEqual(researchModule.normalizeResearch('nope'), researchModule.emptyResearch());

  const normalized = researchModule.normalizeResearch({
    version: 1,
    watchlist: ['TCS', 'TCS', '', null, 'INFY'],
    reviews: Object.fromEntries([
      ['TCS', {
        sections: {
          moat: { reviewed: true, notes: 'x'.repeat(5000) },
          management: { reviewed: 'yes', notes: 42 },
          circle: null,
        },
        updatedAt: '2026-10-22T10:00:00.000Z',
        unexpected: 'dropped',
      }],
      ['__proto__', { sections: {} }],
      ['constructor', { sections: {} }],
      ['BAD', 'not a review'],
    ]),
  });

  assert.deepEqual(normalized.watchlist, ['TCS', 'INFY']);
  assert.deepEqual(Object.keys(normalized.reviews), ['TCS']);
  assert.equal(normalized.reviews.TCS.sections.moat.reviewed, true);
  assert.equal(normalized.reviews.TCS.sections.moat.notes.length, 4000);
  assert.equal(normalized.reviews.TCS.sections.management.reviewed, false);
  assert.equal(normalized.reviews.TCS.sections.management.notes, '');
  assert.equal(normalized.reviews.TCS.sections.circle.reviewed, false);
});

test('adds and removes watchlist entries without mutating the previous record', () => {
  const initial = researchModule.emptyResearch();
  const added = researchModule.setWatchlisted(initial, 'TCS', true);
  const again = researchModule.setWatchlisted(added, 'TCS', true);
  const removed = researchModule.setWatchlisted(again, 'TCS', false);

  assert.deepEqual(initial.watchlist, []);
  assert.deepEqual(added.watchlist, ['TCS']);
  assert.deepEqual(again.watchlist, ['TCS']);
  assert.deepEqual(removed.watchlist, []);
  assert.throws(() => researchModule.setWatchlisted(initial, '', true), /non-empty string/);
});

test('saves each qualitative section with notes and an update time, separate from the score inputs', () => {
  const initial = researchModule.setWatchlisted(researchModule.emptyResearch(), 'TCS', true);
  const saved = researchModule.saveReview(initial, 'TCS', {
    moat: { reviewed: true, notes: 'Switching costs.' },
    management: { reviewed: false, notes: 'Check capital allocation.' },
    circle: { reviewed: true, notes: 'Can explain the business.' },
  }, { now: new Date('2026-10-22T12:00:00Z') });

  assert.deepEqual(saved.watchlist, ['TCS']);
  assert.equal(saved.reviews.TCS.updatedAt, '2026-10-22T12:00:00.000Z');
  assert.equal(saved.reviews.TCS.sections.moat.notes, 'Switching costs.');
  assert.equal(saved.reviews.TCS.sections.management.reviewed, false);
  assert.equal(researchModule.hasReview(saved.reviews.TCS), true);
  assert.equal(researchModule.hasReview(undefined), false);
  assert.equal(
    researchModule.hasReview({ sections: { moat: { reviewed: false, notes: '   ' } } }),
    false,
  );
  assert.deepEqual(initial.reviews, {});
});

test('round-trips research through storage without losing watchlist or review notes', () => {
  const storage = memoryStorage();
  const research = researchModule.saveReview(
    researchModule.setWatchlisted(researchModule.emptyResearch(), 'TCS', true),
    'TCS',
    { moat: { reviewed: true, notes: 'Pricing power.' } },
  );

  assert.equal(researchModule.saveResearch(storage, research), true);
  const loaded = researchModule.loadResearch(storage);

  assert.equal(loaded.error, null);
  assert.deepEqual(loaded.research.watchlist, ['TCS']);
  assert.equal(loaded.research.reviews.TCS.sections.moat.notes, 'Pricing power.');
});

test('recovers from missing, corrupt, or unsupported stored research and reports why', () => {
  const missing = researchModule.loadResearch(memoryStorage());
  assert.deepEqual(missing, { research: researchModule.emptyResearch(), error: null });

  const corruptStorage = memoryStorage({
    [researchModule.RESEARCH_STORAGE_KEY]: '{not json',
  });
  const corrupt = researchModule.loadResearch(corruptStorage);
  assert.deepEqual(corrupt.research, researchModule.emptyResearch());
  assert.match(corrupt.error, /could not be read/);
  assert.equal(corruptStorage.getItem(researchModule.RESEARCH_STORAGE_KEY), '{not json');

  const unsupported = researchModule.loadResearch(memoryStorage({
    [researchModule.RESEARCH_STORAGE_KEY]: JSON.stringify({ version: 2, watchlist: ['TCS'] }),
  }));
  assert.deepEqual(unsupported.research, researchModule.emptyResearch());
  assert.match(unsupported.error, /unsupported format/);

  const blocked = researchModule.loadResearch({
    getItem() {
      throw new Error('blocked');
    },
  });
  assert.deepEqual(blocked.research, researchModule.emptyResearch());
  assert.match(blocked.error, /refused local storage/);
});

test('exports a versioned backup and parses it back without losing watchlist or reviews', () => {
  const research = researchModule.saveReview(
    researchModule.setWatchlisted(researchModule.emptyResearch(), 'TCS', true),
    'TCS',
    {
      moat: { reviewed: true, notes: 'Pricing power.' },
      management: { reviewed: false, notes: 'Read the remuneration report.' },
      circle: { reviewed: true, notes: 'Understands the business.' },
    },
    { now: new Date('2026-10-22T12:00:00Z') },
  );

  const text = researchModule.serializeResearch(research, { now: new Date('2026-10-22T13:00:00Z') });
  const exported = JSON.parse(text);
  assert.equal(exported.format, researchModule.BACKUP_FORMAT);
  assert.equal(exported.version, 1);
  assert.equal(exported.exportedAt, '2026-10-22T13:00:00.000Z');
  assert.deepEqual(exported.watchlist, ['TCS']);
  assert.equal(exported.reviews.TCS.sections.moat.notes, 'Pricing power.');

  const result = researchModule.parseResearchBackup(text);
  assert.equal(result.error, null);
  assert.deepEqual(result.research, researchModule.normalizeResearch(research));
});

test('rejects invalid backups with a clear reason and returns no research to apply', () => {
  const validReview = {
    sections: {
      moat: { reviewed: true, notes: 'Note' },
      management: { reviewed: false, notes: '' },
      circle: { reviewed: false, notes: '' },
    },
  };
  const base = {
    format: researchModule.BACKUP_FORMAT,
    version: 1,
    watchlist: ['TCS'],
    reviews: { TCS: validReview },
  };

  const cases = [
    ['', /empty/],
    ['{', /not valid JSON/],
    ['[]', /not a research backup/],
    [JSON.stringify({ ...base, format: 'something-else' }), /not a Munger Screener research backup/],
    [JSON.stringify({ ...base, version: 2 }), /supports version 1/],
    [JSON.stringify({ ...base, watchlist: 'TCS' }), /watchlist must be a list/],
    [JSON.stringify({ ...base, watchlist: [''] }), /watchlist must be a list/],
    [JSON.stringify({ ...base, reviews: [] }), /reviews must be an object/],
    [JSON.stringify({ ...base, reviews: { TCS: { sections: null } } }), /missing its sections/],
    [JSON.stringify({
      ...base,
      reviews: { TCS: { sections: { ...validReview.sections, unknown: { reviewed: true, notes: '' } } } },
    }), /unknown section/],
    [JSON.stringify({
      ...base,
      reviews: { TCS: { sections: { ...validReview.sections, moat: { reviewed: 'yes', notes: '' } } } },
    }), /must be true or false/],
    [JSON.stringify({
      ...base,
      reviews: { TCS: { sections: { ...validReview.sections, moat: { reviewed: true, notes: 42 } } } },
    }), /notes for TCS must be text/],
    [JSON.stringify({
      ...base,
      reviews: { TCS: { sections: { ...validReview.sections, moat: { reviewed: true, notes: 'x'.repeat(4001) } } } },
    }), /exceed 4000 characters/],
    [JSON.stringify({
      ...base,
      reviews: Object.fromEntries([['__proto__', validReview]]),
    }), /invalid company ID/],
  ];

  for (const [text, pattern] of cases) {
    const result = researchModule.parseResearchBackup(text);
    assert.equal(result.research, null, text.slice(0, 40));
    assert.match(result.error, pattern, text.slice(0, 40));
  }
});

test('parses a valid backup containing an empty watchlist and empty reviews', () => {
  const result = researchModule.parseResearchBackup(JSON.stringify({
    format: researchModule.BACKUP_FORMAT,
    version: 1,
    watchlist: [],
    reviews: {},
  }));

  assert.equal(result.error, null);
  assert.deepEqual(result.research, researchModule.emptyResearch());
});

test('reports a failed write instead of pretending the research was saved', () => {
  assert.equal(researchModule.saveResearch({
    setItem() {
      throw new Error('quota');
    },
  }, researchModule.emptyResearch()), false);
});
