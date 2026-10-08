# Houston

Houston is a browser-based "mission control" for a digital rocket. You can take a 3D rocket apart, inspect each component, and fly it through a simplified launch with staging. It is built with TypeScript, vanilla CSS, and three.js, and is hosted as a static site.

Five rockets, picked from the status strip or by link: Houston-1 (`/`, the default),
Saturn V (`/?rocket=saturn-v`), Falcon 9 (`/?rocket=falcon-9`), Falcon Heavy
(`/?rocket=falcon-heavy`) and Black Brant IX (`/?rocket=black-brant-ix`).

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
- `js/data/rockets/`: one JSON file per rocket (parts, geometry, lesson content, timeline), validated at load, plus the registry in `index.ts`.
- `js/motion/`: explode and flight-timeline math.
- `js/ui/`: the DOM panel, info card, flight controls and status strip.
- `e2e/`: browser tests, including axe-core accessibility checks and an idle-frame performance check.

## Deployment

The site is hosted on Vercel, which builds and deploys from GitHub on its own: production
from `main`, and a preview deployment for each pull request. Vercel detects Vite, so the
defaults are right: build command `npm run build`, output directory `dist`.

GitHub Actions (`.github/workflows/ci.yml`) only runs the checks: lint, typecheck, unit
tests, the build and the browser tests.
