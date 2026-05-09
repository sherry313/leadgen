require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120000 });

// ── ICP Analysis (no email generation) ────────────────────────────────────────
// Returns: { intentScore, intentReasoning, icpScore, icpReasoning, usage }

const SYSTEM_PROMPT_ICP = `You are an expert B2B sales analyst helping a Chinese building materials manufacturer
identify ideal prospects among Australian buyers (builders, developers, renovators, contractors, importers, wholesalers, distributors).

Your job:
1. Score the prospect's buying intent based on their website content
2. Score how well this prospect matches the seller's Ideal Customer Profile (ICP)

Always respond with valid JSON only — no markdown code fences, no explanation outside the JSON.`;

async function analyzeICP(company, websiteContent, companyProfile = {}, icp = '', keepSignals = [], lowSignal = false) {
  console.log(`[AI] Analyzing ICP: ${company.companyName}`);

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
- 1-2:  Completely wrong type of customer`
    : `=== IDEAL CUSTOMER PROFILE (ICP) ===
No ICP specified. Set icpScore to 7 and icpReasoning to "未设置ICP筛选条件。" for all leads.`;

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

Return only valid JSON. No markdown, no extra text.`;

  let rawText = '';
  let totalIn = 0, totalOut = 0;
  const strip = s => s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT_ICP,
      messages: [{ role: 'user', content: userPrompt }],
    });

    totalIn  = response.usage.input_tokens;
    totalOut = response.usage.output_tokens;
    rawText  = response.content[0].text;
    console.log(`[AI] ${company.companyName}: tokens=${totalIn}in/${totalOut}out`);

    let result;
    try {
      result = JSON.parse(strip(rawText));
    } catch (parseErr) {
      console.error(`[AI] ICP JSON parse failed for ${company.companyName}: ${parseErr.message}`);
      console.error(`[AI] Raw (first 300): ${rawText.slice(0, 300)}`);
      console.log(`[AI] Retrying JSON reformat for ${company.companyName}…`);
      const retryResp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `Your previous response was not valid JSON. Re-output the same content as strict valid JSON only — no markdown fences, no extra text.\n\nPrevious response:\n${rawText}`,
        }],
      });
      totalIn  += retryResp.usage.input_tokens;
      totalOut += retryResp.usage.output_tokens;
      result = JSON.parse(strip(retryResp.content[0].text));
    }

    console.log(`[AI] ${company.companyName}: intent=${result.intentScore}/10  icp=${result.icpScore}/10`);

    await new Promise(r => setTimeout(r, 300));

    return {
      intentScore:     result.intentScore     ?? null,
      intentReasoning: result.intentReasoning || '',
      icpScore:        result.icpScore        ?? null,
      icpReasoning:    result.icpReasoning    || '',
      usage: { input_tokens: totalIn, output_tokens: totalOut },
    };
  } catch (err) {
    console.error(`[AI] ICP analysis FAILED for ${company.companyName}: ${err.message}`);
    if (rawText) console.error(`[AI] Raw (first 300): ${rawText.slice(0, 300)}`);
    return {
      intentScore: null, intentReasoning: 'AI 分析失败，请重试。',
      icpScore:    null, icpReasoning:    'AI 分析失败，请重试。',
      usage: { input_tokens: totalIn, output_tokens: totalOut },
      aiFailed: true,
    };
  }
}

// ── Email generation using a chosen customer-type angle + writing framework ────
// Returns: { EMAIL_1_SUBJECT, EMAIL_1_BODY, ..., EMAIL_5_SUBJECT, EMAIL_5_BODY, usage }

