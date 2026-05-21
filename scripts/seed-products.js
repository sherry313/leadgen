require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const PRODUCTS = [
  { product_key: 'sliding-window',  product_name_cn: '推拉窗',     product_name_en: 'Sliding Window',    base_price_cny: 400,  description: 'Classic left-right sliding window. Most common, cost-effective.' },
  { product_key: 'casement-window', product_name_cn: '平开窗',     product_name_en: 'Casement Window',   base_price_cny: 600,  description: 'Opens outward like a door. Better sealing and ventilation.' },
  { product_key: 'fixed-window',    product_name_cn: '固定窗',     product_name_en: 'Fixed Window',      base_price_cny: 350,  description: 'Non-opening. Maximum light and view.' },
  { product_key: 'sliding-door',    product_name_cn: '推拉门',     product_name_en: 'Sliding Door',      base_price_cny: 800,  description: 'Left-right sliding door. Most popular for patios and balconies.' },
  { product_key: 'bifold-door',     product_name_cn: '折叠门',     product_name_en: 'Bifold Door',       base_price_cny: 1500, description: 'Multi-panel folding door. Opens entire wall. Most popular in Australian luxury homes.' },
  { product_key: 'lift-slide-door', product_name_cn: '提升推拉门', product_name_en: 'Lift & Slide Door', base_price_cny: 2500, description: 'Heavy-duty sliding door. Lifts off track to slide. Superior sealing and insulation.' },
];

const ADDERS = [
  { category: 'material', option_key: 'regular',           option_name_cn: '普通铝合金',    option_name_en: 'Regular Aluminium',         price_cny: 0   },
  { category: 'material', option_key: 'thermal',           option_name_cn: '断桥铝',        option_name_en: 'Thermal Break',             price_cny: 300 },
  { category: 'glass',    option_key: 'single',            option_name_cn: '单玻',          option_name_en: 'Single Glaze',              price_cny: 0   },
  { category: 'glass',    option_key: 'double',            option_name_cn: '双玻',          option_name_en: 'Double Glazed',             price_cny: 150 },
  { category: 'glass',    option_key: 'double-lowe',       option_name_cn: '双玻Low-E',     option_name_en: 'Double Glazed Low-E',       price_cny: 250 },
  { category: 'glass',    option_key: 'double-lowe-argon', option_name_cn: '双玻Low-E充氩气', option_name_en: 'Double Glazed Low-E Argon', price_cny: 350 },
  { category: 'surface',  option_key: 'powder',            option_name_cn: '粉末喷涂',      option_name_en: 'Powder Coating',            price_cny: 0   },
  { category: 'surface',  option_key: 'fluorocarbon',      option_name_cn: '氟碳喷涂',      option_name_en: 'Fluorocarbon Coating',      price_cny: 150 },
  { category: 'surface',  option_key: 'wood-grain',        option_name_cn: '木纹转印',      option_name_en: 'Wood Grain',                price_cny: 300 },
  { category: 'hardware', option_key: 'domestic',          option_name_cn: '国产五金',      option_name_en: 'Domestic Hardware',         price_cny: 0   },
  { category: 'hardware', option_key: 'german',            option_name_cn: '德国五金',      option_name_en: 'German Hardware',           price_cny: 200 },
];

(async () => {
  const { data: p, error: pe } = await db.from('products').insert(PRODUCTS).select('id');
  if (pe) { console.error('products INSERT failed:', pe.message); process.exit(1); }
  console.log(`✓ products inserted: ${p.length}`);

  const { data: a, error: ae } = await db.from('product_adders').insert(ADDERS).select('id');
  if (ae) { console.error('product_adders INSERT failed:', ae.message); process.exit(1); }
  console.log(`✓ product_adders inserted: ${a.length}`);
})();
