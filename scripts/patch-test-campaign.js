// Patch all 5 emails on every lead in the TEST campaign with hand-written
// English templates (3 variants, cycled by lead index). Emails are FIXED per
// variant — only first_name and company_name are substituted.
//
// Preview lead 0 + 1, wait for Enter, then PATCH all leads.
// REPLACES email_1 through email_5 (different from patch-emails-2to5.js which
// only touches 2-5).
//
// Usage:
//   node scripts/patch-test-campaign.js           # preview + readline + PATCH
//   node scripts/patch-test-campaign.js --preview # preview only, exit clean

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const axios = require('axios');
const readline = require('readline');

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const CAMPAIGN_ID = '9f050ff0-faf0-4008-8a1d-a5722682c6ff';
const BASE = 'https://api.instantly.ai/api/v2';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

const PREVIEW_ONLY = process.argv.includes('--preview') || process.env.PREVIEW_ONLY === '1';

if (!INSTANTLY_API_KEY) { console.error('Missing INSTANTLY_API_KEY in .env'); process.exit(1); }

const headers = {
  Authorization: 'Bearer ' + INSTANTLY_API_KEY,
  'Content-Type': 'application/json',
};

function field(lead, key) {
  if (lead[key] != null && lead[key] !== '') return lead[key];
  if (lead.payload && lead.payload[key] != null && lead.payload[key] !== '') return lead.payload[key];
  return '';
}

function extractNextCursor(resData, lastItem) {
  if (!resData) return null;
  const candidates = [
    resData.next_starting_after,
    resData.nextStartingAfter,
    resData.starting_after,
    resData.cursor,
    resData.next,
    resData.next_cursor,
  ];
  for (const c of candidates) if (c) return c;
  const hasMore =
    resData.has_more === true ||
    resData.hasMore === true ||
    resData.next_page === true;
  if (hasMore && lastItem?.id) return lastItem.id;
  return null;
}

async function fetchAllLeads() {
  const all = [];
  let startingAfter = null;
  let page = 0;
  while (page < MAX_PAGES) {
    page++;
    const body = { campaign: CAMPAIGN_ID, limit: PAGE_LIMIT };
    if (startingAfter) body.starting_after = startingAfter;
    console.log('[fetch] Page ' + page + ' — starting_after=' + (startingAfter || '(none)'));
    let res;
    try {
      res = await axios.post(BASE + '/leads/list', body, { headers });
    } catch (err) {
      console.error('[fetch] Page ' + page + ' failed: ' + (err.response?.status || '') + ' ' + (err.response?.data ? JSON.stringify(err.response.data) : err.message));
      break;
    }
    const items = res.data?.items || res.data?.leads || (Array.isArray(res.data) ? res.data : []);
    console.log('[fetch] Page ' + page + ' returned ' + items.length + ' leads');
    if (!items.length) break;
    all.push(...items);
    const next = extractNextCursor(res.data, items[items.length - 1]);
    if (!next) break;
    if (next === startingAfter) {
      console.warn('[fetch] Cursor stuck — bailing');
      break;
    }
    startingAfter = next;
    await new Promise((r) => setTimeout(r, 200));
  }
  return all;
}

