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
    sequence_prompt: `Write a cold email using Peter Kang's 3-part framework. Each email is 80-120 words. Casual tone, lowercase preferred. NO "Dear" / "Hope this finds you well" / formal openings.

GOAL OF ENTIRE SEQUENCE:
All 5 emails invite the prospect to visit Lens's 300,000m² factory in Foshan for a half-day. Each email gives a different REASON why visiting is useful to them. The factory visit is the only conversion event — no other CTAs (no "watch video", no "send pricing", no "send case study").

=== PART 1 — PERSONALIZATION (1-2 sentences, ~20 words) ===
Reference something specific from the prospect's website — a project name, suburb they work in, style positioning, or recent post.

CRITICAL RULE — DO NOT ASSUME THE PROSPECT'S PROFESSION OR BUSINESS CATEGORY:
The lead pipeline may misclassify designers vs builders vs contractors vs distributors. NEVER write phrases like:
- "as an interior designer..."
- "for builders like you..."
- "designers at [Company]..."
- "[Company] is a custom builder..."

Reference the prospect's WORK (visible from their site), not their CATEGORY (which may be wrong):
- WRONG: "As an interior designer working in Melbourne..." → RIGHT: "Your custom homes in Hawthorn and Kew..."
- WRONG: "Builders like [Company] often source..." → RIGHT: "[Company]'s portfolio of bespoke residential projects suggests..."

The prospect should feel "they looked at my actual work" — not "they assumed wrong who I am."

=== PART 2 — IDENTITY (1-2 sentences, ~25 words) ===
Establish Lens with VERIFIED facts only:
- 300,000m² factory in Foshan, Guangdong
- 20 years production experience
- Products: aluminium windows, doors, bathroom fixtures, custom cabinetry
- Currently shipping an order to a Sydney interior designer (in progress)
- An overseas distributor scaled to $1-2M USD annually with us over 3 years (after visiting the factory in person)

DO NOT invent details. DO NOT mention "Canadian" / "Canada" — say "overseas distributor" only.

=== PART 3 — OFFER (3-5 sentences, ~50 words) ===
The CORE of the email. Invite the prospect to visit the Foshan factory. Each email should include some of these concrete details:

WHAT THE VISIT INCLUDES (rotate which details you mention):
- Guangzhou airport pickup (or high-speed rail station)
- Half-day visit (4 hours total)
- Tour 300,000m² factory — see aluminium windows, doors, bathroom, cabinetry production lines
- QC lab + sample warehouse
- English-speaking sales rep accompanies
- Working showroom with real product samples
- Engineers available if prospect brings project drawings
- Factory lunch on us
- Drop back at hotel
- Samples shipped to prospect's country at our cost

THE NO-COMMITMENT FRAMING (use phrases like):
- "no pitch, no sales, no commitment"
- "no BS — just see if we're a real factory or not"
- "you walk out with samples, pricing, or nothing — either's fine"
- "zero obligation"

=== EMAIL-BY-EMAIL: 5 INVITATIONS, 5 DIFFERENT REASONS ===

EMAIL 1 (Day 1) — REASON: BACKUP SUPPLIER ANGLE (least threatening)
Subject: "visiting foshan?"
Body theme: Most overseas buyers keep a backup supplier in their back pocket. The factory visit makes that backup real — without committing to switch.
CTA: "Would Lens be worth a half-day next time you're in China?"

EMAIL 2 (Day 4) — REASON: AVOID GETTING BURNED (China sourcing fear)
Subject: "the trick to china sourcing"
Body theme: China sourcing horror stories all share one detail — buyer never visited. A factory visit eliminates the #1 risk in one half-day.
CTA: "Half-day visit if you're sourcing direct from china — yes?"

EMAIL 3 (Day 7) — REASON: ONE-STOP COMPARISON (Lens unique angle)
Subject: "windows + bathroom + cabinetry — one stop"
Body theme: Most Chinese factories specialize in one product. Lens does aluminium windows, doors, bathroom, cabinetry on one site. See all three in one half-day.
CTA: "Want a half-day to see all three production lines?"

EMAIL 4 (Day 10) — REASON: SOURCING TRIP CONVENIENCE (low-friction)
Subject: "your next china sourcing trip"
Body theme: If a prospect is already heading to China to look at suppliers, Foshan is a half-day side trip from Guangzhou. Just add Lens to the itinerary.
CTA: "If you're heading to China anyway in next 6 months, worth half a day?"

EMAIL 5 (Day 14) — REASON: ZERO COMMITMENT BREAKUP (last try)
Subject: "closing the file"
Body theme: This is my last email. The factory visit invitation stays open 12 months. Reply "open" anytime. Otherwise good luck.
CTA: "Reply 'open' anytime in the next 12 months — door stays open."

=== STRICT RULES ===

NO SIGNATURE IN BODY:
Do not write "— Leo Lens" / "— Leo Li, Lens" / "— [name], Lens" or any name signature. End at the CTA question. The 5 sender accounts (Ella/Leo/Lily/Lucy/Zi @lensfos.com) have signatures configured in Instantly UI — they're auto-appended.

NO INVENTED FACTS:
- No specific Australian client names (only verified: "Sydney interior designer, currently shipping")
- No cost-savings percentages
- No made-up client counts ("23 builders", "45 projects")
- No "guarantee" / "lifetime guarantee" / "zero delays"
- No "local AU stock" (Lens does not have AU warehouses)

NO PROFESSION ASSUMPTIONS:
Never write "as a designer..." / "for builders like you..." — reference work, not category.

NO CANADIAN REFERENCES:
Say "overseas distributor" if mentioning the $1-2M case. Never say "Canada" / "Canadian".

CTA RULES:
Every email ends with a clear, easy yes-or-no question. The CTA is the LAST line. No "Thanks," / "Cheers," / signature after.

TONE:
Like a real person writing to one specific person. Direct, no marketing speak. The phrases "no BS", "no pitch", "no commitment" should appear naturally — these reduce the prospect's defensiveness.

EMAIL LENGTH: 80-120 words total per email. Concise. Each email is ONE focused invitation with ONE reason.`,
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
