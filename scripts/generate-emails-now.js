// One-off: generate the missing 5-email sequences for the 17 qualified leads
// from search 1a2aaac5-1e9f-4f8a-9a5b-268c02491f71 (the user's stuck enrichment).
//
// Run from project root:   node scripts/generate-emails-now.js
// Do NOT commit (CLAUDE.md rule 6).

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { generateEmails } = require('../services/aiEnrich');
const { updateLeadEmails } = require('../services/supabase');

const SEARCH_ID     = '1a2aaac5-1e9f-4f8a-9a5b-268c02491f71';
const FRAMEWORK_KEY = 'peter_kang_3part';
const TEMPLATE_KEY  = '装修承包商'; // residential-builder angle from emailTemplates.js
const SELLER = {
  sellerName: 'Lens 朗斯家居',
  products:   'Aluminium windows and doors',
  advantage:  '300,000m² factory in Foshan, 20 years experience, AS2047 certified',
};

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_KEY'); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }
const db = createClient(url, key);

const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };

// Map a Supabase leads row → the camelCase shape generateEmails expects.
function rowToLead(r) {
  return {
    companyName:     r.company_name,
    website:         r.website || '',
    phone:           r.phone || '',
    email:           r.email || '',
    city:            r.city || '',
    state:           '',                              // not stored
    industry:        '',                              // not stored
    googleRating:    r.rating || '',
    reviewCount:     '',                              // not stored
    intentScore:     num(r.intent_score),
    icpScore:        num(r.icp_score),
    intentReasoning: r.reasoning || '',
    icpReasoning:    r.icp_reasoning || '',
  };
}

(async () => {
  // ── 1. Fetch qualified leads from this search ─────────────────────────────
  const { data: rows, error } = await db
    .from('leads')
    .select('id, company_name, website, phone, email, city, rating, intent_score, icp_score, reasoning, icp_reasoning, email1_subject')
    .eq('search_id', SEARCH_ID);
  if (error) { console.error('leads fetch failed:', error.message); process.exit(1); }

  const qualified = rows.filter(r => num(r.icp_score) >= 6 && num(r.intent_score) >= 6);
  const todo      = qualified.filter(r => !r.email1_subject);
  const skipped   = qualified.length - todo.length;

  console.log(`╔═════════════════════════════════════════════════════════════════╗`);
  console.log(`║ Email generation for search ${SEARCH_ID.slice(0, 8)}...           ║`);
  console.log(`╚═════════════════════════════════════════════════════════════════╝`);
  console.log(`  Total qualified (icp ≥6 AND intent ≥6): ${qualified.length}`);
  console.log(`  Already have emails (skipping):          ${skipped}`);
  console.log(`  To generate:                             ${todo.length}`);
  console.log(`  Framework:                               ${FRAMEWORK_KEY}`);
  console.log(`  Template key:                            ${TEMPLATE_KEY}`);
  console.log(`  Seller:                                  ${SELLER.sellerName}`);
  console.log(``);

  if (!todo.length) { console.log('Nothing to do — all qualified leads already have emails.'); process.exit(0); }

  // ── 2. Generate sequentially (generateEmails has 300ms inter-call sleep + 120s timeout) ──
  let okCount = 0, failCount = 0, emailsTotal = 0;
  let inTokens = 0, outTokens = 0;
  const startedAt = Date.now();

  for (let i = 0; i < todo.length; i++) {
    const lead = rowToLead(todo[i]);
    const tag  = `[${i + 1}/${todo.length}]`;

    try {
      const result = await generateEmails(lead, TEMPLATE_KEY, '', FRAMEWORK_KEY, null, SELLER);
      inTokens  += result.usage?.input_tokens  || 0;
      outTokens += result.usage?.output_tokens || 0;

      // Count how many of the 5 slots actually came back filled.
      const filled = [1, 2, 3, 4, 5].filter(n => !!result[`EMAIL_${n}_SUBJECT`] || !!result[`EMAIL_${n}_BODY`]).length;
      emailsTotal += filled;

      if (result.error || filled === 0) {
        console.log(`${tag} ✗ ${lead.companyName} — ${result.error || 'AI returned empty'}`);
        failCount++;
        continue;
      }

      // Persist the 5 emails (and framework/template keys) to Supabase.
      await updateLeadEmails(SEARCH_ID, lead.companyName, result, FRAMEWORK_KEY, TEMPLATE_KEY);
      console.log(`${tag} ✓ Generated emails for ${lead.companyName} - ${filled} emails`);
      okCount++;
    } catch (err) {
      console.log(`${tag} ✗ ${lead.companyName} — ${err.message}`);
      failCount++;
    }
  }

  // ── 3. Summary ────────────────────────────────────────────────────────────
  const secs       = ((Date.now() - startedAt) / 1000).toFixed(1);
  // Sonnet 4 pricing: $3/MTok in, $15/MTok out.
  const costUsd    = (inTokens / 1_000_000) * 3 + (outTokens / 1_000_000) * 15;

  console.log(``);
  console.log(`════════════════════════════════════════════════════════════════════`);
  console.log(`  Done: ${okCount} leads, ${emailsTotal} emails generated`);
  console.log(`        (failed: ${failCount}, skipped already-done: ${skipped})`);
  console.log(`  Tokens: ${inTokens.toLocaleString()} in / ${outTokens.toLocaleString()} out`);
  console.log(`  Cost:   $${costUsd.toFixed(4)}`);
  console.log(`  Time:   ${secs}s`);
  console.log(``);
  console.log(`  Frontend recovery: visit /lens?search=${SEARCH_ID}`);
  console.log(`  loadSearchById() will hydrate the emails for the qualified table.`);

  process.exit(0);
})().catch(err => { console.error('Script crashed:', err); process.exit(1); });
