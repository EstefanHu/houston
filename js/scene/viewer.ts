import * as THREE from 'three';

/** Called each animation frame with seconds since the last one. Return true to keep running. */
export type Ticker = (dt: number) => boolean;

export const SCHEMATIC = {
  background: 0x0b1626,
  grid: 0x1d3350,
  gridCenter: 0x2a4a72,
} as const;

/**
 * Owns the renderer, scene and camera. Renders on demand: a frame is drawn only when
 * something calls requestRender() or a ticker is still running.
 */
export class Viewer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  readonly renderer: THREE.WebGLRenderer;

  private readonly tickers = new Set<Ticker>();
  private frame = 0;
  private bottomInset = 0;
  /** Frames drawn so far; lets tests check that nothing renders while idle. */
  frames = 0;
  private last = 0;
  private readonly firstFrame: Promise<void>;
  private resolveFirstFrame!: () => void;

  constructor(private readonly host: HTMLElement) {
    // Throws when WebGL is unavailable; main.ts shows the text-only notice.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(SCHEMATIC.background);
    host.append(this.renderer.domElement);

    this.firstFrame = new Promise((resolve) => (this.resolveFirstFrame = resolve));

    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2a40, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(8, 14, 10);
    this.scene.add(key);

    const grid = new THREE.GridHelper(40, 40, SCHEMATIC.gridCenter, SCHEMATIC.grid);
    this.scene.add(grid);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  /** Resolves after the first frame has been drawn, so the loading screen can go. */
  rendered(): Promise<void> {
    return this.firstFrame;
  }

  requestRender(): void {
    if (this.frame === 0) this.frame = requestAnimationFrame(this.loop);
  }

  addTicker(fn: Ticker): void {
    if (this.tickers.has(fn)) return;
    this.tickers.add(fn);
    this.last = 0;
    this.requestRender();
  }

  /**
   * Tells the viewer how many pixels at the bottom are covered (by the phone bottom sheet).
   * The image shifts up by half that, so the scene stays centred in the visible part.
   */
  setBottomInset(px: number): void {
    this.bottomInset = px;
    this.resize();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const shift = Math.min(this.bottomInset, h * 0.6) / 2;
    if (shift > 0) this.camera.setViewOffset(w, h, 0, shift, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private readonly loop = (now: number): void => {
    this.frame = 0;
    // Cap dt so a backgrounded tab doesn't make animations jump.
    const dt = this.last === 0 ? 1 / 60 : Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    for (const tick of [...this.tickers]) {
      if (!tick(dt)) this.tickers.delete(tick);
    }
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.resolveFirstFrame();
    if (this.tickers.size > 0) this.requestRender();
    else this.last = 0;
  };
}
