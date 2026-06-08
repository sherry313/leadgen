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
    sample_subject: 'before your next custom build',
    sample_email_body: `Peter Kang v2 customer-angle example (Email 1):

Subject: quick thought on your supplier risk

Hi James,

Saw [Company]'s recent Hawthorn custom home — the curved aluminium facade caught my eye.

if your aluminium supplier ghosts mid-build, how many days does your client wait?

Lens is a 200,000m² aluminium factory in Zhongshan, 20 years. Currently working with a Sydney designer on a residential project.

Worth a half-day next time you're in China? Just a chance to see if it makes sense — one more option in your back pocket.

{{accountSignature}}

---
~60 words. Lowercase-first subject with proper-noun caps. Customer-angle pain question, low-friction CTA, {{accountSignature}} as the only sign-off (Instantly renders it at send time).`,
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- Body length: 45-70 words per email (NOT "under 100")
- Sign-off: exactly {{accountSignature}} on its own line. Do NOT write "Lili", "— Lili", "Lili, Lens", "— [seller name]", "Best regards", "Warmly", "Cheers" or any other sign-off. The literal placeholder {{accountSignature}} is the entire sign-off — Instantly substitutes the sender's signature at send time.
- Subject length: 5-8 words
- Subject case: first letter LOWERCASE, common words lowercase. ONLY capitalise proper nouns (China, Foshan, Sydney, Guangdong, country/city/brand names). Numbers as-is.
- Never Title Case. Never ALL CAPS. Never capitalise the first letter of the subject as a default.

STYLE: short, customer-angle "for you" — not "buy from us".

FACTS YOU MAY USE (do not invent others):
- Lens: 200,000m² aluminium factory in Zhongshan, 20 years experience
- Currently working with a Sydney designer on a residential project (no name given, no specifics beyond "residential")
- Do NOT say "Canadian distributor" / "$1-2M USD" / "23 builders" / cost-savings % / AU warehouse / any delay-related promises

NEVER:
- Fabricate website details. If the website scrape is empty, the Email 1 hook line becomes exactly: "Saw [Company] — quick thought." The Email 1 subject still follows the curiosity-gap style (e.g. "quick thought on your supplier risk") — do NOT use "Saw X" as the subject.
- Mention specific customer names (no MADOYE, no real Sydney designer name).
- Use "I run sales at..." / "I'm with...".
- Assume profession ("as a designer", "for builders like you") — reference WORK, not category.

=== EMAIL 1 (Day 1) — personalised hook (THE ONLY FULLY PERSONALISED EMAIL) ===
Greeting: "Hi [first_name]," — derive first_name from the prospect's email (e.g. james@... → "James"). If no first name can be derived, use "Hi [company] team,".
Body structure (45-70 words total):
  1. One sentence hook referencing something SPECIFIC from their website (a project, suburb, style detail). If website scrape is empty: "Saw [Company] — quick thought."
  2. Pain question: "if your aluminium supplier ghosts mid-[project type], how many days does your client wait?" — adapt [project type] to their work (mid-build, mid-fit-out, mid-install, mid-renovation).
  3. Credentials line, verbatim: "Lens is a 200,000m² aluminium factory in Zhongshan, 20 years. Currently working with a Sydney designer on a residential project."
  4. CTA, verbatim: "Worth a half-day next time you're in China? Just a chance to see if it makes sense — one more option in your back pocket."
Sign-off: {{accountSignature}}
Subject: curiosity-gap, lowercase-first, 5-8 words. Examples: "quick thought on your supplier risk", "before your next custom build", "when your supplier ghosts".

WRITING STYLE — EMAIL 1 CRITICAL:
- Write like a real person texting from their phone, not a copywriter
- NO em dashes (—), NO semicolons (;), NO complex sentence structures
- NO poetic or dramatic language. No metaphors. No scenarios.
- Short sentences only. Max 12 words per sentence.
- The hook must be ONE simple observation from their website. Direct and plain.
- Do NOT use "aluminium" — say "factory" only
- No filler openers. No "I noticed", "I came across", "I wanted to reach out"
- If the hook sounds like it was written by a marketing agency, rewrite it simpler

=== EMAIL 2 (Day 3) — audit-supplier insight ===
FIXED TEMPLATE. Output the subject and body BELOW VERBATIM. ONLY swap [Name] (use the same first_name as Email 1, or "[company] team" if unknown). Do not rephrase, do not add sentences, do not change the subject.
Subject: before you sign your next supplier
Body:
Hi [Name],
Quick follow-up.
Most builders we talk to only audit their China supplier once — at the start. Then they hope for the best.
One thing that helps: a factory video before any order. If you want, I can send ours — just for your reference.
{{accountSignature}}

