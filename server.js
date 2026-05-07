require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const requireAuth = require('./middleware/auth');
const { scrapeAustralianCompanies } = require('./services/apify');
const { searchGoogleSearch }        = require('./services/googleSearch');
const { crawlWebsite, filterCompany } = require('./services/firecrawl');
const { analyzeICP, generateEmails, preFilterLead } = require('./services/aiEnrich');
const { createRunSheet, queueLead, finalizeSheets } = require('./services/googleSheets');
const { saveSearchRun, updateSearchRunCosts, appendSearchRunCosts, saveLeads, getExistingLeadKeys, getSearchHistory, getLeadsForSearch, updateEmailSent, getCostSummary, getEmailsSentCount, deleteSearchRun } = require('./services/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Main pipeline ─────────────────────────────────────────────────────────────
// POST /api/scrape
// Body: { searchQuery, location, maxResults, companyProfile }
// companyProfile: { sellerName, products, advantage }
// Header: Authorization: Bearer <ACCESS_TOKEN_SECRET>
app.post('/api/scrape', requireAuth, async (req, res) => {
  const { searchQuery, location, companyProfile = {}, dataOptions = {}, icp = '' } = req.body;
  let { maxResults } = req.body;

  // Validate required fields
  if (!searchQuery || !searchQuery.trim()) {
    return res.status(400).json({ success: false, error: 'searchQuery is required' });
  }

  maxResults = Math.min(100, Math.max(1, parseInt(maxResults) || 10));

  console.log(`\n[Pipeline] ===== Starting lead generation =====`);
  console.log(`[Pipeline] Query: "${searchQuery}" | Location: ${location} | Max: ${maxResults}`);
  console.log(`[Pipeline] Seller: ${companyProfile.sellerName || '(not set)'} | Products: ${companyProfile.products || '(not set)'}`);
  console.log('dataOptions received:', dataOptions);
  console.log(`[Pipeline] Data options:`, JSON.stringify(dataOptions));

  // Step 1: Scrape companies from Google Maps via Apify
  const { companies, apifyCostUsd: apifyActualCost } = await scrapeAustralianCompanies(searchQuery, location, maxResults, dataOptions);
  console.log(`[Pipeline] Scraped ${companies.length} companies`);

  const results = [];
  const today = new Date().toISOString().split('T')[0];

  // Create search_history row early so leads can reference its ID
  const searchId = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: companies.length });

  // Create a fresh Google Sheet for this run (non-blocking — pipeline continues even if this fails)
  await createRunSheet(searchQuery, today);

  // Process each company sequentially to respect API rate limits
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    console.log(`\n[Pipeline] Processing ${i + 1}/${companies.length}: ${company.companyName}`);

    // Step 2: Crawl company website for content
    const websiteContent = await crawlWebsite(company.website);

    // Step 3: Filter — skip local manufacturers, keep buyers/distributors
    const { shouldSkip, reason, keepSignals, lowSignal } = filterCompany(websiteContent);
    if (shouldSkip) {
      console.log(`[Pipeline] Filtered out "${company.companyName}": ${reason}`);
      results.push({
        ...company,
        websiteContent,
        status: `filtered: ${reason}`,
        dateAdded: today,
      });
      continue; // skip AI + email steps for this company
    }

    // Extra buffer between companies to avoid hitting rate limits
    await new Promise(r => setTimeout(r, 1000));

    // Step 4: AI ICP + intent scoring (email generation is now a separate step)
    const enrichment = await analyzeICP(company, websiteContent, companyProfile, icp, keepSignals, lowSignal);

    // Merge all data into the final lead object (enrichment.usage stays for post-loop cost calc)
    const lead = {
      ...company,
      websiteContent,
      keepSignals,
      lowSignal,
      ...enrichment,
      dateAdded: today,
      status: 'enriched',
    };

    // Step 5: Queue for batch write to Google Sheets (written all at once in finalizeSheets)
    queueLead(lead);

    results.push(lead);
    console.log(`[Pipeline] Done: ${lead.companyName} → ${lead.status}`);
  }

  console.log(`\n[Pipeline] ===== Complete: ${results.length}/${companies.length} processed =====\n`);

  // Flush all queued leads to Google Sheets in one batch write; returns the URL of the new sheet
  const sheetUrl = await finalizeSheets();
  console.log('[Pipeline] Sheet URL:', sheetUrl);

  // Accumulate token usage from every enriched lead
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  results.forEach(r => {
    totalInputTokens  += r.usage?.input_tokens  || 0;
    totalOutputTokens += r.usage?.output_tokens || 0;
  });

  // Compute costs — use actual Apify cost from API, fall back to estimate if missing
  const apifyCost     = apifyActualCost ?? companies.length * 0.002;
  const anthropicCost = (totalInputTokens / 1_000_000 * 3) + (totalOutputTokens / 1_000_000 * 15);
  const totalCost     = apifyCost + anthropicCost;

  console.log(`[Cost] Apify 实际费用: $${apifyCost} | Anthropic: $${anthropicCost.toFixed(4)} | Total: $${totalCost.toFixed(4)}`);
  console.log(`[Cost] Tokens — input: ${totalInputTokens}  output: ${totalOutputTokens}`);

  // Update the search_history row with qualified count + costs
  const totalQualified = results.filter(r => !r.status?.startsWith('filtered')).length;
  await updateSearchRunCosts(searchId, {
    apifyCostUsd:     apifyCost,
    anthropicCostUsd: anthropicCost,
    totalCostUsd:     totalCost,
    totalQualified,
  });

  const savedLeads = await saveLeads(searchId, results);
  if (savedLeads?.length) {
    const idMap = new Map(savedLeads.map(l => [l.company_name, l.id]));
    results.forEach(r => { if (r.companyName) r.dbId = idMap.get(r.companyName) || null; });
  }

  res.json({
    success: true,
    total: companies.length,
    processed: results.length,
    sheetUrl: req.isAdmin ? sheetUrl : undefined,
    results,
  });
});