function buildPayload(lead, index) {
  const company_name = field(lead, 'company_name') || '(unknown company)';
  const raw_first_name = field(lead, 'first_name');
  const first_name = (raw_first_name && raw_first_name !== company_name)
    ? raw_first_name
    : company_name + ' team';

  const variant = index % 3;

  const EMAIL_1 = [
    {
      subject: 'visiting China for sourcing?',
      body: 'Hi ' + first_name + ',\n\nIf you ever do a China sourcing trip, our factory in Zhongshan is worth a half-day stop.\n\nWe cover airport pickup from Guangzhou, all meals, and a full production line walkthrough.\n\nNo agenda — just a chance to see what we make in person.\n\n{{accountSignature}}',
    },
    {
      subject: 'factory visit in Zhongshan?',
      body: 'Hi ' + first_name + ',\n\nWe run a 300,000m² aluminium factory in Zhongshan — 20 years on the same production line.\n\nIf you\'re ever sourcing in China, we\'d love to show you around. Airport pickup from Guangzhou, all meals on us.\n\nWorth keeping in mind for your next trip?\n\n{{accountSignature}}',
    },
    {
      subject: 'next time you\'re in Guangdong?',
      body: 'Hi ' + first_name + ',\n\nIf a China sourcing trip is ever on your radar, come see us in Zhongshan.\n\nHalf a day — production line, sample room, QC lab. We handle pickup and meals. You cover flights.\n\nReply with the month if it lines up.\n\n{{accountSignature}}',
    },
  ];

  const EMAIL_2 = [
    {
      subject: 'most buyers never see the factory',
      body: 'Hi ' + first_name + ',\n\nMost buyers place their first order without ever seeing the production line.\n\nThat\'s usually where the problems start.\n\nWe recorded a full factory walkthrough. Happy to send it over if useful.\n\n{{accountSignature}}',
    },
    {
      subject: 'before your next China order',
      body: 'Hi ' + first_name + ',\n\nOne thing most buyers skip: seeing the factory before committing.\n\nIt\'s the fastest way to separate serious manufacturers from the rest.\n\nWe have a walkthrough video — happy to send it across.\n\n{{accountSignature}}',
    },
    {
      subject: 'what does a factory visit actually tell you?',
      body: 'Hi ' + first_name + ',\n\nA supplier\'s showroom and their actual production floor are often very different.\n\nSeeing both removes more doubt than any document.\n\nHappy to send our factory video as a starting point.\n\n{{accountSignature}}',
    },
  ];

  const EMAIL_3 = [
    {
      subject: 'a bit about where we operate',
      body: 'Hi ' + first_name + ',\n\n300,000m² factory floor in Zhongshan.\n\n20 years on the same production line.\n\nCurrently supplying a Sydney designer on a residential project.\n\nIf you\'re ever sourcing in Guangdong, the factory is worth a visit.\n\n{{accountSignature}}',
    },
    {
      subject: '20 years in Zhongshan',
      body: 'Hi ' + first_name + ',\n\nWe\'ve been running the same factory in Zhongshan for 20 years.\n\n300,000m² of production floor. Currently working with a Sydney designer on a live residential project.\n\nIf a China trip is ever on your radar, come see it firsthand.\n\n{{accountSignature}}',
    },
    {
      subject: 'what do we actually look like?',
      body: 'Hi ' + first_name + ',\n\nOur factory in Zhongshan: 300,000m², 20 years running.\n\nCurrently supplying a Sydney designer — residential project, ongoing.\n\nThe invitation to visit is open.\n\n{{accountSignature}}',
    },
  ];

  const EMAIL_4 = [
    {
      subject: 'the problem with sourcing blind',
      body: 'Hi ' + first_name + ',\n\nThe most common China sourcing complaint: specs that looked right on paper, wrong on arrival.\n\nNo document fixes that.\n\nSeeing the production line in person does.\n\nWe cover airport pickup from Guangzhou, all meals, full factory and QC walkthrough. You cover flights and hotel.\n\n{{accountSignature}}',
    },
    {
      subject: 'why do specs get lost in translation?',
      body: 'Hi ' + first_name + ',\n\nSpec errors from China suppliers usually aren\'t translation problems — they\'re trust problems.\n\nYou can\'t fully trust what you haven\'t seen.\n\nA half-day at our factory in Zhongshan changes that. We handle pickup and meals. You cover the flight.\n\n{{accountSignature}}',
    },
    {
      subject: 'what solves the quality question?',
      body: 'Hi ' + first_name + ',\n\nEvery buyer has the same concern: will the quality match what was agreed?\n\nNothing settles that as well as a factory visit.\n\nWe cover airport pickup, all meals, factory tour, QC lab. You cover flights and hotel.\n\n{{accountSignature}}',
    },
  ];

  const EMAIL_5 = [
    {
      subject: 'closing your file',
      body: 'Hi ' + first_name + ',\n\nA few emails, no reply — completely fine.\n\nClosing your file today.\n\nIf a China sourcing trip ever comes up, the invitation to visit us in Zhongshan stays open.\n\nIs there someone else at ' + company_name + ' who handles sourcing I should know about?\n\n{{accountSignature}}',
    },
    {
      subject: 'last one from me',
      body: 'Hi ' + first_name + ',\n\nThis is my last email.\n\nIf you\'re ever in Guangdong for sourcing, the factory visit invitation stands.\n\nIs there a better person at ' + company_name + ' I should be speaking with?\n\n{{accountSignature}}',
    },
    {
      subject: 'wrapping up',
      body: 'Hi ' + first_name + ',\n\nFour emails, no response — I\'ll leave it here.\n\nIf the timing is ever right for a Zhongshan factory visit, feel free to reach back out.\n\nIs there someone else at ' + company_name + ' who handles supplier sourcing?\n\n{{accountSignature}}',
    },
  ];

  return {
    variant,
    first_name,
    company_name,
    email_1_subject: EMAIL_1[variant].subject,
    email_1_body:    EMAIL_1[variant].body,
    email_2_subject: EMAIL_2[variant].subject,
    email_2_body:    EMAIL_2[variant].body,
    email_3_subject: EMAIL_3[variant].subject,
    email_3_body:    EMAIL_3[variant].body,
    email_4_subject: EMAIL_4[variant].subject,
    email_4_body:    EMAIL_4[variant].body,
    email_5_subject: EMAIL_5[variant].subject,
    email_5_body:    EMAIL_5[variant].body,
  };
}