=== EMAIL 3 (Day 5) — value ===
FIXED TEMPLATE. Output the subject and body BELOW VERBATIM. ONLY swap [Name]. Do not rephrase.
Subject: 3 things to ask any China supplier
Body:
Hi [Name],
If you ever evaluate a new China supplier (us or anyone else), 3 questions that cut through the BS:
1. "Can you send me a video of the production line you're proposing?"
2. "What's your lead time if something needs to be redone?"
3. "Who's the actual factory owner — and can I email them directly?"
Most won't answer #3.
If you want, I can send our answers to all 3 — just for your reference.
{{accountSignature}}

WRITING STYLE — EMAIL 3 CRITICAL:
- No em dashes (—), no semicolons (;)
- No phrases that sound like a case study or testimonial
- No dramatic before/after storytelling
- Keep it factual and plain. One point only.
- If any sentence sounds like it came from a marketing template, cut it

=== EMAIL 4 (Day 7) — factory visit invite ===
FIXED TEMPLATE. Output the subject and body BELOW VERBATIM. ONLY swap [Name]. Do not rephrase.
Subject: in case you're sourcing in China
Body:
Hi [Name],
If you ever come to China for sourcing (most builders we work with do 1-2 trips a year), and you're in Guangdong — we cover airport pickup, all meals, factory tour, QC lab walkthrough.
You cover flight + hotel.
Flexible, straightforward. Most builders stay 1-2 nights, see 4-5 factories, ours included.
If your trip is on the horizon, reply with the month and we'll figure it out.
{{accountSignature}}

=== EMAIL 5 (Day 10) — breakup ===
FIXED TEMPLATE. Output the subject and body BELOW VERBATIM. ONLY swap [Name] and [Company]. Do not rephrase.
Subject: closing your file
Body:
Hi [Name],
I've emailed 4 times — no reply. All good.
Closing your file today. If your current supplier ever falls over, my email stays open.
One last thing — is there someone else at [Company] who handles aluminium/cabinetry sourcing I should know about?
{{accountSignature}}

CRITICAL — EMAILS 2-5 ARE FIXED TEMPLATES:
Do NOT rephrase the body. Do NOT add extra sentences. Do NOT change the subject. ONLY swap [Name] (and [Company] in Email 5). Their word counts will be tighter than the 45-70 range — that is correct, the templates are authoritative as written.

SUBJECT-LINE CAPITALISATION EXAMPLES:
GOOD:
- "quick thought on your supplier risk"
- "before your next custom build"
- "3 things to ask any China supplier"      (China capitalised)
- "in case you're sourcing in China"         (China capitalised)
- "when your supplier ghosts"
- "closing your file"
- "before you sign your next supplier"
BAD:
- "Quick thought on your supplier risk"      (first letter capitalised — wrong)
- "Quick Thought On Your Supplier Risk"      (Title Case — wrong)
- "QUICK THOUGHT"                             (all caps — wrong)
- "3 things to ask any china supplier"       (China should be capitalised)
- "Saw Your DKO Partnership"                 (Title Case + formal — wrong)
- "Backup factory for X?"                     (too salesy/direct — wrong)`,
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
Body: "Hi {first_name}, Saw your latest project — impressive scale. Quick question: how do you handle window & door supply for tight construction timelines? We've helped AU developers cut lead time to 4 weeks on bulk orders, factory-direct. Worth a quick chat? {{accountSignature}}"

Email 2 (Day 4) — Value Drop
4-6 lines. One specific value point with a concrete number. Address ONE pain point for this customer type.

Email 3 (Day 7) — Social Proof
Name a specific AU client/project with numbers. e.g. "Greenline Developments (Brisbane) saved $180k in 18 months after consolidating with us."

Email 4 (Day 10) — Differentiator
"A fair pushback I get…" tone. Honestly address ONE common objection.

Email 5 (Day 14) — Breakup
Brief farewell + offer a specific low-commitment resource (catalog/case study/spec sheet).`,
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- Body length: 40-80 words per email
- Sign-off: exactly {{accountSignature}} on its own line. No other sign-off.
- Subject: under 7 words, all lowercase, no punctuation gimmicks, no Title Case
- Plain text only. No bullet points, no bold, no formatting inside the body.
- Every sentence max 12 words. Short. Direct.
- NO em dashes (—), NO semicolons (;)
- NO phrases: "world-class", "industry-leading", "best in class", "I hope this finds you", "I wanted to reach out", "I came across"
- Each email must be able to stand alone if previous emails were ignored
- No fake urgency, no hollow claims, no filler sentences
- If any line sounds like it was written by a marketing agency, cut it and rewrite simpler

GOAL: Get a reply. Not an open. Every email ends with one clear low-commitment question.

