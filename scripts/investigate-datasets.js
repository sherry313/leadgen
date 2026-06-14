// READ-ONLY investigation script.
// Lists Apify datasets, filters those with > 100 items, and checks whether
// any Supabase table has rows referencing those dataset IDs.
//
// Usage:  node scripts/investigate-datasets.js
//
// Loads env vars from ../.env (parent of scripts/).

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_KEY;

if (!APIFY_API_TOKEN) { console.error('Missing APIFY_API_TOKEN in .env'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env');
  process.exit(1);
}

const APIFY_BASE = 'https://api.apify.com/v2';
const ITEM_COUNT_THRESHOLD = 100;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Tables to probe. `search_history` and `leads` are the real ones in this repo;
// `runs`, `jobs`, `scrape_jobs` are speculative per the spec — we expect them
// to error with "relation does not exist" which we handle gracefully.
const CANDIDATE_TABLES = ['leads', 'search_history', 'runs', 'jobs', 'scrape_jobs'];

// Columns that might hold an Apify dataset/run ID. We try each and skip the
// ones the table doesn't have (Supabase returns a column-not-found error).
const CANDIDATE_COLUMNS = ['dataset_id', 'apify_dataset_id', 'run_id', 'apify_run_id', 'id'];

async function listDatasets() {
  const r = await axios.get(`${APIFY_BASE}/datasets`, {
    params: { token: APIFY_API_TOKEN, limit: 100 },
  });
  // Apify wraps list responses in { data: { items: [...] } }
  return r.data?.data?.items || r.data?.items || [];
}

async function getDatasetMeta(id) {
  const r = await axios.get(`${APIFY_BASE}/datasets/${id}`, {
    params: { token: APIFY_API_TOKEN },
  });
  return r.data?.data || r.data || {};
}

// Returns { table, column } on first hit, or null if nothing matches.
async function findDatasetInSupabase(datasetId) {
  const errors = [];
  for (const table of CANDIDATE_TABLES) {
    for (const column of CANDIDATE_COLUMNS) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq(column, datasetId)
          .limit(1);
        if (error) {
          // Distinguish "table doesn't exist" from "column doesn't exist" —
          // both are normal probe failures, not real errors.
          const msg = error.message || '';
          const code = error.code || '';
          if (code === '42P01' || /relation .* does not exist/.test(msg)) {
            errors.push(`${table}: table missing`);
            break; // no point trying other columns on a non-existent table
          }
          if (code === '42703' || /column .* does not exist/.test(msg)) {
            errors.push(`${table}.${column}: column missing`);
            continue;
          }
          errors.push(`${table}.${column}: ${msg}`);
          continue;
        }
        if (data && data.length > 0) {
          return { table, column, errors };
        }
      } catch (err) {
        errors.push(`${table}.${column}: ${err.message}`);
      }
    }
  }
  return { table: null, column: null, errors };
}

(async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Apify Dataset Investigation (READ-ONLY)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('[1/3] Listing Apify datasets (limit=100)...');
  let datasets;
  try {
    datasets = await listDatasets();
  } catch (err) {
    console.error('Apify list failed:', err.response?.status, err.response?.data || err.message);
    process.exit(1);
  }
  console.log(`      Got ${datasets.length} datasets total\n`);

  console.log(`[2/3] Fetching metadata for each to filter itemCount > ${ITEM_COUNT_THRESHOLD}...`);
  const enriched = [];
  for (let i = 0; i < datasets.length; i++) {
    const d = datasets[i];
    try {
      const meta = await getDatasetMeta(d.id);
      const itemCount = meta.itemCount ?? meta.cleanItemCount ?? d.itemCount ?? 0;
      enriched.push({
        id: d.id,
        name: meta.name || d.name || '(unnamed)',
        itemCount,
        createdAt: meta.createdAt || d.createdAt || '',
      });
      process.stdout.write(`\r      Progress: ${i + 1}/${datasets.length}`);
    } catch (err) {
      enriched.push({
        id: d.id,
        name: d.name || '(unnamed)',
        itemCount: -1,
        createdAt: d.createdAt || '',
        error: err.response?.status || err.message,
      });
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  process.stdout.write('\n');

  const qualifying = enriched.filter((d) => d.itemCount > ITEM_COUNT_THRESHOLD);
  console.log(`      ${qualifying.length} dataset(s) have > ${ITEM_COUNT_THRESHOLD} items\n`);

  if (qualifying.length === 0) {
    console.log('No qualifying datasets. Exiting.');
    return;
  }

  console.log('[3/3] Checking Supabase for references to each qualifying dataset...');
  console.log(`      (probing tables: ${CANDIDATE_TABLES.join(', ')})`);
  console.log(`      (probing columns: ${CANDIDATE_COLUMNS.join(', ')})\n`);

  const report = [];
  for (const d of qualifying) {
    const hit = await findDatasetInSupabase(d.id);
    report.push({ ...d, foundIn: hit });
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  REPORT');
  console.log('═══════════════════════════════════════════════════════════\n');

  const idW    = Math.max(...report.map((r) => r.id.length), 10);
  const nameW  = Math.min(40, Math.max(...report.map((r) => r.name.length), 4));
  const countW = 9;
  const foundW = 30;

  const header =
    'Dataset ID'.padEnd(idW) + '  ' +
    'Name'.padEnd(nameW) + '  ' +
    'Items'.padStart(countW) + '  ' +
    'Found in Supabase';
  console.log(header);
  console.log('─'.repeat(idW + 2 + nameW + 2 + countW + 2 + foundW));

  for (const r of report) {
    const found = r.foundIn?.table
      ? `YES — ${r.foundIn.table}.${r.foundIn.column}`
      : 'NO';
    const name = r.name.length > nameW ? r.name.slice(0, nameW - 1) + '…' : r.name;
    console.log(
      r.id.padEnd(idW) + '  ' +
      name.padEnd(nameW) + '  ' +
      String(r.itemCount).padStart(countW) + '  ' +
      found
    );
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Total datasets examined:    ${enriched.length}`);
  console.log(`  Qualifying (>${ITEM_COUNT_THRESHOLD} items):       ${qualifying.length}`);
  console.log(`  Found in Supabase:          ${report.filter((r) => r.foundIn?.table).length}`);
  console.log(`  NOT found in Supabase:      ${report.filter((r) => !r.foundIn?.table).length}`);

  // Surface table/column probe errors once at the end so the table report stays clean
  const allErrors = new Set();
  for (const r of report) (r.foundIn?.errors || []).forEach((e) => allErrors.add(e));
  if (allErrors.size) {
    console.log('\nProbe errors encountered (informational — not failures):');
    [...allErrors].sort().forEach((e) => console.log(`  • ${e}`));
  }
})();
