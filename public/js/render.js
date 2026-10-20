/**
 * DOM rendering. All dynamic text is set via textContent (never innerHTML),
 * so model or user content can never inject markup.
 */
import {
  BUDGET_TIER_LABELS,
  PLANNING_MODE_LABELS,
  budgetStatus,
  chartSegments,
  formatDate,
  formatMoney,
  groupByPhase,
  progressPercent,
} from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

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

/** Decorative icon from the inline sprite in index.html. */
export function icon(name, className = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

const badge = (text, variant, iconName) =>
  h('span', { className: `badge badge-${variant}` }, iconName ? icon(iconName) : null, text);

const subhead = (iconName, text) => h('h3', { className: 'subhead' }, icon(iconName), text);

const IDEAS_SOURCE_LABELS = Object.freeze({
  loading: 'Gemini is thinking…',
  gemini: 'Google Gemini',
  fallback: 'Built-in planner',
});

const VENUE_LABELS = Object.freeze({
  undecided: 'Venue not decided',
  home: 'At home',
  banquet: 'Banquet hall',
  outdoor: 'Outdoor venue',
  restaurant: 'Restaurant',
  community: 'Community hall',
});

const VENDOR_ICONS = Object.freeze({
  venue: 'store',
  catering: 'utensils',
  photography: 'sparkle',
  decor: 'palette',
  entertainment: 'music',
  attire: 'heart',
  invitations: 'chat',
  logistics: 'route',
  permits: 'info',
});

/**
 * @param {HTMLElement} root
 * @param {object} plan deterministic plan from /api/plan
 * @param {{ ideas: object, aiSource: string } | null} ideasResult null while Gemini is still working
 */
export function renderSummary(root, plan, ideasResult) {
  const { summary, budget } = plan;
  const money = (n) => formatMoney(n, budget.currency);

  root.querySelector('#results-eyebrow').textContent = [summary.eventLabel, summary.city].filter(Boolean).join(' · ');
  root.querySelector('#results-title').textContent = summary.title;
  root.querySelector('#summary-headline').textContent =
    ideasResult?.ideas.headline ?? 'Your budget, timeline and vendor checklist are ready. Gemini is adding personalised ideas…';

  const kpis = [
    ['calendar', 'Date', formatDate(summary.eventDate), `${summary.daysUntil} days to go`],
    ['clock', 'Planning mode', PLANNING_MODE_LABELS[summary.planningMode], null],
    ['people', 'Guests', String(summary.guestCount), VENUE_LABELS[summary.venueType]],
    ['wallet', 'Budget', money(budget.total), BUDGET_TIER_LABELS[budget.tier]],
    ['coins', 'Per guest', money(budget.perGuest), `Typical ${money(budget.typicalPerGuest.lean)}–${money(budget.typicalPerGuest.premium)}`],
    ['sparkle', 'Ideas by', IDEAS_SOURCE_LABELS[ideasResult?.aiSource ?? 'loading'], null],
  ];
  root.querySelector('#summary-stats').replaceChildren(
    ...kpis.map(([iconName, term, value, sub]) =>
      h('div', { className: 'kpi' }, h('dt', {}, icon(iconName), term), h('dd', {}, value, sub ? h('span', { className: 'kpi-sub' }, sub) : null)),
    ),
  );
}

const IDEA_SECTIONS = Object.freeze([
  ['decor', 'Decor', 'palette'],
  ['menu', 'Menu', 'utensils'],
  ['activities', 'Activities & entertainment', 'music'],
  ['guestExperience', 'Guest experience & accessibility', 'accessible'],
  ['budgetTips', 'Ways to save', 'coins'],
  ['sustainability', 'Sustainability', 'leaf'],
]);

function renderIdeaContent(ideas) {
  if (!ideas) {
    return [
      h('p', { className: 'loading-note' }, icon('sparkle'), 'Gemini is crafting themes, menus and activities for your event…'),
      h('div', { className: 'skeleton-grid', 'aria-hidden': 'true' }, [1, 2, 3].map(() => h('div', { className: 'skeleton' }))),
    ];
  }
  return [
    h(
      'ul',
      { className: 'theme-grid' },
      ideas.themes.map((theme, index) =>
        h(
          'li',
          { className: 'theme-card' },
          h('span', { className: 'theme-num', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')),
          h('h4', {}, theme.name),
          h('p', {}, theme.description),
        ),
      ),
    ),
    h(
      'div',
      { className: 'idea-grid' },
      IDEA_SECTIONS.filter(([key]) => ideas[key]?.length).map(([key, title, iconName]) =>
        h('section', { className: 'idea-block' }, h('h4', {}, icon(iconName), title), h('ul', {}, ideas[key].map((item) => h('li', {}, item)))),
      ),
    ),
  ];
}

export function renderIdeas(panel, plan, ideasResult) {
  const ideas = ideasResult?.ideas;
  panel.setAttribute('aria-busy', String(!ideas));
  panel.replaceChildren(
    h('div', { className: 'panel-head' }, h('h3', {}, 'Smart insights'), h('p', { className: 'hint' }, 'Decisions Utsav made from your details')),
    h(
      'ul',
      { className: 'insights' },
      plan.insights.map((insight) => {
        const warning = insight.level === 'warning';
        return h(
          'li',
          { className: `insight${warning ? ' insight-warning' : ''}` },
          h('span', { className: 'insight-icon' }, icon(warning ? 'alert' : 'info')),
          h('div', {}, h('strong', {}, warning ? `Heads up: ${insight.title}` : insight.title), h('p', {}, insight.detail)),
        );
      }),
    ),
    subhead('bulb', 'Personalised ideas'),
    ...renderIdeaContent(ideas),
  );
}

/** Part-to-whole stacked bar with legend and hover/focus tooltip. */
function budgetChart(lines, total, money) {
  const segments = chartSegments(lines, 5);
  const tooltip = h('div', { className: 'chart-tooltip', 'aria-hidden': 'true', hidden: true });
  const bar = h('div', { className: 'stack-bar' });

  for (const seg of segments) {
    const label = `${seg.label}: ${seg.share}% · ${money(seg.amount)}`;
    const el = h('div', { className: `stack-seg ${seg.slot}`, role: 'img', tabIndex: 0, 'aria-label': label });
    el.style.flexGrow = String(seg.amount);
    el.style.flexBasis = '0';
    const show = () => {
      tooltip.textContent = label;
      tooltip.hidden = false;
      tooltip.style.insetInlineStart = `${el.offsetLeft + el.offsetWidth / 2}px`;
    };
    const hide = () => (tooltip.hidden = true);
    el.addEventListener('pointerenter', show);
    el.addEventListener('focus', show);
    el.addEventListener('pointerleave', hide);
    el.addEventListener('blur', hide);
    bar.append(el);
  }

  const legend = h(
    'ul',
    { className: 'legend' },
    segments.map((seg) =>
      h(
        'li',
        {},
        h('span', { className: `swatch ${seg.slot}`, 'aria-hidden': 'true' }),
        h('span', {}, seg.label),
        h('span', { className: 'legend-value' }, `${seg.share}%`),
      ),
    ),
  );

  return h('figure', { className: 'chart' }, h('figcaption', {}, `Where ${money(total)} goes`), tooltip, bar, legend);
}

export function renderBudget(panel, plan, actuals, onActualChange) {
  const { budget } = plan;
  const money = (n) => formatMoney(n, budget.currency);
  const status = h('p', { className: 'budget-status', id: 'budget-status' });
  const slotFor = Object.fromEntries(chartSegments(budget.lines, 5).flatMap((s) => s.categories.map((c) => [c, s.slot])));

  const updateStatus = () => {
    const { planned, spent, remaining, overBudget } = budgetStatus(budget.lines, actuals);
    status.replaceChildren(
      overBudget ? badge('Over budget', 'warn', 'alert') : badge('Within budget', 'ok', 'check'),
      ` Spent ${money(spent)} of ${money(planned)} — ${overBudget ? `${money(-remaining)} over` : `${money(remaining)} left`}.`,
    );
  };

  const rows = budget.lines.map((line) => {
    const inputId = `actual-${line.category}`;
    const input = h('input', {
      id: inputId,
      type: 'number',
      inputMode: 'numeric',
      min: '0',
      step: '1',
      placeholder: '0',
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
      h(
        'th',
        { scope: 'row' },
        h('span', { className: `swatch ${slotFor[line.category]}`, 'aria-hidden': 'true' }),
        line.label,
        line.priority ? badge('Priority', 'brand', 'heart') : null,
      ),
      h('td', { className: 'num' }, `${line.share}%`),
      h('td', { className: 'num' }, money(line.amount)),
      h('td', {}, h('label', { htmlFor: inputId, className: 'visually-hidden' }, `Actual spend on ${line.label}`), input),
    );
  });

  panel.replaceChildren(
    h('div', { className: 'panel-head' }, h('h3', {}, 'Budget breakdown'), h('p', { className: 'hint' }, `${BUDGET_TIER_LABELS[budget.tier]} for this event type`)),
    h(
      'dl',
      { className: 'budget-overview' },
      h('div', { className: 'metric' }, h('dt', {}, 'Total budget'), h('dd', {}, money(budget.total))),
      h('div', { className: 'metric' }, h('dt', {}, 'Per guest'), h('dd', {}, money(budget.perGuest))),
      h('div', { className: 'metric' }, h('dt', {}, 'Typical per guest'), h('dd', {}, `${money(budget.typicalPerGuest.lean)}–${money(budget.typicalPerGuest.premium)}`)),
    ),
    budgetChart(budget.lines, budget.total, money),
    h('p', { className: 'hint' }, 'Log what you actually spend to track your budget. Values are saved in this browser.'),
    h(
      'div',
      { className: 'table-wrap' },
      h(
        'table',
        { className: 'budget-table' },
        h('caption', { className: 'visually-hidden' }, 'Planned budget by category with actual spend'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Category'), h('th', { scope: 'col' }, 'Share'), h('th', { scope: 'col' }, 'Planned'), h('th', { scope: 'col' }, 'Actual'))),
        h('tbody', {}, rows),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Total'), h('td', { className: 'num' }, '100%'), h('td', { className: 'num' }, money(budget.total)), h('td', {}))),
      ),
    ),
    status,
  );
  updateStatus();
}

function checklistProgress(label, ids, checks) {
  const percent = progressPercent(ids, checks);
  const done = ids.filter((id) => checks[id]).length;
  const id = `progress-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return h(
    'div',
    { className: 'progress-row' },
    h('label', { htmlFor: id }, `${label}: ${done} of ${ids.length} done`),
    h('progress', { id, max: 100, value: percent }, `${percent}%`),
  );
}

/** Shared checkbox wiring: persists the toggle and refreshes the progress bar. */
function makeChecklist({ label, items, checks, onToggle }) {
  const ids = items.map((item) => item.id);
  const holder = { progress: checklistProgress(label, ids, checks) };
  const checkbox = (item) => {
    const box = h('input', { type: 'checkbox', className: 'check', id: `chk-${item.id}`, checked: Boolean(checks[item.id]) });
    box.addEventListener('change', () => {
      onToggle(item.id, box.checked);
      const next = checklistProgress(label, ids, checks);
      holder.progress.replaceWith(next);
      holder.progress = next;
    });
    return box;
  };
  return { holder, checkbox };
}

export function renderTimeline(panel, plan, checks, onToggle) {
  const { holder, checkbox } = makeChecklist({ label: 'Milestones', items: plan.timeline, checks, onToggle });

  const phases = groupByPhase(plan.timeline).map(({ phase, items }) =>
    h(
      'section',
      { className: 'phase' },
      h('h4', {}, phase),
      h(
        'ul',
        { className: 'tl', role: 'list' },
        items.map((item) =>
          h(
            'li',
            { className: `tl-item${item.urgent ? ' is-urgent' : ''}` },
            checkbox(item),
            h(
              'div',
              { className: 'tl-card' },
              h('label', { htmlFor: `chk-${item.id}`, className: 'check-title' }, item.title),
              h(
                'p',
                { className: 'meta' },
                h('span', {}, icon('calendar'), h('time', { dateTime: item.dueDate }, formatDate(item.dueDate))),
                item.urgent ? badge('Urgent', 'warn', 'alert') : null,
              ),
            ),
          ),
        ),
      ),
    ),
  );

  panel.replaceChildren(
    h('div', { className: 'panel-head' }, h('h3', {}, 'Timeline & milestones'), h('p', { className: 'hint' }, PLANNING_MODE_LABELS[plan.summary.planningMode])),
    holder.progress,
    ...phases,
  );
}

export function renderVendors(panel, plan, checks, onToggle) {
  const money = (n) => formatMoney(n, plan.budget.currency);
  const { holder, checkbox } = makeChecklist({ label: 'Vendors booked', items: plan.vendors, checks, onToggle });

  const cards = plan.vendors.map((vendor) =>
    h(
      'li',
      { className: `vendor-card${vendor.urgent ? ' is-urgent' : ''}` },
      h(
        'div',
        { className: 'vendor-head' },
        h('span', { className: 'vendor-icon' }, icon(VENDOR_ICONS[vendor.category] ?? 'store')),
        h(
          'div',
          { className: 'vendor-body' },
          h('label', { htmlFor: `chk-${vendor.id}`, className: 'check-title' }, vendor.name),
          h(
            'p',
            { className: 'meta' },
            h('span', {}, icon('clock'), 'Book by ', h('time', { dateTime: vendor.bookBy }, formatDate(vendor.bookBy))),
            vendor.budgetHint ? h('span', {}, icon('wallet'), `~${money(vendor.budgetHint)}`) : null,
          ),
        ),
        checkbox(vendor),
      ),
      vendor.urgent ? h('p', { className: 'meta' }, badge('Book now', 'warn', 'alert')) : null,
      h('details', {}, h('summary', {}, 'Questions to ask'), h('ol', {}, vendor.questions.map((q) => h('li', {}, q)))),
    ),
  );

  panel.replaceChildren(
    h('div', { className: 'panel-head' }, h('h3', {}, 'Vendor checklist'), h('p', { className: 'hint' }, 'Sorted by booking deadline · tick when booked')),
    holder.progress,
    h('ul', { className: 'vendor-grid', role: 'list' }, cards),
  );
}

export function renderChat(log, messages) {
  log.replaceChildren(
    ...messages.map((msg) => {
      const isUser = msg.role === 'user';
      return h(
        'li',
        { className: `chat-msg chat-${isUser ? 'user' : 'model'}` },
        isUser ? h('span', { className: 'avatar avatar-user', 'aria-hidden': 'true' }, 'You') : h('span', { className: 'avatar', 'aria-hidden': 'true' }, icon('sparkle')),
        h('p', {}, h('span', { className: 'visually-hidden' }, isUser ? 'You: ' : 'Utsav: '), msg.text),
      );
    }),
  );
  log.lastElementChild?.scrollIntoView({ block: 'nearest' });
}
