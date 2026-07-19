require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const requireAuth = require('./middleware/auth');
const { scrapeAustralianCompanies } = require('./services/apify');
const { searchGoogleSearch }        = require('./services/googleSearch');
const { crawlWebsite, filterCompany, searchWebsite, scrapeHtml } = require('./services/firecrawl');
const { analyzeICP, generateEmails, preFilterLead, templateKeyFromQuery, generateIcp } = require('./services/aiEnrich');
const { createRunSheet, queueLead, finalizeSheets } = require('./services/googleSheets');
const { saveSearchRun, updateSearchRunCosts, appendSearchRunCosts, updateLeadFilterResult, saveLeads, updateLeadEmails, getExistingLeadKeys, getSearchHistory, getLeadsForSearch, updateEmailSent, markLeadEmailedByEmail, getSentCountsBySearch, resetSearchQualified, getCostSummary, getEmailsSentCount, getUserQuotaUsd, deleteSearchRun, listProductProfiles, createProductProfile, ensureProductProfile, updateProductProfile, deleteProductProfile, appendProductSearch, getProductSentLeads, getProductAllLeads, getSentEmailStats, getAdminUsersOverview, setUserQuotaUsd, getWrittenCountsBySearch } = require('./services/supabase');
const emailFrameworks = require('./services/emailFrameworks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Page routes — explicit handlers before static so '/' isn't captured by index.html default.
// Helper: send an HTML page with no-cache headers so the browser / CDN always
// fetches the latest version (visitors won't see stale UI after a deploy).
const sendHtml = (res, ...parts) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', ...parts));
};

app.get('/',            (req, res) => sendHtml(res, 'preview-console.html')); // 根路由 = 封面 → 控制台（营销首页 home.html 已下线，文件保留）
app.get('/home',        (req, res) => sendHtml(res, 'home.html'));            // 旧营销首页保留入口，随时可切回
app.get('/app',         (req, res) => sendHtml(res, 'preview-console.html')); // 控制台 = /app 新门面（迁移阶段1）
app.get('/flow',        (req, res) => sendHtml(res, 'index.html'));          // 现有获客流程，被控制台「邮件获客」iframe 嵌入
app.get('/lens',        (req, res) => sendHtml(res, 'index.html'));
app.get('/account',     (req, res) => sendHtml(res, 'account.html'));
app.get('/autopost',    (req, res) => sendHtml(res, 'autopost.html'));
app.get('/notes',       (req, res) => sendHtml(res, 'notes.html'));
app.get('/landing',     (req, res) => sendHtml(res, 'landing.html'));
app.get('/landing.html',(req, res) => sendHtml(res, 'landing.html'));
app.get(['/tools', '/tools/'], (req, res) => sendHtml(res, 'tools', 'index.html'));

