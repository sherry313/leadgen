# Project Rules — Zhituoke Lead Generation Platform

## Mandatory Rules

### 1. ALWAYS audit before any change
- Read and understand all relevant files before modifying anything
- Report what you plan to change and what it might affect
- Only modify after user confirms
- If a change touches server.js, check all frontend fetch calls that reference affected routes
- If a change touches a shared function, check ALL callers

### 2. Do NOT break existing functionality
- Check all references to any code you modify
- If a function is called from multiple places, ensure all call sites remain compatible
- Run a mental trace through the affected flow before editing
- When in doubt, ask the user

### 3. Frontend rules
- Dark theme only (background #030303, cards rgba(255,255,255,0.03), borders rgba(255,255,255,0.08), accent #6366f1 indigo)
- Do not break existing JavaScript logic when modifying HTML
- Check CSS changes don't affect other pages
- Use Tabler Icons (already loaded), never emoji in UI

### 4. Backend rules
- Never delete existing routes in server.js
- All new API endpoints must use requireAuth middleware (unless explicitly public)
- ALL external API calls must be wrapped in withTimeout()
- ALL SSE endpoints must have res.on('close') for client disconnect handling
- Use res.on('close'), NOT req.on('close') — req.on('close') fires immediately after body parsing
- Frontend fetch calls: always use `getStoredToken()` for the Authorization header. Never hardcode localStorage key strings for the token.

### 5. Database rules
- Do not modify Supabase table schema without explicit approval
- Do not change saveLeads() filter logic
- Do not change dedup logic

### 6. Git rules
- Never use `git add .` — always list specific files
- Do not commit files in scripts/ directory (one-time fix scripts)
- Commit messages in English, concise
- Always push after commit

### 7. Site architecture
- / → Homepage (public/home.html)
- /app → New user app (public/index.html) — clean, no pre-filled data
- /lens → Lens client app (public/lens.html) — pre-filled with Lens config
- /tools/ → Free tools listing (public/tools/index.html)
- /login.html → Login page (redirects to /lens after token entry)
- /landing → Old landing page (hidden, preserved)
- /quote.html → Quote tool

### 8. Lens vs New Users
- Lens config (seller name, products, ICP) lives ONLY in /lens (public/lens.html)
- /app (public/index.html) is generic — no Lens-specific pre-filled values
- Both pages share the same server.js backend and API endpoints
- Do not mix Lens-specific content into the generic /app page

### 9. API services
- Apify: Google Maps scraper (compass~crawler-google-places)
- Firecrawl: Website content crawler
- Anthropic: Haiku (pre-filter) + Sonnet (ICP scoring + email generation)
- Instantly: Email sending campaigns
- All API keys in .env, never hardcode

### 10. Deployment
- VPS sync command: cd /docker/zhituoke && git pull && docker compose down && docker compose up -d --build
- HTML-only changes: just git pull + docker compose restart (no rebuild needed)
- server.js changes: must rebuild (docker compose down && docker compose up -d --build)
- .env is not tracked by git — must be maintained separately on VPS

## 已知Schema问题

1. `email_sent_at` 列不存在于 leads 表 — services/supabase.js:304 的 getEmailsSentCount() 查询这个列但 Supabase 静默失败，dashboard 的"已发送"统计永远是0。待修复：加这个列或找到真实的发送追踪方式。

2. Supabase 分页+filter mutation 问题：用 .range() 分页时如果同一批次更新了行导致行从filter结果中消失，后续页会静默跳过行。正确做法：每次从offset 0开始，或用 gt('id', lastId) 按稳定key分页。
