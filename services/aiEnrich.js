require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120000 });

// ── ICP Analysis (no email generation) ────────────────────────────────────────
// Returns: { intentScore, intentReasoning, icpScore, icpReasoning, usage }

const SYSTEM_PROMPT_ICP = `You are an expert B2B sales analyst helping a Chinese building materials manufacturer
identify overseas prospects most likely to (1) place serious imported building materials orders, AND (2) be open to visiting the manufacturer's factory in China. The PRIMARY conversion event is an in-person factory visit in Foshan, Guangdong. Score prospects based on how likely they are to seriously consider a factory visit and/or place an order.
Target prospect types (in order of factory-visit propensity, highest first):
- Distributors / wholesalers / importers — they typically already make China sourcing trips
- Interior designers / bespoke home builders / custom home builders — high-end custom projects need verified suppliers; designers travel for sourcing
- Building supply / kitchen / bathroom showrooms
- Mid-size contractors with multi-project pipelines (lower priority but not zero)

Excluded: small renovation handymen, single-room renovators, individual home buyers, real estate agents, unrelated industries; volume builders (House & Land packages, display home networks, catalog-style pre-designed plans, per-unit price under $1M AUD); national-chain home builders; project home companies.

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
Seller's stated unique advantage: ${advantage}
Conversion goal: This seller's strongest closing mechanism is an in-person factory visit. Score the prospect based on (a) likelihood of placing an imported building materials order, and (b) plausibility that the prospect would consider a factory visit within 6-12 months given their scale, sourcing patterns, and industry position.

${icpSection}

=== BUYER SIGNAL ANALYSIS ===
${lowSignal
  ? 'NOTE: No buyer/distributor keywords were detected on this company\'s website. Apply a penalty of up to 1 point, only if the website\'s visual / branding evidence is also weak; do not penalize photo-driven sites with strong project portfolios.'
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

- intentScore: integer 1-10 — likelihood of becoming a serious customer AND being open to a factory visit
  10: established distributor/importer with multi-supplier sourcing patterns
  8-9: warehouse-style supplier OR luxury custom home builder OR established interior designer with current high-end projects
  6-7: mid-size builder with custom/luxury positioning, multiple ongoing residential/commercial projects
  4-5: contractor with some custom-project signals but unclear sourcing scale
  1-3: small handyman / single-room renovator / unrelated industry / no signals of import activity
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
      intentScore:     result.intentScore     ?? 3,
      intentReasoning: result.intentReasoning?.trim() || '分析信息有限，意向判断保守',
      icpScore:        result.icpScore        ?? 3,
      icpReasoning:    result.icpReasoning?.trim()    || '分析信息有限，匹配度判断保守',
      usage: { input_tokens: totalIn, output_tokens: totalOut },
    };
  } catch (err) {
    console.error(`[AI] ICP analysis FAILED for ${company.companyName}: ${err.message}`);
    if (rawText) console.error(`[AI] Raw (first 300): ${rawText.slice(0, 300)}`);
    return {
      intentScore: 3, intentReasoning: '官网信息不完整，难以判断采购意向',
      icpScore:    3, icpReasoning:    '官网内容不足，不能充分评估匹配度',
      usage: { input_tokens: totalIn, output_tokens: totalOut },
      aiFailed: true,
    };
  }
}

// ── Email generation using a chosen customer-type angle + writing framework ────
// Returns: { EMAIL_1_SUBJECT, EMAIL_1_BODY, ..., EMAIL_5_SUBJECT, EMAIL_5_BODY, usage }

function _buildEmailSystemPrompt(frameworkInstructions, sellerProfile = {}) {
  const name = sellerProfile.sellerName || 'your company';
  return `You are an expert B2B cold email copywriter for ${name}, a Chinese building materials manufacturer targeting Australian businesses.

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
5. Sign every email with "— ${name}"
6. Use {first_name} as salutation placeholder; {company} and {website} where natural

Return ONLY valid JSON. All string values must escape internal double quotes with a backslash (\\"). No markdown code fences. No extra text before or after the JSON object.`;
}

