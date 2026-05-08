# 🚀 智拓客 (ZhiTuoKe) 项目交接文档 v2

> **使用说明**：开新对话时，把整份文档贴给 AI 助手就能立即 get 到上下文。

> **本次更新时间**：2026-05-08（北京时间下午）

---

## 一、产品定位

**智拓客** 是帮中国建材工厂找海外买家的 SaaS 工具。

**核心流程**：
1. 用户输入关键词 + 城市（如 "builder Melbourne"）
2. 智拓客调用 Apify 抓 Google Maps 公司
3. 用 Firecrawl 抓官网内容做 ICP 评分
4. 用 Anthropic Sonnet 生成 5 封个性化开发信（Day 1/4/7/10/14）
5. 推送到 Instantly 自动发送

**主要市场**：澳洲、美国、英国、加拿大

---

## 二、技术栈

- **后端**：Node.js + Express
- **前端**：纯 HTML/JS（public/index.html，~4500 行）
- **数据库**：Supabase (PostgreSQL)
- **AI**：Anthropic API (Sonnet + Haiku)
- **抓取**：Apify (Google Maps Scraper) + Firecrawl
- **邮件发送**：Instantly API V2
- **部署**：Hostinger VPS (KVM 2: 2vCPU/8GB/100GB)
- **生产地址**：https://ignightlead.com
- **VPS IP**：72.60.111.20
- **GitHub**：github.com/sherry313/leadgen (private)
- **本地路径**：C:\Users\Administrator\Documents\au-lead-gen

---

## 三、关键密钥

- **ADMIN_TOKEN**：`admintoken456`（管理员；能看到 (Firecrawl) 标识）
- **USER_TOKEN**：另一个普通用户 token
- **localStorage key**：`leadgen_accessToken`
- **Instantly Campaign ID**："Saas Testing" = `bcc05e95-1fa8-40ad-a856-109609525cd9`

---

## 四、核心文件

| 文件 | 作用 |
|---|---|
| `server.js` | Express 主入口、路由 |
| `public/index.html` | 整个前端 UI（4500+ 行） |
| `services/aiEnrich.js` | AI 调用 + 邮件生成 + JSON 解析重试 |
| `services/apify.js` | Google Maps 抓取 |
| `services/firecrawl.js` | 官网内容抓取 |
| `services/supabase.js` | 数据库操作 |
| `services/instantly.js` | Instantly API 推送 + first_name 提取 |
| `services/emailFrameworks.js` | 8 个写作框架 |
| `services/emailTemplates.js` | 8 个客户类型 |
| `services/googleSheets.js` | Google Sheets 同步（有 bug） |

---

## 五、产品哲学

1. **"框架是骨架，内容是血肉"** — AI 按框架结构写，内容自由发挥
2. **每个 lead 5 封邮件**：Day 1/4/7/10/14 序列
3. **客户类型 = 角度**，**框架 = 结构**，8×8 = 64 种组合
4. **暂时保留 Token 验证**：未来付费增长时再开放
5. **不跟 Instantly 换件发功能**：只生成 + 推送
6. **渐进显示** — 用户点什么就看到下一步
7. **生成后预览**：避免用户没确认就花 token

---

## 六、4 步流程（最新的）

### Step 1：选国家 + 客户类型
- 国家选择：AU/US/UK/CA + 6 个其他
- 客户类型选择：8 个（建筑承包商、装修翻新商、室内设计师等）
- 这两个合并到一步

### Step 2：搜索配置（已简化）

**必填位置（红 `*`）**：
- 公司/卖家名称
- 主要产品
- 产品优势
- 关键词 + 城市
- 抓取数量（5/20/50/100/自定义）
- Access Token（暂保留；未来付费增长时移除）

**附加（可选）**：
- ICP 描述（高级筛选）

**简化的字段图例**：
- 默认勾选基础信息/官网/电话/评分（隐藏不显示）
- 只显示"📧 抓取邮箱（+$0.002/条）"开关

### Step 3：抓取 + 深度分析
- 显示抓取进度
- AI 分析意向分 + ICP 分
- **新增**：合格/不合格 filter tabs（"全部/✅合格/❌不合格"）
- 每行有"展开"/"生成邮件"/"加入序列"按钮
- 完成后显示绿色"深度分析完成"卡片
- 按钮文字："**下一步 → 生成开发信**"（已修正）

### Step 4：邮件配置 & 发送（已渐进显示）

**State 1**：进入只看到 5.1 写作框架（8 个卡片）
**State 2**：选定框架 → 出现邮件预览卡 + "✅ 满意，开始生成" 按钮
**State 3**：生成完成 → 出现：
- 已生成的邮件预览（每条 lead 下行可展开的 5 封）
- **新增**："📤 推送 N 条线索到 Instantly Campaign" 按钮
- Instantly 配置区：Campaign 选择、发件邮箱、序列时间、控制

