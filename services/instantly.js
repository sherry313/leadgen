require('dotenv').config();
const axios = require('axios');

const BASE = 'https://api.instantly.ai/api/v2';

// Default 5-step cadence: Day 1 / Day 4 / Day 7 / Day 10 / Day 14
const DEFAULT_DELAYS = [0, 3, 3, 3, 4];
const PLACEHOLDER_SEQUENCE = [{ steps: DEFAULT_DELAYS.map((delay, i) => ({
  type: 'email', delay,
  variants: [{ subject: `{{email_${i + 1}_subject}}`, body: `{{email_${i + 1}_body}}` }],
}))}];

function authHeaders() {
  return {
    'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Install the 5-step {{email_N_*}} placeholder sequence on a campaign — only if
// its sequence is truly empty. Once a user (or another call) has populated steps,
// this is a no-op so we never clobber manual edits in the Instantly UI.
async function ensureSequenceInstalled(campaignId) {
  try {
    const r = await axios.get(`${BASE}/campaigns/${campaignId}`, { headers: authHeaders() });
    const isEmpty = !r.data?.sequences?.[0]?.steps?.length;
    if (!isEmpty) return;
    await axios.patch(`${BASE}/campaigns/${campaignId}`, { sequences: PLACEHOLDER_SEQUENCE }, { headers: authHeaders() });
    console.log(`[Instantly] Placeholder sequence installed on campaign ${campaignId}`);
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`[Instantly] ensureSequenceInstalled failed for ${campaignId}: ${detail}`);
  }
}

const GENERIC_PREFIXES = new Set([
  'admin','info','contact','hello','sales','support','office',
  'enquiries','enquiry','contactus','mail','email','team','hi',
  'customer','customers','service','services','reception',
]);

function extractFirstName(email, companyName) {
  const prefix = (email || '').split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!prefix || GENERIC_PREFIXES.has(prefix)) return companyName || '';
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

// Create a new campaign and return its ID
async function createCampaign(name = '智拓客-开发信') {
  const emailAccount = process.env.INSTANTLY_EMAIL_ACCOUNT || '';
  const res = await axios.post(
    `${BASE}/campaigns`,
    { name, email_list: emailAccount ? [emailAccount] : [] },
    { headers: authHeaders() }
  );
  const id = res.data?.id;
  console.log(`[Instantly] Created campaign "${name}" → ${id}`);
  if (id) await ensureSequenceInstalled(id);
  return id;
}

// Add a fully-enriched lead (all 5 email sequences) to the campaign
async function addLeadToCampaign(lead, campaignIdOverride = null) {
  const campaignId = campaignIdOverride || process.env.INSTANTLY_CAMPAIGN_ID;
  if (!campaignId) {
    console.warn('[Instantly] No campaign ID (override nor env). Skipping.');
    return { success: false, reason: 'No campaign ID configured' };
  }
  if (!lead.email?.trim()) {
    console.warn(`[Instantly] No email for "${lead.companyName}". Skipping.`);
    return { success: false, reason: 'No email address' };
  }

  await ensureSequenceInstalled(campaignId);

  // Defensive: Instantly's lead emails are case-sensitive in some workspaces.
  // Normalize before any downstream use.
  const normalizedEmail = lead.email.toLowerCase().trim();
  const firstName = extractFirstName(normalizedEmail, lead.companyName);
  console.log(`[Instantly] Adding lead to campaign: ${normalizedEmail} (${lead.companyName}) → first_name="${firstName}"`);

  const sub = (s) => (s || '')
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{company\}/g,    lead.companyName || '')
    .replace(/\{website\}/g,    lead.website     || '');

  try {
    const res = await axios.post(
      `${BASE}/leads`,
      {
        campaign:     campaignId,
        email:        normalizedEmail,
        first_name:   firstName,
        company_name: lead.companyName || '',
        phone:        lead.phone       || '',
        website:      lead.website     || '',
        custom_variables: {
          email_1_subject: sub(lead.EMAIL_1_SUBJECT),
          email_1_body:    sub(lead.EMAIL_1_BODY),
          email_2_subject: sub(lead.EMAIL_2_SUBJECT),
          email_2_body:    sub(lead.EMAIL_2_BODY),
          email_3_subject: sub(lead.EMAIL_3_SUBJECT),
          email_3_body:    sub(lead.EMAIL_3_BODY),
          email_4_subject: sub(lead.EMAIL_4_SUBJECT),
          email_4_body:    sub(lead.EMAIL_4_BODY),
          email_5_subject: sub(lead.EMAIL_5_SUBJECT),
          email_5_body:    sub(lead.EMAIL_5_BODY),
        },
      },
      { headers: authHeaders() }
    );
    console.log(`[Instantly] Lead added:`, JSON.stringify(res.data));
    return { success: true };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.warn(`[Instantly] Failed to add lead: ${JSON.stringify(detail)}`);
    return { success: false, reason: JSON.stringify(detail) };
  }
}

