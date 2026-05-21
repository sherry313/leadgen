require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const BASE_URL = 'https://api.instantly.ai/api/v2';

if (!INSTANTLY_API_KEY) {
  console.error('ERROR: INSTANTLY_API_KEY not set in .env');
  process.exit(1);
}

const NEW_SUBJECT = 'a thought on your next sourcing trip';
const NEW_BODY = "Hi {{first_name}},\n\nif you're ever in Guangdong on a sourcing trip — we'd love to host you at the factory.\n\nwe cover airport pickup, factory tour, meals. you sort flight and hotel.\n\nmost builders see 4-5 factories in a trip. ours is worth one of those slots.\n\nwhich month are you next in China?\n\n{{accountSignature}}";

const STEP_INDEX = 3; // Step 4 (0-based)

const http = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${INSTANTLY_API_KEY}`,
    'Content-Type': 'application/json',
  },
  validateStatus: () => true,
});

function fail(label, res) {
  console.error(`${label} → HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`);
  process.exit(1);
}

(async () => {
  // 1. List campaigns
  const listRes = await http.get('/campaigns?limit=100');
  if (listRes.status >= 300) fail('GET /campaigns', listRes);
  const items = listRes.data?.items || listRes.data || [];
  console.log(`Total campaigns: ${items.length}`);

  const active = items.filter(c => c.status === 1);
  console.log(`Active campaigns (status=1): ${active.length}`);
  if (!active.length) { console.log('Nothing to do.'); return; }

  let updated = 0, skipped = 0, failed = 0;
  for (const c of active) {
    console.log(`\n→ ${c.name}  (${c.id})`);
    try {
      const detailRes = await http.get(`/campaigns/${c.id}`);
      if (detailRes.status >= 300) {
        console.log(`  ✗ GET detail failed: HTTP ${detailRes.status}`);
        failed++; continue;
      }
      const sequences = detailRes.data?.sequences;
      if (!Array.isArray(sequences) || !sequences[0]?.steps?.[STEP_INDEX]) {
        console.log(`  ⊘ Step ${STEP_INDEX + 1} not present — skipping`);
        skipped++; continue;
      }
      const step = sequences[0].steps[STEP_INDEX];
      if (!Array.isArray(step.variants) || !step.variants[0]) {
        console.log(`  ⊘ Step ${STEP_INDEX + 1} has no variants — skipping`);
        skipped++; continue;
      }

      const beforeSubj = step.variants[0].subject;
      step.variants[0].subject = NEW_SUBJECT;
      step.variants[0].body    = NEW_BODY;

      const patchRes = await http.patch(`/campaigns/${c.id}`, { sequences });
      if (patchRes.status >= 300) {
        console.log(`  ✗ PATCH failed: HTTP ${patchRes.status}: ${JSON.stringify(patchRes.data).slice(0,200)}`);
        failed++; continue;
      }
      console.log(`  ✓ Updated Step ${STEP_INDEX + 1}  (was subject: ${JSON.stringify(beforeSubj)})`);
      updated++;
    } catch (e) {
      console.log(`  ✗ ${e.message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed}`);
})();
