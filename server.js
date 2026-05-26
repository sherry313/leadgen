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
const { analyzeICP, generateEmails, preFilterLead, templateKeyFromQuery } = require('./services/aiEnrich');
const { createRunSheet, queueLead, finalizeSheets } = require('./services/googleSheets');
const { saveSearchRun, updateSearchRunCosts, appendSearchRunCosts, saveLeads, updateLeadEmails, getExistingLeadKeys, getSearchHistory, getLeadsForSearch, updateEmailSent, getCostSummary, getEmailsSentCount, deleteSearchRun } = require('./services/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Page routes — explicit handlers before static so '/' isn't captured by index.html default
app.get('/',            (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));
app.get('/app',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/lens',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/landing',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/landing.html',(req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get(['/tools', '/tools/'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'tools', 'index.html')));

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Race a promise against a timeout. Used by manual-mode endpoints to bound
// long-running external calls (Apify, Anthropic, Firecrawl, Instantly).
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timeout after ' + (ms/1000) + 's')), ms))
  ]);
}

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
  const { searchQuery, location, companyProfile = {}, dataOptions = {}, icp = '', countryCode = 'au' } = req.body;
  let { maxResults } = req.body;

  // Validate required fields
  if (!searchQuery || !searchQuery.trim()) {
    return res.status(400).json({ success: false, error: 'searchQuery is required' });
  }

  maxResults = Math.min(100, Math.max(1, parseInt(maxResults) || 10));

  console.log(`\n[Pipeline] ===== Starting lead generation =====`);
  console.log(`[Pipeline] Query: "${searchQuery}" | Location: ${location} | Max: ${maxResults} | Country: ${countryCode}`);
  console.log(`[Pipeline] Seller: ${companyProfile.sellerName || '(not set)'} | Products: ${companyProfile.products || '(not set)'}`);
  console.log('dataOptions received:', dataOptions);
  console.log(`[Pipeline] Data options:`, JSON.stringify(dataOptions));

  // Step 1: Scrape companies from Google Maps via Apify
  const { companies, apifyCostUsd: apifyActualCost } = await scrapeAustralianCompanies(searchQuery, location, maxResults, dataOptions, countryCode);
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

    // Step 2: Crawl company website for content + metadata
    const crawled = await crawlWebsite(company.website);
    const websiteContent = crawled.content;
    const pageMetadata = {
      title:         crawled.title,
      description:   crawled.description,
      ogTitle:       crawled.ogTitle,
      ogDescription: crawled.ogDescription,
    };

    // Step 3: Filter — skip explicit competitors, keep everything else with
    // soft local-mfg flag surfaced to Sonnet for nuanced scoring.
    const { shouldSkip, reason, keepSignals, lowSignal, claimsLocalManufacturing } = filterCompany(websiteContent);
    if (shouldSkip) {
      console.log(`[Pipeline] Filtered out "${company.companyName}": ${reason}`);
      results.push({
        ...company,
        websiteContent,
        pageMetadata,
        status: `filtered: ${reason}`,
        dateAdded: today,
      });
      continue; // skip AI + email steps for this company
    }

    // Extra buffer between companies to avoid hitting rate limits
    await new Promise(r => setTimeout(r, 1000));

    // Step 4: AI ICP + intent scoring (email generation is now a separate step)
    const enrichment = await analyzeICP(company, websiteContent, companyProfile, icp, keepSignals, lowSignal, claimsLocalManufacturing, pageMetadata);

    // Merge all data into the final lead object (enrichment.usage stays for post-loop cost calc)
    const lead = {
      ...company,
      websiteContent,
      pageMetadata,
      keepSignals,
      lowSignal,
      claimsLocalManufacturing,
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
  const { location, maxResults: mr = 10, dataOptions = {}, dataSource = 'google_maps', countryCode = 'au' } = req.body;
  const searchQuery = req.body.searchQuery?.trim() || 'renovation contractor';

  console.log('[Debug] 收到搜索请求:', JSON.stringify(req.body));
  console.log('[Debug] Apify Token:', process.env.APIFY_API_TOKEN ? '已设置' : '未设置');

  const maxResults = Math.min(100, Math.max(1, parseInt(mr) || 10));
  console.log('[Debug] req.body.maxResults (raw):', mr, '→ 解析后:', maxResults);
  console.log(`\n[Generate] ===== Step 1: ${dataSource} + Haiku pre-filter =====`);
  console.log(`[Generate] Query: "${searchQuery}" | Location: ${location} | Max: ${maxResults} | Country: ${countryCode}`);

  const { companies, apifyCostUsd: apifyActualCost } = dataSource === 'google_search'
    ? await searchGoogleSearch(searchQuery, location, maxResults, countryCode)
    : await scrapeAustralianCompanies(searchQuery, location, maxResults, dataOptions, countryCode);
  console.log('[Debug] Apify 返回条数:', companies.length);
  console.log(`[Generate] Scraped ${companies.length} companies`);

  // Haiku pre-filter — all companies in parallel (low token cost)
  let haikuIn = 0, haikuOut = 0;
  const preFiltered = await Promise.all(companies.map(async (company) => {
    const { level, reason, usage } = await preFilterLead(company, {});
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
  const { location, maxResults: mr = 10, dataOptions = {}, dataSource = 'google_maps', countryCode = 'au' } = req.body;
  const searchQuery = req.body.searchQuery?.trim() || 'renovation contractor';
  const maxResults = Math.min(500, Math.max(1, parseInt(mr) || 10));

  console.log(`[ScrapeRaw] "${searchQuery}" @ ${location} | max ${maxResults} | country ${countryCode}`);

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);

  let aborted = false;
  res.on('close', () => { aborted = true; });

  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  try {
    const { companies: rawCompanies, apifyCostUsd: apifyActualCost } = dataSource === 'google_search'
      ? await searchGoogleSearch(searchQuery, location, maxResults, countryCode)
      : await scrapeAustralianCompanies(searchQuery, location, maxResults, dataOptions, countryCode);

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

    // Persist raw scraped companies so the user can navigate away and return.
    // status:'raw' satisfies saveLeads' filter (which drops 'filtered:*') even
    // though the leads table has no status column — only the row itself persists.
    try {
      await saveLeads(searchId, companies.map(c => ({ ...c, status: 'raw' })));
    } catch (e) {
      console.warn(`[ScrapeRaw] saveLeads failed (non-fatal): ${e.message}`);
    }

    for (let i = 0; i < companies.length; i++) {
      if (aborted) break;
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

  // Remap frontend seller profile fields to the shape preFilterLead expects.
  // Same remap pattern used by /api/auto/run (commit 5ffbb93).
  const companyProfile = req.body.companyProfile || {};
  const profileForHaiku = {
    companyName: companyProfile.sellerName || companyProfile.companyName || '',
    products:    companyProfile.products   || '',
    advantages:  companyProfile.advantage  || companyProfile.advantages || '',
    icp:         req.body.icp || companyProfile.icp || '',
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let aborted = false;
  res.on('close', () => { aborted = true; });

  let haikuIn = 0, haikuOut = 0;
  const results = new Array(companies.length);
  let completed = 0;
  let idx = 0;
  let elapsed = 0;
  const heartbeat = setInterval(() => {
    if (aborted) return;
    elapsed += 2;
    send({ type: 'heartbeat', elapsed });
  }, 2000);

  try {
    const worker = async () => {
      while (idx < companies.length) {
        if (aborted) break;
        const i = idx++;
        const { level, reason, usage } = await withTimeout(preFilterLead(companies[i], profileForHaiku), 60000, 'Haiku pre-filter');
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
    send({ type: 'done', companies: results.map((r, i) => r || { ...companies[i], level: 'recommend', reason: '保留到下一阶段评分', aiFailed: true }) });
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

  let aborted = false;
  res.on('close', () => { aborted = true; });

  const today = new Date().toISOString().split('T')[0];
  await createRunSheet('enrich', today);

  const results = new Array(companies.length);
  let sonnetIn = 0, sonnetOut = 0;
  let completed = 0;
  let idx = 0;

  const processOne = async (company) => {
    try {
      const crawled = await withTimeout(crawlWebsite(company.website), 60000, 'Firecrawl');
      const websiteContent = crawled.content;
      const pageMetadata = {
        title:         crawled.title,
        description:   crawled.description,
        ogTitle:       crawled.ogTitle,
        ogDescription: crawled.ogDescription,
      };
      const { shouldSkip, reason, keepSignals, lowSignal, claimsLocalManufacturing } = filterCompany(websiteContent);
      if (shouldSkip) {
        return { ...company, websiteContent, pageMetadata, status: `filtered: ${reason}`, dateAdded: today };
      }
      const enrichment = await withTimeout(analyzeICP(company, websiteContent, companyProfile, icp, keepSignals, lowSignal, claimsLocalManufacturing, pageMetadata), 120000, 'Sonnet ICP');
      sonnetIn  += enrichment.usage?.input_tokens  || 0;
      sonnetOut += enrichment.usage?.output_tokens || 0;
      return { ...company, websiteContent, pageMetadata, keepSignals, lowSignal, claimsLocalManufacturing, ...enrichment, dateAdded: today, status: 'enriched' };
    } catch (err) {
      console.error(`[Enrich] ${company.companyName}:`, err.message);
      return { ...company, status: 'error', dateAdded: today };
    }
  };

  const worker = async () => {
    while (idx < companies.length && !enrichCancelled && !aborted) {
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
  const { companies, template_key, framework_key, custom_framework, searchId, companyProfile = {} } = req.body;
  const frameworkKey = framework_key || template_key;

  if (!Array.isArray(companies) || !companies.length)
    return res.status(400).json({ success: false, error: 'companies array required' });
  if (!frameworkKey)
    return res.status(400).json({ success: false, error: 'framework_key required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let aborted = false;
  res.on('close', () => { aborted = true; });

  const results = new Array(companies.length);
  let sonnetIn = 0, sonnetOut = 0;
  let completed = 0;
  let idx = 0;

  const worker = async () => {
    while (idx < companies.length && !emailGenCancelled && !aborted) {
      const i = idx++;
      const company = companies[i];
      try {
        const emails = await withTimeout(generateEmails(company, frameworkKey, company.websiteContent || '', framework_key, custom_framework, companyProfile), 120000, 'Sonnet emails');
        sonnetIn  += emails.usage?.input_tokens  || 0;
        sonnetOut += emails.usage?.output_tokens || 0;
        results[i] = { ...company, ...emails, emailTemplateKey: frameworkKey };
        // Fire-and-forget: persist emails to DB so they survive a page reload.
        // Wrapped in .catch so a DB failure never breaks the SSE stream.
        if (searchId) {
          updateLeadEmails(searchId, company.companyName, emails, frameworkKey, template_key)
            .catch(e => console.warn(`[EmailGen] DB persist failed for "${company.companyName}":`, e.message));
        }
      } catch (err) {
        console.error(`[EmailGen] ${company.companyName}:`, err.message);
        results[i] = { ...company, emailTemplateKey: frameworkKey };
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

// ── Auto-mode orchestrator (one-button: Apify → Haiku → Sonnet → Emails → Push) ─
// POST /api/auto/run — SSE
// Body: { searchQuery, location, countryCode?, maxResults, campaignId?, companyProfile, icp? }
//
// Event shape: { type, phase?, status?, done?, total?, lead?, summary?, error?, ... }
//   type='phase'    : phase transition  (status='start'|'done'|'skipped')
//   type='progress' : per-lead step inside a phase
//   type='error'    : non-recoverable error (preflight refused or fatal in loop)
//   type='done'     : final summary; res.end() follows
//
// Re-uses every existing service-layer function verbatim. Does NOT call
// finalizeSheets (the Sheets export currently has a latent bug — see audit).
app.post('/api/auto/run', requireAuth, async (req, res) => {
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timeout after ' + (ms/1000) + 's')), ms))
    ]);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);

  let aborted = false;
  res.on('close', () => { aborted = true; });

  const heartbeat = setInterval(() => { if (!aborted) res.write('data: {"type":"heartbeat"}\n\n'); }, 5000);

  try {
    const {
      searchQuery,
      location,
      countryCode = 'au',
      maxResults: mr = 30,
      campaignId = '',
      companyProfile = {},
      icp = '',
    } = req.body;

    if (!searchQuery?.trim() || !location?.trim()) {
      send({ type: 'error', phase: 'preflight', error: '缺少搜索关键词或地区' });
      return;
    }
    const maxResults = Math.min(100, Math.max(1, parseInt(mr) || 30));

    console.log(`\n[Auto] ===== Auto-run start =====`);
    console.log(`[Auto] Query: "${searchQuery}" | Location: ${location} | Max: ${maxResults} | Country: ${countryCode} | Campaign: ${campaignId || '(none)'}`);

    // ── Phase 0: Active-campaign safeguard ─────────────────────────────────
    // If user picked a campaign that's currently Active, pushing leads would
    // start sending immediately. Refuse and ask user to pause first.
    if (campaignId) {
      const { getCampaignStatus } = require('./services/instantly');
      const { status, name } = await withTimeout(getCampaignStatus(campaignId), 30000, 'Instantly campaign check');
      const isActive = status === 1 || status === 'active';
      if (isActive) {
        console.warn(`[Auto] Refusing — campaign "${name}" (${campaignId}) is Active`);
        send({
          type: 'error', phase: 'preflight',
          error: `Campaign "${name}" 当前处于 Active 状态，推送会立刻发邮件。请先在 Instantly 中暂停 Campaign 后重试。`,
        });
        return;
      }
    }

    // ── Phase 1: Apify scrape ──────────────────────────────────────────────
    send({ type: 'phase', phase: 'apify', status: 'start' });
    const { companies: rawCompanies, apifyCostUsd: apifyActualCost } = await withTimeout(
      scrapeAustralianCompanies(
        searchQuery, location, maxResults,
        { includeWebsite: true, includeEmail: true },   // auto-mode forces emails on
        countryCode,
      ),
      360000,
      'Apify scrape',
    );

    // Dedup against historical leads — same logic as /api/scrape-raw
    const { placeIds, phones, emails: existingEmails, domains } = await getExistingLeadKeys();
    const extractDomain = (url) => {
      try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
    };
    const newCompanies = rawCompanies.filter(c => {
      if (c.placeId && placeIds.has(c.placeId)) return false;
      const ph = c.phone?.replace(/\D/g, '');
      if (ph && phones.has(ph)) return false;
      if (c.email && existingEmails.has(c.email.toLowerCase())) return false;
      const d = c.website ? extractDomain(c.website) : '';
      if (d && domains.has(d)) return false;
      return true;
    });
    const dedupSkipped = rawCompanies.length - newCompanies.length;
    const apifyCost = apifyActualCost ?? rawCompanies.length * 0.002;

    const searchId = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: rawCompanies.length });
    send({
      type: 'phase', phase: 'apify', status: 'done',
      scraped: rawCompanies.length, newLeads: newCompanies.length, dedupSkipped, searchId, apifyCostUsd: apifyCost,
    });
    send({ type: 'phase', phase: 'dedup', total: rawCompanies.length, new: newCompanies.length, skipped: dedupSkipped });

    if (!newCompanies.length) {
      send({ type: 'phase', phase: 'dedup_all', message: '所有线索已存在，无新数据' });
      await updateSearchRunCosts(searchId, { apifyCostUsd: apifyCost, anthropicCostUsd: 0, totalCostUsd: apifyCost, totalQualified: 0 });
      send({
        type: 'done', searchId,
        summary: { scraped: rawCompanies.length, dedupSkipped, haikuRecommend: 0, withEmail: 0, qualified: 0, emailsGenerated: 0, pushed: 0, pushFailed: 0, costs: { apify: apifyCost, haiku: 0, sonnet: 0, firecrawl: 0, total: apifyCost } },
        results: [],
        note: dedupSkipped > 0 ? `所有 ${rawCompanies.length} 条均已在历史记录中，已跳过` : '未找到任何公司',
      });
      return;
    }

    // ── Phase 2: Haiku name-only pre-filter ────────────────────────────────
    const profileForHaiku = {
      companyName: companyProfile.sellerName || companyProfile.companyName || '',
      products: companyProfile.products || '',
      advantages: companyProfile.advantage || companyProfile.advantages || '',
      icp: icp || companyProfile.icp || ''
    };
    send({ type: 'phase', phase: 'haiku', status: 'start', total: newCompanies.length });
    let haikuIn = 0, haikuOut = 0;
    const haikuResults = new Array(newCompanies.length);
    {
      let idx = 0, completed = 0;
      const worker = async () => {
        while (idx < newCompanies.length) {
          if (aborted) break;
          const i = idx++;
          const { level, reason, usage } = await withTimeout(preFilterLead(newCompanies[i], profileForHaiku), 60000, 'Haiku pre-filter');
          haikuIn  += usage.input_tokens;
          haikuOut += usage.output_tokens;
          haikuResults[i] = { ...newCompanies[i], level, reason };
          completed++;
          send({ type: 'progress', phase: 'haiku', done: completed, total: newCompanies.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, newCompanies.length) }, () => worker()));
    }
    const recommended = haikuResults.filter(c => c.level !== 'skip');
    const haikuSkipped = haikuResults.filter(c => c.level === 'skip');
    send({ type: 'phase', phase: 'haiku', status: 'done', recommend: recommended.length, skip: haikuSkipped.length });
    send({ type: 'phase', phase: 'haiku_done', recommended: recommended.length, skipped: haikuSkipped.length });

    // ── Phase 2.5: Email-presence filter (user requirement: Sonnet only runs on leads with email) ─
    const forSonnet  = recommended.filter(c => c.email?.trim());
    const noEmail    = recommended.filter(c => !c.email?.trim());
    send({
      type: 'phase', phase: 'email-filter', status: 'done',
      withEmail: forSonnet.length, withoutEmail: noEmail.length,
    });

    const today = new Date().toISOString().split('T')[0];

    if (!forSonnet.length) {
      // Save Haiku results + no-email leads so user can review, then bail.
      const persistRows = [
        ...haikuSkipped.map(c => ({ ...c, status: 'filtered: haiku', dateAdded: today })),
        ...noEmail.map(c     => ({ ...c, status: 'filtered: no_email', dateAdded: today })),
      ];
      await saveLeads(searchId, persistRows);
      const haikuCost = (haikuIn / 1_000_000 * 0.80) + (haikuOut / 1_000_000 * 4.00);
      await updateSearchRunCosts(searchId, { apifyCostUsd: apifyCost, anthropicCostUsd: haikuCost, totalCostUsd: apifyCost + haikuCost, totalQualified: 0 });
      send({
        type: 'done', searchId,
        summary: { scraped: rawCompanies.length, dedupSkipped, haikuRecommend: recommended.length, haikuSkip: haikuSkipped.length, withEmail: 0, withoutEmail: noEmail.length, qualified: 0, emailsGenerated: 0, pushed: 0, pushFailed: 0, costs: { apify: apifyCost, haiku: haikuCost, sonnet: 0, firecrawl: 0, total: apifyCost + haikuCost } },
        results: persistRows,
        note: '没有可深度分析的线索（Haiku 推荐的公司都缺少邮箱）',
      });
      return;
    }

    // ── Phase 3: Firecrawl + Sonnet ICP analysis ───────────────────────────
    send({ type: 'phase', phase: 'icp', status: 'start', total: forSonnet.length });
    let sonnetIn = 0, sonnetOut = 0;
    const icpResults = new Array(forSonnet.length);
    {
      let idx = 0, completed = 0;
      const worker = async () => {
        while (idx < forSonnet.length) {
          if (aborted) break;
          const i = idx++;
          const company = forSonnet[i];
          try {
            const crawled = await withTimeout(crawlWebsite(company.website), 60000, 'Firecrawl');
            const websiteContent = crawled.content;
            const pageMetadata = {
              title:         crawled.title,
              description:   crawled.description,
              ogTitle:       crawled.ogTitle,
              ogDescription: crawled.ogDescription,
            };
            const { shouldSkip, reason, keepSignals, lowSignal, claimsLocalManufacturing } = filterCompany(websiteContent);
            if (shouldSkip) {
              icpResults[i] = { ...company, websiteContent, pageMetadata, status: `filtered: ${reason}`, dateAdded: today };
            } else {
              const enrichment = await withTimeout(analyzeICP(company, websiteContent, companyProfile, icp, keepSignals, lowSignal, claimsLocalManufacturing, pageMetadata), 120000, 'Sonnet ICP');
              sonnetIn  += enrichment.usage?.input_tokens  || 0;
              sonnetOut += enrichment.usage?.output_tokens || 0;
              icpResults[i] = { ...company, websiteContent, pageMetadata, keepSignals, lowSignal, claimsLocalManufacturing, ...enrichment, dateAdded: today, status: 'enriched' };
            }
          } catch (err) {
            console.error(`[Auto/ICP] ${company.companyName}:`, err.message);
            icpResults[i] = { ...company, status: 'error', dateAdded: today };
          }
          completed++;
          send({ type: 'progress', phase: 'icp', done: completed, total: forSonnet.length, lead: icpResults[i] });
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, forSonnet.length) }, () => worker()));
    }
    send({ type: 'phase', phase: 'icp', status: 'done' });

    // ── Qualification gate ─────────────────────────────────────────────────
    const qualified = icpResults.filter(r =>
      !r.status?.startsWith('filtered') && !r.status?.startsWith('error') &&
      Number(r.icpScore || 0) >= 5 && Number(r.intentScore || 0) >= 5
    );
    send({ type: 'phase', phase: 'qualify', status: 'done', qualified: qualified.length });

    // ── Phase 4: Peter Kang email generation ───────────────────────────────
    const templateKey  = templateKeyFromQuery(searchQuery);
    const frameworkKey = 'peter_kang_3part';
    let emailsGenerated = 0;
    if (qualified.length) {
      send({ type: 'phase', phase: 'emails', status: 'start', total: qualified.length, templateKey, frameworkKey });
      let idx = 0, completed = 0;
      const worker = async () => {
        while (idx < qualified.length) {
          if (aborted) break;
          const i = idx++;
          const company = qualified[i];
          try {
            const emails = await withTimeout(generateEmails(company, templateKey, company.websiteContent || '', frameworkKey, null, companyProfile), 120000, 'Sonnet emails');
            sonnetIn  += emails.usage?.input_tokens  || 0;
            sonnetOut += emails.usage?.output_tokens || 0;
            Object.assign(company, emails, { emailTemplateKey: frameworkKey });
            if (company.EMAIL_1_SUBJECT || company.EMAIL_1_BODY) emailsGenerated++;
            updateLeadEmails(searchId, company.companyName, emails, frameworkKey, templateKey)
              .catch(e => console.warn(`[Auto/Emails] DB persist failed for "${company.companyName}":`, e.message));
          } catch (err) {
            console.error(`[Auto/Emails] ${company.companyName}:`, err.message);
          }
          completed++;
          send({ type: 'progress', phase: 'emails', done: completed, total: qualified.length, lead: company });
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, qualified.length) }, () => worker()));
      send({ type: 'phase', phase: 'emails', status: 'done', generated: emailsGenerated });
    } else {
      send({ type: 'phase', phase: 'emails', status: 'skipped', reason: 'No qualified leads' });
    }

    // ── Persist all leads to Supabase (single batch insert) ────────────────
    // Includes ICP-analyzed results (with or without emails) + Haiku-skipped
    // + no-email leads, each with an appropriate status so the user can see
    // the full funnel in the history view.
    const allLeads = [
      ...icpResults,
      ...haikuSkipped.map(c => ({ ...c, status: 'filtered: haiku', dateAdded: today })),
      ...noEmail.map(c     => ({ ...c, status: 'filtered: no_email', dateAdded: today })),
    ];
    try {
      const saved = await saveLeads(searchId, allLeads);
      if (saved?.length) {
        const idMap = new Map(saved.map(l => [l.company_name, l.id]));
        allLeads.forEach(r => { if (r.companyName) r.dbId = idMap.get(r.companyName) || null; });
      }
    } catch (e) {
      console.warn(`[Auto] saveLeads failed: ${e.message}`);
    }

    // ── Phase 5: Push qualified-with-emails leads to Instantly ─────────────
    let pushed = 0, pushFailed = 0;
    const pushable = qualified.filter(q => (q.EMAIL_1_SUBJECT || q.EMAIL_1_BODY) && q.email?.trim());
    if (campaignId && pushable.length) {
      const { addLeadToCampaign } = require('./services/instantly');
      send({ type: 'phase', phase: 'push', status: 'start', total: pushable.length });
      for (let i = 0; i < pushable.length; i++) {
        if (aborted) break;
        const lead = pushable[i];
        try {
          const result = await withTimeout(addLeadToCampaign(lead, campaignId), 30000, 'Instantly push');
          if (result.success) pushed++;
          else { pushFailed++; console.warn(`[Auto/Push] ${lead.companyName}: ${result.reason}`); }
        } catch (err) {
          pushFailed++;
          console.error(`[Auto/Push] ${lead.companyName}:`, err.message);
        }
        send({ type: 'progress', phase: 'push', done: i + 1, total: pushable.length, companyName: lead.companyName });
        await new Promise(r => setTimeout(r, 350));
      }
      send({ type: 'phase', phase: 'push', status: 'done', pushed, pushFailed });
    } else if (!campaignId) {
      send({ type: 'phase', phase: 'push', status: 'skipped', reason: '未选择 Campaign，推送步骤已跳过' });
    } else {
      send({ type: 'phase', phase: 'push', status: 'skipped', reason: '没有合格且有邮件内容的线索' });
    }

    // ── Final cost roll-up ─────────────────────────────────────────────────
    const sonnetCost    = (sonnetIn / 1_000_000 * 3) + (sonnetOut / 1_000_000 * 15);
    const haikuCost     = (haikuIn  / 1_000_000 * 0.80) + (haikuOut / 1_000_000 * 4.00);
    const firecrawlCost = forSonnet.length * 0.003;
    const anthropicCost = sonnetCost + haikuCost;
    const totalCost     = apifyCost + anthropicCost + firecrawlCost;

    await updateSearchRunCosts(searchId, {
      apifyCostUsd:     apifyCost,
      anthropicCostUsd: anthropicCost,
      totalCostUsd:     totalCost,
      totalQualified:   qualified.length,
    });

    console.log(`[Auto] ===== Auto-run done =====`);
    console.log(`[Auto] Scraped=${rawCompanies.length} new=${newCompanies.length} haikuRec=${recommended.length} withEmail=${forSonnet.length} qualified=${qualified.length} emails=${emailsGenerated} pushed=${pushed}/${pushable.length}`);
    console.log(`[Auto] Cost: apify=$${apifyCost.toFixed(4)} haiku=$${haikuCost.toFixed(4)} sonnet=$${sonnetCost.toFixed(4)} firecrawl=$${firecrawlCost.toFixed(4)} total=$${totalCost.toFixed(4)}`);

    send({
      type: 'done',
      searchId,
      summary: {
        scraped:         rawCompanies.length,
        dedupSkipped,
        haikuRecommend:  recommended.length,
        haikuSkip:       haikuSkipped.length,
        withEmail:       forSonnet.length,
        withoutEmail:    noEmail.length,
        icpAnalyzed:     forSonnet.length,
        qualified:       qualified.length,
        emailsGenerated,
        pushed,
        pushFailed,
        pushSkipped:     !campaignId,
        templateKey,
        frameworkKey,
        costs: { apify: apifyCost, haiku: haikuCost, sonnet: sonnetCost, firecrawl: firecrawlCost, total: totalCost },
      },
      results: allLeads,
    });
  } catch (err) {
    console.error('[Auto] FATAL:', err.message, err.stack);
    send({ type: 'error', phase: 'fatal', error: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
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

// Load the raw scraped leads for a given searchId so the frontend can rehydrate
// _rawResults after a page refresh. The leads table has no status column, so we
// return everything for the searchId — manual scrape runs only ever produce raw
// rows here, so no filtering is needed in practice.
app.get('/api/raw/:searchId', requireAuth, async (req, res) => {
  const leads = await getLeadsForSearch(req.params.searchId);
  console.log(`[Raw] 加载 searchId: ${req.params.searchId}，找到 ${leads.length} 条 raw leads`);
  res.json({ success: true, leads });
});

app.delete('/api/history/:id', requireAuth, async (req, res) => {
  const ok = await deleteSearchRun(req.params.id);
  if (!ok) return res.status(500).json({ success: false, error: '删除失败' });
  console.log(`[History] Deleted search run ${req.params.id}`);
  res.json({ success: true });
});

// ── DIAG: client-side log relay ──────────────────────────────────────────────
// POST /api/diag/log  body: { tag, data }
// Temporary endpoint to surface frontend push-flow events in docker logs.
// Remove once push bug is confirmed fixed.
app.post('/api/diag/log', async (req, res) => {
  try {
    const { tag, data } = req.body || {};
    console.log(`[DIAG] ${tag || '?'}:`, JSON.stringify(data));
  } catch (_) {}
  res.json({ ok: true });
});

// ── Add lead (full 5-email sequence) to Instantly campaign ───────────────────
// POST /api/instantly/add-lead
// Body: { lead: { email, companyName, website?, phone?, emails?: [{subject,body}] }, campaignId? }
app.post('/api/instantly/add-lead', requireAuth, async (req, res) => {
  const { lead, campaignId: campaignIdOverride } = req.body;
  if (!lead?.email?.trim()) {
    return res.status(400).json({ success: false, error: 'lead.email is required' });
  }

  const { addLeadToCampaign, getCampaignStatus } = require('./services/instantly');

  // Refuse to push if the target campaign is Active — same safeguard as /api/auto/run.
  // Pushing into an Active campaign triggers immediate sending.
  const effectiveCampaignId = campaignIdOverride || process.env.INSTANTLY_CAMPAIGN_ID;
  if (effectiveCampaignId) {
    try {
      const { status, name } = await withTimeout(getCampaignStatus(effectiveCampaignId), 30000, 'Instantly campaign check');
      const isActive = status === 1 || status === 'active';
      if (isActive) {
        console.warn(`[Instantly] Refusing add-lead — campaign "${name}" (${effectiveCampaignId}) is Active`);
        return res.status(400).json({
          success: false,
          error: `Campaign "${name}" 当前处于 Active 状态，推送会立刻发邮件。请先在 Instantly 中暂停 Campaign 后重试。`,
        });
      }
    } catch (e) {
      console.warn(`[Instantly] Campaign status check failed (non-fatal): ${e.message}`);
    }
  }

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
    const newId = r.data?.id;
    if (newId) {
      const { ensureSequenceInstalled } = require('./services/instantly');
      await ensureSequenceInstalled(newId);
    }
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
  const normalizedEmails = (emails || []).map(e => typeof e === 'string' ? e.toLowerCase().trim() : e);
  console.log('[PATCH /campaign/:id/accounts] raw body emails:', JSON.stringify(emails));
  console.log('[PATCH /campaign/:id/accounts] normalized:', JSON.stringify(normalizedEmails));
  try {
    const axios = require('axios');
    await axios.patch(`${INSTANTLY_BASE}/campaigns/${req.params.id}`,
      { email_list: normalizedEmails },
      { headers: instantlyHeaders() }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /campaign/:id/accounts] Instantly error:', JSON.stringify(err.response?.data), '| emails sent:', JSON.stringify(normalizedEmails));
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

// ── Products (public read + admin-password-gated edit) ───────────────────────
const _productsDb = (() => {
  const { createClient } = require('@supabase/supabase-js');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
})();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';

function requireAdminPassword(req, res, next) {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'invalid admin password' });
  }
  next();
}

app.get('/api/products', async (req, res) => {
  if (!_productsDb) return res.status(503).json({ success: false, error: 'supabase not configured' });
  try {
    const [{ data: products, error: pe }, { data: adders, error: ae }] = await Promise.all([
      _productsDb.from('products').select('*').order('base_price_cny', { ascending: true }),
      _productsDb.from('product_adders').select('*').order('category').order('price_cny'),
    ]);
    if (pe) throw pe;
    if (ae) throw ae;
    res.json({ success: true, products, adders });
  } catch (err) {
    console.error('[Products] GET failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/products', requireAdminPassword, async (req, res) => {
  if (!_productsDb) return res.status(503).json({ success: false, error: 'supabase not configured' });
  const { type, id, price_cny } = req.body || {};
  if (!['product', 'adder'].includes(type) || !id || typeof price_cny !== 'number' || price_cny < 0) {
    return res.status(400).json({ success: false, error: 'expected { type: "product"|"adder", id: number, price_cny: number >= 0 }' });
  }
  try {
    const table = type === 'product' ? 'products' : 'product_adders';
    const column = type === 'product' ? 'base_price_cny' : 'price_cny';
    const { data, error } = await _productsDb.from(table).update({ [column]: price_cny }).eq('id', id).select().single();
    if (error) throw error;
    res.json({ success: true, row: data });
  } catch (err) {
    console.error('[Admin] price update failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── CSV import: paste rows + password → INSERT into leads ────────────────────
const IMPORT_PASSWORD = process.env.IMPORT_PASSWORD || 'lens2026';

function requireImportPassword(req, res, next) {
  if (req.headers['x-import-password'] !== IMPORT_PASSWORD) {
    return res.status(401).json({ success: false, error: 'invalid import password' });
  }
  next();
}

function _normalizePhone(s) { return String(s || '').replace(/\D/g, ''); }
function _normalizeDomain(url) {
  if (!url) return '';
  try { return new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

app.post('/api/import-leads', requireImportPassword, async (req, res) => {
  if (!_productsDb) return res.status(503).json({ success: false, error: 'supabase not configured' });
  const { rows, filename } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, error: 'rows must be a non-empty array' });
  }

  const clean = rows
    .map(r => ({
      company_name: String(r.company_name || '').trim(),
      website:      String(r.website      || '').trim(),
      phone:        String(r.phone        || '').trim(),
      email:        String(r.email        || '').trim().toLowerCase(),
      city:         String(r.city         || '').trim(),
    }))
    .filter(r => r.company_name || r.email || r.website);

  if (clean.length === 0) {
    return res.status(400).json({ success: false, error: 'no rows have company_name, email, or website' });
  }

  try {
    const { data: histRow, error: histErr } = await _productsDb
      .from('search_history')
      .insert({
        query:         `CSV 导入${filename ? ': ' + String(filename).slice(0, 80) : ''}`,
        location:      'CSV import',
        max_results:   clean.length,
        total_scraped: clean.length,
      })
      .select('id')
      .single();
    if (histErr) throw histErr;
    const searchId = histRow.id;

    const insertRows = clean.map(r => ({
      search_id:        searchId,
      company_name:     r.company_name,
      website:          r.website,
      phone:            r.phone,
      email:            r.email,
      city:             r.city,
      rating:           '',
      intent_score:     '',
      icp_score:        '',
      reasoning:        '',
      place_id:         '',
      phone_normalized: _normalizePhone(r.phone),
      website_domain:   _normalizeDomain(r.website),
    }));

    let imported = 0;
    const batchSize = 500;
    for (let i = 0; i < insertRows.length; i += batchSize) {
      const batch = insertRows.slice(i, i + batchSize);
      const { data, error } = await _productsDb.from('leads').insert(batch).select('id');
      if (error) throw error;
      imported += data.length;
    }

    console.log(`[Import] ${imported} leads imported into search_id=${searchId} (${filename || 'unknown'})`);
    res.json({ success: true, imported, searchId, skipped: rows.length - clean.length });
  } catch (err) {
    console.error('[Import] failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Send quote PDF email via Gmail SMTP ──────────────────────────────────────
const _gmailTransporter = (() => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
})();

function _escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _buildQuoteEmailHtml(q) {
  const e = _escHtml;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1e293b">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f7fa;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
      <tr><td style="background:#1d4ed8;padding:24px 28px;color:#ffffff">
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.3px">Lens Aluminium Windows &amp; Doors</div>
        <div style="font-size:13px;opacity:0.85;margin-top:4px">Factory Direct — Foshan, China</div>
      </td></tr>

      <tr><td style="padding:28px">
        <div style="font-size:13px;color:#64748b;margin-bottom:8px">
          <strong style="color:#1e293b">Quote No:</strong> ${e(q.quoteNumber)} &nbsp;·&nbsp;
          <strong style="color:#1e293b">Date:</strong> ${e(q.quoteDate)}
        </div>

        <p style="font-size:15px;margin:18px 0 6px">Dear ${e(q.customerName) || 'Customer'},</p>
        <p style="font-size:14px;line-height:1.55;color:#475569;margin:0 0 18px">
          Thank you for your enquiry. Please find your quote below.
        </p>

        ${q.projectName && q.projectName !== '—' ? `<p style="font-size:14px;color:#475569;margin:0 0 18px"><strong style="color:#1e293b">Project:</strong> ${e(q.projectName)}</p>` : ''}

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:8px 0 18px">
          <tr><td style="background:#1d4ed8;color:#ffffff;padding:10px 12px;font-size:12px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase">Product</td>
              <td style="background:#1d4ed8;color:#ffffff;padding:10px 12px;font-size:12px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;text-align:right">Details</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;color:#1e293b">Product</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;text-align:right">${e(q.product)}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;color:#1e293b">Size</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;text-align:right">${e(q.size)}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;color:#1e293b">Area</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;text-align:right">${e(q.areaSqm)} m²</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;color:#1e293b">Specification</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;text-align:right">${e(q.specification)}</td></tr>
          <tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;color:#1e293b">Unit price</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;text-align:right">A$ ${e(q.unitPriceAud)} / m²</td></tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:18px">
          <tr><td style="background:#eff6ff;padding:14px 16px;border-radius:6px;border:1px solid #bfdbfe">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="font-size:13px;color:#1e40af;font-weight:600;letter-spacing:0.02em;text-transform:uppercase">Total</td>
                <td align="right" style="font-size:22px;font-weight:800;color:#1d4ed8;letter-spacing:-0.5px">AUD $${e(q.totalAud)}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <p style="font-size:12.5px;color:#64748b;margin:0 0 4px">Valid until <strong style="color:#1e293b">${e(q.validUntil)}</strong></p>
        <p style="font-size:12px;color:#94a3b8;margin:0 0 4px">Prices in Australian Dollars (AUD), EXW Foshan unless otherwise stated.</p>
        <p style="font-size:12px;color:#94a3b8;margin:0">Lead time: 25–35 working days from deposit. Payment: 30% deposit / 70% before shipment.</p>
      </td></tr>

      <tr><td style="background:#0f172a;padding:18px 28px;color:#cbd5e1;font-size:12px;text-align:center;line-height:1.6">
        <div>20 years manufacturing experience &nbsp;|&nbsp; 300,000m² factory in Foshan</div>
        <div style="margin-top:4px">zhuolu34@gmail.com &nbsp;|&nbsp; +86 187 8960 4353</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

app.post('/api/send-quote', async (req, res) => {
  if (!_gmailTransporter) {
    return res.status(503).json({ success: false, error: 'Gmail SMTP not configured (set GMAIL_USER and GMAIL_APP_PASSWORD)' });
  }
  const q = req.body || {};
  if (!q.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.customerEmail)) {
    return res.status(400).json({ success: false, error: 'valid customerEmail required' });
  }
  if (!q.quoteNumber) {
    return res.status(400).json({ success: false, error: 'quoteNumber required' });
  }

  try {
    const info = await _gmailTransporter.sendMail({
      from: `"Lens Aluminium Windows & Doors" <${process.env.GMAIL_USER}>`,
      to:      q.customerEmail,
      subject: `Your Quote from Lens Aluminium Windows & Doors — ${q.quoteNumber}`,
      html:    _buildQuoteEmailHtml(q),
    });
    console.log(`[Quote] Sent to ${q.customerEmail} (${q.quoteNumber}) messageId=${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('[Quote] sendMail failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
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