// 报价工具暂时下线（2026-07-17）。
// 它读取 Lens 的出厂成本价、显示总成本与利润 —— 是卖家内部算账工具，此前被误
// 放在公开的「免费工具」区。页面文件 public/quote.html 保留不动，想重新上线时
// 删掉这个 handler 即可（另见 /api/quote/products 与 /api/send-quote 的鉴权）。
// 必须放在下面的 express.static 之前，否则静态中间件会直接把文件发出去。
app.get('/quote.html', (req, res) => {
  res.status(503).set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  }).send(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>报价工具维护中</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#030303;color:#e5e7eb;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:420px;padding:40px 32px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#fff">报价工具维护中</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#9ca3af">该工具正在调整，暂时无法使用。</p>
    <a href="/tools/" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-size:14px">← 查看其他免费工具</a>
  </div>
</body></html>`);
});

// Static middleware — apply no-cache to HTML files (login.html, pricing.html,
// dashboard.html, quote.html, /tools/*.html, etc.) so the same anti-stale
// guarantee covers everything served from public/.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  },
}));

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

// ── Public Supabase config (for browser-side auth bootstrap) ─────────────────
// Exposes the URL + anon key only. The service-role key (SUPABASE_KEY) MUST
// never be sent here — it stays server-only.
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl:     process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// ── ICP generator (new-user wizard → editable ICP text) ──────────────────────
// Body: { industries, companySize, painPoints, exclusions, sellerName, products, advantage, country, keyword }
app.post('/api/generate-icp', requireAuth, async (req, res) => {
  try {
    const result = await withTimeout(generateIcp(req.body || {}), 60000, '/api/generate-icp');
    if (!result || !result.icp) {
      return res.status(502).json({ success: false, error: 'AI returned empty response' });
    }
    res.json({ success: true, icp: result.icp, usage: result.usage });
  } catch (err) {
    console.error('[generate-icp] failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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
  const searchId = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: companies.length }, req.userId);

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

  const savedLeads = await saveLeads(searchId, results, req.userId);
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

  const searchId = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: companies.length }, req.userId);
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
    const { placeIds: existingPlaceIds, phones: existingPhones, emails: existingEmails, domains: existingDomains } = await getExistingLeadKeys(req.userId);
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
    const searchId  = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: rawCompanies.length }, req.userId);
    await updateSearchRunCosts(searchId, { apifyCostUsd: apifyCost, anthropicCostUsd: 0, totalCostUsd: apifyCost, totalQualified: 0 });

    // Persist raw scraped companies so the user can navigate away and return.
    // status:'raw' satisfies saveLeads' filter (which drops 'filtered:*') even
    // though the leads table has no status column — only the row itself persists.
    try {
      await saveLeads(searchId, companies.map(c => ({ ...c, status: 'raw' })), req.userId);
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
      try { await appendSearchRunCosts(searchId, { sonnetCostUsd: haikuCost, firecrawlCostUsd: 0 }, req.userId); }
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
    await appendSearchRunCosts(searchId, { sonnetCostUsd: sonnetCost, firecrawlCostUsd: firecrawlCost }, req.userId);
    const savedLeads = await saveLeads(searchId, results, req.userId);
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

// ── Website-list enrich (SSE) ─────────────────────────────────────────────────
// POST /api/enrich-urls  — input: { urls, companyProfile, icp, searchId }
// Same Firecrawl → filter → Sonnet flow as /api/enrich, but starts from a list
// of raw URLs (e.g. uploaded CSV) instead of pre-shaped company rows.
app.post('/api/enrich-urls', requireAuth, async (req, res) => {
  const { urls, companyProfile = {}, icp = '', searchId } = req.body;
  if (!Array.isArray(urls) || !urls.length) {
    return res.status(400).json({ success: false, error: 'urls array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  let aborted = false;
  res.on('close', () => { aborted = true; });

  const today = new Date().toISOString().split('T')[0];

  // Shape each URL into a minimal company object — companyName filled in
  // after Firecrawl returns a page title.
  const companies = urls.map(u => ({
    companyName: '',
    website:     (u || '').trim(),
    source:      'website_list',
    email:       '',
    phone:       '',
    city:        '',
    country:     companyProfile?.countryCode || '',
  }));

  const results = new Array(companies.length);
  let sonnetIn = 0, sonnetOut = 0;
  let completed = 0;
  let idx = 0;

  const processOne = async (company) => {
    try {
      const crawled = await withTimeout(crawlWebsite(company.website), 60000, 'Firecrawl');
      const websiteContent = crawled.content;
      if (crawled.title) company.companyName = crawled.title;
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
      const enrichment = await withTimeout(
        analyzeICP(company, websiteContent, companyProfile, icp, keepSignals, lowSignal, claimsLocalManufacturing, pageMetadata),
        120000,
        'Sonnet ICP',
      );
      sonnetIn  += enrichment.usage?.input_tokens  || 0;
      sonnetOut += enrichment.usage?.output_tokens || 0;
      return { ...company, websiteContent, pageMetadata, keepSignals, lowSignal, claimsLocalManufacturing, ...enrichment, dateAdded: today, status: 'enriched' };
    } catch (err) {
      console.error(`[EnrichUrls] ${company.website}:`, err.message);
      return { ...company, status: 'error', dateAdded: today };
    }
  };

  const worker = async () => {
    while (idx < companies.length && !aborted) {
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

  const sonnetCost    = (sonnetIn / 1_000_000 * 3) + (sonnetOut / 1_000_000 * 15);
  const firecrawlCost = companies.length * 0.003;
  console.log(`[EnrichUrls] ${companies.length} urls | Sonnet=$${sonnetCost.toFixed(4)} | Firecrawl=$${firecrawlCost.toFixed(4)}`);

  if (searchId) {
    await appendSearchRunCosts(searchId, { sonnetCostUsd: sonnetCost, firecrawlCostUsd: firecrawlCost }, req.userId);
    const savedLeads = await saveLeads(searchId, results, req.userId);
    if (savedLeads?.length) {
      const idMap = new Map(savedLeads.map(l => [l.company_name, l.id]));
      results.forEach(r => { if (r.companyName) r.dbId = idMap.get(r.companyName) || null; });
    }
  }

  const qualified = results.filter(r =>
    !r.status?.startsWith('filtered') && !r.status?.startsWith('error') &&
    Number(r.icpScore || 0) >= 5 && Number(r.intentScore || 0) >= 5
  ).length;

  send({ type: 'done', results, qualified });
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
    try { await appendSearchRunCosts(searchId, { sonnetCostUsd: sonnetCost, firecrawlCostUsd: 0 }, req.userId); }
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
      // User-picked email framework from the /app wizard ws5 step. The
      // /lens flow doesn't send this — falls back to peter_kang_3part below.
      framework_key: clientFrameworkKey = null,
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
        (runId) => { send({ type: 'apify_run_id', runId }); },
      ),
      750000,
      'Apify scrape',
    );

    // Dedup against historical leads — same logic as /api/scrape-raw
    const { placeIds, phones, emails: existingEmails, domains } = await getExistingLeadKeys(req.userId);
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

    const searchId = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: rawCompanies.length }, req.userId);
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
      await saveLeads(searchId, persistRows, req.userId);
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

    // ── Phase 4: email generation ──────────────────────────────────────────
    // templateKey (customer-type angle) is still server-derived from the query.
    // frameworkKey now honors the user's wizard pick (ws5 on /app). /lens auto
    // and any caller that omits framework_key continues to get peter_kang_3part.
    const ALLOWED_FW_KEYS = new Set(['peter_kang_3part','cold_5_step','cold_7_step','aida','bab','pas','byaf','sch','three_ps']);
    const templateKey  = templateKeyFromQuery(searchQuery);
    const frameworkKey = (clientFrameworkKey && ALLOWED_FW_KEYS.has(clientFrameworkKey))
      ? clientFrameworkKey
      : 'cold_7_step';
    console.log(`[Auto] frameworkKey=${frameworkKey} (client sent: ${clientFrameworkKey || '(none)'})`);
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
      const saved = await saveLeads(searchId, allLeads, req.userId);
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
          if (result.success) { pushed++; await markLeadEmailedByEmail(lead.email, req.userId, searchId); }
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

// ── Auto-run starting from an existing Apify dataset (SSE) ────────────────────
// POST /api/auto/run-from-dataset
// Body: { runId, searchQuery, location, countryCode?, maxResults?, campaignId?,
//         companyProfile?, icp?, framework_key? }
// Same Haiku → Sonnet → email → push pipeline as /api/auto/run, but Phase 1
// re-uses items from a prior Apify run by runId instead of re-scraping. Dedup
// is skipped — the user is explicitly asking to process the dataset as-is.
app.post('/api/auto/run-from-dataset', requireAuth, async (req, res) => {
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
      runId,
      searchQuery = 'dataset',
      location = '',
      countryCode = 'au',
      maxResults: mr = 100,
      campaignId = '',
      companyProfile = {},
      icp = '',
      framework_key: clientFrameworkKey = null,
    } = req.body;

    if (!runId) {
      send({ type: 'error', phase: 'preflight', error: '缺少 runId' });
      return;
    }
    const maxResults = Math.min(1000, Math.max(1, parseInt(mr) || 100));

    console.log(`\n[AutoDataset] ===== Auto-run-from-dataset start =====`);
    console.log(`[AutoDataset] runId=${runId} | campaign=${campaignId || '(none)'}`);

    // ── Phase 0: Active-campaign safeguard (same as /api/auto/run) ─────────
    if (campaignId) {
      const { getCampaignStatus } = require('./services/instantly');
      const { status, name } = await withTimeout(getCampaignStatus(campaignId), 30000, 'Instantly campaign check');
      const isActive = status === 1 || status === 'active';
      if (isActive) {
        send({
          type: 'error', phase: 'preflight',
          error: `Campaign "${name}" 当前处于 Active 状态，推送会立刻发邮件。请先在 Instantly 中暂停 Campaign 后重试。`,
        });
        return;
      }
    }

    // ── Phase 1: fetch from existing Apify dataset (no re-scrape) ──────────
    const { fetchDatasetByRunId } = require('./services/apify');
    send({ type: 'phase', phase: 'apify', status: 'start' });
    const { companies: rawCompanies, apifyCostUsd } = await withTimeout(
      fetchDatasetByRunId(runId),
      60000,
      'Apify dataset fetch',
    );
    const apifyCost = apifyCostUsd ?? 0;

    // Skip dedup — user is explicitly replaying a dataset.
    const newCompanies = rawCompanies;
    const dedupSkipped = 0;

    const searchId = await saveSearchRun({ query: searchQuery, location, maxResults, totalScraped: rawCompanies.length }, req.userId);
    send({
      type: 'phase', phase: 'apify', status: 'done',
      scraped: rawCompanies.length, newLeads: rawCompanies.length, dedupSkipped: 0,
      searchId, apifyCostUsd: 0,
    });

    if (!newCompanies.length) {
      await updateSearchRunCosts(searchId, { apifyCostUsd: 0, anthropicCostUsd: 0, totalCostUsd: 0, totalQualified: 0 });
      send({
        type: 'done', searchId,
        summary: { scraped: 0, dedupSkipped: 0, haikuRecommend: 0, withEmail: 0, qualified: 0, emailsGenerated: 0, pushed: 0, pushFailed: 0, costs: { apify: 0, haiku: 0, sonnet: 0, firecrawl: 0, total: 0 } },
        results: [],
        note: 'Dataset 为空',
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

    // ── Phase 2.5: Email-presence filter ───────────────────────────────────
    const forSonnet  = recommended.filter(c => c.email?.trim());
    const noEmail    = recommended.filter(c => !c.email?.trim());
    send({
      type: 'phase', phase: 'email-filter', status: 'done',
      withEmail: forSonnet.length, withoutEmail: noEmail.length,
    });

    const today = new Date().toISOString().split('T')[0];

    if (!forSonnet.length) {
      const persistRows = [
        ...haikuSkipped.map(c => ({ ...c, status: 'filtered: haiku', dateAdded: today })),
        ...noEmail.map(c     => ({ ...c, status: 'filtered: no_email', dateAdded: today })),
      ];
      await saveLeads(searchId, persistRows, req.userId);
      const haikuCost = (haikuIn / 1_000_000 * 0.80) + (haikuOut / 1_000_000 * 4.00);
      await updateSearchRunCosts(searchId, { apifyCostUsd: 0, anthropicCostUsd: haikuCost, totalCostUsd: haikuCost, totalQualified: 0 });
      send({
        type: 'done', searchId,
        summary: { scraped: rawCompanies.length, dedupSkipped: 0, haikuRecommend: recommended.length, haikuSkip: haikuSkipped.length, withEmail: 0, withoutEmail: noEmail.length, qualified: 0, emailsGenerated: 0, pushed: 0, pushFailed: 0, costs: { apify: 0, haiku: haikuCost, sonnet: 0, firecrawl: 0, total: haikuCost } },
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
            console.error(`[AutoDataset/ICP] ${company.companyName}:`, err.message);
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

    // ── Phase 4: email generation ──────────────────────────────────────────
    const ALLOWED_FW_KEYS = new Set(['peter_kang_3part','cold_5_step','cold_7_step','aida','bab','pas','byaf','sch','three_ps']);
    const templateKey  = templateKeyFromQuery(searchQuery);
    const frameworkKey = (clientFrameworkKey && ALLOWED_FW_KEYS.has(clientFrameworkKey))
      ? clientFrameworkKey
      : 'cold_7_step';
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
              .catch(e => console.warn(`[AutoDataset/Emails] DB persist failed for "${company.companyName}":`, e.message));
          } catch (err) {
            console.error(`[AutoDataset/Emails] ${company.companyName}:`, err.message);
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

    // ── Persist all leads to Supabase ──────────────────────────────────────
    const allLeads = [
      ...icpResults,
      ...haikuSkipped.map(c => ({ ...c, status: 'filtered: haiku', dateAdded: today })),
      ...noEmail.map(c     => ({ ...c, status: 'filtered: no_email', dateAdded: today })),
    ];
    try {
      const saved = await saveLeads(searchId, allLeads, req.userId);
      if (saved?.length) {
        const idMap = new Map(saved.map(l => [l.company_name, l.id]));
        allLeads.forEach(r => { if (r.companyName) r.dbId = idMap.get(r.companyName) || null; });
      }
    } catch (e) {
      console.warn(`[AutoDataset] saveLeads failed: ${e.message}`);
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
          if (result.success) { pushed++; await markLeadEmailedByEmail(lead.email, req.userId, searchId); }
          else { pushFailed++; console.warn(`[AutoDataset/Push] ${lead.companyName}: ${result.reason}`); }
        } catch (err) {
          pushFailed++;
          console.error(`[AutoDataset/Push] ${lead.companyName}:`, err.message);
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

    console.log(`[AutoDataset] ===== Done =====`);
    console.log(`[AutoDataset] dataset=${rawCompanies.length} haikuRec=${recommended.length} withEmail=${forSonnet.length} qualified=${qualified.length} emails=${emailsGenerated} pushed=${pushed}/${pushable.length}`);

    send({
      type: 'done',
      searchId,
      summary: {
        scraped:         rawCompanies.length,
        dedupSkipped:    0,
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
        costs: { apify: 0, haiku: haikuCost, sonnet: sonnetCost, firecrawl: firecrawlCost, total: totalCost },
      },
      results: allLeads,
    });
  } catch (err) {
    console.error('[AutoDataset] FATAL:', err.message, err.stack);
    send({ type: 'error', phase: 'fatal', error: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── Resume from a prior Apify run by runId (SSE) ─────────────────────────────
// POST /api/apify/resume  — input: { runId, companyProfile?, icp?, campaignId?, framework_key? }
// Re-fetches the dataset items from Apify by runId and streams them to the
// client so the pipeline can be resumed (or the raw scrape recovered) after
// a client disconnect / page refresh.
app.post('/api/apify/resume', requireAuth, async (req, res) => {
  const { runId } = req.body;
  if (!runId) return res.status(400).json({ ok: false, error: 'runId required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n');
  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    const { fetchDatasetByRunId } = require('./services/apify');
    send({ type: 'phase', phase: 'apify', status: 'start' });
    const { companies } = await withTimeout(fetchDatasetByRunId(runId), 60000, 'Apify dataset fetch');
    send({ type: 'phase', phase: 'apify', status: 'done', scraped: companies.length });
    send({ type: 'resume_ready', companies });
  } catch (err) {
    send({ type: 'error', phase: 'apify', message: err.message });
  }
  res.end();
});

// ── Search history ────────────────────────────────────────────────────────────
// User-facing price markup: the DB stores REAL cost; everything a user sees is
// real × COST_MARKUP (default 5). Override with COST_MARKUP in .env if pricing
// changes — no code edit needed.
const COST_MARKUP = parseFloat(process.env.COST_MARKUP || '5');

// ── Free-quota gate ───────────────────────────────────────────────────────────
// Every registered user gets a free spend quota (user-facing USD; default $5,
// per-user override via the user_quotas table). Over quota → 402 QUOTA_EXCEEDED
// and the user contacts support; support raises quota_usd for that user.
// Legacy-token traffic (owner / lens) is exempt. Spend is cached 60s per user
// so per-lead endpoints don't hammer Supabase.
const _quotaCache = new Map(); // userId → { spentUsd, quotaUsd, expires }
async function getQuotaState(userId) {
  const now = Date.now();
  const hit = _quotaCache.get(userId);
  if (hit && hit.expires > now) return hit;
  const [summary, quotaUsd] = await Promise.all([getCostSummary(userId), getUserQuotaUsd(userId)]);
  const state = {
    spentUsd: parseFloat(((summary?.totalCostUsd || 0) * COST_MARKUP).toFixed(2)),
    quotaUsd,
    expires: now + 60_000,
  };
  _quotaCache.set(userId, state);
  return state;
}
// Returns true when the request may proceed; otherwise responds 402 and returns
// false. Fail-open on errors — a quota outage must never break the product.
async function requireQuota(req, res) {
  if (!req.userId || req.userId === 'legacy') return true;
  try {
    const q = await getQuotaState(req.userId);
    if (q.spentUsd >= q.quotaUsd) {
      res.status(402).json({
        success: false,
        error_code: 'QUOTA_EXCEEDED',
        quotaUsd: q.quotaUsd,
        spentUsd: q.spentUsd,
        error: `免费额度 $${q.quotaUsd} 已用完，请联系客服提升额度`,
      });
      return false;
    }
  } catch (e) {
    console.warn('[Quota] check failed (fail-open):', e.message);
  }
  return true;
}

app.get('/api/history', requireAuth, async (req, res) => {
  const [history, emailsSent, sentCounts, writtenCounts, sentStats, profiles] = await Promise.all([
    getSearchHistory(30, req.userId),
    getEmailsSentCount(req.userId),
    getSentCountsBySearch(req.userId),
    getWrittenCountsBySearch(req.userId),    // 流程状态：写没写过邮件
    getSentEmailStats(req.userId),           // hero 成果条：客户数 + 开发信封数
    listProductProfiles(req.userId),         // searchId → 产品名（历史标签）
  ]);
  const productBySearch = {};
  (profiles || []).forEach(p => {
    (Array.isArray(p.data?.searchIds) ? p.data.searchIds : []).forEach(sid => { productBySearch[sid] = p.name; });
  });
  const marked = (history || []).map(r => ({
    ...r,
    sent_count:         sentCounts[r.id] || 0,
    written_count:      writtenCounts[r.id] || 0,
    product_label:      productBySearch[r.id] || null,
    apify_cost_usd:     r.apify_cost_usd     != null ? parseFloat((r.apify_cost_usd     * COST_MARKUP).toFixed(4)) : r.apify_cost_usd,
    anthropic_cost_usd: r.anthropic_cost_usd != null ? parseFloat((r.anthropic_cost_usd * COST_MARKUP).toFixed(4)) : r.anthropic_cost_usd,
    total_cost_usd:     r.total_cost_usd     != null ? parseFloat((r.total_cost_usd     * COST_MARKUP).toFixed(4)) : r.total_cost_usd,
  }));
  // Quota info for the personal-center 额度卡 (null for legacy-token users).
  let quotaUsd = null, spentUsd = null;
  if (req.userId && req.userId !== 'legacy') {
    try { const q = await getQuotaState(req.userId); quotaUsd = q.quotaUsd; spentUsd = q.spentUsd; } catch (_) {}
  }
  res.json({ success: true, history: marked, emailsSent, sentStats, quotaUsd, spentUsd });
});

app.get('/api/history/:id', requireAuth, async (req, res) => {
  const leads = await getLeadsForSearch(req.params.id, req.userId);
  console.log(`[History] 加载 ID: ${req.params.id}，找到 ${leads.length} 条 leads`);
  res.json({ success: true, leads });
});

// Load the raw scraped leads for a given searchId so the frontend can rehydrate
// _rawResults after a page refresh. The leads table has no status column, so we
// return everything for the searchId — manual scrape runs only ever produce raw
// rows here, so no filtering is needed in practice.
app.get('/api/raw/:searchId', requireAuth, async (req, res) => {
  const leads = await getLeadsForSearch(req.params.searchId, req.userId);
  console.log(`[Raw] 加载 searchId: ${req.params.searchId}，找到 ${leads.length} 条 raw leads`);
  res.json({ success: true, leads });
});

app.delete('/api/history/:id', requireAuth, async (req, res) => {
  const ok = await deleteSearchRun(req.params.id, req.userId);
  if (!ok) return res.status(500).json({ success: false, error: '删除失败' });
  console.log(`[History] Deleted search run ${req.params.id}`);
  res.json({ success: true });
});

// ── Product profiles (saved 业务信息 presets, per user) ───────────────────────
// Lets a user save each product's business-info as a named preset and switch
// between them without re-typing. All routes are user-scoped via req.userId.
app.get('/api/products', requireAuth, async (req, res) => {
  const profiles = await listProductProfiles(req.userId);
  // Card stats: how many emailed customers each product has accumulated.
  const withStats = await Promise.all((profiles || []).map(async (p) => {
    let customers = 0;
    const ids = Array.isArray(p.data?.searchIds) ? p.data.searchIds : [];
    if (ids.length) {
      try {
        const db = require('./services/supabase');
        const { leads } = await db.getProductSentLeads(p.id, req.userId);
        customers = leads.length;
      } catch (_) {}
    }
    return { ...p, customers };
  }));
  res.json({ success: true, profiles: withStats });
});

// ── 产品客户表：该产品名下所有"发过邮件"的客户 ────────────────────────────────
app.get('/api/products/:id/leads', requireAuth, async (req, res) => {
  const { profile, leads } = await getProductSentLeads(req.params.id, req.userId);
  if (!profile) return res.status(404).json({ success: false, error: '产品不存在' });
  res.json({ success: true, name: profile.name, leads });
});

// 「邮件管理」状态提醒：产品全部线索（不限已发）+ 三态汇总。
// 待写邮件 = 没写过开发信；待发送 = 写好了但没发；已发送 = email_sent_at 有值。
app.get('/api/products/:id/pipeline', requireAuth, async (req, res) => {
  const { profile, leads, searches } = await getProductAllLeads(req.params.id, req.userId);
  if (!profile) return res.status(404).json({ success: false, error: '产品不存在' });
  const written = l => !!((l.email1_subject && String(l.email1_subject).trim()) || (l.email1_body && String(l.email1_body).trim()));
  // 筛选口径：'pass'→通过；'fail'→没过；数字→>=5 通过；空/未知→还没筛(null)。
  const passed = v => { v = String(v==null?'':v).trim().toLowerCase(); if(v==='pass') return true; if(v==='fail') return false; const n = parseFloat(v); if(!isNaN(n)) return n>=5; return null; };
  let toFilter = 0, toWrite = 0, toSend = 0, sent = 0, excluded = 0;
  for (const l of leads) {
    if (l.email_sent_at) { sent++; continue; }           // 已发送
    if (written(l)) { toSend++; continue; }               // 写好了、待发送
    const p = passed(l.icp_score);
    if (p === true) toWrite++;                            // 筛过通过、待写
    else if (p === false) excluded++;                    // 筛过没通过、不合格
    else toFilter++;                                     // 还没筛、待筛选
  }
  res.json({ success: true, name: profile.name, leads, searches: searches || [], summary: { total: leads.length, toFilter, toWrite, toSend, sent, excluded } });
});

// ── 产品客户表 → Excel 客户表（.xlsx 下载，样式化表格） ──────────────────────
app.get('/api/products/:id/export.xlsx', requireAuth, async (req, res) => {
  const { profile, leads } = await getProductSentLeads(req.params.id, req.userId);
  if (!profile) return res.status(404).json({ success: false, error: '产品不存在' });
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = '智拓客';
    const ws = wb.addWorksheet('客户开发报告', { views: [{ state: 'frozen', ySplit: 4 }] });

    const INDIGO = 'FF4F46E5', ZEBRA = 'FFF8F8FD', GREEN = 'FF16A34A', GREY = 'FF6B7280', INK = 'FF17181C';
    const today = new Date();
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    const cities = [...new Set(leads.map(l => (l.city || '').split(',')[0].trim()).filter(Boolean))];

    ws.columns = [
      { width: 30 }, { width: 34 }, { width: 30 }, { width: 18 },
      { width: 18 }, { width: 10 }, { width: 56 }, { width: 14 },
    ];
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = `${profile.name} · 客户开发报告`;
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: INK } };
    ws.getRow(1).height = 26;
    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = `智拓客自动生成 · ${dateStr} · 客户 ${leads.length} · 覆盖 ${cities.length} 城 · 已发精准开发邮件 ${leads.length * 5} 封`;
    ws.getCell('A2').font = { size: 10, color: { argb: GREY } };

    const header = ['公司名称', '官网', '邮箱', '电话', '城市', 'AI 判定', '判定理由', '发送时间'];
    const hr = ws.getRow(4);
    header.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INDIGO } };
      c.alignment = { vertical: 'middle' };
    });
    hr.height = 20;

    leads.forEach((l, i) => {
      const sentAt = l.email_sent_at
        ? (() => { const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(l.email_sent_at) ? l.email_sent_at : l.email_sent_at + 'Z'); return `${d.getMonth() + 1}月${d.getDate()}日`; })()
        : '';
      const verdict = l.icp_score === 'pass' ? '✓ 推荐' : (l.icp_score === 'fail' ? '✗ 不推荐' : '—');
      const row = ws.addRow([
        l.company_name || '', l.website || '', l.email || '', l.phone || '',
        (l.city || '').split(',')[0], verdict, l.icp_reasoning || '', sentAt,
      ]);
      row.getCell(1).font = { bold: true };
      row.getCell(6).font = { bold: true, color: { argb: l.icp_score === 'pass' ? GREEN : GREY } };
      row.getCell(7).alignment = { wrapText: true, vertical: 'top' };
      if (i % 2) row.eachCell({ includeEmpty: true }, c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }; });
    });
    ws.autoFilter = { from: 'A4', to: 'H4' };

    const buffer = await wb.xlsx.writeBuffer();
    const fname = `${profile.name}-客户表-${today.toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leads.xlsx"; filename*=UTF-8''${encodeURIComponent(fname)}`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('[ProductXlsx] error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 产品客户表 → Word 客户开发报告（.docx 下载） ─────────────────────────────
app.get('/api/products/:id/export.docx', requireAuth, async (req, res) => {
  const { profile, leads } = await getProductSentLeads(req.params.id, req.userId);
  if (!profile) return res.status(404).json({ success: false, error: '产品不存在' });
  const { Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = require('docx');

  const INDIGO = '4F46E5', INK = '17181C', GREY = '6B7280', LGREY = '8A8F9C', ZEBRA = 'F8F8FD', GREEN = '16A34A';
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const thin = { style: BorderStyle.SINGLE, size: 4, color: 'E9EAF2' };
  const txt = (t, opts) => new TextRun({ text: String(t ?? ''), font: 'Microsoft YaHei', size: 18, color: '30323B', ...opts });
  const para = (runs, opts) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], ...opts });
  const cell = (children, opts) => new TableCell({ children: Array.isArray(children) ? children : [children], margins: { top: 90, bottom: 90, left: 110, right: 110 }, ...opts });

  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
  const cities = [...new Set(leads.map(l => (l.city || '').split(',')[0].trim()).filter(Boolean))];
  const emailsCount = leads.length * 5;

  const children = [
    // 紫色题头条（细表格模拟色带）
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [
      cell(para(txt(' ', { size: 6 })), { shading: { fill: INDIGO }, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder } }),
    ] })] }),
    para(txt(' ', { size: 10 })),
    para(txt(`${profile.name} · 客户开发报告`, { bold: true, size: 44, color: INK })),
    para(txt(`智拓客自动生成 · ${dateStr}`, { size: 18, color: GREY }), { spacing: { after: 260 } }),
    // 统计行
    para([
      txt(`开发客户 `, { size: 20, color: GREY }), txt(`${leads.length}`, { bold: true, size: 30, color: INDIGO }),
      txt(`    已发精准开发邮件 `, { size: 20, color: GREY }), txt(`${emailsCount}`, { bold: true, size: 30, color: INDIGO }),
      txt(`    覆盖城市 `, { size: 20, color: GREY }), txt(`${cities.length}`, { bold: true, size: 30, color: INDIGO }),
    ], { spacing: { after: 300 } }),
    para(txt('客户明细', { bold: true, size: 24, color: INDIGO }), { spacing: { after: 140 } }),
  ];

  const headRow = new TableRow({ children: ['公司名称', '邮箱', '电话', '城市', 'AI 判定', '发送时间'].map(h =>
    cell(para(txt(h, { bold: true, color: 'FFFFFF', size: 17 })), { shading: { fill: INDIGO } })) });
  const bodyRows = [];
  leads.forEach((l, i) => {
    const sentAt = l.email_sent_at ? (() => { const d = new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(l.email_sent_at) ? l.email_sent_at : l.email_sent_at + 'Z'); return `${d.getMonth() + 1}月${d.getDate()}日`; })() : '';
    const verdict = l.icp_score === 'pass' ? '✓ 推荐' : (l.icp_score === 'fail' ? '✗ 不推荐' : '—');
    const shade = i % 2 ? { shading: { fill: ZEBRA } } : {};
    bodyRows.push(new TableRow({ children: [
      cell(para(txt(l.company_name || '—', { bold: true })), shade),
      cell(para(txt(l.email || '—')), shade),
      cell(para(txt(l.phone || '—')), shade),
      cell(para(txt((l.city || '—').split(',')[0])), shade),
      cell(para(txt(verdict, { bold: true, color: l.icp_score === 'pass' ? GREEN : GREY })), shade),
      cell(para(txt(sentAt || '—')), shade),
    ] }));
    const extra = [l.icp_reasoning ? `AI 理由：${l.icp_reasoning}` : '', l.website ? `官网：${l.website}` : ''].filter(Boolean).join(' ｜ ');
    if (extra) bodyRows.push(new TableRow({ children: [
      cell(para(txt(extra, { size: 15, color: LGREY })), { columnSpan: 6 }),
    ] }));
  });
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headRow, ...bodyRows],
    borders: { top: thin, bottom: thin, left: noBorder, right: noBorder, insideHorizontal: thin, insideVertical: noBorder },
  }));
  children.push(para(txt(`${profile.name} · 客户开发报告　　由 智拓客 ignightlead.com 生成`, { size: 14, color: LGREY }), { alignment: AlignmentType.RIGHT, spacing: { before: 280 } }));

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  const fname = `${profile.name}-客户开发报告-${today.toISOString().slice(0, 10)}.docx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="report.docx"; filename*=UTF-8''${encodeURIComponent(fname)}`);
  res.send(buffer);
});

