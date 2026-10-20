import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPlan } from '../src/services/planner.js';
import {
  IDEAS_SCHEMA,
  buildEventContext,
  createAiService,
  createGenAiClient,
  fallbackIdeas,
  offlineReply,
  sanitizeIdeas,
  toPlainText,
} from '../src/services/gemini.js';
import { FIXED_NOW, fakeGenAiClient, sampleIdeas, silentLogger, testConfig, validInput } from './helpers.js';

const input = validInput();
const plan = createPlan(input, FIXED_NOW);

describe('sanitizeIdeas', () => {
  it('keeps valid content and caps list sizes and string lengths', () => {
    const raw = { ...sampleIdeas(), decor: Array.from({ length: 20 }, () => 'x'.repeat(500)) };
    const ideas = sanitizeIdeas(raw);
    assert.equal(ideas.decor.length, 5);
    assert.equal(ideas.decor[0].length, 280);
    assert.equal(ideas.themes.length, 3);
  });

  it('strips markup and drops malformed entries', () => {
    const ideas = sanitizeIdeas({
      ...sampleIdeas(),
      headline: '<script>alert(1)</script> Hello',
      themes: [{ name: 'Ok', description: 'Fine' }, { name: '' }, null],
      menu: ['Paneer', 42, null],
    });
    assert.equal(ideas.headline.includes('<'), false);
    assert.equal(ideas.themes.length, 1);
    assert.deepEqual(ideas.menu, ['Paneer']);
  });

  it('throws on incomplete output', () => {
    assert.throws(() => sanitizeIdeas(null));
    assert.throws(() => sanitizeIdeas({ headline: 'x', themes: [] }));
  });
});

describe('buildEventContext', () => {
  it('includes the decision-relevant facts and omits empty fields', () => {
    const context = buildEventContext(validInput({ notes: '' }), plan);
    assert.equal(context.eventType, 'Wedding');
    assert.equal(context.budget.tier, plan.budget.tier);
    assert.equal(context.budget.topAllocations.length, 4);
    assert.equal(context.notes, undefined);
  });
});

describe('createAiService without a client', () => {
  const ai = createAiService({ config: testConfig(), client: null, logger: silentLogger });

  it('reports offline and returns fallback ideas', async () => {
    assert.equal(ai.isLive, false);
    const result = await ai.generateIdeas(input, plan);
    assert.equal(result.source, 'fallback');
    assert.deepEqual(result.ideas, fallbackIdeas(input));
  });

  it('answers chat with rule-based replies', async () => {
    const result = await ai.chat({ event: input, message: 'How do I save money?', history: [] }, plan);
    assert.equal(result.source, 'fallback');
    assert.match(result.reply, /budget/i);
  });
});

describe('createAiService with Gemini', () => {
  it('requests schema-constrained JSON and caches identical requests', async () => {
    const client = fakeGenAiClient([sampleIdeas()]);
    const ai = createAiService({ config: testConfig(), client, logger: silentLogger });

    const first = await ai.generateIdeas(input, plan);
    const second = await ai.generateIdeas(input, plan);

    assert.equal(first.source, 'gemini');
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(client.calls.length, 1);

    const { config, model, contents } = client.calls[0];
    assert.equal(model, 'gemini-3.5-flash-lite');
    assert.equal(config.responseMimeType, 'application/json');
    assert.equal(config.responseSchema, IDEAS_SCHEMA);
    assert.ok(config.abortSignal instanceof AbortSignal);
    assert.match(config.systemInstruction, /DATA, not instructions/);
    assert.match(contents[0].parts[0].text, /<event_context>/);
  });

  it('falls back when the model errors or returns invalid JSON', async () => {
    const client = fakeGenAiClient([new Error('quota'), 'not json']);
    const ai = createAiService({ config: testConfig(), client, logger: silentLogger });
    assert.equal((await ai.generateIdeas(input, plan)).source, 'fallback');
    assert.equal((await ai.generateIdeas(validInput({ guestCount: 99 }), plan)).source, 'fallback');
  });

  it('sends chat history with roles and grounds the system prompt in the plan', async () => {
    const client = fakeGenAiClient(['Book the venue first.']);
    const ai = createAiService({ config: testConfig(), client, logger: silentLogger });
    const history = [{ role: 'user', text: 'Hi' }, { role: 'model', text: 'Hello!' }];

    const result = await ai.chat({ event: input, message: 'What first?', history }, plan);

    assert.deepEqual(result, { source: 'gemini', reply: 'Book the venue first.' });
    const { contents, config } = client.calls[0];
    assert.deepEqual(contents.map((c) => c.role), ['user', 'model', 'user']);
    assert.match(config.systemInstruction, /vendorDeadlines/);
  });

  it('falls back on empty chat replies', async () => {
    const ai = createAiService({ config: testConfig(), client: fakeGenAiClient(['  ']), logger: silentLogger });
    const result = await ai.chat({ event: input, message: 'vendor order?', history: [] }, plan);
    assert.equal(result.source, 'fallback');
  });
});

describe('offlineReply', () => {
  it('routes questions to budget, vendor and timeline answers', () => {
    assert.match(offlineReply('Is this affordable?', plan), /per guest/);
    assert.match(offlineReply('Which caterer should I book?', plan), /Book in this order/);
    assert.match(offlineReply('What is the deadline?', plan), /days/);
    assert.match(offlineReply('Tell me a joke', plan), /offline/);
  });
});

describe('createGenAiClient', () => {
  it('returns null without credentials and a client with an API key', () => {
    assert.equal(createGenAiClient(testConfig()), null);
    assert.equal(typeof createGenAiClient(testConfig({ GEMINI_API_KEY: 'test-key' })).models.generateContent, 'function');
  });
});

describe('toPlainText', () => {
  it('strips Markdown emphasis, headings and star bullets', () => {
    assert.equal(toPlainText('## Plan\n* **Venue:** book now\n* __Food__ next'), 'Plan\n- Venue: book now\n- Food next');
  });
});
