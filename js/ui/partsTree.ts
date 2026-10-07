import type { PartId, Rocket } from '../data/parts';
import { visibilityOf } from '../state/reducer';
import type { RocketStore } from '../state/store';

interface Row {
  item: HTMLLIElement;
  checkbox: HTMLInputElement;
  isolate: HTMLButtonElement;
}

/**
 * Builds the parts tree (stage → component) from the rocket data. Each row has a visibility
 * checkbox and an Isolate toggle; stages can be collapsed. All controls are native elements,
 * so keyboard and screen-reader support come for free.
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
        disclosure.addEventListener('click', () => {
          const expanded = disclosure.getAttribute('aria-expanded') !== 'true';
          disclosure.setAttribute('aria-expanded', String(expanded));
          sub.hidden = !expanded;
        });
        row.append(disclosure);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'parts-tree__spacer';
        row.append(spacer);
      }

      const label = document.createElement('label');
      label.className = 'parts-tree__label';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'parts-tree__checkbox';
      checkbox.addEventListener('change', () => {
        store.dispatch({ type: 'setVisible', id: part.id, visible: checkbox.checked });
      });
      const name = document.createElement('span');
      name.textContent = part.name;
      label.append(checkbox, name);

      const isolate = document.createElement('button');
      isolate.type = 'button';
      isolate.className = 'button button--small parts-tree__isolate';
      isolate.textContent = 'Isolate';
      isolate.setAttribute('aria-label', `Isolate ${part.name}`);
      isolate.addEventListener('click', () => store.dispatch({ type: 'isolate', id: part.id }));

      row.append(label, isolate);
      item.append(row);
      if (sublist) {
        build(sublist, part.id);
        item.append(sublist);
      }
      ul.append(item);
      rows.set(part.id, { item, checkbox, isolate });
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

  render();
  store.subscribe((s, prev) => {
    if (s.hidden !== prev.hidden || s.isolated !== prev.isolated) render();
  });
}