FACTS YOU MAY USE (do not invent others):
- Factory in Zhongshan, 20 years running
- Products: windows, doors, kitchen cabinets, sanitary ware
- Target: Australian wholesale showrooms, building contractors, interior designers
- Buyers are sceptical — they have seen every generic pitch before
- No social proof available — do not invent or imply any
- Do not make unverifiable claims about quality or pricing

=== EMAIL 1 (Day 1) — Curiosity ===
Hook: one simple observation from their website. Plain. Direct. Not poetic.
Then: one direct question about whether they source from China
Then: one line about what we make and where (factory in Zhongshan, 20 years)
CTA: one low-commitment question to get a reply
Subject: curiosity-gap, lowercase, under 7 words

=== EMAIL 2 (Day 3) — Value ===
Different angle from Email 1. Do not repeat the opening line.
Address the two things buyers actually care about: lead times and what happens when something goes wrong.
Sea freight from Zhongshan to Australia: 6-8 weeks.
CTA: offer to get specific if relevant to what they are quoting.

=== EMAIL 3 (Day 7) — Specific Product ===
Pick one product (windows, doors, cabinets, or sanitary ware) and be specific.
Mention custom sizing and flexible MOQ.
Offer to give a number if they send specs and quantities.
CTA: ask them to send specs. No commitment needed.
WRITING STYLE: no em dashes, no semicolons, plain sentences only.

=== EMAIL 4 (Day 12) — Before Next Order ===
Angle: before they lock in their next order, it costs nothing to get a second quote.
Not asking them to switch suppliers. Just get a number to compare.
CTA: ask them to send specs and quantities.

=== EMAIL 5 (Day 18) — Breakup ===
Short. Warm. No hard feelings.
Acknowledge no reply. Leave the door open.
Ask if there is someone else at the company who handles supplier decisions.
CTA: offer to reach out to the right person instead.`,
  },

  'cold_7_step': {
    key: 'cold_7_step',
    name: 'Cold 7-Step — 建材开发序列',
    en_name: '7-Email Cold Outreach Framework',
    source: '7-Email Cold Outreach Framework（建材澳洲买家）',
    description: 'Initial Outreach → Value Add → Social Proof → Different Angle → Quick Check-in → Last Value → Breakup',
    structure: [
      { day: 0,  stage: 'Initial Outreach', purpose: '个性化介绍 + 明确价值，一个低承诺问题' },
      { day: 3,  stage: 'Value Add',        purpose: '提供真正有用的信息，完全不提任何请求' },
      { day: 7,  stage: 'Social Proof',     purpose: '用第三方认证作为可信度背书（无客户案例）' },
      { day: 10, stage: 'Different Angle',  purpose: '换一个完全不同的切入点：定制尺寸' },
      { day: 14, stage: 'Quick Check-in',   purpose: '极简、低压力跟进，2-3 句话' },
      { day: 21, stage: 'Last Value',       purpose: '最后一份真诚价值：邀请参观工厂' },
      { day: 28, stage: 'Breakup',          purpose: '尊重式收尾，给三个回复选项' },
    ],
    best_for: '澳洲建材买家：建筑承包商、装修公司、批发陈列室、室内设计师',
    icon: '🏗️',
    sample_subject: 'china sourcing for windows',
    sample_email_body: `7-Email Cold Outreach Framework example (Email 1, Day 0):

Subject: china sourcing for windows

Hi James,

Your Hawthorn renovation gallery shows a lot of custom glazing work.

Do you source any windows, doors, or cabinets from China right now?

We run a factory in Zhongshan. Twenty years on the same lines.

What does your current sourcing setup look like?

{{accountSignature}}

