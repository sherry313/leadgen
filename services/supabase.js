require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    console.warn('[Supabase] SUPABASE_URL or SUPABASE_KEY not set — history disabled.');
    return null;
  }
  _client = createClient(url, key);
  return _client;
}

// Required schema (run once in Supabase SQL editor if columns are missing):
// ALTER TABLE search_history
//   ADD COLUMN IF NOT EXISTS apify_cost_usd     DECIMAL(10,4),
//   ADD COLUMN IF NOT EXISTS anthropic_cost_usd  DECIMAL(10,4),
//   ADD COLUMN IF NOT EXISTS total_cost_usd      DECIMAL(10,4);
//
// ALTER TABLE leads
//   ADD COLUMN IF NOT EXISTS icp_score           TEXT,
//   ADD COLUMN IF NOT EXISTS email1_subject      TEXT,
//   ADD COLUMN IF NOT EXISTS email1_body         TEXT,
//   ADD COLUMN IF NOT EXISTS email2_subject      TEXT,
//   ADD COLUMN IF NOT EXISTS email2_body         TEXT,
//   ADD COLUMN IF NOT EXISTS email3_subject      TEXT,
//   ADD COLUMN IF NOT EXISTS email3_body         TEXT,
//   ADD COLUMN IF NOT EXISTS email4_subject      TEXT,
//   ADD COLUMN IF NOT EXISTS email4_body         TEXT,
//   ADD COLUMN IF NOT EXISTS email5_subject      TEXT,
//   ADD COLUMN IF NOT EXISTS email5_body         TEXT,
//   ADD COLUMN IF NOT EXISTS email_framework_key TEXT,
//   ADD COLUMN IF NOT EXISTS email_template_key  TEXT;

// Step 1: INSERT a new run row and return its ID (called before the processing loop)
async function saveSearchRun({ query, location, maxResults, totalScraped }) {
  const db = getClient();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from('search_history')
      .insert({ query, location, max_results: maxResults, total_scraped: totalScraped })
      .select('id')
      .single();
    if (error) throw error;
    console.log(`[Supabase] Search run created: id=${data.id}`);
    return data.id;
  } catch (err) {
    console.error('[Supabase] saveSearchRun FAILED:', err.message, err.details ?? '', err.hint ?? '');
    return null;
  }
}

// Step 2: UPDATE the run row with costs and qualified count (called after processing)
async function updateSearchRunCosts(id, { apifyCostUsd, anthropicCostUsd, totalCostUsd, totalQualified }) {
  const db = getClient();
  if (!db || !id) return;
  try {
    const { error } = await db
      .from('search_history')
      .update({
        total_qualified:    totalQualified,
        apify_cost_usd:     parseFloat(apifyCostUsd.toFixed(4)),
        anthropic_cost_usd: parseFloat(anthropicCostUsd.toFixed(4)),
        total_cost_usd:     parseFloat(totalCostUsd.toFixed(4)),
      })
      .eq('id', id);
    if (error) throw error;
    console.log(`[Supabase] Costs updated for id=${id}: apify=$${apifyCostUsd.toFixed(4)}  anthropic=$${anthropicCostUsd.toFixed(4)}  total=$${totalCostUsd.toFixed(4)}`);
  } catch (err) {
    console.error('[Supabase] updateSearchRunCosts FAILED:', err.message, err.details ?? '', err.hint ?? '');
  }
}

async function getCostSummary() {
  const db = getClient();
  if (!db) return { runs: [], totalCostUsd: 0, monthCostUsd: 0 };
  try {
    const { data, error } = await db
      .from('search_history')
      .select('id, created_at, query, location, max_results, total_scraped, total_qualified, apify_cost_usd, anthropic_cost_usd, total_cost_usd')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const totalCostUsd = data.reduce((s, r) => s + (r.total_cost_usd || 0), 0);
    const monthStart   = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const monthCostUsd = data
      .filter(r => r.created_at >= monthStart)
      .reduce((s, r) => s + (r.total_cost_usd || 0), 0);

    return { runs: data, totalCostUsd, monthCostUsd };
  } catch (err) {
    console.warn('[Supabase] getCostSummary failed:', err.message);
    return { runs: [], totalCostUsd: 0, monthCostUsd: 0 };
  }
}

