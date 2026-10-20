/**
 * Strict allow-list validation for every value that reaches the planner or
 * the LLM. Unknown fields are dropped, strings are normalised and bounded,
 * and enums are checked against known values.
 */
import { CURRENCY_TO_INR, EVENT_TYPES, PRIORITY_OPTIONS, VENUE_TYPES } from '../data/templates.js';

export const LIMITS = Object.freeze({
  maxGuests: 5000,
  minBudget: 1,
  maxBudget: 1_000_000_000,
  maxDaysAhead: 3 * 365,
  maxPriorities: 3,
  maxMessage: 500,
  maxHistory: 8,
  maxHistoryText: 1500,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Trims, removes control characters and angle brackets, collapses whitespace
 * and truncates. Returns '' for non-strings.
 */
export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(CONTROL_CHARS, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Parses a YYYY-MM-DD string as a UTC date, rejecting impossible dates. */
export function parseIsoDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/** Start of "today" in UTC, so day maths are timezone-stable. */
export function startOfUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const isEnum = (list, value) => typeof value === 'string' && list.includes(value);

/**
 * Validates the event-details payload.
 * @param {unknown} input
 * @param {Date} [now]
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function validateEventInput(input, now = new Date()) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }

  const eventType = input.eventType;
  if (!isEnum(EVENT_TYPES, eventType)) {
    errors.push(`eventType must be one of: ${EVENT_TYPES.join(', ')}.`);
  }

  const eventDate = parseIsoDate(input.eventDate);
  const today = startOfUtcDay(now);
  if (!eventDate) {
    errors.push('eventDate must be a valid date in YYYY-MM-DD format.');
  } else {
    const daysAhead = Math.round((eventDate - today) / 86_400_000);
    if (daysAhead < 0) errors.push('eventDate cannot be in the past.');
    if (daysAhead > LIMITS.maxDaysAhead) errors.push('eventDate must be within the next 3 years.');
  }

  const guestCount = Number(input.guestCount);
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > LIMITS.maxGuests) {
    errors.push(`guestCount must be a whole number between 1 and ${LIMITS.maxGuests}.`);
  }

  const budget = Number(input.budget);
  if (!Number.isFinite(budget) || budget < LIMITS.minBudget || budget > LIMITS.maxBudget) {
    errors.push('budget must be a positive number.');
  }

  const currency = input.currency ?? 'INR';
  if (!isEnum(Object.keys(CURRENCY_TO_INR), currency)) {
    errors.push(`currency must be one of: ${Object.keys(CURRENCY_TO_INR).join(', ')}.`);
  }

  const venueType = input.venueType ?? 'undecided';
  if (!isEnum(VENUE_TYPES, venueType)) {
    errors.push(`venueType must be one of: ${VENUE_TYPES.join(', ')}.`);
  }

  let priorities = [];
  if (input.priorities !== undefined) {
    if (!Array.isArray(input.priorities) || !input.priorities.every((p) => isEnum(PRIORITY_OPTIONS, p))) {
      errors.push(`priorities must be a list drawn from: ${PRIORITY_OPTIONS.join(', ')}.`);
    } else {
      priorities = [...new Set(input.priorities)];
      if (priorities.length > LIMITS.maxPriorities) {
        errors.push(`Choose at most ${LIMITS.maxPriorities} priorities.`);
      }
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      eventType,
      eventName: cleanText(input.eventName, 80),
      eventDate: input.eventDate,
      guestCount,
      budget: Math.round(budget),
      currency,
      city: cleanText(input.city, 60),
      venueType,
      theme: cleanText(input.theme, 100),
      priorities,
      dietary: cleanText(input.dietary, 200),
      accessibility: cleanText(input.accessibility, 200),
      notes: cleanText(input.notes, 500),
    },
  };
}

/**
 * Validates a chat request: `{ event, message, history }`.
 * The event is re-validated so the assistant's context is always trusted data.
 */
export function validateChatInput(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Request body must be a JSON object.'] };
  }
  const eventResult = validateEventInput(input.event, now);
  if (!eventResult.ok) return eventResult;

  const message = cleanText(input.message, LIMITS.maxMessage);
  if (!message) {
    return { ok: false, errors: [`message is required (max ${LIMITS.maxMessage} characters).`] };
  }

  const rawHistory = Array.isArray(input.history) ? input.history.slice(-LIMITS.maxHistory) : [];
  const history = rawHistory
    .filter((turn) => turn && (turn.role === 'user' || turn.role === 'model'))
    .map((turn) => ({ role: turn.role, text: cleanText(turn.text, LIMITS.maxHistoryText) }))
    .filter((turn) => turn.text);

  return { ok: true, value: { event: eventResult.value, message, history } };
}