---
~50 words. Lowercase subject under 7 words. One specific website observation, one sourcing question, brief intro, one low-commitment question. {{accountSignature}} is the only sign-off.`,
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- This is a 7-email B2B cold outreach sequence for Australian building materials buyers.
- Body length: 40-80 words per email.
- Sign-off: exactly {{accountSignature}} on its own line. Do NOT write any name, "Best regards", "Cheers", "Warmly" or any other sign-off. The literal placeholder {{accountSignature}} is the entire sign-off — Instantly substitutes the sender's signature at send time.
- Subject: under 7 words, all lowercase, no punctuation.
- Every sentence max 12 words. Short. Direct.
- NO em dashes (—), NO semicolons (;).
- No fake urgency, no hollow claims, no invented social proof, no fake customer quotes.
- Each email ends with ONE clear low-commitment question.
- Plain text only. No bullet points, no bold.
- English only.

FACTS YOU MAY USE (do not invent others):
- Factory in Zhongshan, 20 years running.
- Products: windows, doors, kitchen cabinets, sanitary ware.
- Certifications: AS2047 (Australian window standard), CE, ISO.
- All four product categories under one roof.
- Custom sizing available.
- Target: Australian building contractors, renovation companies, wholesale showrooms, interior designers.

NEVER:
- Invent customer names or quotes.
- Mention specific prices.
- Use "world-class", "industry-leading", "best in class".
- Start sentences with "I hope", "I wanted to reach out", "I came across".
- Use em dashes or semicolons.

=== EMAIL 1 (Day 0) — Initial Outreach ===
Purpose: personalized introduction with clear value.
- Hook: one specific observation from their website.
- Ask whether they source windows, doors, cabinets, or sanitary ware from China.
- Brief intro: factory in Zhongshan, 20 years.
- CTA: one low-commitment question about their sourcing.
If the website scrape is empty, the hook becomes exactly: "Saw [Company] while looking at Australian suppliers."

=== EMAIL 2 (Day 3) — Value Add ===
Purpose: provide genuine value, absolutely NO ask for business.
- Share: our products hold AS2047, CE, and ISO certifications.
- Why it matters for them: AS2047 compliance is needed for council approvals in Australia and reduces liability for contractors.
- Tone: helpful, not salesy.
- End with a soft question: is certification something they need from suppliers?

=== EMAIL 3 (Day 7) — Social Proof ===
Purpose: demonstrate credibility through certifications as third-party validation (no customer cases available).
- Angle: AS2047, CE, and ISO are granted by independent testing bodies. This is proof our quality meets international standards.
- Frame as "others trust us" via certification bodies, not fake customer quotes.
- CTA: would they want to see our test reports?
Do NOT invent customer names, quotes, or project numbers.

=== EMAIL 4 (Day 10) — Different Angle ===
Purpose: try a completely different angle.
- New angle: custom sizing. Many Australian renovations need non-standard window and door sizes. Local suppliers cannot always deliver.
- We manufacture to custom specs.
- CTA: do they deal with custom sizing requests from clients?

=== EMAIL 5 (Day 14) — Quick Check-in ===
Purpose: brief, low-pressure follow-up.
- Very short. 2-3 sentences max.
- Reference previous emails briefly.
- CTA: one word reply works.

=== EMAIL 6 (Day 21) — Last Value ===
Purpose: final piece of genuine value, no ask for business.
- Offer: an invitation to visit the factory in Zhongshan.
- Half-day visit. See the production floor, the QC process, all four product lines under one roof.
- No pressure framing.
- CTA: worth a half-day next time they are in China?

=== EMAIL 7 (Day 28) — Breakup ===
Purpose: respectful close that often triggers replies.
- Give three options to reply:
  1. Interested but timing is bad.
  2. Not interested, totally fine.
  3. Wrong person, point me to who handles sourcing.
- Tone: respectful, no guilt, door always open.
- CTA: which of the three fits best?`,
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

{{accountSignature}}

