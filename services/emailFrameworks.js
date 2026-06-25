// Email frameworks. Each `sequence_prompt` defines ONLY the framework's structure
// + writing style — it is business-agnostic. All factual content (company, product,
// advantage, case/proof, low-risk offer, signature) comes from the SELLER block that
// the generation prompt injects from the user's 业务信息. Frameworks must never bake
// in a specific company, factory, location, product, or certification.
//
// Shared rules every sequence_prompt relies on (enforced here + in the system prompt):
// - SOURCE OF TRUTH: use ONLY the seller details in the SELLER block; never invent
//   facts, names, locations, sizes, numbers, or certifications not given.
// - CTA: use the seller's low-risk offer as the call-to-action when provided;
//   otherwise end with a light, low-commitment question. Never hard-sell.
// - STYLE: 40-80 word bodies; subject under 7 words, lowercase except proper nouns,
//   never Title Case; no em dashes, no semicolons; short sentences; sign-off is
//   exactly {{accountSignature}} on its own line and nothing else.

const SHARED_RULES = `SOURCE OF TRUTH — use ONLY the seller's real details from the SELLER block above (company, product/service, advantage, case/proof, low-risk offer, target customer). NEVER invent a company name, factory, location, size, number, certification, or customer that is not in the SELLER block. If a detail is missing, write around it — do not fabricate one.
CTA — when the seller gave a "low-risk offer", make it the call-to-action; otherwise end with one light, low-commitment question. Never push a purchase decision or hard sell.
STYLE — body 40-80 words. Subject under 7 words, first letter lowercase, only capitalise proper nouns (never Title Case, never ALL CAPS). No em dashes, no semicolons. Short plain sentences, max ~12 words each. Write like a real person who researched them, not a marketing template. Sign-off: exactly {{accountSignature}} on its own line, nothing before or after it.
PERSONALISATION — Email 1 opens with ONE specific observation from the prospect's website. If no website content is available, open plainly with "Saw [Company] —" then your point. Later emails do not need to be personalised to the website.`;

