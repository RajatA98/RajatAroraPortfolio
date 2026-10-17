# CI gates

What each automated gate checks, its thresholds, and how to run it locally. All gates run in `.github/workflows/ci.yml` on every push and pull request, in this order, and any failure fails the run:

1. `npm ci`
2. `npx astro check`
3. `npx vitest run`
4. `npm run build`
5. `npm run ip-scan`
6. `npx size-limit`
7. `npx playwright install --with-deps chromium webkit` then `npx playwright test`
8. `npx lhci autorun`

On failure, the Playwright HTML report and the `.lighthouseci/` folder are uploaded as workflow artifacts.

## Running gates without clobbering another build

`astro.config.mjs` reads `ASTRO_OUT_DIR`, and `playwright.config.ts` reads `PW_PORT`. Use them when more than one build or preview runs on the same machine:

```sh
ASTRO_OUT_DIR=dist-local npm run build
PW_PORT=4330 ASTRO_OUT_DIR=dist-local npx playwright test
```

`dist-*/` folders are git-ignored.

---

## 1. Type check

- **Checks:** `astro check` (strict TypeScript across `.astro`, `.ts`, `.tsx`).
- **Threshold:** zero errors.
- **Local:** `npm run check`

## 2. Unit tests

- **Checks:** the Vitest suite under `tests/unit/`, including the IP scan's own tests.
- **Threshold:** all pass.
- **Local:** `npm test`, or one file with `npx vitest run tests/unit/ip-scan.test.ts`

## 3. IP-denylist scan

- **Checks:** that no term in `ip-denylist.txt` (franchise names, character names, and the pirate-flag emoji) appears anywhere a visitor, crawler, or repo reader could see it:
  - file contents of text files (source, HTML, CSS, JS, JSON, SVG, Markdown)
  - every file and folder name, including binaries
  - text metadata inside PNG, JPEG and WebP images (EXIF, XMP, PNG text chunks); other binaries such as AVIF, fonts and PDF are checked by name only
- **Where:** `src/`, `public/`, `tests/`, `scripts/`, `docs/`, `README.md`, `LICENSES.md`, and the build output (`dist/` by default).
- **Skipped on purpose:** `node_modules/`, `.git/`, `.astro/`, other `dist-*/` folders, the denylist file itself, and `tests/fixtures/ip-scan/` (fixtures that contain terms on purpose so the tests can prove the scan catches them).
- **Matching rules:** case-insensitive. Multi-word terms also match with `-`, `_` or no separator (so a hyphenated file slug is caught). Short terms are marked `|word` in the denylist so they only match as whole words and do not fire inside longer, unrelated words.
- **Threshold:** zero hits. A hit prints `path:line: matched "term"` and exits 1.
- **Local:**

  ```sh
  npm run ip-scan                              # default set, includes dist/
  node scripts/ip-scan.mjs --dist dist-local   # scan a different build folder
  node scripts/ip-scan.mjs --no-dist           # source only
  node scripts/ip-scan.mjs src public          # only these paths
  node scripts/ip-scan.mjs --json              # machine-readable output
  ```

  `ASTRO_OUT_DIR` is also honored when `--dist` is not given.
- **Adding a term:** add a line to `ip-denylist.txt`. Never write a term anywhere else in the repo, including docs, comments and commit messages; refer to them as "franchise terms".

## 4. JavaScript size (size-limit)

- **Checks:** gzipped size of the built client JavaScript, from `.size-limit.json`.
- **Thresholds:**

  | Entry | Files | Limit (gzip) |
  | --- | --- | --- |
  | All client JS (Astro runtime + React + GSAP + voyage island) | `dist/_astro/*.js` | 150 kB |
  | GSAP chunk | `dist/_astro/gsap*.js` | 60 kB |

  The GSAP chunk name is fixed by `manualChunks` in `astro.config.mjs`.
- **Requirement:** the voyage island must exist in the build. size-limit fails with "can't find files" when a path matches nothing, so the GSAP entry fails until a page imports GSAP. That is intended: a build with no GSAP chunk means the island was dropped or renamed.
- **Local:** `npm run build && npm run size`. The config points at `dist/`. To measure another build folder, run size-limit from a scratch folder that links to it:

  ```sh
  mkdir -p /tmp/size && cd /tmp/size
  cp "$OLDPWD"/package.json "$OLDPWD"/.size-limit.json .
  ln -sfn "$OLDPWD"/node_modules node_modules
  ln -sfn "$OLDPWD"/dist-local dist
  npx size-limit
  ```

