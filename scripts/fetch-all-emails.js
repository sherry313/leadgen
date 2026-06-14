// READ-ONLY script: paginate through ALL leads in a campaign and dump their
// email 1-4 subject/body fields, plus the full raw JSON of lead[0] for shape
// inspection.
//
// Usage: node scripts/fetch-all-emails.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const axios = require('axios');

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const CAMPAIGN_ID = '09113f5f-1397-4be8-a091-7beaf0e05f05';
const BASE = 'https://api.instantly.ai/api/v2';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50; // safety cap = 5000 leads at limit=100; bail if exceeded

if (!INSTANTLY_API_KEY) { console.error('Missing INSTANTLY_API_KEY in .env'); process.exit(1); }

const headers = {
  Authorization: `Bearer ${INSTANTLY_API_KEY}`,
  'Content-Type': 'application/json',
};

// Read a field from a lead, preferring the root level, falling back to payload.
function readField(lead, key) {
  if (lead[key] != null && lead[key] !== '') return lead[key];
  if (lead.payload && lead.payload[key] != null) return lead.payload[key];
  return '';
}

// Try to extract a "next page" cursor from a list response. Instantly v2 has
// used multiple shapes — handle the documented ones plus a final fallback.
function extractNextCursor(resData, lastItem) {
  if (!resData) return null;
  // Common documented field names
  const candidates = [
    resData.next_starting_after,
    resData.nextStartingAfter,
    resData.starting_after,
    resData.cursor,
    resData.next,
    resData.next_cursor,
  ];
  for (const c of candidates) if (c) return c;
  // Final fallback: if the response advertises has_more / next_page=true,
  // use the last item's id as the next starting_after (Stripe-style convention)
  const hasMore =
    resData.has_more === true ||
    resData.hasMore === true ||
    resData.next_page === true;
  if (hasMore && lastItem?.id) return lastItem.id;
  return null;
}

async function fetchAllLeads() {
  const all = [];
  let startingAfter = null;
  let page = 0;
  while (page < MAX_PAGES) {
    page++;
    const body = { campaign: CAMPAIGN_ID, limit: PAGE_LIMIT };
    if (startingAfter) body.starting_after = startingAfter;

    console.log(`[fetch] Page ${page} — starting_after=${startingAfter || '(none)'}`);
    let res;
    try {
      res = await axios.post(`${BASE}/leads/list`, body, { headers });
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`[fetch] Page ${page} failed (${status}): ${detail}`);
      break;
    }

    const items = res.data?.items || res.data?.leads || (Array.isArray(res.data) ? res.data : []);
    console.log(`[fetch] Page ${page} returned ${items.length} leads`);
    if (!items.length) break;
    all.push(...items);

    const next = extractNextCursor(res.data, items[items.length - 1]);
    if (!next) {
      console.log('[fetch] No next cursor — pagination complete');
      break;
    }
    if (next === startingAfter) {
      console.warn('[fetch] Next cursor equals current — bailing to avoid infinite loop');
      break;
    }
    startingAfter = next;
    // Small delay between pages to be polite
    await new Promise((r) => setTimeout(r, 200));
  }
  if (page >= MAX_PAGES) {
    console.warn(`[fetch] Hit MAX_PAGES safety cap (${MAX_PAGES}) — there may be more leads`);
  }
  return all;
}

(async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Fetch ALL leads for campaign ${CAMPAIGN_ID}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const leads = await fetchAllLeads();
  console.log(`\n[fetch] Pagination complete — ${leads.length} total leads collected\n`);

  if (!leads.length) {
    console.log('No leads. Exiting.');
    return;
  }

  // ── Raw JSON dump of lead[0] for shape inspection ─────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RAW lead[0] full JSON (for shape inspection)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(JSON.stringify(leads[0], null, 2));
  console.log('');

  // ── Per-lead emails 1-4 ────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Per-lead email_1..email_4 (subject + body)');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    console.log(`[${i + 1}/${leads.length}] ${lead.email || '(no email)'}`);
    for (let n = 1; n <= 4; n++) {
      const subj = readField(lead, `email_${n}_subject`);
      const body = readField(lead, `email_${n}_body`);
      console.log(`  email_${n}_subject: ${subj || '(empty)'}`);
      console.log(`  email_${n}_body:    ${body || '(empty)'}`);
    }
    console.log('---');
  }

  console.log('');
  console.log(`Total leads fetched: ${leads.length}`);
})();
