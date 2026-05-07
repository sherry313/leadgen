require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 从 Google Sheet 导出的数据，直接硬编码
const historicalLeads = [
  { email: 'info@tlconstruction.com.au', website: 'http://www.tlconstruction.com.au/' },
  { email: '', website: 'https://newlifehomes.au/' },
  { email: 'info@sacredhomes.com.au', website: 'https://sacredhomes.com.au/' },
  { email: 'info@builderssydneyexperts.com.au', website: 'https://www.builderssydneyexperts.com.au/' },
  { email: 'hello@cloverhomes.com.au', website: 'https://cloverhomes.com.au/' },
  { email: 'info@choicehomessydney.com.au', website: 'http://www.choicehomessydney.com.au/' },
  { email: 'info@buildritesydney.com.au', website: 'https://www.buildritesydney.com.au/' },
  { email: '', website: 'http://hojuhomes.com/' },
  { email: 'vadim@probuiltprojects.com.au', website: 'https://www.probuiltprojects.com.au/' },
  { email: 'info@arhomes.com.au', website: 'https://www.arhomes.com.au/' },
  { email: 'info@rbelitehomes.com.au', website: 'https://rbelitehomes.com.au/' },
  { email: 'anthony@5starbuilders.com.au', website: 'http://www.5starbuilders.com.au/' },
  { email: 'rb_sydneybuilders@hotmail.com', website: 'http://www.rbsb.com.au/' },
  { email: 'info@t-homes.com.au', website: 'http://t-homes.com.au/' },
  { email: 'admin@iconhomes.com.au', website: 'https://iconhomes.com.au/' },
  { email: 'sales@meadanhomes.com.au', website: 'https://www.meadanhomes.com.au/' },
  { email: 'hello@sphbuilt.com.au', website: 'https://www.sphbuilt.com.au/' },
  { email: '', website: 'http://www.sydneyeastbuilding.com.au/' },
  { email: '', website: 'http://sydneybeachhomes.com.au/' },
  { email: 'info@jonathan-homes.com.au', website: 'https://jonathan-homes.com.au/' },
  { email: 'info@quantumbuilt.com.au', website: 'https://quantumbuilt.com.au/' },
  { email: 'tradesales@wgip.com.au', website: 'https://wgip.com.au/' },
  { email: 'info@jmjhomes.com.au', website: 'https://www.jmjhomes.com.au/' },
  { email: 'admin@empak.com.au', website: 'http://www.empak.com.au/' },
  { email: 'start@australbuild.com.au', website: 'https://australbuild.com.au/' },
  { email: 'info@jbsydneybuilders.com.au', website: 'http://www.jbsydneybuilders.com.au/' },
  { email: 'benjamin.halloran@gmail.com', website: 'http://www.blhp.com.au/' },
  { email: 'info@prominenthomesaustralia.com', website: 'https://prominenthomesaustralia.com/' },
  { email: 'info@horizonbuilt.com.au', website: 'https://www.horizonbuilt.com.au/' },
  { email: 'enquiries@ashingtonhomes.com.au', website: 'http://ashingtonhomes.com.au/' },
  { email: 'grant@alltimeconstructions.com.au', website: 'http://www.alltimeconstructions.com.au/' },
  { email: '', website: 'http://www.pillarbuild.com.au/' },
  { email: 'info@kuberhomes.com.au', website: 'http://www.kuberhomes.com.au/' },
  { email: 'info@sydneysidehomes.com', website: 'https://sydneysidehomes.com/' },
  { email: 'info@sydneywidehomes.com.au', website: 'https://sydneywidehomes.com.au/' },
  { email: '', website: 'https://lavishlivingconstruction.com.au/' },
  { email: '', website: 'https://wattlecourt.com.au/' },
  { email: 'info@signaturelivinghomes.com.au', website: 'https://www.signaturelivinghomes.com.au/' },
  { email: 'info@horizonhomes.com.au', website: 'https://horizonhomes.com.au/' },
  { email: '', website: 'https://www.hamptonshomessydney.com.au/' },
  { email: 'admin@bungalowhomes.net.au', website: 'https://bungalowgrannyflats.com.au/' },
  { email: 'info@bicconstruction.com.au', website: 'https://www.bicconstruction.com.au/' },
  { email: 'hello@builders-sydney.com.au', website: 'https://www.builders-sydney.com.au/' },
  { email: '', website: 'https://dhursanconstruction.com.au/' },
  { email: '', website: 'https://www.sydneybuildingandconstructiongroup.com.au/' },
  { email: 'enquiry@turrell.com.au', website: 'http://www.turrell.com.au/' },
  { email: 'sales@vogue-homes.com.au', website: 'https://vogue-homes.com.au/' },
  { email: '', website: 'https://kongstruction.com.au/' },
];

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch { return url; }
}

async function importHistoricalLeads() {
  console.log(`[Import] 开始导入 ${historicalLeads.length} 条历史数据...`);

  // 先创建一个历史导入的 search_history 记录
  const { data: searchRecord, error: searchErr } = await supabase
    .from('search_history')
    .insert({
      query: 'historical_import',
      location: 'Sydney Australia',
      max_results: historicalLeads.length,
      total_scraped: historicalLeads.length,
      total_qualified: historicalLeads.length,
    })
    .select()
    .single();

  if (searchErr) {
    console.error('[Import] 创建 search_history 失败:', searchErr);
    process.exit(1);
  }

  const searchId = searchRecord.id;
  console.log(`[Import] search_history ID: ${searchId}`);

  // 批量插入
  const records = historicalLeads
    .filter(l => l.email || l.website)
    .map(l => ({
      search_id:      searchId,
      email:          l.email || null,
      website:        l.website || null,
      website_domain: l.website ? extractDomain(l.website) : null,
      company_name:   'historical_import',
      created_at:     new Date().toISOString(),
    }));

  let { error } = await supabase.from('leads').insert(records);

  if (error?.message?.includes('website_domain')) {
    console.warn('[Import] website_domain 列不存在，请先执行 SQL migration，当前跳过该字段重试...');
    const fallback = records.map(({ website_domain, ...rest }) => rest);
    ({ error } = await supabase.from('leads').insert(fallback));
  }

  if (error) {
    console.error('[Import] 插入失败:', error);
    process.exit(1);
  } else {
    console.log(`[Import] ✅ 成功导入 ${records.length} 条历史数据`);
    console.log('[Import] 提示：执行以下 SQL 后再次运行可补全 website_domain 字段：');
    console.log('  ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_domain TEXT;');
  }
}

importHistoricalLeads();