// ── Step 1: Quick scrape + Haiku pre-filter ──────────────────────────────────
// POST /api/generate
app.post('/api/generate', requireAuth, async (req, res) => {
  const { location, maxResults: mr = 10, dataOptions = {}, dataSource = 'google_maps' } = req.body;
  const searchQuery = req.body.searchQuery?.trim() || 'renovation contractor';

  console.log('[Debug] 收到搜索请求:', JSON.stringify(req.body));
  console.log('[Debug] Apify Token:', process.env.APIFY_API_TOKEN ? '已设置' : '未设置');

  const maxResults = Math.min(100, Math.max(1, parseInt(mr) || 10));
  console.log('[Debug] req.body.maxResults (raw):', mr, '→ 解析后:', maxResults);
  console.log(`\n[Generate] ===== Step 1: ${dataSource} + Haiku pre-filter =====`);
  console.log(`[Generate] Query: "${searchQuery}" | Location: ${location} | Max: ${maxResults}`);

  const { companies, apifyCostUsd: apifyActualCost } = dataSource === 'google_search'
    ? await searchGoogleSearch(searchQuery, location, maxResults)
    : await scrapeAustralianCompanies(searchQuery, location, maxResults, dataOptions);
  console.log('[Debug] Apify 返回条数:', companies.length);
  console.log(`[Generate] Scraped ${companies.length} companies`);

  // Haiku pre-filter — all companies in parallel (low token cost)
  let haikuIn = 0, haikuOut = 0;
  const preFiltered = await Promise.all(companies.map(async (company) => {
    const { level, reason, usage } = await preFilterLead(company);
    haikuIn  += usage.input_tokens;
    haikuOut += usage.output_tokens;
    return { ...company, level, reason };
  }));

  const apifyCost  = apifyActualCost ?? companies.length * 0.002;
  const haikuCost  = (haikuIn / 1_000_000 * 0.80) + (haikuOut / 1_000_000 * 4.00);
  const step1Cost  = apifyCost + haikuCost;
  console.log(`[Cost] Step1: Apify 实际费用=$${apifyCost} | Haiku=$${haikuCost.toFixed(4)} | Step1Total=$${step1Cost.toFixed(4)}`);

  const searchId = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: companies.length });
  await updateSearchRunCosts(searchId, {
    apifyCostUsd:     apifyCost,
    anthropicCostUsd: haikuCost,
    totalCostUsd:     step1Cost,
    totalQualified:   preFiltered.filter(c => c.level !== 'skip').length,
  });

  console.log('[Debug] 过滤后条数:', preFiltered.filter(c => c.level !== 'skip').length, '(skip 条数:', preFiltered.filter(c => c.level === 'skip').length, ')');
  console.log('[Debug] 返回总条数:', preFiltered.length);
  res.json({ success: true, searchId, companies: preFiltered });
});

