// One-off recovery probe: backend completed 55 enrichments but frontend stuck at 32.
// Reads Supabase directly (same creds as services/supabase.js uses) so we can
// see what the backend actually persisted, decoupled from any frontend state.
//
// Run from project root:   node scripts/recover-search.js
// Do NOT commit this file (per CLAUDE.md rule 6).

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}
const db = createClient(url, key);

// Treat scores as numbers even though the column is TEXT.
const num = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
};

const hasEmails = (l) => !!(l.email1_subject || l.email1_body);

(async () => {
  // ── 1. Latest 5 search_history rows ───────────────────────────────────────
  const { data: runs, error: runsErr } = await db
    .from('search_history')
    .select('id, created_at, query, location, max_results, total_scraped, total_qualified, total_cost_usd')
    .order('created_at', { ascending: false })
    .limit(5);
  if (runsErr) { console.error('search_history read failed:', runsErr.message); process.exit(1); }

  console.log('═══ Latest 5 search runs ═══');
  for (const r of runs) {
    console.log(`  id=${r.id}  ${r.created_at}  "${r.query}" @ ${r.location || '(no loc)'}  scraped=${r.total_scraped} qualified=${r.total_qualified ?? '—'}  cost=$${(r.total_cost_usd ?? 0).toFixed(4)}`);
  }
  console.log('');

  if (!runs.length) { console.log('No searches found.'); return; }

  // ── 2. Latest run: deep stats ─────────────────────────────────────────────
  const latest = runs[0];
  console.log(`═══ Drilling into latest run: id=${latest.id} ═══`);
  console.log(`     query="${latest.query}"  scraped=${latest.total_scraped}  qualified=${latest.total_qualified ?? '—'}\n`);

  // Schema drift: email_sent_at may not exist on every deploy. Select only
  // columns we know are documented in services/supabase.js.
  const { data: leads, error: leadsErr } = await db
    .from('leads')
    .select('id, company_name, website, email, phone, city, rating, intent_score, icp_score, reasoning, icp_reasoning, email1_subject, email1_body')
    .eq('search_id', latest.id)
    .order('created_at', { ascending: true });
  if (leadsErr) { console.error('leads read failed:', leadsErr.message); process.exit(1); }

  const total      = leads.length;
  const scored     = leads.filter(l => num(l.intent_score) > 0 || num(l.icp_score) > 0).length;
  const qualified6 = leads.filter(l => num(l.icp_score) >= 6 && num(l.intent_score) >= 6).length;
  const qualified5 = leads.filter(l => num(l.icp_score) >= 5 && num(l.intent_score) >= 5).length;
  const withEmail  = leads.filter(l => !!l.email).length;
  const emailsGen  = leads.filter(hasEmails).length;

  console.log('  Stat                          Count');
  console.log('  ----------------------------- -----');
  console.log(`  Total rows                    ${total}`);
  console.log(`  AI-scored (intent OR icp >0)  ${scored}`);
  console.log(`  Qualified (icp & intent ≥ 6) ${qualified6}     ← user threshold`);
  console.log(`  Qualified (icp & intent ≥ 5) ${qualified5}     ← code default`);
  console.log(`  Have email address            ${withEmail}`);
  console.log(`  Emails generated (drafted)    ${emailsGen}`);
  console.log('');

  // ── 3. All qualified leads (≥ 6) — what user wants to act on ─────────────
  const qualifiedList = leads
    .filter(l => num(l.icp_score) >= 6 && num(l.intent_score) >= 6)
    .sort((a, b) => (num(b.icp_score) + num(b.intent_score)) - (num(a.icp_score) + num(a.intent_score)));

  console.log(`═══ ${qualifiedList.length} qualified leads (icp ≥ 6 AND intent ≥ 6) ═══`);
  console.log('  icp/int  email?  company                                          city');
  console.log('  -------  ------  ------------------------------------------------  --------');
  for (const l of qualifiedList) {
    const icp  = String(num(l.icp_score)).padStart(2, ' ');
    const intt = String(num(l.intent_score)).padStart(2, ' ');
    const em   = l.email ? '✓' : '·';
    const name = (l.company_name || '').slice(0, 48).padEnd(48, ' ');
    const city = (l.city || '').slice(0, 8);
    console.log(`  ${icp}/${intt}    ${em}      ${name}  ${city}`);
  }
  console.log('');

  // ── 4. Frontend recovery instructions ─────────────────────────────────────
  console.log('═══ Frontend recovery ═══');
  console.log(`  Reload the app, then visit:`);
  console.log(`    /app?search=${latest.id}`);
  console.log(`    /lens?search=${latest.id}`);
  console.log(`  loadSearchById() will hydrate _allLeads from /api/history/${latest.id} and re-render the qualified table.`);
  console.log('');

  // ── 5. Dashboard count investigation (148 total) ──────────────────────────
  console.log('═══ Dashboard count breakdown ═══');
  const { count: totalLeadsAll, error: cErr } = await db
    .from('leads')
    .select('id', { count: 'exact', head: true });
  if (cErr) { console.warn('lead count failed:', cErr.message); }
  console.log(`  leads table total rows (across ALL search runs): ${totalLeadsAll}`);

  const top10 = runs.slice(0, 5);
  console.log(`  Breakdown by recent search_id (per-run subtotal):`);
  for (const r of top10) {
    const { count, error } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('search_id', r.id);
    if (error) { console.warn(`  search_id=${r.id} count failed: ${error.message}`); continue; }
    console.log(`    search_id=${r.id}  →  ${count} leads  (query: "${r.query}")`);
  }
  console.log('');
  console.log('  If the dashboard shows a total that exceeds this run alone, it is summing all historical search runs together — not a bug, just cumulative.');

  process.exit(0);
})().catch(err => { console.error('Recovery script crashed:', err); process.exit(1); });