app.post('/api/products', requireAuth, async (req, res) => {
  const name = (req.body?.name || '').toString().trim();
  const data = req.body?.data;
  if (!name) return res.status(400).json({ success: false, error: '缺少品类名称' });
  if (!data || typeof data !== 'object') return res.status(400).json({ success: false, error: '缺少业务信息数据' });
  const profile = await createProductProfile(req.userId, name.slice(0, 120), data);
  if (!profile) return res.status(500).json({ success: false, error: '保存失败' });
  res.json({ success: true, profile });
});

// Auto-save on search start: ensure a product exists for this 业务信息 (keyed by
// name — one 品类 = one product), refreshing its data but preserving searchIds.
// The frontend calls this right before a scrape so the run files under the right
// product regardless of which one was "使用中".
app.post('/api/products/ensure', requireAuth, async (req, res) => {
  const name = (req.body?.name || '').toString().trim();
  const data = req.body?.data;
  if (!name) return res.status(400).json({ success: false, error: '缺少品类名称' });
  if (!data || typeof data !== 'object') return res.status(400).json({ success: false, error: '缺少业务信息数据' });
  const profile = await ensureProductProfile(req.userId, name.slice(0, 120), data);
  if (!profile) return res.status(500).json({ success: false, error: '保存失败' });
  res.json({ success: true, profile });
});

app.patch('/api/products/:id', requireAuth, async (req, res) => {
  const fields = {};
  if (req.body?.name != null) {
    const n = req.body.name.toString().trim();
    if (!n) return res.status(400).json({ success: false, error: '名称不能为空' });
    fields.name = n.slice(0, 120);
  }
  if (req.body?.data != null) {
    if (typeof req.body.data !== 'object') return res.status(400).json({ success: false, error: '业务信息数据格式错误' });
    fields.data = req.body.data;
  }
  if (!Object.keys(fields).length) return res.status(400).json({ success: false, error: '无更新内容' });
  const profile = await updateProductProfile(req.params.id, req.userId, fields);
  if (!profile) return res.status(500).json({ success: false, error: '更新失败' });
  res.json({ success: true, profile });
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  const ok = await deleteProductProfile(req.params.id, req.userId);
  if (!ok) return res.status(500).json({ success: false, error: '删除失败' });
  res.json({ success: true });
});

// ── AI 推荐海关编码 HS code ────────────────────────────────────────────────────
// 产品描述 → Haiku → 品类级 HS 编码(4-6位,够搜海关线索找进口商)。前端存进产品 data.hsCode。
app.post('/api/recommend-hs', requireAuth, async (req, res) => {
  const product = (req.body?.product || '').toString().trim().slice(0, 200);
  if (!product) return res.status(400).json({ success: false, error: 'product required' });
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `产品:"${product}"。给出这个产品最可能的海关 HS 编码(国际协调制度 Harmonized System，取 4-6 位品类级即可，用于海关数据检索找进口商)。只返回 JSON，不要多余文字:{"hsCode":"XXXX.XX","note":"品类简述(10字内)"}`,
      }],
    }), 30000, 'HS recommend');
    const text = (response.content?.[0]?.text || '').trim();
    let out = {};
    try { out = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]); } catch (_) {}
    res.json({ success: true, hsCode: out.hsCode || '', note: out.note || '' });
  } catch (e) {
    console.error('[HS] recommend error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
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

// ── SMTP test connection ─────────────────────────────────────────────────────
// POST /api/smtp/test  body: { smtpConfig: { host, port, user, pass, ... } }
app.post('/api/smtp/test', requireAuth, async (req, res) => {
  const { smtpConfig } = req.body || {};
  if (!smtpConfig?.user || !smtpConfig?.pass) {
    return res.status(400).json({ ok: false, error: '请填写邮箱和密码' });
  }
  const { testConnection } = require('./services/smtp');
  try {
    await testConnection(smtpConfig);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── SMTP send batch (SSE stream) ─────────────────────────────────────────────
// POST /api/smtp/send-batch  body: { leads: [...], smtpConfig: {...} }
app.post('/api/smtp/send-batch', requireAuth, async (req, res) => {
  const { leads, smtpConfig } = req.body || {};
  if (!leads?.length) {
    return res.status(400).json({ ok: false, error: '没有leads' });
  }
  if (!smtpConfig?.user || !smtpConfig?.pass) {
    return res.status(400).json({ ok: false, error: 'SMTP配置不完整' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sse = d => res.write('data: ' + JSON.stringify(d) + '\n\n');
  const abortRef = { aborted: false };
  res.on('close', () => { abortRef.aborted = true; });

  sse({ type: 'start', total: leads.length });

  try {
    const { sendBatch } = require('./services/smtp');
    const results = await sendBatch(
      smtpConfig,
      leads,
      (done, total, companyName, status, waitSec) => {
        sse({ type: 'progress', done, total, company: companyName, status, waitSec });
      },
      abortRef,
    );
    const sent   = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    sse({ type: 'done', sent, failed });
  } catch (err) {
    sse({ type: 'error', message: err.message });
  }
  res.end();
});

// ── Add lead (full 5-email sequence) to Instantly campaign ───────────────────
// POST /api/instantly/add-lead
// Body: { lead: { email, companyName, website?, phone?, emails?: [{subject,body}] }, campaignId? }
//
// Bulk pushes from the UI fire this endpoint N times in quick succession. To
// avoid hitting Instantly's /campaigns/{id} API once per lead, cache the
// status response for 10 seconds keyed on campaignId. Status changes are rare
// inside a single bulk-push window.
const _campaignStatusCache = new Map(); // id → { status, name, expires }
const CAMPAIGN_STATUS_TTL_MS = 10_000;
async function _cachedCampaignStatus(id) {
  const { getCampaignStatus } = require('./services/instantly');
  const now = Date.now();
  const cached = _campaignStatusCache.get(id);
  if (cached && cached.expires > now) return { status: cached.status, name: cached.name };
  const fresh = await withTimeout(getCampaignStatus(id), 30000, 'Instantly campaign check');
  _campaignStatusCache.set(id, { ...fresh, expires: now + CAMPAIGN_STATUS_TTL_MS });
  return fresh;
}

app.post('/api/instantly/add-lead', requireAuth, async (req, res) => {
  const { lead, campaignId: campaignIdOverride, searchId } = req.body;
  if (!lead?.email?.trim()) {
    return res.status(400).json({ success: false, error_code: 'BAD_INPUT', error: 'lead.email is required' });
  }

  const { addLeadToCampaign } = require('./services/instantly');

  // Refuse to push if the target campaign is Active — same safeguard as /api/auto/run.
  // Pushing into an Active campaign triggers immediate sending. The error_code
  // lets the frontend recognize this specific failure and abort the rest of a
  // bulk loop instead of hammering N identical 400s.
  const effectiveCampaignId = campaignIdOverride || process.env.INSTANTLY_CAMPAIGN_ID;
  if (effectiveCampaignId) {
    try {
      const { status, name } = await _cachedCampaignStatus(effectiveCampaignId);
      const isActive = status === 1 || status === 'active';
      if (isActive) {
        console.warn(`[Instantly] Refusing add-lead — campaign "${name}" (${effectiveCampaignId}) is Active`);
        return res.status(400).json({
          success: false,
          error_code: 'CAMPAIGN_ACTIVE',
          campaign_name: name || '',
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
    // Detect Instantly's duplicate-lead rejection — frontend may want to treat
    // it as a soft-success ("already in campaign") rather than a hard error.
    const reasonStr = String(result.reason || '').toLowerCase();
    const isDuplicate = reasonStr.includes('already') || reasonStr.includes('duplicate') || reasonStr.includes('exists');
    return res.status(400).json({
      success: false,
      error_code: isDuplicate ? 'DUPLICATE_LEAD' : 'INSTANTLY_REJECTED',
      error: result.reason,
    });
  }

  console.log(`[Instantly] Lead added to campaign: ${lead.email} (${lead.companyName || '?'})`);
  await markLeadEmailedByEmail(lead.email, req.userId, searchId || null);
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

// ── Instantly: patch an existing lead's fields (e.g. custom_variables) ────────
// POST /api/instantly/patch-lead
// Body: { email, campaignId?, fields }
// Calls PATCH /api/v2/leads/{email} on Instantly to merge `fields` into the
// lead's payload. Used to update generated email content (subject/body) without
// re-adding the lead.
app.post('/api/instantly/patch-lead', requireAuth, async (req, res) => {
  const { email, campaignId, fields } = req.body;
  if (!email?.trim()) {
    return res.status(400).json({ success: false, error_code: 'BAD_INPUT', error: 'email is required' });
  }
  if (!fields || typeof fields !== 'object') {
    return res.status(400).json({ success: false, error_code: 'BAD_INPUT', error: 'fields object is required' });
  }
  const { patchInstantlyLead } = require('./services/instantly');
  const result = await withTimeout(patchInstantlyLead(email, campaignId, fields), 30000, 'Instantly patch-lead');
  return res.status(result.success ? 200 : 500).json(result);
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
  res.json({
    success:   true,
    isAdmin:   req.isAdmin,
    email:     req.user?.email || null,
    createdAt: req.user?.created_at || null,
  });
});

// ── Admin: cost summary ───────────────────────────────────────────────────────
app.get('/api/admin/costs', requireAuth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });
  const summary = await getCostSummary(req.userId);
  res.json({ success: true, ...summary });
});

// ── Admin: 账号管理（个人中心管理员区块） ──────────────────────────────────────
// 列出全部账号 + 用量；花费按用户价（×COST_MARKUP）口径，和额度同一单位。
app.get('/api/admin/users', requireAuth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });
  const users = await getAdminUsersOverview();
  res.json({
    success: true,
    users: users.map(u => ({ ...u, spendUsd: parseFloat((u.spendRealUsd * COST_MARKUP).toFixed(2)) })),
  });
});

// 修改某账号的额度（user-facing USD）。写入后清掉额度缓存立即生效。
app.post('/api/admin/users/:id/quota', requireAuth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });
  const quotaUsd = Number(req.body?.quotaUsd);
  if (!Number.isFinite(quotaUsd) || quotaUsd < 0) {
    return res.status(400).json({ success: false, error: 'quotaUsd must be a non-negative number' });
  }
  const ok = await setUserQuotaUsd(req.params.id, quotaUsd);
  if (!ok) return res.status(500).json({ success: false, error: '写入失败' });
  _quotaCache.delete(req.params.id); // 立即生效，不等 60s 缓存过期
  res.json({ success: true });
});

// ── 自动发帖 (Blotato) — admin-only: posts go to the OWNER's social accounts ──
app.get('/api/autopost/accounts', requireAuth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });
  try {
    const { listBlotatoAccounts } = require('./services/blotato');
    const accounts = await withTimeout(listBlotatoAccounts(), 30000, 'Blotato accounts');
    res.json({ success: true, accounts });
  } catch (e) {
    console.error('[Autopost] accounts error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Body: { targets: [{ id, platform, pageId? }], text, mediaUrls?, scheduledTime? }
app.post('/api/autopost/publish', requireAuth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });
  const { targets, text, mediaUrls, scheduledTime } = req.body || {};
  const list = Array.isArray(targets) ? targets.slice(0, 10) : [];
  if (!list.length) return res.status(400).json({ success: false, error: '请至少选择一个账号' });
  if (!(text || '').trim() && !(Array.isArray(mediaUrls) && mediaUrls.length)) {
    return res.status(400).json({ success: false, error: '帖子内容和媒体不能都为空' });
  }
  const { publishBlotatoPost } = require('./services/blotato');
  const results = [];
  for (const t of list) {
    const r = await withTimeout(
      publishBlotatoPost({ accountId: t.id, platform: t.platform, pageId: t.pageId || '', text: text || '', mediaUrls: mediaUrls || [], scheduledTime: scheduledTime || null }),
      60000, 'Blotato publish'
    ).catch(e => ({ success: false, error: e.message }));
    results.push({ id: t.id, platform: t.platform, success: !!r.success, error: r.error || null });
  }
  res.json({ success: true, results });
});

// Body: { topic, platforms?, language? } → { text } (Sonnet-written social post)
app.post('/api/autopost/generate', requireAuth, async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ success: false, error: 'Admin only' });
  const topic = (req.body?.topic || '').trim();
  if (!topic) return res.status(400).json({ success: false, error: 'topic required' });
  const language  = (req.body?.language || 'English').trim();
  const platforms = Array.isArray(req.body?.platforms) && req.body.platforms.length ? req.body.platforms.join(', ') : 'social media';
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await withTimeout(client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{
        role: 'user',
        content: `Write ONE social media post in ${language} for these platforms: ${platforms}.

Topic / what to promote: ${topic}

Rules:
- Hook in the first line. Concrete, specific, no hype-words like "revolutionary".
- 60-180 words. Short paragraphs or line breaks, easy to skim.
- End with one clear call-to-action.
- 2-4 relevant hashtags at the end (no more).
- Return ONLY the post text, no quotes, no explanations.`,
      }],
    }), 60000, 'Autopost Sonnet');
    res.json({ success: true, text: (response.content[0].text || '').trim() });
  } catch (e) {
    console.error('[Autopost] generate error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function requireAdminPassword(req, res, next) {
  if (!ADMIN_PASSWORD || req.headers['x-admin-password'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'invalid admin password' });
  }
  next();
}

