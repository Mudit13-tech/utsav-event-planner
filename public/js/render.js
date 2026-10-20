/**
 * DOM rendering. All dynamic text is set via textContent (never innerHTML),
 * so model or user content can never inject markup.
 */
import { BUDGET_TIER_LABELS, PLANNING_MODE_LABELS, budgetStatus, formatDate, formatMoney, progressPercent } from './utils.js';

/** Minimal element builder: h('p', { className: 'x' }, 'text', childNode). */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const badge = (text, variant = 'muted') => h('span', { className: `badge badge-${variant}` }, text);

const IDEAS_SOURCE_LABELS = Object.freeze({
  loading: 'Google Gemini (loading…)',
  gemini: 'Google Gemini',
  fallback: 'Built-in planner (AI offline)',
});

/**
 * @param {HTMLElement} root
 * @param {object} plan deterministic plan from /api/plan
 * @param {{ ideas: object, aiSource: string } | null} ideasResult null while Gemini is still working
 */
export function renderSummary(root, plan, ideasResult) {
  const { summary, budget } = plan;
  root.querySelector('#results-title').textContent = summary.title;
  root.querySelector('#summary-headline').textContent =
    ideasResult?.ideas.headline ?? 'Your budget, timeline and vendor checklist are ready. Gemini is adding personalised ideas…';

  const stats = [
    ['Date', `${formatDate(summary.eventDate)} · ${summary.daysUntil} days to go`],
    ['Planning mode', PLANNING_MODE_LABELS[summary.planningMode]],
    ['Guests', String(summary.guestCount)],
    ['Budget', `${formatMoney(budget.total, budget.currency)} · ${BUDGET_TIER_LABELS[budget.tier]}`],
    ['Per guest', formatMoney(budget.perGuest, budget.currency)],
    ['Ideas by', IDEAS_SOURCE_LABELS[ideasResult?.aiSource ?? 'loading']],
  ];
  root.querySelector('#summary-stats').replaceChildren(
    ...stats.map(([term, value]) => h('div', { className: 'stat' }, h('dt', {}, term), h('dd', {}, value))),
  );
}

const ideaList = (title, items) =>
  items?.length ? h('section', { className: 'idea-block' }, h('h4', {}, title), h('ul', {}, items.map((item) => h('li', {}, item)))) : null;

export function renderIdeas(panel, plan, ideasResult) {
  const { insights } = plan;
  const ideas = ideasResult?.ideas;
  panel.setAttribute('aria-busy', String(!ideas));
  panel.replaceChildren(
    h('h3', {}, 'Smart insights for your event'),
    h(
      'ul',
      { className: 'insights' },
      insights.map((insight) =>
        h(
          'li',
          { className: `insight insight-${insight.level}` },
          badge(insight.level === 'warning' ? 'Heads up' : 'Tip', insight.level === 'warning' ? 'warn' : 'info'),
          h('strong', {}, ` ${insight.title}. `),
          insight.detail,
        ),
      ),
    ),
    h('h3', {}, 'Personalised ideas'),
    ...(ideas
      ? [
          h(
            'ul',
            { className: 'theme-grid' },
            ideas.themes.map((theme) => h('li', { className: 'theme-card' }, h('h4', {}, theme.name), h('p', {}, theme.description))),
          ),
          h(
            'div',
            { className: 'idea-grid' },
            ideaList('Decor', ideas.decor),
            ideaList('Menu', ideas.menu),
            ideaList('Activities & entertainment', ideas.activities),
            ideaList('Guest experience & accessibility', ideas.guestExperience),
            ideaList('Ways to save', ideas.budgetTips),
            ideaList('Sustainability', ideas.sustainability),
          ),
        ]
      : [h('p', { className: 'loading' }, 'Gemini is crafting themes, menus and activities for your event…')]),
  );
}

