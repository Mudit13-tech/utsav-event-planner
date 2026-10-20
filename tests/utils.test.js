import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { budgetStatus, buildIcs, formToPayload, formatDate, formatMoney, icsEscape, progressPercent } from '../public/js/utils.js';
import { createPlan } from '../src/services/planner.js';
import { FIXED_NOW, validInput } from './helpers.js';

describe('frontend utils', () => {
  it('formats money with Indian grouping for INR', () => {
    assert.equal(formatMoney(150000, 'INR'), '₹1,50,000');
    assert.equal(formatMoney(1234, 'USD'), '$1,234');
  });

  it('formats ISO dates in a timezone-stable way', () => {
    assert.equal(formatDate('2027-02-14'), 'Sun, 14 Feb 2027');
  });

  it('computes checklist progress', () => {
    assert.equal(progressPercent([], {}), 0);
    assert.equal(progressPercent(['a', 'b', 'c'], { a: true, c: false }), 33);
  });

  it('tracks actual spend against plan', () => {
    const lines = [{ category: 'venue', amount: 100 }, { category: 'decor', amount: 50 }];
    assert.deepEqual(budgetStatus(lines, { venue: 120 }), { planned: 150, spent: 120, remaining: 30, overBudget: false });
    assert.equal(budgetStatus(lines, { venue: 120, decor: 40 }).overBudget, true);
  });

  it('converts form data into the API payload', () => {
    const data = new FormData();
    data.set('eventType', 'birthday');
    data.set('eventDate', '2026-12-01');
    data.set('guestCount', '40');
    data.set('budget', '60000');
    data.append('priorities', 'decor');
    data.append('priorities', 'catering');
    const payload = formToPayload(data);
    assert.equal(payload.guestCount, 40);
    assert.equal(payload.budget, 60000);
    assert.equal(payload.currency, 'INR');
    assert.equal(payload.venueType, 'undecided');
    assert.deepEqual(payload.priorities, ['decor', 'catering']);
  });

  it('escapes iCalendar text', () => {
    assert.equal(icsEscape('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  });

  it('builds a valid .ics with one event per milestone and vendor', () => {
    const plan = createPlan(validInput(), FIXED_NOW);
    const ics = buildIcs(plan, FIXED_NOW);
    const events = ics.match(/BEGIN:VEVENT/g).length;
    assert.equal(events, plan.timeline.length + plan.vendors.length);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.match(ics, /DTSTART;VALUE=DATE:20270720\r\nDTEND;VALUE=DATE:20270721/);
    assert.match(ics, /DTSTAMP:20261020T100000Z/);
  });
});
