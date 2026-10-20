/**
 * Deterministic planning engine.
 *
 * This is the "decision-making" core of Utsav: it turns the user's context
 * (event type, date, guests, budget, venue, priorities) into a budget split,
 * a lead-time-aware timeline, a vendor checklist and risk insights. It runs
 * without any AI so the app always produces a correct, explainable plan;
 * Gemini then layers personalised ideas on top (see `gemini.js`).
 */
import { BUDGET_CATEGORIES, CURRENCY_TO_INR, EVENT_TEMPLATES } from '../data/templates.js';
import { parseIsoDate, startOfUtcDay } from './validation.js';

const DAY_MS = 86_400_000;
const PRIORITY_BOOST = 1.35;

export const toIsoDate = (date) => date.toISOString().slice(0, 10);
export const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
export const daysBetween = (from, to) => Math.round((to - from) / DAY_MS);

/** Multipliers applied to budget weights depending on the venue choice. */
const VENUE_ADJUSTMENTS = Object.freeze({
  home: { venue: 0.25, decor: 1.15, logistics: 1.2 },
  restaurant: { venue: 0.6, catering: 1.1, decor: 0.8 },
  outdoor: { logistics: 1.4, decor: 1.1, contingency: 1.25 },
  community: { venue: 0.6 },
  banquet: {},
  undecided: {},
});

/**
 * Splits the total budget across categories.
 * Weights come from the event template and are adjusted for venue type,
 * guest count and the user's priorities, then normalised so that amounts
 * always add up to exactly the total budget.
 */
export function allocateBudget({ eventType, budget, guestCount, venueType = 'undecided', priorities = [] }) {
  const template = EVENT_TEMPLATES[eventType];
  const weights = { ...template.budgetWeights };

  // Outdoor events need tents, power and permissions even if the template omits them.
  if (venueType === 'outdoor' && weights.logistics === undefined) weights.logistics = 4;
  if (venueType === 'outdoor' && weights.permits === undefined) weights.permits = 2;

  for (const [category, factor] of Object.entries(VENUE_ADJUSTMENTS[venueType] ?? {})) {
    if (weights[category] !== undefined) weights[category] *= factor;
  }

  if (guestCount > 300 && weights.catering) weights.catering *= 1.1;
  if (guestCount < 25 && weights.entertainment) weights.entertainment *= 0.7;

  for (const priority of priorities) {
    if (weights[priority] !== undefined) weights[priority] *= PRIORITY_BOOST;
  }

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const lines = Object.entries(weights)
    .map(([category, weight]) => ({
      category,
      label: BUDGET_CATEGORIES[category],
      share: weight / totalWeight,
      amount: Math.floor((budget * weight) / totalWeight),
      priority: priorities.includes(category),
    }))
    .sort((a, b) => b.amount - a.amount);

  // Assign the rounding remainder to the largest line so the total is exact.
  const allocated = lines.reduce((sum, line) => sum + line.amount, 0);
  lines[0].amount += budget - allocated;

  return lines.map((line) => ({ ...line, share: Math.round(line.share * 1000) / 10 }));
}

/** Classifies the budget per guest against typical ranges for the event type. */
export function assessBudget({ eventType, budget, currency, guestCount }) {
  const { perGuestInr: range } = EVENT_TEMPLATES[eventType];
  const perGuest = budget / guestCount;
  const perGuestInr = perGuest * CURRENCY_TO_INR[currency];

  let tier = 'comfortable';
  if (perGuestInr < range.lean) tier = 'tight';
  else if (perGuestInr >= range.premium) tier = 'premium';

  // Guest count that would make the budget "comfortable" (useful advice when tight).
  const comfortableGuestCount = Math.max(1, Math.floor((budget * CURRENCY_TO_INR[currency]) / range.lean));

  return {
    perGuest: Math.round(perGuest),
    tier,
    typicalPerGuest: {
      lean: Math.round(range.lean / CURRENCY_TO_INR[currency]),
      premium: Math.round(range.premium / CURRENCY_TO_INR[currency]),
    },
    comfortableGuestCount,
  };
}

/**
 * Works out how much the ideal lead time must be compressed.
 * @returns {{ mode: string, factor: number }}
 */
export function planningMode(daysUntil, idealLeadDays) {
  if (daysUntil >= idealLeadDays * 1.5) return { mode: 'relaxed', factor: 1 };
  if (daysUntil >= idealLeadDays) return { mode: 'on-track', factor: 1 };
  const factor = Math.max(daysUntil, 0) / idealLeadDays;
  return { mode: factor >= 0.5 ? 'compressed' : 'rush', factor };
}

/** Maps an ideal "days before" offset onto the time actually available. */
const scaleOffset = (daysBefore, factor) => (daysBefore <= 0 ? daysBefore : Math.round(daysBefore * factor));

/** Builds dated timeline milestones, compressing them when time is short. */
export function buildTimeline({ eventType, eventDate, now = new Date() }) {
  const template = EVENT_TEMPLATES[eventType];
  const today = startOfUtcDay(now);
  const event = parseIsoDate(eventDate);
  const daysUntil = daysBetween(today, event);
  const { mode, factor } = planningMode(daysUntil, template.idealLeadDays);

  const items = template.milestones.map((milestone, index) => {
    const offset = scaleOffset(milestone.daysBefore, factor);
    const due = addDays(event, -offset);
    const daysFromToday = daysBetween(today, due);
    return {
      id: `timeline-${index}`,
      title: milestone.title,
      phase: milestone.phase,
      dueDate: toIsoDate(due < today ? today : due),
      // Urgent when the ideal date has already passed or it is due within 3 days.
      urgent: milestone.daysBefore > 0 && (milestone.daysBefore > daysUntil || daysFromToday <= 3),
    };
  });

  return { daysUntil, mode, idealLeadDays: template.idealLeadDays, items };
}

