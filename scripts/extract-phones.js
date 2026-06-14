// One-off: extract every lead with a phone number from Supabase. Outputs CSV.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

(async () => {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // Paginate — Supabase caps default selects at 1000 rows per request.
  const all = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await db
      .from('leads')
      .select('id, company_name, phone, phone_normalized, email, website, city, created_at, search_id')
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

  console.log(`Total lead rows with phone: ${all.length}`);

  // Dedup by phone_normalized (same phone may appear across multiple searches).
  const seen = new Map();
  for (const r of all) {
    const key = r.phone_normalized || r.phone;
    if (!seen.has(key)) seen.set(key, r);
  }
  const unique = [...seen.values()];
  console.log(`Unique phones: ${unique.length}`);

  // CSV
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = 'company_name,phone,phone_normalized,email,website,city,created_at,search_id';
  const rows = unique.map(r => [
    esc(r.company_name), esc(r.phone), esc(r.phone_normalized),
    esc(r.email), esc(r.website), esc(r.city), esc(r.created_at), esc(r.search_id),
  ].join(','));
  const csv = '﻿' + header + '\n' + rows.join('\n');   // BOM so Excel reads UTF-8

  const out = path.join(__dirname, '..', 'phones.csv');
  fs.writeFileSync(out, csv, 'utf8');
  console.log(`Wrote ${out}`);

  // Top 10 sample
  console.log('\nFirst 10:');
  for (const r of unique.slice(0, 10)) {
    console.log(`  ${r.company_name?.padEnd(40).slice(0, 40)}  ${r.phone}  ${r.city || ''}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
