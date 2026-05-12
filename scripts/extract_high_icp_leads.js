require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL or SUPABASE_KEY not set in .env');
  process.exit(1);
}

const db = require('@supabase/supabase-js').createClient(SUPABASE_URL, SUPABASE_KEY);

const OUT_DIR = path.resolve(__dirname, '../audit_output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function hr(label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(` ${label}`);
  console.log('='.repeat(60));
}

function classify(companyName, website) {
  const n = (companyName || '').toLowerCase();
  const w = (website     || '').toLowerCase();
  const text = n + ' ' + w;
  if (/supply|wholesale|distribution|trade|import|supplier/.test(text)) return 'LIKELY_DISTRIBUTOR';
  if (/design|interior|architect|studio/.test(text))                    return 'LIKELY_DESIGNER';
  if (/renovation|construction|contracting|builders|build/.test(text))  return 'LIKELY_CONTRACTOR';
  return 'UNKNOWN';
}

function escCsv(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

async function main() {
  hr('High-ICP Lead Extraction — ' + new Date().toISOString());

  // Load search history to map search_id -> keyword
  const { data: history, error: hErr } = await db
    .from('search_history')
    .select('id, query, location');
  if (hErr) console.warn('search_history load failed:', hErr.message);
  const keywordMap = {};
  (history || []).forEach(r => {
    keywordMap[r.id] = r.query ? `${r.query}${r.location ? ' | ' + r.location : ''}` : '';
  });

  // Load all leads (454 total — small enough to filter in JS)
  const { data: allLeads, error: lErr } = await db
    .from('leads')
    .select('id, search_id, company_name, website, phone, email, city, rating, icp_score, intent_score, reasoning, email1_body, created_at')
    .order('created_at', { ascending: false });
  if (lErr) {
    console.error('leads query failed:', lErr.message);
    process.exit(1);
  }

  console.log(`\nTotal leads in table: ${allLeads.length}`);

  // Filter: icp_score >= 8, has email
  const highIcp = allLeads
    .filter(r => {
      const score = parseInt(r.icp_score, 10);
      return !isNaN(score) && score >= 8 && r.email && r.email.trim() !== '';
    })
    .map(r => ({
      ...r,
      _icpNum:    parseInt(r.icp_score,    10),
      _intentNum: parseInt(r.intent_score, 10) || 0,
      _emailStatus: (r.email1_body && r.email1_body.trim()) ? 'HAS_EMAIL' : 'BLANK',
      _keyword: keywordMap[r.search_id] || '',
      _flag: classify(r.company_name, r.website),
    }))
    .sort((a, b) => {
      if (b._icpNum !== a._icpNum) return b._icpNum - a._icpNum;
      return b._intentNum - a._intentNum;
    });

  console.log(`Leads with icp_score >= 8 AND email present: ${highIcp.length}`);

  const withEmail   = highIcp.length;
  const hasBodyCount  = highIcp.filter(r => r._emailStatus === 'HAS_EMAIL').length;
  const blankCount    = highIcp.filter(r => r._emailStatus === 'BLANK').length;

  // ── Write CSV ─────────────────────────────────────────────────
  const csvPath = path.join(OUT_DIR, 'high_icp_leads.csv');
  const headers = [
    'company_name', 'website', 'city', 'icp_score', 'intent_score',
    'flag', 'email', 'phone', 'rating',
    'created_at', 'search_keyword', 'email1_body_status',
  ];
  const csvRows = [headers.join(',')];
  highIcp.forEach(r => {
    csvRows.push([
      escCsv(r.company_name),
      escCsv(r.website),
      escCsv(r.city),
      escCsv(r.icp_score),
      escCsv(r.intent_score),
      escCsv(r._flag),
      escCsv(r.email),
      escCsv(r.phone),
      escCsv(r.rating),
      escCsv(r.created_at),
      escCsv(r._keyword),
      escCsv(r._emailStatus),
    ].join(','));
  });
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
  console.log(`\nCSV written: ${csvPath}`);

  // ── Country breakdown (not in schema — derive from city heuristic) ──
  // City values may contain state hints but no country field exists.
  // All leads are expected to be AU (Australian campaign).

  // ── Flag breakdown ─────────────────────────────────────────────
  const flagCounts = {};
  highIcp.forEach(r => {
    flagCounts[r._flag] = (flagCounts[r._flag] || 0) + 1;
  });

  // ── City breakdown (top 10) ────────────────────────────────────
  const cityCounts = {};
  highIcp.forEach(r => {
    const c = (r.city || 'Unknown').trim();
    cityCounts[c] = (cityCounts[c] || 0) + 1;
  });
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // ── Keyword breakdown ──────────────────────────────────────────
  const kwCounts = {};
  highIcp.forEach(r => {
    const k = r._keyword || '(unknown)';
    kwCounts[k] = (kwCounts[k] || 0) + 1;
  });

  // ── Build markdown summary ─────────────────────────────────────
  const top20 = highIcp.slice(0, 20);

  const mdTableHeader = [
    '| # | Company | City | ICP | Intent | Flag | Email | Email Status | Search Keyword |',
    '|---|---------|------|-----|--------|------|-------|-------------|----------------|',
  ];
  const mdTableRows = top20.map((r, i) =>
    `| ${i + 1} | ${r.company_name || ''} | ${r.city || ''} | ${r.icp_score} | ${r.intent_score} | ${r._flag} | ${r.email} | ${r._emailStatus} | ${r._keyword} |`
  );

  const flagLines = Object.entries(flagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `- ${k}: ${n}`)
    .join('\n');

  const cityLines = topCities
    .map(([c, n]) => `- ${c}: ${n}`)
    .join('\n');

  const kwLines = Object.entries(kwCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `- ${k}: ${n}`)
    .join('\n');

  const md = `# High-ICP Lead Extraction Report
Generated: ${new Date().toISOString()}

> NOTE: "country" column does not exist in the leads table (all leads are from AU campaigns).
> "customer_type" column does not exist -- classification below uses company name heuristics.

## Section A -- Totals

- Total leads in Supabase: ${allLeads.length}
- Leads with icp_score >= 8 AND email present: ${withEmail}
- Of those -- email1_body is non-empty (previously emailed): ${hasBodyCount}
- Of those -- email1_body is NULL/empty (blank email / never properly emailed): ${blankCount}

### Breakdown by flag (auto-classification from company name)

${flagLines}

### Breakdown by city (top 10)

${cityLines}

### Breakdown by search keyword

${kwLines}

## Section B -- Top 20 Leads Preview

${mdTableHeader.join('\n')}
${mdTableRows.join('\n')}

## Section C -- Recommendation Flags

Flags are auto-classified from company_name and website text. Manual verification required.

Flag definitions:
- LIKELY_DISTRIBUTOR: contains "supply", "wholesale", "distribution", "trade", "import", "supplier"
- LIKELY_DESIGNER: contains "design", "interior", "architect", "studio"
- LIKELY_CONTRACTOR: contains "renovation", "construction", "contracting", "builders", "build"
- UNKNOWN: none of the above matched

### Top 20 leads with flag detail

${top20.map((r, i) => {
  const website = r.website ? r.website : '(no website)';
  const body = r._emailStatus === 'HAS_EMAIL'
    ? 'Previously emailed (body saved). Verify whether blank email was sent via Instantly.'
    : 'email1_body is BLANK -- never properly emailed, or email was sent blank.';
  return `**${i + 1}. ${r.company_name}** [${website}](${website})
- ICP: ${r.icp_score} | Intent: ${r.intent_score} | Flag: ${r._flag}
- City: ${r.city || 'unknown'} | Email: ${r.email}
- ${body}`;
}).join('\n\n')}
`;

  const mdPath = path.join(OUT_DIR, 'high_icp_summary.md');
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`Summary written: ${mdPath}`);

  hr('Done');
  console.log(`Total high-ICP leads (score >= 8, has email): ${highIcp.length}`);
  console.log(`CSV: audit_output/high_icp_leads.csv`);
  console.log(`Summary: audit_output/high_icp_summary.md`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
