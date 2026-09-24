(function () {
  'use strict';

  const LANG_KEY = 'zhituoke_language';
  const THEME_KEY = 'zhituoke_theme';
  const root = document.documentElement;
  const savedLang = localStorage.getItem(LANG_KEY) || 'zh';
  const savedTheme = localStorage.getItem(THEME_KEY);
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.lang = savedLang === 'en' ? 'en' : 'zh';
  root.dataset.theme = savedTheme || (systemDark ? 'dark' : 'light');
  root.lang = root.dataset.lang === 'en' ? 'en' : 'zh-CN';

  const exact = new Map(Object.entries({
    '智拓客':'LeadPilot','概览':'Overview','获客大盘':'Lead Dashboard','获客 · 找客户':'Lead Generation','邮件获客':'Email Outreach','SGO 独立站获客':'SGO Website Leads','海关数据':'Customs Data','社媒自动发帖':'Social Auto-posting','转化工具':'Conversion Tools','获客工作台':'Lead Workspace','报价自动化':'Quote Automation','免费工具':'Free Tools','DNS 记录生成器':'DNS Record Generator','Spam 敏感词检查':'Spam Word Checker','账户':'Account','个人中心':'Profile','定价 / 套餐':'Pricing / Plans','设置':'Settings','管理员':'Administrator','开发中':'Coming Soon','已上线':'Live',
    '智拓客 · 控制台':'LeadPilot · Console','找客户演示':'Lead Demo','升级套餐':'Upgrade Plan','你的业务概览':'Your business overview','欢迎回来':'Welcome back','下午好，欢迎回来':'Good afternoon, welcome back','早上好，欢迎回来':'Good morning, welcome back','中午好，欢迎回来':'Good afternoon, welcome back','晚上好，欢迎回来':'Good evening, welcome back','凌晨好，欢迎回来':'Welcome back','找客户 · 写邮件 · 发跟进 —— 今天也帮你自动跑起来。':'Find leads · Write emails · Follow up — keep your outreach moving today.','开始找客户':'Find Leads','看客户':'View Leads','核心指标':'Key Metrics','总客户数':'Total Leads','累计客户':'All leads','邮件发送':'Emails Sent','累计发出':'Total sent','发送率':'Send Rate','收到回复':'Replies','接入中':'Connecting','接 Instantly 后显示':'Available after connecting Instantly','获客转化':'Lead Conversion','获客漏斗':'Lead Funnel','从扫描到发信，每一步剩下多少':'Progress from scanning to outreach','扫描公司':'Companies Scanned','精准客户':'Qualified Leads','已发开发信':'Emails Sent','最近搜索':'Recent Searches','你最近跑的几次获客':'Your latest lead searches','加载中…':'Loading…','还没有搜索记录':'No searches yet',
    '外贸冷邮件自动化 · 已上线':'Cold Email Automation · Live','拓客这件事':'Lead generation','交给 AI 就好':'Let AI handle it','你专注成交,剩下的我们来。':'You close the deals. We handle the rest.','开始找寻你的客户':'Start Finding Leads',
    '登录':'Sign In','注册':'Sign Up','退出':'Sign Out','邮箱':'Email','密码':'Password','确认密码':'Confirm Password','忘记密码？':'Forgot password?','登录账户':'Sign In','创建账户':'Create Account','手机号':'Phone','验证码':'Verification Code','发送验证码':'Send Code','我已阅读并同意智拓客的':'I have read and agree to LeadPilot’s','《用户协议》':'Terms of Service','《隐私政策》':'Privacy Policy','和':'and','欢迎使用智拓客':'Welcome to LeadPilot','建材外贸客户开发助手':'Building-material export lead assistant','定价':'Pricing','申请试用':'Request Trial','登录 / 进入应用':'Sign In / Open App','没有账号？点上面「注册」，几秒就能开通。':'No account? Choose “Sign Up” above to get started in seconds.','智拓客 © 2026 版权所有 专为中国建材工厂打造的海外客户开发平台':'LeadPilot © 2026. An overseas lead generation platform built for Chinese building-material manufacturers.','版权所有':'All rights reserved','进入应用':'Open App',
    '选择方式':'Choose Method','搜索配置':'Search Setup','筛选结果':'Filter Results','AI 筛选':'AI Filter','选择数据源':'Choose Data Source','即将上线':'Coming Soon',
    '保存':'Save','取消':'Cancel','确认':'Confirm','关闭':'Close','删除':'Delete','编辑':'Edit','添加':'Add','搜索':'Search','筛选':'Filter','重置':'Reset','返回':'Back','下一步':'Next','上一步':'Previous','完成':'Done','继续':'Continue','提交':'Submit','刷新':'Refresh','复制':'Copy','导入':'Import','导出':'Export','下载':'Download','上传':'Upload','发送':'Send','查看':'View','详情':'Details','状态':'Status','操作':'Actions','名称':'Name','公司':'Company','国家':'Country','网站':'Website','电话':'Phone','备注':'Notes','产品':'Product','关键词':'Keywords','目标国家':'Target Country','客户':'Leads','邮件':'Emails','模板':'Templates','产品管理':'Products','客户管理':'Customers','邮件模板':'Email Templates','工作台':'Workspace','返回首页':'Back to Home',
    '暂无数据':'No data yet','暂无记录':'No records yet','暂无客户':'No leads yet','暂无产品':'No products yet','未启用':'Not enabled','已保存':'Saved','使用中':'Active','保存并使用':'Save & Use','修改密码':'Change Password','剩余额度':'Credits Remaining','本月已用':'Used This Month','当前套餐可用额度':'Available plan credits','累计消耗':'Total used','你的账户与额度':'Your account and credits',
    '邮件发送设置':'Email Settings','发件人姓名':'Sender Name','邮箱账号':'Email Account','SMTP 服务器':'SMTP Server','端口':'Port','邮箱密码 / 授权码':'Email Password / App Password','自己的邮箱（SMTP）':'Your Email (SMTP)','Instantly 托管发信':'Instantly Managed Sending','查进口商':'Find Importers','开始查进口商':'Find Importers','查询数量':'Result Count','目标国家 / 地区':'Target Country / Region','引入现有产品':'Use Existing Product','海关数据获客':'Customs Lead Generation','查到的进口商':'Importers Found',
    '关于我们':'About Us','隐私政策':'Privacy Policy','用户协议':'Terms of Service','联系我们':'Contact Us','首页':'Home','功能':'Features','价格':'Pricing','常见问题':'FAQ','立即开始':'Get Started','免费开始':'Start Free','了解更多':'Learn More','选择套餐':'Choose Plan','当前套餐':'Current Plan','每月':'Monthly','每年':'Yearly','推荐':'Recommended','最受欢迎':'Most Popular',
    '中文':'中文','英文':'English','切换语言':'Switch language','切换到夜间模式':'Switch to dark mode','切换到日间模式':'Switch to light mode','未登录 —— 登录后显示你的真实数据':'Not signed in — sign in to view your live data'
  }));
  const fragments = Array.from(exact.entries()).filter(pair => pair[0].length >= 2).sort((a,b) => b[0].length - a[0].length);
  const originalTitle = document.title;

  const rules = [
    [/^(\d+)\s*条线索$/, '$1 leads'], [/^(\d+)\s*天前$/, '$1 days ago'], [/^(\d+)\s*分钟前$/, '$1 minutes ago'],
    [/^共\s*(\d+)\s*条$/, '$1 total'], [/^第\s*(\d+)\s*步$/, 'Step $1'], [/加载中/g, 'Loading'], [/保存中/g, 'Saving'],
    [/正在处理/g, 'Processing'], [/操作成功/g, 'Success'], [/操作失败/g, 'Action failed'], [/请稍候/g, 'Please wait'],
    [/请输入/g, 'Enter '], [/请选择/g, 'Select '], [/暂无/g, 'No '], [/已完成/g, 'Completed'], [/未完成/g, 'Incomplete']
  ];
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();
  const ignored = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE']);

  function translateString(value) {
    const lead = value.match(/^\s*/)[0];
    const trail = value.match(/\s*$/)[0];
    const core = value.trim();
    if (!core) return value;
    if (exact.has(core)) return lead + exact.get(core) + trail;
    let out = core;
    for (const pair of fragments) out = out.split(pair[0]).join(pair[1]);
    for (const pair of rules) out = out.replace(pair[0], pair[1]);
    return lead + out + trail;
  }

  function translateNode(node, lang) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || ignored.has(node.parentElement.tagName)) return;
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      node.nodeValue = lang === 'en' ? translateString(originalText.get(node)) : originalText.get(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || ignored.has(node.tagName)) return;
    const attrs = ['placeholder','title','aria-label'];
    if (!originalAttrs.has(node)) originalAttrs.set(node, {});
    const stored = originalAttrs.get(node);
    attrs.forEach(attr => {
      if (node.hasAttribute(attr) && stored[attr] === undefined) stored[attr] = node.getAttribute(attr);
      if (stored[attr] !== undefined) node.setAttribute(attr, lang === 'en' ? translateString(stored[attr]) : stored[attr]);
    });
    Array.from(node.childNodes).forEach(child => translateNode(child, lang));
  }

  let observer;
  function applyLanguage(lang) {
    root.dataset.lang = lang;
    root.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = lang === 'en' ? translateString(originalTitle) : originalTitle;
    if (observer) observer.disconnect();
    translateNode(document.body, lang);
    updateControls();
    observer && observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['placeholder','title','aria-label']});
    document.querySelectorAll('iframe').forEach(frame => { try { frame.contentWindow.postMessage({type:'zhituoke-preferences',lang,theme:root.dataset.theme}, location.origin); } catch (_) {} });
  }

  function setLanguage(lang) {
    localStorage.setItem(LANG_KEY, lang);
    applyLanguage(lang);
  }

  function setTheme(theme) {
    root.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    updateControls();
    document.querySelectorAll('iframe').forEach(frame => { try { frame.contentWindow.postMessage({type:'zhituoke-preferences',lang:root.dataset.lang,theme}, location.origin); } catch (_) {} });
  }

  function updateControls() {
    const wrap = document.getElementById('sitePreferences');
    if (!wrap) return;
    const lang = root.dataset.lang;
    const theme = root.dataset.theme;
    const zhBtn = wrap.querySelector('[data-set-lang="zh"]');
    const enBtn = wrap.querySelector('[data-set-lang="en"]');
    const themeBtn = wrap.querySelector('[data-pref-theme]');
    zhBtn.classList.toggle('is-active', lang === 'zh');
    enBtn.classList.toggle('is-active', lang === 'en');
    zhBtn.setAttribute('aria-pressed', String(lang === 'zh'));
    enBtn.setAttribute('aria-pressed', String(lang === 'en'));
    themeBtn.innerHTML = '<i class="ti ' + (theme === 'dark' ? 'ti-sun' : 'ti-moon') + '" aria-hidden="true"></i>';
    themeBtn.setAttribute('aria-label', theme === 'dark' ? (lang === 'en' ? 'Switch to light mode' : '切换到日间模式') : (lang === 'en' ? 'Switch to dark mode' : '切换到夜间模式'));
  }

  function placeControls(wrap) {
    const cover = document.getElementById('cover');
    const topbar = document.querySelector('.topbar');
    const showCover = cover && !cover.classList.contains('gone');
    if (topbar && !showCover) {
      if (wrap.parentElement !== topbar) topbar.appendChild(wrap);
      wrap.classList.add('is-inline');
    } else {
      if (wrap.parentElement !== document.body) document.body.appendChild(wrap);
      wrap.classList.remove('is-inline');
    }
  }

  function mountControls() {
    if (window.top !== window || document.getElementById('sitePreferences')) return;
    const wrap = document.createElement('div');
    wrap.id = 'sitePreferences';
    wrap.className = 'site-preferences';
    wrap.setAttribute('aria-label', 'Language and appearance');
    wrap.innerHTML = '<div class="site-language" role="group" aria-label="Language"><button type="button" data-set-lang="zh" aria-label="中文">中文</button><button type="button" data-set-lang="en" aria-label="English">EN</button></div><button type="button" data-pref-theme></button>';
    document.body.appendChild(wrap);
    wrap.querySelectorAll('[data-set-lang]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.setLang)));
    wrap.querySelector('[data-pref-theme]').addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
    placeControls(wrap);
    const cover = document.getElementById('cover');
    if (cover) new MutationObserver(() => placeControls(wrap)).observe(cover, {attributes:true, attributeFilter:['class']});
    updateControls();
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || event.data.type !== 'zhituoke-preferences') return;
    if (event.data.theme) root.dataset.theme = event.data.theme;
    if (event.data.lang) applyLanguage(event.data.lang);
  });
  window.addEventListener('storage', event => {
    if (event.key === LANG_KEY) applyLanguage(event.newValue || 'zh');
    if (event.key === THEME_KEY) { root.dataset.theme = event.newValue || 'light'; updateControls(); }
  });

  document.addEventListener('DOMContentLoaded', () => {
    mountControls();
    observer = new MutationObserver(records => {
      if (root.dataset.lang !== 'en') return;
      observer.disconnect();
      records.forEach(record => {
        if (record.type === 'characterData') translateNode(record.target, 'en');
        if (record.type === 'attributes') translateNode(record.target, 'en');
        record.addedNodes && record.addedNodes.forEach(node => translateNode(node, 'en'));
      });
      observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['placeholder','title','aria-label']});
    });
    applyLanguage(root.dataset.lang);
  });
})();
