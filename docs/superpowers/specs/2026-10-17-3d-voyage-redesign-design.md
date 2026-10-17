# 3D Voyage redesign: design spec

**Date:** 2026-10-17
**Status:** Draft for owner review
**Companions:** `docs/ARCHITECTURE.md` (system design) and the private design plan v2 (visual world, tokens, motion spec).
**Supersedes:** the visual direction and motion rules in the private design plan (quiet log-book page, one flourish) and the Build-Phase 5 animated chapter. Keeps: the brand tokens, the type system, the content, the four non-negotiables, the gates.

## 1. Intent

The owner's verdict on the shipped site: bland, a placeholder where the character should be, a Voyage that does not land, too much empty space. The owner wants the site to feel like the illustrated adventure it was conceived as, immersive, with real motion, and chose a full 3D voyage built in code.

Success looks like: a recruiter lands on a sea at dawn with the owner's character at the bow, scrolls, and the ship sails a stylised chart of the owner's career while the work, résumé and GitHub stay one click away at every moment. On a phone, or with reduced motion, the same chapters read as an illustrated 2D page.

The four non-negotiables hold unchanged:

1. Proof is never gated. Résumé, LinkedIn and GitHub are in the sticky header from the first frame; the Captain's Log is reachable by anchor.
2. One flourish, flawless. The flourish is now the whole 3D voyage; nothing else on the site competes with it.
3. Mobile-first and reduced-motion complete. The 2D illustrated page is the complete experience, not a lesser one.
4. Performance budget enforced. Mobile gates unchanged; a desktop frame-rate bar for the scene.

## 2. The experience

One long scroll over a fixed 3D sea. The camera rides beside and slightly behind the ship; scrolling sails the ship forward along the route.

