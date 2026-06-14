// READ-ONLY: find the "test" campaign in Instantly, then list its first batch
// of leads and print email + email_1_subject for the first 3.
//
// Usage: node scripts/check-test-campaign.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const axios = require('axios');

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const BASE = 'https://api.instantly.ai/api/v2';

if (!INSTANTLY_API_KEY) {
  console.error('Missing INSTANTLY_API_KEY in .env');
  process.exit(1);
}

const headers = {
  Authorization: 'Bearer ' + INSTANTLY_API_KEY,
  'Content-Type': 'application/json',
};

// Try multiple common shapes for the campaigns list response.
function extractCampaignList(data) {
  if (Array.isArray(data)) return data;
  return data?.items || data?.campaigns || data?.data?.items || data?.data || [];
}

// Lead count may be on the campaign object under various keys, or absent.
function extractLeadCount(c) {
  const candidates = [c.leads_count, c.leadsCount, c.lead_count, c.total_leads, c.stats?.leads];
  for (const v of candidates) if (typeof v === 'number') return v;
  return null;
}

// Per Instantly v2, GET /leads/list returns lead-level custom-variable fields
// flat under `lead.payload` (NOT under custom_variables, which is undefined on
// fetched leads). Check root first as a defensive fallback.
function readEmailSubject(lead) {
  if (lead.email_1_subject) return lead.email_1_subject;
  if (lead.payload && lead.payload.email_1_subject) return lead.payload.email_1_subject;
  return '(empty)';
}

(async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Find "test" campaign and dump first 3 leads');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. List campaigns ──────────────────────────────────────────────────────
  console.log('[1/3] GET /campaigns?limit=20 ...');
  let campaigns;
  try {
    const r = await axios.get(BASE + '/campaigns', {
      headers,
      params: { limit: 20 },
    });
    campaigns = extractCampaignList(r.data);
  } catch (err) {
    console.error('Campaigns fetch failed:', err.response?.status, err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message);
    process.exit(1);
  }
  console.log('      Got ' + campaigns.length + ' campaigns\n');

  // ── 2. Find the "test" campaign ────────────────────────────────────────────
  // Match case-insensitively; prefer exact name match, fall back to contains.
  const lowerName = (c) => (c.name || '').toLowerCase();
  const exact   = campaigns.filter((c) => lowerName(c) === 'test');
  const contains = campaigns.filter((c) => lowerName(c).includes('test'));
  const matches = exact.length ? exact : contains;

  if (matches.length === 0) {
    console.log('No campaign with "test" in its name found. Available campaign names:');
    for (const c of campaigns) console.log('  - ' + (c.name || '(unnamed)') + '   [id=' + c.id + ']');
    return;
  }
  if (matches.length > 1) {
    console.log('Multiple campaigns match "test":');
    for (const c of matches) console.log('  - ' + (c.name || '(unnamed)') + '   [id=' + c.id + ']');
    console.log('Using the first one.\n');
  }

  const target = matches[0];
  const leadCount = extractLeadCount(target);
  console.log('[2/3] Test campaign found:');
  console.log('      name:        ' + (target.name || '(unnamed)'));
  console.log('      id:          ' + target.id);
  console.log('      lead count:  ' + (leadCount != null ? leadCount : '(not reported by /campaigns response)'));
  console.log('');

  // ── 3. List leads for this campaign ────────────────────────────────────────
  console.log('[3/3] POST /leads/list with campaign=' + target.id + ' ...');
  let leads;
  try {
    const r = await axios.post(BASE + '/leads/list', { campaign: target.id, limit: 100 }, { headers });
    leads = r.data?.items || r.data?.leads || (Array.isArray(r.data) ? r.data : []);
  } catch (err) {
    console.error('Leads fetch failed:', err.response?.status, err.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message);
    process.exit(1);
  }
  console.log('      Got ' + leads.length + ' leads from /leads/list\n');

  // ── First 3 leads' email + email_1_subject ─────────────────────────────────
  console.log('First 3 leads:');
  const sample = leads.slice(0, 3);
  if (!sample.length) {
    console.log('  (no leads returned)');
    return;
  }
  for (let i = 0; i < sample.length; i++) {
    const lead = sample[i];
    console.log('  [' + (i + 1) + '] email:           ' + (lead.email || '(no email)'));
    console.log('      email_1_subject: ' + readEmailSubject(lead));
  }
})();
