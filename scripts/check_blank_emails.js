require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL or SUPABASE_KEY not set in .env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

function hr(label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(` ${label}`);
  console.log('='.repeat(60));
}

async function main() {
  hr('Supabase blank-email audit — ' + new Date().toISOString());

  // ── 1. Total leads ────────────────────────────────────────────
  const { count: total, error: e0 } = await db
    .from('leads')
    .select('id', { count: 'exact', head: true });
  if (e0) { console.error('Count query failed:', e0.message); process.exit(1); }
  console.log(`\nTotal leads in table: ${total}`);

  // ── 2. Leads with NULL or empty email1_body ───────────────────
  const { count: nullCount, error: e1 } = await db
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .or('email1_body.is.null,email1_body.eq.');
  if (e1) { console.error('Null query failed:', e1.message); }
  else console.log(`Leads with email1_body NULL or empty: ${nullCount} (${total ? ((nullCount/total)*100).toFixed(1) : '?'}%)`);

  // ── 3. Leads with email1_body shorter than 50 chars ──────────
  const { data: shortRows, error: e2 } = await db
    .from('leads')
    .select('id, company_name, email, email1_body, created_at')
    .not('email1_body', 'is', null)
    .neq('email1_body', '');
  if (e2) { console.error('Short query failed:', e2.message); }
  else {
    const short = (shortRows || []).filter(r => (r.email1_body || '').length < 50);
    console.log(`Leads with email1_body 1-49 chars (suspiciously short): ${short.length}`);
    if (short.length > 0) {
      console.log('  Sample (first 3):');
      short.slice(0, 3).forEach(r =>
        console.log(`    id=${r.id} "${r.company_name}" → "${r.email1_body}"`)
      );
    }
  }

  // ── 4. NOTE: email_sent_at column does not exist in current schema ─
  console.log(`\nNOTE: email_sent_at column is missing from leads table (schema migration not applied).`);
  console.log(`      Cannot determine which leads were already pushed to Instantly via DB.`);

  // ── 5. Sample leads with blank email1_body — full row ─────────
  hr('Sample leads with blank email1_body (up to 5)');

  const { data: samples, error: e4 } = await db
    .from('leads')
    .select('id, search_id, company_name, email, icp_score, intent_score, email1_body, email2_body, email3_body, email4_body, email5_body, email1_subject, email_framework_key, email_template_key, created_at')
    .or('email1_body.is.null,email1_body.eq.')
    .order('created_at', { ascending: false })
    .limit(5);
  if (e4) { console.error('Samples query failed:', e4.message); }
  else {
    (samples || []).forEach((r, i) => {
      console.log(`\n--- Sample ${i + 1} ---`);
      console.log(`  id:                 ${r.id}`);
      console.log(`  search_id:          ${r.search_id}`);
      console.log(`  company_name:       ${r.company_name}`);
      console.log(`  email:              ${r.email}`);
      console.log(`  icp_score:          ${r.icp_score}`);
      console.log(`  intent_score:       ${r.intent_score}`);
      console.log(`  email_framework_key:${r.email_framework_key}`);
      console.log(`  email_template_key: ${r.email_template_key}`);
      console.log(`  created_at:         ${r.created_at}`);
      console.log(`  email1_subject:     "${r.email1_subject || ''}"`);
      console.log(`  email1_body:        "${r.email1_body || ''}"`);
      console.log(`  email2_body:        "${(r.email2_body || '').slice(0, 80)}${(r.email2_body||'').length > 80 ? '...' : ''}"`);
      console.log(`  email3_body:        "${(r.email3_body || '').slice(0, 80)}${(r.email3_body||'').length > 80 ? '...' : ''}"`);
      console.log(`  email4_body:        "${(r.email4_body || '').slice(0, 80)}${(r.email4_body||'').length > 80 ? '...' : ''}"`);
      console.log(`  email5_body:        "${(r.email5_body || '').slice(0, 80)}${(r.email5_body||'').length > 80 ? '...' : ''}"`);
    });
  }

  // ── 6. By-search-run breakdown ────────────────────────────────
  hr('Per-search-run breakdown (null email1_body count)');

  const { data: allLeads, error: e5 } = await db
    .from('leads')
    .select('id, search_id, email1_body');
  if (e5) { console.error('All-leads query failed:', e5.message); }
  else {
    const byRun = {};
    (allLeads || []).forEach(r => {
      const sid = r.search_id || 'no_search_id';
      if (!byRun[sid]) byRun[sid] = { total: 0, blank: 0 };
      byRun[sid].total++;
      if (!r.email1_body || r.email1_body.trim() === '') byRun[sid].blank++;
    });
    Object.entries(byRun)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([sid, s]) => {
        const pct = s.total > 0 ? ((s.blank / s.total) * 100).toFixed(0) : '?';
        console.log(`  search_id ${sid}: ${s.total} leads, ${s.blank} blank (${pct}%)`);
      });
  }

  // ── 7. email_framework_key / template_key on blank vs non-blank ──
  hr('Framework/template key distribution: blank vs non-blank email1_body');

  const { data: allFwData, error: e6 } = await db
    .from('leads')
    .select('email1_body, email_framework_key, email_template_key');
  if (e6) { console.error('Framework query failed:', e6.message); }
  else {
    const blankFw = {}, okFw = {};
    (allFwData || []).forEach(r => {
      const fk = r.email_framework_key || '(null)';
      const isBlank = !r.email1_body || r.email1_body.trim() === '';
      const bucket = isBlank ? blankFw : okFw;
      bucket[fk] = (bucket[fk] || 0) + 1;
    });
    console.log('\n  BLANK email1_body by framework_key:');
    Object.entries(blankFw).sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`    ${k}: ${n}`));
    console.log('\n  OK email1_body by framework_key:');
    Object.entries(okFw).sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`    ${k}: ${n}`));
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
