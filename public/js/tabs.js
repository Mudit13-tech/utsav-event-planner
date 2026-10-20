/**
 * WAI-ARIA tabs pattern: roving tabindex, Arrow/Home/End keyboard support,
 * automatic activation.
 */
export function initTabs(tablist) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];

  const select = (tab, { focus = true } = {}) => {
    for (const other of tabs) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
      document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
    }
    if (focus) tab.focus();
  };

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });

  tablist.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(tabs[(moves[event.key] + tabs.length) % tabs.length]);
  });

  return { select: (id, options) => select(document.getElementById(id), options) };
}