export function renderBudget(panel, plan, actuals, onActualChange) {
  const { budget } = plan;
  const money = (n) => formatMoney(n, budget.currency);
  const status = h('p', { className: 'budget-status', id: 'budget-status' });

  const updateStatus = () => {
    const { planned, spent, remaining, overBudget } = budgetStatus(budget.lines, actuals);
    status.replaceChildren(
      badge(overBudget ? 'Over budget' : 'Within budget', overBudget ? 'warn' : 'ok'),
      ` Spent ${money(spent)} of ${money(planned)} — ${overBudget ? `${money(-remaining)} over` : `${money(remaining)} left`}.`,
    );
  };

  const rows = budget.lines.map((line) => {
    const bar = h('span', { className: 'bar' });
    // Scale so the largest typical share (~35%) fills most of the cell.
    bar.style.inlineSize = `${Math.min(line.share * 2.5, 100)}%`;
    const inputId = `actual-${line.category}`;
    const input = h('input', {
      id: inputId,
      type: 'number',
      inputMode: 'numeric',
      min: '0',
      step: '1',
      value: actuals[line.category] ?? '',
      className: 'actual-input',
    });
    input.addEventListener('change', () => {
      onActualChange(line.category, input.value === '' ? undefined : Math.max(0, Number(input.value)));
      updateStatus();
    });
    return h(
      'tr',
      {},
      h('th', { scope: 'row' }, line.label, line.priority ? badge('★ priority', 'info') : null),
      h('td', {}, h('span', { className: 'share' }, `${line.share}%`), bar),
      h('td', { className: 'num' }, money(line.amount)),
      h('td', {}, h('label', { htmlFor: inputId, className: 'visually-hidden' }, `Actual spend on ${line.label}`), input),
    );
  });

  panel.replaceChildren(
    h('h3', {}, 'Budget breakdown'),
    h(
      'p',
      { className: 'hint' },
      `Typical spend for this event is ${money(budget.typicalPerGuest.lean)}–${money(budget.typicalPerGuest.premium)} per guest; yours is ${money(budget.perGuest)}. Enter what you actually spend to track it.`,
    ),
    h(
      'div',
      { className: 'table-wrap' },
      h(
        'table',
        { className: 'budget-table' },
        h('caption', { className: 'visually-hidden' }, 'Planned budget by category with actual spend'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Category'), h('th', { scope: 'col' }, 'Share'), h('th', { scope: 'col' }, 'Planned'), h('th', { scope: 'col' }, 'Actual'))),
        h('tbody', {}, rows),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Total'), h('td', {}, '100%'), h('td', { className: 'num' }, money(budget.total)), h('td', {}))),
      ),
    ),
    status,
  );
  updateStatus();
}

function checklistProgress(label, ids, checks) {
  const percent = progressPercent(ids, checks);
  const id = `progress-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return h(
    'div',
    { className: 'progress-row' },
    h('label', { htmlFor: id }, `${label}: ${percent}% done`),
    h('progress', { id, max: 100, value: percent }, `${percent}%`),
  );
}

function renderChecklist(panel, { title, label, items, checks, onToggle, renderItem }) {
  const ids = items.map((item) => item.id);
  let progress = checklistProgress(label, ids, checks);

  const list = h(
    'ul',
    { className: 'checklist', role: 'list' },
    items.map((item) => {
      const checkbox = h('input', { type: 'checkbox', id: `chk-${item.id}`, checked: Boolean(checks[item.id]) });
      checkbox.addEventListener('change', () => {
        onToggle(item.id, checkbox.checked);
        const next = checklistProgress(label, ids, checks);
        progress.replaceWith(next);
        progress = next;
      });
      return h('li', { className: `check-item${item.urgent ? ' is-urgent' : ''}` }, checkbox, renderItem(item));
    }),
  );
  panel.replaceChildren(h('h3', {}, title), progress, list);
}

export function renderTimeline(panel, plan, checks, onToggle) {
  renderChecklist(panel, {
    title: 'Timeline & milestones',
    label: 'Timeline',
    items: plan.timeline,
    checks,
    onToggle,
    renderItem: (item) =>
      h(
        'div',
        { className: 'check-body' },
        h('label', { htmlFor: `chk-${item.id}`, className: 'check-title' }, item.title),
        h('p', { className: 'meta' }, h('time', { datetime: item.dueDate }, formatDate(item.dueDate)), ` · ${item.phase} `, item.urgent ? badge('Urgent', 'warn') : null),
      ),
  });
}

export function renderVendors(panel, plan, checks, onToggle) {
  const money = (n) => formatMoney(n, plan.budget.currency);
  renderChecklist(panel, {
    title: 'Vendor checklist',
    label: 'Vendors booked',
    items: plan.vendors,
    checks,
    onToggle,
    renderItem: (vendor) =>
      h(
        'div',
        { className: 'check-body' },
        h('label', { htmlFor: `chk-${vendor.id}`, className: 'check-title' }, `Booked: ${vendor.name}`),
        h(
          'p',
          { className: 'meta' },
          'Book by ',
          h('time', { datetime: vendor.bookBy }, formatDate(vendor.bookBy)),
          vendor.budgetHint ? ` · Budget ~${money(vendor.budgetHint)} ` : ' ',
          vendor.urgent ? badge('Book now', 'warn') : null,
        ),
        h('details', {}, h('summary', {}, 'Questions to ask'), h('ol', {}, vendor.questions.map((q) => h('li', {}, q)))),
      ),
  });
}

export function renderChat(log, messages) {
  log.replaceChildren(
    ...messages.map((msg) =>
      h('li', { className: `chat-msg chat-${msg.role}` }, h('span', { className: 'chat-who' }, msg.role === 'user' ? 'You' : 'Utsav'), h('p', {}, msg.text)),
    ),
  );
  log.lastElementChild?.scrollIntoView({ block: 'nearest' });
}
