/**
 * Centralised, validated runtime configuration.
 * Every value comes from environment variables so that no secret is ever
 * committed to the repository (see `.env.example`).
 */

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Builds a frozen configuration object from an env-like map.
 * Accepting `env` as a parameter keeps this pure and easy to test.
 * @param {Record<string, string | undefined>} env
 */
export function loadConfig(env = process.env) {
  const useVertex = String(env.GOOGLE_GENAI_USE_VERTEXAI ?? '').toLowerCase() === 'true';

  return Object.freeze({
    port: toInt(env.PORT, 8080),
    gemini: Object.freeze({
      apiKey: env.GEMINI_API_KEY ?? '',
      model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      useVertex,
      project: env.GOOGLE_CLOUD_PROJECT ?? '',
      location: env.GOOGLE_CLOUD_LOCATION || 'us-central1',
      timeoutMs: toInt(env.GEMINI_TIMEOUT_MS, 40_000),
    }),
    rateLimit: Object.freeze({
      windowMs: toInt(env.RATE_LIMIT_WINDOW_MS, 60_000),
      max: toInt(env.RATE_LIMIT_MAX, 30),
    }),
    cache: Object.freeze({
      maxEntries: toInt(env.CACHE_MAX_ENTRIES, 200),
      ttlMs: toInt(env.CACHE_TTL_MS, 30 * 60_000),
    }),
  });
}

/** True when enough configuration exists to call Gemini. */
export const isAiConfigured = (config) =>
  Boolean(config.gemini.apiKey) || (config.gemini.useVertex && Boolean(config.gemini.project));