---
A = Attention (opening question grabs attention)
I = Interest (partnered with a plumbing company — personalised)
D = Desire (24 calls in 3 days — concrete result)
A = Action (simple yes/no question)`,
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- Body length: 50-80 words per email
- Sign-off: exactly {{accountSignature}} on its own line. No other sign-off.
- Subject: 4-7 words, first letter lowercase, only capitalise proper nouns (China, Zhongshan, Guangdong, Guangzhou, Sydney). Never Title Case.
- Every sentence separated by a blank line.

GOAL: Every email has ONE purpose — invite the prospect to visit our factory in Zhongshan. Never sell product directly. Never push for a purchase decision.

FACTS YOU MAY USE (do not invent others):
- Factory: 200,000m² aluminium factory in Zhongshan, 20 years experience
- Current project: currently supplying a Sydney designer on a residential project (no name, no further details)
- Factory visit: we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough. Prospect covers flights and hotel.

NEVER:
- Mention product pricing
- Fabricate client names, percentages, revenue figures, number of projects, AU warehouse, delivery promises
- Use banned phrases: no commitment, no risk, guarantee, act now, limited time, exclusive offer

Each email follows AIDA (Attention → Interest → Desire → Action). The Action is always a factory-visit invitation — never a purchase ask.

Email 1 (Day 1):
- Attention: open with a specific detail from their website or work
- Interest: connect that work to sourcing they likely already think about
- Desire: paint what walking a 200,000m² factory in Zhongshan would show them
- Action: "worth a half-day in Zhongshan next time you're in China?"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 1 CRITICAL:
- Write like a real person texting from their phone, not a copywriter
- NO em dashes (—), NO semicolons (;), NO complex sentence structures
- NO poetic or dramatic language. No metaphors. No scenarios.
- Short sentences only. Max 12 words per sentence.
- The hook must be ONE simple observation from their website. Direct and plain.
- Do NOT use "aluminium" — say "factory" only
- No filler openers. No "I noticed", "I came across", "I wanted to reach out"
- If the hook sounds like it was written by a marketing agency, rewrite it simpler

Email 2 (Day 4):
- Attention: a different angle — the gap between what suppliers promise and what shows up
- Interest: most buyers never see the factory before ordering
- Desire: position a factory walkthrough video as a lowest-friction first step
- Action: "happy to send the video — just for your reference"
Sign-off: {{accountSignature}}

Email 3 (Day 7):
- Attention: lead with the facts — 200,000m² in Zhongshan, 20 years, currently supplying a Sydney designer on a residential project
- Interest: explain what those numbers look like on the actual floor
- Desire: frame the visit as one more option in their back pocket
- Action: "if a China trip is ever on the horizon, reply with the month"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 3 CRITICAL:
- No em dashes (—), no semicolons (;)
- No phrases that sound like a case study or testimonial
- No dramatic before/after storytelling
- Keep it factual and plain. One point only.
- If any sentence sounds like it came from a marketing template, cut it

Email 4 (Day 10):
- Attention: acknowledge the common concern about visiting a Chinese supplier — time, cost, risk of wasted trip
- Interest: lay out the logistics honestly (airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough; they cover flights and hotel)
- Desire: frame as a half-day inside a longer sourcing trip
- Action: "if it ever fits your trip schedule, reply with the month"
Sign-off: {{accountSignature}}

Email 5 (Day 14):
- Attention: breakup framing, warm
- Interest: one final reminder that the invitation to visit stays open
- Desire: keep the relationship open for the next sourcing trip
- Action: "is there someone else at [Company] who handles supplier sourcing I should know about?"
Sign-off: {{accountSignature}}`,
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
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- Body length: 50-80 words per email
- Sign-off: exactly {{accountSignature}} on its own line. No other sign-off.
- Subject: 4-7 words, first letter lowercase, only capitalise proper nouns (China, Zhongshan, Guangdong, Guangzhou, Sydney). Never Title Case.
- Every sentence separated by a blank line.

GOAL: Every email has ONE purpose — invite the prospect to visit our factory in Zhongshan. Never sell product directly. Never push for a purchase decision.

FACTS YOU MAY USE (do not invent others):
- Factory: 200,000m² aluminium factory in Zhongshan, 20 years experience
- Current project: currently supplying a Sydney designer on a residential project (no name, no further details)
- Factory visit: we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough. Prospect covers flights and hotel.

NEVER:
- Mention product pricing
- Fabricate client names, percentages, revenue figures, number of projects, AU warehouse, delivery promises
- Use banned phrases: no commitment, no risk, guarantee, act now, limited time, exclusive offer

Each email follows BAB (Before → After → Bridge). Bridge is always the factory-visit invitation.

Email 1 (Day 1):
- Before: their current sourcing friction — picking suppliers off documents, photos, references
- After: the clarity of having walked the actual production floor in person
- Bridge: "worth a half-day in Zhongshan next time you're in China?"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 1 CRITICAL:
- Write like a real person texting from their phone, not a copywriter
- NO em dashes (—), NO semicolons (;), NO complex sentence structures
- NO poetic or dramatic language. No metaphors. No scenarios.
- Short sentences only. Max 12 words per sentence.
- The hook must be ONE simple observation from their website. Direct and plain.
- Do NOT use "aluminium" — say "factory" only
- No filler openers. No "I noticed", "I came across", "I wanted to reach out"
- If the hook sounds like it was written by a marketing agency, rewrite it simpler

Email 2 (Day 4):
- Before: another sourcing pain — surprises that surface only after orders ship
- After: what changes once you've stood on the line and met the team
- Bridge: offer the factory walkthrough video as a low-friction warm-up to a real visit
Sign-off: {{accountSignature}}

Email 3 (Day 7):
- Before: the limitations of supplier credentials on paper
- After: what 200,000m² of factory floor and 20 years on the same Zhongshan line actually look like; currently supplying a Sydney designer on a residential project
- Bridge: "if a China sourcing trip is on the horizon, the factory is worth half a day"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 3 CRITICAL:
- No em dashes (—), no semicolons (;)
- No phrases that sound like a case study or testimonial
- No dramatic before/after storytelling
- Keep it factual and plain. One point only.
- If any sentence sounds like it came from a marketing template, cut it

Email 4 (Day 10):
- Before: the common reason buyers skip the visit — sounds expensive, sounds risky
- After: what the visit actually involves — airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough; you cover flights and hotel
- Bridge: "if a sourcing trip is in your plans, reply with the month"
Sign-off: {{accountSignature}}

