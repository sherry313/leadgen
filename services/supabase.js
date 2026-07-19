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
//   ADD COLUMN IF NOT EXISTS icp_reasoning       TEXT,
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
async function saveSearchRun({ query, location, maxResults, totalScraped }, userId) {
  const db = getClient();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from('search_history')
      .insert({ query, location, max_results: maxResults, total_scraped: totalScraped, user_id: userId || 'legacy' })
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
// Optional totalScraped backfills total_scraped for flows that insert the row
// BEFORE scraping (the /app SSE tools save with totalScraped: 0 up front).
async function updateSearchRunCosts(id, { apifyCostUsd, anthropicCostUsd, totalCostUsd, totalQualified, totalScraped }) {
  const db = getClient();
  if (!db || !id) return;
  try {
    const patch = {
      total_qualified:    totalQualified,
      apify_cost_usd:     parseFloat(apifyCostUsd.toFixed(4)),
      anthropic_cost_usd: parseFloat(anthropicCostUsd.toFixed(4)),
      total_cost_usd:     parseFloat(totalCostUsd.toFixed(4)),
    };
    if (totalScraped != null) patch.total_scraped = totalScraped;
    const { error } = await db
      .from('search_history')
      .update(patch)
      .eq('id', id);
    if (error) throw error;
    console.log(`[Supabase] Costs updated for id=${id}: apify=$${apifyCostUsd.toFixed(4)}  anthropic=$${anthropicCostUsd.toFixed(4)}  total=$${totalCostUsd.toFixed(4)}`);
  } catch (err) {
    console.error('[Supabase] updateSearchRunCosts FAILED:', err.message, err.details ?? '', err.hint ?? '');
  }
}

async function getCostSummary(userId) {
  const db = getClient();
  if (!db) return { runs: [], totalCostUsd: 0, monthCostUsd: 0 };
  try {
    let q = db
      .from('search_history')
      .select('id, created_at, query, location, max_results, total_scraped, total_qualified, apify_cost_usd, anthropic_cost_usd, total_cost_usd')
      .order('created_at', { ascending: false });
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data, error } = await q;
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

async function getExistingLeadKeys(userId) {
  const db = getClient();
  if (!db) return { placeIds: new Set(), phones: new Set(), emails: new Set(), domains: new Set() };
  try {
    let q = db.from('leads').select('place_id, phone_normalized, email, website_domain');
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data, error } = await q;
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

async function saveLeads(searchId, leads, userId) {
  const db = getClient();
  if (!db || !searchId) return;
  const rows = leads
    .filter(l => !l.status?.startsWith('filtered'))
    .map(l => ({
      search_id:        searchId,
      user_id:          userId || 'legacy',
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
    // Fallback for schema drift: strip ONLY the columns we know are safe to drop
    // because they're either non-critical (icp_reasoning) or re-persisted elsewhere
    // (email columns are re-saved by updateLeadEmails after generate-emails).
    //
    // DO NOT strip icp_score — it's a documented required column and drives the
    // frontend qualification gate (icp_score >= 5 AND intent_score >= 5). Dropping
    // it silently turned every lead's icp_score to null and broke qualification
    // for every search.
    if (err.message?.includes('column') || err.message?.includes('schema cache')) {
      console.warn(`[Supabase] Initial insert failed (${err.message}) — retrying without icp_reasoning + email columns. Run the migration in this file's header comment to fix permanently.`);
      const fallbackRows = rows.map(({ icp_reasoning, email1_subject, email1_body, email2_subject, email2_body, email3_subject, email3_body, email4_subject, email4_body, email5_subject, email5_body, ...core }) => core);
      try {
        const { data, error: err2 } = await db.from('leads').insert(fallbackRows).select('id, company_name');
        if (err2) throw err2;
        console.log(`[Supabase] Saved ${fallbackRows.length} leads via fallback (icp_reasoning + emails dropped; icp_score preserved)`);
        return data;
      } catch (err2) {
        console.error('[Supabase] saveLeads fallback also failed:', err2.message, err2.details ?? '', err2.hint ?? '');
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

async function getLeadById(id, userId) {
  const db = getClient();
  if (!db || !id) return null;
  try {
    let q = db.from('leads').select('*').eq('id', id);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data, error } = await q.single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getLeadById failed:', err.message);
    return null;
  }
}

// NOTE: only email_sent_at exists on leads — an email_sent_number column was
// never added, and including it made this whole UPDATE fail silently
// (the "已发邮件 always 0" bug). emailNumber is kept for logging only.
async function updateEmailSent(id, emailNumber) {
  const db = getClient();
  if (!db || !id) return;
  try {
    const { error } = await db.from('leads')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    console.log(`[Supabase] Lead ${id} marked email_sent: #${emailNumber}`);
  } catch (err) {
    console.warn('[Supabase] updateEmailSent failed:', err.message);
  }
}

// Mark a lead as emailed right after a successful Instantly push — matched by
// email because the push paths don't always carry the DB id. Never overwrites
// an existing timestamp (first send wins). Scope to searchId whenever the
// caller has one: the same company re-scraped in a later search must NOT
// inherit the sent flag, or that search's 已发 count lies.
async function markLeadEmailedByEmail(email, userId, searchId) {
  const db = getClient();
  if (!db || !email?.trim()) return;
  try {
    let q = db.from('leads')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('email', email.trim())
      .is('email_sent_at', null);
    if (searchId) q = q.eq('search_id', searchId);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { error } = await q;
    if (error) throw error;
  } catch (err) {
    console.warn('[Supabase] markLeadEmailedByEmail failed:', err.message);
  }
}

// Zero a search's qualified counter before a re-filter re-accumulates it —
// without this every re-run of AI 筛选 doubles total_qualified.
async function resetSearchQualified(searchId, userId) {
  const db = getClient();
  if (!db || !searchId) return;
  try {
    let q = db.from('search_history').update({ total_qualified: 0 }).eq('id', searchId);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { error } = await q;
    if (error) throw error;
  } catch (err) {
    console.warn('[Supabase] resetSearchQualified failed:', err.message);
  }
}

// Per-search sent-lead counts for the history cards: { search_id: n }.
async function getSentCountsBySearch(userId) {
  const db = getClient();
  if (!db) return {};
  try {
    let q = db.from('leads')
      .select('search_id')
      .not('email_sent_at', 'is', null);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;
    const counts = {};
    for (const r of data || []) {
      if (r.search_id) counts[r.search_id] = (counts[r.search_id] || 0) + 1;
    }
    return counts;
  } catch (err) {
    console.warn('[Supabase] getSentCountsBySearch failed:', err.message);
    return {};
  }
}

// Per-search "已写好邮件" counts — drives the history rows' pipeline status
// (已抓取 → 已筛选 → 已写邮件 → 已发送).
async function getWrittenCountsBySearch(userId) {
  const db = getClient();
  if (!db) return {};
  try {
    let q = db.from('leads')
      .select('search_id')
      .not('email1_subject', 'is', null)
      .neq('email1_subject', '');
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;
    const counts = {};
    for (const r of data || []) {
      if (r.search_id) counts[r.search_id] = (counts[r.search_id] || 0) + 1;
    }
    return counts;
  } catch (err) {
    console.warn('[Supabase] getWrittenCountsBySearch failed:', err.message);
    return {};
  }
}

async function getSearchHistory(limit = 30, userId) {
  const db = getClient();
  if (!db) return [];
  try {
    let q = db
      .from('search_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getSearchHistory failed:', err.message);
    return [];
  }
}

async function getLeadsForSearch(searchId, userId) {
  const db = getClient();
  if (!db) return [];
  try {
    let q = db
      .from('leads')
      .select('*')
      .eq('search_id', searchId)
      .order('created_at', { ascending: true });
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Supabase] getLeadsForSearch failed:', err.message);
    return [];
  }
}

// Persist the /app AI-filter verdict onto the stored lead so 查看线索 can show
// it later without re-running (and re-paying for) the filter. Stored as
// icp_score 'pass'|'fail' (TEXT — legacy pipelines write numeric strings; /app
// rows never carried a score before, so the values can't collide) plus
// icp_reasoning = the AI's one-line reason.
async function updateLeadFilterResult(searchId, { email, companyName }, { recommended, reason }, userId) {
  const db = getClient();
  if (!db || !searchId) return;
  try {
    let q = db.from('leads')
      .update({ icp_score: recommended ? 'pass' : 'fail', icp_reasoning: reason || '' })
      .eq('search_id', searchId);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    if (email) q = q.eq('email', email);
    else if (companyName) q = q.eq('company_name', companyName);
    else return;
    const { error } = await q;
    if (error) throw error;
  } catch (err) {
    console.warn('[Supabase] updateLeadFilterResult failed:', err.message);
  }
}

// Append step-2 costs to an existing search_history row. `sonnetCostUsd` is any
// Anthropic cost (Haiku included — historical name). Optional qualifiedDelta
// increments total_qualified (the /app per-lead AI filter bumps it as leads pass).
async function appendSearchRunCosts(id, { sonnetCostUsd = 0, firecrawlCostUsd = 0, qualifiedDelta = 0 }, userId) {
  const db = getClient();
  if (!db || !id) return;
  try {
    let _readQ = db
      .from('search_history')
      .select('anthropic_cost_usd, total_cost_usd, total_qualified')
      .eq('id', id);
    if (userId && userId !== 'legacy') _readQ = _readQ.eq('user_id', userId);
    const { data, error: readErr } = await _readQ.single();
    if (readErr) throw readErr;

    const step2Total     = sonnetCostUsd + firecrawlCostUsd;
    const prevAnthropic  = data?.anthropic_cost_usd || 0;
    const prevTotal      = data?.total_cost_usd     || 0;

    const patch = {
      anthropic_cost_usd: parseFloat((prevAnthropic + sonnetCostUsd).toFixed(4)),
      total_cost_usd:     parseFloat((prevTotal + step2Total).toFixed(4)),
    };
    if (qualifiedDelta) patch.total_qualified = (data?.total_qualified || 0) + qualifiedDelta;

    const { error: updateErr } = await db
      .from('search_history')
      .update(patch)
      .eq('id', id);
    if (updateErr) throw updateErr;

    console.log(`[Supabase] Step2 costs appended id=${id}: sonnet=$${sonnetCostUsd.toFixed(4)} firecrawl=$${firecrawlCostUsd.toFixed(4)}`);
  } catch (err) {
    console.error('[Supabase] appendSearchRunCosts FAILED:', err.message, err.details ?? '', err.hint ?? '');
  }
}

// Per-user free-quota (user-facing USD, i.e. real × COST_MARKUP). No row in
// user_quotas → default $5. Fail-open to the default on DB errors so a missing
// table or outage never locks users out.
async function getUserQuotaUsd(userId) {
  const db = getClient();
  if (!db || !userId) return 5;
  try {
    const { data, error } = await db
      .from('user_quotas')
      .select('quota_usd')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data?.quota_usd != null ? Number(data.quota_usd) : 5;
  } catch (err) {
    console.error('[Supabase] getUserQuotaUsd FAILED (default $5):', err.message);
    return 5;
  }
}

async function getEmailsSentCount(userId) {
  const db = getClient();
  if (!db) return 0;
  try {
    let q = db
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .not('email_sent_at', 'is', null);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.warn('[Supabase] getEmailsSentCount failed:', err.message);
    return 0;
  }
}

async function deleteSearchRun(searchId, userId) {
  const db = getClient();
  if (!db || !searchId) return false;
  try {
    let leadsQ = db.from('leads').delete().eq('search_id', searchId);
    let histQ  = db.from('search_history').delete().eq('id', searchId);
    // Scope deletes to the owner so one user can't delete another's run by id.
    // Legacy token keeps its pre-migration cross-user behavior.
    if (userId && userId !== 'legacy') {
      leadsQ = leadsQ.eq('user_id', userId);
      histQ  = histQ.eq('user_id', userId);
    }
    const { error: leadsErr } = await leadsQ;
    if (leadsErr) throw leadsErr;
    const { error: histErr } = await histQ;
    if (histErr) throw histErr;
    console.log(`[Supabase] Deleted search run ${searchId} + its leads`);
    return true;
  } catch (err) {
    console.warn('[Supabase] deleteSearchRun failed:', err.message);
    return false;
  }
}

// ── Product profiles (saved 业务信息 presets, per user) ───────────────────────
// A "product profile" is one whole /app 业务信息 object saved under a name so the
// user can switch products without re-typing. Scoped by user_id like history.
// Requires table (run once in Supabase SQL editor):
//   create table if not exists product_profiles (
//     id uuid primary key default gen_random_uuid(),
//     user_id text not null,
//     name text not null,
//     data jsonb not null default '{}'::jsonb,
//     created_at timestamptz not null default now(),
//     updated_at timestamptz not null default now()
//   );
//   create index if not exists product_profiles_user_id_idx on product_profiles(user_id);
async function listProductProfiles(userId) {
  const db = getClient();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from('product_profiles')
      .select('*')
      .eq('user_id', userId || 'legacy')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[Supabase] listProductProfiles failed:', err.message);
    return [];
  }
}

async function createProductProfile(userId, name, data) {
  const db = getClient();
  if (!db) return null;
  try {
    const { data: row, error } = await db
      .from('product_profiles')
      .insert({ user_id: userId || 'legacy', name, data: data || {} })
      .select('*')
      .single();
    if (error) throw error;
    console.log(`[Supabase] Product profile created: "${name}" (user=${userId})`);
    return row;
  } catch (err) {
    console.error('[Supabase] createProductProfile FAILED:', err.message, err.details ?? '', err.hint ?? '');
    return null;
  }
}

// Ensure a product exists for this user, keyed by name (one 品类 = one product).
// Called at search-start so every run is filed under the product whose business
// info it actually used — no reliance on a drift-prone "active product" pointer.
// Existing product → refresh its business-info data but PRESERVE searchIds.
async function ensureProductProfile(userId, name, data) {
  const db = getClient();
  if (!db || !name) return null;
  try {
    const { data: rows, error: findErr } = await db
      .from('product_profiles')
      .select('*')
      .eq('user_id', userId || 'legacy')
      .ilike('name', name);              // no wildcards → exact, case-insensitive
    if (findErr) throw findErr;
    if (rows && rows.length) {
      const existing = rows[0];
      // Refresh stored business-info but keep the search links intact.
      const mergedData = { ...(data || {}), searchIds: existing.data?.searchIds || [] };
      const { data: upd, error: uErr } = await db
        .from('product_profiles')
        .update({ data: mergedData, updated_at: new Date().toISOString() })
        .eq('id', existing.id).eq('user_id', userId || 'legacy')
        .select('*').single();
      if (uErr) throw uErr;
      return upd || existing;
    }
    return await createProductProfile(userId, name, data);
  } catch (err) {
    console.warn('[Supabase] ensureProductProfile failed:', err.message);
    return null;
  }
}

async function updateProductProfile(id, userId, fields) {
  const db = getClient();
  if (!db || !id) return null;
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (fields.name != null) patch.name = fields.name;
    if (fields.data != null) patch.data = fields.data;
    const { data: row, error } = await db
      .from('product_profiles')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId || 'legacy')   // scope to owner — no cross-user edits
      .select('*')
      .single();
    if (error) throw error;
    return row;
  } catch (err) {
    console.warn('[Supabase] updateProductProfile failed:', err.message);
    return null;
  }
}

async function deleteProductProfile(id, userId) {
  const db = getClient();
  if (!db || !id) return false;
  try {
    const { error } = await db
      .from('product_profiles')
      .delete()
      .eq('id', id)
      .eq('user_id', userId || 'legacy');  // scope to owner — no cross-user deletes
    if (error) throw error;
    console.log(`[Supabase] Product profile deleted: ${id}`);
    return true;
  } catch (err) {
    console.warn('[Supabase] deleteProductProfile failed:', err.message);
    return false;
  }
}

// 把一次搜索挂到产品名下：searchId 追加进 profile.data.searchIds（jsonb 自由字段，
// 无 schema 变更）。改名走 profile.name，历史标签自动跟随。read-modify-write，
// 并发窗口极小可接受。
async function appendProductSearch(productId, userId, searchId) {
  const db = getClient();
  if (!db || !productId || !searchId) return;
  try {
    const { data: row, error: readErr } = await db.from('product_profiles')
      .select('data').eq('id', productId).eq('user_id', userId || 'legacy').single();
    if (readErr) throw readErr;
    const d = row?.data || {};
    const ids = Array.isArray(d.searchIds) ? d.searchIds : [];
    if (ids.includes(searchId)) return;
    ids.push(searchId);
    const { error } = await db.from('product_profiles')
      .update({ data: { ...d, searchIds: ids } })
      .eq('id', productId).eq('user_id', userId || 'legacy');
    if (error) throw error;
    console.log(`[Supabase] search ${searchId} tagged to product ${productId}`);
  } catch (err) {
    console.warn('[Supabase] appendProductSearch failed:', err.message);
  }
}

// 产品客户表：该产品所有搜索里"发过邮件"的客户（口径已拍板：只收发过的）。
async function getProductSentLeads(productId, userId) {
  const db = getClient();
  if (!db || !productId) return { profile: null, leads: [] };
  try {
    let q = db.from('product_profiles').select('*').eq('id', productId);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data: profile, error: pErr } = await q.single();
    if (pErr) throw pErr;
    const ids = Array.isArray(profile?.data?.searchIds) ? profile.data.searchIds : [];
    if (!ids.length) return { profile, leads: [] };
    let lq = db.from('leads')
      .select('company_name, website, email, phone, city, rating, icp_score, icp_reasoning, email_sent_at, search_id')
      .in('search_id', ids)
      .not('email_sent_at', 'is', null)
      .order('email_sent_at', { ascending: false });
    if (userId && userId !== 'legacy') lq = lq.eq('user_id', userId);
    const { data: leads, error: lErr } = await lq;
    if (lErr) throw lErr;
    return { profile, leads: leads || [] };
  } catch (err) {
    console.warn('[Supabase] getProductSentLeads failed:', err.message);
    return { profile: null, leads: [] };
  }
}

// 产品「全部」线索（不限是否已发）——用于「邮件管理」状态提醒：分辨
// 待写邮件(email1_subject 空) / 待发送(写了 email_sent_at 空) / 已发送(email_sent_at 有值)。
// 刻意与 getProductSentLeads 分开——后者口径"只已发"(客户表/导出用)，不要动。
async function getProductAllLeads(productId, userId) {
  const db = getClient();
  if (!db || !productId) return { profile: null, leads: [] };
  try {
    let q = db.from('product_profiles').select('*').eq('id', productId);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data: profile, error: pErr } = await q.single();
    if (pErr) throw pErr;
    const ids = Array.isArray(profile?.data?.searchIds) ? profile.data.searchIds : [];
    if (!ids.length) return { profile, leads: [], searches: [] };
    // 每批搜索的元信息（搜索词/地区/时间/爬取数）——用于按"每次收的线索"分组显示。
    let sq = db.from('search_history').select('id, query, location, created_at, total_scraped').in('id', ids);
    if (userId && userId !== 'legacy') sq = sq.eq('user_id', userId);
    const { data: searches } = await sq;   // 失败容错：下面用 (searches||[])
    let lq = db.from('leads')
      .select('id, company_name, website, email, phone, city, icp_score, email_sent_at, search_id, created_at, email_framework_key, email1_subject, email1_body, email2_subject, email2_body, email3_subject, email3_body, email4_subject, email4_body, email5_subject, email5_body')
      .in('search_id', ids)
      .order('created_at', { ascending: false });
    if (userId && userId !== 'legacy') lq = lq.eq('user_id', userId);
    const { data: leads, error: lErr } = await lq;
    if (lErr) throw lErr;
    return { profile, leads: leads || [], searches: searches || [] };
  } catch (err) {
    console.warn('[Supabase] getProductAllLeads failed:', err.message);
    return { profile: null, leads: [], searches: [] };
  }
}

// ── 管理员：全部账号总览（邮箱/注册/最后登录/搜索次数/花费/已发/额度） ────────
async function getAdminUsersOverview() {
  const db = getClient();
  if (!db) return [];
  try {
    const [{ data: au, error: aErr }, { data: hist }, { data: sent }, { data: quotas }] = await Promise.all([
      db.auth.admin.listUsers({ page: 1, perPage: 200 }),
      db.from('search_history').select('user_id, total_cost_usd'),
      db.from('leads').select('user_id').not('email_sent_at', 'is', null),
      db.from('user_quotas').select('user_id, quota_usd'),
    ]);
    if (aErr) throw aErr;
    const spend = {}, searches = {}, sentN = {}, quota = {};
    (hist || []).forEach(r => { spend[r.user_id] = (spend[r.user_id] || 0) + (r.total_cost_usd || 0); searches[r.user_id] = (searches[r.user_id] || 0) + 1; });
    (sent || []).forEach(r => { sentN[r.user_id] = (sentN[r.user_id] || 0) + 1; });
    (quotas || []).forEach(r => { quota[r.user_id] = Number(r.quota_usd); });
    return (au?.users || []).map(u => ({
      id: u.id,
      email: u.email || '',
      createdAt: u.created_at || null,
      lastSignInAt: u.last_sign_in_at || null,
      searches: searches[u.id] || 0,
      sentCount: sentN[u.id] || 0,
      spendRealUsd: parseFloat((spend[u.id] || 0).toFixed(4)),
      quotaUsd: quota[u.id] != null ? quota[u.id] : 5, // 无记录 = 默认 $5
    }));
  } catch (err) {
    console.warn('[Supabase] getAdminUsersOverview failed:', err.message);
    return [];
  }
}

// ── 管理员：设置某账号的额度（user_quotas upsert，user-facing USD） ───────────
async function setUserQuotaUsd(userId, quotaUsd) {
  const db = getClient();
  if (!db || !userId) return false;
  try {
    const { error } = await db.from('user_quotas')
      .upsert({ user_id: userId, quota_usd: quotaUsd }, { onConflict: 'user_id' });
    if (error) throw error;
    console.log(`[Supabase] quota set: user=${userId} quota=$${quotaUsd}`);
    return true;
  } catch (err) {
    console.error('[Supabase] setUserQuotaUsd FAILED:', err.message);
    return false;
  }
}

// 成果条：发过邮件的客户数 + 实际发出的开发信封数（按每客户已生成的序列封数
// 累加；老数据序列未落库的按整套 5 封计）。
async function getSentEmailStats(userId) {
  const db = getClient();
  if (!db) return { customers: 0, emails: 0 };
  try {
    let q = db.from('leads')
      .select('email1_subject, email2_subject, email3_subject, email4_subject, email5_subject')
      .not('email_sent_at', 'is', null);
    if (userId && userId !== 'legacy') q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;
    let emails = 0;
    (data || []).forEach(r => {
      let n = 0;
      for (let i = 1; i <= 5; i++) if ((r['email' + i + '_subject'] || '').trim()) n++;
      emails += n || 5;
    });
    return { customers: (data || []).length, emails };
  } catch (err) {
    console.warn('[Supabase] getSentEmailStats failed:', err.message);
    return { customers: 0, emails: 0 };
  }
}

module.exports = { saveSearchRun, updateSearchRunCosts, appendSearchRunCosts, updateLeadFilterResult, saveLeads, updateLeadEmails, getExistingLeadKeys, getSearchHistory, getLeadsForSearch, getLeadById, updateEmailSent, markLeadEmailedByEmail, getSentCountsBySearch, resetSearchQualified, getCostSummary, getEmailsSentCount, getUserQuotaUsd, deleteSearchRun, listProductProfiles, createProductProfile, ensureProductProfile, updateProductProfile, deleteProductProfile, appendProductSearch, getProductSentLeads, getProductAllLeads, getSentEmailStats, getAdminUsersOverview, setUserQuotaUsd, getWrittenCountsBySearch };
