/**
 * Safe wrapper around localStorage. Storage can throw (private mode, quota,
 * blocked cookies), so every access is guarded and the app keeps working.
 */
const KEY = 'utsav:v2';

const emptyState = () => ({ input: null, plan: null, ideas: null, checks: {}, actuals: {}, chat: [] });

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Persistence is a convenience; ignore failures.
  }
}
