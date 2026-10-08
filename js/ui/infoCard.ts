import type { Part, Rocket } from '../data/parts';
import type { RocketStore } from '../state/store';

export interface InfoCardElements {
  card: HTMLElement;
  stage: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  close: HTMLButtonElement;
  status: HTMLElement;              // visually hidden live region
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Card contents for a part. Optional fields that are missing are left out. */
function renderBody(part: Part, hidden: boolean): DocumentFragment {
  const f = document.createDocumentFragment();
  const { info } = part;
  if (hidden) f.append(h('p', 'info-card__note', 'This part is hidden in the 3D view.'));
  f.append(h('p', 'info-card__summary', info.summary));

  f.append(h('h3', 'info-card__heading', 'Purpose'), h('p', 'info-card__text', info.purpose));

  if (info.materials?.length) {
    const list = h('ul', 'info-card__list');
    for (const m of info.materials) list.append(h('li', '', m));
    f.append(h('h3', 'info-card__heading', 'Materials'), list);
  }

  const specs = Object.entries(info.specs ?? {});
  if (specs.length) {
    const dl = h('dl', 'info-card__specs');
    for (const [k, v] of specs) dl.append(h('dt', '', k), h('dd', '', v));
    f.append(h('h3', 'info-card__heading', 'Key specs'), dl);
  }

  if (info.funFact) {
    const aside = h('aside', 'info-card__fact');
    aside.append(h('h3', 'info-card__heading', 'Did you know?'), h('p', 'info-card__text', info.funFact));
    f.append(aside);
  }
  return f;
}

/** Shows the selected part's info card; × and Esc clear the selection. */
export function mountInfoCard(els: InfoCardElements, rocket: Rocket, store: RocketStore): void {
  const byId = new Map(rocket.parts.map((p) => [p.id, p]));
  const stageLabel = new Map(rocket.stages.map((s) => [s.id, s.label]));
  const clear = () => store.dispatch({ type: 'select', id: null });

  els.close.addEventListener('click', clear);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.get().selected !== null) clear();
  });

  const render = (): void => {
    const { selected, hidden } = store.get();
    const part = selected === null ? undefined : byId.get(selected);
    els.card.hidden = !part;
    els.status.textContent = part ? `Selected ${part.name}` : '';
    if (!part) return;
    els.stage.textContent = stageLabel.get(part.stage) ?? '';
    els.title.textContent = part.name;
    els.body.replaceChildren(renderBody(part, hidden.has(part.id)));
    els.body.scrollTop = 0;
  };

  render();
  store.subscribe((s, prev) => {
    if (s.selected !== prev.selected || s.hidden !== prev.hidden) render();
  });
}
