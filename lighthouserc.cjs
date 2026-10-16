// Lighthouse-CI config (CI gate). Mobile preset (Lighthouse default: simulated
// Moto-G-class CPU + slow 4G). The runner is a proxy, not the PRD measurement.
//
// LHCI_DIST lets local runs point at a separate build folder (e.g. dist-gates).
// LCP was warn-only in Phase 1; Phase 3 promoted it to error at 1700 ms.
//
// Byte budgets live in budgets.json (Lighthouse budget format). LHCI refuses
// `assert.budgetsFile` together with `assert.assertions`, so this file reads
// budgets.json and turns each row into the same `resource-summary:*` error
// assertions LHCI's own converter would make. budgets.json stays the single
// source of truth for the numbers.
const budgets = require('./budgets.json');

/** @returns {Record<string, [string, { maxNumericValue: number }]>} */
function budgetAssertions() {
  const out = {};
  for (const budget of budgets) {
    for (const { resourceType, budget: kb } of budget.resourceSizes ?? []) {
      out[`resource-summary:${resourceType}:size`] = ['error', { maxNumericValue: kb * 1024 }];
    }
    for (const { resourceType, budget: count } of budget.resourceCounts ?? []) {
      out[`resource-summary:${resourceType}:count`] = ['error', { maxNumericValue: count }];
    }
  }
  return out;
}

module.exports = {
  ci: {
    collect: {
      staticDistDir: process.env.LHCI_DIST || 'dist',
      url: ['/'],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --headless=new',
      },
    },
    assert: {
      assertions: {
        ...budgetAssertions(),
        'categories:accessibility': ['error', { minScore: 1 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median-run' }],
        // Promoted from warn to error in Build-Phase 3, once the page carried real content.
        'largest-contentful-paint': ['error', { maxNumericValue: 1700, aggregationMethod: 'median-run' }],
        'total-byte-weight': ['error', { maxNumericValue: 409600 }],
        'errors-in-console': 'warn',
        // Only `/` is collected and it must stay crawlable (lab routes carry
        // noindex but are not collected), so this stays on as an error.
        'is-crawlable': 'error',
        'unused-javascript': 'off',
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
