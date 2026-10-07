// The control panel's size. On wide screens it is a side panel that can collapse to a rail.
// On narrow screens it is a bottom sheet with three heights (peek, half, full): drag the
// header to resize, or use the toggle button, which also works from the keyboard.

const NARROW = '(max-width: 768px)';
const PEEK = 112;                   // px: header plus the top of the first section
const STRIP = 44;                   // px: status strip height (--strip-height)

type SheetSize = 'peek' | 'half' | 'full';
const NEXT: Record<SheetSize, SheetSize> = { peek: 'half', half: 'full', full: 'peek' };

export interface PanelElements {
  panel: HTMLElement;
  header: HTMLElement;
  toggle: HTMLButtonElement;
  toggleLabel: HTMLElement;
  body: HTMLElement;
}

export interface PanelControl {
  /** Called now and whenever the panel covers a different amount of the 3D view's bottom. */
  onInset(fn: (px: number) => void): void;
  /** On phones, shrinks a full-height sheet so a newly opened info card has room. */
  makeRoomForCard(): void;
}

export function mountPanel(els: PanelElements): PanelControl {
  const narrow = window.matchMedia(NARROW);
  let collapsed = false;           // wide screens
  let size: SheetSize = 'peek';     // narrow screens
  let inset = 0;
  const insetListeners = new Set<(px: number) => void>();

  const heights = (): Record<SheetSize, number> => {
    const full = window.innerHeight - STRIP - 16;
    return { peek: PEEK, half: Math.min(full, Math.round(window.innerHeight * 0.5)), full };
  };

  const setInset = (px: number) => {
    if (px === inset) return;
    inset = px;
    for (const fn of insetListeners) fn(px);
  };

  const apply = (dragHeight?: number): void => {
    const root = document.documentElement;
    if (narrow.matches) {
      const h = dragHeight ?? heights()[size];
      els.panel.dataset.size = size;
      els.body.hidden = false;
      root.style.setProperty('--sheet-height', `${h}px`);
      els.toggle.setAttribute('aria-expanded', String(size !== 'peek'));
      els.toggleLabel.textContent = size === 'full' ? 'Collapse control panel' : 'Expand control panel';
      setInset(h);
    } else {
      els.panel.dataset.size = collapsed ? 'collapsed' : 'open';
      els.body.hidden = collapsed;
      root.style.removeProperty('--sheet-height');
      els.toggle.setAttribute('aria-expanded', String(!collapsed));
      els.toggleLabel.textContent = collapsed ? 'Expand control panel' : 'Collapse control panel';
      setInset(0);
    }
  };

  els.toggle.addEventListener('click', () => {
    if (narrow.matches) size = NEXT[size];
    else collapsed = !collapsed;
    apply();
  });

  // Dragging the sheet header (narrow screens only). Snaps to the nearest height on release.
  let drag: { y: number; h: number; id: number } | null = null;
  els.header.addEventListener('pointerdown', (e) => {
    if (!narrow.matches || e.target instanceof Element && e.target.closest('button')) return;
    drag = { y: e.clientY, h: heights()[size], id: e.pointerId };
    els.header.setPointerCapture(e.pointerId);
    els.panel.classList.add('panel--dragging');
  });
  els.header.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { peek, full } = heights();
    apply(Math.min(full, Math.max(peek, drag.h + (drag.y - e.clientY))));
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const h = drag.h + (drag.y - e.clientY);
    drag = null;
    els.panel.classList.remove('panel--dragging');
    const hs = heights();
    size = (Object.keys(hs) as SheetSize[]).reduce((best, k) => (Math.abs(hs[k] - h) < Math.abs(hs[best] - h) ? k : best));
    apply();
  };
  els.header.addEventListener('pointerup', endDrag);
  els.header.addEventListener('pointercancel', endDrag);

  narrow.addEventListener('change', () => apply());
  window.addEventListener('resize', () => apply());
  apply();

  return {
    onInset(fn) {
      insetListeners.add(fn);
      fn(inset);
    },
    makeRoomForCard() {
      if (narrow.matches && size === 'full') {
        size = 'half';
        apply();
      }
    },
  };
}