## 5. End-to-end (Playwright + axe)

- **Checks:** the specs under `tests/e2e/` against a local `astro preview` of the build (never the live URL), in desktop Chrome, desktop Safari (WebKit), Pixel 7 and iPhone 14 profiles. Axe runs as one of the Playwright tests.
- **Threshold:** all pass; axe reports zero critical violations.
- **Local:** `npm run build && npm run test:e2e` (first time: `npx playwright install chromium webkit`).

## 6. Lighthouse CI

- **Config:** `lighthouserc.cjs` and `budgets.json`.
- **How it runs:** LHCI serves the static build itself (`staticDistDir`, default `dist`), loads `/` three times with the Lighthouse mobile preset (simulated mid-tier Android CPU and slow 4G), and asserts on the median run where it matters.
- **Thresholds (error = fails CI):**

  | Assertion | Level | Threshold |
  | --- | --- | --- |
  | Accessibility category | error | score 1.0 (100) |
  | Cumulative Layout Shift | error | at most 0.1 |
  | Total byte weight | error | at most 400 KB (409,600 bytes) |
  | Script bytes | error | at most 40 KB |
  | Font bytes | error | at most 80 KB |
  | Image bytes | error | at most 150 KB |
  | Document bytes | error | at most 20 KB |
  | Stylesheet bytes | error | at most 20 KB |
  | Total resource bytes | error | at most 400 KB |
  | Third-party requests | error | at most 2 (Speed Insights) |
  | `/` is crawlable | error | must pass |
  | Largest Contentful Paint | **warn** | at most 1,700 ms |
  | Console errors | warn | none |
  | Unused JavaScript | off | |

  LCP is warn-only until real hero content lands, then it becomes an error at the same 1,700 ms proxy. Simulated throttling on a CI runner is a proxy, not the launch measurement (see the WebPageTest protocol below).
