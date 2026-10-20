import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EVENT_TYPES } from '../src/data/templates.js';
import {
  allocateBudget,
  assessBudget,
  buildInsights,
  buildTimeline,
  buildVendorChecklist,
  createPlan,
  planningMode,
} from '../src/services/planner.js';
import { FIXED_NOW, validInput } from './helpers.js';

const shareOf = (lines, category) => lines.find((l) => l.category === category)?.share ?? 0;

describe('allocateBudget', () => {
  it('always sums exactly to the total budget for every event type', () => {
    for (const eventType of EVENT_TYPES) {
      for (const budget of [1, 999, 123_457, 2_500_000]) {
        const lines = allocateBudget({ eventType, budget, guestCount: 80 });
        assert.equal(lines.reduce((s, l) => s + l.amount, 0), budget, `${eventType} ${budget}`);
        assert.ok(lines.every((l) => l.amount >= 0));
      }
    }
  });

  it('gives priority categories a larger share and flags them', () => {
    const base = allocateBudget({ eventType: 'birthday', budget: 100_000, guestCount: 50 });
    const boosted = allocateBudget({ eventType: 'birthday', budget: 100_000, guestCount: 50, priorities: ['decor'] });
    assert.ok(shareOf(boosted, 'decor') > shareOf(base, 'decor'));
    assert.equal(boosted.find((l) => l.category === 'decor').priority, true);
  });

  it('shrinks the venue share for home events', () => {
    const banquet = allocateBudget({ eventType: 'wedding', budget: 1_000_000, guestCount: 100, venueType: 'banquet' });
    const home = allocateBudget({ eventType: 'wedding', budget: 1_000_000, guestCount: 100, venueType: 'home' });
    assert.ok(shareOf(home, 'venue') < shareOf(banquet, 'venue') / 2);
  });

  it('adds logistics and permits for outdoor events that lack them', () => {
    const lines = allocateBudget({ eventType: 'birthday', budget: 50_000, guestCount: 40, venueType: 'outdoor' });
    assert.ok(shareOf(lines, 'logistics') > 0);
    assert.ok(shareOf(lines, 'permits') > 0);
  });

  it('is sorted by amount, largest first', () => {
    const lines = allocateBudget({ eventType: 'community', budget: 300_000, guestCount: 1000 });
    for (let i = 1; i < lines.length; i += 1) assert.ok(lines[i - 1].amount >= lines[i].amount);
  });
});

describe('assessBudget', () => {
  it('classifies tight, comfortable and premium budgets', () => {
    const base = { eventType: 'birthday', currency: 'INR', guestCount: 100 };
    assert.equal(assessBudget({ ...base, budget: 20_000 }).tier, 'tight');
    assert.equal(assessBudget({ ...base, budget: 100_000 }).tier, 'comfortable');
    assert.equal(assessBudget({ ...base, budget: 500_000 }).tier, 'premium');
  });

  it('converts foreign currencies before classifying', () => {
    // 100 USD * 84 = 8,400 INR for 10 guests = 840/guest → comfortable birthday
    const result = assessBudget({ eventType: 'birthday', currency: 'USD', guestCount: 10, budget: 100 });
    assert.equal(result.tier, 'comfortable');
    assert.equal(result.perGuest, 10);
  });

  it('suggests a guest count that would make the budget comfortable', () => {
    const result = assessBudget({ eventType: 'birthday', currency: 'INR', guestCount: 100, budget: 20_000 });
    assert.equal(result.comfortableGuestCount, 50);
  });
});

describe('planningMode', () => {
  it('maps available time to a planning mode', () => {
    assert.equal(planningMode(500, 270).mode, 'relaxed');
    assert.equal(planningMode(270, 270).mode, 'on-track');
    assert.equal(planningMode(200, 270).mode, 'compressed');
    assert.equal(planningMode(30, 270).mode, 'rush');
    assert.equal(planningMode(0, 270).factor, 0);
  });
});