// Queue a single manual email send (called from /api/send-email)
async function queueEmail({ toEmail, companyName, subject, body, emailNumber = 1, campaignIdOverride = null }) {
  const campaignId = campaignIdOverride || process.env.INSTANTLY_CAMPAIGN_ID;
  if (!campaignId) return { success: false, reason: 'INSTANTLY_CAMPAIGN_ID not set' };
  if (!toEmail?.trim()) return { success: false, reason: 'No email address' };

  const firstName = extractFirstName(toEmail, companyName);
  const sub = (s) => (s || '')
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{company\}/g,    companyName || '');

  console.log(`[Instantly] Queuing email #${emailNumber} to: ${toEmail}`);
  try {
    const res = await axios.post(
      `${BASE}/leads`,
      {
        campaign:     campaignId,
        email:        toEmail.trim(),
        first_name:   firstName,
        company_name: companyName || '',
        custom_variables: {
          [`email_${emailNumber}_subject`]: sub(subject),
          [`email_${emailNumber}_body`]:    sub(body),
        },
      },
      { headers: authHeaders() }
    );
    console.log(`[Instantly] Email queued:`, JSON.stringify(res.data));
    return { success: true };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.warn(`[Instantly] queueEmail failed: ${JSON.stringify(detail)}`);
    return { success: false, reason: JSON.stringify(detail) };
  }
}

// Fetch a campaign's current status. Returned `status` is the raw value from
// the Instantly API — historically a number (1 = active, 2 = paused, 3 =
// completed) but sometimes a string in newer responses. Callers should test
// for active with: `status === 1 || status === 'active'`.
// On any failure (404, network, auth) returns { status: null, name: '' } so
// callers can decide whether to proceed or refuse.
async function getCampaignStatus(campaignId) {
  if (!campaignId) return { status: null, name: '' };
  try {
    const r = await axios.get(`${BASE}/campaigns/${campaignId}`, { headers: authHeaders() });
    return { status: r.data?.status ?? null, name: r.data?.name || '' };
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.warn(`[Instantly] getCampaignStatus failed for ${campaignId}: ${detail}`);
    return { status: null, name: '' };
  }
}

// Update an existing lead's fields (e.g. custom_variables) without re-adding it.
// PATCH /api/v2/leads/{email} — merges fields into the lead's payload. Pass
// `campaignId` to also (re)associate the lead with a campaign; omit to leave
// the lead's current campaign membership unchanged.
async function patchInstantlyLead(email, campaignId, fields) {
  if (!email?.trim()) return { success: false, reason: 'No email address' };
  if (!fields || typeof fields !== 'object') return { success: false, reason: 'fields object required' };

  const normalizedEmail = email.toLowerCase().trim();
  const body = campaignId ? { campaign: campaignId, ...fields } : { ...fields };

  try {
    const res = await axios.patch(
      `${BASE}/leads/${encodeURIComponent(normalizedEmail)}`,
      body,
      { headers: authHeaders() }
    );
    console.log(`[Instantly] Lead patched: ${normalizedEmail}`);
    return { success: true, data: res.data };
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.warn(`[Instantly] patchInstantlyLead failed for ${normalizedEmail}: ${JSON.stringify(detail)}`);
    return { success: false, reason: JSON.stringify(detail) };
  }
}

module.exports = { addLeadToCampaign, createCampaign, queueEmail, ensureSequenceInstalled, getCampaignStatus, patchInstantlyLead };