1. **Arrival.** Dawn light, the sea, the small dinghy with the character at the bow. Name in Archivo Expanded over the water, the value line beneath, the status line. Sticky header with the three actions.
2. **The career voyage.** The ship sails west across low-poly islands standing in for the chart: New Jersey (origin, training), Indiana (university), back to New Jersey (first role), Dallas, Austin. Each port rises from the water as the ship approaches; a pinned card gives place, chapter, role and dates. At Graduation the dinghy becomes the mid-size hull in an on-screen swap; at the turning point it becomes the large hull.
3. **The Captain's Log harbour.** The largest island: a harbour with eight moored boats, one per case study, in `order`. Scrolling docks the ship beside each; the case study opens as a card (problem, hard part, decision, outcome, cleared figure, live link, GitHub). The classified entry's boat is under a tarp.
4. **About and Contact.** A small island under the sun (the favicon's mark in 3D). About text, then the contact chapter with the real email and phone and the copy buttons. The route line continues off the edge of the scene.

Ambient life throughout: waves, a wake, drifting clouds, a few gulls, the sun arcing from dawn to late afternoon across the full scroll. When the visitor stops scrolling the sea and sky keep a slow idle so the scene never freezes.

## 3. Architecture

### 3.1 Page structure (HTML, server-rendered)

The HTML page is unchanged in what it says and keeps its anchors (`#log`, `#voyage`, `#about`, `#contact`, `#stop-<id>`) and its chapter order: hero, voyage stops, Captain's Log entries, About, Contact. It remains the source of truth for content, the scroll length, keyboard order, screen readers, crawlers and the 2D fallback. The canvas never replaces a semantic node.

Each chapter becomes a "scene section": a tall block whose scroll range maps to a span of the voyage. Its visible content (the pinned card) is the existing markup, restyled to float over the scene.

### 3.2 The island: `Voyage3D`

One React island, mounted once, rendered as a fixed full-viewport canvas behind the content. Mount condition, evaluated on the client:

- viewport at least 1024 px wide, and
- `prefers-reduced-motion: no-preference`, and
- WebGL2 available, and
- the pause control is not engaged, and
- a mount-time GPU probe passes (first 60 frames at the scene's idle hold a 50 fps median; otherwise unmount and stay 2D).

Hydration is `client:media` on the width and motion query, as today, so phones download nothing. Three.js and GSAP load as dynamic imports after `requestIdleCallback` or 1.5 s, whichever comes first, so the first paint and the proof links never wait.

### 3.3 Scene, built in code

- **Sea:** a subdivided plane with vertex displacement from two summed sine fields plus a small noise texture generated at runtime; toon shading in the brand colours (`--sea` tints, `--chart` foam) with an outline pass (inverted-hull or edge detection) for the 2 px ink line.
- **Islands and ports:** low-poly cones and slabs placed from the stops' map coordinates projected onto the sea plane, so the 2D chart and the 3D scene share one data file. Port markers are the open-circle motif extruded.
- **Ship:** three hull builds (small, medium, large) from the same procedural generator, flat colours, one sail, a wake particle trail. Hull swaps at the two `sizeSwap` stops with a short lift-and-drop beat.
- **Harbour:** eight small boats on a variation of the small hull; the classified one carries a tarp mesh.
- **Sky:** gradient dome, sun disc (`--sun`), clouds as flat clusters of spheres, gulls as two-triangle sprites on a looping path.
- **Camera:** a chase camera on a spline parallel to the route, with a small scroll-velocity lean. No free orbit.
- **Lighting:** one directional light tied to the sun's arc plus a hemisphere fill; no shadows (toon look, performance).

No model files, no external textures. Everything is geometry and shader code in the repo, which also removes every licensing and IP question from the 3D side.

### 3.4 Scroll drives the scene

GSAP ScrollTrigger remains the scrub engine. One scrubbed timeline over the whole page produces a single `progress` in 0..1 and per-chapter sub-progress values. The scene reads them each frame: ship position along the route spline, camera position, port reveal amount, hull index, sun angle, card reveals. The ship dwells at each port for a share of its chapter's scroll, as the Phase 5 timeline does today.

No wheel interception, no forced snapping, no scroll hijack. Page scrolling is always native.

### 3.5 The 2D fallback page

The same HTML with painted layers: an SVG sea with layered wave bands, sky gradient, the sun, the islands as flat shapes, the ship sprite at its current size per chapter. Static on reduced motion; on a phone with motion allowed, a light CSS-only drift on the waves and clouds. This is the whole experience on phones and the state the page starts in before the island mounts, so mounting changes nothing in layout.

### 3.6 Budgets

| Surface | Budget | Change |
| --- | --- | --- |
| Phone: initial JS | unchanged (no island) | none |
| Phone: Lighthouse mobile | LCP error at 1,700 ms, CLS 0.1, a11y 1.0, byte budgets | none |
| Desktop: deferred JS (Three.js + GSAP + island) | 400 kB gzipped, new size-limit tier | new |
| Desktop: first paint path | unchanged; the island is deferred | none |
| Desktop: frame rate | 50 fps median, no frame over 32 ms, 4x CPU throttle, full scroll | bar kept, scene changed |

### 3.7 Pause and accessibility

- A visible Pause control in the header area of the voyage: stops idle and sailing, keeps the frozen frame. Pressing again resumes. Reduced motion never mounts the scene at all.
- The canvas is `aria-hidden`; everything readable is HTML. Focus order is the HTML order; focusing or clicking a stop or boat link sails the voyage to it, as today.
- Contrast: cards sit on a `--chart` panel with the 2 px ink rule, never on raw water.

## 4. Art and the character

- **Character (2D, external).** Generated by the owner from the private character brief (`factory/artifacts/CHARACTER_BRIEF.md`): original character from the two reference photos, bold ink line, flat cel colour, no franchise names, costumes or props in the prompt. Delivered as a transparent PNG, placed as a billboard at the bow in the hero, in the link-preview card, and on the last island. The build does not block on it; the bow is empty until it arrives.
- **Everything else** is code: scene geometry, the 2D fallback SVGs, the three ship sprites already in the repo (reused for the 2D page and the badges).
- **IP gates unchanged:** pre-art self-review before generating, prohibited-traits checklist on the result, second review of shipped assets before launch, denylist scan on every build.

## 5. Motion rules (replacing the design plan's)

- Scroll is the only driver of the voyage. Idle motion (sea, clouds, gulls, wake) runs on its own at low amplitude.
- Reveals are tied to arrival: a card or heading eases in (opacity and a short rise, 200 to 320 ms, the brand curve) when the ship reaches its port, never on a timer and never on first paint.
- Hover lifts a boat or port by a few units and brightens its outline; press scrolls to it.
- No parallax tells on text, no fade-ups on body copy, no autoplaying sequences outside the scene.

## 6. Testing

- **Unit (Vitest):** route projection to scene coordinates; progress to scene state (ship position, hull index, active port, sun angle) as pure functions; dwell schedule; the harbour layout; the mount condition evaluator; the 2D page markup contract (every chapter, every stop, every case study, every link, no phone in the head).
- **E2E (Playwright, state not pixels):** desktop mounts only with width, motion and WebGL; `aria-current` advances through stops and boats with scroll; pause and resume; a stop link sails to it; zero layout shift from the mount; no CSP violation; phone and reduced motion never request Three.js; JS off and WebGL off read every chapter; keyboard reaches every link in order; axe clean on every page.
- **Protocol:** the trace script on the 3D page under 4x CPU throttle; a WebGL-off manual check; the Safari trace by hand; skeptic sign-off on the scene.
- **Gates:** type check, unit, build, IP scan, size-limit (two tiers), e2e, Lighthouse mobile. All hard-fail.

## 7. Build order and the stop rule

1. **Spike (2 days, hard):** sea, one hull, chase camera, ScrollTrigger progress, on the real home page behind the existing content, with the trace protocol run on a mid laptop. **Stop rule:** if the spike cannot hold 50 fps median with no frame over 32 ms, the 3D plan stops here and the owner is offered the layered 2D illustrated direction instead, which reuses the fallback page work.
2. Islands, ports, hull swaps, the career chapters as floating cards.
3. The harbour and the eight boats; case-study cards; the classified tarp.
4. About and Contact island; sun arc; ambient life (clouds, gulls, wake).
5. The 2D fallback page (painted layers), which also becomes the phone experience.
6. The character, when it arrives: hero bow, link-preview card, last island.
7. Gates, protocols, launch items re-run (OG card re-rendered, colophon's Art paragraph updated, second IP review).

Estimated effort: two to three weeks of build after the spike, plus the owner's character generation and reviews.

## 8. Out of scope

Free camera orbit, VR, sound, 3D models from outside the repo, dark mode, the AI concierge (still a non-goal), demo clips and badges (post-launch).
