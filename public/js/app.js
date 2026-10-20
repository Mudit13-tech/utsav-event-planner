/**
 * Application controller: wires the form, plan rendering, checklists,
 * budget tracking, calendar export and the Gemini assistant.
 */
import { askAssistant, createPlan, getHealth, getIdeas } from './api.js';
import { renderBudget, renderChat, renderIdeas, renderSummary, renderTimeline, renderVendors } from './render.js';
import { loadState, saveState } from './storage.js';
import { initTabs } from './tabs.js';
import { buildIcs, formToPayload, formatDate, formatMoney, todayIso } from './utils.js';

const $ = (selector) => document.querySelector(selector);
const MAX_PRIORITIES = 3;
const CHAT_HISTORY_SENT = 8;

const state = loadState();
const form = $('#event-form');
const results = $('#results');
const tabs = initTabs($('.tabs'));

function announce(message) {
  const region = $('#announcer');
  region.textContent = '';
  // Small delay so repeated identical messages are still announced.
  setTimeout(() => (region.textContent = message), 50);
}

function showError(message) {
  const banner = $('#error-banner');
  banner.textContent = message;
  banner.hidden = !message;
}

/* ---------- Form validation (native constraints + ARIA sync) ---------- */

const syncAriaInvalid = (field) => {
  if (!field.matches?.('input, select, textarea')) return;
  if (field.matches(':user-invalid')) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
};

form.addEventListener('focusout', (event) => syncAriaInvalid(event.target));
form.addEventListener('input', (event) => {
  if (event.target.getAttribute('aria-invalid') === 'true') syncAriaInvalid(event.target);
});

const priorityBoxes = [...form.querySelectorAll('input[name="priorities"]')];
form.addEventListener('change', (event) => {
  if (event.target.name !== 'priorities') return;
  const checked = priorityBoxes.filter((box) => box.checked).length;
  $('#priorities-error').hidden = checked <= MAX_PRIORITIES;
  // Prevent selecting a 4th priority, but keep boxes focusable.
  if (checked > MAX_PRIORITIES) {
    event.target.checked = false;
    $('#priorities-error').hidden = false;
    announce('You can choose at most 3 priorities.');
  }
});

/* ---------- Live preview ---------- */

const PRIORITY_LABELS = Object.freeze({
  catering: 'Food',
  decor: 'Decor',
  photography: 'Photo',
  entertainment: 'Entertainment',
  venue: 'Venue',
  attire: 'Attire',
});

/** Mirrors the form into the preview card as the user types (no network). */
function updatePreview() {
  const input = formToPayload(new FormData(form));
  const typeLabel = form.querySelector('input[name="eventType"]:checked')?.closest('label').textContent.trim();
  const setText = (id, text) => ($(`#${id}`).textContent = text);

  setText('pv-type', typeLabel || '—');
  if (input.eventDate && input.eventDate >= todayIso()) {
    const days = Math.round((new Date(`${input.eventDate}T00:00:00Z`) - new Date(`${todayIso()}T00:00:00Z`)) / 86_400_000);
    setText('pv-date', `${formatDate(input.eventDate)} · ${days} days`);
  } else {
    setText('pv-date', 'Not set');
  }
  const guestsOk = Number.isInteger(input.guestCount) && input.guestCount > 0;
  setText('pv-guests', guestsOk ? String(input.guestCount) : '—');
  setText('pv-per-guest', guestsOk && input.budget > 0 ? formatMoney(Math.round(input.budget / input.guestCount), input.currency) : '—');
  setText('pv-priorities', input.priorities.map((p) => PRIORITY_LABELS[p]).join(', ') || 'None yet');
}

form.addEventListener('input', updatePreview);
form.addEventListener('change', updatePreview);

function fillForm(input) {
  for (const [key, value] of Object.entries(input)) {
    if (key === 'priorities') {
      for (const box of priorityBoxes) box.checked = value.includes(box.value);
    } else if (key === 'eventType') {
      const radio = form.querySelector(`input[name="eventType"][value="${CSS.escape(value)}"]`);
      if (radio) radio.checked = true;
    } else if (form.elements[key]) {
      form.elements[key].value = value ?? '';
    }
  }
  updatePreview();
}

/* ---------- Plan rendering & persistence ---------- */

const persist = () => saveState(state);

function renderIdeasResult() {
  renderSummary(results, state.plan, state.ideas);
  renderIdeas($('#panel-ideas'), state.plan, state.ideas);
}

/** Fetches Gemini ideas after the instant plan; ignores stale responses. */
let ideasRequest = 0;
async function loadIdeas(input) {
  const requestId = ++ideasRequest;
  try {
    const result = await getIdeas(input);
    if (requestId !== ideasRequest) return;
    state.ideas = result;
    persist();
    renderIdeasResult();
    announce(result.aiSource === 'gemini' ? 'Personalised ideas from Gemini are ready.' : 'Ideas are ready.');
  } catch (error) {
    if (requestId !== ideasRequest) return;
    $('#panel-ideas').setAttribute('aria-busy', 'false');
    showError(`Could not load ideas: ${error.message}`);
  }
}

