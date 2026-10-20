/** Shared fixtures for the test suite. */
import { loadConfig } from '../src/config.js';

/** Fixed clock so date-based logic is deterministic. */
export const FIXED_NOW = new Date('2026-10-20T10:00:00Z');

export const validInput = (overrides = {}) => ({
  eventType: 'wedding',
  eventName: 'Aarav & Meera',
  eventDate: '2027-07-20', // 273 days after FIXED_NOW
  guestCount: 250,
  budget: 1_500_000,
  currency: 'INR',
  city: 'Jaipur',
  venueType: 'banquet',
  theme: 'Royal Rajasthani',
  priorities: ['catering', 'decor'],
  dietary: 'Jain options',
  accessibility: 'Wheelchair access',
  notes: '',
  ...overrides,
});

export const testConfig = (env = {}) => loadConfig({ RATE_LIMIT_MAX: '1000', ...env });

export const silentLogger = { warn() {}, error() {}, log() {} };

/** Fake @google/genai client returning queued responses (or throwing errors). */
export function fakeGenAiClient(responses) {
  const calls = [];
  const queue = [...responses];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        const next = queue.shift();
        if (next instanceof Error) throw next;
        return { text: typeof next === 'string' ? next : JSON.stringify(next) };
      },
    },
  };
}

export const sampleIdeas = () => ({
  headline: 'A royal, food-first Jaipur wedding.',
  themes: [
    { name: 'Rajwada Royale', description: 'Marigold, mirror work and lanterns.' },
    { name: 'Pink City Pastels', description: 'Soft pinks and terracotta.' },
    { name: 'Desert Dusk', description: 'Warm sand tones and fairy lights.' },
  ],
  decor: ['Mirror-work backdrops'],
  menu: ['Jain-friendly dal baati'],
  activities: ['Folk dance performance'],
  guestExperience: ['Ramp at the entrance'],
  budgetTips: ['Seasonal marigolds'],
  sustainability: ['Cloth banners'],
});