// ── Raw scrape only (no Haiku) ────────────────────────────────────────────────
// POST /api/scrape-raw  →  { searchId, companies, apifyCostUsd }
app.post('/api/scrape-raw', requireAuth, async (req, res) => {
  const { location, maxResults: mr = 10, dataOptions = {}, dataSource = 'google_maps' } = req.body;
  const searchQuery = req.body.searchQuery?.trim() || 'renovation contractor';
  const maxResults = Math.min(500, Math.max(1, parseInt(mr) || 10));

  console.log(`[ScrapeRaw] "${searchQuery}" @ ${location} | max ${maxResults}`);

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);

  try {
    const { companies: rawCompanies, apifyCostUsd: apifyActualCost } = dataSource === 'google_search'
      ? await searchGoogleSearch(searchQuery, location, maxResults)
      : await scrapeAustralianCompanies(searchQuery, location, maxResults, dataOptions);

    console.log('[ScrapeRaw] Got companies:', rawCompanies.length);

    // Dedup: filter out companies already in the database
    const { placeIds: existingPlaceIds, phones: existingPhones, emails: existingEmails, domains: existingDomains } = await getExistingLeadKeys();
    function extractDomain(url) {
      try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
    }
    const companies = rawCompanies.filter(c => {
      if (c.placeId && existingPlaceIds.has(c.placeId)) return false;
      const phone = c.phone?.replace(/\D/g, '');
      if (phone && existingPhones.has(phone)) return false;
      if (c.email && existingEmails.has(c.email.toLowerCase())) return false;
      const domain = c.website ? extractDomain(c.website) : '';
      if (domain && existingDomains.has(domain)) return false;
      return true;
    });
    const skippedCount = rawCompanies.length - companies.length;
    console.log(`[Dedup] 原始 ${rawCompanies.length} 条 → 去重后 ${companies.length} 条（跳过 ${skippedCount} 条）`);

    const apifyCost = apifyActualCost ?? rawCompanies.length * 0.002;
    const searchId  = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: rawCompanies.length });
    await updateSearchRunCosts(searchId, { apifyCostUsd: apifyCost, anthropicCostUsd: 0, totalCostUsd: apifyCost, totalQualified: 0 });

    for (let i = 0; i < companies.length; i++) {
      console.log('[ScrapeRaw] Sending company event:', i + 1);
      send({ type: 'company', company: companies[i], done: i + 1, total: companies.length });
    }

    console.log('[ScrapeRaw] Done event sent');
    console.log(`[ScrapeRaw] → done: totalRaw=${rawCompanies.length} skippedCount=${skippedCount} companies=${companies.length} searchId=${searchId}`);
    if (companies.length > 0) console.log('[ScrapeRaw] First company sample:', JSON.stringify(companies[0]).slice(0, 200));
    send({ type: 'done', success: true, searchId, companies, apifyCostUsd: apifyCost, totalRaw: rawCompanies.length, skippedCount });
  } catch (err) {
    console.error('[ScrapeRaw] ===== ERROR =====');
    console.error('[ScrapeRaw] message :', err.message);
    console.error('[ScrapeRaw] stack   :', err.stack);
    if (err.response) {
      console.error('[ScrapeRaw] HTTP status :', err.response.status);
      console.error('[ScrapeRaw] HTTP data   :', JSON.stringify(err.response.data).slice(0, 500));
    }
    const status = err.response?.status;
    const msg = status === 502 || status === 503 || status === 504
      ? `数据源暂时不可用（${status}），请稍后重试`
      : (err.message || '抓取失败，请重试');
    send({ type: 'error', error: msg });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── Haiku pre-filter on already-scraped companies (SSE) ──────────────────────
// POST /api/prefilter  →  SSE: progress events + final done event
app.post('/api/prefilter', requireAuth, async (req, res) => {
  const { companies, searchId } = req.body;
  if (!Array.isArray(companies) || !companies.length)
    return res.status(400).json({ success: false, error: 'companies array required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let haikuIn = 0, haikuOut = 0;
  const results = new Array(companies.length);
  let completed = 0;
  let idx = 0;
  let elapsed = 0;
  const heartbeat = setInterval(() => {
    elapsed += 2;
    send({ type: 'heartbeat', elapsed });
  }, 2000);

  try {
    const worker = async () => {
      while (idx < companies.length) {
        const i = idx++;
        const { level, reason, usage } = await preFilterLead(companies[i]);
        haikuIn  += usage.input_tokens;
        haikuOut += usage.output_tokens;
        results[i] = { ...companies[i], level, reason };
        completed++;
        send({ type: 'progress', done: completed, total: companies.length });
      }
    };

    const CONCURRENCY = 5;
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companies.length) }, () => worker()));

    const haikuCost = (haikuIn / 1_000_000 * 0.80) + (haikuOut / 1_000_000 * 4.00);
    if (searchId) {
      try { await appendSearchRunCosts(searchId, { sonnetCostUsd: haikuCost, firecrawlCostUsd: 0 }); }
      catch (e) { console.warn('[Prefilter] cost save failed:', e.message); }
    }

    console.log(`[Prefilter] ${companies.length} companies → haiku $${haikuCost.toFixed(4)}`);
    send({ type: 'done', companies: results });
  } catch (err) {
    console.error('[Prefilter] error:', err.message);
    send({ type: 'done', companies: results.map((r, i) => r || { ...companies[i], level: 'recommend', reason: '分析失败' }) });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── Step 2: Deep enrich selected companies (SSE) ─────────────────────────────
let enrichCancelled = false;

// POST /api/enrich/cancel — sets the cancellation flag for the running enrich job
app.post('/api/enrich/cancel', requireAuth, (req, res) => {
  enrichCancelled = true;
  console.log('[Enrich] Cancel requested');
  res.json({ success: true });
});

// POST /api/enrich  — streams progress events, ends with type:'done'
app.post('/api/enrich', requireAuth, async (req, res) => {
  enrichCancelled = false; // reset at start of each new job
  const { searchId, companies, companyProfile = {}, icp = '' } = req.body;
  if (!Array.isArray(companies) || !companies.length) {
    return res.status(400).json({ success: false, error: 'companies array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const today = new Date().toISOString().split('T')[0];
  await createRunSheet('enrich', today);

  const results = new Array(companies.length);
  let sonnetIn = 0, sonnetOut = 0;
  let completed = 0;
  let idx = 0;

  const processOne = async (company) => {
    try {
      const websiteContent = await crawlWebsite(company.website);
      const { shouldSkip, reason, keepSignals, lowSignal } = filterCompany(websiteContent);
      if (shouldSkip) {
        return { ...company, websiteContent, status: `filtered: ${reason}`, dateAdded: today };
      }
      const enrichment = await analyzeICP(company, websiteContent, companyProfile, icp, keepSignals, lowSignal);
      sonnetIn  += enrichment.usage?.input_tokens  || 0;
      sonnetOut += enrichment.usage?.output_tokens || 0;
      return { ...company, websiteContent, keepSignals, lowSignal, ...enrichment, dateAdded: today, status: 'enriched' };
    } catch (err) {
      console.error(`[Enrich] ${company.companyName}:`, err.message);
      return { ...company, status: 'error', dateAdded: today };
    }
  };

  const worker = async () => {
    while (idx < companies.length && !enrichCancelled) {
      const i = idx++;
      const lead = await processOne(companies[i]);
      results[i] = lead;
      if (!lead.status?.startsWith('filtered') && !lead.status?.startsWith('error')) queueLead(lead);
      completed++;
      send({ type: 'progress', lead, done: completed, total: companies.length });
    }
  };

  const CONCURRENCY = 3;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companies.length) }, () => worker()));

  const sheetUrl       = await finalizeSheets();
  const sonnetCost     = (sonnetIn / 1_000_000 * 3) + (sonnetOut / 1_000_000 * 15);
  const firecrawlCost  = companies.length * 0.003;
  const step2Cost      = sonnetCost + firecrawlCost;
  console.log(`[Cost] Step2: Sonnet=$${sonnetCost.toFixed(4)} | Firecrawl=$${firecrawlCost.toFixed(4)} | Step2Total=$${step2Cost.toFixed(4)}`);

  if (searchId) {
    await appendSearchRunCosts(searchId, { sonnetCostUsd: sonnetCost, firecrawlCostUsd: firecrawlCost });
    const savedLeads = await saveLeads(searchId, results);
    if (savedLeads?.length) {
      const idMap = new Map(savedLeads.map(l => [l.company_name, l.id]));
      results.forEach(r => { if (r.companyName) r.dbId = idMap.get(r.companyName) || null; });
    }
  }

  const qualified = results.filter(r =>
    !r.status?.startsWith('filtered') && !r.status?.startsWith('error') &&
    Number(r.icpScore || 0) >= 5 && Number(r.intentScore || 0) >= 5
  ).length;

  send({ type: 'done', results, qualified, cancelled: enrichCancelled, sheetUrl: req.isAdmin ? sheetUrl : undefined });
  res.end();
});

// ── Templates metadata ────────────────────────────────────────────────────────
// GET /api/frameworks  →  { success, frameworks: [...] }
app.get('/api/frameworks', requireAuth, (req, res) => {
  const frameworks = require('./services/emailFrameworks');
  const result = Object.entries(frameworks).map(([key, fw]) => ({
    key,
    name:             fw.name,
    en_name:          fw.en_name,
    source:           fw.source,
    description:      fw.description,
    icon:             fw.icon,
    best_for:         fw.best_for,
    is_custom:        fw.is_custom || false,
    sample_subject:   fw.sample_subject   || '',
    sample_email_body:fw.is_custom ? '' : (fw.sample_email_body || ''),
    structure:        fw.structure        || [],
  }));
  res.json({ success: true, frameworks: result });
});

// GET /api/templates  →  { success, templates: [ { key, en_label, pain_point, value_prop, emails[] } ] }
app.get('/api/templates', requireAuth, (req, res) => {
  const templates = require('./services/emailTemplates');
  const result = Object.entries(templates).map(([key, tmpl]) => ({
    key,
    en_label:        tmpl.en_label,
    zh_label:        tmpl.zh_label || key,
    pain_point:      tmpl.angle_config?.pain_point || '',
    value_prop:      tmpl.angle_config?.value_prop || '',
    angle_config:    tmpl.angle_config  || {},
    preview_samples: (tmpl.preview_samples || []).map(s => ({
      stage:   s.stage,
      day:     s.day,
      purpose: s.purpose,
      en:      s.en,
      zh:      s.zh,
    })),
  }));
  res.json({ success: true, templates: result });
});

// ── Email generation via chosen template (SSE) ────────────────────────────────
// POST /api/leads/generate-emails
// Body: { companies: Lead[], template_key: string }
// Each company must have websiteContent stored from the enrich step.
let emailGenCancelled = false;

app.post('/api/leads/generate-emails/cancel', requireAuth, (req, res) => {
  emailGenCancelled = true;
  console.log('[EmailGen] Cancel requested');
  res.json({ success: true });
});

app.post('/api/leads/generate-emails', requireAuth, async (req, res) => {
  emailGenCancelled = false;
  const { companies, template_key, framework_key, custom_framework, searchId } = req.body;

  if (!Array.isArray(companies) || !companies.length)
    return res.status(400).json({ success: false, error: 'companies array required' });
  if (!template_key)
    return res.status(400).json({ success: false, error: 'template_key required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  const results = new Array(companies.length);
  let sonnetIn = 0, sonnetOut = 0;
  let completed = 0;
  let idx = 0;

  const worker = async () => {
    while (idx < companies.length && !emailGenCancelled) {
      const i = idx++;
      const company = companies[i];
      try {
        const emails = await generateEmails(company, template_key, company.websiteContent || '', framework_key, custom_framework);
        sonnetIn  += emails.usage?.input_tokens  || 0;
        sonnetOut += emails.usage?.output_tokens || 0;
        results[i] = { ...company, ...emails, emailTemplateKey: template_key };
      } catch (err) {
        console.error(`[EmailGen] ${company.companyName}:`, err.message);
        results[i] = { ...company, emailTemplateKey: template_key };
      }
      completed++;
      send({ type: 'progress', lead: results[i], done: completed, total: companies.length });
    }
  };

  const CONCURRENCY = 2;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companies.length) }, () => worker()));

  const sonnetCost = (sonnetIn / 1_000_000 * 3) + (sonnetOut / 1_000_000 * 15);
  console.log(`[EmailGen] Done: ${completed}/${companies.length} | Sonnet $${sonnetCost.toFixed(4)}`);
  if (searchId) {
    try { await appendSearchRunCosts(searchId, { sonnetCostUsd: sonnetCost, firecrawlCostUsd: 0 }); }
    catch (e) { console.warn('[EmailGen] cost save failed:', e.message); }
  }

  send({ type: 'done', results, cancelled: emailGenCancelled });
  res.end();
});

