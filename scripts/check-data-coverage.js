// One-off: for every lead with a phone, check what other data is present.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  const all = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await db
      .from('leads')
      .select('id, company_name, phone, phone_normalized, email, website, city, intent_score, icp_score, email1_subject, email1_body, email2_subject, email3_subject, email4_subject, email5_subject, created_at, search_id')
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

  const hasWebsite = unique.filter(r => r.website?.trim()).length;
  const hasEmail = unique.filter(r => r.email?.trim()).length;
  const hasIcp = unique.filter(r => r.icp_score && r.icp_score !== 'null' && r.icp_score !== '').length;
  const hasEmail1Subject = unique.filter(r => r.email1_subject?.trim()).length;
  const hasEmail1Body = unique.filter(r => r.email1_body?.trim()).length;
  const hasAll5Subjects = unique.filter(r =>
    r.email1_subject?.trim() && r.email2_subject?.trim() &&
    r.email3_subject?.trim() && r.email4_subject?.trim() && r.email5_subject?.trim()
  ).length;

  console.log(`Unique phones                     : ${unique.length}`);
  console.log(`  └ with website                  : ${hasWebsite}  (${pct(hasWebsite, unique.length)})`);
  console.log(`  └ with contact email            : ${hasEmail}    (${pct(hasEmail, unique.length)})`);
  console.log(`  └ with ICP score                : ${hasIcp}      (${pct(hasIcp, unique.length)})`);
  console.log(`  └ with Email-1 subject          : ${hasEmail1Subject}  (${pct(hasEmail1Subject, unique.length)})`);
  console.log(`  └ with Email-1 body             : ${hasEmail1Body}     (${pct(hasEmail1Body, unique.length)})`);
  console.log(`  └ with all 5 email subjects     : ${hasAll5Subjects}   (${pct(hasAll5Subjects, unique.length)})`);

  // Also export the full 5-email sequences for leads that have them
  const ready = unique.filter(r =>
    r.phone?.trim() && r.email?.trim() && r.website?.trim() &&
    r.email1_subject?.trim() && r.email1_body?.trim()
  );
  console.log(`\nLeads with phone + email + website + at least Email-1 generated: ${ready.length}`);

  function pct(a, b) { return b === 0 ? '0%' : (Math.round(a / b * 100)) + '%'; }

  // Build a "complete-package" CSV — phone, website, email, AND email1 subject+body
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = ['company_name','phone','email','website','city','icp_score','intent_score','email1_subject','email1_body'];
  const csv = '﻿' + cols.join(',') + '\n' +
    ready.map(r => cols.map(c => esc(r[c])).join(',')).join('\n');
  const out = path.join(__dirname, '..', 'phones-with-emails.csv');
  fs.writeFileSync(out, csv, 'utf8');
  console.log(`\nWrote ${out}  (${ready.length} rows)`);
})().catch(e => { console.error(e); process.exit(1); });
