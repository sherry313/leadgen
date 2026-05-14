module.exports = {

  'peter_kang_3part': {
    key: 'peter_kang_3part',
    name: 'Peter Kang 三段式框架',
    en_name: 'Peter Kang 3-Part Framework',
    source: 'Peter Kang 高转化冷邮件框架',
    description: 'Personalization → Identity → Offer',
    structure: [
      { stage: 'Personalization', purpose: '引用对方可验证的具体细节，展示你真的研究过他们' },
      { stage: 'Identity',        purpose: '用具体数字建立信任（工厂规模、产品、合作案例）' },
      { stage: 'Offer',           purpose: '低门槛零承诺邀请，目标是工厂参观而非卖货' },
    ],
    best_for: '高价值 B2B 客户、邀请来工厂参观、100 字精准触达',
    icon: '🎯',
    sample_subject: 'factory visit in foshan',
    sample_email_body: `Peter Kang 3-Part Framework example:

Subject: factory visit in foshan (no commitment)

Hi team,

i saw [Company Name]'s recent [specific project] in [suburb] — the [specific detail] caught my eye.

we run a 300,000m² factory in foshan making aluminium windows, custom cabinetry, and bathroom fixtures. a canadian distributor's been with us 3 years, $1-2M USD annually. last quarter alone: 6 containers, windows + bathroom + cabinetry, one shipment.

if you'd ever want to verify a chinese factory before placing an order, reply "video" and i'll send our 5-min walkthrough. no calls, no pitch.

Lucy Yang, Lens Foshan

---
Part 1 = Personalization (specific project + suburb detail — shows you looked them up)
Part 2 = Identity (factory size + product mix + named social proof with real numbers)
Part 3 = Offer (low-friction reply hook — factory visit goal, not a sales call)`,
    sequence_prompt: `Each email uses Peter Kang's 3-part structure: Personalization → Identity → Offer. Total length: 80-120 words MAX. Casual tone, lowercase preferred. NO "Dear" / "Hope this finds you well" / formal openings. Do NOT start with "Hi {first_name}" — use "Hi team" or dive straight in.

PART 1 — PERSONALIZATION (1-2 sentences, ~15 words): Reference a specific, verifiable detail from the prospect's website, recent projects, or industry positioning. Show you actually looked them up. Use specific project names, suburbs, design styles when possible. Do NOT use generic compliments.

PART 2 — IDENTITY (2-3 sentences, ~30-40 words): Establish credibility with concrete specifics. Include: factory size ("300,000m² factory in Foshan"), products relevant to this prospect (aluminium windows, custom cabinetry, bathroom fixtures), and one social proof with real numbers ("A Canadian distributor we work with does $1-2M USD annually"). No fluffy claims. Specific numbers, specific countries, specific products.

PART 3 — OFFER (1-2 sentences, ~30-40 words): A low-friction, zero-commitment ask. The PRIMARY GOAL is to invite the prospect to a half-day factory visit in Foshan — not to sell product.

Email-specific CTA hooks (one per email — never multiple CTAs):
Email 1: reply 'video' and I'll send our 5-min factory walkthrough
Email 2: reply 'canada' and I'll share how a Canadian distributor structured their first order
Email 3: if you're sourcing in China next 6 months, reply 'visit' and I'll send a half-day Foshan factory briefing
Email 4: List 3 objections ("we have a supplier" / "not the right time" / "send pricing first"), ask "which one's you?"
Email 5: Breakup — "reply 'open' anytime in next 12 months, otherwise good luck"

SUBJECT LINE RULES: lowercase, max 6 words, no emojis. Examples by email: "factory visit in foshan" / "the canada deal" / "your next china sourcing trip" / "which objection is yours?" / "closing the file".
CRITICAL: No links in Email 1-3 (deliverability). Sound like a human writing to one specific person, not a template. No "I hope this email finds you well", no "Quick question", no "Following up".

=== STRICT FACT DISCIPLINE ===
ONLY use these VERIFIED facts about the seller (Lens):
- 300,000m² factory in Foshan, Guangdong, China
- Products: aluminium windows, doors, bathroom fixtures, custom cabinetry, whole-house custom
- A Canadian distributor has been with us for 3 years (working relationship duration)
- Canadian distributor annual revenue with us: $1-2M USD (broad range, not exact)

DO NOT INVENT OR FABRICATE:
- Specific case study details with named locations ("a Sydney developer", "a Melbourne builder doing $2M+ homes") — Lens has NOT confirmed these
- Cost savings percentages ("17%", "20-30%", "saved them X%") — never make up numbers
- Client counts ("23 Australian builders", "across 45 projects") — we don't have this data
- Time-based performance claims ("18 months zero delays", "no missed deadlines") — unverified
- Local Australian inventory ("we hold AU stock", "local warehouse") — Lens does NOT have AU warehouses
- Specific product features not in the verified product list ("timber-look frames", "pivot doors", "oversized glazing 'units'") unless user explicitly listed them as products

=== NO GUARANTEE LANGUAGE — STRICT ===
NEVER use the following words or any equivalent:
- "guarantee" / "guaranteed"
- "lifetime guarantee" / "lifetime structural guarantee"
- "zero delays" / "zero defects" / "100% on time"
- "promise" / "we promise"
- "warranty" (unless user explicitly mentions one)
- "always" / "never" in performance claims

REPHRASE PROMISES AS PROBABILITIES OR EXPERIENCE:
- WRONG: "we guarantee 4-week lead time" → RIGHT: "typical lead time is 4-6 weeks"
- WRONG: "we have zero delivery delays" → RIGHT: "we've been reliable on delivery for the clients we work with"
- WRONG: "lifetime structural guarantee" → RIGHT: "20 years of factory production experience"
- WRONG: "we ALWAYS deliver on time" → RIGHT: "delivery is something we take seriously"

=== KEEP CLAIMS GENERAL WHEN SPECIFIC DATA IS UNAVAILABLE ===
If the email needs specifics that aren't in the verified facts list, REPHRASE GENERALLY rather than invent:
- WRONG: "saved them 17%" → RIGHT: "the factory-direct model usually saves significant cost vs local distributors"
- WRONG: "Canadian distributor structured their first order as a single 6-container PO" → RIGHT: "Our Canadian distributor started small to test quality, then scaled"
- WRONG: "23 Australian builders" → RIGHT: "We work with builders across Australia and Canada"

=== TONE FOR THE CANADA CASE STUDY ===
When mentioning the Canadian distributor in Email 2 specifically:
- State the relationship duration (3 years) and revenue range ($1-2M USD/year) — these ARE verified
- DO NOT invent how their first order was structured (we don't actually know)
- DO NOT claim "phased delivery" or "minimum commitment" structures that we haven't verified
- Frame the offer as "I'll share their general engagement pattern" rather than "exact structure"
- Email 2 CTA hook: "reply 'canada' and I'll share how they got started with us" (not "exact structure")`,
  },

  'cold_5_step': {
    key: 'cold_5_step',
    name: 'Cold Email 5 步序列',
    en_name: 'Cold Email 5-Step Sequence',
    source: '专业冷邮件营销方法论',
    description: 'Hook → Value Drop → Social Proof → Differentiator → Breakup',
    structure: [
      { day: 1,  stage: 'Hook',          purpose: '钩子开场，引用对方+开放问题' },
      { day: 4,  stage: 'Value Drop',    purpose: '一个具体价值点' },
      { day: 7,  stage: 'Social Proof',  purpose: '类似公司案例' },
      { day: 10, stage: 'Differentiator',purpose: '化解反对意见' },
      { day: 14, stage: 'Breakup',       purpose: '礼貌告别+留资源' },
    ],
    best_for: '正式 B2B 客户、需要长期跟进的复杂决策',
    icon: '📊',
    sample_subject: 'Bulk window timeline?',
    sample_email_body: `5-stage sequence methodology (专业冷邮件营销方法论):

Email 1 (Day 1) — Hook
3-5 lines. Reference something specific from prospect's website. End with an open question.
Subject: "Bulk window timeline?"
Body: "Hi {first_name}, Saw your latest project — impressive scale. Quick question: how do you handle window & door supply for tight construction timelines? We've helped AU developers cut lead time to 4 weeks on bulk orders, factory-direct. Worth a quick chat? — Lens"

Email 2 (Day 4) — Value Drop
4-6 lines. One specific value point with a concrete number. Address ONE pain point for this customer type.

Email 3 (Day 7) — Social Proof
Name a specific AU client/project with numbers. e.g. "Greenline Developments (Brisbane) saved $180k in 18 months after consolidating with us."

Email 4 (Day 10) — Differentiator
"A fair pushback I get…" tone. Honestly address ONE common objection.

Email 5 (Day 14) — Breakup
Brief farewell + offer a specific low-commitment resource (catalog/case study/spec sheet).`,
    sequence_prompt: `Email 1 (Day 1) — Hook: 3-5 lines, reference something specific from the prospect's website, end with an open question. Psychology: Pattern Interruption + Reciprocity.
Email 2 (Day 4) — Value Drop: address ONE specific pain point for this prospect's customer type with a concrete insight, number, or solution framing. Psychology: Authority + Loss Aversion.
Email 3 (Day 7) — Social Proof: name a specific AU client/project with concrete numbers (e.g. "$180k saved", "18 months zero delays"). Psychology: Social Proof.
Email 4 (Day 10) — Differentiator: use "A fair pushback I get…" or similar tone — honestly address ONE common objection. Psychology: Curiosity Gap + Authority.
Email 5 (Day 14) — Breakup: brief farewell, offer a specific low-commitment resource (catalog/case study/spec sheet). Psychology: Loss Aversion + Reciprocity.`,
  },

  'aida': {
    key: 'aida',
    name: 'AIDA 经典营销 4 段',
    en_name: 'AIDA Model',
    source: 'Udemy 课程截图',
    description: 'Attention → Interest → Desire → Action',
    structure: [
      { letter: 'A', stage: 'Attention', purpose: '抓住读者注意力' },
      { letter: 'I', stage: 'Interest',  purpose: '个性化引起兴趣' },
      { letter: 'D', stage: 'Desire',    purpose: '建立渴望' },
      { letter: 'A', stage: 'Action',    purpose: '请求回应' },
    ],
    best_for: '初次冷接触、决策路径较长',
    icon: '🎯',
    sample_subject: 'Question about your plumbing business',
    sample_email_body: `Original example (Udemy course):

Subject: Question about your plumbing business

Hi [First name],

Are you looking to generate more inbound calls for your plumbing business?

We recently partnered with a plumbing company in London and generated 24 calls in 3 days.

We're on the lookout for another plumbing company we can help do the same with.

Is this something you would be interested in?

Cheers,
Josh

---
A = Attention (opening question grabs attention)
I = Interest (partnered with a plumbing company — personalised)
D = Desire (24 calls in 3 days — concrete result)
A = Action (simple yes/no question)`,
    sequence_prompt: `Each email follows AIDA (Attention → Interest → Desire → Action):
Email 1 (Day 1): Attention via a prospect-specific detail or bold question; Interest by personalising to their business type; Desire via one concrete result/number; Action = a simple yes/no question.
Email 2 (Day 4): Different Attention angle (a different pain point); Interest = a new insight; Desire = a different benefit framed as a number; Action = gentle check-in.
Email 3 (Day 7): Attention via a surprising stat or result; Interest = named AU client story; Desire = specific numbers from that case; Action = "would a similar result interest you?"
Email 4 (Day 10): Attention via acknowledging a common concern; Interest = honest, non-pushy framing; Desire = reassurance with evidence; Action = low-pressure check-in.
Email 5 (Day 14): Attention = breakup framing; Interest = one final relevant point; Desire = low-commitment resource offer; Action = "reply if ever relevant."`,
  },

  'bab': {
    key: 'bab',
    name: 'BAB 现状-未来-桥梁',
    en_name: 'Before-After-Bridge',
    source: 'Udemy 课程截图',
    description: 'Before → After → Bridge',
    structure: [
      { letter: 'B', stage: 'Before', purpose: '描述对方现在的世界' },
      { letter: 'A', stage: 'After',  purpose: '描绘问题解决后的世界' },
      { letter: 'B', stage: 'Bridge', purpose: '揭示如何到达' },
    ],
    best_for: '正在经历明显问题的客户',
    icon: '🌉',
    sample_subject: 'Tired of wasted time?',
    sample_email_body: `Original example (Udemy course):

Subject: Tired of wasted time?

Hi [First name],

If you're like most business owners you'll know how frustrating it can be to have your time wasted.

Our software changes that, freeing up 12 hours a week.

If you're willing to give me 10 minutes, I'll show you how we can help save you more time.

Are you free tomorrow to explain how it works?

---
B = Before (time wasted = current frustration for most business owners)
A = After (12 hours freed per week = the improved world)
B = Bridge (10-min call to show how → how to get there)`,
    sequence_prompt: `Each email follows BAB (Before → After → Bridge):
Email 1 (Day 1): Before = their current frustration specific to their business type; After = the improved state with a concrete result (time/money saved); Bridge = your specific offer/CTA.
Email 2 (Day 4): Before = a different pain angle (e.g. cost rather than time); After = measurable improvement with a number; Bridge = a specific invitation.
Email 3 (Day 7): Before = named AU client's past situation; After = results they achieved (specific numbers); Bridge = "could the same apply to {company}?"
Email 4 (Day 10): Before = the objection scenario ("I know suppliers like us often seem…"); After = what it looks like when the concern is resolved; Bridge = show how you address it.
Email 5 (Day 14): Before = the unresolved situation if they never try; After = what's possible; Bridge = leave a resource, no obligation, no hard feelings.`,
  },

  'pas': {
    key: 'pas',
    name: 'PAS 痛点驱动 3 段',
    en_name: 'Problem-Agitate-Solve',
    source: 'Udemy 课程截图',
    description: '识别痛点 → 加剧痛点 → 提供方案',
    structure: [
      { letter: 'P', stage: 'Problem', purpose: '识别一个痛点' },
      { letter: 'A', stage: 'Agitate', purpose: '加剧那个痛点' },
      { letter: 'S', stage: 'Solve',   purpose: '提供解决方案' },
    ],
    best_for: '当前供应商有明显问题的客户',
    icon: '⚡',
    sample_subject: 'Window delays cost AU $180k/yr',
    sample_email_body: `Example (AI-generated, PAS structure):

Subject: Window delays cost AU $180k/yr

Hi {first_name},

Most developers using 3+ suppliers end up with spec mismatches and delayed handovers.

Those delays average $180k/year in holding costs and subcontractor rescheduling — money that quietly bleeds out of every project.

We consolidate supply into a single factory-direct channel: 4-week lead times, consistent spec, zero middlemen.

Worth 10 minutes to see if this fits your pipeline?

— Lens

---
P = Problem (3+ suppliers = spec mismatches + delayed handovers)
A = Agitate ($180k/year bleeding out quietly)
S = Solve (single factory-direct channel: 4-week lead times)`,
    sequence_prompt: `Each email follows PAS (Problem → Agitate → Solve):
Email 1 (Day 1): Problem = one specific, concrete pain for their business type; Agitate = make the consequence vivid with a number or cost; Solve = your solution in 1-2 crisp sentences + CTA.
Email 2 (Day 4): Problem = a different angle (e.g. profit margin erosion rather than delays); Agitate = quantify the financial loss; Solve = your specific differentiator.
Email 3 (Day 7): Problem = named AU client's original struggle; Agitate = their situation before you; Solve = specific outcome achieved (numbers and results).
Email 4 (Day 10): Problem = the objection itself (e.g. "switching suppliers is risky"); Agitate = what happens if that fear keeps them stuck; Solve = how you remove that risk specifically.
Email 5 (Day 14): Problem = the persistent unresolved issue; Agitate = "one last thought — every month without a solution means…"; Solve = leave a specific resource (catalog/case study), no pressure.`,
  },

  'byaf': {
    key: 'byaf',
    name: 'BYAF 自由选择',
    en_name: 'But You Are Free',
    source: 'Udemy 课程截图（心理学验证）',
    description: '明确给拒绝的自由，反而提升回复率',
    structure: [
      { stage: '主体内容',      purpose: '正常表达请求' },
      { stage: 'Freedom 明示', purpose: '"如果不方便，完全没关系"' },
    ],
    best_for: '高姿态客户、被骚扰过的客户',
    icon: '🕊️',
    sample_subject: 'A small ask 🙏',
    sample_email_body: `Original example (Udemy course):

Subject: A small ask 🙏

Hi Louise,

I just wrote an amazing blog post explaining why dog owners should consider using a harness for their dog instead of a old fashioned collar.

It would be a great fit for your audience!

Can you please give it a share on your social media platforms?

If not, not worries, I appreciate you reading this far.

Have a great day 😊

---
Main ask: share the blog post on social media
Freedom phrase: "If not, no worries, I appreciate you reading this far."

Psychology: explicitly giving permission to decline actually increases response rate (psychology-validated technique).`,
    sequence_prompt: `Each email follows BYAF — make your ask, then explicitly give the recipient permission to decline:
Email 1 (Day 1): Normal value-focused ask specific to their business type; end with a natural freedom phrase like "If not, no worries at all — I appreciate you reading this."
Email 2 (Day 4): Different angle on the value; end with "Completely up to you, of course."
Email 3 (Day 7): Social proof email; end with "Either way, hope this is useful regardless."
Email 4 (Day 10): Handle a common objection; end with "No pressure if the timing isn't right."
Email 5 (Day 14): Breakup email; explicitly release the prospect with warmth, offer a resource with zero obligation.
CRITICAL RULE: EVERY single email MUST include a clear, natural-sounding sentence that explicitly gives the reader permission to ignore or decline — this is the defining characteristic of BYAF and cannot be omitted from any email in the sequence.`,
  },

  'sch': {
    key: 'sch',
    name: 'SCH 大想法 + 论据链',
    en_name: 'Star-Chain-Hook',
    source: 'Udemy 课程截图',
    description: '大想法 → 一连串事实/数据/好处 → CTA',
    structure: [
      { letter: 'S', stage: 'Star',  purpose: '大想法' },
      { letter: 'C', stage: 'Chain', purpose: '事实、来源、理由、好处' },
      { letter: 'H', stage: 'Hook',  purpose: '行动召唤' },
    ],
    best_for: '数据驱动型决策者、CFO/采购总监',
    icon: '⭐',
    sample_subject: '80% trust online reviews',
    sample_email_body: `Original example (Udemy course):

Subject: 80% trust online reviews

Hi [First Name],

I help local businesses track and monitor their reviews online.

Research has shown that 80% of people trust online reviews as much as personal recommendations.

On top of that, positive reviews can also help increase sales by 18%!

Are you interested in hearing how we can help you monitor your reviews?

---
S = Star (I help local businesses track online reviews — the big idea)
C = Chain (80% trust stat + 18% sales increase — facts and benefits that support the idea)
H = Hook (interested in hearing how we can help? — action CTA)`,
    sequence_prompt: `Each email follows SCH (Star → Chain → Hook):
Email 1 (Day 1): Star = a big, bold idea relevant to this prospect's business type; Chain = 2-3 supporting facts/stats/benefits specific to their industry or situation; Hook = one clear CTA question.
Email 2 (Day 4): Star = a different big idea (different angle on value); Chain = fresh data or industry insights; Hook = check-in question.
Email 3 (Day 7): Star = a client success story headline; Chain = specific numbers (cost saved, time reduced, growth achieved); Hook = "could we replicate this for {company}?"
Email 4 (Day 10): Star = the key concern/objection; Chain = facts and evidence that address and resolve it; Hook = reassurance + next step.
Email 5 (Day 14): Star = a final compelling thought; Chain = one last reason to act; Hook = offer a low-commitment resource, open invitation to reconnect.`,
  },

  'three_ps': {
    key: 'three_ps',
    name: '3P 真诚共情',
    en_name: "3 P's (Praise-Picture-Push)",
    source: 'Udemy 课程截图',
    description: '真诚赞美 → 因果场景 → 邀请承诺',
    structure: [
      { letter: 'P', stage: 'Praise',  purpose: '真诚、尊重的赞美' },
      { letter: 'P', stage: 'Picture', purpose: '用因果推理描绘场景' },
      { letter: 'P', stage: 'Push',    purpose: '请求承诺' },
    ],
    best_for: '室内设计师、建筑师、作品导向客户',
    icon: '💝',
    sample_subject: 'Loved your Photoshop course',
    sample_email_body: `Original example (Udemy course):

Subject: Loved your Photoshop course

Hi [First Name],

Your course on Photoshop is amazing and has taught me so many things. Section 3 was my favourite and the whole course was laid out very well.

A few of my friends have the course too and have expressed concern over the audio quality, which to be fair can be very quiet at times.

Are you free tomorrow to discuss how we can help you improve your audio quality to make your course even better?

---
P = Praise (specific, genuine — "Section 3 was my favourite, well laid out" — NOT generic)
P = Picture (audio concern + "make your course even better" — cause-and-effect scenario)
P = Push (specific ask: "free tomorrow?" — a concrete commitment request)`,
    sequence_prompt: `Each email follows 3 P's (Praise → Picture → Push):
Email 1 (Day 1): Praise = GENUINE, SPECIFIC praise of something you noticed on their website (reference a real project name, service, style, or detail — NOT generic flattery like "Great company!"); Picture = paint a scenario using cause-and-effect reasoning that connects their work to an improvement or opportunity; Push = a specific, gentle ask with a concrete next step.
Email 2 (Day 4): Praise a different aspect of their work; Picture = a different opportunity scenario; Push = a check-in.
Email 3 (Day 7): Praise leads into a named AU client story; Picture = "a similar business achieved X"; Push = "would the same interest you?"
Email 4 (Day 10): Praise their valid concern or careful approach; Picture = what resolution looks like specifically; Push = a light-touch next step.
Email 5 (Day 14): Praise their time and patience; Picture = "imagine if…" final thought; Push = leave a resource, open invitation to reconnect.
CRITICAL RULE: Email 1's FIRST paragraph MUST be genuine, specific praise — reference something concrete from their website (project name, service detail, design style). Vague compliments are not acceptable.`,
  },

  'custom': {
    key: 'custom',
    name: '自定义框架',
    en_name: 'Custom Framework',
    source: '用户自定义',
    description: '使用您自己的写作框架和风格',
    is_custom: true,
    best_for: '有验证过自己写作风格的高级用户',
    icon: '✏️',
  },

};