// ── Search history ────────────────────────────────────────────────────────────
app.get('/api/history', requireAuth, async (req, res) => {
  const [history, emailsSent] = await Promise.all([getSearchHistory(), getEmailsSentCount()]);
  res.json({ success: true, history, emailsSent });
});

app.get('/api/history/:id', requireAuth, async (req, res) => {
  const leads = await getLeadsForSearch(req.params.id);
  console.log(`[History] 加载 ID: ${req.params.id}，找到 ${leads.length} 条 leads`);
  res.json({ success: true, leads });
});

app.delete('/api/history/:id', requireAuth, async (req, res) => {
  const ok = await deleteSearchRun(req.params.id);
  if (!ok) return res.status(500).json({ success: false, error: '删除失败' });
  console.log(`[History] Deleted search run ${req.params.id}`);
  res.json({ success: true });
});

// ── Add lead (full 5-email sequence) to Instantly campaign ───────────────────
// POST /api/instantly/add-lead
// Body: { lead: { email, companyName, website?, phone?, emails?: [{subject,body}] }, campaignId? }
app.post('/api/instantly/add-lead', requireAuth, async (req, res) => {
  const { lead, campaignId: campaignIdOverride } = req.body;
  if (!lead?.email?.trim()) {
    return res.status(400).json({ success: false, error: 'lead.email is required' });
  }

  const { addLeadToCampaign } = require('./services/instantly');

  // Normalize emails[] array → EMAIL_N_SUBJECT / EMAIL_N_BODY fields
  const normalized = { ...lead };
  if (Array.isArray(lead.emails)) {
    lead.emails.forEach((e, i) => {
      normalized[`EMAIL_${i + 1}_SUBJECT`] = e.subject || '';
      normalized[`EMAIL_${i + 1}_BODY`]    = e.body    || '';
    });
  }

  const result = await addLeadToCampaign(normalized, campaignIdOverride || null);
  if (!result.success) {
    console.error(`[Instantly] add-lead failed for ${lead.email}: ${result.reason}`);
    return res.status(400).json({ success: false, error: result.reason });
  }

  console.log(`[Instantly] Lead added to campaign: ${lead.email} (${lead.companyName || '?'})`);
  res.json({ success: true });
});

