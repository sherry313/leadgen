const axios = require('axios');
require('dotenv').config();

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const CAMPAIGN_ID = '09113f5f-1397-4be8-a091-7beaf0e05f05';
const BASE = 'https://api.instantly.ai/api/v2';
const headers = { Authorization: `Bearer ${INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' };

async function main() {
  console.log('[fix] Fetching leads...');
  // Filter key is `campaign` (singular), NOT `campaign_id` — wrong key is
  // silently ignored and returns workspace-wide leads.
  const r = await axios.post(`${BASE}/leads/list`, { campaign: CAMPAIGN_ID, limit: 100 }, { headers });
  const leads = r.data?.items || r.data || [];
  console.log(`[fix] Got ${leads.length} leads`);

  let fixed = 0, skipped = 0, failed = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const email = lead.email;
    const body = lead.payload?.email_1_body || '';
    if (!body) { console.log(`[${i+1}/${leads.length}] ${email}: no body — skip`); skipped++; continue; }
    if (!/朗斯|不锈钢|款式新颖/.test(body)) { console.log(`[${i+1}/${leads.length}] ${email}: no Chinese — skip`); skipped++; continue; }

    const newBody = body.replace(/朗斯[^\n]+\n?/g, 'Lens — aluminium windows, doors, bathroom fixtures. 20 years manufacturing, currently shipping to a Sydney designer.\n\n').trim();

    try {
      await axios.patch(`${BASE}/leads/${lead.id}`, { custom_variables: { email_1_body: newBody } }, { headers });
      console.log(`[${i+1}/${leads.length}] ✅ ${email}: patched`);
      fixed++;
    } catch(e) {
      console.log(`[${i+1}/${leads.length}] ✗ ${email}: ${e.response?.data?.message || e.message}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\nDone: fixed=${fixed} skipped=${skipped} failed=${failed}`);
}

main().catch(console.error);