Email 5 (Day 14):
- Before: the unresolved sourcing decision they'll still face later
- After: a future trip where the visit slots in naturally
- Bridge: invitation stays open; ask if there's another sourcing contact at the company
Sign-off: {{accountSignature}}`,
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

{{accountSignature}}

---
P = Problem (3+ suppliers = spec mismatches + delayed handovers)
A = Agitate ($180k/year bleeding out quietly)
S = Solve (single factory-direct channel: 4-week lead times)`,
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- Body length: 50-80 words per email
- Sign-off: exactly {{accountSignature}} on its own line. No other sign-off.
- Subject: 4-7 words, first letter lowercase, only capitalise proper nouns (China, Zhongshan, Guangdong, Guangzhou, Sydney). Never Title Case.
- Every sentence separated by a blank line.

GOAL: Every email has ONE purpose — invite the prospect to visit our factory in Zhongshan. Never sell product directly. Never push for a purchase decision.

FACTS YOU MAY USE (do not invent others):
- Factory: 200,000m² aluminium factory in Zhongshan, 20 years experience
- Current project: currently supplying a Sydney designer on a residential project (no name, no further details)
- Factory visit: we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough. Prospect covers flights and hotel.

NEVER:
- Mention product pricing
- Fabricate client names, percentages, revenue figures, number of projects, AU warehouse, delivery promises
- Use banned phrases: no commitment, no risk, guarantee, act now, limited time, exclusive offer

Each email follows PAS (Problem → Agitate → Solve). Solve is always a factory-visit invitation.

Email 1 (Day 1):
- Problem: sourcing blind — choosing a supplier without ever seeing the production line
- Agitate: this is where most "spec didn't match" stories begin
- Solve: walking the factory in person solves it more cleanly than any document — "worth a half-day in Zhongshan next time you're in China?"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 1 CRITICAL:
- Write like a real person texting from their phone, not a copywriter
- NO em dashes (—), NO semicolons (;), NO complex sentence structures
- NO poetic or dramatic language. No metaphors. No scenarios.
- Short sentences only. Max 12 words per sentence.
- The hook must be ONE simple observation from their website. Direct and plain.
- Do NOT use "aluminium" — say "factory" only
- No filler openers. No "I noticed", "I came across", "I wanted to reach out"
- If the hook sounds like it was written by a marketing agency, rewrite it simpler

Email 2 (Day 4):
- Problem: trusting photos and showroom samples to represent the real factory
- Agitate: showrooms and production lines can look like two different companies
- Solve: offer the factory walkthrough video as a starting point; the full visit as the real fix
Sign-off: {{accountSignature}}

Email 3 (Day 7):
- Problem: hard to evaluate scale and consistency without a ground-level view
- Agitate: 200,000m² sounds abstract on paper — feels very different on the floor
- Solve: 20 years on the same line, currently supplying a Sydney designer on a residential project; come see it
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 3 CRITICAL:
- No em dashes (—), no semicolons (;)
- No phrases that sound like a case study or testimonial
- No dramatic before/after storytelling
- Keep it factual and plain. One point only.
- If any sentence sounds like it came from a marketing template, cut it

Email 4 (Day 10):
- Problem: many buyers think the trip is too expensive or too disruptive
- Agitate: not visiting often costs more — one bad order can dwarf a flight
- Solve: we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough; you cover flights and hotel
Sign-off: {{accountSignature}}

Email 5 (Day 14):
- Problem: the visit decision keeps getting pushed
- Agitate: the underlying sourcing uncertainty doesn't go away
- Solve: invitation stays open; ask if someone else at the company handles sourcing
Sign-off: {{accountSignature}}`,
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
Freedom phrase: "If not, totally understand, I appreciate you reading this far."

Psychology: explicitly giving permission to decline actually increases response rate (psychology-validated technique).`,
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- Body length: 50-80 words per email
- Sign-off: exactly {{accountSignature}} on its own line. No other sign-off.
- Subject: 4-7 words, first letter lowercase, only capitalise proper nouns (China, Zhongshan, Guangdong, Guangzhou, Sydney). Never Title Case.
- Every sentence separated by a blank line.

GOAL: Every email has ONE purpose — invite the prospect to visit our factory in Zhongshan. Never sell product directly. Never push for a purchase decision.

FACTS YOU MAY USE (do not invent others):
- Factory: 200,000m² aluminium factory in Zhongshan, 20 years experience
- Current project: currently supplying a Sydney designer on a residential project (no name, no further details)
- Factory visit: we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough. Prospect covers flights and hotel.

NEVER:
- Mention product pricing
- Fabricate client names, percentages, revenue figures, number of projects, AU warehouse, delivery promises
- Use banned phrases: no commitment, no risk, guarantee, act now, limited time, exclusive offer

