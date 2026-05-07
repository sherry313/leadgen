require('dotenv').config();
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const BASE_URL = 'https://api.apify.com/v2';

// Pull a URL out of the socialProfiles array for a given platform name
function extractSocialUrl(profiles, platformName) {
  if (!Array.isArray(profiles)) return '';
  const match = profiles.find(p =>
    (p.profileType || p.type || p.platform || '').toLowerCase().includes(platformName)
  );
  return match?.url || match?.link || '';
}

// dataOptions controls which expensive Apify features are enabled.
// Each feature has a real cost impact — only enable what the user needs.
//
//   scrapeContacts: true       → scrapes email + social profiles   (~+$0.01/lead)
//   scrapePlaceDetailPage: true → scrapes business hours + owner   (~+$0.01/lead)
//
// Website, phone, address, rating are always returned for free.
async function scrapeAustralianCompanies(searchQuery, location, maxResults = 25, dataOptions = {}) {
  const {
    includeWebsite = true,
    includeEmail   = false,
  } = dataOptions;

  const needsContacts   = includeEmail;
  const needsDetailPage = includeWebsite;

  console.log(`[Apify] Starting scrape: "${searchQuery}" in ${location}`);
  console.log(`[Apify] Options → scrapeContacts:${needsContacts}  scrapePlaceDetailPage:${needsDetailPage}`);

  // Step 1: Start the Apify actor (Google Places crawler)
  const actorInput = {
    searchStringsArray: [`${searchQuery} ${location}`],
    maxCrawledPlacesPerSearch: maxResults,
    language: 'en',
    countryCode: 'au',
    // Conditionally enable paid features
    scrapeContacts:        needsContacts,
    scrapePlaceDetailPage: needsDetailPage,
    // Always disabled — we never need individual reviews, images, or reservations
    scrapeReviews: false,
    scrapeImages:  false,
  };

  console.log('[Apify] maxResults 传入值:', maxResults);
  console.log('scrapeContacts:', actorInput.scrapeContacts);
  console.log('Apify input:', JSON.stringify(actorInput, null, 2));

  const runResponse = await axios.post(
    `${BASE_URL}/acts/compass~crawler-google-places/runs`,
    actorInput,
    {
      params: { token: APIFY_TOKEN },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const runId = runResponse.data.data.id;
  console.log(`[Apify] Run started, ID: ${runId}`);

  // Step 2: Poll until the run completes (READY -> RUNNING -> SUCCEEDED/FAILED)
  // Retries on transient 5xx errors; gives up after 12 minutes total.
  let status = 'RUNNING';
  let finalRunData = null;
  const pollDeadline = Date.now() + 12 * 60 * 1000;

  while (status === 'RUNNING' || status === 'READY') {
    if (Date.now() > pollDeadline) throw new Error('Apify run timed out after 12 minutes');
    await new Promise(r => setTimeout(r, 5000));

    let retries = 3;
    while (retries > 0) {
      try {
        const statusRes = await axios.get(
          `${BASE_URL}/actor-runs/${runId}`,
          { params: { token: APIFY_TOKEN } }
        );
        finalRunData = statusRes.data.data;
        status = finalRunData.status;
        console.log(`[Apify] Status: ${status}`);
        break;
      } catch (pollErr) {
        const code = pollErr.response?.status;
        if ((code === 502 || code === 503 || code === 504) && retries > 1) {
          console.warn(`[Apify] Poll got ${code}, retrying (${retries - 1} left)…`);
          retries--;
          await new Promise(r => setTimeout(r, 3000));
        } else {
          throw pollErr;
        }
      }
    }
  }

  if (status !== 'SUCCEEDED') {
    const errMsg = finalRunData?.errorMessage || finalRunData?.stats?.errorMessage || '(no errorMessage in run data)';
    console.error(`[Apify] Run ended with status=${status}  runId=${runId}  error="${errMsg}"`);
    console.error('[Apify] Full run data:', JSON.stringify(finalRunData ?? {}).slice(0, 800));
    throw new Error(`Apify run failed: status=${status} — ${errMsg}`);
  }

  // usageTotalUsd can live at top level or inside stats depending on API version
  const apifyCostUsd = finalRunData?.usageTotalUsd ?? finalRunData?.stats?.usageTotalUsd ?? null;
  console.log(`[Apify] Run stats:`, JSON.stringify(finalRunData?.stats ?? {}));
  console.log(`[Apify] Cost: $${apifyCostUsd ?? 'unknown (field missing)'}`);

  // Step 3: Fetch the results from the dataset
  const resultsRes = await axios.get(
    `${BASE_URL}/actor-runs/${runId}/dataset/items`,
    { params: { token: APIFY_TOKEN, format: 'json' } }
  );

  const rawItems = resultsRes.data;
  console.log(`[Apify] Done: ${rawItems.length} raw items returned`);
  if (rawItems.length > 0) {
    const s = rawItems[0];
    console.log(`[Apify] Sample[0]: title="${s.title}" website="${s.website}" placeId="${s.placeId}" phone="${s.phone}"`);
  }

  // Step 4: Map raw Apify fields to our lead object shape — no filtering here,
  // all items are passed through so Step 1 can show every result to the user.
  const companies = rawItems.map(item => ({
    companyName:  item.title || '',
    website:      item.website || '',
    phone:        item.phone || item.phoneUnformatted || '',
    address:      item.address || '',
    city:         item.city || '',
    state:        item.state || '',
    country:      'Australia',
    industry:     item.categoryName || searchQuery,
    googleRating: item.totalScore || '',
    reviewCount:  item.reviewsCount || 0,
    googleMapsUrl: item.url || '',
    placeId:      item.placeId || '',

    // emails is an array — prefer a business domain over free providers
    email: Array.isArray(item.emails) && item.emails.length > 0
      ? (item.emails.find(e => !e.includes('gmail') && !e.includes('hotmail') && !e.includes('yahoo')) || item.emails[0])
      : '',

    websiteContent: '', // Filled by Firecrawl in the next pipeline step
    source: 'google_maps',
  }));

  return { companies, apifyCostUsd };
}

module.exports = { scrapeAustralianCompanies };
