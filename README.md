# Houston

Houston is a browser-based "mission control" for a digital rocket. You can take a 3D rocket apart, inspect each component, and fly it through a simplified launch with staging. It is built with TypeScript, vanilla CSS, and three.js, and is hosted as a static site.

**Live:** https://estefanhu.github.io/houston/ (deployed from `main` by CI)

See the [design write-up](docs/houston-design.md) and [credits](CREDITS.md).

## Development

```sh
npm install
npm run dev     # dev server with hot reload, prints a local URL
npm run check   # oxlint + tsc --noEmit + vitest
npm run build   # static site in dist/ (npm run preview to serve it)
npm run test:e2e  # Playwright browser tests (first time: npx playwright install chromium)
```

- `js/scene/`: the three.js viewer, camera and the code-built placeholder rocket.
- `js/state/`: the store and reducer.
- `js/data/rocket.json`: the rocket's parts and lesson content, validated at load.
- `js/motion/`: explode and flight-timeline math.
- `js/ui/`: the DOM panel, info card, flight controls and status strip.
- `e2e/`: browser tests, including axe-core accessibility checks and an idle-frame performance check.

## Deployment

Every push to `main` runs lint, typecheck, unit tests, the build and the browser tests; if
they all pass, CI publishes `dist/` to GitHub Pages. One-time setup: in the repo's
**Settings → Pages**, set **Source** to **GitHub Actions**.
