// One-off: test Apify with a small scrape. Do NOT commit.
require('dotenv').config();
const { scrapeAustralianCompanies } = require('../services/apify');

(async () => {
  console.log('=== Apify test ===');
  console.log('API token present? ', !!process.env.APIFY_API_TOKEN, process.env.APIFY_API_TOKEN ? `(length ${process.env.APIFY_API_TOKEN.length})` : '');
  console.log('Actor:             compass~crawler-google-places');
  console.log('Query:             luxury home builder');
  console.log('Location:          Gold Coast, Australia');
  console.log('Max:               5');
  console.log('');

  const t0 = Date.now();
  try {
    const { companies, apifyCostUsd } = await scrapeAustralianCompanies(
      'luxury home builder',
      'Gold Coast, Australia',
      5,
      { includeWebsite: true, includeEmail: true },
      'au',
    );
    const elapsed = Date.now() - t0;
    console.log(`\n--- Result (took ${(elapsed/1000).toFixed(1)}s) ---`);
    console.log(`Companies returned: ${companies.length}`);
    console.log(`Cost:               $${apifyCostUsd ?? 'unknown'}`);
    console.log('');
    for (const c of companies) {
      console.log(`- ${c.companyName}`);
      console.log(`    website: ${c.website || '(none)'}`);
      console.log(`    phone:   ${c.phone || '(none)'}`);
      console.log(`    email:   ${c.email || '(none)'}`);
      console.log(`    rating:  ${c.googleRating || '?'} (${c.reviewCount} reviews)`);
      console.log(`    place:   ${c.placeId || '(none)'}`);
      console.log('');
    }
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`✗ FAILED after ${(elapsed/1000).toFixed(1)}s`);
    console.error('Error message:', err.message);
    console.error('HTTP status:  ', err.response?.status);
    if (err.response?.data) {
      console.error('Response body:', JSON.stringify(err.response.data).slice(0, 500));
    }
  }
})();
