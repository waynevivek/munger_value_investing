export const RESEARCH_VERSION = 1;
export const RESEARCH_STORAGE_KEY = 'munger-screener:research:v1';
export const MAX_NOTES_LENGTH = 4000;

export const REVIEW_SECTIONS = Object.freeze([
  {
    id: 'moat',
    label: 'Moat',
    prompt: 'What protects this business from competition, and what would weaken that advantage?',
  },
  {
    id: 'management',
    label: 'Management and capital allocation',
    prompt: 'How has management allocated capital, and do you trust their incentives and disclosures?',
  },
  {
    id: 'circle',
    label: 'Circle of competence',
    prompt: 'Can you explain how this company earns money and why it should still be relevant in ten years?',
  },
]);

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function emptyResearch() {
  return { version: RESEARCH_VERSION, watchlist: [], reviews: {} };
}

function normalizeSection(value) {
  if (!value || typeof value !== 'object') return { reviewed: false, notes: '' };
  return {
    reviewed: value.reviewed === true,
    notes: typeof value.notes === 'string' ? value.notes.slice(0, MAX_NOTES_LENGTH) : '',
  };
}

export function normalizeResearch(value) {
  if (!value || typeof value !== 'object' || value.version !== RESEARCH_VERSION) {
    return emptyResearch();
  }

  const watchlist = [...new Set(
    (Array.isArray(value.watchlist) ? value.watchlist : [])
      .filter((companyId) => typeof companyId === 'string' && companyId.trim() !== ''),
  )];

  const reviews = {};
  if (value.reviews && typeof value.reviews === 'object' && !Array.isArray(value.reviews)) {
    for (const [companyId, review] of Object.entries(value.reviews)) {
      if (!companyId || UNSAFE_KEYS.has(companyId)) continue;
      if (!review || typeof review !== 'object') continue;
      const sections = {};
      for (const section of REVIEW_SECTIONS) {
        sections[section.id] = normalizeSection(review.sections?.[section.id]);
      }
      const updatedAt = typeof review.updatedAt === 'string'
        && !Number.isNaN(Date.parse(review.updatedAt))
        ? review.updatedAt
        : null;
      reviews[companyId] = {
        sections,
        ...(updatedAt ? { updatedAt } : {}),
      };
    }
  }

  return { version: RESEARCH_VERSION, watchlist, reviews };
}

export function setWatchlisted(research, companyId, watched) {
  if (typeof companyId !== 'string' || companyId.trim() === '') {
    throw new TypeError('companyId must be a non-empty string');
  }
  const current = normalizeResearch(research);
  const alreadyWatched = current.watchlist.includes(companyId);
  if (watched === alreadyWatched) return current;
  return {
    ...current,
    watchlist: watched
      ? [...current.watchlist, companyId]
      : current.watchlist.filter((id) => id !== companyId),
  };
}

export function saveReview(research, companyId, sections, { now = new Date() } = {}) {
  if (typeof companyId !== 'string' || companyId.trim() === '') {
    throw new TypeError('companyId must be a non-empty string');
  }
  const current = normalizeResearch(research);
  const normalizedSections = {};
  for (const section of REVIEW_SECTIONS) {
    normalizedSections[section.id] = normalizeSection(sections?.[section.id]);
  }
  return {
    ...current,
    reviews: {
      ...current.reviews,
      [companyId]: { sections: normalizedSections, updatedAt: now.toISOString() },
    },
  };
}

export function hasReview(review) {
  if (!review?.sections) return false;
  return REVIEW_SECTIONS.some((section) => {
    const entry = review.sections[section.id];
    return entry?.reviewed === true || Boolean(entry?.notes?.trim());
  });
}

export const BACKUP_FORMAT = 'munger-screener-research';

export function serializeResearch(research, { now = new Date() } = {}) {
  const normalized = normalizeResearch(research);
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: RESEARCH_VERSION,
    exportedAt: now.toISOString(),
    watchlist: normalized.watchlist,
    reviews: normalized.reviews,
  }, null, 2);
}

function backupError(message) {
  return { research: null, error: message };
}

export function parseResearchBackup(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return backupError('The selected backup is empty.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return backupError('The selected file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return backupError('The selected file is not a research backup.');
  }
  if (parsed.format !== BACKUP_FORMAT) {
    return backupError('This is not a Munger Screener research backup.');
  }
  if (parsed.version !== RESEARCH_VERSION) {
    return backupError(`This backup uses version ${parsed.version ?? 'unknown'}; this app supports version ${RESEARCH_VERSION}.`);
  }
  if (!Array.isArray(parsed.watchlist) || parsed.watchlist.some((id) => typeof id !== 'string' || id.trim() === '')) {
    return backupError('The backup\u2019s watchlist must be a list of company IDs.');
  }
  if (!parsed.reviews || typeof parsed.reviews !== 'object' || Array.isArray(parsed.reviews)) {
    return backupError('The backup\u2019s reviews must be an object keyed by company ID.');
  }

  for (const [companyId, review] of Object.entries(parsed.reviews)) {
    if (!companyId || UNSAFE_KEYS.has(companyId)) {
      return backupError(`The backup contains an invalid company ID: ${companyId}.`);
    }
    if (!review || typeof review !== 'object' || Array.isArray(review)) {
      return backupError(`The review for ${companyId} is not an object.`);
    }
    if (!review.sections || typeof review.sections !== 'object' || Array.isArray(review.sections)) {
      return backupError(`The review for ${companyId} is missing its sections.`);
    }
    for (const [sectionId, entry] of Object.entries(review.sections)) {
      if (!REVIEW_SECTIONS.some((section) => section.id === sectionId)) {
        return backupError(`The review for ${companyId} contains an unknown section: ${sectionId}.`);
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return backupError(`The ${sectionId} review for ${companyId} is not an object.`);
      }
      if (typeof entry.reviewed !== 'boolean') {
        return backupError(`The ${sectionId} reviewed flag for ${companyId} must be true or false.`);
      }
      if (typeof entry.notes !== 'string') {
        return backupError(`The ${sectionId} notes for ${companyId} must be text.`);
      }
      if (entry.notes.length > MAX_NOTES_LENGTH) {
        return backupError(`The ${sectionId} notes for ${companyId} exceed ${MAX_NOTES_LENGTH} characters.`);
      }
    }
  }

  return { research: normalizeResearch(parsed), error: null };
}

export function loadResearch(storage) {
  let raw;
  try {
    raw = storage.getItem(RESEARCH_STORAGE_KEY);
  } catch {
    return {
      research: emptyResearch(),
      error: 'This browser refused local storage, so the watchlist and reviews cannot be saved.',
    };
  }

  if (!raw) return { research: emptyResearch(), error: null };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      research: emptyResearch(),
      error: 'Saved research could not be read, so an empty watchlist and review were loaded. The unreadable value was left untouched.',
    };
  }

  if (!parsed || typeof parsed !== 'object' || parsed.version !== RESEARCH_VERSION) {
    return {
      research: emptyResearch(),
      error: 'Saved research uses an unsupported format, so it was not loaded. The saved value was left untouched.',
    };
  }

  return { research: normalizeResearch(parsed), error: null };
}

export function saveResearch(storage, research) {
  try {
    storage.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(normalizeResearch(research)));
    return true;
  } catch {
    return false;
  }
}
