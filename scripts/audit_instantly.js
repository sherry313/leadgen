require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'https://api.instantly.ai/api/v2';
const API_KEY = process.env.INSTANTLY_API_KEY;
const OUT_DIR = path.join(__dirname, '..', 'audit_output');

if (!API_KEY) {
  console.error('ERROR: INSTANTLY_API_KEY not found in .env file');
  process.exit(1);
}

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function get(endpoint, params = {}) {
  await sleep(500); // max 2 req/sec
  try {
    const r = await axios.get(`${BASE}${endpoint}`, { headers: headers(), params });
    return r.data;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.response?.data || err.message;
    if (status === 401 || status === 403) {
      throw new Error(`AUTH ERROR ${status} on ${endpoint}: ${JSON.stringify(msg)}`);
    }
    // Swallow 404 silently (endpoint doesn't exist in this API version)
    if (status !== 404) {
      console.warn(`  [WARN] ${status || 'ERR'} on ${endpoint}: ${JSON.stringify(msg)}`);
    }
    return null;
  }
}

function save(filename, data) {
  const filepath = path.join(OUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  Saved: audit_output/${filename}`);
}

// Analytics endpoint returns an array — unwrap first item
function unwrapAnalytics(raw) {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

function wordCount(text) {
  if (!text) return 0;
  const stripped = String(text).replace(/<[^>]*>/g, ' ');
  return stripped.trim().split(/\s+/).filter(Boolean).length;
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getBodyText(body) {
  if (!body) return '';
  if (typeof body === 'string') return stripHtml(body);
  if (body.text) return body.text.trim();
  if (body.html) return stripHtml(body.html);
  return '';
}

// ue_type: 1 = sent outbound, 2 = received inbound (reply), 3 = other
function classifyReply(email) {
  // If Instantly already flagged it as auto-reply
  if (email.is_auto_reply === true) return 'AUTO_REPLY';

  const subject = (email.subject || '').toLowerCase();
  const fromAddr = (email.from_address_email || '').toLowerCase();
  const bodyText = getBodyText(email.body).toLowerCase();

  if (fromAddr.includes('noreply') || fromAddr.includes('no-reply') || fromAddr.includes('donotreply')) {
    return 'AUTO_REPLY';
  }

  const autoKW = [
    'out of office', 'out-of-office', 'auto-reply', 'autoreply', 'automatic reply',
    'automated response', 'i am away', 'i am out', 'i will be out',
    "i'm out of", "i'm away", 'on vacation', 'on leave', 'on holiday',
    'currently out', 'do not reply', 'do not respond',
    'this is an automated', 'sent automatically', 'unmonitored inbox',
    'inbox is not monitored', 'this mailbox is not monitored',
    'ai assistant', 'ai-powered', 'powered by ai',
  ];

  const unsubKW = [
    'unsubscribe', 'remove me', 'opt out', 'opt-out', 'take me off your list',
    'stop emailing', 'please remove', 'do not contact',
  ];

  for (const kw of autoKW) {
    if (subject.includes(kw) || bodyText.includes(kw)) return 'AUTO_REPLY';
  }
  for (const kw of unsubKW) {
    if (subject.includes(kw) || bodyText.includes(kw)) return 'UNSUBSCRIBE';
  }

  return 'HUMAN';
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log('=== Instantly Account Audit ===\n');
  console.log(`API Key: ${API_KEY.slice(0, 8)}...`);
  console.log(`Output dir: ${OUT_DIR}\n`);

  // ── 1. Campaigns list ─────────────────────────────────────────────
  console.log('[1/5] Fetching campaigns list...');
  let campaignsData = null;
  try {
    campaignsData = await get('/campaigns', { limit: 100 });
    save('campaigns.json', campaignsData);
  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    process.exit(1);
  }

  const campaigns = campaignsData?.items || (Array.isArray(campaignsData) ? campaignsData : []);
  console.log(`  Found ${campaigns.length} campaign(s)\n`);

  // ── 2. Per-campaign: details + analytics ──────────────────────────
  console.log('[2/5] Fetching campaign details and analytics...');
  const campaignDetails = [];

  for (const c of campaigns) {
    const id = c.id;
    console.log(`  -> ${c.name} (${id})`);

    let details = null, analytics = null;

    try {
      details = await get(`/campaigns/${id}`);
      if (details) save(`campaign_${id}_details.json`, details);
    } catch (err) { console.error(`    AUTH: ${err.message}`); }

    try {
      const raw = await get('/campaigns/analytics', { id });
      analytics = unwrapAnalytics(raw);
      if (raw) save(`campaign_${id}_analytics.json`, raw);
    } catch (err) { console.warn(`    [WARN] analytics: ${err.message}`); }

    campaignDetails.push({ campaign: c, details, analytics });
  }

  // ── 3. All emails (sent + received) ──────────────────────────────
  // ue_type 1 = sent outbound, ue_type 2 = received inbound (replies)
  console.log('\n[3/5] Fetching all emails (sent + inbox replies)...');
  let allEmails = [];
  try {
    let startingAfter = null;
    let page = 0;
    do {
      const params = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;
      const data = await get('/emails', params);
      if (!data) break;
      const items = data.items || (Array.isArray(data) ? data : []);
      allEmails = allEmails.concat(items);
      startingAfter = data.next_starting_after || null;
      page++;
      if (page > 10) { console.warn('  [WARN] Stopping at 1000 emails (safety limit)'); break; }
    } while (startingAfter);
    save('replies.json', allEmails);
    const inbound  = allEmails.filter(e => e.ue_type === 2);
    const outbound = allEmails.filter(e => e.ue_type === 1);
    console.log(`  Fetched ${allEmails.length} total emails (${outbound.length} sent, ${inbound.length} inbound replies)`);
  } catch (err) {
    console.error(`  Emails error: ${err.message}`);
  }

  const inboundReplies = allEmails.filter(e => e.ue_type === 2);
  const sentEmails     = allEmails.filter(e => e.ue_type === 1);

  // ── 4. Sending accounts ───────────────────────────────────────────
  console.log('\n[4/5] Fetching email accounts...');
  let accountsData = null;
  try {
    accountsData = await get('/accounts', { limit: 100 });
    save('accounts.json', accountsData);
  } catch (err) {
    console.error(`  Accounts error: ${err.message}`);
  }
  const accounts = accountsData?.items || (Array.isArray(accountsData) ? accountsData : []);
  console.log(`  Found ${accounts.length} account(s)`);

  // ── 5. SUMMARY.md ────────────────────────────────────────────────
  console.log('\n[5/5] Generating SUMMARY.md...');
  const L = [];

  const pct = (n, d) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : 'N/A';
  const statusLabel = { 0: 'DRAFT', 1: 'ACTIVE', 2: 'PAUSED', 3: 'COMPLETED' };

  L.push('# Instantly Account Audit');
  L.push(`*Generated: ${new Date().toISOString()}*`);
  L.push('');

  // Aggregate totals
  // NOTE: In Instantly's data model, reply_count = HUMAN replies only,
  // reply_count_automatic = auto-replies (separate bucket, NOT a subset of reply_count).
  // Total replies = reply_count + reply_count_automatic.
  let totalContacted = 0, totalSent = 0, totalOpens = 0;
  let totalHumanReplies = 0, totalAutoReplies = 0, totalBounces = 0;
  for (const { analytics: an } of campaignDetails) {
    if (!an) continue;
    totalContacted    += an.contacted_count || 0;
    totalSent         += an.emails_sent_count || 0;
    totalOpens        += an.open_count || 0;
    totalHumanReplies += an.reply_count || 0;
    totalAutoReplies  += an.reply_count_automatic || 0;
    totalBounces      += an.bounced_count || 0;
  }
  const totalReplies = totalHumanReplies + totalAutoReplies;

  L.push('## Overall Summary');
  L.push('');
  L.push(`| Metric | Value |`);
  L.push(`|--------|-------|`);
  L.push(`| Campaigns | ${campaigns.length} |`);
  L.push(`| Total contacted | ${totalContacted} |`);
  L.push(`| Total sent | ${totalSent} |`);
  L.push(`| Total opens | ${totalOpens} (${pct(totalOpens, totalContacted)}) |`);
  L.push(`| Total replies (human + auto) | ${totalReplies} (${pct(totalReplies, totalContacted)}) |`);
  L.push(`| -- Human replies | ${totalHumanReplies} (${pct(totalHumanReplies, totalContacted)}) |`);
  L.push(`| -- Auto-replies | ${totalAutoReplies} (${pct(totalAutoReplies, totalContacted)}) |`);
  L.push(`| Total bounces | ${totalBounces} (${pct(totalBounces, totalSent)}) |`);
  L.push('');
  if (totalReplies > 0 && totalHumanReplies === 0) {
    L.push('> **CRITICAL: reply_count=0 across all campaigns. Zero human replies recorded by Instantly.**');
    L.push('');
  }

  // === Section A ===
  L.push('## Section A -- Campaigns Overview');
  L.push('');

  for (const { campaign: c, analytics: an } of campaignDetails) {
    const status      = statusLabel[c.status] || `STATUS_${c.status}`;
    const contacted   = an?.contacted_count || 0;
    const sent        = an?.emails_sent_count || 0;
    const opens       = an?.open_count || 0;
    const humanR  = an?.reply_count || 0;
    const autoR   = an?.reply_count_automatic || 0;
    const totalR  = humanR + autoR;
    const bounces = an?.bounced_count || 0;
    const unsubs  = an?.unsubscribed_count || 0;
    const leads   = an?.leads_count || 0;
    const completed = an?.completed_count || 0;

    L.push(`### ${c.name}`);
    L.push(`| Field | Value |`);
    L.push(`|-------|-------|`);
    L.push(`| ID | \`${c.id}\` |`);
    L.push(`| Status | **${status}** |`);
    L.push(`| Created | ${c.timestamp_created || c.created_at || 'N/A'} |`);
    L.push(`| Leads in campaign | ${leads} |`);
    L.push(`| Contacted (unique) | ${contacted} |`);
    L.push(`| Emails sent | ${sent} |`);
    L.push(`| Completed sequence | ${completed} |`);
    L.push(`| Opens | ${opens} (unique: ${an?.open_count_unique || 0}) (${pct(opens, contacted)}) |`);
    L.push(`| **Replies total** | **${totalR}** (${pct(totalR, contacted)}) |`);
    L.push(`| -- Human replies (reply_count) | ${humanR} |`);
    L.push(`| -- Auto-replies (reply_count_automatic) | ${autoR} |`);
    L.push(`| Bounces | ${bounces} (${pct(bounces, sent)}) |`);
    L.push(`| Unsubscribes | ${unsubs} |`);
    L.push('');
  }

  // === Section B ===
  L.push('## Section B -- Email Sequences (CRITICAL)');
  L.push('');
  L.push('> Email bodies are reconstructed from actual SENT emails (ue_type=1) pulled from the /emails API.');
  L.push('> The campaign template uses {{email_N_subject}} / {{email_N_body}} custom variable placeholders.');
  L.push('> Step codes follow the pattern 0_N_0 where N is the 0-indexed step number.');
  L.push('');

  for (const { campaign: c, details } of campaignDetails) {
    L.push(`### Campaign: ${c.name}`);
    L.push('---------------------------------');
    L.push('');

    // Show the sequence template (steps with placeholder subjects)
    let templateSteps = null;
    if (details?.sequences) {
      const seqs = Array.isArray(details.sequences) ? details.sequences : [details.sequences];
      templateSteps = seqs.flatMap(s => s.steps || []);
    } else if (details?.steps) {
      templateSteps = Array.isArray(details.steps) ? details.steps : [details.steps];
    }

    // Get sent emails for this campaign grouped by step
    const campaignSent = sentEmails.filter(e => e.campaign_id === c.id);
    const byStep = {};
    for (const e of campaignSent) {
      const step = e.step || 'unknown';
      if (!byStep[step]) byStep[step] = e; // keep first example per step
    }
    const sortedSteps = Object.keys(byStep).sort();

    if (sortedSteps.length > 0) {
      L.push(`**Sequence steps (from ${campaignSent.length} sent emails):**`);
      L.push('');

      sortedSteps.forEach((stepKey, i) => {
        const e = byStep[stepKey];
        const bodyText = getBodyText(e.body);
        const wc = wordCount(bodyText);
        const delay = templateSteps && templateSteps[i] ? templateSteps[i].delay : '?';

        L.push(`**Step ${i + 1} (step code: ${stepKey}, template delay: ${delay} days):**`);
        L.push(`Subject: ${e.subject || '*(empty subject)*'}`);
        L.push(`Word count: ${wc}`);
        L.push('');
        L.push('Body:');
        L.push('```');
        L.push(bodyText || '*(empty body)*');
        L.push('```');
        L.push('');
      });
    } else if (templateSteps && templateSteps.length > 0) {
      // No sent emails yet — show template placeholders
      L.push('*No sent emails found for this campaign. Showing template structure:*');
      L.push('');
      templateSteps.forEach((step, i) => {
        const variants = step.variants || [step];
        const v = variants.find(x => !x.disabled) || variants[0];
        L.push(`**Step ${i + 1} (delay: ${step.delay ?? '?'} days):**`);
        L.push(`Subject placeholder: \`${v?.subject || step.subject || '(none)'}\``);
        L.push(`Body placeholder: \`${v?.body || step.body || '(none)'}\``);
        L.push('');
      });
    } else {
      L.push('*No sequence data found for this campaign.*');
      L.push('');
    }
  }

  // === Section C ===
  L.push('## Section C -- Replies Inventory');
  L.push('');
  L.push(`**Total inbound replies (ue_type=2): ${inboundReplies.length}**`);
  L.push(`*(Out of ${allEmails.length} total emails fetched from /emails endpoint)*`);
  L.push('');

  if (inboundReplies.length === 0) {
    L.push('No inbound replies found in the /emails endpoint.');
    L.push('');
    L.push('> Note: Instantly analytics shows non-zero reply_count for some campaigns.');
    L.push('> Those replies may exist in Unibox but were not returned as ue_type=2 in this query.');
    L.push('');
  } else {
    const tagged = inboundReplies.map(r => ({ ...r, _tag: classifyReply(r) }));
    const counts = {};
    tagged.forEach(r => { counts[r._tag] = (counts[r._tag] || 0) + 1; });

    L.push('**Classification breakdown:**');
    Object.entries(counts).sort().forEach(([tag, n]) => L.push(`- ${tag}: ${n}`));
    L.push('');
    L.push('---');
    L.push('');

    for (const r of tagged) {
      const snippet = getBodyText(r.body).slice(0, 500);

      L.push(`#### [${r._tag}] From: ${r.from_address_email || 'unknown'}`);
      L.push(`- **From name:** ${r.from_name || 'N/A'}`);
      L.push(`- **Subject:** ${r.subject || 'N/A'}`);
      L.push(`- **Date:** ${r.timestamp_email || r.timestamp_created || 'N/A'}`);
      L.push(`- **Campaign:** ${r.campaign_id || 'N/A'}`);
      L.push(`- **Step:** ${r.step ?? 'N/A'}`);
      L.push(`- **is_auto_reply (API flag):** ${r.is_auto_reply ?? 'N/A'}`);
      if (snippet) {
        L.push('- **Body:**');
        L.push('  ```');
        snippet.split('\n').forEach(line => L.push(`  ${line}`));
        L.push('  ```');
      }
      L.push('');
    }
  }

  // Analytics also shows auto-reply counts — surface those
  L.push('### Auto-reply counts from Instantly analytics:');
  L.push('');
  L.push('*(Instantly tracks auto-replies separately from human replies)*');
  L.push('');
  for (const { campaign: c, analytics: an } of campaignDetails) {
    if (!an || an.reply_count === 0) continue;
    L.push(`- **${c.name}**: ${an.reply_count} total replies, ${an.reply_count_automatic} auto-replies, ${an.reply_count - an.reply_count_automatic} human`);
  }
  L.push('');

  // === Section D ===
  L.push('## Section D -- Sending Account Health');
  L.push('');

  if (accounts.length === 0) {
    L.push('No sending accounts found.');
    L.push('');
  } else {
    L.push(`**${accounts.length} account(s) connected:**`);
    L.push('');
    for (const acc of accounts) {
      const warmup    = acc.warmup_enabled !== undefined ? String(acc.warmup_enabled) : (acc.warmup?.status ?? 'N/A');
      const dailyLim  = acc.daily_limit ?? acc.sending_limit ?? 'N/A';
      const sentToday = acc.emails_sent_today ?? acc.sent_today ?? 'N/A';
      const status    = acc.status ?? 'N/A';

      L.push(`### ${acc.email}`);
      L.push(`| Field | Value |`);
      L.push(`|-------|-------|`);
      L.push(`| Warmup enabled | ${warmup} |`);
      L.push(`| Daily send limit | ${dailyLim} |`);
      L.push(`| Sent today | ${sentToday} |`);
      L.push(`| Status | ${status} |`);
      L.push('');
    }
  }

  // === Section E ===
  L.push('## Section E -- Quick Red Flags');
  L.push('');

  const SPAM_SUBJECTS = [
    'hi {first_name}', 'quick question',
    'i hope this email finds you well', 'my name is',
  ];
  const flags = [];

  // Check actual sent email content per campaign
  for (const { campaign: c, analytics: an } of campaignDetails) {
    const campaignSent = sentEmails.filter(e => e.campaign_id === c.id);
    const byStep = {};
    for (const e of campaignSent) {
      const step = e.step || 'unknown';
      if (!byStep[step]) byStep[step] = e;
    }
    const sortedStepKeys = Object.keys(byStep).sort();

    sortedStepKeys.forEach((stepKey, i) => {
      const e = byStep[stepKey];
      const subj = (e.subject || '').toLowerCase();
      const body = getBodyText(e.body);
      const wc = wordCount(body);

      for (const kw of SPAM_SUBJECTS) {
        if (subj.includes(kw)) {
          flags.push(`[${c.name}] Step ${i + 1} subject contains spam-trigger phrase: "${kw}"`);
        }
      }

      if (wc > 200) {
        flags.push(`[${c.name}] Step ${i + 1} (${stepKey}) is ${wc} words (> 200-word limit)`);
      }

      if (i === 0 && /https?:\/\//.test(body)) {
        flags.push(`[${c.name}] Step 1 (${stepKey}) contains a URL/link (hurts deliverability on email 1)`);
      }
    });

    if (an) {
      const contacted = an.contacted_count || 0;
      const opens     = an.open_count || 0;
      const sent      = an.emails_sent_count || 0;
      const bounces   = an.bounced_count || 0;

      if (contacted >= 10 && opens / contacted < 0.20) {
        flags.push(`[${c.name}] Open rate ${((opens / contacted) * 100).toFixed(1)}% < 20% -- deliverability problem`);
      }
      if (sent >= 10 && bounces / sent > 0.05) {
        flags.push(`[${c.name}] Bounce rate ${((bounces / sent) * 100).toFixed(1)}% > 5% threshold`);
      }
    }
  }

  for (const acc of accounts) {
    const dl = acc.daily_limit ?? acc.sending_limit;
    if (typeof dl === 'number' && dl > 40) {
      flags.push(`[Account: ${acc.email}] Daily limit ${dl} > 40/inbox (warmup risk)`);
    }
  }

  if (flags.length === 0) {
    L.push('No automated red flags detected.');
  } else {
    L.push(`**${flags.length} red flag(s) found:**`);
    L.push('');
    flags.forEach((f, i) => L.push(`${i + 1}. WARNING: ${f}`));
  }

  L.push('');
  L.push('---');
  L.push('*End of audit*');

  const summaryPath = path.join(OUT_DIR, 'SUMMARY.md');
  fs.writeFileSync(summaryPath, L.join('\n'));

  console.log(`\nAudit complete. Open audit_output/SUMMARY.md`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
