// Minimal screen manager + click delegation. Later milestones add screens
// (character creation, HUD) by adding <section data-screen="..."> in index.html.
export class ScreenManager {
  constructor() {
    this.screens = new Map();
    document.querySelectorAll('[data-screen]').forEach(el => this.screens.set(el.dataset.screen, el));
    this.current = null;
  }
  show(name) {
    for (const [n, el] of this.screens) el.classList.toggle('active', n === name);
    this.current = name;
  }
}

export function bindActions(root, actions) {
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn && actions[btn.dataset.action]) actions[btn.dataset.action](btn);
  });
}
