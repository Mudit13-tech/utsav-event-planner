/**
 * Pure, DOM-free helpers shared by the UI. Kept side-effect free so they can
 * be unit-tested in Node (see tests/utils.test.js).
 */

/** Formats an amount in the plan currency, e.g. ₹1,50,000. */
export function formatMoney(amount, currency = 'INR') {
  const locale = currency === 'INR' ? 'en-IN' : 'en';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

/** Formats an ISO date (YYYY-MM-DD) as e.g. "Sat, 14 Feb 2027". */
export function formatDate(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayIso(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Percentage (0–100, integer) of `ids` that are checked in `checks`. */
export function progressPercent(ids, checks) {
  if (!ids.length) return 0;
  const done = ids.filter((id) => checks[id]).length;
  return Math.round((done / ids.length) * 100);
}

/** Sums the actual spend entries and compares with the planned total. */
export function budgetStatus(lines, actuals) {
  const spent = lines.reduce((sum, line) => sum + (Number(actuals[line.category]) || 0), 0);
  const planned = lines.reduce((sum, line) => sum + line.amount, 0);
  return { planned, spent, remaining: planned - spent, overBudget: spent > planned };
}

/** Converts a FormData from the event form into the API payload. */
export function formToPayload(formData) {
  const text = (key) => String(formData.get(key) ?? '').trim();
  return {
    eventType: text('eventType'),
    eventName: text('eventName'),
    eventDate: text('eventDate'),
    city: text('city'),
    venueType: text('venueType') || 'undecided',
    guestCount: Number.parseInt(text('guestCount'), 10),
    budget: Number(text('budget')),
    currency: text('currency') || 'INR',
    theme: text('theme'),
    priorities: formData.getAll('priorities').map(String),
    dietary: text('dietary'),
    accessibility: text('accessibility'),
    notes: text('notes'),
  };
}

/** Escapes text for an iCalendar TEXT value (RFC 5545 §3.3.11). */
export function icsEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const icsDate = (iso) => iso.replaceAll('-', '');
const nextDay = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/**
 * Builds an .ics calendar with one all-day event per timeline milestone and
 * vendor booking deadline.
 */
export function buildIcs(plan, now = new Date()) {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const title = plan.summary.title;
  const entries = [
    ...plan.timeline.map((item) => ({ id: item.id, date: item.dueDate, summary: `${title}: ${item.title}` })),
    ...plan.vendors.map((vendor) => ({ id: vendor.id, date: vendor.bookBy, summary: `${title}: book ${vendor.name}` })),
  ];

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Utsav//Event Planner//EN', 'CALSCALE:GREGORIAN'];
  for (const entry of entries) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${entry.id}-${icsDate(entry.date)}@utsav`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(entry.date)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(entry.date))}`,
      `SUMMARY:${icsEscape(entry.summary)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export const PLANNING_MODE_LABELS = Object.freeze({
  relaxed: 'Relaxed — plenty of time',
  'on-track': 'On track',
  compressed: 'Compressed timeline',
  rush: 'Rush mode',
});

export const BUDGET_TIER_LABELS = Object.freeze({
  tight: 'Tight budget',
  comfortable: 'Comfortable budget',
  premium: 'Premium budget',
});