- **Why the budgets are not wired through `budgetsFile`:** LHCI refuses `budgetsFile` and `assertions` in the same config. `lighthouserc.cjs` reads `budgets.json` and converts each row into the same `resource-summary:<type>:<size|count>` error assertions LHCI's own converter produces, so `budgets.json` stays the single place to change a budget.
- **Uploads:** CI uploads reports to temporary public storage (links expire after a few days). A `LHCI_GITHUB_APP_TOKEN` repository secret is optional and adds status checks to pull requests.
- **Local:**

  ```sh
  ASTRO_OUT_DIR=dist-local npm run build
  LHCI_DIST=dist-local npx lhci autorun --upload.target=filesystem --upload.outputDir=/tmp/lhci
  ```

  LHCI needs a local Chrome. If it cannot find one, set `CHROME_PATH` (for example to Playwright's Chromium under `~/Library/Caches/ms-playwright/`).

## 7. Security headers (deploy config, not a CI step)

`vercel.json` sets, for every path:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
- `X-Frame-Options: DENY`
- `Content-Security-Policy-Report-Only` allowing self, inline scripts and styles (Astro island hydration uses inline scripts), Vercel Speed Insights script and beacon hosts, `data:` images, and blocking framing. It is report-only so later work builds under it without breaking; it may be tightened later if cheap.

Caching: `/_astro/*` is `public, max-age=31536000, immutable` (content-hashed names). The resume PDF has a stable path with `public, max-age=300, must-revalidate` so updates show up within minutes. `/lab/*` routes carry `X-Robots-Tag: noindex, nofollow` (none exist since Build-Phase 5; the rule is kept for future lab pages). Content Security Policy: enforced, in two parts. Astro's `security.csp` writes a `<meta http-equiv="Content-Security-Policy">` into every page with a hash for each inline script and style it emits, so the policy is `default-src 'self'` with no `unsafe-inline`; `vercel.json` adds `frame-ancestors 'none'`, which a meta tag cannot carry. `tests/e2e/launch.spec.ts` loads the home page, uses the copy button and the voyage, and fails on any `securitypolicyviolation`.

Verify on a deploy with `curl -I https://rajatarora.com/`.

---

## Manual protocols (not in CI)

These need a human, a real device, or judgment. Results are recorded in a private QA folder that is never committed to this repo.

| Protocol | When | Pass bar |
| --- | --- | --- |
| **Frame-rate trace** | After any change to the 3D voyage scene (and the 2D voyage animation) | `node scripts/perf-trace.mjs` against `astro preview` of the build, on `/?voyage=debug` (the query exposes the scene's `window.__scene` hook; the script fails if the scene is not `live`, which on that machine is a NO-GO): Chrome, 4x CPU throttle, 1440×900, one full scroll-through of the home page. Summarise with `node scripts/fps-from-trace.mjs` (the window runs from the first to the last wheel input): at least 50 fps median, no frame over 32 ms, zero layout shift at island mount. Run it on a mid laptop, not only a fast one, and repeat in Safari by hand. Art review: `/?voyage=debug&scene=solo` hides the page so the scene can be judged alone. |
| **WebPageTest, Moto G** | Launch gate | Free tier, real Moto G profile, median of 3 runs: LCP under 2.0 s and CLS under 0.1. This is the real performance measurement; the Lighthouse CI LCP number is only a proxy. |
| **Skeptic sign-off** | Launch gate | A named non-fan skeptic, shown the hero, rates it "serious engineer", not "gimmick portfolio". |
| **5-second exposure test** | Launch gate | At least two first-time viewers (one non-technical, one on mobile) can say who he is, that he is available and roughly where, and where to find the resume and work. |
| **Screen-reader and keyboard pass** | Launch gate | Zero blocking issues across the voyage stops and static timeline. |
| **IP review** | Before art and before launch | Prohibited-traits checklist signed off; the automated IP scan above is necessary but not sufficient. |

## Proving a gate fails

Once per new gate, push a throwaway branch with a deliberate violation (for example an `<img>` with no `alt` and a 1 MB image) and confirm the CI run goes red before deleting the branch.

## Link check (warn-only)

- **Where:** `.github/workflows/link-check.yml`, a separate workflow from `ci.yml`. It runs on pushes to `main`, on pull requests, weekly (Mondays 09:17 UTC) and on demand. The check step has `continue-on-error: true`, so a broken or flaky third-party site shows up as a warning and never fails a build or blocks a deploy.
- **Checks:** every `.html` file in the build output, for two things:
  - **Local files:** every root-relative `href`, `src` or `srcset` that points at a file (the resume PDF, images, stylesheets, fonts, icons) must exist in the build. Page routes such as `/` or `/#log` are not checked.
  - **External links:** every absolute `http(s)` URL in `href`, `src` or `srcset` gets a `HEAD` request, retried as `GET` when the host answers 405 or 403 or the request fails. Redirects are not followed, so a 302 is reported as 302 (with its target). Requests send a browser-like User-Agent, run 4 at a time, and time out after 10 seconds each.
  - `mailto:`, `tel:`, `data:`, `#hash` and relative links are skipped.
- **Expected statuses:** `link-check.json`. `default` applies to every URL; `overrides` maps a full URL or a URL prefix to its allowed statuses, and the longest matching prefix wins; `ignore` lists prefixes that are never requested. Current entries and why:

  | Key | Allowed | Why |
  | --- | --- | --- |
  | `default` | 200 | Anything else is worth a look. |
  | `ignore`: `https://rajatarora.com` | not requested | The site's own canonical URL. Its files are covered by the local-file check, and the domain may not point at this build yet. |
  | `https://portfolio-agent-git-756982711593.us-central1.run.app` | 200, 302, 303 | The demo can send visitors to a login page with a redirect. |
  | `https://apps.apple.com/` | 200 | Explicit so the App Store rule is visible; App Store pages answer 200 to a browser User-Agent. |
  | `https://github.com/` | 200 | Profile and repository pages. |
  | `https://www.linkedin.com/` | 200, 999 | LinkedIn answers automated requests with the non-standard status 999 (and 405 to `HEAD`). 999 means "reachable but refused a bot", not "broken". |

  To accept a new status, add or edit an `overrides` entry. Keep entries as narrow as the problem.
- **Output:** a table with one row per link (`ok`, `FAIL` or `MISSING`, the observed status, the expected list, the URL) and a summary line. Exit code 1 on any mismatch or missing file, 0 otherwise, 2 when the build folder is missing. In CI the results are saved as JSON, printed as a table, added to the job summary, raised as a warning annotation when something is off, and uploaded as the `link-check-results` artifact.
- **Local:**

  ```sh
  npm run build && npm run link-check          # checks dist/
  node scripts/link-check.mjs --dist dist-local
  node scripts/link-check.mjs --json           # machine-readable output
  ```

  The checker reads files and makes network requests; it never writes files.
- **Known flake:** LinkedIn sometimes answers `https://www.linkedin.com/in/<name>/` with a 301 to the same URL without the trailing slash. Linking to the form without the slash avoids it.
