// One-off: test Firecrawl with the same config the app uses. Do NOT commit.
require('dotenv').config();
const axios = require('axios');

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/scrape';
const TEST_URL = 'https://www.coldaconstructions.com.au';

(async () => {
  console.log('=== Firecrawl test ===');
  console.log('API key present?     ', !!FIRECRAWL_KEY, FIRECRAWL_KEY ? `(starts with "${FIRECRAWL_KEY.slice(0, 6)}…", length ${FIRECRAWL_KEY.length})` : '');
  console.log('Endpoint             ', FIRECRAWL_URL);
  console.log('Test URL             ', TEST_URL);

  // First — try to read account info / credits if endpoint exists
  console.log('\n--- 1. Credit / team check ---');
  try {
    const teamRes = await axios.get('https://api.firecrawl.dev/v1/team/credit-usage', {
      headers: { Authorization: `Bearer ${FIRECRAWL_KEY}` },
      timeout: 15000,
    });
    console.log('Credit info:', JSON.stringify(teamRes.data, null, 2));
  } catch (e) {
    console.log(`Credit endpoint failed (this endpoint may not exist on Firecrawl v1): ${e.response?.status || ''} ${e.message}`);
    if (e.response?.data) console.log('Response body:', JSON.stringify(e.response.data).slice(0, 400));
  }

  // Then — actual scrape
  console.log('\n--- 2. Scrape test ---');
  const t0 = Date.now();
  try {
    const response = await axios.post(
      FIRECRAWL_URL,
      {
        url: TEST_URL,
        formats: ['markdown'],
        waitFor: 3000,
        onlyMainContent: true,
        timeout: 30000,
      },
      {
        headers: {
          Authorization: `Bearer ${FIRECRAWL_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );
    const elapsed = Date.now() - t0;
    console.log(`HTTP status:    ${response.status}`);
    console.log(`Elapsed:        ${elapsed}ms`);
    console.log(`Top-level keys: ${Object.keys(response.data).join(', ')}`);
    console.log(`success flag:   ${response.data.success}`);

    const data = response.data.data || {};
    const meta = data.metadata || {};
    const markdown = data.markdown || '';

    console.log(`Markdown length:    ${markdown.length} chars`);
    console.log(`Title:              "${(meta.title || '').slice(0, 100)}"`);
    console.log(`Description:        "${(meta.description || '').slice(0, 120)}"`);
    console.log(`OG title:           "${(meta.ogTitle || '').slice(0, 100)}"`);
    console.log(`OG description:     "${(meta.ogDescription || '').slice(0, 120)}"`);
    console.log(`\n--- First 400 chars of markdown ---`);
    console.log(markdown.slice(0, 400));
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`✗ Scrape FAILED after ${elapsed}ms`);
    console.error('Error message:', err.message);
    console.error('HTTP status:  ', err.response?.status);
    if (err.response?.data) {
      console.error('Response body:', JSON.stringify(err.response.data).slice(0, 800));
    }
    if (err.response?.headers) {
      const interesting = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'];
      for (const h of interesting) {
        if (err.response.headers[h]) console.error(`  header ${h}: ${err.response.headers[h]}`);
      }
    }
  }
})();