function printPreview(lead, payload, idx) {
  console.log('Lead index: ' + idx);
  console.log('Email:      ' + (lead.email || '(no email)'));
  console.log('first_name: ' + payload.first_name);
  console.log('company:    ' + payload.company_name);
  console.log('Variant:    ' + payload.variant);
  for (const n of [2, 3, 4, 5]) {
    console.log('');
    console.log('--- email_' + n + '_subject ---');
    console.log(payload['email_' + n + '_subject']);
    console.log('--- email_' + n + '_body ---');
    console.log(payload['email_' + n + '_body']);
  }
}

function waitForEnter(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

async function patchLead(leadId, payload) {
  // email_1 is intentionally NOT included — PATCH merges, so existing email_1
  // on each lead is preserved untouched. Only email_2..5 get overwritten.
  const body = {
    custom_variables: {
      email_2_subject: payload.email_2_subject,
      email_2_body:    payload.email_2_body,
      email_3_subject: payload.email_3_subject,
      email_3_body:    payload.email_3_body,
      email_4_subject: payload.email_4_subject,
      email_4_body:    payload.email_4_body,
      email_5_subject: payload.email_5_subject,
      email_5_body:    payload.email_5_body,
    },
  };
  await axios.patch(BASE + '/leads/' + leadId, body, { headers });
}

(async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Patch ALL emails (1-5) — campaign ' + CAMPAIGN_ID);
  console.log('═══════════════════════════════════════════════════════════\n');

  const leads = await fetchAllLeads();
  console.log('\nFetched ' + leads.length + ' leads total\n');
  if (!leads.length) {
    console.log('No leads. Exiting.');
    return;
  }

  for (const idx of [0, 1]) {
    if (idx >= leads.length) continue;
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  PREVIEW — lead index ' + idx);
    console.log('═══════════════════════════════════════════════════════════');
    const payload = buildPayload(leads[idx], idx);
    printPreview(leads[idx], payload, idx);
    console.log('');
  }

  if (PREVIEW_ONLY) {
    console.log('--- PREVIEW-ONLY mode (--preview flag set) — exiting without PATCH ---');
    return;
  }

  await waitForEnter('--- Press Enter to patch all ' + leads.length + ' leads, Ctrl+C to cancel ---\n');

  let ok = 0, failed = 0;
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (!lead.id) {
      console.log('[' + (i + 1) + '/' + leads.length + '] (no lead.id) ' + (lead.email || '?') + ' ... FAILED — missing id');
      failed++;
      continue;
    }
    const payload = buildPayload(lead, i);
    const tag = '[' + (i + 1) + '/' + leads.length + '] variant-' + payload.variant + ' | ' + (lead.email || '(no email)');
    try {
      await patchLead(lead.id, payload);
      console.log(tag + ' ... OK');
      ok++;
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 200) : err.message;
      console.log(tag + ' ... FAILED — ' + detail);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log('');
  console.log(ok + ' succeeded, ' + failed + ' failed.');
})();