// 报价单价格表。返回的 base_price_cny 是 Lens 的出厂成本价 —— 商业敏感，必须
// 登录才能读，不可改回匿名开放。
//
// 曾经注册在 '/api/products'，与上面 :1578 的用户产品档案接口同名 —— Express
// 先注册先匹配，导致这段代码从未执行过，quote.html 拿到的是那个要 token 的
// 接口并被 401 挡回，产品下拉框永远加载失败。改用独立路径修好。
//
// 副作用：admin.html（Lens 价格管理）读这个接口时不带 token，重新启用报价工具
// 时要一并给它加上。该页目前因 .env 未配 ADMIN_PASSWORD 本就不可用。
app.get('/api/quote/products', requireAuth, async (req, res) => {
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
const IMPORT_PASSWORD = process.env.IMPORT_PASSWORD;

function requireImportPassword(req, res, next) {
  if (!IMPORT_PASSWORD || req.headers['x-import-password'] !== IMPORT_PASSWORD) {
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
        user_id:       req.userId || 'legacy',
      })
      .select('id')
      .single();
    if (histErr) throw histErr;
    const searchId = histRow.id;

    const insertRows = clean.map(r => ({
      search_id:        searchId,
      user_id:          req.userId || 'legacy',
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
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.3px">Aluminium Windows &amp; Doors</div>
        <div style="font-size:13px;opacity:0.85;margin-top:4px">Factory Direct Quotation</div>
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
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13.5px;text-align:right">US$ ${e(q.unitPriceAud)} / m²</td></tr>
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:18px">
          <tr><td style="background:#eff6ff;padding:14px 16px;border-radius:6px;border:1px solid #bfdbfe">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="font-size:13px;color:#1e40af;font-weight:600;letter-spacing:0.02em;text-transform:uppercase">Total</td>
                <td align="right" style="font-size:22px;font-weight:800;color:#1d4ed8;letter-spacing:-0.5px">USD $${e(q.totalAud)}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <p style="font-size:12.5px;color:#64748b;margin:0 0 4px">Valid until <strong style="color:#1e293b">${e(q.validUntil)}</strong></p>
        <p style="font-size:12px;color:#94a3b8;margin:0 0 4px">Prices in US Dollars (USD), EXW unless otherwise stated.</p>
        <p style="font-size:12px;color:#94a3b8;margin:0">Lead time: 25–35 working days from deposit. Payment: 30% deposit / 70% before shipment.</p>
      </td></tr>

      <tr><td style="background:#0f172a;padding:18px 28px;color:#cbd5e1;font-size:12px;text-align:center;line-height:1.6">
        <div>Thank you for your business.</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// 发信必须登录：这个接口会用公司 Gmail 向请求方指定的任意地址发出一封带公司
// 抬头的报价单，匿名开放等于开放邮件中继（可被用来发假报价 / 烧发信声誉 / 触发
// Gmail 滥用封号）。报价单 PDF 是纯前端生成的，不经过这里，所以免费工具的主
// 卖点不受影响 —— 匿名访客照常算价下载，只有"直接发到客户邮箱"需要登录。
app.post('/api/send-quote', requireAuth, async (req, res) => {
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
      from: `"Aluminium Windows & Doors" <${process.env.GMAIL_USER}>`,
      to:      q.customerEmail,
      subject: `Your Quotation — ${q.quoteNumber}`,
      html:    _buildQuoteEmailHtml(q),
    });
    console.log(`[Quote] Sent to ${q.customerEmail} (${q.quoteNumber}) messageId=${info.messageId}`);
    res.json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('[Quote] sendMail failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Google Search inline tool (SSE) ──────────────────────────────────────────
// Runs Apify actor nFJndFXA5zjCTuudP and streams one row per result.
// Body: { keyword, maxResults, fields:['email','phone','website','linkedin'] }
const axios = require('axios');
const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_BASE  = 'https://api.apify.com/v2';

async function _runApifyActor(actorId, input) {
  const start = await axios.post(
    `${APIFY_BASE}/acts/${actorId}/runs`,
    input,
    { params: { token: APIFY_TOKEN }, headers: { 'Content-Type': 'application/json' } }
  );
  const runId = start.data.data.id;
  let status = 'RUNNING';
  const deadline = Date.now() + 10 * 60 * 1000;
  while (status === 'RUNNING' || status === 'READY') {
    if (Date.now() > deadline) throw new Error('Apify run timeout after 10 min');
    await new Promise(r => setTimeout(r, 4000));
    const s = await axios.get(`${APIFY_BASE}/actor-runs/${runId}`, { params: { token: APIFY_TOKEN } });
    status = s.data.data.status;
  }
  if (status !== 'SUCCEEDED') throw new Error(`Apify run failed: ${status}`);
  const items = await axios.get(
    `${APIFY_BASE}/actor-runs/${runId}/dataset/items`,
    { params: { token: APIFY_TOKEN, format: 'json' } }
  );
  return items.data || [];
}

// ── Scraped-email quality helpers (shared by the search/scrape routes) ────────
// Page HTML is full of strings that LOOK like emails but are not contactable:
// Wix/Sentry telemetry IDs (…@sentry-next.wixpress.com), retina image filenames
// (logo@2x.png), JS template placeholders (user@domain.com, yourfriend@email.com),
// URL-encoded mailto fragments (%20sales@…). They pass a bare format regex, get
// stored as the lead's email, then bounce at Instantly/SMTP — and worse, when a
// page has both junk (usually in <head> scripts) and a real contact address,
// "first match wins" picked the junk. Filter junk and prefer mailto:/same-domain.
const EMAIL_SHAPE       = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const JUNK_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|test\.com|domain\.com|email\.com|yourdomain\.[a-z]+|mysite\.com|website\.com|company\.com|wixpress\.com|sentry\.io)$/i;
const JUNK_EMAIL_LOCAL  = /^(user|username|yourname|yourfriend|youremail|name|email|someone|test|example|firstname|lastname|noreply|no-reply)$/i;
const FILE_EXT_TLD      = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|json|woff2?|ttf|eot|mp4|webm|pdf|zip)$/i;

function _isRealEmail(raw) {
  const e = String(raw || '').trim().replace(/^(%20)+/i, '');
  if (!EMAIL_SHAPE.test(e)) return false;
  if (FILE_EXT_TLD.test(e)) return false;                 // logo@2x.png, flags@2x.webp …
  const [local, domain] = e.split('@');
  if (JUNK_EMAIL_LOCAL.test(local)) return false;         // user@…, yourfriend@…
  if (JUNK_EMAIL_DOMAIN.test(domain)) return false;       // …@domain.com, …@wixpress.com
  if (/^[0-9a-f]{16,}$/i.test(local.replace(/[._\-]/g, ''))) return false; // hex telemetry ids
  return true;
}

// Best contact email in a page: mailto: links first (explicit intent), then any
// inline match; among the survivors prefer an address on the site's own domain
// so a testimonial/partner email doesn't shadow the real one.
function _pickBestEmail(html, siteUrl) {
  const h = String(html || '');
  const mailtos = (h.match(/mailto:[^"'?\s<>]+/gi) || []).map(m => {
    try { return decodeURIComponent(m.slice(7)); } catch (_) { return m.slice(7); }
  });
  const inline = h.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
  const seen = new Set();
  const candidates = [...mailtos, ...inline]
    .map(e => String(e).trim().replace(/^(%20)+/i, ''))
    .filter(e => { const k = e.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  let siteDomain = '';
  try { siteDomain = new URL(siteUrl).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) {}
  const real = candidates.filter(_isRealEmail);
  if (real.length) {
    const sameDomain = siteDomain
      ? real.find(e => e.toLowerCase().split('@')[1] === siteDomain || e.toLowerCase().endsWith('.' + siteDomain))
      : '';
    return sameDomain || real[0];
  }
  // Placeholder-style local part on the site's OWN domain is likely a real
  // address (e.g. email@kennedynolan.com.au) — accept it as a last resort.
  if (siteDomain) {
    const loose = candidates.find(e =>
      EMAIL_SHAPE.test(e) && !FILE_EXT_TLD.test(e) && e.toLowerCase().split('@')[1] === siteDomain);
    if (loose) return loose;
  }
  return '';
}

// ── 找邮箱工具（SSE）──────────────────────────────────────────────────────────
// 输入一批公司名 → 每家用 Firecrawl 搜官网 → 抓 HTML → _pickBestEmail 抠邮箱 →
// 逐条流式返回 { company, website, email }。复用现有 Firecrawl / 邮箱质检助手。
app.post('/api/find-emails', requireAuth, async (req, res) => {
  const names = Array.isArray(req.body?.names)
    ? req.body.names.map(n => String(n).trim()).filter(Boolean).slice(0, 40)
    : [];
  if (!names.length) return res.status(400).json({ success: false, error: 'names required' });

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  let aborted = false;
  res.on('close', () => { aborted = true; });
  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  try {
    for (const name of names) {
      if (aborted) break;
      let website = '', email = '';
      try {
        website = await withTimeout(searchWebsite(name), 30000, 'find-emails search');
        if (website) {
          const html = await withTimeout(scrapeHtml(website), 40000, 'find-emails scrape');
          email = _pickBestEmail(html, website);
          if (!email) {
            const contactUrl = new URL('/contact', website).toString();
            const h2 = await withTimeout(scrapeHtml(contactUrl), 40000, 'find-emails scrape /contact');
            email = _pickBestEmail(h2, website);
          }
        }
      } catch (_) { /* 单家失败不影响其它 */ }
      send({ type: 'result', company: name, website, email });
    }
    if (!aborted) send({ type: 'done', total: names.length });
  } catch (err) {
    if (!aborted) send({ type: 'error', error: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── 海关数据获客（美国 · ImportYeti via Apify）—— 试点 ────────────────────────
// ImportYeti 采集器查"美国进口商公司名" → 复用现有 Firecrawl(searchWebsite/scrapeHtml/
// _pickBestEmail)补网站+邮箱 → 与所有来源共用一张 leads 表统一去重 → 存为一次搜索
// 批次并挂到产品(和谷歌地图同一套,进「邮件线索管理」)。计费走 requireQuota，用户查一次
// 扣一次额度(SaaS 转售、赚差价)。⚠️ 采集器爬 ImportYeti 违反其 ToS，正式商用前应换官方 API。
const IMPORTYETI_ACTOR = 'parseforge~importyeti-scraper';
function _usableSite(u) {
  const s = String(u || '').trim().toLowerCase();
  if (!/^https?:\/\/[^ ]+\.[a-z]{2,}/.test(s)) return false;
  if (/cbp\.gov|\.gov(\/|$)|importyeti\.com|census\.gov/.test(s)) return false;  // ImportYeti 常返回海关局网址等垃圾
  return true;
}
app.post('/api/customs/search', requireAuth, async (req, res) => {
  const keywords = Array.isArray(req.body?.keywords)
    ? req.body.keywords.map(k => String(k).trim()).filter(Boolean)
    : ((req.body?.keyword || '').trim() ? [String(req.body.keyword).trim()] : []);
  const hsCode    = String(req.body?.hsCode || '').trim();
  const country   = String(req.body?.country || '').trim();
  const count     = Math.min(200, Math.max(1, parseInt(req.body?.count, 10) || 50));
  const productId = req.body?.productId || null;
  const q = keywords[0] || hsCode;   // ImportYeti 按关键词查（HS 兜底）
  if (!q) return res.status(400).json({ success: false, error: '缺少关键词或 HS 编码' });
  if (!(await requireQuota(req, res))) return;

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  let aborted = false;
  res.on('close', () => { aborted = true; });
  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  try {
    send({ type: 'phase', phase: 'query', message: '正在从海关报关记录查进口商…' });
    let importers = [];
    try {
      importers = await withTimeout(_runApifyActor(IMPORTYETI_ACTOR, { q, type: 'company', maxItems: count }), 10 * 60 * 1000, 'ImportYeti');
    } catch (e) {
      if (!aborted) send({ type: 'error', error: '海关查询失败：' + e.message });
      clearInterval(heartbeat); return res.end();
    }
    importers = (importers || []).filter(it => it && (it.title || it.company));
    send({ type: 'phase', phase: 'found', count: importers.length, message: `找到 ${importers.length} 家进口商，正在补网站+邮箱…` });

    const searchId = await saveSearchRun({ query: '[海关] ' + q, location: country || 'US', maxResults: count, totalScraped: importers.length }, req.userId);
    if (productId && searchId) appendProductSearch(productId, req.userId, searchId).catch(() => {});

    const keys = await getExistingLeadKeys(req.userId);
    const results = [];
    let i = 0;
    for (const it of importers) {
      if (aborted) break;
      i++;
      const name = (it.title || it.company || '').trim();
      let website = _usableSite(it.website) ? it.website : '';
      let email = '';
      try {
        if (!website) website = await withTimeout(searchWebsite(name), 30000, 'customs search');
        if (website && _usableSite(website)) {
          const html = await withTimeout(scrapeHtml(website), 40000, 'customs scrape');
          email = _pickBestEmail(html, website);
          if (!email) {
            try { const h2 = await withTimeout(scrapeHtml(new URL('/contact', website).toString()), 40000, 'customs /contact'); email = _pickBestEmail(h2, website); } catch (_) {}
          }
        }
      } catch (_) { /* 单家失败不影响其它 */ }

      const domain = website ? (() => { try { return new URL(website).hostname.replace('www.', ''); } catch { return ''; } })() : '';
      const dupe = !!((email && keys.emails.has(email.toLowerCase())) || (domain && keys.domains.has(domain)));  // 跨源去重
      send({ type: 'result', index: i, total: importers.length, company: name, website, email, country: it.countryCode || '', dupe });
      if (dupe) continue;
      if (email)  keys.emails.add(email.toLowerCase());
      if (domain) keys.domains.add(domain);
      results.push({
        companyName: name, website, email, phone: '', city: it.countryCode || country,
        googleRating: '', intentScore: '', icpScore: '', intentReasoning: '', icpReasoning: '',
        placeId: '', status: 'raw',
      });
    }

    if (results.length && searchId) await saveLeads(searchId, results, req.userId);
    const costUsd = importers.length * 0.05;   // 占位单价（Apify+Firecrawl 成本）——你在后台按额度价定，赚差价
    if (searchId) appendSearchRunCosts(searchId, { sonnetCostUsd: 0, firecrawlCostUsd: costUsd, qualifiedDelta: 0 }, req.userId).catch(() => {});

    if (!aborted) send({ type: 'done', searchId, found: importers.length, saved: results.length });
  } catch (err) {
    if (!aborted) send({ type: 'error', error: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.post('/api/google-search', requireAuth, async (req, res) => {
  // Accept either a single `keyword` (legacy) or a `keywords` array + optional
  // `location` — mirrors /api/google-maps-search so the /app gsPanel matches gmPanel.
  const keywords = Array.isArray(req.body?.keywords)
    ? req.body.keywords.map(k => String(k).trim()).filter(Boolean)
    : ((req.body?.keyword || '').trim() ? [String(req.body.keyword).trim()] : []);
  const location    = (req.body?.location || '').trim();
  const countryCode = (req.body?.countryCode || '').trim().toLowerCase();
  const maxResults  = Math.min(500, Math.max(1, parseInt(req.body?.maxResults, 10) || 50));
  const fields      = Array.isArray(req.body?.fields) ? req.body.fields : ['email','phone','website','linkedin'];

  if (!keywords.length) return res.status(400).json({ success: false, error: 'keyword required' });
  if (!(await requireQuota(req, res))) return;

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  let aborted = false;
  res.on('close', () => { aborted = true; });
  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  // Persist search history + scraped leads to Supabase (multi-tenant). Non-fatal
  // — failures are logged via the helpers' internal try/catch and don't affect
  // the SSE stream. saveLeads at the end is fire-and-forget so the 'done' event
  // is not delayed by the DB write.
  let searchId = null;
  try { searchId = await saveSearchRun({ query: keywords.join(', '), location, maxResults, totalScraped: 0 }, req.userId); } catch (_) {}
  // 当前激活的产品品类（前端从 localStorage 带上来）→ 搜索挂到该产品名下。
  if (searchId && req.body?.productId) appendProductSearch(req.body.productId, req.userId, searchId);
  const collectedLeads = [];

  try {
    // Location-scope each keyword (same approach as the Maps tool: append the
    // location to the query rather than send it as a separate field), then run
    // all queries in one actor call. maxResults is a TOTAL across all keywords
    // (what users expect: "填 N 就最多 N 条").
    const searchStrings = location ? keywords.map(k => `${k} ${location}`.trim()) : keywords.slice();
    const totalCap = maxResults;
    console.log(`[GoogleSearchTool] terms=${searchStrings.length} location="${location}" country="${countryCode}" max=${maxResults} fields=${fields.join(',')}`);
    // Use the official apify~google-search-scraper (same actor services/googleSearch.js
    // trusts for geo-correct results). It honours countryCode so a 新西兰 search no
    // longer bleeds Australian results. Its output is { organicResults: [...] }, which
    // the flatten + projection below already handles. Per-URL email/phone/social
    // enrichment is done by our own HTML scrape, so we don't rely on the actor for it.
    const actorInput = {
      queries: searchStrings.join('\n'),
      maxPagesPerQuery: Math.ceil(maxResults / 10) || 1,
      resultsPerPage: 10,
      languageCode: 'en',
      mobileResults: false,
    };
    // Only constrain the Google region when a country was chosen; otherwise search
    // worldwide (matches the old behaviour for location-less searches).
    if (countryCode) actorInput.countryCode = countryCode;
    const items = await withTimeout(
      _runApifyActor('apify~google-search-scraper', actorInput),
      10 * 60 * 1000,
      '/api/google-search Apify'
    );

    // Apify actors vary in output shape — handle both flat result lists and
    // pages-with-organicResults shape. Project only the requested fields.
    const flat = items.flatMap(it => Array.isArray(it.organicResults) ? it.organicResults : [it]);
    let emitted = 0;
    for (const it of flat) {
      if (aborted) break;
      if (emitted >= totalCap) break;

      const url = it.url || it.website || it.link || '';

      // Enrich the page with Firecrawl's structured extract before projection.
      // Failures are non-fatal — fall through with whatever Apify already gave us.
      if (url) {
        try {
          const _axiosOpts = {
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
            maxRedirects: 5,
            validateStatus: (status) => status < 500,
          };
          const htmlResp = await axios.get(url, _axiosOpts);
          const html = htmlResp.data || '';

          const _findEmail = (h) => _pickBestEmail(h, url);
          let email = _findEmail(html);
          // Retry on /contact if homepage yielded no email — one extra fetch.
          if (!email) {
            try {
              const _contactUrl = new URL('/contact', url).toString();
              const r2 = await axios.get(_contactUrl, _axiosOpts);
              email = _findEmail(r2.data || '');
            } catch (_) { /* non-fatal — homepage scrape already succeeded */ }
          }
          // Match an international +<country code> number or a local 0-prefixed
          // number — not hardcoded to Australia (+61) so NZ (+64) etc. work too.
          const phoneMatch    = html.match(/(\+\d{1,3}[\d\s\-\(\)]{7,14}|0\d[\d\s\-\(\)]{7,12})/);
          const phone         = phoneMatch ? phoneMatch[0].trim() : '';
          const linkedinMatch  = html.match(/linkedin\.com\/(?:in|company)\/[a-zA-Z0-9\-_%]+/);
          const linkedin       = linkedinMatch ? 'https://www.' + linkedinMatch[0] : '';
          const tiktokMatch    = html.match(/tiktok\.com\/@[a-zA-Z0-9._]+/);
          const tiktok         = tiktokMatch ? 'https://www.' + tiktokMatch[0] : '';
          const instagramMatch = html.match(/instagram\.com\/[a-zA-Z0-9._]+/);
          const instagram      = instagramMatch ? 'https://www.' + instagramMatch[0] : '';
          const youtubeMatch   = html.match(/youtube\.com\/(?:@|channel\/|user\/)[a-zA-Z0-9._\-]+/);
          const youtube        = youtubeMatch ? 'https://www.' + youtubeMatch[0] : '';

          console.log('[DirectScrape]', url, { email, phone, linkedin, tiktok, instagram, youtube });
          it.email     = email     || it.email     || '';
          it.phone     = phone     || it.phone     || '';
          it.linkedin  = linkedin  || it.linkedin  || '';
          it.tiktok    = tiktok;
          it.instagram = instagram;
          it.youtube   = youtube;
          // Keep a plain-text excerpt of the page so the AI filter can use real
          // page content later without re-fetching. Strip script/style, drop
          // tags, collapse whitespace, cap at 1500 chars.
          it.websiteText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1500);
        } catch (err) {
          console.log('[DirectScrape]', url, { error: err.message });
        }
      }

      const row = { title: it.title || it.name || '', url };
      if (fields.includes('email'))    row.email    = (Array.isArray(it.emails) ? it.emails[0] : it.email) || '';
      if (fields.includes('phone'))    row.phone    = (Array.isArray(it.phones) ? it.phones[0] : it.phone) || '';
      if (fields.includes('website'))  row.website  = it.website || url || '';
      if (fields.includes('linkedin')) row.linkedin = it.linkedin || (Array.isArray(it.socialProfiles) ? (it.socialProfiles.find(p => /linkedin/i.test(p.url || p.platform || ''))?.url || '') : '');
      if (fields.includes('tiktok'))    row.tiktok    = it.tiktok    || '';
      if (fields.includes('instagram')) row.instagram = it.instagram || '';
      if (fields.includes('youtube'))   row.youtube   = it.youtube   || '';
      // Always include the scraped page text (not field-gated) so the AI filter
      // can reuse it without re-fetching the site.
      row.websiteText = it.websiteText || '';
      send({ type: 'row', row });
      collectedLeads.push(row);
      emitted++;

      // 500ms spacing between Firecrawl calls to stay under the rate limit.
      if (url && emitted < totalCap && !aborted) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    if (searchId && collectedLeads.length) {
      saveLeads(searchId, collectedLeads.map(r => ({
        companyName:  r.title || '',
        email:        r.email || '',
        phone:        r.phone || '',
        website:      r.website || r.url || '',
      })), req.userId).catch(() => {});
    }
    // Backfill scraped count + Apify cost estimate (mirrors /api/google-maps-search).
    if (searchId) {
      const apifyCostUsd = emitted * 0.002;
      updateSearchRunCosts(searchId, { apifyCostUsd, anthropicCostUsd: 0, totalCostUsd: apifyCostUsd, totalQualified: 0, totalScraped: emitted }).catch(() => {});
    }
    send({ type: 'done', success: true, total: emitted, searchId });
  } catch (err) {
    console.error('[GoogleSearchTool] error:', err.message);
    send({ type: 'error', error: err.message || 'Google Search 抓取失败' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── Google Maps inline tool (SSE) ────────────────────────────────────────────
// Multi-keyword + single-location search for the /app inline gmPanel.
// Calls compass~crawler-google-places directly via _runApifyActor so the
// Apify input shape matches the actor's actual schema (searchStringsArray,
// not the project shorthand 'searchTerms').
// Body: { keywords: string[], location: string, maxResults: number }
app.post('/api/google-maps-search', requireAuth, async (req, res) => {
  const keywords = Array.isArray(req.body?.keywords)
    ? req.body.keywords.map(k => String(k).trim()).filter(Boolean)
    : [];
  const location   = (req.body?.location || '').trim();
  const maxResults = Math.min(500, Math.max(1, parseInt(req.body?.maxResults, 10) || 20));
  const fields     = Array.isArray(req.body?.fields) && req.body.fields.length
    ? req.body.fields
    : ['name', 'phone', 'website', 'address', 'rating', 'reviews'];

  if (!keywords.length) return res.status(400).json({ success: false, error: 'keywords required' });
  if (!(await requireQuota(req, res))) return;

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  let aborted = false;
  res.on('close', () => { aborted = true; });
  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  // Persist search history + scraped leads to Supabase (multi-tenant). Non-fatal
  // — failures don't affect the SSE stream. saveLeads at the end is fire-and-
  // forget so the 'done' event is not delayed by the DB write.
  let searchId = null;
  try { searchId = await saveSearchRun({ query: keywords.join(', '), location, maxResults, totalScraped: 0 }, req.userId); } catch (_) {}
  // 当前激活的产品品类（前端从 localStorage 带上来）→ 搜索挂到该产品名下。
  if (searchId && req.body?.productId) appendProductSearch(req.body.productId, req.userId, searchId);
  const collectedLeads = [];

  try {
    // compass~crawler-google-places expects an array of full search strings
    // in `searchStringsArray`. We append the location to each keyword so each
    // search is location-scoped without sending it as a separate field.
    const searchStringsArray = location
      ? keywords.map(k => `${k} ${location}`.trim())
      : keywords.slice();

    // Dedup keys loaded up front — and if the user already has leads, the actor
    // over-fetches so duplicates don't eat the requested quota: 要 90 家就交付
    // 90 家【新】公司，重复的自动跳过并用多爬的部分补上（补不上时如实报告）。
    const { placeIds: _exPids, phones: _exPhones, domains: _exDomains } = await getExistingLeadKeys(req.userId);
    const _knownCount = _exPids.size + _exPhones.size + _exDomains.size;
    const _overFetch = _knownCount ? Math.min(maxResults, 200) : 0; // 新用户不多爬，不多花钱

    console.log(`[GoogleMapsTool] terms=${searchStringsArray.length} location="${location}" max=${maxResults} overFetch=${_overFetch}`);
    const items = await withTimeout(
      _runApifyActor('compass~crawler-google-places', {
        searchStringsArray,
        maxCrawledPlacesPerSearch: maxResults + _overFetch,
        maxAutomaticZoomOut: 1,
        language: 'en',
        scrapeContacts: true,
        scrapePlaceDetailPage: true,
        scrapeReviews: false,
        scrapeImages: false,
      }),
      12 * 60 * 1000,
      '/api/google-maps-search Apify'
    );

    // Dedup FIRST (over the full crawl), THEN cap to maxResults NEW companies —
    // the requested count is a promise about new leads, not crawled rows.
    const _domainOf = (url) => { try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; } };
    const _crawled = (items || []);
    const _deduped = _crawled.filter(it => {
      if (it.placeId && _exPids.has(it.placeId)) return false;
      const ph = String(it.phone || it.phoneUnformatted || '').replace(/\D/g, '');
      if (ph && _exPhones.has(ph)) return false;
      const dom = it.website ? _domainOf(it.website) : '';
      if (dom && _exDomains.has(dom)) return false;
      return true;
    });
    const _dupSkipped = _crawled.length - _deduped.length;
    const _items = _deduped.slice(0, maxResults);
    console.log(`[GoogleMapsTool] crawled ${_crawled.length}, duplicates ${_dupSkipped}, delivering ${_items.length}/${maxResults}`);

    let emitted = 0;
    for (const it of _items) {
      if (aborted) break;
      // Apify's contact scrape returns unvetted strings (image filenames, Maps
      // URLs, telemetry ids) — keep only real addresses before picking one.
      const emails = (Array.isArray(it.emails) ? it.emails : (it.email ? [it.email] : [])).filter(_isRealEmail);
      const bizEmail = emails.find(e => !/(gmail|hotmail|yahoo|outlook)\./i.test(e)) || emails[0] || '';
      const website = it.website || '';

      // Mirror /api/google-search enrichment: fetch the place's website and
      // scrape email + social handles from the HTML. Failures are non-fatal —
      // empty fields fall through into the projection below.
      let scraped = { email: '', linkedin: '', tiktok: '', instagram: '', youtube: '', websiteText: '' };
      if (website) {
        try {
          const _axiosOpts = {
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
            maxRedirects: 5,
            validateStatus: (status) => status < 500,
          };
          const htmlResp = await axios.get(website, _axiosOpts);
          const html = htmlResp.data || '';
          const _findEmail = (h) => _pickBestEmail(h, website);
          const linkedinMatch  = html.match(/linkedin\.com\/(?:in|company)\/[a-zA-Z0-9\-_%]+/);
          const tiktokMatch    = html.match(/tiktok\.com\/@[a-zA-Z0-9._]+/);
          const instagramMatch = html.match(/instagram\.com\/[a-zA-Z0-9._]+/);
          const youtubeMatch   = html.match(/youtube\.com\/(?:@|channel\/|user\/)[a-zA-Z0-9._\-]+/);

          scraped.email     = _findEmail(html);
          // Retry on /contact if homepage yielded no email — one extra fetch.
          if (!scraped.email) {
            try {
              const _contactUrl = new URL('/contact', website).toString();
              const r2 = await axios.get(_contactUrl, _axiosOpts);
              scraped.email = _findEmail(r2.data || '');
            } catch (_) { /* non-fatal — homepage scrape already succeeded */ }
          }
          scraped.linkedin  = linkedinMatch  ? 'https://www.' + linkedinMatch[0]  : '';
          scraped.tiktok    = tiktokMatch    ? 'https://www.' + tiktokMatch[0]    : '';
          scraped.instagram = instagramMatch ? 'https://www.' + instagramMatch[0] : '';
          scraped.youtube   = youtubeMatch   ? 'https://www.' + youtubeMatch[0]   : '';
          console.log('[GoogleMapsTool DirectScrape]', website, scraped);
          // Keep a plain-text excerpt of the page so the AI filter can use real
          // page content later without re-fetching. Strip script/style, drop
          // tags, collapse whitespace, cap at 1500 chars.
          scraped.websiteText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1500);
        } catch (err) {
          console.log('[GoogleMapsTool DirectScrape]', website, { error: err.message });
        }
      }

      const full = {
        name:      it.title || '',
        placeId:   it.placeId || '',
        website,
        phone:     it.phone || it.phoneUnformatted || '',
        email:     scraped.email || bizEmail,
        linkedin:  scraped.linkedin,
        tiktok:    scraped.tiktok,
        instagram: scraped.instagram,
        youtube:   scraped.youtube,
        address:   it.address || '',
        industry:  it.categoryName || '',
        rating:    it.totalScore || '',
        reviews:   it.reviewsCount ?? '',
        mapsUrl:   it.url || '',
      };
      const row = Object.fromEntries(fields.filter(k => k in full).map(k => [k, full[k]]));
      // Always include the scraped page text (not part of the field projection)
      // so the AI filter can reuse it without re-fetching the site.
      row.websiteText = scraped.websiteText;
      send({ type: 'row', row });
      collectedLeads.push(full);
      emitted++;

      // 500ms spacing between enrichment fetches, matching /api/google-search.
      if (website && !aborted) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    if (searchId && collectedLeads.length) {
      saveLeads(searchId, collectedLeads.map(r => ({
        companyName:  r.name || '',
        email:        r.email || '',
        phone:        r.phone || '',
        website:      r.website || '',
        city:         r.address || '',
        googleRating: r.rating ?? null,
        placeId:      r.placeId || '', // enables place-id dedup on future searches
      })), req.userId).catch(() => {});
    }
    // Backfill the run's scraped count + Apify cost (row was inserted with 0s
    // before the scrape) so the personal-center dashboard reflects real spend.
    if (searchId) {
      const apifyCostUsd = (items || []).length * 0.002; // same per-place estimate as the legacy pipelines
      updateSearchRunCosts(searchId, { apifyCostUsd, anthropicCostUsd: 0, totalCostUsd: apifyCostUsd, totalQualified: 0, totalScraped: emitted }).catch(() => {});
    }
    // 凑不满且确因去重（新公司挖尽）→ 让 AI 当场给替代关键词/换城市建议，
    // 用户不用自己琢磨下一步搜什么。只在这种情况才多花一次 Haiku 零钱。
    let advice = null;
    if (_dupSkipped && emitted < maxResults && !aborted) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const resp = await withTimeout(client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: `用户在 Google 地图上找 B2B 买家客户。已用关键词："${keywords.join(', ')}"，地区："${location}"。这个组合下的新公司已基本挖尽（目标 ${maxResults} 家只找到 ${emitted} 家新的）。
请给：
1. 3 个不同角度的替代英文搜索关键词（必须是"会买货的买家角色"，禁止 supplier/manufacturer/factory/OEM 等卖家同行词；不要和已用关键词重复），每个配不超过 8 字的中文含义
2. 同一个国家的 2 个其他城市（英文名）
只返回 JSON，无 markdown：{"keywords":[{"en":"...","zh":"..."}],"cities":["...","..."]}` }],
        }), 20000, 'GoogleMapsTool shortfall advice');
        const parsed = JSON.parse(resp.content[0].text.replace(/```json|```/g, '').trim());
        const SELLER_ROLE = /\b(supplier|suppliers|manufacturer|manufacturers|manufacturing|factory|factories|oem|odm)\b/i;
        advice = {
          keywords: (parsed.keywords || []).filter(k => k && k.en && !SELLER_ROLE.test(k.en)).slice(0, 3),
          cities:   (parsed.cities || []).map(String).slice(0, 2),
        };
      } catch (e) { console.warn('[GoogleMapsTool] shortfall advice failed:', e.message); }
    }
    // searchId lets the frontend attribute later AI-filter / email-gen costs to this run.
    send({ type: 'done', success: true, total: emitted, requested: maxResults, dupSkipped: _dupSkipped, advice, searchId });
  } catch (err) {
    console.error('[GoogleMapsTool] error:', err.message);
    send({ type: 'error', error: err.message || 'Google Maps 抓取失败' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.post('/api/auto-search', requireAuth, async (req, res) => {
  const keyword = String(req.body.keyword || '').trim();
  const location = String(req.body.location || '').trim();
  const maxResults = Math.min(parseInt(req.body.maxResults) || 20, 100);

  if (!keyword) return res.status(400).json({ success: false, error: 'keyword required' });
  if (!(await requireQuota(req, res))) return;

  try {
    console.log('[auto-search] calling Apify with:', { keyword, location, maxResults });
    let items;
    try {
      items = await _runApifyActor('compass~crawler-google-places', {
        searchStringsArray: [keyword],
        locationQuery: location,
        maxCrawledPlacesPerSearch: maxResults,
        language: 'en',
        scrapeContacts: true,
      });
      console.log('[auto-search] Apify returned', items ? items.length : 0, 'items');
    } catch(e) {
      console.error('[auto-search] Apify error:', e.message);
      return res.status(500).json({ success: false, error: e.message });
    }

    console.log('[auto-search] sample item fields:', JSON.stringify(Object.keys(items[0] || {})));
    console.log('[auto-search] sample item:', JSON.stringify(items[0] || {}, null, 2).substring(0, 500));

    // The actor can overshoot maxCrawledPlacesPerSearch — hard-cap to maxResults.
    items = (items || []).slice(0, maxResults);

    const leads = items.map(item => ({
      name: item.title || item.name || '',
      website: item.website || item.url || '',
      phone: item.phone || item.phoneUnformatted || '',
      address: item.address || item.street || '',
      email: [item.email, ...(Array.isArray(item.emails) ? item.emails : [])].find(_isRealEmail) || '',
      description: item.description || item.categoryName || item.category || '',
      websiteText: item.description || item.categoryName || '',
    }));

    // Record the run in search history (mirrors /api/google-maps-search) so
    // every search path shows up in the personal-center 历史搜索记录. Fire-and-
    // forget for the lead insert; the history row itself is awaited so the
    // response can carry searchId for downstream cost attribution.
    let searchId = null;
    try {
      searchId = await saveSearchRun({ query: keyword, location, maxResults, totalScraped: leads.length }, req.userId);
      if (searchId) {
        if (leads.length) {
          saveLeads(searchId, leads.map(r => ({
            companyName: r.name || '',
            email:       r.email || '',
            phone:       r.phone || '',
            website:     r.website || '',
            city:        r.address || '',
          })), req.userId).catch(() => {});
        }
        const apifyCostUsd = items.length * 0.002; // same per-place estimate as the other pipelines
        updateSearchRunCosts(searchId, { apifyCostUsd, anthropicCostUsd: 0, totalCostUsd: apifyCostUsd, totalQualified: 0, totalScraped: leads.length }).catch(() => {});
      }
    } catch (_) { /* history is best-effort — never fail the search over it */ }

    return res.json({ success: true, leads, searchId });
  } catch (e) {
    console.error('[auto-search] error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/scrape-website', requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const axios = require('axios');
    const response = await withTimeout(
      axios.get(url, {
        timeout: 15000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      }),
      18000,
      'scrape-website timeout'
    );
    const html = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '');
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1500);
    const email = _pickBestEmail(html, url);
    res.json({ text, email });
  } catch (e) {
    console.error('[scrape-website] error:', e.message);
    res.json({ text: '' });
  }
});

// ── /app email generation (SSE) ──────────────────────────────────────────────
// Body: { leads: [{name, email, website, phone, address, ...}], framework: 'cold_5_step' }
// Pipeline per lead: website scrape → Haiku pre-filter → Sonnet email gen.
// Reuses services/aiEnrich.js (preFilterLead + generateEmails) so model IDs,
// retry behaviour, and the system prompt builder stay consistent with the rest
// of the codebase (current models: claude-haiku-4-5-20251001 + claude-sonnet-4-6).
app.post('/api/generate-emails', requireAuth, async (req, res) => {
  const inputLeads = Array.isArray(req.body?.leads) ? req.body.leads : [];
  const framework  = (req.body?.framework || 'cold_7_step').toString().trim() || 'cold_7_step';
  const searchId   = (req.body?.searchId || '').toString().trim() || null;

  if (!inputLeads.length) return res.status(400).json({ success: false, error: 'leads required' });
  // This endpoint spends Haiku + Sonnet per lead — it must sit behind the same
  // quota gate as every other AI-spending manual endpoint (it never did, so an
  // over-quota user could generate for free and the spend was never metered).
  if (!(await requireQuota(req, res))) return;

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  let aborted = false;
  res.on('close', () => { aborted = true; });
  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  // Strip <script>/<style> blocks first so we don't keep their contents, then
  // strip remaining tags + collapse whitespace. Caps at 1500 chars for the LLM.
  const _extractWebsiteText = (html) => String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);

  // /app sellers don't pass seller info into this endpoint — leave empty so
  // generateEmails substitutes its "your company" defaults rather than the
  // Lens-branded credentials baked into peter_kang_3part.
  const sellerProfile  = {};
  const companyProfile = { companyName: '', products: '', advantages: '', icp: '' };

  let _giHaikuIn = 0, _giHaikuOut = 0, _giSonnetIn = 0, _giSonnetOut = 0;
  const runPipeline = async () => {
    const emails = [];
    for (let i = 0; i < inputLeads.length; i++) {
      if (aborted) break;
      const raw = inputLeads[i] || {};
      const companyName = raw.name || raw.companyName || raw.title || '';
      const website     = raw.website || '';

      send({ type: 'progress', message: `正在分析 ${i + 1}/${inputLeads.length}...`, current: i + 1, total: inputLeads.length, companyName });

      // 1. Website scrape — non-fatal, falls through with empty content on error.
      let websiteContent = '';
      if (website) {
        try {
          const htmlResp = await axios.get(website, {
            timeout: 20000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
            maxRedirects: 5,
            validateStatus: (status) => status < 500,
          });
          websiteContent = _extractWebsiteText(htmlResp.data || '');
        } catch (err) {
          console.log('[GenerateEmails scrape]', website, { error: err.message });
        }
      }
      if (aborted) break;

      // Shape both AI calls expect — preFilterLead reads companyName / address /
      // googleRating / reviewCount / website; generateEmails reads city/state too.
      const company = {
        companyName,
        address:      raw.address || raw.raw?.address || '',
        googleRating: raw.raw?.rating  || '',
        reviewCount:  raw.raw?.reviews || '',
        website,
        industry:     raw.raw?.industry || raw.raw?.categoryName || '',
        city:         '',
        state:        '',
        icpReasoning: '',
        intentReasoning: '',
        websiteContent,
      };

      // 2. Haiku pre-filter — skip when level=='skip'.
      try {
        const filt = await withTimeout(preFilterLead(company, companyProfile), 60 * 1000, 'Haiku pre-filter');
        if (filt?.usage) { _giHaikuIn += filt.usage.input_tokens || 0; _giHaikuOut += filt.usage.output_tokens || 0; }
        if (filt && filt.level === 'skip') {
          console.log(`[GenerateEmails] skip ${companyName}: ${filt.reason || ''}`);
          continue;
        }
      } catch (err) {
        console.warn('[GenerateEmails] preFilter error, keeping lead:', err.message);
      }
      if (aborted) break;

      // 3. Sonnet email generation. templateKey is the customer-type angle —
      // we don't have a query string in /app context, so default to the safest
      // generic angle. generateEmails returns EMAIL_1..5_SUBJECT/BODY.
      try {
        const gen = await withTimeout(
          generateEmails(company, templateKeyFromQuery(''), websiteContent, framework, null, sellerProfile),
          120 * 1000,
          'Sonnet emails'
        );
        if (gen?.usage) { _giSonnetIn += gen.usage.input_tokens || 0; _giSonnetOut += gen.usage.output_tokens || 0; }
        // Persist so a reload / resume-from-history keeps the paid-for emails.
        if (searchId && companyName) updateLeadEmails(searchId, companyName, gen, framework, null);

        // Substitute template placeholders for all 5 emails before emitting.
        // {first_name} is best-effort: the first whitespace-delimited token of
        // the company name (Probuilt Homes → "Probuilt"). {{accountSignature}}
        // is dropped here because /app SMTP send doesn't carry a stored
        // signature; the smtp transport's "from" header is used instead.
        const firstName = String(companyName || '').split(/\s+/)[0] || '';
        const replacePlaceholders = (str) => String(str || '')
          .replace(/\{first_name\}/gi, firstName)
          .replace(/\{company\}/gi,    companyName || '')
          .replace(/\{website\}/gi,    website     || '')
          .replace(/\{\{accountSignature\}\}/g, '');
        const sequence = [1, 2, 3, 4, 5].map(n => ({
          subject: replacePlaceholders(gen[`EMAIL_${n}_SUBJECT`] || ''),
          body:    replacePlaceholders(gen[`EMAIL_${n}_BODY`]    || ''),
        }));

        // Return one entry per lead. `subject`/`body` carry Email 1 (the
        // personalised hook) for the existing single-card preview; the full
        // 5-email series is also exposed under `sequence` for downstream send.
        emails.push({
          recipient: companyName,
          email:     raw.email || '',
          subject:   sequence[0].subject,
          body:      sequence[0].body,
          to:        raw.email || companyName,
          framework,
          sequence,
        });
      } catch (err) {
        console.error('[GenerateEmails] gen error for', companyName, err.message);
        emails.push({
          recipient: companyName,
          email:     raw.email || '',
          subject:   '',
          body:      '',
          to:        raw.email || companyName,
          framework,
          error:     err.message || 'generation failed',
        });
      }
    }
    return emails;
  };

  try {
    console.log(`[GenerateEmails] leads=${inputLeads.length} framework="${framework}"`);
    const emails = await withTimeout(runPipeline(), 10 * 60 * 1000, '/api/generate-emails pipeline');
    // Book the real Anthropic spend onto the originating search run (previously
    // this endpoint recorded nothing — invisible in history and quota).
    const _giCost = (_giHaikuIn / 1_000_000 * 0.80) + (_giHaikuOut / 1_000_000 * 4.00)
                  + (_giSonnetIn / 1_000_000 * 3)   + (_giSonnetOut / 1_000_000 * 15);
    if (searchId && _giCost > 0) appendSearchRunCosts(searchId, { sonnetCostUsd: _giCost, firecrawlCostUsd: 0 }, req.userId).catch(() => {});
    if (!aborted) send({ type: 'done', emails });
  } catch (err) {
    console.error('[GenerateEmails] error:', err.message);
    if (!aborted) send({ type: 'error', error: err.message || '邮件生成失败' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── /app AI lead-qualification filter ────────────────────────────────────────
// Body: { lead, criteria }
// Returns: { recommended: boolean, reason: string }
// Per-lead Haiku call — called sequentially from the browser's
// startAppAiFilter(), one HTTP per lead. The Anthropic client is created
// inline because server.js doesn't share aiEnrich.js's module-local client;
// Node caches the SDK require and `new Anthropic()` is cheap, so per-request
// instantiation is fine for this small call.
app.post('/api/ai-filter-lead', requireAuth, async (req, res) => {
  const { lead, criteria, searchId, resetQualified } = req.body || {};
  if (!lead) return res.status(400).json({ recommended: false, reason: 'lead required' });
  if (!(await requireQuota(req, res))) return;
  // First request of a (re-)filter batch: restart the qualified counter so a
  // re-run replaces the old count instead of stacking on top of it.
  if (resetQualified && searchId) await resetSearchQualified(searchId, req.userId);

  const companyName = lead.name        || lead.title || lead.username || '';
  const website     = lead.website     || lead.url   || '';
  const description = lead.description || lead.bio   || '';

  // Prefer the page text scraped during the original search. Leads restored
  // from history LOST it (it was never persisted to the DB), which made every
  // re-filter insta-fail as 信息不足 — so when it's missing but the lead has a
  // website, fetch the page live here and judge on real content.
  let websiteText = (lead.websiteText || '').trim();
  if (!websiteText && website) {
    try {
      const axios = require('axios');
      const htmlResp = await axios.get(website, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
      });
      websiteText = String(htmlResp.data || '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1500);
    } catch (e) {
      console.log('[ai-filter] live website fetch failed:', website, e.message);
    }
  }
  const websiteContent = websiteText
    ? `Website content: ${websiteText}`
    : `Website URL: ${website}`;

  if (!websiteText && description.length < 30) {
    return res.json({ recommended: false, reason: '信息不足（无官网内容及公司描述），请手动判断' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    console.log('[ai-filter] companyName:', companyName, '| description:', description.substring(0, 100), '| websiteText length:', (lead.websiteText || '').length, '| criteria:', criteria.substring(0, 100));

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: "You are a strict lead qualifier working for a B2B seller. Only recommend a lead when you have clear evidence it matches the criteria. IMPORTANT: judge by whether the company could PURCHASE or RESELL the seller's product category — NOT by who the company itself sells to. A company that sells to end consumers (a B2C retailer, store, or showroom) is NOT disqualified for that reason alone; such businesses still buy wholesale from suppliers like the seller. Do not reject a lead merely for being a retailer or selling to consumers. If information is thin or ambiguous, return recommended: false and explain what's missing. Reply in valid JSON only, no markdown, no extra text.",
      messages: [{
        role: 'user',
        content: `You are a lead qualifier for a B2B seller. Based on the criteria, determine if this company is a good match.

Criteria: ${criteria}

Match rule: a consumer-facing retailer / store / showroom (B2C) IS a valid match if it stocks, resells, or could purchase the seller's product category — it buys wholesale from suppliers like the seller. Do not reject it just for selling to end consumers. Only reject when the company clearly does not deal in the seller's product category.

Company: ${companyName}
Description: ${description}
${websiteContent}

Reply in JSON only:
{"recommended": true/false, "reason": "one sentence in Chinese"}`,
      }],
    }), 30000, 'AI filter Haiku');

    const content = response.content[0].text;
    let parsed;
    try {
      const rawText = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch(e) {
      console.error('[AI Filter]', e.message, '| raw:', content.substring(0, 100));
      return res.json({ recommended: false, reason: '不符合筛选标准' });
    }
    console.log('[ai-filter] result:', JSON.stringify(parsed));
    // Book the real Haiku token cost (and bump total_qualified when the lead
    // passes) onto the originating search run — fire-and-forget, non-fatal.
    if (searchId) {
      const u = response.usage || {};
      const haikuCost = ((u.input_tokens || 0) / 1_000_000 * 0.80) + ((u.output_tokens || 0) / 1_000_000 * 4.00);
      appendSearchRunCosts(searchId, { sonnetCostUsd: haikuCost, firecrawlCostUsd: 0, qualifiedDelta: parsed.recommended ? 1 : 0 }, req.userId).catch(() => {});
      // Persist the verdict onto the stored lead so 查看线索 restores it later
      // without re-running (and re-paying for) the filter.
      updateLeadFilterResult(searchId, { email: (lead.email || '').trim(), companyName }, { recommended: !!parsed.recommended, reason: parsed.reason || '' }, req.userId).catch(() => {});
    }
    res.json({ recommended: parsed.recommended, reason: parsed.reason });
  } catch (e) {
    console.warn('[AI Filter]', e.message);
    res.json({ recommended: false, reason: '不符合筛选标准' });
  }
});

// ── /app AI-guided ICP questionnaire ─────────────────────────────────────────
// Body: { userDesc, keyword }
// Returns: { questions: [{ id, icon, question, options: [...] }, ...] }
// Drives the dynamic /app AI 筛选 questionnaire — one Haiku call that produces
// 3 industry-specific clarifying questions from the user's free-text business
// description + the search keyword they used.
app.post('/api/ai-generate-questions', requireAuth, async (req, res) => {
  const { userDesc, keyword } = req.body;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `You are helping a B2B user define their ideal customer profile for lead filtering.

User description: "${userDesc}"
Search keyword used: "${keyword}"

Generate exactly 3 questions to help clarify who their ideal customers are.
Each question should have 3-4 short answer options relevant to their industry.

Rules:
- Questions must be in Chinese
- Options must be in Chinese
- Questions should help distinguish good leads from bad leads
- Do NOT ask about years of experience or company size
- Focus on: business type, what they sell/do, who they serve, what to exclude
- Options should be specific to their industry (not generic)

Return ONLY valid JSON, no markdown:
{
  "questions": [
    {
      "id": "q1",
      "icon": "ti-building-store",
      "question": "问题文字",
      "options": ["选项1", "选项2", "选项3", "选项4"]
    },
    {
      "id": "q2",
      "icon": "ti-tag",
      "question": "问题文字",
      "options": ["选项1", "选项2", "选项3"]
    },
    {
      "id": "q3",
      "icon": "ti-x",
      "question": "哪些类型的公司你不想联系？",
      "options": ["选项1", "选项2", "选项3", "选项4"]
    }
  ]
}`
      }]
    });

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch(e) {
    console.error('[AIQuestions] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /app 业务信息: recommend target customers ────────────────────────────────
// Body: { product, advantage }
// Returns: { suggestions: ["卫浴展厅/门店", ...] } — 6 short Chinese target-customer
// types inferred from what the user sells + their advantages. Powers the 目标客户
// pill chooser in the 业务信息 card (public/index.html). Haiku, cheap + fast.
app.post('/api/recommend-target-customers', requireAuth, async (req, res) => {
  const { product = '', advantage = '' } = req.body || {};
  if (!product.trim()) {
    return res.status(400).json({ error: '缺少产品 / 服务信息' });
  }
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `你在帮一个 B2B 卖家确定「目标客户类型」，用于后续筛选线索和写开发信。

卖家的产品 / 服务："${product}"
卖家的优势："${advantage}"

请根据上面两条信息，推断出最适合该卖家主动开发的目标客户类型（即谁会采购/经销/使用这些产品）。

规则：
- 输出 6 个目标客户类型
- 每个类型用简短的中文名词短语（4-10 个字），是「客户的类型/角色」而不是「产品」
- 例如：卫浴展厅/门店、室内设计公司、装修公司、建材经销商、地产开发商、工程采购商
- 禁止输出「XX供应商」「XX制造商」「XX工厂」这类和卖家同一侧的角色 —— 那是卖家的同行，不是会掏钱的买家
- 由强到弱排序，最相关的放前面
- 不要解释，不要编号

只返回合法 JSON，不要 markdown：
{ "suggestions": ["类型1", "类型2", "类型3", "类型4", "类型5", "类型6"] }`
      }]
    }), 30000, '/api/recommend-target-customers');

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.map(s => String(s).trim()).filter(Boolean).slice(0, 6)
      : [];
    res.json({ suggestions });
  } catch(e) {
    console.error('[RecommendTargets] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /app 业务信息 → Google Search: recommend search keywords ──────────────────
// Body: { product, targetCustomer, advantage }
// Returns: { keywords: [{ en, zh }, ...] } — English Google search terms that FIND
// the target customers (not the product), each with a short Chinese gloss so a
// non-English-speaking factory owner understands what they're picking. The `en`
// is what actually gets searched; `zh` is display-only. Haiku, cheap + fast.
app.post('/api/recommend-keywords', requireAuth, async (req, res) => {
  const product        = String(req.body?.product || '').trim();
  const targetCustomer = String(req.body?.targetCustomer || '').trim();
  const advantage      = String(req.body?.advantage || '').trim();
  if (!product && !targetCustomer) {
    return res.status(400).json({ error: '缺少产品或目标客户信息' });
  }
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `A B2B seller wants to find potential CUSTOMERS on Google Search.

Seller's product / service: "${product || '(not given)'}"
Seller's target customer types: "${targetCustomer || '(not given)'}"
Seller's advantage: "${advantage || '(not given)'}"

Generate Google search keywords that will surface the seller's TARGET CUSTOMERS'
companies (the businesses they want to sell to) — NOT pages selling the product.

Rules:
- Output exactly 8 keywords. Each has:
  - "en": a short business-type search phrase in ENGLISH (searched on local Google sites abroad)
  - "zh": a short, natural Chinese translation/meaning of that phrase, so a Chinese
    factory owner understands what it targets (e.g. en "renovation company" -> zh "装修公司")
- Search for the CUSTOMER's business type, e.g. target "装修公司" -> en "renovation company";
  target "室内设计公司" -> en "interior design studio"
- Every keyword MUST describe a BUYER role — a business that would PURCHASE the
  seller's product to use or resell: renovation company, home builder, fit-out
  contractor, kitchen & bathroom retailer, showroom, design studio, importer,
  distributor of the seller's category, etc.
- HARD BAN: never output a keyword containing "supplier", "manufacturer",
  "manufacturing", "factory", "OEM" or "ODM" — those describe businesses that
  SELL the same product (the seller's competitors), and searching them wastes
  the user's scraping budget on companies that will never buy.
- Do NOT include a country/city in "en" (the location is added separately)
- No numbering, no explanation

Return ONLY valid JSON, no markdown:
{ "keywords": [{ "en": "...", "zh": "..." }, { "en": "...", "zh": "..." }] }`
      }]
    }), 30000, '/api/recommend-keywords');

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // Hard post-filter (belt and braces on top of the prompt rule): seller-side
    // role words find the user's COMPETITORS, not buyers — drop them even if
    // the model slips one through.
    const SELLER_ROLE = /\b(supplier|suppliers|manufacturer|manufacturers|manufacturing|factory|factories|oem|odm)\b/i;
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .map(k => (typeof k === 'string'
            ? { en: k.trim(), zh: '' }
            : { en: String(k.en || '').trim(), zh: String(k.zh || '').trim() }))
          .filter(k => k.en && !SELLER_ROLE.test(k.en))
          .slice(0, 8)
      : [];
    res.json({ keywords });
  } catch(e) {
    console.error('[RecommendKeywords] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 自定义关键词：中文 → 英文搜索短语（Haiku 秒翻） ──────────────────────────
// 地图搜索只认英文；用户输入中文时前端调这里翻一下再入列。
app.post('/api/translate-keyword', requireAuth, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'text required' });
  if (!/[一-鿿]/.test(text)) return res.json({ success: true, en: text.toLowerCase(), zh: '' });
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const r = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{ role: 'user', content: `把这个中文"客户/商家类型"翻译成适合在海外 Google 地图搜索的英文短语（2-4 个词，全小写，只返回短语本身，不要引号不要解释）：${text}` }],
    }), 15000, 'translate-keyword');
    const en = (r.content[0].text || '').trim().split('\n')[0].replace(/^["']|["']$/g, '').toLowerCase();
    if (!en) throw new Error('empty translation');
    res.json({ success: true, en, zh: text });
  } catch (e) {
    console.error('[TranslateKw] error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Identity code → Chinese label, shared by the advantage / polish endpoints.
const _IDENTITY_LABEL = { factory: '工厂', trade: '外贸公司', both: '工贸一体' };
const _IDENTITY_ANGLE = {
  factory: '强调源头工厂实力:自有产线、产能、OEM/ODM定制、打样快、源头价格、品控与认证',
  trade:   '强调服务与省心:一站式采购、帮客户解决问题、选品能力、替客户监管工厂与质量、跟单物流、不加价还保质量',
  both:    '强调产销一体:自有工厂+外贸团队,价格和质量双保障、既能定制又能一站式服务',
};

// ── /app 业务信息: recommend advantage points (identity-aware) ─────────────────
// Body: { product, service, identity }
// Returns: { advantages: ["自有模具,打样快", ...] } — short Chinese advantage
// points tailored to the seller's identity. Powers the 优势 pill chooser.
app.post('/api/recommend-advantages', requireAuth, async (req, res) => {
  const product  = String(req.body?.product || '').trim();
  const service  = String(req.body?.service || '').trim();
  const identity = String(req.body?.identity || '').trim();
  if (!product) return res.status(400).json({ error: '缺少产品信息' });
  const idLabel = _IDENTITY_LABEL[identity] || '供应商';
  const idAngle = _IDENTITY_ANGLE[identity] || '';
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 1,
      messages: [{
        role: 'user',
        content: `卖家身份:${idLabel}。产品:"${product}"。服务:"${service || '(未填)'}"。

请推荐这个卖家可以主打的"优势点"，用于开发信和筛选。

第一步(很重要):先在心里分析"${product}"这个产品本身 —— 它的材质/工艺特点、买家最在意什么(比如耐用性、合规认证、适用场景、安装维护、外观一致性等)。优势必须**紧扣这个产品**,体现"做这个产品的${idLabel}才会有的强项"。

要求:
- 输出 6 个优势点，简短中文短语(6-14字)
- 方向:${idAngle || '突出差异化与专业度'}
- 必须贴着"${product}"这个具体产品来,例如卖不锈钢浴室柜就该提"304不锈钢防潮防锈""五金阻尼""表面工艺不褪色"这类产品本身的强项,而不是只说"自有工厂""可定制"这种任何产品都能套的空话
- 写出"和同类${idLabel}相比的区别/差异点"，要具体。例如不要写"可定制"，写"支持来图打样、3天出样"
- 不知道具体数字时用占位(如 X)也行，用户后续会改
- 不要解释，不要编号

只返回合法 JSON:
{ "advantages": ["优势1","优势2","优势3","优势4","优势5","优势6"] }`
      }]
    }), 30000, '/api/recommend-advantages');

    const text = response.content[0].text;
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const advantages = Array.isArray(parsed.advantages)
      ? parsed.advantages.map(s => String(s).trim()).filter(Boolean).slice(0, 6)
      : [];
    res.json({ advantages });
  } catch(e) {
    console.error('[RecommendAdvantages] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /app 业务信息: polish a text field (优势 / 案例 / 信任背书) ──────────────────
// Body: { text, kind, identity }  kind ∈ 'advantage' | 'case' | 'trust'
// Returns: { text } — a polished rewrite. High temperature + an explicit "give a
// different phrasing" instruction so clicking 润色 again yields a fresh version.
// Does NOT invent facts (no fake client names / numbers) — only rewrites what's given.
app.post('/api/polish-text', requireAuth, async (req, res) => {
  const text     = String(req.body?.text || '').trim();
  const kind     = String(req.body?.kind || 'advantage').trim();
  const identity = String(req.body?.identity || '').trim();
  const product  = String(req.body?.product || '').trim();
  const service  = String(req.body?.service || '').trim();
  if (!text) return res.status(400).json({ error: '没有要润色的内容' });
  const idLabel = _IDENTITY_LABEL[identity] || '供应商';

  const KIND_RULES = {
    advantage: `这是卖家的"优势"。改写成更专业、更有说服力的卖点，紧扣上面的产品，突出"和同类${idLabel}相比的区别"，把空话改具体。`,
    case:      `这是卖家的"真实案例"。结合产品润色得更可信、更专业。绝对不要编造新的客户名、数字或事实，只优化表达。`,
    trust:     `这是卖家的"信任背书"。结合产品润色得更专业可信。不要编造新的认证、客户或数字，只优化表达。`,
  };
  const rule = KIND_RULES[kind] || KIND_RULES.advantage;
  const ctx = `卖家身份:${idLabel}。产品:"${product || '(未填)'}"。服务:"${service || '(未填)'}"。`;
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: 1,
      messages: [{
        role: 'user',
        content: `${ctx}

${rule}

原文:
"""
${text}
"""

要求:
- 用中文输出，保持原意但表达更好，并贴合上面的产品/身份/服务
- 每次都给一个"不一样"的写法 —— 即使意思相同，措辞也要换新，让用户多点几次能挑不同版本
- 不编造原文没有的具体客户名、数字、认证等事实
- 只返回润色后的正文，不要解释、不要引号、不要 markdown`
      }]
    }), 30000, '/api/polish-text');

    const out = (response.content[0].text || '').replace(/```/g, '').trim();
    res.json({ text: out });
  } catch(e) {
    console.error('[PolishText] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /app 业务信息 (progressive): per-step completeness check + rewrite suggestion ─
// Body: { kind, text, identity, product, service }
//   kind ∈ 'product' | 'service' | 'advantage' | 'case' | 'trust'
// Returns: { complete: bool, hint: string, suggestion: string }
//   complete   — is the field usable/specific enough to advance to the next step
//   hint       — when NOT complete: a short, friendly Chinese nudge on what to add
//   suggestion — when complete: a polished rewrite the user may adopt or ignore
// Powers the one-field-at-a-time guided flow. Haiku, cheap. Never invents facts.
app.post('/api/app-field-check', requireAuth, async (req, res) => {
  const text     = String(req.body?.text || '').trim();
  const kind     = String(req.body?.kind || 'product').trim();
  const identity = String(req.body?.identity || '').trim();
  const product  = String(req.body?.product || '').trim();
  const service  = String(req.body?.service || '').trim();
  const idLabel  = _IDENTITY_LABEL[identity] || '供应商';

  // Empty is always incomplete — short-circuit without spending a token.
  if (!text) {
    return res.json({ complete: false, hint: '这一项还没填，先写一点内容再继续。', suggestion: '' });
  }

  const KIND_RULES = {
    product:   `这是卖家的"产品/主营品类"。完整的标准:能让人明确知道卖的是什么具体东西(品类或具体产品)，不能只是"建材""东西"这种太宽泛的词。`,
    service:   `这是卖家"针对产品能提供的服务"。完整的标准:说清能提供什么服务(如定制、打样、批量、一体化采购等)，不能只是"服务好"这种空话。`,
    advantage: `这是卖家的"优势/主打卖点"，开发信最重要的部分。完整的标准:是具体的、和同类${idLabel}有区别的差异点(如自有模具、3天出样、某认证)，不能只是"质量好""价格优"这种谁都会说的空话。`,
    case:      `这是卖家的"真实案例"。完整的标准:能体现真实的合作/供货经历，具体一点更好。不要求客户全名。`,
    trust:     `这是卖家的"信任背书"(资质/经验/认证)。完整的标准:有具体的资质、经验年限或认证，不能只是"很专业"这种空话。`,
  };
  const rule = KIND_RULES[kind] || KIND_RULES.product;
  const ctx  = `卖家身份:${idLabel}。产品:"${product || '(未填)'}"。服务:"${service || '(未填)'}"。`;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: `${ctx}

${rule}

用户填写的内容:
"""
${text}
"""

请判断这段内容作为开发信素材是否"够用、够完整"，并给出一个润色后的更专业写法。

只返回合法 JSON，不要 markdown、不要解释:
{
  "complete": true 或 false,
  "hint": "如果 complete=false，用一句友好的中文告诉用户具体该补充什么(例:'再写清楚是什么产品，比如具体品类')；如果 complete=true 就留空字符串",
  "suggestion": "如果 complete=true，给一个润色后的中文改写版本(保持原意、更专业、贴合产品/身份，不编造新的客户名/数字/认证)；如果 complete=false 就留空字符串"
}`
      }]
    }), 30000, '/api/app-field-check');

    const raw = (response.content[0].text || '').replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (!parsed) {
      // On unparseable output, don't block the user — treat as complete, no suggestion.
      return res.json({ complete: true, hint: '', suggestion: '' });
    }
    res.json({
      complete:   !!parsed.complete,
      hint:       String(parsed.hint || '').trim(),
      suggestion: String(parsed.suggestion || '').trim(),
    });
  } catch(e) {
    console.error('[AppFieldCheck] error:', e.message);
    // Fail open — an AI hiccup must not trap the user on a step.
    res.json({ complete: true, hint: '', suggestion: '' });
  }
});

// ── /app 业务信息: recommend zero-risk entry offers (by industry) ──────────────
// Body: { product, service, identity }
// Returns: { offers: ["免费寄样", ...] } — short Chinese "low-risk entry" offers
// the seller can make to lower a buyer's risk of starting. Powers the 零风险入口
// pill chooser.
app.post('/api/recommend-low-risk-offers', requireAuth, async (req, res) => {
  const product  = String(req.body?.product || '').trim();
  const service  = String(req.body?.service || '').trim();
  const identity = String(req.body?.identity || '').trim();
  if (!product) return res.status(400).json({ error: '缺少产品信息' });
  const idLabel = _IDENTITY_LABEL[identity] || '供应商';
  const LR_ANGLE = {
    factory: '工厂能提供的入口:免费寄实样、免费出3D/CAD图、小批量试单、提供材质/认证检测报告、验厂邀请、先打样后下单',
    trade:   '外贸公司能提供的入口(注意:贸易公司不强调"自有产线",而是服务):免费帮选品/比价、代验厂代质检、免费整合多供应商报价、寄样协调、一站式打样、先验货后付款',
    both:    '工贸一体能提供的入口:免费寄样+免费出图、小批量试单、自有工厂验厂邀请、一站式打样到交付',
  };
  const lrAngle = LR_ANGLE[identity] || '';
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      temperature: 1,
      messages: [{
        role: 'user',
        content: `卖家身份:${idLabel}。产品:"${product}"。服务:"${service || '(未填)'}"。

"零风险入口"是指卖家给潜在客户的低风险尝试入口，让客户几乎没有成本就能先试一下，从而更愿意回复开发信。

请推荐 6 个合适的零风险入口选项，必须**同时贴合这个具体产品 + 这个身份**。
方向:${lrAngle || '贴合该产品/行业的低风险入口'}
要求:
- 简短中文短语(4-14字)，是"卖家能提供的入口动作"
- 紧扣"${product}"这个产品(例如卖浴室柜可写"免费寄五金样品/色板""免费出柜体3D效果图")
- 贴合身份:工厂偏"寄样/出图/试单",外贸公司偏"帮选品/代验厂/整合报价"(贸易公司别写"自有产线"类)
- 不要解释，不要编号

只返回合法 JSON:
{ "offers": ["选项1","选项2","选项3","选项4","选项5","选项6"] }`
      }]
    }), 30000, '/api/recommend-low-risk-offers');

    const text = response.content[0].text;
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const offers = Array.isArray(parsed.offers)
      ? parsed.offers.map(s => String(s).trim()).filter(Boolean).slice(0, 6)
      : [];
    res.json({ offers });
  } catch(e) {
    console.error('[RecommendLowRisk] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /app preview-first email generation ──────────────────────────────────────
// Body: { lead, sellerDesc, goal, signatureName, framework, customPrompt }
// Returns: { emails: [{subject, body}, ...] } — a 5-email sequence so /app
// users can preview before kicking off the full bulk generation.
app.post('/api/app-generate-preview', requireAuth, async (req, res) => {
  const { lead, sellerDesc, goal, signatureName, framework, customPrompt, frameworkContext, businessInfo } = req.body;
  if (!(await requireQuota(req, res))) return;

  const companyName = lead.name || lead.title || lead.username || 'the company';
  const website = lead.website || lead.url || '';
  const description = lead.description || lead.bio || '';

  // Build the SELLER block from the user's 业务信息 (window._appBusinessInfo). This
  // is the single source of truth — the generic frameworks read all facts from here.
  const bi = businessInfo || {};
  const _sv = v => (typeof v === 'string' ? v.trim() : '');
  const _product   = _sv(bi.product) || _sv(req.body.product);
  const _service   = _sv(bi.service);
  const _advantage = _sv(bi.advantage);
  const _target    = _sv(bi.targetCustomer) || _sv(req.body.targetCustomer);
  const _case      = _sv(bi.caseStudy)      || _sv(req.body.caseStudy);
  const _trust     = _sv(bi.trust);
  const _offer     = _sv(bi.lowRiskOffer)   || _sv(req.body.lowRiskOffer);
  const _signer    = _sv(bi.senderName) || _sv(req.body.senderName) || _sv(signatureName);
  const _sellerLines = [];
  if (_product)   _sellerLines.push(`- Product / service: ${_product}${_service ? '；服务：' + _service : ''}`);
  if (_advantage) _sellerLines.push(`- Key advantage / differentiators: ${_advantage}`);
  if (_target)    _sellerLines.push(`- Target customer: ${_target}`);
  if (_case)      _sellerLines.push(`- Real case / proof (use as social proof — exact details only, never invent new ones): ${_case}`);
  if (_trust)     _sellerLines.push(`- Trust / credentials: ${_trust}`);
  if (_offer)     _sellerLines.push(`- Low-risk offer (USE THIS as the call-to-action): ${_offer}`);
  const sellerBlock = _sellerLines.length ? _sellerLines.join('\n') : `- What they do: ${_sv(sellerDesc)}`;

  const frameworkObj = emailFrameworks && emailFrameworks[framework];
  const sequencePrompt = frameworkObj ? frameworkObj.sequence_prompt : null;
  const frameworkInstructions = framework === 'custom' ? customPrompt :
    (sequencePrompt || `Use the ${framework} email framework structure.`);

  const emailCount = (framework && framework.includes('7')) ? 7 : 5;
  const emailSlots = Array.from({ length: emailCount }, () => '    {"subject": "...", "body": "..."}').join(',\n');

  const websiteContext = lead && (lead.websiteText || lead.raw?.websiteText) ? `\nLEAD WEBSITE CONTENT (use this to write a personalized opening for Email 1):\n${(lead.websiteText || lead.raw?.websiteText).substring(0, 800)}` : '';

  const systemPrompt = `You are an expert B2B cold email copywriter.
Write a sequence of ${emailCount} cold emails for the seller.

=== SELLER (source of truth — use ONLY these facts) ===
${sellerBlock}
- Goal: ${goal || '找买家 / get a reply'}
- Sign-off name: ${_signer}

EMAIL RULES:
- Write in English only
- 40-80 words per email body
- Subject: under 7 words, all lowercase, no punctuation gimmicks
- Every sentence max 12 words. Short. Direct.
- NO em dashes, NO semicolons
- No fake urgency, no hollow claims
- Each email ends with one clear low-commitment question. When the seller gave a "Low-risk offer" above, use it as the call-to-action.
- Sign off with exactly: ${_signer}
- Plain text only, no bullet points, no bold
${websiteContext}

EMAIL 1 PERSONALIZATION: For Email 1: use the LEAD WEBSITE CONTENT above to write ONE specific observation about their business (what they build, their style, their projects). If no website content is available, use: "Saw ${companyName} while looking at Australian suppliers."

FRAMEWORK: ${frameworkInstructions}

CRITICAL OVERRIDE: The SELLER block above is the ONLY source of truth for who the seller is, what they sell, and their advantages. If the FRAMEWORK section names any specific company, factory, location, product, or certification, IGNORE it and use ONLY the seller's real details from the SELLER block. Never state a fact that is not in the SELLER block.

PROSPECT:
- Company: ${companyName}
- Website: ${website}
- Description: ${description}
${frameworkContext ? `\nADDITIONAL FRAMEWORK CONTEXT (follow this confirmed plan):\n${frameworkContext}\n` : ''}
Return ONLY valid JSON in this exact format:
{
  "emails": [
${emailSlots}
  ]
}`;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: systemPrompt }]
    }), 60000, 'AppPreview Sonnet');

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    // Book the real Sonnet token cost onto the originating search run.
    if (req.body.searchId) {
      const u = response.usage || {};
      const sonnetCost = ((u.input_tokens || 0) / 1_000_000 * 3) + ((u.output_tokens || 0) / 1_000_000 * 15);
      appendSearchRunCosts(req.body.searchId, { sonnetCostUsd: sonnetCost, firecrawlCostUsd: 0 }, req.userId).catch(() => {});
    }
    // Persist the sequence to the lead row so a reload / resume-from-history
    // doesn't lose paid-for emails (auto mode always did this; the manual
    // path silently didn't). Schema holds 5 slots — email 6/7 of 7-step
    // frameworks stay client-side only.
    if (req.body.searchId && Array.isArray(parsed.emails) && companyName !== 'the company') {
      const emailCols = {};
      parsed.emails.slice(0, 5).forEach((e, i) => {
        emailCols[`EMAIL_${i + 1}_SUBJECT`] = e.subject || '';
        emailCols[`EMAIL_${i + 1}_BODY`]    = e.body || '';
      });
      updateLeadEmails(req.body.searchId, companyName, emailCols, framework || null, null);
    }
    res.json(parsed);
  } catch(e) {
    console.error('[AppPreview] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /app framework wizard — Step 2 quality control ───────────────────────────
// Body: { product, targetCustomer, caseStudy, lowRiskOffer, senderName }
// Returns: a JSON array of 5 review objects (one per field, in fixed order)
// { field, value, passed, reason, followUpQuestion }. Drives the AI review step
// of the /app 4-step email wizard.
app.post('/api/validate-framework-inputs', requireAuth, async (req, res) => {
  const { product, targetCustomer, caseStudy, lowRiskOffer, senderName } = req.body || {};

  const systemPrompt = `You are a cold email quality controller. Review each field and decide if it contains enough specific information to write a compelling cold email. Be strict and demanding — vague answers will produce generic emails that get zero replies.

When a field fails, you MUST:
1. Write 'reason' in Chinese — explain specifically WHY the answer is too vague and what problem it causes for the email
2. Write 'followUpQuestion' in Chinese — ask 2-3 specific follow-up questions that will extract the exact details needed

Examples of FAILING answers and why:
- '二手奢侈品包包' → fails because: which brands? what condition grades? how do you verify authenticity?
- '有案例' → fails because: which store? what city? what result? without specifics this is worthless as social proof
- '可以寄样品' → fails because: free or paid? how many? delivery time? minimum order?
- 'libby' → fails because: no surname, no title, no company name, no credibility
- 'Libby Li, Sourcing Director, LuxeSupply Co.' → PASSES: full name + title + company is sufficient for B2B cold email

For senderName: PASS if it contains a full name (first + last) AND a company name. Do NOT require LinkedIn, email domain, or additional verification. A name like 'Libby Li' is a valid full name.

Return ONLY a JSON array of 5 objects. Each object: { field: string, value: string, passed: boolean, reason: string, followUpQuestion: string }. If passed is true, reason and followUpQuestion must be empty strings. No preamble, no markdown, no extra text. Return the 5 objects in this exact order: product, targetCustomer, caseStudy, lowRiskOffer, senderName.`;

  const userPrompt = `product: ${product || ''}\ntargetCustomer: ${targetCustomer || ''}\ncaseStudy: ${caseStudy || ''}\nlowRiskOffer: ${lowRiskOffer || ''}\nsenderName: ${senderName || ''}`;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }), 60000, '/api/validate-framework-inputs');

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch(e) {
    console.error('[ValidateFramework] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /app framework wizard — Step 3 sequence preview ──────────────────────────
// Body: { product, targetCustomer, caseStudy, lowRiskOffer, senderName, fixes }
// Merges original answers with `fixes` (field:fixedAnswer), then asks Haiku to
// design a 7-email sequence. Returns: a JSON array of 7 objects
// { emailNumber, day, subject, description }.
app.post('/api/generate-framework-preview', requireAuth, async (req, res) => {
  const { product, targetCustomer, caseStudy, lowRiskOffer, senderName, fixes } = req.body || {};
  const fixMap = fixes || {};

  const merge = (orig, key) => {
    const fix = (fixMap[key] || '').toString().trim();
    return fix ? `${(orig || '').toString().trim()} ${fix}`.trim() : (orig || '').toString().trim();
  };
  const mProduct = merge(product, 'product');
  const mTarget  = merge(targetCustomer, 'targetCustomer');
  const mCase    = merge(caseStudy, 'caseStudy');
  const mOffer   = merge(lowRiskOffer, 'lowRiskOffer');
  const mSender  = merge(senderName, 'senderName');

  const systemPrompt = "You are a cold email strategist. Design a 7-email cold outreach B2B sequence using this structure: Email 1 Day 0 (personalized opening question, single low-commitment CTA), Email 2 Day 3 (pure value, no ask — share something useful), Email 3 Day 7 (social proof from real case), Email 4 Day 10 (different angle — lead with the zero-risk offer), Email 5 Day 14 (short check-in, no pressure), Email 6 Day 21 (final value resource, no ask), Email 7 Day 28 (breakup email with 3 options). Every subject line must be specific to the user's product and customer — no generic lines. Return ONLY a JSON array of 7 objects: [{ emailNumber: 1, day: 0, subject: string, description: string }]. No preamble, no markdown.";

  const userPrompt = `Product: ${mProduct}. Target customer: ${mTarget}. Case study: ${mCase}. Zero-risk offer: ${mOffer}. Sender: ${mSender}.`;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await withTimeout(client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }), 60000, '/api/generate-framework-preview');

    const text = response.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch(e) {
    console.error('[GenerateFramework] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── /app SMTP send (SSE) ─────────────────────────────────────────────────────
// Body: { emails: [{ email|to, subject, body }], smtpConfig: { host, port, user, pass, senderName } }
// Per-email events: { type: 'progress', current, total, recipient, status }
// Final event:      { type: 'done',     sent, failed, errors: [{index, recipient, error}] }
// Distinct from the legacy /api/smtp/send-batch — that path takes raw `leads`
// with EMAIL_1_SUBJECT/BODY templates and applies its own placeholder + delay
// logic. This route assumes the caller already substituted placeholders (the
// /api/generate-emails route above does this) and sends back-to-back without
// the 60-180s pacing — appropriate for the small /app preview-and-send batches.
app.post('/api/smtp-send-batch', requireAuth, async (req, res) => {
  const emails     = Array.isArray(req.body?.emails) ? req.body.emails : [];
  const smtpConfig = req.body?.smtpConfig || {};

  if (!emails.length) return res.status(400).json({ success: false, error: 'emails required' });
  if (!smtpConfig.user || !smtpConfig.pass) return res.status(400).json({ success: false, error: 'smtp config required' });

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const sse = d => res.write('data: ' + JSON.stringify(d) + '\n\n');
  let aborted = false;
  res.on('close', () => { aborted = true; });
  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  const port = parseInt(smtpConfig.port, 10) || 587;
  const transporter = nodemailer.createTransport({
    host:   smtpConfig.host || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth:   { user: smtpConfig.user, pass: smtpConfig.pass },
    tls:    { rejectUnauthorized: false },
  });

  const fromName = (smtpConfig.senderName || smtpConfig.fromName || '').trim();
  const from = fromName ? `"${fromName}" <${smtpConfig.user}>` : smtpConfig.user;

  let sent = 0, failed = 0;
  const errors = [];

  try {
    console.log(`[SmtpSendBatch] sending ${emails.length} from ${from}`);
    for (let i = 0; i < emails.length; i++) {
      if (aborted) break;
      const e = emails[i] || {};
      const to = (e.to || e.email || '').trim();

      // Validate it looks like an email address
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);
      if (!to || !isValidEmail) {
        failed++;
        errors.push({ index: i, recipient: to || '(empty)',
                      error: 'invalid or missing email address' });
        console.warn(`[SmtpSendBatch] skip invalid recipient: "${to}"`);
        sse({ type: 'progress', current: i + 1, total: emails.length,
              recipient: to, status: 'failed' });
        continue;
      }

      sse({ type: 'progress', current: i + 1, total: emails.length, recipient: to, status: 'sending' });

      try {
        await transporter.sendMail({
          from,
          to,
          subject: e.subject || '',
          text:    e.body    || '',
          html:    String(e.body || '').replace(/\n/g, '<br>'),
        });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ index: i, recipient: to, error: err.message });
        console.warn(`[SmtpSendBatch] ${to}: ${err.message}`);
      }
    }
    if (!aborted) sse({ type: 'done', sent, failed, errors });
  } catch (err) {
    console.error('[SmtpSendBatch] error:', err.message);
    if (!aborted) sse({ type: 'error', error: err.message || '发送失败' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── Instagram inline tool (SSE) ──────────────────────────────────────────────
// Runs Apify actor nH2AHrwxeTRJoN5hX and streams one row per post.
// Body: { input, maxPosts, newerThan }
app.post('/api/instagram-scrape', requireAuth, async (req, res) => {
  const input      = (req.body?.input || '').trim();
  const maxPosts   = Math.min(500, Math.max(1, parseInt(req.body?.maxPosts, 10) || 24));
  const newerThan  = (req.body?.newerThan || '').trim();
  const fields     = Array.isArray(req.body?.fields) && req.body.fields.length
    ? req.body.fields
    : ['username', 'followers', 'posts'];

  if (!input) return res.status(400).json({ success: false, error: 'input required' });

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  let aborted = false;
  res.on('close', () => { aborted = true; });
  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  // Persist search history + scraped leads to Supabase (multi-tenant). Non-fatal.
  let searchId = null;
  try { searchId = await saveSearchRun({ query: input, location: '', maxResults: maxPosts, totalScraped: 0 }, req.userId); } catch (_) {}
  if (searchId && req.body?.productId) appendProductSearch(req.body.productId, req.userId, searchId);
  const collectedLeads = [];

  try {
    console.log(`[InstagramTool] input="${input}" maxPosts=${maxPosts} newerThan="${newerThan}"`);
    const actorInput = { directUrls: [input], maxPostsPerProfile: maxPosts };
    if (newerThan) actorInput.onlyPostsNewerThan = newerThan;

    const items = await withTimeout(
      _runApifyActor('nH2AHrwxeTRJoN5hX', actorInput),
      10 * 60 * 1000,
      '/api/instagram-scrape Apify'
    );

    let emitted = 0;
    for (const it of items) {
      if (aborted) break;
      if (emitted >= maxPosts) break;
      // Note: the apify/instagram-scraper actor returns POST data, not profile
      // metadata — so `followers`, `posts` (count), `email`, `bioLink` are
      // empty here. To populate them, swap actors (e.g. instagram-profile-scraper).
      const full = {
        username:    it.ownerUsername || it.username || '',
        followers:   it.ownerFollowersCount ?? it.followersCount ?? '',
        posts:       it.ownerPostsCount ?? it.postsCount ?? '',
        email:       it.ownerEmail || it.email || '',
        bioLink:     it.ownerBioLink || it.externalUrl || it.bioLink || '',
        postUrl:     it.url || it.postUrl || '',
        type:        it.type || '',
        caption:     (it.caption || '').replace(/\s+/g, ' ').slice(0, 200),
        likes:       it.likesCount ?? '',
        comments:    it.commentsCount ?? '',
        timestamp:   it.timestamp || it.takenAtTimestamp || '',
        displayUrl:  it.displayUrl || '',
      };
      const row = Object.fromEntries(fields.filter(k => k in full).map(k => [k, full[k]]));
      send({ type: 'row', row });
      collectedLeads.push(full);
      emitted++;
    }
    if (searchId && collectedLeads.length) {
      saveLeads(searchId, collectedLeads.map(r => ({
        companyName:  r.username || '',
        email:        r.email || '',
        website:      r.bioLink || r.postUrl || '',
      })), req.userId).catch(() => {});
    }
    send({ type: 'done', success: true, total: emitted });
  } catch (err) {
    console.error('[InstagramTool] error:', err.message);
    send({ type: 'error', error: err.message || 'Instagram 抓取失败' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── TikTok inline tool (SSE) ─────────────────────────────────────────────────
// Runs Apify actor GdWCkxBtKWOsKjdch and streams one row per video.
// Body: { mode: 'hashtag'|'search'|'profile'|'video', input, maxVideos }
app.post('/api/tiktok-scrape', requireAuth, async (req, res) => {
  const mode      = (req.body?.mode || 'hashtag').trim();
  const input     = (req.body?.input || '').trim();
  const maxVideos = Math.min(1000, Math.max(1, parseInt(req.body?.maxVideos, 10) || 100));
  const fields    = Array.isArray(req.body?.fields) && req.body.fields.length
    ? req.body.fields
    : ['username', 'followers'];

  if (!input) return res.status(400).json({ success: false, error: 'input required' });

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
  res.flushHeaders();
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);
  let aborted = false;
  res.on('close', () => { aborted = true; });
  const heartbeat = setInterval(() => { if (!aborted) res.write(': heartbeat\n\n'); }, 15000);

  // Persist search history + scraped leads to Supabase (multi-tenant). Non-fatal.
  let searchId = null;
  try { searchId = await saveSearchRun({ query: input, location: '', maxResults: maxVideos, totalScraped: 0 }, req.userId); } catch (_) {}
  if (searchId && req.body?.productId) appendProductSearch(req.body.productId, req.userId, searchId);
  const collectedLeads = [];

  try {
    console.log(`[TikTokTool] mode=${mode} input="${input}" maxVideos=${maxVideos}`);
    const actorInput = { resultsPerPage: maxVideos };
    if      (mode === 'hashtag') actorInput.hashtags      = [input];
    else if (mode === 'search')  actorInput.searchQueries = [input];
    else if (mode === 'profile') actorInput.profiles      = [input];
    else if (mode === 'video')   actorInput.postURLs      = [input];
    else throw new Error(`unknown mode: ${mode}`);

    const items = await withTimeout(
      _runApifyActor('GdWCkxBtKWOsKjdch', actorInput),
      10 * 60 * 1000,
      '/api/tiktok-scrape Apify'
    );

    let emitted = 0;
    for (const it of items) {
      if (aborted) break;
      if (emitted >= maxVideos) break;
      // Different actors return slightly different field names — try the most
      // common ones for username/url/counts/timestamp.
      const ts = it.createTimeISO || it.createTime || it.timestamp || '';
      // Note: this actor returns VIDEO data, not profile/channel metadata —
      // `followers` and `videoCount` will be empty. To populate them, swap
      // actors (e.g. a tiktok-profile-scraper).
      const full = {
        username:   it.authorMeta?.name || it.author?.uniqueId || it.username || '',
        followers:  it.authorMeta?.fans ?? it.authorMeta?.followers ?? '',
        videoCount: it.authorMeta?.video ?? it.authorMeta?.videoCount ?? '',
        likes:      it.diggCount    ?? it.likes    ?? it.stats?.diggCount    ?? '',
        comments:   it.commentCount ?? it.comments ?? it.stats?.commentCount ?? '',
        shares:     it.shareCount   ?? it.shares   ?? it.stats?.shareCount   ?? '',
        videoUrl:   it.webVideoUrl || it.shareUrl || it.url || (it.id ? `https://www.tiktok.com/@${it.authorMeta?.name || ''}/video/${it.id}` : ''),
        createdAt:  ts,
      };
      const row = Object.fromEntries(fields.filter(k => k in full).map(k => [k, full[k]]));
      send({ type: 'row', row });
      collectedLeads.push(full);
      emitted++;
    }
    if (searchId && collectedLeads.length) {
      saveLeads(searchId, collectedLeads.map(r => ({
        companyName:  r.username || '',
        website:      r.videoUrl || '',
      })), req.userId).catch(() => {});
    }
    send({ type: 'done', success: true, total: emitted });
  } catch (err) {
    console.error('[TikTokTool] error:', err.message);
    send({ type: 'error', error: err.message || 'TikTok 抓取失败' });
  } finally {
    clearInterval(heartbeat);
    res.end();
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