// ── Send email via Instantly V2 ───────────────────────────────────────────────
// POST /api/send-email
// Body: { lead_id?, email_number, to_email, subject, body, company_name? }
app.post('/api/send-email', requireAuth, async (req, res) => {
  const { lead_id, email_number, to_email, subject, body, company_name } = req.body;

  if (!to_email || !subject || !body) {
    return res.status(400).json({ success: false, error: 'to_email, subject, body are required' });
  }
  if (!email_number || email_number < 1 || email_number > 5) {
    return res.status(400).json({ success: false, error: 'email_number must be 1–5' });
  }

  const { queueEmail } = require('./services/instantly');
  const result = await queueEmail({ toEmail: to_email, companyName: company_name || '', subject, body, emailNumber: email_number });

  if (!result.success) {
    console.error(`[SendEmail] Instantly queue failed: ${result.reason}`);
    return res.status(500).json({ success: false, error: result.reason || 'Failed to queue in Instantly' });
  }

  console.log(`[SendEmail] Queued email #${email_number} to ${to_email} (${company_name || lead_id || '?'})`);
  if (lead_id) await updateEmailSent(lead_id, email_number);
  res.json({ success: true });
});

// ── Instantly: get & update sequence delays ───────────────────────────────────
// GET  /api/instantly/sequence  → returns current 5-step delays
// POST /api/instantly/sequence  → body: { delays: [0,d1,d2,d3,d4] }
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2';
function instantlyHeaders() {
  return { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' };
}

app.get('/api/instantly/sequence', requireAuth, async (req, res) => {
  const campaignId = req.query.campaignId || process.env.INSTANTLY_CAMPAIGN_ID;
  if (!campaignId) return res.status(400).json({ success: false, error: 'No campaign ID' });
  try {
    const axios = require('axios');
    const r = await axios.get(`${INSTANTLY_BASE}/campaigns/${campaignId}`, { headers: instantlyHeaders() });
    const steps = r.data?.sequences?.[0]?.steps || [];
    const delays = steps.map(s => s.delay ?? 0);
    res.json({ success: true, delays });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

app.post('/api/instantly/sequence', requireAuth, async (req, res) => {
  const campaignId = req.body.campaignId || process.env.INSTANTLY_CAMPAIGN_ID;
  if (!campaignId) return res.status(400).json({ success: false, error: 'No campaign ID' });
  const { delays } = req.body;
  if (!Array.isArray(delays) || delays.length !== 5) {
    return res.status(400).json({ success: false, error: 'delays must be array of 5 numbers' });
  }
  const sequences = [{ steps: delays.map((delay, i) => ({
    type: 'email', delay,
    variants: [{ subject: `{{email_${i+1}_subject}}`, body: `{{email_${i+1}_body}}` }],
  }))}];
  try {
    const axios = require('axios');
    await axios.patch(`${INSTANTLY_BASE}/campaigns/${campaignId}`, { sequences }, { headers: instantlyHeaders() });
    console.log(`[Instantly] Sequence delays updated: ${delays.join('/')}`);
    res.json({ success: true, delays });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ── DOCX export ───────────────────────────────────────────────────────────────
// POST /api/export/docx  — body: { results[] }
app.post('/api/export/docx', requireAuth, async (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ success: false, error: 'results array required' });
  }

  const qualified = results.filter(r => !r.status?.startsWith('filtered'));
  const date = new Date().toISOString().split('T')[0];

  const para = (children, opts = {}) => new Paragraph({ children, ...opts });
  const run  = (text, fmt = {}) => new TextRun({ text: String(text ?? ''), ...fmt });

  const children = [
    para([run('AU Lead Generation Report', { bold: true, size: 36 })]),
    para([run(`Generated: ${date}`, { color: '888888', size: 20 })], { spacing: { after: 400 } }),
  ];

  qualified.forEach((lead, i) => {
    children.push(
      new Paragraph({
        text: `${i + 1}. ${lead.companyName || 'Unknown'}`,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 120 },
      })
    );

    const details = [
      ['Website',         lead.website],
      ['Phone',           lead.phone],
      ['Email',           lead.email],
      ['City',            lead.city],
      ['Rating',          lead.googleRating ? `${lead.googleRating} / 5` : null],
      ['Intent Score',    lead.intentScore  ? `${lead.intentScore} / 10` : null],
      ['Intent Analysis', lead.intentReasoning],
    ];

    details.filter(([, v]) => v).forEach(([label, value]) => {
      children.push(para([run(`${label}: `, { bold: true }), run(value)], { spacing: { after: 60 } }));
    });

    for (let e = 1; e <= 5; e++) {
      const subj = lead[`EMAIL_${e}_SUBJECT`];
      const body = lead[`EMAIL_${e}_BODY`];
      if (!subj && !body) continue;

      children.push(new Paragraph({
        text: `Email ${e}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 80 },
      }));

      if (subj) {
        children.push(para([run('Subject: ', { bold: true }), run(subj)], { spacing: { after: 80 } }));
      }
      if (body) {
        body.split('\n').forEach(line => {
          children.push(para([run(line)], { spacing: { after: 60 } }));
        });
      }
    }

    children.push(para([run('─'.repeat(60), { color: 'CCCCCC' })], { spacing: { before: 200, after: 200 } }));
  });

  const doc    = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  const fname  = `au-leads-${date}.docx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(buffer);
});

// ── Auth identity ─────────────────────────────────────────────────────────────
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ success: true, isAdmin: req.isAdmin });
});

// ── Admin: cost summary ───────────────────────────────────────────────────────
app.get('/api/admin/costs', requireAuth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });
  const summary = await getCostSummary();
  res.json({ success: true, ...summary });
});

// ── Instantly: Campaign management proxy routes ───────────────────────────────

// GET  /api/instantly/campaigns — list all campaigns
app.get('/api/instantly/campaigns', requireAuth, async (req, res) => {
  try {
    const axios = require('axios');
    const r = await axios.get(`${INSTANTLY_BASE}/campaigns?limit=100`, { headers: instantlyHeaders() });
    const campaigns = r.data?.items || (Array.isArray(r.data) ? r.data : []);
    res.json({ success: true, campaigns });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/instantly/campaigns — create new campaign
app.post('/api/instantly/campaigns', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });
  try {
    const axios = require('axios');
    const emailAccount = process.env.INSTANTLY_EMAIL_ACCOUNT || '';
    const r = await axios.post(`${INSTANTLY_BASE}/campaigns`,
      { name: name.trim(), email_list: emailAccount ? [emailAccount] : [] },
      { headers: instantlyHeaders() }
    );
    res.json({ success: true, campaign: r.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// GET /api/instantly/accounts — list all connected email accounts
app.get('/api/instantly/accounts', requireAuth, async (req, res) => {
  try {
    const axios = require('axios');
    const r = await axios.get(`${INSTANTLY_BASE}/accounts?limit=100`, { headers: instantlyHeaders() });
    const accounts = r.data?.items || (Array.isArray(r.data) ? r.data : []);
    res.json({ success: true, accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// PATCH /api/instantly/campaign/:id/accounts — update campaign's sending accounts
app.patch('/api/instantly/campaign/:id/accounts', requireAuth, async (req, res) => {
  const { emails } = req.body;
  try {
    const axios = require('axios');
    await axios.patch(`${INSTANTLY_BASE}/campaigns/${req.params.id}`,
      { email_list: emails || [] },
      { headers: instantlyHeaders() }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/instantly/campaign/:id/activate
app.post('/api/instantly/campaign/:id/activate', requireAuth, async (req, res) => {
  try {
    const axios = require('axios');
    const r = await axios.post(`${INSTANTLY_BASE}/campaigns/${req.params.id}/activate`, {}, { headers: instantlyHeaders() });
    res.json({ success: true, data: r.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// POST /api/instantly/campaign/:id/pause
app.post('/api/instantly/campaign/:id/pause', requireAuth, async (req, res) => {
  try {
    const axios = require('axios');
    const r = await axios.post(`${INSTANTLY_BASE}/campaigns/${req.params.id}/pause`, {}, { headers: instantlyHeaders() });
    res.json({ success: true, data: r.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// GET /api/instantly/campaign/:id/analytics
app.get('/api/instantly/campaign/:id/analytics', requireAuth, async (req, res) => {
  try {
    const axios = require('axios');
    const r = await axios.get(`${INSTANTLY_BASE}/campaigns/analytics`, {
      params: { id: req.params.id },
      headers: instantlyHeaders(),
    });
    const d = r.data || {};
    const contacted = d.contacted_count || 0;
    const analytics = {
      emails_sent_count:   d.emails_sent_count   || 0,
      open_count:          d.open_count           || 0,
      open_rate:           contacted > 0 ? d.open_count / contacted : null,
      reply_count:         d.reply_count          || 0,
      reply_rate:          contacted > 0 ? d.reply_count / contacted : null,
      unsubscribed_count:  d.unsubscribed_count   || 0,
      bounced_count:       d.bounced_count        || 0,
      leads_count:         d.leads_count          || 0,
      contacted_count:     contacted,
    };
    res.json({ success: true, available: true, analytics });
  } catch (err) {
    const reason = err.response?.data?.message || err.response?.data || err.message;
    console.warn(`[Instantly] analytics failed for ${req.params.id}:`, reason);
    res.json({ success: true, available: false, reason: String(reason).slice(0, 200) });
  }
});

// ── Global error handler (Express 5 forwards async rejections here) ───────────
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
});
