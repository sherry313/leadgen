module.exports = {

  '房产开发商': {
    en_label: 'Property Developer',
    zh_label: '房产开发商',
    angle_config: {
      pain_point: '批量供应稳定性、建筑工期紧张、进口风险与海关延误',
      value_prop: '工厂直采批量价、4周交期保障、澳洲本地仓备货',
      common_objections: [
        '担心进口供应不可靠影响工期',
        '担心质量无法满足澳洲建筑标准',
        '担心海关延误打乱进度',
        '担心最小起订量太大占用资金',
        '已有固定本地供应商关系难以替换',
      ],
      hook_angles: [
        '批量订单工期压力切入',
        '进口延误成本量化分析',
        '工厂直采 vs 本地经销商差价对比',
        '某开发商项目按时完工案例',
        '澳洲本地仓现货优势',
      ],
      proof_angles: [
        '18个月零交付延误记录（23家澳洲客户）',
        '单项目节省15-20%采购成本案例',
        '悉尼大型住宅项目按时交付案例',
      ],
    },
    preview_samples: [
      {
        stage: 'hook', day: 1,
        purpose: '用批量+工期痛点切入，引用官网项目体现关注，引发回复欲望',
        en: {
          subject: 'Bulk window timeline?',
          body: `Hi {first_name},

Saw your latest project at {website}—impressive scale.

Quick question: how do you handle window & door supply for tight construction timelines?

We've helped AU developers cut lead time to 4 weeks on bulk orders, factory-direct.

Worth a quick chat?

{{accountSignature}}`,
        },
        zh: {
          subject: '批量门窗工期问题？',
          body: `您好 {first_name}，

看到 {website} 上的最新项目，规模很有印象。

请教一下：贵司如何应对紧工期下的批量门窗供应问题？

我们帮澳洲开发商把批量订单交期压缩到 4 周，工厂直供。

值得快速聊聊？

—{{accountSignature}}`,
        },
      },
      {
        stage: 'social_proof', day: 7,
        purpose: '用具体项目数字建立可信度，让对方感受"这说的就是我"',
        en: {
          subject: 'How Greenline saved $180k',
          body: `Hi {first_name},

Greenline Developments (Brisbane) sourced from 3 suppliers—delays, spec mismatches, constant follow-ups.

They consolidated with us. 18-month result: $180k saved, zero missed handovers, 4 concurrent projects.

Would a breakdown of how that worked for {company} make sense?

{{accountSignature}}`,
        },
        zh: {
          subject: 'Greenline 省了 18 万',
          body: `您好 {first_name}，

Greenline Developments（布里斯班）原来用 3 家供应商——延误、规格不一、不断跟进。

整合到我们后 18 个月：省 $18 万，零次交付延误，同时运营 4 个项目。

{company} 有类似情况值得分析吗？

—{{accountSignature}}`,
        },
      },
    ],
  },

  '装修承包商': {
    en_label: 'Renovation Contractor',
    zh_label: '装修承包商',
    angle_config: {
      pain_point: '供货稳定性、产品多样性满足客户需求、定制尺寸难找、利润空间压缩',
      value_prop: '多品类一站式采购（门窗+橱柜+浴缸）、灵活小批量、定制尺寸3周交货',
      common_objections: [
        '担心产品质量不符合客户期望',
        '担心小批量订单不被重视',
        '担心交期不稳定影响施工计划',
        '担心沟通语言障碍导致规格错误',
        '担心售后问题难以处理',
      ],
      hook_angles: [
        '非标尺寸门窗定制交货时间',
        '橱柜+门窗一站式采购省时间',
        '多项目同时采购效率问题',
        '某承包商利润提升案例',
        '客户指定高端风格的低成本替代方案',
      ],
      proof_angles: [
        '某悉尼承包商转用后利润提升18%',
        '定制尺寸门窗3周交货案例',
        '同时服务5个在建项目的灵活供应案例',
      ],
    },
    preview_samples: [
      {
        stage: 'hook', day: 1,
        purpose: '从施工效率和定制尺寸切入，问具体采购痛点引发思考',
        en: {
          subject: 'Custom sizing in 3 weeks?',
          body: `Hi {first_name},

Looking at your reno projects on {website}—solid portfolio.

Do you often run into non-standard window/door sizes that delay your schedule?

We do custom sizing for AU contractors, 3-week lead time, no MOQ headaches.

Worth a look?

{{accountSignature}}`,
        },
        zh: {
          subject: '定制尺寸 3 周交货？',
          body: `您好 {first_name}，

看了 {website} 上的改造案例，作品集很扎实。

请问您是否经常遇到非标尺寸门窗导致工期延误的问题？

我们专门为澳洲承包商做定制尺寸，3 周交货，无最小起订量门槛。

值得了解一下？

—{{accountSignature}}`,
        },
      },
      {
        stage: 'differentiator', day: 10,
        purpose: '主动化解"语言/沟通障碍"反对意见，用坦诚语气建立信任',
        en: {
          subject: 'Fair concern about Chinese suppliers',
          body: `Hi {first_name},

A fair pushback I get: "Chinese suppliers sound great until specs come out wrong."

Here's what we do differently: English-speaking AU liaison on every order, CAD drawings approved before production, we replace anything that doesn't meet spec.

Solved this for 40+ AU contractors. Would the same process work for {company}?

{{accountSignature}}`,
        },
        zh: {
          subject: '关于中国供应商的合理顾虑',
          body: `您好 {first_name}，

常听到一个反对意见："中国供应商听起来不错，但规格出错就麻烦了。"

我们的做法：每个订单配英文联络员、生产前 CAD 图纸确认、有误差全额赔偿。

已为 40+ 家澳洲承包商解决这个问题。{company} 适用同样流程吗？

—{{accountSignature}}`,
        },
      },
    ],
  },

  '室内设计师': {
    en_label: 'Interior Designer',
    zh_label: '室内设计师',
    angle_config: {
      pain_point: '找到既有设计感又有成本优势的产品、客户预算压力、定制产品交期长',
      value_prop: '高颜值定制产品（橱柜、浴缸）+ 工厂直采价 + 设计师合作返利',
      common_objections: [
        '担心产品设计感不符合项目风格',
        '担心定制颜色/材质无法实现',
        '担心看不到实物样品',
        '担心客户不接受"中国进口"标签',
        '担心售后和保修问题',
      ],
      hook_angles: [
        '帮客户节省预算同时提升效果',
        '定制橱柜颜色/饰面的可能性',
        '设计师专属合作返利计划',
        '某设计项目成功案例',
        '高端外观低价位的浴缸系列',
      ],
      proof_angles: [
        '某墨尔本设计师在6个住宅项目中持续使用',
        '全哑光橱柜定制3色4周交货案例',
        '设计师合作伙伴计划覆盖30+澳洲设计师',
      ],
    },
    preview_samples: [
      {
        stage: 'hook', day: 1,
        purpose: '从设计感+预算平衡切入，触动设计师最真实的职业痛点',
        en: {
          subject: 'Matte kitchen at 40% less?',
          body: `Hi {first_name},

Love the kitchen aesthetics on {website}—that matte palette is sharp.

Question: how do you balance client budgets when they want high-end finishes?

We supply custom matte cabinetry (any RAL colour) to AU designers, factory-direct. Typical saving: 35-45%.

Curious if it fits your workflow?

{{accountSignature}}`,
        },
        zh: {
          subject: '哑光橱柜便宜 40%？',
          body: `您好 {first_name}，

看了 {website} 上的厨房案例，哑光配色非常有品位。

请问：客户想要高端饰面但预算有限时，您通常怎么平衡？

我们为澳洲设计师提供定制哑光橱柜（全系 RAL 色卡），工厂直采，通常节省 35-45%。

适合您的工作流程吗？

—{{accountSignature}}`,
        },
      },
      {
        stage: 'social_proof', day: 7,
        purpose: '用同行设计师案例建立可信度，让对方感受真实合作场景',
        en: {
          subject: 'Designer referral from Melbourne',
          body: `Hi {first_name},

Amanda Chen (interior designer, Melbourne) has used our cabinetry across 6 residential projects this year—all custom finishes, delivered in 4 weeks.

Her clients don't ask where it's from. They ask for more.

Would a sample board for {company}'s next project make sense?

{{accountSignature}}`,
        },
        zh: {
          subject: '墨尔本设计师的推荐',
          body: `您好 {first_name}，

Amanda Chen（墨尔本室内设计师）今年在 6 个住宅项目中用了我们的橱柜——全部定制饰面，4 周交货。

她的客户从不问产地，只要求"再来一套"。

为 {company} 下个项目送一套样板合适吗？

—{{accountSignature}}`,
        },
      },
    ],
  },

  '建材经销商': {
    en_label: 'Building Material Distributor',
    zh_label: '建材经销商',
    angle_config: {
      pain_point: '寻找有竞争力供应商、独家代理机会、利润空间不足、库存压力',
      value_prop: '工厂直采批发价 + 独家区域代理 + 灵活 MOQ + 营销物料支持',
      common_objections: [
        '担心库存积压风险',
        '担心售后问题谁负责',
        '担心质量不稳定影响信誉',
        '担心已有供应商关系难替换',
        '担心 MOQ 太高压占资金',
      ],
      hook_angles: [
        '独家区域代理机会',
        '当前供应商利润空间被压缩',
        '批发价 vs 行业均价差距对比',
        '某经销商引入后毛利提升案例',
        '新品类（浴缸）拓展市场机会',
      ],
      proof_angles: [
        '已有8个国家/地区经销商合作网络',
        '某澳洲经销商引入后1年增长35%案例',
        '区域独家代理机制保护销售领地',
      ],
    },
    preview_samples: [
      {
        stage: 'hook', day: 1,
        purpose: '用独家代理机会作钩子，触发经销商对新利润来源的兴趣',
        en: {
          subject: 'Exclusive territory still open',
          body: `Hi {first_name},

Checked your product range at {website}—strong coverage across the category.

We're looking for 1 exclusive distributor in your region for our AU window & door line (factory-direct, 30% better margins than typical import brands).

That slot is still open.

Worth a 15-min call this week?

{{accountSignature}}`,
        },
        zh: {
          subject: '该区域独家代理仍在开放',
          body: `您好 {first_name}，

看了 {website} 的产品线，覆盖很全面。

我们正在澳洲寻找 1 家区域独家代理，主推工厂直供门窗线（比进口品牌高 30% 利润空间）。

该名额目前仍开放。

本周 15 分钟通话值得吗？

—{{accountSignature}}`,
        },
      },
      {
        stage: 'value_drop', day: 4,
        purpose: '用具体利润数据化解顾虑，用损失厌恶激发行动',
        en: {
          subject: 'What 30% margin looks like',
          body: `Hi {first_name},

Most AU distributors carry import windows at 18-22% margin (after freight, duties, middlemen).

Our direct model: 30-35% margin, we handle customs paperwork, you get co-branded marketing assets.

Build & Renovate Supplies (Perth) added our line 8 months ago—now 22% of their revenue.

Want the numbers?

{{accountSignature}}`,
        },
        zh: {
          subject: '30% 利润率是什么概念',
          body: `您好 {first_name}，

大多数澳洲经销商的进口门窗利润率在 18-22%（含运费、关税、中间商环节）。

我们的直供模式：30-35% 利润率，清关手续由我们处理，还提供联名营销物料。

Build & Renovate Supplies（珀斯）8 个月前引入我们——现占其营收 22%。

需要具体数据吗？

—{{accountSignature}}`,
        },
      },
    ],
  },

  '工程承包商': {
    en_label: 'Construction Contractor',
    zh_label: '工程承包商',
    angle_config: {
      pain_point: '大型项目批量采购成本、供应链稳定性、多地点配送协调难',
      value_prop: '大批量专属报价 + 分批按进度发货 + 专项工程对接团队',
      common_objections: [
        '担心大批量质量一致性',
        '担心产品不符合NCC/BCA认证要求',
        '担心分批交货节奏无法匹配施工进度',
        '担心跨州配送成本过高',
        '担心缺乏本地售后支持',
      ],
      hook_angles: [
        '多地点工程同步供应方案',
        '大批量专属折扣与工厂直采差价',
        'NCC/AS2047认证产品合规保障',
        '某大型商业项目成功供货案例',
        '分期付款+分批交货灵活机制',
      ],
      proof_angles: [
        '成功供应某澳洲商业综合体项目（3个州同步配送）',
        '工程级AS2047、WERS认证产品线',
        '比本地经销商报价低20-25%的批量定价',
      ],
    },
    preview_samples: [
      {
        stage: 'hook', day: 1,
        purpose: '从大批量成本优化切入，体现对工程采购规模的理解',
        en: {
          subject: 'Commercial window spec for {company}?',
          body: `Hi {first_name},

Seen your commercial portfolio on {website}—serious scale.

For projects that size, window & door procurement usually represents 8-12% of total build cost.

We specialise in bulk commercial supply direct from factory—typically 20-25% below local distributor pricing.

Worth a quote on your next project?

{{accountSignature}}`,
        },
        zh: {
          subject: '{company} 的商业门窗规格？',
          body: `您好 {first_name}，

看了 {website} 上的商业项目组合，规模相当可观。

这类项目中，门窗采购通常占总建造成本的 8-12%。

我们专注工厂直供商业批量采购，通常比本地经销商低 20-25%。

下个项目报个价值得吗？

—{{accountSignature}}`,
        },
      },
      {
        stage: 'differentiator', day: 10,
        purpose: '主动化解"认证标准"顾虑，体现对澳洲建筑规范的了解',
        en: {
          subject: 'The NCC compliance question',
          body: `Hi {first_name},

A fair concern I hear: "Can Chinese-made windows meet NCC/BCA energy ratings?"

Short answer: yes—our products carry AS2047, WERS, and climate-zone energy ratings.

We've supplied compliant product for commercial builds in VIC, NSW, and QLD. Happy to send the certification bundle.

{{accountSignature}}`,
        },
        zh: {
          subject: '关于 NCC 合规性的问题',
          body: `您好 {first_name}，

常收到一个合理顾虑："中国产门窗能满足 NCC/BCA 能效标准吗？"

简短回答：可以——我们的产品持有 AS2047、WERS 认证及各气候区能效评级。

已为维州、新州、昆州的商业建筑提供合规产品，可发送完整认证文件包。

—{{accountSignature}}`,
        },
      },
    ],
  },

  '家具制造商': {
    en_label: 'Furniture Manufacturer',
    zh_label: '家具制造商',
    angle_config: {
      pain_point: '配套建材采购成本、橱柜/卫浴产品整合、OEM/ODM 定制需求',
      value_prop: '家具+橱柜+浴缸整合采购 + OEM 定制 + 工厂级直采价',
      common_objections: [
        '担心橱柜风格与家具产品线不协调',
        '担心定制 OEM 起订量太高',
        '担心品控与质检流程不透明',
        '担心知识产权保护问题',
        '已有整合供应链难以调整',
      ],
      hook_angles: [
        '橱柜+家具整合套餐降低采购成本',
        'OEM 定制独家设计知识产权保护',
        '浴缸产品线拓展新收入来源',
        '某家具商整合采购降本案例',
        '设计协作+工厂定制全流程服务',
      ],
      proof_angles: [
        '为某澳洲家具品牌代工定制橱柜系列（3色+12SKU）',
        '含开模90天完成OEM全流程交付',
        '知识产权保护协议+独家设计封锁竞争',
      ],
    },
    preview_samples: [
      {
        stage: 'hook', day: 1,
        purpose: '从家具+橱柜整合角度切入，暗示成本优化和产品线延伸机会',
        en: {
          subject: 'Cabinet OEM to match your line?',
          body: `Hi {first_name},

Your furniture collection at {website} is cohesive—strong design language.

Do your clients ever ask for matching kitchen cabinetry? Or do you source that separately?

We OEM custom cabinetry for AU furniture brands—same finishes, coordinated specs, factory-direct cost.

Worth exploring?

{{accountSignature}}`,
        },
        zh: {
          subject: '配套橱柜 OEM 定制？',
          body: `您好 {first_name}，

看了 {website} 的家具系列，设计语言很统一，整体感强。

客户是否有时会要求配套厨房橱柜？还是您分开采购？

我们为澳洲家具品牌做定制橱柜 OEM——同款饰面，协调规格，工厂直采成本。

值得探索一下？

—{{accountSignature}}`,
        },
      },
      {
        stage: 'social_proof', day: 7,
        purpose: '用同类制造商合作案例建立可信度，体现OEM能力和交付速度',
        en: {
          subject: 'AU furniture brand OEM story',
          body: `Hi {first_name},

Hampton & Co (Melbourne furniture brand) wanted a matching cabinet line—their supplier couldn't do custom finishes at scale.

We did: 12 SKUs, bespoke handles, 3 colourways. 90-day turnaround including tooling. Now 30% of their revenue.

Would a similar capability audit for {company} be useful?

{{accountSignature}}`,
        },
        zh: {
          subject: '澳洲家具品牌 OEM 案例',
          body: `您好 {first_name}，

Hampton & Co（墨尔本家具品牌）想要配套橱柜系列——原供应商无法做规模化定制饰面。

我们做到了：12 个 SKU、定制拉手、3 种配色，含开模 90 天交付。现占其营收 30%。

为 {company} 做类似能力评估有意义吗？

—{{accountSignature}}`,
        },
      },
    ],
  },

  '酒店装修采购': {
    en_label: 'Hotel FF&E Procurement',
    zh_label: '酒店装修采购',
    angle_config: {
      pain_point: '大规模标准化采购、装修工期紧、星级品质一致性要求、成本控制压力',
      value_prop: '酒店级批量定制（浴缸+橱柜）+ 统一规格全批次供应 + 项目制专属团队',
      common_objections: [
        '担心批量产品品质一致性不达标',
        '担心不符合酒店星级装修标准',
        '担心交期无法配合装修工程进度',
        '担心缺乏本地售后支持',
        '采购决策流程复杂需要多方审批',
      ],
      hook_angles: [
        '酒店客房批量卫浴定制方案',
        '独立式浴缸品质+价格对比分析',
        '某五星/精品酒店翻新供货案例',
        '统一规格大批量质量保证机制',
        '装修工期匹配的分批交货计划',
      ],
      proof_angles: [
        '为某悉尼精品酒店供应120间客房浴缸（10周交付）',
        '比原供应商报价低28%的批量折扣',
        '同一供货商服务3家集团旗下酒店',
      ],
    },
    preview_samples: [
      {
        stage: 'hook', day: 1,
        purpose: '从酒店批量卫浴采购痛点切入，体现对行业采购规模的理解',
        en: {
          subject: 'Hotel bathtub spec for next reno?',
          body: `Hi {first_name},

Noticed your hotel portfolio on {website}—looks like a significant renovation pipeline ahead.

For hotel-scale bathtub procurement, we supply freestanding and built-in options to AU hospitality projects—consistent spec across all rooms, factory-direct pricing.

Are you currently sourcing FF&E for any upcoming refurb?

{{accountSignature}}`,
        },
        zh: {
          subject: '下次翻新的酒店浴缸规格？',
          body: `您好 {first_name}，

看到 {website} 上的酒店项目组合，似乎有不少翻新计划在推进。

我们为澳洲酒店项目提供独立式和嵌入式浴缸批量供应——全客房统一规格，工厂直采价格。

目前有正在进行采购的翻新项目吗？

—{{accountSignature}}`,
        },
      },
      {
        stage: 'social_proof', day: 7,
        purpose: '用实际酒店项目数据和成本数字建立专业可信度',
        en: {
          subject: 'How we supplied 120 rooms in Sydney',
          body: `Hi {first_name},

The Wharf Boutique (Sydney) needed 120 identical freestanding bathtubs in 10 weeks—consistent finish, tight spec tolerances.

Two shipments. Passed QC. Came in 28% below their previous supplier quote.

That timeline matches most hotel reno schedules. Does {company}'s next project fit?

{{accountSignature}}`,
        },
        zh: {
          subject: '我们如何供应悉尼 120 间客房',
          body: `您好 {first_name}，

The Wharf Boutique（悉尼）需要 120 个统一规格的独立式浴缸，10 周内交货，饰面一致，公差严格。

分两批交付，通过品质检验，比其原供应商报价低 28%。

这个时间节奏与大多数酒店翻新一致。{company} 的下个项目符合这个情况吗？

—{{accountSignature}}`,
        },
      },
    ],
  },

  '超市建材采购': {
    en_label: 'Retail Hardware Buyer',
    zh_label: '超市建材采购',
    angle_config: {
      pain_point: '产品差异化不足、上架利润空间有限、稳定批量供应、库存周转压力',
      value_prop: '自有品牌 OEM + 工厂直采零售价 + 稳定批量供货 + 专属零售包装支持',
      common_objections: [
        '担心产品与现有品牌形成冲突',
        '担心零售包装质量不达标',
        '担心需要长期大批量采购承诺',
        '担心产品不符合澳洲安全标准',
        '担心库存周转不足影响陈列效率',
      ],
      hook_angles: [
        '自有品牌橱柜/浴缸 OEM 机会',
        '现有品类利润空间对比分析',
        '某零售商独家系列上架成功案例',
        '试销机制降低新品引入风险',
        '快速补货小批量灵活机制',
      ],
      proof_angles: [
        '为某澳洲建材零售商开发自有品牌系列（40+门店）',
        '季度稳定供货+灵活补单机制',
        '零售包装+陈列物料一站式配套支持',
      ],
    },
    preview_samples: [
      {
        stage: 'hook', day: 1,
        purpose: '从零售利润+品类差异化角度切入，触发采购经理对新品类的兴趣',
        en: {
          subject: 'Private label bathware at retail margins?',
          body: `Hi {first_name},

Your range at {website} covers the category well—curious what your margin looks like on bathware vs cabinets.

We help AU retailers build private label bath & kitchen lines—factory-direct, retail-ready packaging, 35%+ margins.

Is that a category you're actively developing?

{{accountSignature}}`,
        },
        zh: {
          subject: '自有品牌卫浴能达零售利润率？',
          body: `您好 {first_name}，

看了 {website} 的产品线，品类覆盖很全——好奇卫浴与橱柜产品的利润率对比如何？

我们帮助澳洲零售商打造自有品牌浴厨产品线——工厂直采，零售级包装，35%+利润率。

这是您正在主动开发的品类吗？

—{{accountSignature}}`,
        },
      },
      {
        stage: 'differentiator', day: 10,
        purpose: '化解"需要长期大批量承诺"的顾虑，用试销机制降低准入门槛',
        en: {
          subject: 'No 12-month commitment required',
          body: `Hi {first_name},

A fair concern I hear from retail buyers: "We can't commit to 12-month forecasts for a new supplier."

Our model: 3-month pilot SKU, minimum 50 units. If it moves, scale. If not, no penalty.

One major AU hardware chain used this model before expanding to 40+ stores.

Would a pilot structure work for {company}?

{{accountSignature}}`,
        },
        zh: {
          subject: '无需 12 个月采购承诺',
          body: `您好 {first_name}，

零售采购经理常有一个合理顾虑："对新供应商无法做 12 个月预测承诺。"

我们的方案：3 个月试销 SKU，最少 50 件。动销就扩大，不动就无违约成本。

某澳洲大型连锁用这个模式测试后扩展到 40+ 门店。

这个试销结构适合 {company} 吗？

—{{accountSignature}}`,
        },
      },
    ],
  },

};
