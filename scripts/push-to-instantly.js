// One-off: push the 17 qualified, email-ready leads from search
// 1a2aaac5-1e9f-4f8a-9a5b-268c02491f71 to the Lens Instantly campaign.
//
// Run from project root:   node scripts/push-to-instantly.js
// Do NOT commit (CLAUDE.md rule 6).
//
// Safeguard: if the target campaign is Active, this script REFUSES to push
// (same gate as /api/auto/run in server.js). Active = immediate send to real
// recipients. Pause the campaign in the Instantly UI first, then re-run.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const { addLeadToCampaign, getCampaignStatus } = require('../services/instantly');

const SEARCH_ID   = '1a2aaac5-1e9f-4f8a-9a5b-268c02491f71';
const CAMPAIGN_ID = '07e67024-3355-4510-810b-ebb974954b91';
const DELAY_MS    = 500;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key)                        { console.error('Missing SUPABASE_URL / SUPABASE_KEY'); process.exit(1); }
if (!process.env.INSTANTLY_API_KEY)      { console.error('Missing INSTANTLY_API_KEY'); process.exit(1); }
const db = createClient(url, key);

const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Map a Supabase leads row → the lead shape addLeadToCampaign() expects.
// The Instantly function internally translates EMAIL_N_SUBJECT (uppercase)
// into the `email_n_subject` snake_case keys that Instantly's custom_variables
// uses on its end. Same data, same destination, just the function's API.
function rowToLead(r) {
  return {
    companyName:     r.company_name,
    email:           r.email,
    phone:           r.phone || '',
    website:         r.website || '',
    EMAIL_1_SUBJECT: r.email1_subject || '',
    EMAIL_1_BODY:    r.email1_body    || '',
    EMAIL_2_SUBJECT: r.email2_subject || '',
    EMAIL_2_BODY:    r.email2_body    || '',
    EMAIL_3_SUBJECT: r.email3_subject || '',
    EMAIL_3_BODY:    r.email3_body    || '',
    EMAIL_4_SUBJECT: r.email4_subject || '',
    EMAIL_4_BODY:    r.email4_body    || '',
    EMAIL_5_SUBJECT: r.email5_subject || '',
    EMAIL_5_BODY:    r.email5_body    || '',
  };
}

(async () => {
  // ── Pre-flight: refuse to push if the campaign is Active ──────────────────
  console.log(`Pre-flight: checking campaign ${CAMPAIGN_ID}...`);
  const { status, name } = await getCampaignStatus(CAMPAIGN_ID);
  const isActive = status === 1 || status === 'active';
  console.log(`  Campaign: "${name || '(unknown)'}"  status=${status}  active=${isActive}`);
  if (isActive) {
    console.error(``);
    console.error(`✗ REFUSED — campaign is Active. Pushing now would trigger immediate sends.`);
    console.error(`  Pause the campaign in Instantly first, then re-run this script.`);
    process.exit(2);
  }
  console.log(`  ✓ Safe to push.\n`);

  // ── 1. Fetch qualified leads with emails generated ────────────────────────
  const { data: rows, error } = await db
    .from('leads')
    .select('id, company_name, website, phone, email, city, rating, intent_score, icp_score, email1_subject, email1_body, email2_subject, email2_body, email3_subject, email3_body, email4_subject, email4_body, email5_subject, email5_body')
    .eq('search_id', SEARCH_ID);
  if (error) { console.error('leads fetch failed:', error.message); process.exit(1); }

  // Apply the gates: qualified scores AND emails actually generated.
  const qualified = rows.filter(r =>
    num(r.icp_score) >= 6 && num(r.intent_score) >= 6 && !!r.email1_subject
  );

  const withEmail    = qualified.filter(r => !!r.email?.trim());
  const withoutEmail = qualified.length - withEmail.length;

  console.log(`╔═════════════════════════════════════════════════════════════════╗`);
  console.log(`║ Push to Instantly campaign ${CAMPAIGN_ID.slice(0, 8)}...               ║`);
  console.log(`╚═════════════════════════════════════════════════════════════════╝`);
  console.log(`  Qualified + emails generated: ${qualified.length}`);
  console.log(`  Has email address (will push): ${withEmail.length}`);
  console.log(`  Missing email (skip):          ${withoutEmail}`);
  console.log(``);

  if (!withEmail.length) { console.log('Nothing to push.'); process.exit(0); }

  // ── 2. Push sequentially with 500ms delay between calls ───────────────────
  let okCount = 0, failCount = 0;
  const failures = [];
  const startedAt = Date.now();

  for (let i = 0; i < withEmail.length; i++) {
    const row  = withEmail[i];
    const lead = rowToLead(row);
    const tag  = `[${i + 1}/${withEmail.length}]`;

    try {
      const result = await addLeadToCampaign(lead, CAMPAIGN_ID);
      if (result.success) {
        console.log(`${tag} ✓ Pushed ${lead.companyName} — ${lead.email}`);
        okCount++;
      } else {
        console.log(`${tag} ✗ ${lead.companyName} — ${result.reason}`);
        failCount++;
        failures.push({ company: lead.companyName, email: lead.email, reason: result.reason });
      }
    } catch (err) {
      console.log(`${tag} ✗ ${lead.companyName} — exception: ${err.message}`);
      failCount++;
      failures.push({ company: lead.companyName, email: lead.email, reason: err.message });
    }

    if (i < withEmail.length - 1) await sleep(DELAY_MS);
  }

  // ── 3. Summary ────────────────────────────────────────────────────────────
  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(``);
  console.log(`════════════════════════════════════════════════════════════════════`);
  console.log(`  Done: pushed ${okCount}/${withEmail.length} leads to campaign ${CAMPAIGN_ID}`);
  console.log(`        (failed: ${failCount}, skipped no-email: ${withoutEmail})`);
  console.log(`  Time: ${secs}s`);
  if (failures.length) {
    console.log(``);
    console.log(`  Failures:`);
    for (const f of failures) console.log(`    ✗ ${f.company} (${f.email}) — ${String(f.reason).slice(0, 200)}`);
  }
  console.log(``);
  console.log(`  Next: open the campaign in Instantly to review, then activate when ready.`);

  process.exit(0);
})().catch(err => { console.error('Script crashed:', err); process.exit(1); });