**已删除**：5.2 客户类型角度（第 1 步选过了不重复）

---

## 七、今天（2026-05-08）完成的事

### 已 commit + push 的改动（约 12 个 commit）
1. 4 步流程重构（5→4 步）
2. 城市改为预设下拉
3. 第 4 步渐进显示
4. 删除第 4 步重复的客户类型选择
5. 第 3 步加合格/不合格筛选 tabs
6. 批量生成弹窗简化（只保留框架选择）
7. 第 2 步卖家信息移到顶部 + 必填
8. ICP 附加为可选高级
9. 数据字段简化（只显示邮箱开关）
10. 邮件生成 JSON 解析失败一次重试
11. 加"📤 批量推送到 Instantly"按钮（核心功能修复）
12. Instantly 推送时提取 first_name（核心 bug 修复）

### Supabase Migration（手动跑一下）
跑完 ALTER TABLE：
- `leads` 表加：`icp_score`, `email1_subject` ~ `email5_subject`, `email1_body` ~ `email5_body`
- `search_history` 表加：`apify_cost_usd`, `anthropic_cost_usd`, `total_cost_usd`
- 后端 "Schema missing columns" 警告应该消失

### 关键 Bug 修复（今天发现 + 修复）
1. **Instantly 推送 lead 失败**：原来"同步到 Campaign"按钮根本不推 lead，只推发件邮箱。新加了真正的批量推送按钮
2. **first_name merge tag 不替换**：Instantly 收不到 first_name 字段。修复逻辑：
   - `simon@xxx.com` → "Simon"（个人邮箱用首字母大写）
   - `admin@xxx.com` → 公司名（通用前缀用 companyName）
   - 通用前缀列表：admin, info, contact, hello, sales, support, office, enquiries, etc.
3. **JSON 解析失败**：AI 返回内容含特殊字符破坏 JSON。加了重试逻辑

---

## 八、未完成的事 / 已知 bug

### P0 - 影响核心功能
- **VPS 同步今天的 commits**：本地已 push 到 GitHub，但 VPS 还跑着旧代码
  - SSH：`ssh root@72.60.111.20`
  - 操作：`cd /docker/zhituoke && git pull && docker compose up -d --build`
  - GitHub PAT 可能需要重输

### P1 - 已知未修
- **Google Search 邮箱找不到**：services/googleSheets.js 里 organic_results 没解析
- **Campaign 下拉为空**：UI 显示问题
- **/api/instantly/.../analytics 返回 500**：endpoint 不对（正确应该是 `GET /campaigns/analytics?id=xxx`）
- **Google Sheets 表名标签冲突**：每天第二次跑就失败（`A sheet with the name "enrich - 2026-05-08" already exists`）
- **finalizeSheets error**：`Cannot read properties of null (reading 'leadsId')`

### P2 - 小问题
- **第 2 步输入框颜色**跟深色主题有点冲突
- **icp_score=5 边界问题**：可能是 > vs >= 差异

---

## 九、已知网络问题（间歇性）

用户本地有时会遇到：
- Anthropic API timeout
- `getaddrinfo ENOTFOUND api.instantly.ai`
- Supabase ConnectTimeoutError

**3 个服务同时挂 = 用户网络/DNS 问题，不是代码问题**。解决：重启 server，重试。

---

## 十、产品想法（记录但不做）

用户曾提议把智拓客扩展成"通用 API 中转 SaaS"——帮中国用户访问国外 API（Apify、Anthropic、Notion 等）。
- 看得到的坑：API2D、OhMyGPT 在做
- 但工程量多几个月，优先把现有产品精化
- **决定**：专注智拓客功能赚钱的状态，再考虑扩张

---

## 十一、开新对话第一件事

开新 Claude 对话，**贴这份文档**，然后告诉它：

```
这是智拓客项目的交接文档。请仔细看完。

今天我要做的：
1. 验证今天最后一个改动（first_name 提取）的真实工作 — 推几条 lead 看 Instantly 收到 First Name 字段
2. VPS 同步 commits（git pull + docker compose up -d --build）
3. 端到端真实测试一遍流程
4. 修理上面的 P1 bug

请按这个顺序帮我做。每一步完后告诉我具体怎么操作。
```

---

## 十二、调试常用命令

```bash
# 重启本地 server
cd C:\Users\Administrator\Documents\au-lead-gen
Ctrl + C  # 杀掉
node server.js  # 开新

# 看 git 历史
git log --oneline -20

# VPS 部署
ssh root@72.60.111.20
cd /docker/zhituoke
git pull
docker compose up -d --build
docker compose logs -f  # 看实时日志

# Supabase Schema 查询
SELECT column_name FROM information_schema.columns WHERE table_name='leads';
```

---

**最后更新**：2026-05-08 北京时间下午
**当前 Claude 对话状态**：上下文即将耗尽，准备开新对话继续
