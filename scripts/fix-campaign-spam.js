// One-time script: strip spam-trigger phrases from a specific Instantly campaign's
// hardcoded step bodies. Do NOT commit — this is a one-shot operation.
//
// Usage: node scripts/fix-campaign-spam.js

require('dotenv').config();
const axios = require('axios');

const BASE = 'https://api.instantly.ai/api/v2';
const CAMPAIGN_ID = 'b8b4faee-b671-47d2-841d-f35c13a87f3a';

// Per-step find/replace map. Index = step index in sequences[0].steps.
const REPLACEMENTS = [
  { // Step 1 (Email 1)
    find: 'No sales, no commitment — just one more option in your back pocket.',
    replace: 'Just a chance to see if it makes sense — one more option in your back pocket.',
  },
  { // Step 2 (Email 2)
    find: 'no commitment, just for your file.',
    replace: 'just for your reference.',
  },
  { // Step 3 (Email 3)
    find: 'no commitment, just for your file.',
    replace: 'just for your reference.',
  },
  { // Step 4 (Email 4)
    find: 'No contract. No pitch deck. Most builders stay 1-2 nights, see 4-5 factories, ours included.',
    replace: 'Most builders stay 1-2 nights, see 4-5 factories. Ours is worth one of those slots.',
  },
  null, // Step 5 — no change
];

function headers() {
  return {
    Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

(async () => {
  if (!process.env.INSTANTLY_API_KEY) {
    console.error('Missing INSTANTLY_API_KEY in .env');
    process.exit(1);
  }

  console.log(`Fetching campaign ${CAMPAIGN_ID}…`);
  const getRes = await axios.get(`${BASE}/campaigns/${CAMPAIGN_ID}`, { headers: headers() });
  const sequences = getRes.data?.sequences;
  if (!Array.isArray(sequences) || !sequences[0]?.steps?.length) {
    console.error('Campaign has no sequence steps. Aborting.');
    console.error('Response keys:', Object.keys(getRes.data || {}));
    process.exit(1);
  }

  const steps = sequences[0].steps;
  console.log(`Got ${steps.length} step(s). Applying replacements…\n`);

  let totalChanges = 0;
  for (let i = 0; i < REPLACEMENTS.length; i++) {
    const rep = REPLACEMENTS[i];
    if (!rep) { console.log(`Step ${i + 1}: skipped (no change requested)`); continue; }
    const step = steps[i];
    if (!step) { console.log(`Step ${i + 1}: step missing in campaign, skipping`); continue; }

    const variants = step.variants || [];
    let stepChanges = 0;
    for (let v = 0; v < variants.length; v++) {
      const variant = variants[v];
      const body = variant.body || '';
      if (body.includes(rep.find)) {
        const newBody = body.split(rep.find).join(rep.replace);
        variants[v].body = newBody;
        stepChanges++;
        console.log(`Step ${i + 1}, variant ${v + 1}: REPLACED`);
        console.log(`  - "${rep.find.slice(0, 80)}${rep.find.length > 80 ? '…' : ''}"`);
        console.log(`  + "${rep.replace.slice(0, 80)}${rep.replace.length > 80 ? '…' : ''}"`);
      } else {
        console.log(`Step ${i + 1}, variant ${v + 1}: phrase NOT found (body length ${body.length}). First 120 chars:`);
        console.log(`  "${body.slice(0, 120).replace(/\n/g, ' ')}…"`);
      }
    }
    totalChanges += stepChanges;
  }

  if (totalChanges === 0) {
    console.log('\nNo changes to apply. Exiting without PATCH.');
    return;
  }

  console.log(`\nTotal variants changed: ${totalChanges}. Sending PATCH…`);
  const patchRes = await axios.patch(
    `${BASE}/campaigns/${CAMPAIGN_ID}`,
    { sequences },
    { headers: headers() },
  );
  console.log(`PATCH status: ${patchRes.status}`);
  console.log('Done.');
})().catch(err => {
  const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
  console.error('FAILED:', detail);
  process.exit(1);
});
