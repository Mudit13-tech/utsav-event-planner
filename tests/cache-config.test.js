import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAiConfigured, loadConfig } from '../src/config.js';
import { LruCache } from '../src/services/cache.js';

describe('LruCache', () => {
  it('returns stored values and evicts the least recently used entry', () => {
    const cache = new LruCache({ maxEntries: 2, ttlMs: 1000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now most recent
    cache.set('c', 3);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('c'), 3);
    assert.equal(cache.size, 2);
  });

  it('expires entries after the TTL', () => {
    let clock = 0;
    const cache = new LruCache({ ttlMs: 100, now: () => clock });
    cache.set('k', 'v');
    clock = 99;
    assert.equal(cache.get('k'), 'v');
    clock = 250;
    assert.equal(cache.get('k'), undefined);
    assert.equal(cache.size, 0);
  });

  it('overwrites existing keys without growing', () => {
    const cache = new LruCache({ maxEntries: 5 });
    cache.set('k', 1);
    cache.set('k', 2);
    assert.equal(cache.get('k'), 2);
    assert.equal(cache.size, 1);
  });
});

describe('loadConfig', () => {
  it('uses safe defaults', () => {
    const config = loadConfig({});
    assert.equal(config.port, 8080);
    assert.equal(config.gemini.model, 'gemini-3.5-flash-lite');
    assert.equal(config.rateLimit.max, 30);
    assert.equal(isAiConfigured(config), false);
    assert.ok(Object.isFrozen(config));
  });

  it('reads overrides and ignores invalid numbers', () => {
    const config = loadConfig({ PORT: '3000', GEMINI_MODEL: 'gemini-x', RATE_LIMIT_MAX: 'abc', GEMINI_API_KEY: 'k' });
    assert.equal(config.port, 3000);
    assert.equal(config.gemini.model, 'gemini-x');
    assert.equal(config.rateLimit.max, 30);
    assert.equal(isAiConfigured(config), true);
  });

  it('supports Vertex AI configuration', () => {
    const config = loadConfig({ GOOGLE_GENAI_USE_VERTEXAI: 'TRUE', GOOGLE_CLOUD_PROJECT: 'my-proj' });
    assert.equal(config.gemini.useVertex, true);
    assert.equal(isAiConfigured(config), true);
  });
});
