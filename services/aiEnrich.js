require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 120000 });

// ── ICP Analysis (no email generation) ────────────────────────────────────────
// Returns: { intentScore, intentReasoning, icpScore, icpReasoning, usage }

const SYSTEM_PROMPT_ICP = `You are an expert B2B sales analyst helping a Chinese building materials manufacturer
identify overseas prospects most likely to (1) place serious imported building materials orders, AND (2) be open to visiting the manufacturer's factory in China. The PRIMARY conversion event is an in-person factory visit in Foshan, Guangdong. Score prospects based on how likely they are to seriously consider a factory visit and/or place an order.

╔══════════════════════════════════════════════════════════════════════════╗
║ CRITICAL SCORING RULES — these OVERRIDE every other rule in this prompt. ║
║ If any rule below conflicts with these, these win. Do not ignore them.   ║
╠══════════════════════════════════════════════════════════════════════════╣
║ 1. Any company that BUILDS HOMES (home builder, custom home builder,     ║
║    residential builder) = MINIMUM score 7/10 for BOTH icpScore AND       ║
║    intentScore. These companies buy windows and doors for EVERY project. ║
║                                                                          ║
║ 2. Company names containing: "Homes", "Home Builder", "Custom Homes",    ║
║    "Residential", "Construction", "Building", "Renovations",             ║
║    "Property Development" = HIGH VALUE. Never score below 6/10.          ║
║                                                                          ║
║ 3. The ONLY companies that should get 1-4/10 are: plumbers,              ║
║    electricians, landscapers, painters, cleaners, pest control,          ║
║    accounting firms, restaurants, medical clinics — companies that       ║
║    have NOTHING to do with building.                                     ║
║                                                                          ║
║ 4. STOP being overly strict. If a company builds, renovates, or          ║
║    develops residential properties, they NEED windows and doors.         ║
║    Score them HIGH.                                                      ║
║                                                                          ║
║ 5. Do NOT penalize a company for being "too small" or "not mentioning    ║
║    windows specifically". ALL builders need windows and doors.           ║
║                                                                          ║
║ 6. EXCEPTION to Rules 1-5: Companies that ONLY do sheds, garages,        ║
║    carports, roller doors, garage doors, steel structures, or patios     ║
║    are NOT target customers. They use steel/colorbond, NOT aluminium     ║
║    windows and doors. Score them 1-3/10.                                 ║
║    Key exclusion words: "shed", "sheds", "garage door", "roller door",   ║
║    "carport", "patio", "steel building", "colorbond", "BlueScope".       ║
║    If a company ONLY does these products, they are NOT a match even      ║
║    if they have "door" in their name.                                    ║
║    Logic: Builds HOMES with windows/doors → HIGH (7-10). Builds          ║
║    SHEDS with roller doors → LOW (1-3).                                  ║
║                                                                          ║
║ NOTE: The VOLUME-BUILDER anti-target classification below is             ║
║ SUPERSEDED by Rule 1 & 2 above. A company named "X Homes" that builds    ║
║ residential properties scores 7+, even if it shows volume-builder        ║
║ signals — they still need windows and doors for every house.             ║
╚══════════════════════════════════════════════════════════════════════════╝

Target prospect types (in order of factory-visit propensity, highest first):
- Distributors / wholesalers / importers — they typically already make China sourcing trips
- Interior designers / bespoke home builders / custom home builders — high-end custom projects need verified suppliers; designers travel for sourcing
- Building supply / kitchen / bathroom showrooms
- Mid-size contractors with multi-project pipelines (lower priority but not zero)

Always excluded: small renovation handymen, single-room renovators, individual home buyers, real estate agents, unrelated industries.

VOLUME-BUILDER classification — flag a prospect as a volume builder (anti-target, score 1-3) ONLY when MULTIPLE of the following appear together. A single weak signal is not enough.
- Multiple physical display home centres OR an explicit "display village"
- Prominently advertises "House & Land packages" as the primary offering on the home page
- National-chain volume-builder branding (e.g. "Australia's biggest builder", "20+ display homes nationwide") or one of the recognised AU volume brands: Metricon, McDonald Jones, Coral Homes, GJ Gardner, Carlisle Homes, Henley, Boutique Homes, Simonds, Stockland, Domain by Plantation, Clarendon
- Catalog-style website where "Browse our home designs" / dozens of pre-designed plans is clearly THE primary product (not a side service)
- Per-unit advertised pricing visible and clearly under $500k AUD
- Generic "starter home" / "first home buyer" / "affordable home" / "budget home" positioning

LUXURY / CUSTOM override — if ANY of these signals are present, classify as custom/luxury (target, score 7-9) and DO NOT flag as volume even if the site also offers pre-designed plans, drafting services, or small-lot designs:
- "Award winning", Master Builders Award, HIA Award, "Home of the Year", "Builder of the Year"
- "Luxury custom homes", "bespoke residences", explicit $2M+ project pricing, multi-million-dollar residences in portfolio
- "We limit our projects each year" or similar capacity-restriction language signalling scarcity / craftsmanship positioning
- Project portfolio dominated by premium suburb names (e.g. Brisbane: New Farm, Hawthorne, St Lucia, Paddington, Ascot, Hamilton, Bulimba, Teneriffe; Melbourne: Toorak, South Yarra, Brighton, Albert Park, Kew; Sydney: Mosman, Vaucluse, Double Bay, Bellevue Hill, Killara)
- Hamptons / French Provincial / Modern Coastal / heritage-restoration / architect-collaboration positioning

Mixed-service builders are STILL valid targets. A custom builder that also offers drafting, home design packages, or small-lot designs as secondary services does NOT become a volume builder. Score based on the PRIMARY positioning of the homepage and portfolio, not on the presence of secondary services.

Your job:
1. Score the prospect's buying intent based on their website content
2. Score how well this prospect matches the seller's Ideal Customer Profile (ICP)

JSON OUTPUT RULES — read carefully, they are the most common failure mode:
1. Respond with a single valid JSON object. No markdown code fences. No explanation outside the JSON.
2. When you need to quote an English phrase, product name, or website title inside a Chinese string value, you MUST use the Chinese full-width brackets 「 and 」 — NOT ASCII double quotes. Example:
   ❌ WRONG (breaks JSON parser):  "intentReasoning": "标题为"Luxury Home Builders"，定位高端..."
   ✅ RIGHT:                        "intentReasoning": "标题为「Luxury Home Builders」，定位高端..."
3. The ONLY ASCII double quotes (") in your output are the JSON syntax characters that wrap string values. Any " inside a string value MUST either be escaped as \\" or — preferably — replaced with 「 or 」.
4. Do not use smart/curly quotes (" " ' ') anywhere in the JSON syntax — only plain ASCII " around values.`;