Each email follows BYAF — make the factory-visit invitation, then explicitly give the recipient permission to decline. Every email must end with a natural-sounding freedom phrase that reads like a real person wrote it (never a script).

Email 1 (Day 1):
- Body: reference something specific from their website, then frame the visit as worth half a day if a China sourcing trip is ever in their schedule
- Freedom phrase: "if not, totally understand — appreciate you reading this far"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 1 CRITICAL:
- Write like a real person texting from their phone, not a copywriter
- NO em dashes (—), NO semicolons (;), NO complex sentence structures
- NO poetic or dramatic language. No metaphors. No scenarios.
- Short sentences only. Max 12 words per sentence.
- The hook must be ONE simple observation from their website. Direct and plain.
- Do NOT use "aluminium" — say "factory" only
- No filler openers. No "I noticed", "I came across", "I wanted to reach out"
- If the hook sounds like it was written by a marketing agency, rewrite it simpler

Email 2 (Day 4):
- Body: short note on why most buyers benefit from seeing the factory before ordering; offer the factory walkthrough video as a softer first step
- Freedom phrase: "completely up to you, of course"
Sign-off: {{accountSignature}}

Email 3 (Day 7):
- Body: 200,000m² in Zhongshan, 20 years, currently supplying a Sydney designer on a residential project — extend the visit invitation again
- Freedom phrase: "either way, hope this is useful to know about"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 3 CRITICAL:
- No em dashes (—), no semicolons (;)
- No phrases that sound like a case study or testimonial
- No dramatic before/after storytelling
- Keep it factual and plain. One point only.
- If any sentence sounds like it came from a marketing template, cut it

Email 4 (Day 10):
- Body: address the most common reason buyers hesitate (time, cost, risk of wasted trip); be honest about the logistics — we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough; they cover flights and hotel
- Freedom phrase: "totally understand if a trip isn't on the cards"
Sign-off: {{accountSignature}}

Email 5 (Day 14):
- Body: warm breakup; factory visit invitation stays open; ask if there's someone else at the company who handles sourcing
- Freedom phrase: explicit release with warmth — "no expectation, just leaving the door open"
Sign-off: {{accountSignature}}

CRITICAL RULE: EVERY email must contain a clear, natural-sounding sentence that explicitly gives the reader permission to ignore or decline. This is BYAF's defining mechanic and cannot be omitted from any email in the sequence.`,
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
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- Body length: 50-80 words per email
- Sign-off: exactly {{accountSignature}} on its own line. No other sign-off.
- Subject: 4-7 words, first letter lowercase, only capitalise proper nouns (China, Zhongshan, Guangdong, Guangzhou, Sydney). Never Title Case.
- Every sentence separated by a blank line.

GOAL: Every email has ONE purpose — invite the prospect to visit our factory in Zhongshan. Never sell product directly. Never push for a purchase decision.

FACTS YOU MAY USE (do not invent others):
- Factory: 200,000m² aluminium factory in Zhongshan, 20 years experience
- Current project: currently supplying a Sydney designer on a residential project (no name, no further details)
- Factory visit: we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough. Prospect covers flights and hotel.

NEVER:
- Mention product pricing
- Fabricate client names, percentages, revenue figures, number of projects, AU warehouse, delivery promises
- Use banned phrases: no commitment, no risk, guarantee, act now, limited time, exclusive offer

Each email follows SCH (Star → Chain → Hook). Star is always the factory visit framed as a big idea. Chain stays inside the allowed facts. Hook is the visit CTA.

Email 1 (Day 1):
- Star: the visit itself — seeing the factory floor solves what no document can
- Chain: 1-2 supporting facts (200,000m² in Zhongshan, 20 years on the same line)
- Hook: "worth a half-day next time you're in China?"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 1 CRITICAL:
- Write like a real person texting from their phone, not a copywriter
- NO em dashes (—), NO semicolons (;), NO complex sentence structures
- NO poetic or dramatic language. No metaphors. No scenarios.
- Short sentences only. Max 12 words per sentence.
- The hook must be ONE simple observation from their website. Direct and plain.
- Do NOT use "aluminium" — say "factory" only
- No filler openers. No "I noticed", "I came across", "I wanted to reach out"
- If the hook sounds like it was written by a marketing agency, rewrite it simpler

Email 2 (Day 4):
- Star: a different framing — the gap between showroom and production floor
- Chain: factory walkthrough video as a lowest-friction starting point
- Hook: "happy to send the video — just for your reference"
Sign-off: {{accountSignature}}

