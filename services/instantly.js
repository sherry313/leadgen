require('dotenv').config();
const axios = require('axios');

const BASE = 'https://api.instantly.ai/api/v2';

function authHeaders() {
  return {
    'Authorization': `Bearer ${process.env.INSTANTLY_API_KEY}`,
    'Content-Type': 'application/json',
  };
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

  const firstName = extractFirstName(lead.email, lead.companyName);
  console.log(`[Instantly] Adding lead to campaign: ${lead.email} (${lead.companyName}) → first_name="${firstName}"`);

  const sub = (s) => (s || '')
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{company\}/g,    lead.companyName || '')
    .replace(/\{website\}/g,    lead.website     || '');

  try {
    const res = await axios.post(
      `${BASE}/leads`,
      {
        campaign:     campaignId,
        email:        lead.email.trim(),
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

module.exports = { addLeadToCampaign, createCampaign, queueEmail };