function renderPlan(plan, { focus = true } = {}) {
  renderSummary(results, plan, state.ideas);
  renderIdeas($('#panel-ideas'), plan, state.ideas);
  renderBudget($('#panel-budget'), plan, state.actuals, (category, amount) => {
    if (amount === undefined) delete state.actuals[category];
    else state.actuals[category] = amount;
    persist();
  });
  const onToggle = (id, done) => {
    state.checks[id] = done;
    persist();
  };
  renderTimeline($('#panel-timeline'), plan, state.checks, onToggle);
  renderVendors($('#panel-vendors'), plan, state.checks, onToggle);
  renderChat($('#chat-log'), state.chat);

  results.hidden = false;
  $('#nav-results').hidden = false;
  tabs.select('tab-ideas', { focus: false });
  if (focus) {
    $('#results-title').focus();
    document.title = `${plan.summary.title} | Utsav`;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');
  if (!form.checkValidity()) {
    for (const field of form.elements) syncAriaInvalid(field);
    // Fieldsets also match :invalid, so target the first invalid control itself.
    form.querySelector('input:invalid, select:invalid, textarea:invalid')?.focus();
    announce('Please fix the highlighted fields.');
    return;
  }

  const input = formToPayload(new FormData(form));
  const button = $('#submit-btn');
  const buttonLabel = button.querySelector('.btn-label');
  button.disabled = true;
  buttonLabel.textContent = 'Building your plan…';
  form.setAttribute('aria-busy', 'true');

  try {
    const plan = await createPlan(input);
    const isNewEvent = JSON.stringify(state.input) !== JSON.stringify(input);
    Object.assign(state, { input, plan, ideas: null }, isNewEvent ? { checks: {}, actuals: {}, chat: [] } : {});
    persist();
    renderPlan(plan);
    announce('Your plan is ready. Personalised ideas are loading.');
    loadIdeas(input);
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
    buttonLabel.textContent = 'Create my plan';
    form.removeAttribute('aria-busy');
  }
});

$('#sample-btn').addEventListener('click', () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 5);
  fillForm({
    eventType: 'wedding',
    eventName: 'Aarav & Meera’s Wedding',
    eventDate: todayIso(date),
    city: 'Jaipur',
    venueType: 'outdoor',
    guestCount: 250,
    budget: 1500000,
    currency: 'INR',
    theme: 'Royal Rajasthani with marigold and mirror work',
    priorities: ['catering', 'decor', 'photography'],
    dietary: 'Mostly vegetarian, some Jain guests',
    accessibility: 'Several elderly grandparents, one wheelchair user',
    notes: 'Mehendi, sangeet and wedding on consecutive days',
  });
  announce('Sample wedding details filled in. Creating the plan.');
  form.requestSubmit();
});

$('#edit-btn').addEventListener('click', () => {
  $('#planner').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  form.elements.eventName.focus({ preventScroll: true });
});

$('#print-btn').addEventListener('click', () => window.print());

$('#ics-btn').addEventListener('click', () => {
  if (!state.plan) return;
  const blob = new Blob([buildIcs(state.plan)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: 'utsav-plan.ics' });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Calendar file downloaded.');
});

/* ---------- Assistant ---------- */

const chatForm = $('#chat-form');
const chatInput = $('#chat-input');

async function sendChat(message) {
  if (!state.input || !message) return;
  const history = state.chat.slice(-CHAT_HISTORY_SENT);
  state.chat.push({ role: 'user', text: message });
  renderChat($('#chat-log'), state.chat);
  chatInput.value = '';
  const send = $('#chat-send');
  const typing = $('#chat-typing');
  send.disabled = true;
  typing.hidden = false;

  try {
    const { reply } = await askAssistant(state.input, message, history);
    state.chat.push({ role: 'model', text: reply });
  } catch (error) {
    state.chat.push({ role: 'model', text: `Sorry — ${error.message}` });
  } finally {
    send.disabled = false;
    typing.hidden = true;
    persist();
    renderChat($('#chat-log'), state.chat);
  }
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendChat(chatInput.value.trim());
});

chatInput.addEventListener('keydown', (event) => {
  // Enter sends, Shift+Enter adds a newline; never interrupt IME composition.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

$('#suggestions').addEventListener('click', (event) => {
  const chip = event.target.closest('button');
  if (chip && !$('#chat-send').disabled) sendChat(chip.textContent.trim());
});

/* ---------- Boot ---------- */

form.elements.eventDate.min = todayIso();

const setStatus = (text, variant) => {
  const pill = $('#ai-status');
  pill.querySelector('.status-text').textContent = text;
  pill.classList.toggle('is-live', variant === 'live');
  pill.classList.toggle('is-offline', variant === 'offline');
};

getHealth()
  .then(({ ai }) => (ai === 'gemini' ? setStatus('Gemini live', 'live') : setStatus('Smart planner mode', 'offline')))
  .catch(() => setStatus('Server unreachable', 'offline'));

updatePreview();

if (state.input && state.plan) {
  fillForm(state.input);
  renderPlan(state.plan, { focus: false });
  if (!state.ideas) loadIdeas(state.input);
}
