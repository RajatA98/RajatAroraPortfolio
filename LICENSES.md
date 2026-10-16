# Third-party licenses

## Archivo (typeface)

- **License:** SIL Open Font License 1.1 (https://openfontlicense.org)
- **Copyright:** 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo), designed by Omnibus-Type.
- **Reserved Font Name:** none declared, so the subset files keep the family name "Archivo".
- **Source:** `@fontsource-variable/archivo` 5.3.0 (`files/archivo-latin-wdth-normal.woff2`, the variable build with weight and width axes). The full license text ships in `node_modules/@fontsource-variable/archivo/LICENSE`.
- **Files in this repo** (`src/styles/fonts/`), cut with fontTools (`varLib.instancer`, then `subset` to Basic Latin, Latin-1 and common punctuation):
  - `archivo-expanded-800.woff2`: static instance at width 125, weight 800 (display face, preloaded).
  - `archivo-400-500.woff2`: variable instance at width 100, weight 400 to 500 (body face).
- These modified files are distributed under the same OFL 1.1 terms.

## GSAP (animation library)

- **License:** GSAP standard "no charge" license (https://gsap.com/standard-license). Since GSAP 3.13 the library and all its plugins, including the formerly paid Club plugins, are free for everyone, including commercial use.
- **Version in use:** `gsap` 3.15.0 and `@gsap/react`.
- **Constraint to remember:** the license does not allow use in a product that competes with Webflow's visual animation tools. A personal portfolio is well within the terms.
