require('dotenv').config();
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const BASE_URL    = 'https://api.apify.com/v2';

async function searchGoogleSearch(searchQuery, location, maxResults = 20) {
  const query = [searchQuery, location].filter(Boolean).join(' ');
  console.log(`[GoogleSearch] Starting: "${query}" | max: ${maxResults}`);

  const actorInput = {
    queries:          query,
    maxPagesPerQuery: Math.ceil(maxResults / 10),
    resultsPerPage:   10,
    countryCode:      'au',
    languageCode:     'en',
    mobileResults:    false,
  };

  const runResponse = await axios.post(
    `${BASE_URL}/acts/apify~google-search-scraper/runs`,
    actorInput,
    { params: { token: APIFY_TOKEN }, headers: { 'Content-Type': 'application/json' } }
  );

  const runId = runResponse.data.data.id;
  console.log(`[GoogleSearch] Run started, ID: ${runId}`);

  let status = 'RUNNING';
  let finalRunData = null;
  while (status === 'RUNNING' || status === 'READY') {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await axios.get(
      `${BASE_URL}/actor-runs/${runId}`,
      { params: { token: APIFY_TOKEN } }
    );
    finalRunData = statusRes.data.data;
    status = finalRunData.status;
    console.log(`[GoogleSearch] Status: ${status}`);
  }

  if (status !== 'SUCCEEDED') throw new Error(`Google Search run failed: ${status}`);

  const apifyCostUsd = finalRunData?.usageTotalUsd ?? finalRunData?.stats?.usageTotalUsd ?? null;
  console.log(`[GoogleSearch] Cost: $${apifyCostUsd ?? 'unknown'}`);

  const resultsRes = await axios.get(
    `${BASE_URL}/actor-runs/${runId}/dataset/items`,
    { params: { token: APIFY_TOKEN, format: 'json' } }
  );

  const rawItems = resultsRes.data;
  console.log('[GoogleSearch] Raw pages returned:', rawItems.length);

  const companies = [];
  for (const page of rawItems) {
    for (const result of (page.organicResults || [])) {
      if (companies.length >= maxResults) break;
      // Skip ads, directories, social media — keep only company-looking URLs
      const url = result.url || '';
      if (!url || url.includes('yellowpages') || url.includes('linkedin.com/in') || url.includes('facebook.com')) continue;

      companies.push({
        companyName:   result.title       || '',
        website:       url,
        phone:         '',
        email:         '',
        address:       '',
        city:          location || '',
        state:         '',
        country:       'Australia',
        industry:      searchQuery,
        googleRating:  '',
        reviewCount:   0,
        googleMapsUrl: '',
        ownerName:     '',
        facebook:      '',
        instagram:     '',
        linkedin:      '',
        businessHours: '',
        websiteContent: result.description || '',
        source:        'google_search',
      });
    }
    if (companies.length >= maxResults) break;
  }

  console.log(`[GoogleSearch] Done: ${companies.length} companies extracted`);
  return { companies, apifyCostUsd };
}

module.exports = { searchGoogleSearch };
