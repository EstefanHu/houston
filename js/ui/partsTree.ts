import { ancestorsOf } from '../data/parts';
import type { PartId, Rocket } from '../data/parts';
import { visibilityOf } from '../state/reducer';
import type { RocketStore } from '../state/store';

interface Row {
  item: HTMLLIElement;
  row: HTMLDivElement;
  checkbox: HTMLInputElement;
  name: HTMLButtonElement;
  isolate: HTMLButtonElement;
  expand?: () => void;
}

/**
 * Builds the parts tree (stage → component) from the rocket data. Each row has a visibility
 * checkbox, the part name (a button that selects it) and an Isolate toggle; stages can be
 * collapsed. All controls are native elements, so keyboard and screen-reader support come
 * for free.
 */
export function mountPartsTree(list: HTMLUListElement, showAll: HTMLButtonElement, rocket: Rocket, store: RocketStore): void {
  const rows = new Map<PartId, Row>();
  const childrenOf = (id: PartId | null) => rocket.parts.filter((p) => p.parent === id);

  const build = (ul: HTMLUListElement, parent: PartId | null): void => {
    for (const part of childrenOf(parent)) {
      const item = document.createElement('li');
      item.className = 'parts-tree__item';

      const row = document.createElement('div');
      row.className = 'parts-tree__row';

      const kids = childrenOf(part.id);
      let sublist: HTMLUListElement | null = null;
      let expand: (() => void) | undefined;
      if (kids.length > 0) {
        sublist = document.createElement('ul');
        sublist.className = 'parts-tree__list';
        sublist.id = `parts-${part.id.replaceAll('.', '-')}`;
        const disclosure = document.createElement('button');
        disclosure.type = 'button';
        disclosure.className = 'parts-tree__disclosure';
        disclosure.setAttribute('aria-expanded', 'true');
        disclosure.setAttribute('aria-controls', sublist.id);
        disclosure.setAttribute('aria-label', `${part.name} components`);
        const sub = sublist;
        const setExpanded = (expanded: boolean) => {
          disclosure.setAttribute('aria-expanded', String(expanded));
          sub.hidden = !expanded;
        };
        disclosure.addEventListener('click', () => setExpanded(disclosure.getAttribute('aria-expanded') !== 'true'));
        expand = () => setExpanded(true);
        row.append(disclosure);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'parts-tree__spacer';
        row.append(spacer);
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'parts-tree__checkbox';
      checkbox.setAttribute('aria-label', `Show ${part.name}`);
      checkbox.addEventListener('change', () => {
        store.dispatch({ type: 'setVisible', id: part.id, visible: checkbox.checked });
      });

      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'parts-tree__name';
      name.textContent = part.name;
      // Clicking the selected part again deselects it.
      name.addEventListener('click', () => {
        store.dispatch({ type: 'select', id: store.get().selected === part.id ? null : part.id });
      });

      const isolate = document.createElement('button');
      isolate.type = 'button';
      isolate.className = 'button button--small parts-tree__isolate';
      isolate.textContent = 'Isolate';
      isolate.setAttribute('aria-label', `Isolate ${part.name}`);
      isolate.addEventListener('click', () => store.dispatch({ type: 'isolate', id: part.id }));

      row.append(checkbox, name, isolate);
      item.append(row);
      if (sublist) {
        build(sublist, part.id);
        item.append(sublist);
      }
      ul.append(item);
      rows.set(part.id, expand ? { item, row, checkbox, name, isolate, expand } : { item, row, checkbox, name, isolate });
    }
  };
  build(list, null);

  showAll.addEventListener('click', () => store.dispatch({ type: 'showAll' }));

  const render = (): void => {
    const { hidden, isolated } = store.get();
    for (const [id, row] of rows) {
      const v = visibilityOf(rocket.parts, hidden, id);
      row.checkbox.checked = v === 'visible';
      row.checkbox.indeterminate = v === 'mixed';
      row.item.classList.toggle('is-hidden', hidden.has(id));
      row.isolate.setAttribute('aria-pressed', String(isolated === id));
    }
    showAll.disabled = hidden.size === 0;
  };

  // Highlight the selected row; reveal it if it's inside a collapsed stage or scrolled away.
  const renderSelection = (selected: PartId | null, prev: PartId | null): void => {
    for (const id of [prev, selected]) {
      const r = id === null ? undefined : rows.get(id);
      if (!r) continue;
      const on = id === selected;
      r.row.classList.toggle('is-selected', on);
      if (on) r.name.setAttribute('aria-current', 'true');
      else r.name.removeAttribute('aria-current');
    }
    const r = selected === null ? undefined : rows.get(selected);
    if (!r || selected === null) return;
    for (const a of ancestorsOf(rocket.parts, selected)) rows.get(a)?.expand?.();
    r.row.scrollIntoView({ block: 'nearest', behavior: store.get().reducedMotion ? 'auto' : 'smooth' });
  };

  render();
  renderSelection(store.get().selected, null);
  store.subscribe((s, prev) => {
    if (s.hidden !== prev.hidden || s.isolated !== prev.isolated) render();
    if (s.selected !== prev.selected) renderSelection(s.selected, prev.selected);
  });
}
