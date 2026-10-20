/**
 * Thin fetch client for the Utsav API with timeouts and readable errors.
 */
// Slightly above the server's Gemini timeout so the server can fall back first.
const TIMEOUT_MS = 45_000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = Array.isArray(body.details) ? ` ${body.details.join(' ')}` : '';
      throw new Error(`${body.error ?? 'Request failed'}.${details}`);
    }
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request took too long. Please try again.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const getHealth = () => request('/api/health');

export const createPlan = (event) => request('/api/plan', { method: 'POST', body: JSON.stringify(event) });

export const getIdeas = (event) => request('/api/ideas', { method: 'POST', body: JSON.stringify(event) });

export const askAssistant = (event, message, history) =>
  request('/api/chat', { method: 'POST', body: JSON.stringify({ event, message, history }) });
