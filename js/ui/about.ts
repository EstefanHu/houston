import type { Rocket } from '../data/parts';

export interface AboutElements {
  heading: HTMLElement;
  summary: HTMLElement;
  sources: HTMLElement;              // wrapper, hidden when there are none
  list: HTMLUListElement;
}

/** The "About" section: what this rocket is, and where its facts come from. */
export function mountAbout(els: AboutElements, rocket: Rocket): void {
  els.heading.textContent = `About ${rocket.name}`;
  els.summary.textContent = rocket.summary;
  const sources = rocket.sources ?? [];
  els.sources.hidden = sources.length === 0;
  for (const s of sources) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url;
    a.textContent = s.title;
    a.target = '_blank';
    a.rel = 'noopener';
    li.append(a);
    els.list.append(li);
  }
}
