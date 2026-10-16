# Rajat Arora: portfolio

Source for [rajatarora.com](https://rajatarora.com), the personal site of Rajat Arora, AI Engineer.

## Stack

- [Astro](https://astro.build) with static output and strict TypeScript
- One React island for the animated voyage map, with GSAP loaded on demand inside it (never in the initial page load)
- Hosted on Vercel, with Vercel Speed Insights for anonymous, cookieless performance data
- Tests: Vitest (unit, with the Astro Container API), Playwright with axe (end-to-end and accessibility), Lighthouse CI (performance budgets), size-limit (JavaScript weight)

## Getting started

Requires Node 22.

```sh
npm ci
npm run dev        # local dev server
npm run build      # static build into dist/
npm run preview    # serve the build locally
```

## Quality gates

Every push and pull request runs `.github/workflows/ci.yml`. Any failing gate fails the build.

| Gate | Command | What it enforces |
| --- | --- | --- |
| Type check | `npm run check` | `astro check` passes with strict TypeScript |
| Unit tests | `npm test` | Vitest suite |
| IP scan | `npm run ip-scan` | No denylisted franchise terms in source, build output, file names, or image metadata |
| JS size | `npm run size` | Gzipped client JavaScript stays under its caps |
| End-to-end | `npm run test:e2e` | Layout, keyboard, reduced-motion and axe checks against a local preview |
| Lighthouse CI | `npm run lhci` | Byte budgets, layout shift, accessibility score 100 (mobile preset) |
| Link check (warn-only, separate workflow) | `npm run link-check` | External links answer their expected status in `link-check.json`; linked files such as the resume PDF exist in the build |

Thresholds, local commands, and the manual checks that are not in CI are documented in [docs/ci-gates.md](docs/ci-gates.md).

`npm run verify` runs the fast local subset (check, unit tests, build, IP scan, size).

## Security headers

`vercel.json` sets HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, and a Content Security Policy in report-only mode. Hashed build assets under `/_astro/` are cached for a year as immutable; the resume PDF keeps a stable URL with a short cache.

## Licenses

Third-party font and library licenses are listed in [LICENSES.md](LICENSES.md).
