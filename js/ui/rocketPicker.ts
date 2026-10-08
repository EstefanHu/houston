import type { RocketEntry } from '../data/rockets/index';

/**
 * The rocket picker in the status strip: a native <select>. Choosing a rocket sets
 * ?rocket=<id> and reloads, so every rocket starts fresh and has a shareable link.
 */
export function mountRocketPicker(select: HTMLSelectElement, rockets: readonly RocketEntry[], currentId: string): void {
  for (const r of rockets) {
    const option = document.createElement('option');
    option.value = r.id;
    option.textContent = `${r.name} · ${r.kind}`;
    option.selected = r.id === currentId;
    select.append(option);
  }
  select.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('rocket', select.value);
    window.location.assign(url);
  });
}