module.exports = {

  'peter_kang_3part': {
    key: 'peter_kang_3part',
    name: 'Peter Kang 三段式框架',
    en_name: 'Peter Kang 3-Part Framework',
    source: 'Peter Kang 高转化冷邮件框架',
    description: 'Personalization → Identity → Offer',
    structure: [
      { stage: 'Personalization', purpose: '引用对方可验证的具体细节，展示你真的研究过他们' },
      { stage: 'Identity',        purpose: '用具体数字建立信任（来自卖家的优势/案例）' },
      { stage: 'Offer',           purpose: '低门槛零承诺邀请（来自卖家的零风险入口）' },
    ],
    best_for: '高价值 B2B 客户、精准触达',
    icon: '🎯',
    sample_subject: 'quick thought on your sourcing',
    sample_email_body: `Peter Kang 3-part structure: Personalization → Identity → Offer.
Email 1 references one specific website detail, asks a customer-angle pain question, states the seller's identity using their real advantage, then makes the seller's low-risk offer as the CTA. ~50-60 words, {{accountSignature}} as the only sign-off. The facts come entirely from the SELLER block — no baked-in company.`,
    sequence_prompt: `This is the Peter Kang 3-part framework: Personalization → Identity → Offer. Produce a 5-email sequence.

${SHARED_RULES}

=== EMAIL 1 (Day 1) — personalised hook (THE ONLY FULLY PERSONALISED EMAIL) ===
1. Hook: one simple, specific observation from their website.
2. Pain question: a customer-angle question about the risk/cost they carry today in the area the seller helps with (derive it from the seller's product + advantage). "for you", not "buy from us".
3. Identity: one line establishing the seller using their REAL advantage/credentials from the SELLER block (use the actual numbers/facts given; if none, keep it plain).
4. Offer: the seller's low-risk offer as a low-friction CTA.

=== EMAIL 2 (Day 3) — useful insight, no ask ===
Share one genuinely useful idea relevant to the prospect's buying decision in the seller's category. No pitch. Soft CTA tied to the low-risk offer ("if useful, I can send ours — just for your reference").

=== EMAIL 3 (Day 5) — value / proof ===
If the seller gave a case/proof, use it here as real social proof (with the specific details given, never invented). Otherwise give one concrete, checkable value point about the product/advantage. End with the low-risk offer.

=== EMAIL 4 (Day 7) — offer again, different angle ===
Re-extend the seller's low-risk offer from a fresh angle (a different benefit or use case). Keep it concrete and low-pressure.

=== EMAIL 5 (Day 10) — breakup ===
Warm, brief. Acknowledge no reply, leave the door open. Ask if someone else at [Company] handles this kind of sourcing. {{accountSignature}}.`,
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
      { day: 7,  stage: 'Social Proof',  purpose: '卖家的真实案例/背书' },
      { day: 10, stage: 'Differentiator',purpose: '化解反对意见，突出卖家优势' },
      { day: 14, stage: 'Breakup',       purpose: '礼貌告别+留资源' },
    ],
    best_for: '正式 B2B 客户、需要长期跟进的复杂决策',
    icon: '📊',
    sample_subject: 'sourcing timeline?',
    sample_email_body: `5-stage sequence: Hook → Value Drop → Social Proof → Differentiator → Breakup, on days 1/4/7/10/14. Every fact (product, advantage, proof, offer) comes from the SELLER block. The CTA is the seller's low-risk offer.`,
    sequence_prompt: `This is a 5-email cold sequence: Hook → Value Drop → Social Proof → Differentiator → Breakup, sent on days 1, 4, 7, 10, 14. GOAL: get a reply — every email ends with one clear low-commitment question (use the seller's low-risk offer when given).

${SHARED_RULES}

=== EMAIL 1 (Day 1) — Hook ===
One simple observation from their website. One direct question about how they currently handle the need the seller's product addresses. One line on what the seller does (from the SELLER block). Low-commitment CTA.

=== EMAIL 2 (Day 4) — Value Drop ===
Different angle from Email 1. One specific value point from the seller's advantage, with a concrete detail if one is given. Address ONE pain point of this customer type.

=== EMAIL 3 (Day 7) — Social Proof ===
Use the seller's case/proof from the SELLER block as social proof, with the exact details given. If no case was provided, use the seller's verifiable advantage as credibility instead. Do NOT invent customer names, quotes, or numbers.

=== EMAIL 4 (Day 10) — Differentiator ===
"A fair pushback I get…" tone. Honestly address ONE common objection, then answer it with the seller's real advantage/low-risk offer.

=== EMAIL 5 (Day 14) — Breakup ===
Brief, warm farewell. Offer a specific low-commitment resource tied to the seller's low-risk offer (sample/catalog/quote/spec sheet). Ask if someone else handles this.`,
  },

  'cold_7_step': {
    key: 'cold_7_step',
    name: 'Cold 7-Step 开发序列',
    en_name: '7-Email Cold Outreach Framework',
    source: '7-Email Cold Outreach Framework',
    description: 'Initial Outreach → Value Add → Social Proof → Different Angle → Quick Check-in → Last Value → Breakup',
    structure: [
      { day: 0,  stage: 'Initial Outreach', purpose: '个性化介绍 + 明确价值，一个低承诺问题' },
      { day: 3,  stage: 'Value Add',        purpose: '提供真正有用的信息，完全不提任何请求' },
      { day: 7,  stage: 'Social Proof',     purpose: '用卖家的案例/资质作为可信度背书' },
      { day: 10, stage: 'Different Angle',  purpose: '换一个完全不同的切入点' },
      { day: 14, stage: 'Quick Check-in',   purpose: '极简、低压力跟进，2-3 句话' },
      { day: 21, stage: 'Last Value',       purpose: '最后一份真诚价值：卖家的零风险入口' },
      { day: 28, stage: 'Breakup',          purpose: '尊重式收尾，给三个回复选项' },
    ],
    best_for: '需要长期培育的 B2B 买家：承包商、装修公司、批发陈列室、设计师',
    icon: '🏗️',
    sample_subject: 'china sourcing for [product]',
    sample_email_body: `7-email sequence on days 0/3/7/10/14/21/28. Each email uses the seller's real product, advantage, case and low-risk offer from the SELLER block. No baked-in company or factory.`,
    sequence_prompt: `This is a 7-email B2B cold outreach sequence, sent on days 0, 3, 7, 10, 14, 21, 28. Each email ends with ONE clear low-commitment question. English only.

${SHARED_RULES}

=== EMAIL 1 (Day 0) — Initial Outreach ===
Personalised intro. Hook from their website. Ask how they currently source / handle the need the seller's product addresses. One brief line on the seller (from the SELLER block). Low-commitment CTA.

=== EMAIL 2 (Day 3) — Value Add ===
Provide genuine value, NO ask for business. Share something useful about the product category or a relevant standard/consideration tied to the seller's advantage. Why it matters for them. Soft question at the end.

=== EMAIL 3 (Day 7) — Social Proof ===
Demonstrate credibility using the seller's case/proof or certifications from the SELLER block (exact details only, nothing invented). Offer to share evidence (test reports, photos, references) — tie to the low-risk offer.

=== EMAIL 4 (Day 10) — Different Angle ===
A completely different angle drawn from another part of the seller's advantage/service (e.g. customisation, lead time, quality control). Connect it to a real need of this customer type.

=== EMAIL 5 (Day 14) — Quick Check-in ===
Very short, 2-3 sentences. Reference earlier emails briefly. A one-word reply works.

=== EMAIL 6 (Day 21) — Last Value ===
Final piece of genuine value: extend the seller's low-risk offer in full (what it includes, why it's low-risk). No pressure framing.

=== EMAIL 7 (Day 28) — Breakup ===
Respectful close. Give three reply options: (1) interested but timing is bad, (2) not interested, fine, (3) wrong person, point me to who handles sourcing. Door stays open.`,
  },

  'aida': {
    key: 'aida',
    name: 'AIDA 经典营销 4 段',
    en_name: 'AIDA Model',
    source: 'Udemy 课程',
    description: 'Attention → Interest → Desire → Action',
    structure: [
      { letter: 'A', stage: 'Attention', purpose: '抓住读者注意力' },
      { letter: 'I', stage: 'Interest',  purpose: '个性化引起兴趣' },
      { letter: 'D', stage: 'Desire',    purpose: '建立渴望（卖家优势/案例）' },
      { letter: 'A', stage: 'Action',    purpose: '请求回应（卖家零风险入口）' },
    ],
    best_for: '初次冷接触、决策路径较长',
    icon: '🎯',
    sample_subject: 'question about your business',
    sample_email_body: `Each email follows AIDA (Attention → Interest → Desire → Action). Desire is built from the seller's real advantage/case; Action is the seller's low-risk offer. All facts from the SELLER block.`,
    sequence_prompt: `Produce a 5-email sequence where each email follows AIDA (Attention → Interest → Desire → Action). The Action is always the seller's low-risk offer (or a light reply-ask if none given) — never a direct purchase push.

${SHARED_RULES}

Email 1 (Day 1):
- Attention: a specific detail from their website or work.
- Interest: connect that to a need they likely already think about, in the seller's category.
- Desire: what the seller's real advantage/product would mean for them (use SELLER-block facts only).
- Action: the seller's low-risk offer.

Email 2 (Day 4): different angle — the gap between what suppliers promise and what shows up. Desire: the seller's advantage as the safer choice. Action: the low-risk offer (or a lower-friction first step toward it).

Email 3 (Day 7): lead with the seller's facts/proof from the SELLER block. Desire: frame it as one more option in their back pocket. Action: low-risk offer.

Email 4 (Day 10): acknowledge a common concern about switching/trying a new supplier. Interest: address it honestly with the seller's advantage. Action: low-risk offer.

Email 5 (Day 14): warm breakup. Keep the offer open. Action: ask if someone else at [Company] handles this.`,
  },

  'bab': {
    key: 'bab',
    name: 'BAB 现状-未来-桥梁',
    en_name: 'Before-After-Bridge',
    source: 'Udemy 课程',
    description: 'Before → After → Bridge',
    structure: [
      { letter: 'B', stage: 'Before', purpose: '描述对方现在的世界' },
      { letter: 'A', stage: 'After',  purpose: '描绘问题解决后的世界' },
      { letter: 'B', stage: 'Bridge', purpose: '揭示如何到达（卖家方案/零风险入口）' },
    ],
    best_for: '正在经历明显问题的客户',
    icon: '🌉',
    sample_subject: 'tired of supplier surprises?',
    sample_email_body: `Each email follows BAB (Before → After → Bridge). The Bridge is the seller's solution and low-risk offer. All facts from the SELLER block.`,
    sequence_prompt: `Produce a 5-email sequence where each email follows BAB (Before → After → Bridge). The Bridge is always the seller's solution + low-risk offer.

${SHARED_RULES}

Email 1 (Day 1): Before — their current friction in the seller's area. After — the better state once it's solved. Bridge — the seller's low-risk offer.
Email 2 (Day 4): Before — another pain (surprises that surface only after ordering). After — what changes with the seller's advantage. Bridge — a low-friction first step toward the low-risk offer.
Email 3 (Day 7): Before — the limits of judging suppliers on paper. After — what the seller's real proof/advantage (from the SELLER block) shows. Bridge — the low-risk offer.
Email 4 (Day 10): Before — the reason buyers hesitate to switch/try. After — the honest upside of the seller's offer. Bridge — restate the low-risk offer.
Email 5 (Day 14): Before — the unresolved decision they still face. After — a future where it slots in naturally. Bridge — offer stays open; ask for the right contact.`,
  },

  'pas': {
    key: 'pas',
    name: 'PAS 痛点驱动 3 段',
    en_name: 'Problem-Agitate-Solve',
    source: 'Udemy 课程',
    description: '识别痛点 → 加剧痛点 → 提供方案',
    structure: [
      { letter: 'P', stage: 'Problem', purpose: '识别一个痛点' },
      { letter: 'A', stage: 'Agitate', purpose: '加剧那个痛点' },
      { letter: 'S', stage: 'Solve',   purpose: '提供解决方案（卖家优势/零风险入口）' },
    ],
    best_for: '当前供应商有明显问题的客户',
    icon: '⚡',
    sample_subject: 'supplier delays add up',
    sample_email_body: `Each email follows PAS (Problem → Agitate → Solve). The Solve is the seller's advantage + low-risk offer. All facts from the SELLER block — no invented numbers.`,
    sequence_prompt: `Produce a 5-email sequence where each email follows PAS (Problem → Agitate → Solve). The Solve is always the seller's advantage and low-risk offer. Do NOT invent statistics — only agitate with plausible, general consequences unless the seller supplied real numbers.

${SHARED_RULES}

Email 1 (Day 1): Problem — sourcing/buying blind in the seller's category. Agitate — where this usually goes wrong. Solve — the seller's low-risk offer as the cleaner path.
Email 2 (Day 4): Problem — trusting photos/samples over reality. Agitate — the gap that creates. Solve — a low-friction first step toward the offer.
Email 3 (Day 7): Problem — hard to judge scale/consistency from outside. Agitate — the risk it leaves. Solve — the seller's real proof/advantage (SELLER block); invite the offer.
Email 4 (Day 10): Problem — buyers think trying a new supplier is costly/risky. Agitate — doing nothing costs more. Solve — the seller's low-risk offer removes that risk.
Email 5 (Day 14): Problem — the decision keeps getting pushed. Agitate — the uncertainty doesn't go away. Solve — offer stays open; ask for the right contact.`,
  },

  'byaf': {
    key: 'byaf',
    name: 'BYAF 自由选择',
    en_name: 'But You Are Free',
    source: 'Udemy 课程（心理学验证）',
    description: '明确给拒绝的自由，反而提升回复率',
    structure: [
      { stage: '主体内容',      purpose: '正常表达请求（卖家零风险入口）' },
      { stage: 'Freedom 明示', purpose: '"如果不方便，完全没关系"' },
    ],
    best_for: '高姿态客户、被骚扰过的客户',
    icon: '🕊️',
    sample_subject: 'a small ask',
    sample_email_body: `Each email makes the seller's low-risk offer, then explicitly gives the reader permission to decline (BYAF). All facts from the SELLER block.`,
    sequence_prompt: `Produce a 5-email sequence using BYAF — make the seller's offer, then explicitly give the recipient permission to decline. EVERY email must end with a natural-sounding freedom phrase (never a script).

${SHARED_RULES}

Email 1 (Day 1): reference a specific website detail, then frame the seller's low-risk offer as worth considering. Freedom phrase: "if not, totally understand — appreciate you reading this far".
Email 2 (Day 4): a short note on why buyers benefit from the seller's offer; suggest a softer first step. Freedom phrase: "completely up to you, of course".
Email 3 (Day 7): use the seller's real proof/advantage (SELLER block), extend the offer again. Freedom phrase: "either way, hope this is useful to know".
Email 4 (Day 10): address the most common reason buyers hesitate; be honest about what the offer involves. Freedom phrase: "totally understand if the timing isn't right".
Email 5 (Day 14): warm breakup; offer stays open; ask for the right contact. Freedom phrase: "no expectation, just leaving the door open".

CRITICAL: every email must contain a clear, natural sentence that gives the reader permission to ignore or decline. This is BYAF's defining mechanic.`,
  },

  'sch': {
    key: 'sch',
    name: 'SCH 大想法 + 论据链',
    en_name: 'Star-Chain-Hook',
    source: 'Udemy 课程',
    description: '大想法 → 一连串事实/好处 → CTA',
    structure: [
      { letter: 'S', stage: 'Star',  purpose: '大想法' },
      { letter: 'C', stage: 'Chain', purpose: '事实、理由、好处（卖家优势/案例）' },
      { letter: 'H', stage: 'Hook',  purpose: '行动召唤（卖家零风险入口）' },
    ],
    best_for: '数据驱动型决策者、采购总监',
    icon: '⭐',
    sample_subject: 'one idea on sourcing',
    sample_email_body: `Each email follows SCH (Star → Chain → Hook). The Chain stays inside the seller's real facts from the SELLER block; the Hook is the seller's low-risk offer.`,
    sequence_prompt: `Produce a 5-email sequence where each email follows SCH (Star → Chain → Hook). The Chain must stay inside the seller's real facts from the SELLER block. The Hook is the seller's low-risk offer.

${SHARED_RULES}

Email 1 (Day 1): Star — the core idea of what the seller's offer solves. Chain — 1-2 supporting facts from the seller's advantage. Hook — the low-risk offer.
Email 2 (Day 4): Star — a different framing (e.g. the gap between promise and delivery). Chain — the seller's relevant advantage. Hook — a lower-friction first step.
Email 3 (Day 7): Star — the seller's scale/quality/track record as the big idea. Chain — the real proof/case from the SELLER block. Hook — the offer.
Email 4 (Day 10): Star — addressing the trying-a-new-supplier question head-on. Chain — what the seller's offer concretely includes. Hook — the offer.
Email 5 (Day 14): Star — one final reason it matters. Chain — offer stays open. Hook — ask for the right contact.`,
  },

  'three_ps': {
    key: 'three_ps',
    name: '3P 真诚共情',
    en_name: "3 P's (Praise-Picture-Push)",
    source: 'Udemy 课程',
    description: '真诚赞美 → 因果场景 → 邀请承诺',
    structure: [
      { letter: 'P', stage: 'Praise',  purpose: '真诚、尊重的赞美' },
      { letter: 'P', stage: 'Picture', purpose: '用因果推理描绘场景' },
      { letter: 'P', stage: 'Push',    purpose: '请求承诺（卖家零风险入口）' },
    ],
    best_for: '室内设计师、建筑师、作品导向客户',
    icon: '💝',
    sample_subject: 'loved your recent project',
    sample_email_body: `Each email follows 3 P's (Praise → Picture → Push). Praise is specific and from their website; Picture uses the seller's product/advantage; Push is the seller's low-risk offer.`,
    sequence_prompt: `Produce a 5-email sequence where each email follows 3 P's (Praise → Picture → Push). Praise must be specific and genuine, drawn from their actual website (a project, suburb, style, service) — NEVER generic flattery like "great company". Picture uses the seller's product/advantage. Push ties to the seller's low-risk offer.

${SHARED_RULES}

Email 1 (Day 1): Praise — a concrete detail from their website. Picture — connect what they care about to what the seller's product/advantage offers. Push — the seller's low-risk offer.
Email 2 (Day 4): Praise — a different angle on their work. Picture — the seller's offer as the simplest next step. Push — a low-friction first step.
Email 3 (Day 7): Praise — their reputation/standards. Picture — connect those standards to the seller's real proof/advantage (SELLER block). Push — the offer.
Email 4 (Day 10): Praise — their caution about supplier decisions, framed as a strength. Picture — what the seller's offer concretely involves. Push — the offer.
Email 5 (Day 14): Praise — their time and patience. Picture — a future where this fits naturally. Push — offer stays open; ask for the right contact.

CRITICAL: Email 1's Praise MUST be tied to something concrete from their website. "Great company!" / "Impressive work!" are unacceptable.`,
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