async function getExistingLeadKeys() {
  const db = getClient();
  if (!db) return { placeIds: new Set(), phones: new Set(), emails: new Set(), domains: new Set() };
  try {
    const { data, error } = await db.from('leads').select('place_id, phone_normalized, email, website_domain');
    if (error) throw error;
    return {
      placeIds: new Set(data.map(r => r.place_id).filter(Boolean)),
      phones:   new Set(data.map(r => r.phone_normalized).filter(Boolean)),
      emails:   new Set(data.map(r => r.email?.toLowerCase()).filter(Boolean)),
      domains:  new Set(data.map(r => r.website_domain).filter(Boolean)),
    };
  } catch (err) {
    console.warn('[Supabase] getExistingLeadKeys failed:', err.message);
    return { placeIds: new Set(), phones: new Set(), emails: new Set(), domains: new Set() };
  }
}

async function saveLeads(searchId, leads) {
  const db = getClient();
  if (!db || !searchId) return;
  const rows = leads
    .filter(l => !l.status?.startsWith('filtered'))
    .map(l => ({
      search_id:        searchId,
      company_name:     l.companyName,
      website:          l.website,
      phone:            l.phone,
      email:            l.email,
      city:             l.city,
      rating:           String(l.googleRating ?? ''),
      intent_score:     String(l.intentScore   ?? ''),
      icp_score:        String(l.icpScore      ?? ''),
      reasoning:        l.intentReasoning,
      icp_reasoning:    l.icpReasoning,
      place_id:         l.placeId || '',
      phone_normalized: l.phone?.replace(/\D/g, '') || '',
      website_domain:   l.website ? (() => { try { return new URL(l.website).hostname.replace('www.', ''); } catch { return ''; } })() : '',
      email1_subject: l.EMAIL_1_SUBJECT, email1_body: l.EMAIL_1_BODY,
      email2_subject: l.EMAIL_2_SUBJECT, email2_body: l.EMAIL_2_BODY,
      email3_subject: l.EMAIL_3_SUBJECT, email3_body: l.EMAIL_3_BODY,
      email4_subject: l.EMAIL_4_SUBJECT, email4_body: l.EMAIL_4_BODY,
      email5_subject: l.EMAIL_5_SUBJECT, email5_body: l.EMAIL_5_BODY,
    }));
  if (!rows.length) return null;
  try {
    const { data, error } = await db.from('leads').insert(rows).select('id, company_name');
    if (error) throw error;
    console.log(`[Supabase] Saved ${rows.length} leads (email1_subject sample: "${rows[0]?.email1_subject?.slice(0, 60) || 'empty'}")`);
    return data;
  } catch (err) {
    // Retry without columns that don't exist yet in the schema
    if (err.message?.includes('icp_score') || err.message?.includes('column') || err.message?.includes('schema cache')) {
      console.warn('[Supabase] Schema missing columns — EMAIL DATA WILL BE LOST. Run migration. Error:', err.message);
      const fallbackRows = rows.map(({ icp_score, icp_reasoning, place_id, phone_normalized, website_domain, email1_subject, email1_body, email2_subject, email2_body, email3_subject, email3_body, email4_subject, email4_body, email5_subject, email5_body, ...core }) => core);
      try {
        const { data, error: err2 } = await db.from('leads').insert(fallbackRows).select('id, company_name');
        if (err2) throw err2;
        console.log(`[Supabase] Saved ${fallbackRows.length} leads (core fields only — run migration to save email/icp data)`);
        return data;
      } catch (err2) {
        console.warn('[Supabase] saveLeads fallback failed:', err2.message);
        return null;
      }
    }
    console.warn('[Supabase] saveLeads failed:', err.message);
    return null;
  }
}

