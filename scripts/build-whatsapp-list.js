// One-off: build a paste-ready WhatsApp outreach list.
// - Pulls leads from Supabase
// - Filters to AU mobile numbers (+61 4...)
// - Extracts first_name from contact email
// - Derives a personalised hook from the AI-written email1_body (or falls back)
// - Outputs whatsapp-outreach.csv with a ready-to-paste `whatsapp_message` column

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const GENERIC_PREFIXES = new Set([
  'admin','info','contact','hello','sales','support','office',
  'enquiries','enquiry','contactus','mail','email','team','hi',
  'customer','customers','service','services','reception',
]);

function extractFirstName(email) {
  if (!email) return null;
  const prefix = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
  if (!prefix || GENERIC_PREFIXES.has(prefix)) return null;
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

function isAuMobile(phoneNormalized, phoneRaw) {
  // AU mobiles: +61 4xx xxx xxx → normalized starts with '614'
  // Also accept raw starting '04' (some rows may have local format)
  if (phoneNormalized?.startsWith('614')) return true;
  if (phoneRaw?.replace(/\s/g, '').startsWith('+614')) return true;
  if (phoneRaw?.replace(/\s/g, '').startsWith('04'))   return true;
  return false;
}

// Pull the personalised hook from the AI-written Email 1 body.
// Peter Kang framework's Email 1 opens with "Hi {name}, [hook sentence]."
// We strip the greeting and take the first non-empty sentence as the hook.
function extractHook(email1Body, fallbackCompany, fallbackCity) {
  if (email1Body && email1Body.trim()) {
    const lines = email1Body.split('\n').map(l => l.trim()).filter(Boolean);
    // Drop the greeting if present
    const filtered = lines.filter(l => !/^hi\b|^hello\b|^您好/i.test(l) || l.split(' ').length > 8);
    const candidate = filtered[0] || lines[0];
    if (candidate) {
      // Take only the first sentence so the WhatsApp msg stays short
      const firstSentence = candidate.split(/[.?!。？！]/).filter(Boolean)[0];
      if (firstSentence && firstSentence.length > 15 && firstSentence.length < 200) {
        return firstSentence.trim() + '.';
      }
    }
  }
  // Fallback — generic but still references their city
  return `Came across ${fallbackCompany || 'your business'} on Google${fallbackCity ? ` — looks like you're based in ${fallbackCity}` : ''}.`;
}

function buildMessage({ firstName, company, city, email1Body }) {
  const name = firstName || 'there';
  const hook = extractHook(email1Body, company, city);
  return `Hi ${name}, this is Lili from Lens — we make aluminium windows + doors in Foshan (factory direct, 20 yrs).

${hook}

Who handles your window/door sourcing? Just introducing ourselves, not pitching anything.`;
}

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  const all = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await db
      .from('leads')
      .select('id, company_name, phone, phone_normalized, email, website, city, icp_score, intent_score, email1_subject, email1_body, created_at')
      .not('phone', 'is', null)
      .neq('phone', '')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) { console.error('Supabase error:', error); process.exit(1); }
    if (!data.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Dedup by phone_normalized
  const seen = new Map();
  for (const r of all) {
    const key = r.phone_normalized || r.phone;
    if (!seen.has(key)) seen.set(key, r);
  }
  const unique = [...seen.values()];

  // Filter to AU mobiles
  const mobiles = unique.filter(r => isAuMobile(r.phone_normalized, r.phone));

  // Build message per row
  const rows = mobiles.map(r => {
    const firstName = extractFirstName(r.email);
    const message = buildMessage({
      firstName,
      company: r.company_name,
      city: r.city,
      email1Body: r.email1_body,
    });
    return {
      company_name: r.company_name || '',
      phone: r.phone || '',
      first_name: firstName || '(generic)',
      email: r.email || '',
      website: r.website || '',
      city: r.city || '',
      icp_score: r.icp_score || '',
      has_ai_email: r.email1_body?.trim() ? 'yes' : 'no',
      whatsapp_message: message,
    };
  });

  // Sort by ICP score DESC so high-value leads come first in the CSV
  rows.sort((a, b) => Number(b.icp_score || 0) - Number(a.icp_score || 0));

  // CSV
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = ['company_name','phone','first_name','email','website','city','icp_score','has_ai_email','whatsapp_message'];
  const csv = '﻿' + cols.join(',') + '\n' +
    rows.map(r => cols.map(c => esc(r[c])).join(',')).join('\n');

  const out = path.join(__dirname, '..', 'whatsapp-outreach.csv');
  fs.writeFileSync(out, csv, 'utf8');

  // Summary
  const withAi = rows.filter(r => r.has_ai_email === 'yes').length;
  const withFirstName = rows.filter(r => r.first_name !== '(generic)').length;

  console.log(`Total unique phones in DB        : ${unique.length}`);
  console.log(`  └ AU mobiles (+61 4xx)          : ${mobiles.length}`);
  console.log(`    └ with AI-written hook       : ${withAi}`);
  console.log(`    └ with personal first name   : ${withFirstName}`);
  console.log(`    └ generic (use "there")      : ${rows.length - withFirstName}`);
  console.log(`\nWrote ${out}`);

  // First 3 sample messages
  console.log(`\n========== SAMPLE MESSAGES ==========`);
  for (const r of rows.slice(0, 3)) {
    console.log(`\n--- ${r.company_name} (${r.phone}, ICP ${r.icp_score}) ---`);
    console.log(r.whatsapp_message);
  }
})().catch(e => { console.error(e); process.exit(1); });