function _buildEmailSystemPrompt(frameworkInstructions) {
  return `You are an expert B2B cold email copywriter for Lens, a Chinese building materials manufacturer (aluminium/uPVC windows & doors, custom kitchen cabinetry, freestanding & built-in bathtubs) targeting Australian businesses.

Write a 5-email cold outreach sequence following this framework:

${frameworkInstructions}

SUBJECT LINE IRON RULES (apply to ALL frameworks):
1. The Snippet: the first few words must create curiosity — make the reader want to open
2. The Experiment: you may use emoji or write "[No Subject]" if it feels right
3. Casual: NEVER capitalise every word. ✅ "can you spare 5 minutes?" ❌ "Can You Spare 5 Minutes?"
4. Length: 3-7 words. Hyper-specific — NEVER use "Quick question", "Following up", "Touching base", "Partnership opportunity"
5. All 5 subject lines must feel different from each other

BODY IRON RULES:
1. Each email body: UNDER 100 words (body only, not counting sign-off)
2. Write like a real person who researched the company, not a marketing template
3. Reference specific details from the prospect's website
4. Reference specific Australian cities, company names, or numbers
5. Sign every email with "— Lens"
6. Use {first_name} as salutation placeholder; {company} and {website} where natural

Return ONLY valid JSON. All string values must escape internal double quotes with a backslash (\\"). No markdown code fences. No extra text before or after the JSON object.`;
}