// UPDATE the 10 email columns + framework/template keys for one lead row.
// Called fire-and-forget from /api/leads/generate-emails after each AI response.
// Keyed on (search_id, company_name) — matches the pattern used by saveLeads INSERT.
async function updateLeadEmails(searchId, companyName, emails, frameworkKey, templateKey) {
  const db = getClient();
  if (!db || !searchId || !companyName) return;
  try {
    const { error } = await db
      .from('leads')
      .update({
        email1_subject:      emails.EMAIL_1_SUBJECT || null,
        email1_body:         emails.EMAIL_1_BODY    || null,
        email2_subject:      emails.EMAIL_2_SUBJECT || null,
        email2_body:         emails.EMAIL_2_BODY    || null,
        email3_subject:      emails.EMAIL_3_SUBJECT || null,
        email3_body:         emails.EMAIL_3_BODY    || null,
        email4_subject:      emails.EMAIL_4_SUBJECT || null,
        email4_body:         emails.EMAIL_4_BODY    || null,
        email5_subject:      emails.EMAIL_5_SUBJECT || null,
        email5_body:         emails.EMAIL_5_BODY    || null,
        email_framework_key: frameworkKey           || null,
        email_template_key:  templateKey            || null,
      })
      .eq('search_id',    searchId)
      .eq('company_name', companyName);
    if (error) throw error;
    console.log(`[Supabase] Emails persisted for "${companyName}" (framework=${frameworkKey})`);
  } catch (err) {
    console.warn(`[Supabase] updateLeadEmails failed for "${companyName}": ${err.message}`);
  }
}

async function getLeadById(id) {
  const db = getClient();
  if (!db || !id) return null;
  try {
    const { data, error } = await db.from('leads').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getLeadById failed:', err.message);
    return null;
  }
}

async function updateEmailSent(id, emailNumber) {
  const db = getClient();
  if (!db || !id) return;
  try {
    const { error } = await db.from('leads')
      .update({ email_sent_at: new Date().toISOString(), email_sent_number: emailNumber })
      .eq('id', id);
    if (error) throw error;
    console.log(`[Supabase] Lead ${id} marked email_sent: #${emailNumber}`);
  } catch (err) {
    console.warn('[Supabase] updateEmailSent failed:', err.message);
  }
}

async function getSearchHistory(limit = 30) {
  const db = getClient();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from('search_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getSearchHistory failed:', err.message);
    return [];
  }
}

async function getLeadsForSearch(searchId) {
  const db = getClient();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from('leads')
      .select('*')
      .eq('search_id', searchId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getLeadsForSearch failed:', err.message);
    return [];
  }
}

// Append step-2 costs to an existing search_history row
async function appendSearchRunCosts(id, { sonnetCostUsd, firecrawlCostUsd }) {
  const db = getClient();
  if (!db || !id) return;
  try {
    const { data, error: readErr } = await db
      .from('search_history')
      .select('anthropic_cost_usd, total_cost_usd')
      .eq('id', id)
      .single();
    if (readErr) throw readErr;

    const step2Total     = sonnetCostUsd + firecrawlCostUsd;
    const prevAnthropic  = data?.anthropic_cost_usd || 0;
    const prevTotal      = data?.total_cost_usd     || 0;

    const { error: updateErr } = await db
      .from('search_history')
      .update({
        anthropic_cost_usd: parseFloat((prevAnthropic + sonnetCostUsd).toFixed(4)),
        total_cost_usd:     parseFloat((prevTotal + step2Total).toFixed(4)),
      })
      .eq('id', id);
    if (updateErr) throw updateErr;

    console.log(`[Supabase] Step2 costs appended id=${id}: sonnet=$${sonnetCostUsd.toFixed(4)} firecrawl=$${firecrawlCostUsd.toFixed(4)}`);
  } catch (err) {
    console.error('[Supabase] appendSearchRunCosts FAILED:', err.message, err.details ?? '', err.hint ?? '');
  }
}

async function getEmailsSentCount() {
  const db = getClient();
  if (!db) return 0;
  try {
    const { count, error } = await db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .not('email_sent_at', 'is', null);
    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.warn('[Supabase] getEmailsSentCount failed:', err.message);
    return 0;
  }
}

async function deleteSearchRun(searchId) {
  const db = getClient();
  if (!db || !searchId) return false;
  try {
    const { error: leadsErr } = await db.from('leads').delete().eq('search_id', searchId);
    if (leadsErr) throw leadsErr;
    const { error: histErr } = await db.from('search_history').delete().eq('id', searchId);
    if (histErr) throw histErr;
    console.log(`[Supabase] Deleted search run ${searchId} + its leads`);
    return true;
  } catch (err) {
    console.warn('[Supabase] deleteSearchRun failed:', err.message);
    return false;
  }
}

module.exports = { saveSearchRun, updateSearchRunCosts, appendSearchRunCosts, saveLeads, updateLeadEmails, getExistingLeadKeys, getSearchHistory, getLeadsForSearch, getLeadById, updateEmailSent, getCostSummary, getEmailsSentCount, deleteSearchRun };