/** Builds the vendor checklist with booking deadlines and budget hints. */
export function buildVendorChecklist({ eventType, eventDate, venueType = 'undecided', allocation, now = new Date() }) {
  const template = EVENT_TEMPLATES[eventType];
  const today = startOfUtcDay(now);
  const event = parseIsoDate(eventDate);
  const daysUntil = daysBetween(today, event);
  const { factor } = planningMode(daysUntil, template.idealLeadDays);
  const amountFor = Object.fromEntries(allocation.map((line) => [line.category, line.amount]));

  return template.vendors
    .map((vendor) => {
      const isHomeVenue = vendor.category === 'venue' && venueType === 'home';
      const bookBy = addDays(event, -scaleOffset(vendor.bookByDays, factor));
      return {
        id: `vendor-${vendor.category}`,
        category: vendor.category,
        name: isHomeVenue ? 'Home setup (seating, tent, power backup, cleaning)' : vendor.name,
        bookBy: toIsoDate(bookBy < today ? today : bookBy),
        urgent: vendor.bookByDays > daysUntil || daysBetween(today, bookBy) <= 7,
        budgetHint: amountFor[vendor.category] ?? 0,
        questions: vendor.questions,
      };
    })
    .sort((a, b) => a.bookBy.localeCompare(b.bookBy));
}

/** Context-aware warnings and tips derived purely from the inputs. */
export function buildInsights(input, { budgetAssessment, timeline }) {
  const insights = [];
  const month = parseIsoDate(input.eventDate).getUTCMonth() + 1;

  if (budgetAssessment.tier === 'tight') {
    insights.push({
      level: 'warning',
      title: 'Budget is tight for this guest count',
      detail: `Typical spend starts around ${budgetAssessment.typicalPerGuest.lean} ${input.currency} per guest. Consider trimming the list to about ${budgetAssessment.comfortableGuestCount} guests, a home or community venue, or a buffet/potluck format.`,
    });
  } else if (budgetAssessment.tier === 'premium') {
    insights.push({
      level: 'info',
      title: 'Generous budget',
      detail: 'You have room for signature experiences — e.g. live food counters, a photo booth or a professional emcee.',
    });
  }

  if (timeline.mode === 'rush' || timeline.mode === 'compressed') {
    insights.push({
      level: 'warning',
      title: timeline.mode === 'rush' ? 'Rush planning mode' : 'Timeline is compressed',
      detail: `Ideal lead time is ~${timeline.idealLeadDays} days but you have ${timeline.daysUntil}. Book the venue and caterer first, prefer vendors with packages, and confirm availability by phone before paying deposits.`,
    });
  }

  if (input.venueType === 'outdoor') {
    const monsoon = input.currency === 'INR' && month >= 6 && month <= 9;
    insights.push({
      level: monsoon ? 'warning' : 'info',
      title: monsoon ? 'Monsoon season — plan a rain backup' : 'Outdoor venue — plan for weather',
      detail: 'Reserve a covered backup area or waterproof tent, and check power and lighting for evening hours.',
    });
  }

  if (input.guestCount >= 200 || input.eventType === 'community') {
    insights.push({
      level: 'info',
      title: 'Crowd safety',
      detail: 'Plan clear entry/exit routes, a first-aid point, drinking water and enough volunteers or security staff.',
    });
  }

  if (input.dietary) {
    insights.push({
      level: 'info',
      title: 'Dietary needs noted',
      detail: `Share "${input.dietary}" with your caterer in writing and ask for labelled dishes.`,
    });
  }

  if (input.accessibility) {
    insights.push({
      level: 'info',
      title: 'Accessibility needs noted',
      detail: `Confirm with the venue: ${input.accessibility}. Check step-free access, accessible toilets and seating near exits.`,
    });
  }

  insights.push({
    level: 'info',
    title: 'Keep a contingency buffer',
    detail: 'Hold the contingency amount back until the final week — last-minute costs are almost guaranteed.',
  });

  return insights;
}

/** Composes the complete deterministic plan. */
export function createPlan(input, now = new Date()) {
  const template = EVENT_TEMPLATES[input.eventType];
  const allocation = allocateBudget(input);
  const budgetAssessment = assessBudget(input);
  const timeline = buildTimeline({ ...input, now });
  const vendors = buildVendorChecklist({ ...input, allocation, now });
  const insights = buildInsights(input, { budgetAssessment, timeline });

  return {
    summary: {
      title: input.eventName || `${template.label}${input.city ? ` in ${input.city}` : ''}`,
      eventType: input.eventType,
      eventLabel: template.label,
      eventDate: input.eventDate,
      daysUntil: timeline.daysUntil,
      planningMode: timeline.mode,
      guestCount: input.guestCount,
      city: input.city,
      venueType: input.venueType,
    },
    budget: {
      total: input.budget,
      currency: input.currency,
      ...budgetAssessment,
      lines: allocation,
    },
    timeline: timeline.items,
    vendors,
    insights,
  };
}