async function generateEmails(lead, templateKey, websiteContent, frameworkKey, customFrameworkData) {
  const templates   = require('./emailTemplates');
  const frameworks  = require('./emailFrameworks');
  const template    = templates[templateKey];
  if (!template) throw new Error(`Unknown template key: ${templateKey}`);

  // Resolve framework instructions
  let frameworkInstructions;
  const resolvedKey = frameworkKey || 'cold_5_step';

  if (resolvedKey === 'custom' && customFrameworkData) {
    const cf = customFrameworkData;
    frameworkInstructions = `SEQUENCE STRUCTURE — ${cf.name || 'Custom Framework'}:
${cf.structure || ''}
${cf.rules ? `\nWriting requirements: ${cf.rules}` : ''}
${cf.sample ? `\nStyle example to emulate:\n${cf.sample}` : ''}

Generate 5 emails on Days 1, 4, 7, 10, 14 following the structure above.`;
  } else {
    const fw = frameworks[resolvedKey] || frameworks['cold_5_step'];
    frameworkInstructions = `SEQUENCE STRUCTURE — ${fw.en_name} (${fw.description}):
${fw.sequence_prompt || ''}`;
  }

  console.log(`[AI] Generating emails for ${lead.companyName} | angle="${templateKey}" | framework="${resolvedKey}"`);

  const cfg = template.angle_config || {};

  const userPrompt = `Write 5 personalized cold emails for this Australian prospect. Be creative — vary your hook angle, the specific pain point you address, the case study you cite, and the objection you handle. Don't default to the obvious first option.

=== SELLER ===
Company: Lens
Products: aluminium/uPVC windows & doors, custom kitchen cabinetry, freestanding & built-in bathtubs
Advantage: factory-direct pricing, custom sizing, 3-4 week lead times, low MOQ

=== CUSTOMER TYPE: ${template.en_label} (${templateKey}) ===
Pain points: ${cfg.pain_point || ''}
Our value for this type: ${cfg.value_prop || ''}

Hook angle options — choose the most relevant ONE for THIS specific company (don't always use option 1):
${(cfg.hook_angles || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}

Social proof angles — pick ONE and adapt it (specific numbers, AU location):
${(cfg.proof_angles || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}

Common objections — handle ONE in the objection-handling email:
${(cfg.common_objections || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}

=== THIS SPECIFIC PROSPECT ===
Company: ${lead.companyName}
Industry: ${lead.industry || 'Unknown'}
Location: ${[lead.city, lead.state].filter(Boolean).join(', ')}, Australia
Website: ${lead.website || ''}
Google Rating: ${lead.googleRating || ''} (${lead.reviewCount || ''} reviews)
ICP analysis: ${lead.icpReasoning || ''}
Intent analysis: ${lead.intentReasoning || ''}

Website content (reference specific details from this):
${websiteContent || 'No website content available.'}

=== OUTPUT ===
Return this exact JSON structure with no extra text:
{
  "EMAIL_1_SUBJECT": "...",
  "EMAIL_1_BODY": "...",
  "EMAIL_2_SUBJECT": "...",
  "EMAIL_2_BODY": "...",
  "EMAIL_3_SUBJECT": "...",
  "EMAIL_3_BODY": "...",
  "EMAIL_4_SUBJECT": "...",
  "EMAIL_4_BODY": "...",
  "EMAIL_5_SUBJECT": "...",
  "EMAIL_5_BODY": "..."
}

Follow the framework structure above strictly for all 5 emails. Each body under 100 words. Return ONLY valid JSON. All string values must escape internal double quotes with a backslash (\\"). No markdown code fences. No extra text before or after the JSON object.`;

  let rawText = '';
  let totalIn = 0, totalOut = 0;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: _buildEmailSystemPrompt(frameworkInstructions),
      messages: [{ role: 'user', content: userPrompt }],
    });

    totalIn  = response.usage.input_tokens;
    totalOut = response.usage.output_tokens;
    rawText  = response.content[0].text;
    console.log(`[AI] ${lead.companyName} emails: tokens=${totalIn}in/${totalOut}out`);

    const strip = (s) => s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let result;
    try {
      result = JSON.parse(strip(rawText));
    } catch (parseErr) {
      // First parse failed — log the full response and attempt one reformat retry
      console.error(`[AI] JSON parse failed for ${lead.companyName}: ${parseErr.message}`);
      console.error(`[AI] Full raw response:\n${rawText}`);
      console.log(`[AI] Retrying JSON reformat for ${lead.companyName}...`);

      const retryResp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `The previous response had invalid JSON syntax — please re-output the same content as strict valid JSON, escape all internal double quotes with backslash (\\"), no markdown fences, no extra text.\n\nPrevious response:\n${rawText}`,
        }],
      });

      totalIn  += retryResp.usage.input_tokens;
      totalOut += retryResp.usage.output_tokens;
      const retryRaw = retryResp.content[0].text;

      try {
        result = JSON.parse(strip(retryRaw));
        console.log(`[AI] ${lead.companyName}: JSON reformat retry succeeded`);
      } catch (retryErr) {
        console.error(`[AI] JSON reformat retry also failed for ${lead.companyName}: ${retryErr.message}`);
        return {
          EMAIL_1_SUBJECT: '', EMAIL_1_BODY: '',
          EMAIL_2_SUBJECT: '', EMAIL_2_BODY: '',
          EMAIL_3_SUBJECT: '', EMAIL_3_BODY: '',
          EMAIL_4_SUBJECT: '', EMAIL_4_BODY: '',
          EMAIL_5_SUBJECT: '', EMAIL_5_BODY: '',
          usage: { input_tokens: totalIn, output_tokens: totalOut },
          error: `JSON parse failed after retry: ${retryErr.message}`,
        };
      }
    }

    console.log(`[AI] ${lead.companyName}: email1="${String(result.EMAIL_1_SUBJECT || '').slice(0, 60)}"`);

    await new Promise(r => setTimeout(r, 300));

    return {
      EMAIL_1_SUBJECT: result.EMAIL_1_SUBJECT || '',  EMAIL_1_BODY: result.EMAIL_1_BODY || '',
      EMAIL_2_SUBJECT: result.EMAIL_2_SUBJECT || '',  EMAIL_2_BODY: result.EMAIL_2_BODY || '',
      EMAIL_3_SUBJECT: result.EMAIL_3_SUBJECT || '',  EMAIL_3_BODY: result.EMAIL_3_BODY || '',
      EMAIL_4_SUBJECT: result.EMAIL_4_SUBJECT || '',  EMAIL_4_BODY: result.EMAIL_4_BODY || '',
      EMAIL_5_SUBJECT: result.EMAIL_5_SUBJECT || '',  EMAIL_5_BODY: result.EMAIL_5_BODY || '',
      usage: { input_tokens: totalIn, output_tokens: totalOut },
    };
  } catch (err) {
    console.error(`[AI] Email gen FAILED for ${lead.companyName}: ${err.message}`);
    if (rawText) console.error(`[AI] Full raw response:\n${rawText}`);
    return {
      EMAIL_1_SUBJECT: '', EMAIL_1_BODY: '',
      EMAIL_2_SUBJECT: '', EMAIL_2_BODY: '',
      EMAIL_3_SUBJECT: '', EMAIL_3_BODY: '',
      EMAIL_4_SUBJECT: '', EMAIL_4_BODY: '',
      EMAIL_5_SUBJECT: '', EMAIL_5_BODY: '',
      usage: { input_tokens: totalIn, output_tokens: totalOut },
    };
  }
}

// ── Haiku pre-filter (unchanged) ───────────────────────────────────────────────
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

module.exports = { analyzeICP, generateEmails, preFilterLead };
