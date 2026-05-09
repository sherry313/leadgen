require('dotenv').config();
const axios = require('axios');

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/scrape';

async function crawlWebsite(url) {
  // Skip if no website URL provided
  if (!url || url.trim() === '') {
    console.log('[Firecrawl] No URL provided, skipping.');
    return '';
  }

  console.log(`[Firecrawl] Crawling: ${url}`);

  try {
    const response = await axios.post(
      FIRECRAWL_URL,
      { url, formats: ['markdown'] },
      {
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout for slow sites
      }
    );

    // Firecrawl v1 response shape: { success: true, data: { markdown: '...' } }
    if (!response.data.success) {
      console.warn(`[Firecrawl] Unsuccessful response for ${url}`);
      return '';
    }

    const markdown = response.data.data?.markdown || '';
    const truncated = markdown.slice(0, 2000);
    console.log(`[Firecrawl] Got ${truncated.length} chars for ${url}`);

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));

    return truncated;
  } catch (err) {
    // Never let a crawl failure break the whole pipeline
    console.warn(`[Firecrawl] Failed to crawl ${url}: ${err.message}`);
    return '';
  }
}

// Keywords that signal the company MAKES products locally — not a buyer for Chinese materials
const SKIP_KEYWORDS = [
  // Australia
  'australian made', 'made in australia', 'locally made', 'locally manufactured',
  'local manufacturer', 'australian manufacturer', 'manufactured in australia',
  'proudly australian made', 'proudly made in australia', 'australian owned and made',
  // USA
  'made in usa', 'made in america', 'american made', 'us manufacturer',
  // UK
  'made in britain', 'made in the uk', 'british made', 'uk manufacturer',
  // Generic self-manufacturer signals
  'we manufacture', 'our factory', 'our manufacturing facility',
  'we produce', 'our production line', 'manufactured by us',
  // Competitor signals — they ARE the building materials producer
  'tile manufacturer', 'flooring manufacturer', 'stone manufacturer',
  'ceramic manufacturer', 'building materials manufacturer',
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
// Returns { shouldSkip, reason, keepSignals, lowSignal }
function filterCompany(websiteContent) {
  if (!websiteContent || websiteContent.trim() === '') {
    return { shouldSkip: false, reason: 'No website content to filter on', keepSignals: [], lowSignal: true };
  }

  const lower = websiteContent.toLowerCase();

  // SKIP check — any single match is enough to exclude.
  // Ambiguous phrases require a word-boundary on both sides to avoid false positives
  // (e.g. "our factory-direct pricing" should NOT trigger the manufacturer filter).
  for (const kw of SKIP_KEYWORDS) {
    let matched;
    if (AMBIGUOUS_KEYWORDS.has(kw)) {
      const re = new RegExp(`(^|[\\s.,!?;:\\-\\(])${kw.replace(/\s+/g, '\\s+')}([\\s.,!?;:\\-\\)]|$)`, 'i');
      matched = re.test(lower);
    } else {
      matched = lower.includes(kw);
    }
    if (matched) {
      console.log(`[Filter] SKIP — found "${kw}"`);
      return { shouldSkip: true, reason: `manufacturer signal: "${kw}"`, keepSignals: [], lowSignal: false };
    }
  }

  // KEEP check — collect all buyer signals found
  const keepSignals = KEEP_KEYWORDS.filter(kw => lower.includes(kw));
  const lowSignal = keepSignals.length === 0;

  if (!lowSignal) {
    console.log(`[Filter] KEEP — buyer signals: ${keepSignals.join(', ')}`);
  } else {
    console.log('[Filter] LOW-SIGNAL — no buyer keywords found; keeping but flagging for AI');
  }

  return { shouldSkip: false, reason: null, keepSignals, lowSignal };
}

module.exports = { crawlWebsite, filterCompany };