async function generateEmails(lead, templateKey, websiteContent, frameworkKey, customFrameworkData, sellerProfile = {}) {
  const templates   = require('./emailTemplates');
  const frameworks  = require('./emailFrameworks');
  const template    = templates[templateKey] || templates[frameworkKey] || Object.values(templates)[0];
  if (!template) throw new Error(`No templates available`);

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

  const sellerName     = sellerProfile.sellerName || 'your company';
  const sellerProducts = sellerProfile.products   || '';
  const sellerAdvantage= sellerProfile.advantage  || '';

  const userPrompt = `Write 5 personalized cold emails for this Australian prospect. Be creative — vary your hook angle, the specific pain point you address, the case study you cite, and the objection you handle. Don't default to the obvious first option.

=== SELLER ===
Company: ${sellerName}
Products: ${sellerProducts}
Advantage: ${sellerAdvantage}

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
      system: _buildEmailSystemPrompt(frameworkInstructions, sellerProfile),
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

// ── Haiku pre-filter ──────────────────────────────────────────────────────────
async function preFilterLead(company) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `你是建材采购意向初筛师。我们卖门窗、橱柜、浴缸,工厂在中国佛山,目标客户是:海外建材经销商/批发商/进口商、室内设计师、高端定制住宅建筑商、有持续项目的中端建筑商。理想客户是有可能未来 6-12 个月内来中国采购或访问工厂的买家。

公司名:${company.companyName}
地址:${company.address}
Google评分:${company.googleRating}(${company.reviewCount}条评价)
官网:${company.website || '无'}

你的任务:判断这家公司是否可能成为我们的采购客户(经销商/设计师/定制建筑商),还是只是个本地装修施工队。

⚠️ 关键判断标准:看公司名暗示的【业务模式】,不是看名字里有没有"建材"关键词。

装修施工队 = skip(他们做翻新工程、不会大量采购也不会来工厂)
建材经销商/设计师/定制建筑商 = recommend(他们采购建材或推荐建材给客户)

【示例】
✅ recommend:
"Luxe Interior Design Studio" → 室内设计公司,会推荐建材给客户
"Door & Window Warehouse" → 建材批发商
"Premier Custom Homes" → 定制别墅建筑商,采购量大
"Sydney Joinery & Cabinetry" → 橱柜制造商/经销商
"Bathroom Showroom Melbourne" → 卫浴展厅经销商
"Luxury Bespoke Homes" → 高端定制建筑商

❌ skip:
"Bathroom Renovations Sydney" → 装修施工队,做翻新不采购
"Kitchen Renovations Melbourne" → 装修施工队,做翻新不采购
"Sydney Bathroom Renos" → 装修施工队,做翻新不采购
"Mike's Handyman Services" → 个体手艺人
"Brisbane Reno Specialists" → 装修施工队
"John's Home Repairs" → 个体维修
"Sunshine Coast Plumbing" → 水电工不采购建材
"ABC Catering" → 不相关行业
"Joe's Painting Services" → 单一服务、不采购建材

【skip 规则要点】
名字含 "Repairs / Handyman / Plumbing / Electrician / Maintenance" 关键词——一律 skip（这些是手艺人/维修工，不采购建材）。
名字含 "Renovations / Renos / Reno" 但 **不包含** 规模词（Group / Pty Ltd / Construction / Custom / Luxury / Premier / Bespoke / Homes）——skip（纯翻新施工队）。
名字含 "Renovations / Renos / Reno" **且**包含上述规模词之一——recommend（可能是高端翻新公司，让 Sonnet 评分）。例：
  ✅ "Melbourne Luxury Renovations Group" → recommend（含 Luxury + Group）
  ✅ "Premier Renovations Pty Ltd" → recommend（含 Premier + Pty Ltd）
  ❌ "Bathroom Renovations Sydney" → skip（无规模词）
  ❌ "Mike's Renovations" → skip（个体手艺人）
任何名字含餐饮/美容/医疗/汽车/服装/酒店/超市/咨询/会计/法律/教育/金融/园艺/泳池/清洁/太阳能等非建材主业的——skip。
评论数 ≤ 1 且无官网的——skip。

【recommend 规则要点】
名字暗示其是经销商/设计师/批发/展厅/定制建筑商/橱柜制造商/joinery/建材供应——recommend。
名字明确专注于"design / interior / showroom / supplies / warehouse / wholesale / joinery / cabinetry / bespoke / luxury / custom homes / building products"——recommend。

只返回JSON:{"level": "recommend"|"skip", "reason": "一句话原因(中文,15字以内)"}`,
      }],
    }, { timeout: 10000 });

    const raw = response.content[0].text
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(raw);
    const level = ['recommend', 'skip'].includes(parsed.level) ? parsed.level : 'recommend';
    console.log(`[Haiku] ${company.companyName} → ${level}: ${parsed.reason || ''}`);
    return {
      level,
      reason: parsed.reason || '',
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  } catch (err) {
    console.warn(`[Haiku] preFilter failed for ${company.companyName}: ${err.message}`);
    return { level: 'recommend', reason: '保留到下一阶段评分', aiFailed: true, usage: { input_tokens: 0, output_tokens: 0 } };
  }
}

module.exports = { analyzeICP, generateEmails, preFilterLead };
