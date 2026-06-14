// READ-ONLY cost audit script.
// Fetches Apify dataset metadata, surfaces cost/pricing constants in source,
// computes expected cost from given assumptions, and compares to UI total.
//
// Usage: node scripts/audit-cost.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const axios = require('axios');

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const DATASET_ID = 'Y6NJdx7fsfx9JZbPV';
const APIFY_BASE = 'https://api.apify.com/v2';
const UI_REPORTED_TOTAL = 1.640;

if (!APIFY_API_TOKEN) { console.error('Missing APIFY_API_TOKEN in .env'); process.exit(1); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function hr(title) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ' + title);
  console.log('═══════════════════════════════════════════════════════════');
}

// Keyword list per spec. `$` is matched literally (escaped in regex).
const KEYWORDS = ['cost', 'price', 'USD', 'token', 'rate', '\\$', '0\\.0', '1e-6'];
const KEYWORD_RE = new RegExp(KEYWORDS.join('|'), 'i');

function grepFile(filePath, label) {
  hr(`Cost/price grep — ${label}`);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`Failed to read ${filePath}: ${err.message}`);
    return;
  }
  const lines = content.split(/\r?\n/);
  let hits = 0;
  for (let i = 0; i < lines.length; i++) {
    if (KEYWORD_RE.test(lines[i])) {
      console.log(`L${String(i + 1).padStart(5)}: ${lines[i].trim()}`);
      hits++;
    }
  }
  console.log(`\n(${hits} matching line${hits === 1 ? '' : 's'})`);
}

async function fetchDatasetMeta(id) {
  const r = await axios.get(`${APIFY_BASE}/datasets/${id}`, {
    params: { token: APIFY_API_TOKEN },
  });
  return r.data?.data || r.data || {};
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async function main() {
  // ─── 2. Apify dataset metadata ──────────────────────────────────────────────
  hr(`Apify dataset metadata — ${DATASET_ID}`);
  try {
    const meta = await fetchDatasetMeta(DATASET_ID);
    console.log(`itemCount:       ${meta.itemCount ?? '(missing)'}`);
    console.log(`cleanItemCount:  ${meta.cleanItemCount ?? '(missing)'}`);
    console.log(`name:            ${meta.name ?? '(unnamed)'}`);
    console.log(`createdAt:       ${meta.createdAt ?? '(missing)'}`);
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`Apify metadata fetch failed (${status}): ${detail}`);
  }

  // ─── 3. Grep services/aiEnrich.js ───────────────────────────────────────────
  grepFile(path.join(__dirname, '../services/aiEnrich.js'), 'services/aiEnrich.js');

  // ─── 4. Grep server.js ──────────────────────────────────────────────────────
  grepFile(path.join(__dirname, '../server.js'), 'server.js');

  // ─── 5. Independent cost calculation ────────────────────────────────────────
  hr('Independent cost calculation (current Anthropic pricing)');

  // Pricing (USD per million tokens)
  const HAIKU_IN  = 0.80;   const HAIKU_OUT  = 4.00;
  const SONNET_IN = 3.00;   const SONNET_OUT = 15.00;

  // Volume assumptions (per spec)
  const HAIKU_CALLS  = 100;
  const SONNET_CALLS = 39;
  const HAIKU_IN_TOK  = 800;   const HAIKU_OUT_TOK  = 150;
  const SONNET_IN_TOK = 2500;  const SONNET_OUT_TOK = 600;

  // Apify estimate (fixed per spec)
  const APIFY_TOTAL = 1.20;

  const haikuInTotal  = HAIKU_CALLS * HAIKU_IN_TOK;
  const haikuOutTotal = HAIKU_CALLS * HAIKU_OUT_TOK;
  const haikuInCost   = (haikuInTotal  / 1_000_000) * HAIKU_IN;
  const haikuOutCost  = (haikuOutTotal / 1_000_000) * HAIKU_OUT;
  const haikuTotal    = haikuInCost + haikuOutCost;

  const sonnetInTotal  = SONNET_CALLS * SONNET_IN_TOK;
  const sonnetOutTotal = SONNET_CALLS * SONNET_OUT_TOK;
  const sonnetInCost   = (sonnetInTotal  / 1_000_000) * SONNET_IN;
  const sonnetOutCost  = (sonnetOutTotal / 1_000_000) * SONNET_OUT;
  const sonnetTotal    = sonnetInCost + sonnetOutCost;

  const grandTotal = haikuTotal + sonnetTotal + APIFY_TOTAL;

  const $$ = (n) => '$' + n.toFixed(6).replace(/0+$/, '0');

  console.log('Haiku (pre-screen):');
  console.log(`  Calls: ${HAIKU_CALLS}  Assumed per-call: ${HAIKU_IN_TOK} in / ${HAIKU_OUT_TOK} out`);
  console.log(`  Input:  ${haikuInTotal.toLocaleString().padStart(10)} tok × $${HAIKU_IN.toFixed(2)}/MTok  = ${$$(haikuInCost)}`);
  console.log(`  Output: ${haikuOutTotal.toLocaleString().padStart(10)} tok × $${HAIKU_OUT.toFixed(2)}/MTok  = ${$$(haikuOutCost)}`);
  console.log(`  Haiku subtotal:                                    = ${$$(haikuTotal)}`);
  console.log('');
  console.log('Sonnet (ICP score + email gen):');
  console.log(`  Calls: ${SONNET_CALLS}  Assumed per-call: ${SONNET_IN_TOK} in / ${SONNET_OUT_TOK} out`);
  console.log(`  Input:  ${sonnetInTotal.toLocaleString().padStart(10)} tok × $${SONNET_IN.toFixed(2)}/MTok  = ${$$(sonnetInCost)}`);
  console.log(`  Output: ${sonnetOutTotal.toLocaleString().padStart(10)} tok × $${SONNET_OUT.toFixed(2)}/MTok = ${$$(sonnetOutCost)}`);
  console.log(`  Sonnet subtotal:                                   = ${$$(sonnetTotal)}`);
  console.log('');
  console.log('Apify (fixed estimate per spec):');
  console.log(`  100 results × $0.012                              = ${$$(APIFY_TOTAL)}`);
  console.log('');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`GRAND TOTAL (calculated):                          = ${$$(grandTotal)}`);

  // ─── 6. Side-by-side comparison ─────────────────────────────────────────────
  hr('UI vs Calculated');
  const delta = grandTotal - UI_REPORTED_TOTAL;
  const deltaPct = (delta / UI_REPORTED_TOTAL) * 100;
  console.log(`UI reported total:   $${UI_REPORTED_TOTAL.toFixed(3)}`);
  console.log(`Calculated total:    $${grandTotal.toFixed(3)}`);
  console.log(`Delta:               ${(delta >= 0 ? '+' : '') + '$' + delta.toFixed(3)}  (${deltaPct.toFixed(1)}%)`);
  if (Math.abs(deltaPct) < 5) {
    console.log('→ Within 5% — UI value plausibly matches assumed pricing/volumes.');
  } else if (delta > 0) {
    console.log('→ Calculated > UI: UI may use different (lower) pricing OR fewer tokens than assumed.');
  } else {
    console.log('→ Calculated < UI: UI may use different (higher) pricing OR more tokens, OR includes Firecrawl/extra services.');
  }
})();
