require('dotenv').config();
const axios = require('axios');

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/scrape';

// Empty shape returned when no URL is provided or all attempts fail.
// Keep all fields present (empty string) so callers can destructure unconditionally.
const EMPTY_CRAWL = Object.freeze({
  content: '', title: '', description: '', ogTitle: '', ogDescription: '',
});

async function crawlWebsite(url) {
  if (!url || url.trim() === '') {
    console.log('[Firecrawl] No URL provided, skipping.');
    return { ...EMPTY_CRAWL };
  }

  console.log(`[Firecrawl] Crawling: ${url}`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.post(
        FIRECRAWL_URL,
        {
          url,
          formats: ['markdown'],
          waitFor: 3000,
          onlyMainContent: true,
          timeout: 30000,
        },
        {
          headers: {
            'Authorization': `Bearer ${FIRECRAWL_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      // Firecrawl v1 response shape:
      //   { success: true, data: { markdown: '...', metadata: { title, description, ogTitle, ogDescription, ... } } }
      if (!response.data.success) {
        console.warn(`[Firecrawl] Unsuccessful response for ${url}`);
        return { ...EMPTY_CRAWL };
      }

      const data     = response.data.data || {};
      const meta     = data.metadata || {};
      const markdown = data.markdown || '';
      const content  = markdown.slice(0, 8000);

      const result = {
        content,
        title:         meta.title         || '',
        description:   meta.description   || '',
        ogTitle:       meta.ogTitle       || '',
        ogDescription: meta.ogDescription || '',
      };

      console.log(`[Firecrawl] Got ${content.length} chars for ${url} | title="${result.title.slice(0, 60)}"`);

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));

      return result;
    } catch (err) {
      console.log(`[Firecrawl] Attempt ${attempt} failed for ${url}: ${err.message}`);
      if (attempt === 2) return { ...EMPTY_CRAWL };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// HARD-SKIP keywords — unambiguous competitor / category-manufacturer signals.
// Any single match short-circuits the lead before Sonnet scoring.
//
// Why so narrow: in the AU market the MAJORITY of companies branding themselves
// "Australian Made" / "we manufacture" are actually OEM importers (Chinese
// factory partners) or light-assembly operations rebranding imported product.
// Skipping on those phrases throws away real Lens prospects. Only signals that
// strongly indicate a genuine, self-owned production operation belong here.
const HARD_SKIP_KEYWORDS = [
  // Category-specific competitor signals: the company self-identifies as a
  // building-materials manufacturer in a competing product category.
  'tile manufacturer', 'flooring manufacturer', 'stone manufacturer',
  'ceramic manufacturer', 'building materials manufacturer',
  'window manufacturer', 'door manufacturer', 'aluminium manufacturer',
  'cabinet manufacturer', 'cabinetry manufacturer', 'joinery manufacturer',
  // Specific machinery / process descriptions — only a real factory has these.
  'our extrusion line', 'our anodizing plant', 'our anodising plant',
  'our powder coating line', 'our cnc workshop', 'our welding line',
  'our spray booth', 'our injection moulding',
];

// SOFT local-manufacturing signals — phrases that COULD mean self-manufacture
// but in the AU market more often indicate marketing positioning by an OEM
// importer. Do NOT hard-skip on these. Surface to Sonnet via
// claimsLocalManufacturing flag so it can read the rest of the website for
// context (factory tour photos? named production team? capacity numbers?
// → real competitor. Catalog-style sales site? → importer-reseller, valid target.)
const SOFT_LOCAL_MFG_KEYWORDS = [
  // Australia
  'australian made', 'made in australia', 'locally made', 'locally manufactured',
  'local manufacturer', 'australian manufacturer', 'manufactured in australia',
  'proudly australian made', 'proudly made in australia', 'australian owned and made',
  // USA
  'made in usa', 'made in america', 'american made', 'us manufacturer',
  // UK
  'made in britain', 'made in the uk', 'british made', 'uk manufacturer',
  // Generic self-manufacturer phrases — high false-positive rate in AU market.
  'we manufacture', 'our factory', 'our manufacturing facility',
  'we produce', 'our production line', 'manufactured by us',
];

// Keywords that signal the company BUYS or distributes products — ideal prospects.
// At least one must be present to consider the lead high-signal.
const KEEP_KEYWORDS = [
  // Buyer / distributor signals
  'import', 'importer', 'importing', 'imported',
  'wholesale', 'wholesaler', 'distributor', 'distribution',
  'supply', 'supplier', 'supplies',
  // Builder / renovation buyer signals
  'builder', 'building', 'developer',
  'renovation', 'renovator', 'contractor', 'construction',
  'interior design', 'fit-out', 'fitout',
  // Procurement signals
  'sourcing', 'procurement', 'purchase', 'buying',
];

// Phrases that appear in metaphorical/idiomatic contexts on buyer websites
// ("our factory-direct pricing", "we manufacture relationships with suppliers").
// These require word-boundary matching rather than bare substring.
const AMBIGUOUS_KEYWORDS = new Set([
  'we manufacture',
  'our factory',
  'our production line',
  'we produce',
]);

// Analyse crawled content to decide whether to include this company in the pipeline.
// Returns { shouldSkip, reason, keepSignals, lowSignal, claimsLocalManufacturing }
function filterCompany(websiteContent) {
  if (!websiteContent || websiteContent.trim() === '') {
    return {
      shouldSkip: false,
      reason: 'No website content to filter on',
      keepSignals: [],
      lowSignal: true,
      claimsLocalManufacturing: false,
    };
  }

  const lower = websiteContent.toLowerCase();

  const matchKeyword = (kw) => {
    if (AMBIGUOUS_KEYWORDS.has(kw)) {
      const re = new RegExp(`(^|[\\s.,!?;:\\-\\(])${kw.replace(/\s+/g, '\\s+')}([\\s.,!?;:\\-\\)]|$)`, 'i');
      return re.test(lower);
    }
    return lower.includes(kw);
  };

  // HARD SKIP — only unambiguous competitor / explicit machinery signals.
  // Any single match short-circuits the lead.
  for (const kw of HARD_SKIP_KEYWORDS) {
    if (matchKeyword(kw)) {
      console.log(`[Filter] HARD-SKIP — found "${kw}"`);
      return {
        shouldSkip: true,
        reason: `manufacturer signal: "${kw}"`,
        keepSignals: [],
        lowSignal: false,
        claimsLocalManufacturing: false,
      };
    }
  }

  // SOFT local-mfg check — keep the lead, flag for Sonnet to evaluate context.
  const softMatches = SOFT_LOCAL_MFG_KEYWORDS.filter(matchKeyword);
  const claimsLocalManufacturing = softMatches.length > 0;

  // KEEP check — collect buyer signals
  const keepSignals = KEEP_KEYWORDS.filter(kw => lower.includes(kw));
  const lowSignal = keepSignals.length === 0;

  if (claimsLocalManufacturing) {
    console.log(`[Filter] SOFT local-mfg signal — keeping for AI: ${softMatches.join(', ')}`);
  }
  if (!lowSignal) {
    console.log(`[Filter] KEEP — buyer signals: ${keepSignals.join(', ')}`);
  } else if (!claimsLocalManufacturing) {
    console.log('[Filter] LOW-SIGNAL — no buyer keywords found; keeping but flagging for AI');
  }

  return { shouldSkip: false, reason: null, keepSignals, lowSignal, claimsLocalManufacturing };
}

// ── 找官网 + 抓原始 HTML（给「找邮箱」工具用）────────────────────────────────
// searchWebsite: 公司名 → Firecrawl 搜索 → 返回最可能的官网 URL（取第一条结果）。
// scrapeHtml:    抓某个 URL 的原始 HTML（含 footer / mailto），交给 _pickBestEmail 抠邮箱。
async function searchWebsite(name) {
  if (!FIRECRAWL_KEY || !name) return '';
  try {
    const r = await axios.post(
      'https://api.firecrawl.dev/v1/search',
      { query: `${name} official website`, limit: 3 },
      { headers: { 'Authorization': `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );
    const list = (r.data && (r.data.data || r.data.results)) || [];
    const top = list[0];
    return top ? (top.url || top.link || '') : '';
  } catch (err) {
    console.log(`[Firecrawl] search failed for "${name}": ${err.message}`);
    return '';
  }
}

async function scrapeHtml(url) {
  if (!FIRECRAWL_KEY || !url) return '';
  try {
    const r = await axios.post(
      FIRECRAWL_URL,
      { url, formats: ['html'], onlyMainContent: false, waitFor: 2500, timeout: 25000 },
      { headers: { 'Authorization': `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    return (r.data && r.data.data && r.data.data.html) || '';
  } catch (err) {
    console.log(`[Firecrawl] scrapeHtml failed for ${url}: ${err.message}`);
    return '';
  }
}

module.exports = { crawlWebsite, filterCompany, searchWebsite, scrapeHtml };