describe('buildTimeline', () => {
  it('uses ideal lead times when there is enough time', () => {
    const timeline = buildTimeline({ eventType: 'wedding', eventDate: '2027-07-20', now: FIXED_NOW });
    assert.equal(timeline.mode, 'on-track');
    assert.equal(timeline.items[0].dueDate, '2026-10-23'); // 270 days before
    assert.equal(timeline.items.at(-1).dueDate, '2027-07-20');
  });

  it('compresses milestones in rush mode, keeps them in order and never before today', () => {
    const timeline = buildTimeline({ eventType: 'wedding', eventDate: '2026-11-19', now: FIXED_NOW });
    assert.equal(timeline.mode, 'rush');
    assert.equal(timeline.daysUntil, 30);
    const dates = timeline.items.map((i) => i.dueDate);
    assert.deepEqual([...dates].sort(), dates);
    assert.ok(dates.every((d) => d >= '2026-10-20'));
    assert.ok(timeline.items[0].urgent);
  });

  it('keeps post-event milestones after the event date', () => {
    const timeline = buildTimeline({ eventType: 'community', eventDate: '2027-03-01', now: FIXED_NOW });
    assert.equal(timeline.items.at(-1).dueDate, '2027-03-03');
    assert.equal(timeline.items.at(-1).urgent, false);
  });
});

describe('buildVendorChecklist', () => {
  const allocation = allocateBudget({ eventType: 'wedding', budget: 1_000_000, guestCount: 100 });

  it('sorts vendors by booking deadline and attaches budget hints', () => {
    const vendors = buildVendorChecklist({ eventType: 'wedding', eventDate: '2027-07-20', allocation, now: FIXED_NOW });
    assert.equal(vendors[0].category, 'venue');
    assert.ok(vendors.every((v, i) => i === 0 || vendors[i - 1].bookBy <= v.bookBy));
    assert.ok(vendors.find((v) => v.category === 'catering').budgetHint > 0);
  });

  it('renames the venue vendor for home events', () => {
    const vendors = buildVendorChecklist({ eventType: 'wedding', eventDate: '2027-07-20', venueType: 'home', allocation, now: FIXED_NOW });
    assert.match(vendors.find((v) => v.category === 'venue').name, /Home setup/);
  });

  it('marks every vendor urgent in rush mode', () => {
    const vendors = buildVendorChecklist({ eventType: 'wedding', eventDate: '2026-11-01', allocation, now: FIXED_NOW });
    assert.ok(vendors.every((v) => v.urgent));
  });
});

describe('buildInsights', () => {
  const run = (overrides) => {
    const input = validInput(overrides);
    const plan = createPlan(input, FIXED_NOW);
    return buildInsights(input, {
      budgetAssessment: plan.budget,
      timeline: { mode: plan.summary.planningMode, daysUntil: plan.summary.daysUntil, idealLeadDays: 270 },
    }).map((i) => i.title);
  };

  it('warns about tight budgets and rush timelines', () => {
    const titles = run({ budget: 50_000, eventDate: '2026-11-10' });
    assert.ok(titles.includes('Budget is tight for this guest count'));
    assert.ok(titles.includes('Rush planning mode'));
  });

  it('flags monsoon risk for outdoor Indian events in July', () => {
    assert.ok(run({ venueType: 'outdoor' }).includes('Monsoon season — plan a rain backup'));
    assert.ok(run({ venueType: 'outdoor', currency: 'USD', budget: 50_000 }).includes('Outdoor venue — plan for weather'));
  });

  it('echoes dietary and accessibility needs and always adds the contingency tip', () => {
    const titles = run({});
    assert.ok(titles.includes('Dietary needs noted'));
    assert.ok(titles.includes('Accessibility needs noted'));
    assert.ok(titles.includes('Keep a contingency buffer'));
  });
});

describe('createPlan', () => {
  it('composes summary, budget, timeline, vendors and insights', () => {
    const plan = createPlan(validInput(), FIXED_NOW);
    assert.equal(plan.summary.title, 'Aarav & Meera');
    assert.equal(plan.summary.daysUntil, 273);
    assert.equal(plan.budget.total, 1_500_000);
    assert.ok(plan.timeline.length > 5);
    assert.ok(plan.vendors.length > 3);
    assert.ok(plan.insights.length > 0);
  });

  it('builds a default title from event type and city', () => {
    const plan = createPlan(validInput({ eventName: '', eventType: 'birthday', city: 'Pune' }), FIXED_NOW);
    assert.equal(plan.summary.title, 'Birthday party in Pune');
  });
});