async function analyzeICP(company, websiteContent, companyProfile = {}, icp = '', keepSignals = [], lowSignal = false, claimsLocalManufacturing = false, pageMetadata = {}) {
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
${claimsLocalManufacturing
  ? `
=== LOCAL-MANUFACTURING CLAIM (read carefully) ===
This company's website contains phrases like "Australian Made", "we manufacture", "our factory", or "locally manufactured". DO NOT treat this as automatic disqualification.

In the AU building-materials market, the large majority of companies marketing themselves as "Australian Made" or "we manufacture" are actually:
  (a) OEM importers with Chinese factory partners (importing finished goods, rebranding)
  (b) Light-assembly operations (importing components from China, assembling locally)
  (c) Marketing-positioning only (importing 100%, labeling as "Australian Made")

These are NOT competitors — they are sophisticated buyers who already understand factory sourcing and could be HIGH-value Lens prospects.

Differentiate using the rest of the website content:
- REAL COMPETITOR (score 1-3 on intent, 1-3 on icp): site has factory tour photos, named in-house production team page, specific machinery descriptions (extrusion, anodizing, powder-coat lines), stated factory area in m² with AU location, multi-decade in-house production history
- MARKETING-ONLY / IMPORTER (score normally, often 6-9): site reads as catalog + sales, no factory imagery, talks about "designed in Australia" rather than "manufactured", no production-team mentions, no machinery detail. This is a valid Lens target.

When evidence is mixed or unclear, lean toward IMPORTER (the more common case) and score on the intent/ICP merits of the rest of the site. Mention this distinction explicitly in intentReasoning.`
  : ''}

=== PROSPECT ===
Name: ${company.companyName}
Industry: ${company.industry || 'Unknown'}
Location: ${company.city}, ${company.state}
Phone: ${company.phone}
Google Rating: ${company.googleRating} (${company.reviewCount} reviews)
Website: ${company.website}

=== PAGE METADATA (treat as authoritative positioning) ===
The page's <title> and <meta description> are the company's own self-branding —
they reflect the positioning the business wants to project. Weight these
strongly when scoring. A title containing "Luxury Home Builders" or "Bespoke
Residences" is a direct positioning claim, not incidental copy.
${pageMetadata.title         ? `PAGE TITLE: ${pageMetadata.title}`               : 'PAGE TITLE: (not available)'}
${pageMetadata.description   ? `META DESCRIPTION: ${pageMetadata.description}`   : 'META DESCRIPTION: (not available)'}
${pageMetadata.ogTitle       ? `OG TITLE: ${pageMetadata.ogTitle}`               : ''}
${pageMetadata.ogDescription ? `OG DESCRIPTION: ${pageMetadata.ogDescription}`   : ''}

=== PAGE CONTENT ===
${websiteContent || 'No website content available.'}

=== SCORING RULES (read carefully) ===
1. If a company has multiple business divisions and ANY division involves residential construction, custom homes, luxury homes, or renovation — score based on that division, not the overall company.
2. Companies that build luxury homes, custom homes, or high-end residential projects are IDEAL customers (score 8-10) because they need premium windows and doors.
3. Do NOT penalize a company for also having commercial, security, or unrelated divisions. Focus on whether they build or renovate homes.
4. home builder, custom home builder, residential builder, renovation contractor, property developer — these are all HIGH VALUE targets, not low value.

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

JSON RULES (apply to every string value):
- 用 「」 包裹中文 reasoning 里的英文引述，绝对不要用半角双引号。例如：标题为「Custom Home Builders」、官网标榜「award-winning」。
- 字符串值里出现的任何半角 " 都会破坏 JSON 解析。改用 「」 是最安全的做法。
- Return ONLY the JSON object. No markdown fences. No prose before or after.`;

  let rawText = '';
  let totalIn = 0, totalOut = 0;
  const strip = s => s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  // Last-ditch JSON repair: Sonnet sometimes embeds unescaped ASCII double
  // quotes inside Chinese reasoning strings:
  //   "intentReasoning": "标注"Custom Home Builders Melbourne"，定位高端…"
  //
  // A structural JSON quote can only have one of [whitespace , : { } [ ]] (or
  // a backslash for an escape) as its neighbour. Any " whose neighbour on
  // BOTH sides is something other than those chars must be an interior quote
  // and needs escaping. Backslash in the lookbehind preserves any quotes
  // Sonnet has already escaped correctly.
  //
  // Walking the failing example "Melbourne"， — preceded by `e`, followed by
  // `，` (U+FF0C fullwidth comma, NOT ASCII) — that " gets escaped here even
  // though both narrower patterns (alphanumeric-on-both-sides) would miss it.
  const repairInteriorQuotes = (s) => s.replace(/(?<=[^\s,:{[\\])"(?=[^\s,:}\]])/g, '\\"');

  // Trace exactly what reaches Sonnet — length of website content,
  // title from page metadata, and the head of the prompt. Lets us confirm
  // the Firecrawl-→-Sonnet chain on every call rather than guessing from
  // canned fallback text.
  console.log(`[analyzeICP] Sending to Sonnet — websiteContent length: ${(websiteContent || '').length} | pageTitle="${(pageMetadata.title || '').slice(0, 80)}" | userPrompt chars: ${userPrompt.length}`);

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

      // Step A: try the cheap local repair first — no extra API call.
      // Catches the dominant failure mode (unescaped " inside Chinese reasoning).
      try {
        result = JSON.parse(repairInteriorQuotes(strip(rawText)));
        console.log(`[AI] ${company.companyName}: local quote-repair succeeded — no retry needed`);
      } catch (repairErr) {
        // Step B: ask Sonnet to fix it, with explicit instructions on the
        // exact failure mode. The previous retry prompt was too vague —
        // it failed identically because Sonnet had the same blindspot.
        console.log(`[AI] Local repair failed (${repairErr.message}) — retrying via Sonnet for ${company.companyName}…`);
        const retryResp = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `The JSON below has unescaped ASCII double quotes inside string values, which breaks JSON.parse. Fix it by replacing every interior " (a " that is NOT the start or end of a JSON string value) with the Chinese full-width bracket 「 or 」. The outer JSON syntax quotes around keys and values must stay as ASCII ". Return ONLY the corrected JSON object — no markdown, no commentary.\n\nBROKEN JSON:\n${rawText}`,
          }],
        });
        totalIn  += retryResp.usage.input_tokens;
        totalOut += retryResp.usage.output_tokens;
        const retryRaw = retryResp.content[0].text;
        try {
          result = JSON.parse(strip(retryRaw));
        } catch (retry1Err) {
          // Step C: apply local repair to Sonnet's retry output too — covers
          // the case where Sonnet still slips a quote through.
          result = JSON.parse(repairInteriorQuotes(strip(retryRaw)));
          console.log(`[AI] ${company.companyName}: parsed after Sonnet retry + local repair`);
        }
      }
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
    // Surface enough detail to distinguish auth vs rate-limit vs network vs
    // parse-retry failures. The Anthropic SDK exposes .status / .name on its
    // error objects; printing the stack head catches anything else.
    console.error(
      `[AI] ICP analysis FAILED for ${company.companyName}: ` +
      `name=${err.name || 'Error'} status=${err.status ?? 'n/a'} message="${err.message}"`
    );
    if (err.stack) console.error(`[AI] Stack (head): ${err.stack.split('\n').slice(0, 4).join(' | ')}`);
    if (rawText)   console.error(`[AI] Raw (first 300): ${rawText.slice(0, 300)}`);
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
7. BANNED PHRASES — these trigger spam filters, NEVER use them in any email under any framework:
'no sales', 'no commitment', 'no obligation', 'no contract', 'no risk', 'no strings', 'no catch', 'no pitch', 'completely free', '100% free', 'risk free', 'guarantee', 'act now', 'limited time', 'don't miss', 'exclusive offer', 'winner', 'congratulations'.
USE INSTEAD: 'see if it makes sense', 'whenever it works for you', 'just for your reference', 'happy to share more', 'we stand behind our work', 'totally understand if the timing isn't right'.

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
async function preFilterLead(company, companyProfile = {}) {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `你是建材采购意向初筛师。我们是${companyProfile.companyName}，主要产品：${companyProfile.products}，优势：${companyProfile.advantages}，目标客户：${companyProfile.icp || '海外建材采购商、建筑商、设计师、经销商'}。理想客户是有可能未来 6-12 个月内来中国采购或访问工厂的买家。

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
名字含 "home builder / custom home builder / residential builder"——recommend（住宅建筑商，长期采购建材）。
名字含 "renovation contractor / remodeling"——recommend（装修承包商，项目采购）。
名字含 "property developer / land developer"——recommend（房产开发商，规模采购）。
名字含 "construction company / building company"——recommend（建筑/施工公司，持续项目）。

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

// ── Map a search-query string to one of the existing email-template keys ─────
// Used by auto-mode to pick a customer-type angle without UI input. The
// returned key must match a key in services/emailTemplates.js exactly — those
// keys are Chinese strings, not snake_case English. Order matters: more-
// specific patterns first.
//
// Industry-specific buyers (hotel/supermarket/furniture) come first because
// queries like "hotel renovation procurement" would otherwise be misrouted
// to the generic renovation-contractor key.
//
// "custom / luxury / bespoke / builder / homes" maps to 装修承包商 (not
// 房产开发商) because boutique custom builders doing $2M+ residences buy on
// a per-project basis with custom sizes and multi-category bundles — that's
// exactly what the 装修承包商 template's pain points + value prop are
// written for (定制尺寸3周交货, 多品类一站式采购, 灵活小批量). 房产开发商
// is angled at high-volume production builders (Metricon-scale, 100+ units)
// and would mis-frame the cold-email pitch for this customer.
const _TEMPLATE_KEY_MAP = [
  { match: /\bhotel\b/i,                                                key: '酒店装修采购' },
  { match: /\b(supermarket|hypermarket)\b/i,                            key: '超市建材采购' },
  { match: /\bfurniture\b/i,                                            key: '家具制造商'  },
  { match: /\b(interior|designer|design\s*studio)\b/i,                  key: '室内设计师'  },
  { match: /\b(distributor|wholesale|wholesaler|importer|supplies)\b/i, key: '建材经销商'  },
  { match: /\bshowroom\b/i,                                             key: '建材经销商'  },
  { match: /\b(property\s*developer|land\s*developer)\b/i,              key: '房产开发商'  },
  { match: /\b(engineering|construction\s*contractor|general\s*contractor)\b/i, key: '工程承包商' },
  { match: /\b(renovation|renovator|renos?)\b/i,                        key: '装修承包商'  },
  { match: /\b(custom|luxury|bespoke|builder|homes)\b/i,                key: '装修承包商'  },
];

function templateKeyFromQuery(query) {
  const q = (query || '').toString();
  for (const { match, key } of _TEMPLATE_KEY_MAP) {
    if (match.test(q)) return key;
  }
  return '装修承包商';
}

// ── ICP generator (used by /api/generate-icp) ────────────────────────────────
// Takes the new-user wizard answers + seller context and returns a Chinese-language
// ICP description suitable for dropping into the existing icpInput textarea.
async function generateIcp(inputs = {}) {
  const {
    industries = [], companySize = '', painPoints = '', exclusions = '',
    sellerName = '', products = '', advantage = '', country = '', keyword = '',
  } = inputs;

  const userPrompt = `我的公司：${sellerName || '(未填写)'}
我的产品：${products || '(未填写)'}
我的优势：${advantage || '(未填写)'}
目标国家：${country || '(未指定)'}
搜索关键词：${keyword || '(未指定)'}
目标行业：${Array.isArray(industries) && industries.length ? industries.join('、') : '(未选)'}
目标规模：${companySize || '(未选)'}
我的产品解决的问题：${painPoints || '(未填写)'}
排除的客户：${exclusions || '(未填写)'}

请生成一段详细的客户筛选标准（ICP），包括：
1. 目标客户的具体特征
2. 在他们官网上应该寻找什么信号
3. 明确的排除标准
用中文回答，200字以内。`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: "You are an ICP (Ideal Customer Profile) expert. Generate a detailed customer filtering criteria in Chinese based on the user's inputs. Be specific and actionable. Include: target industries, company characteristics, signals to look for on their website, and explicit exclusion criteria.",
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = (response.content || [])
    .filter(b => b && b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  return {
    icp: text,
    usage: {
      input_tokens:  response.usage?.input_tokens  || 0,
      output_tokens: response.usage?.output_tokens || 0,
    },
  };
}

module.exports = { analyzeICP, generateEmails, preFilterLead, templateKeyFromQuery, generateIcp };