Email 3 (Day 7):
- Star: scale and continuity as the big idea
- Chain: 200,000m² factory floor; 20 years on the same line; currently supplying a Sydney designer on a residential project
- Hook: "if a China sourcing trip is on the horizon, come see it"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 3 CRITICAL:
- No em dashes (—), no semicolons (;)
- No phrases that sound like a case study or testimonial
- No dramatic before/after storytelling
- Keep it factual and plain. One point only.
- If any sentence sounds like it came from a marketing template, cut it

Email 4 (Day 10):
- Star: addressing the visit-logistics question head-on
- Chain: we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough; they cover flights and hotel
- Hook: "if a trip is in your calendar, reply with the month"
Sign-off: {{accountSignature}}

Email 5 (Day 14):
- Star: one final reason the visit matters — the sourcing decision they'll keep making
- Chain: invitation stays open; the factory is here whenever
- Hook: "is there someone else at [Company] who handles supplier sourcing I should know about?"
Sign-off: {{accountSignature}}`,
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
    sequence_prompt: `OVERRIDES — THESE OVERRIDE ANY EARLIER RULES IN THIS PROMPT:
- Body length: 50-80 words per email
- Sign-off: exactly {{accountSignature}} on its own line. No other sign-off.
- Subject: 4-7 words, first letter lowercase, only capitalise proper nouns (China, Zhongshan, Guangdong, Guangzhou, Sydney). Never Title Case.
- Every sentence separated by a blank line.

GOAL: Every email has ONE purpose — invite the prospect to visit our factory in Zhongshan. Never sell product directly. Never push for a purchase decision.

FACTS YOU MAY USE (do not invent others):
- Factory: 200,000m² aluminium factory in Zhongshan, 20 years experience
- Current project: currently supplying a Sydney designer on a residential project (no name, no further details)
- Factory visit: we cover airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough. Prospect covers flights and hotel.

NEVER:
- Mention product pricing
- Fabricate client names, percentages, revenue figures, number of projects, AU warehouse, delivery promises
- Use banned phrases: no commitment, no risk, guarantee, act now, limited time, exclusive offer

Each email follows 3 P's (Praise → Picture → Push). Praise must be specific and genuine, derived from their actual website (project name, design style, service detail). Picture is the factory visit experience for THEM. Push is a concrete next step that ties to coming to Zhongshan.

Email 1 (Day 1):
- Praise: specific praise of something concrete from their website (project name, suburb, style, service); NEVER generic flattery like "great company"
- Picture: connect what they care about to what they'd see on the factory floor in Zhongshan
- Push: "reply with the month if a sourcing trip is on your radar"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 1 CRITICAL:
- Write like a real person texting from their phone, not a copywriter
- NO em dashes (—), NO semicolons (;), NO complex sentence structures
- NO poetic or dramatic language. No metaphors. No scenarios.
- Short sentences only. Max 12 words per sentence.
- The hook must be ONE simple observation from their website. Direct and plain.
- Do NOT use "aluminium" — say "factory" only
- No filler openers. No "I noticed", "I came across", "I wanted to reach out"
- If the hook sounds like it was written by a marketing agency, rewrite it simpler

Email 2 (Day 4):
- Praise: a different angle on their work — a different project, a different signal
- Picture: paint the factory walkthrough as the simplest first step
- Push: offer to send the factory video first
Sign-off: {{accountSignature}}

Email 3 (Day 7):
- Praise: their reputation, longevity, or portfolio quality
- Picture: connect their standards to what 200,000m² and 20 years on the same Zhongshan line looks like in practice; currently supplying a Sydney designer on a residential project
- Push: "worth half a day inside a longer sourcing trip"
Sign-off: {{accountSignature}}

WRITING STYLE — EMAIL 3 CRITICAL:
- No em dashes (—), no semicolons (;)
- No phrases that sound like a case study or testimonial
- No dramatic before/after storytelling
- Keep it factual and plain. One point only.
- If any sentence sounds like it came from a marketing template, cut it

Email 4 (Day 10):
- Praise: their caution about supplier decisions — frame it as a strength
- Picture: walk through the logistics honestly — airport pickup from Guangzhou, all meals, factory tour, QC lab walkthrough; they cover flights and hotel
- Push: "if a trip is in your plans, reply with the month"
Sign-off: {{accountSignature}}

Email 5 (Day 14):
- Praise: their time and patience in reading this far
- Picture: a future trip where this slots in naturally
- Push: factory visit invitation stays open; ask if there's another sourcing contact at the company
Sign-off: {{accountSignature}}

CRITICAL RULE: Email 1's Praise MUST be specific and tied to something concrete from their website. "Great company!" / "Impressive work!" / "Beautiful designs!" are vague and unacceptable. Reference a real project, suburb, service detail, or design choice.`,
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
