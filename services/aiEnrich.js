require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120000 });

// Claude Sonnet 4.6 pricing (USD per 1M tokens)
const AI_INPUT_PRICE_PER_M  = 3.00;
const AI_OUTPUT_PRICE_PER_M = 15.00;

const SYSTEM_PROMPT = `You are an expert B2B sales analyst and copywriter helping a Chinese building materials manufacturer
reach overseas buyers (builders, developers, renovators, contractors, importers, wholesalers, distributors).

Your job:
1. Score the prospect's buying intent based on their website content
2. Score how well this prospect matches the seller's Ideal Customer Profile (ICP)
3. Write a 5-email outreach sequence ONLY if the ICP score is 5 or above

Rules:
- All emails must be in English
- Reference the prospect's actual business details from their website when possible
- Make each follow-up clearly different in angle (not just "following up on my last email")
- Emails must feel personal and researched, not templated
- If icpScore <= 4, return empty strings for ALL email fields — do not waste tokens
- Always respond with valid JSON only — no markdown code fences, no explanation outside the JSON`;

async function enrichLead(company, websiteContent, companyProfile = {}, icp = '', keepSignals = [], lowSignal = false) {
  console.log(`[AI] Enriching lead: ${company.companyName}`);

  const sellerName = companyProfile.sellerName || 'our company';
  const products   = companyProfile.products   || 'windows & doors, kitchen cabinets, and bathtubs';
  const advantage  = companyProfile.advantage  || 'factory-direct pricing, custom sizing, fast lead times, low MOQ';

  const icpSection = icp?.trim()
    ? `=== IDEAL CUSTOMER PROFILE (ICP) ===
The seller only wants to target prospects that closely match this description:
${icp.trim()}

ICP scoring guide:
- 9-10: Matches ALL key criteria in the ICP above
- 7-8:  Matches most criteria, minor gaps
- 5-6:  Partial match — some criteria fit, some don't
- 3-4:  Poor match — mostly doesn't fit the ICP
- 1-2:  Completely wrong type of customer
CRITICAL: If icpScore is 4 or below, set ALL email fields to empty string "". Do not write any emails.`
    : `=== IDEAL CUSTOMER PROFILE (ICP) ===
No ICP specified. Set icpScore to 7 and icpReasoning to "未设置ICP筛选条件。" for all leads.
Still generate all 5 emails normally.`;

  const userPrompt = `Analyze this prospect and return a JSON object.

=== SELLER ===
Company: ${sellerName}
Products: ${products}
Unique advantage: ${advantage}
Product detail: The seller manufactures and exports: aluminium/uPVC windows & doors, kitchen cabinets (custom & modular), and freestanding/built-in bathtubs. Target buyers are renovation contractors, builders, interior designers, kitchen/bathroom retailers, and fit-out contractors who source these products for residential and commercial projects.

${icpSection}

=== BUYER SIGNAL ANALYSIS ===
${lowSignal
  ? 'WARNING: No buyer/distributor keywords were detected on this company\'s website. This is a LOW-SIGNAL lead. Apply a penalty of 1-2 points to both intentScore and icpScore unless the website content clearly contradicts this assessment.'
  : `Buyer signals detected on website: ${keepSignals.join(', ')}
Use these signals as supporting evidence when scoring intentScore and icpScore.`}

=== PROSPECT ===
Name: ${company.companyName}
Industry: ${company.industry || 'Unknown'}
Location: ${company.city}, ${company.state}
Phone: ${company.phone}
Google Rating: ${company.googleRating} (${company.reviewCount} reviews)
Website: ${company.website}

Website content:
${websiteContent || 'No website content available.'}

=== REQUIRED JSON FIELDS ===

- intentScore: integer 1-10 (how likely is this company to buy imported building materials)
  Scoring: active builder/developer/contractor = high; importer/distributor = highest; small/inactive = low
- intentReasoning: 用中文写2-3句话解释意向评分原因，引用官网具体内容作为证据

- icpScore: integer 1-10 (how well this prospect matches the ICP above)
- icpReasoning: 用中文写1-2句话解释ICP匹配度原因

- EMAIL_1_SUBJECT: Cold intro subject (max 55 chars) — EMPTY STRING if icpScore <= 4
- EMAIL_1_BODY: Cold intro — reference their website, explain value of ${products}, mention ${advantage}. 130-160 words. — EMPTY STRING if icpScore <= 4

- EMAIL_2_SUBJECT: Follow-up #1 subject — EMPTY STRING if icpScore <= 4
- EMAIL_2_BODY: Different angle, specific product benefit or pain point. 100-130 words. — EMPTY STRING if icpScore <= 4

- EMAIL_3_SUBJECT: Follow-up #2 subject — EMPTY STRING if icpScore <= 4
- EMAIL_3_BODY: Social proof — similar companies already sourcing from China. 100-130 words. — EMPTY STRING if icpScore <= 4

- EMAIL_4_SUBJECT: Follow-up #3 subject — EMPTY STRING if icpScore <= 4
- EMAIL_4_BODY: Offer something tangible — samples, catalogue, price list. 80-100 words. — EMPTY STRING if icpScore <= 4

- EMAIL_5_SUBJECT: Follow-up #4 subject — EMPTY STRING if icpScore <= 4
- EMAIL_5_BODY: Soft breakup email, low pressure, leave door open. 60-80 words. — EMPTY STRING if icpScore <= 4

Return only valid JSON. No markdown, no extra text.`;

  let rawText = '';
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const { input_tokens, output_tokens } = response.usage;
    rawText = response.content[0].text;
    console.log(`[AI] ${company.companyName}: raw response length=${rawText.length} stop_reason=${response.stop_reason} tokens=${input_tokens}in/${output_tokens}out`);

    // Strip accidental markdown fences before parsing
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const result = JSON.parse(cleaned);
    console.log(`[AI] ${company.companyName}: intent=${result.intentScore}/10  icp=${result.icpScore}/10  email1_subject="${String(result.EMAIL_1_SUBJECT || '').slice(0, 60)}"`);

    // Small delay to stay within Claude rate limits
    await new Promise(r => setTimeout(r, 500));

    return {
      ...result,
      usage: { input_tokens, output_tokens },
    };
  } catch (err) {
    console.error(`[AI] Enrichment FAILED for ${company.companyName}: ${err.message}`);
    if (rawText) {
      console.error(`[AI] Raw response (first 500 chars): ${rawText.slice(0, 500)}`);
      console.error(`[AI] Raw response (last 200 chars): ${rawText.slice(-200)}`);
    }
    return {
      intentScore: 0, intentReasoning: 'AI分析失败。',
      icpScore: 0,    icpReasoning:    'AI分析失败。',
      EMAIL_1_SUBJECT: '', EMAIL_1_BODY: '',
      EMAIL_2_SUBJECT: '', EMAIL_2_BODY: '',
      EMAIL_3_SUBJECT: '', EMAIL_3_BODY: '',
      EMAIL_4_SUBJECT: '', EMAIL_4_BODY: '',
      EMAIL_5_SUBJECT: '', EMAIL_5_BODY: '',
      usage: { input_tokens: 0, output_tokens: 0 },
    };
  }
}

async function preFilterLead(company) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `你是建材采购意向分析师。根据以下信息快速判断这家公司是否值得联系：
公司名：${company.companyName}
地址：${company.address}
Google评分：${company.googleRating}（${company.reviewCount}条评价）
官网：${company.website || '无'}

我们卖：门窗、橱柜、浴缸，找的是装修商、建筑商、开发商、零售商。

只返回JSON：{"level": "priority"|"recommend"|"skip", "reason": "一句话原因（中文，15字以内）"}`,
      }],
    }, { timeout: 10000 });

    const raw = response.content[0].text
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(raw);
    const level = ['priority', 'recommend', 'skip'].includes(parsed.level) ? parsed.level : 'recommend';
    console.log(`[Haiku] ${company.companyName} → ${level}: ${parsed.reason || ''}`);
    return {
      level,
      reason: parsed.reason || '',
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  } catch (err) {
    console.warn(`[Haiku] preFilter failed for ${company.companyName}: ${err.message}`);
    return { level: 'recommend', reason: '预分析失败', usage: { input_tokens: 0, output_tokens: 0 } };
  }
}

module.exports = { enrichLead, preFilterLead };
