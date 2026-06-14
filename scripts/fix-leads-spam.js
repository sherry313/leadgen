// One-time script: strip spam-trigger phrases from per-lead custom_variables
// in a specific Instantly campaign. Do NOT commit — one-shot operation.
//
// Notes:
// - GET responses put custom variables under `payload` (per repo memory).
// - PATCH writes to `custom_variables` and merges field-by-field.
// - Replacements applied LONGEST-FIRST to avoid the
//   "No contract. No pitch deck." subset-of-longer-rule issue.

require('dotenv').config();
const axios = require('axios');

const BASE = 'https://api.instantly.ai/api/v2';
const CAMPAIGN_ID = 'b8b4faee-b671-47d2-841d-f35c13a87f3a';

const REPLACEMENTS_RAW = [
  ['No sales, no commitment — just one more option in your back pocket.',
   'Just a chance to see if it makes sense — one more option in your back pocket.'],
  ['no commitment, just for your file.',
   'just for your reference.'],
  ['No contract. No pitch deck. Most builders stay 1-2 nights, see 4-5 factories, ours included.',
   'Most builders stay 1-2 nights, see 4-5 factories. Ours is worth one of those slots.'],
  ['No contract. No pitch deck.',
   'Most builders stay 1-2 nights, see 4-5 factories. Ours is worth one of those slots.'],
  ['no commitment,', ''],
  ['No sales,', ''],
  ['no obligation', 'just for your reference'],
  ['No obligation', 'just for your reference'],
];

// Sort longest-first so shorter rules don't pre-eat longer ones.
const REPLACEMENTS = REPLACEMENTS_RAW.slice().sort((a, b) => b[0].length - a[0].length);

const BODY_FIELDS = ['email_1_body', 'email_2_body', 'email_3_body', 'email_4_body', 'email_5_body'];

function headers() {
  return {
    Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function listAllLeads(campaignId) {
  const all = [];
  let starting_after = undefined;
  let page = 0;
  while (true) {
    page++;
    const body = { campaign: campaignId, limit: 100 };
    if (starting_after) body.starting_after = starting_after;
    const res = await axios.post(`${BASE}/leads/list`, body, { headers: headers() });
    const items = res.data?.items || [];
    all.push(...items);
    console.log(`  page ${page}: +${items.length} leads (cumulative ${all.length})`);
    const next = res.data?.next_starting_after;
    if (!next || items.length === 0) break;
    starting_after = next;
    await sleep(500);
  }
  return all;
}

function applyReplacements(text) {
  if (!text || typeof text !== 'string') return { text, count: 0 };
  let result = text;
  let count = 0;
  for (const [find, replace] of REPLACEMENTS) {
    if (result.includes(find)) {
      const occurrences = result.split(find).length - 1;
      result = result.split(find).join(replace);
      count += occurrences;
    }
  }
  return { text: result, count };
}

(async () => {
  if (!process.env.INSTANTLY_API_KEY) {
    console.error('Missing INSTANTLY_API_KEY in .env');
    process.exit(1);
  }

  console.log(`Listing leads in campaign ${CAMPAIGN_ID}…`);
  const leads = await listAllLeads(CAMPAIGN_ID);
  console.log(`Total leads in campaign: ${leads.length}\n`);

  let leadsChecked = 0;
  let leadsUpdated = 0;
  let phrasesReplaced = 0;
  let failures = 0;

  for (const lead of leads) {
    leadsChecked++;
    const payload = lead.payload || lead.custom_variables || {};
    const newVars = {};
    let leadChanges = 0;

    for (const field of BODY_FIELDS) {
      const original = payload[field];
      if (!original) continue;
      const { text: updated, count } = applyReplacements(original);
      if (count > 0) {
        newVars[field] = updated;
        leadChanges += count;
      }
    }

    if (leadChanges === 0) continue;

    // PATCH only with changed fields. Per memory, PATCH merges custom_variables.
    try {
      await axios.patch(
        `${BASE}/leads/${lead.id}`,
        { custom_variables: newVars },
        { headers: headers() },
      );
      leadsUpdated++;
      phrasesReplaced += leadChanges;
      console.log(`  ✓ ${lead.email || lead.id} — ${leadChanges} phrase(s) in ${Object.keys(newVars).length} field(s)`);
    } catch (err) {
      failures++;
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : err.message;
      console.warn(`  ✗ ${lead.email || lead.id} — PATCH failed: ${detail}`);
    }

    await sleep(500);
  }

  console.log('\n=== Summary ===');
  console.log(`Leads checked:    ${leadsChecked}`);
  console.log(`Leads updated:    ${leadsUpdated}`);
  console.log(`Phrases replaced: ${phrasesReplaced}`);
  console.log(`PATCH failures:   ${failures}`);
})().catch(err => {
  const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
  console.error('FATAL:', detail);
  process.exit(1);
});
