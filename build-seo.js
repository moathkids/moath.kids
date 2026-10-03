// Moath Kids — يولّد صفحات المنتجات (SEO) + sitemap + robots + كتالوج ميتا من Supabase.
// لا يحتاج أي مكتبات. يعمل على Node 18+ داخل GitHub Actions.
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SITE = (process.env.SITE_URL || '').replace(/\/+$/, '');
const PIXEL = process.env.PIXEL_ID || '945957301459601';
if (!SUPABASE_URL || !SUPABASE_KEY || !SITE) { console.error('Missing SUPABASE_URL / SUPABASE_KEY / SITE_URL'); process.exit(1); }

const H = { apikey: SUPABASE_KEY, Accept: 'application/json' };
async function getAll(path) {
  const out = [], step = 500;
  for (let from = 0; from < 20000; from += step) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...H, 'Range-Unit': 'items', Range: `${from}-${from + step - 1}` } });
    if (!r.ok) throw new Error(`${path} -> HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flat = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const abs = u => !u ? '' : /^https?:\/\//i.test(u) ? u : `${SITE}/${String(u).replace(/^\.?\//, '')}`;
const money = n => (Math.round(Number(n) * 100) / 100).toFixed(2);
const show = n => { const v = Math.round(Number(n) * 100) / 100; return Number.isInteger(v) ? String(v) : v.toFixed(2); }; // للعرض فقط؛ الكتالوج والبيانات المنظمة تبقى بصيغة 0.00
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

const [setRows, cat] = await Promise.all([
  getAll('settings?id=eq.1&select=*'),
  getAll('store_catalog?select=*&order=position.asc,created_at.desc,id.asc')
]);
const S = setRows[0];
if (!S) throw new Error('settings row not found');
if (!Array.isArray(cat)) throw new Error('catalog not an array');
const storeName = flat((S.name || 'معاذ كيدز').split('-')[0]) || 'معاذ كيدز';
const cur = S.currency || '₪';
const phone = String(S.phone || '').replace(/\D/g, '');
const logo = abs(S.logo_url);

// حماية: لا نكتب شيئًا إذا رجع الكتالوج فارغًا بالخطأ (حتى لا نمسح الصفحات الموجودة)
if (cat.length === 0) { console.log('Catalog is empty -> nothing written.'); process.exit(0); }

const info = p => {
  const cols = p.colors || [];
  const rows = cols.flatMap(c => (c.sizes || []).map(z => Number(z.qty) || 0));
  const inStock = rows.length === 0 ? true : rows.some(q => q > 0);
  const sizes = [...new Set(cols.flatMap(c => (c.sizes || []).filter(z => (Number(z.qty) || 0) > 0).map(z => z.size)))];
  const colors = [...new Set(cols.map(c => c.name).filter(Boolean))];
  const images = [...new Set([p.image_url, ...cols.map(c => c.image)].map(abs).filter(Boolean))];
  return { inStock, sizes, colors, images };
};

const pageUrl = p => `${SITE}/p/${p.id}.html`;
function productPage(p) {
  const { inStock, sizes, colors, images } = info(p);
  const url = pageUrl(p), img = images[0] || logo;
  const desc = flat(p.description) || `${p.name} من ${storeName} بسعر ${cur}${money(p.price)}. الطلب عبر الواتساب والتوصيل لمناطق الضفة والقدس والداخل.`;
  const d160 = desc.slice(0, 160);
  const wa = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(`مرحبًا، أريد طلب: ${p.name}${p.code ? ' (رقم ' + p.code + ')' : ''}\n${url}`)}` : '';
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: d160, sku: p.id, mpn: p.code || undefined,
    image: images.length ? images : undefined, brand: { '@type': 'Brand', name: storeName },
    offers: { '@type': 'Offer', url, price: money(p.price), priceCurrency: 'ILS', itemCondition: 'https://schema.org/NewCondition',
      availability: 'https://schema.org/' + (inStock ? 'InStock' : 'OutOfStock') }
  };
  const vc = { content_ids: [p.id], content_type: 'product', content_name: p.name, value: Number(p.price), currency: 'ILS' };
  const chips = a => a.map(x => `<span class="chip">${esc(x)}</span>`).join('');
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.name)} | ${esc(storeName)}</title>
<meta name="description" content="${esc(d160)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="${esc(storeName)}"><meta property="og:locale" content="ar_AR">
<meta property="og:title" content="${esc(p.name)}"><meta property="og:description" content="${esc(d160)}"><meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}"><meta name="twitter:image" content="${esc(img)}">` : ''}
<meta property="product:price:amount" content="${money(p.price)}"><meta property="product:price:currency" content="ILS">
<meta property="product:availability" content="${inStock ? 'in stock' : 'out of stock'}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${esc(PIXEL)}');fbq('track','PageView');fbq('track','ViewContent',${JSON.stringify(vc).replace(/</g, '\\u003c')});</script>
<style>
:root{--ink:#1b1b1b;--mut:#6b6b6b;--line:#eee;--bg:#fff;--wa:#1faa59}
*{box-sizing:border-box}body{margin:0;font-family:Tajawal,Tahoma,system-ui,sans-serif;color:var(--ink);background:#faf8f6}
header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#fff;border-bottom:1px solid var(--line)}
header a{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:800;font-size:18px}
header img{width:40px;height:40px;border-radius:50%;object-fit:cover}
main{max-width:720px;margin:0 auto;padding:14px 14px 40px}
.ph{background:#f1f1f1;border-radius:16px;overflow:hidden;aspect-ratio:4/5;display:grid;place-items:center}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.th{display:flex;gap:8px;overflow-x:auto;margin-top:8px;padding-bottom:4px}.th img{width:64px;height:80px;object-fit:cover;border-radius:10px;flex:none}
h1{font-size:24px;margin:16px 0 4px}.code{color:var(--mut);font-size:14px}
.price{font-size:28px;font-weight:800;margin:10px 0}.old{color:var(--mut);text-decoration:line-through;font-size:18px;margin-inline-start:14px;font-weight:400}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 12px}.chip{border:1px solid #ddd;border-radius:999px;padding:4px 12px;font-size:14px;background:#fff}
.lbl{font-weight:700;margin-top:10px}.desc{line-height:1.8;color:#333;margin:14px 0}
.btn{display:flex;align-items:center;justify-content:center;min-height:52px;border-radius:14px;font-size:17px;font-weight:800;text-decoration:none;margin-top:10px}
.b1{background:#111;color:#fff}.b2{background:var(--wa);color:#fff}.sold{background:#fde8e8;color:#b42318;padding:10px 14px;border-radius:12px;font-weight:700}
footer{text-align:center;color:var(--mut);font-size:13px;padding:20px}
</style></head>
<body>
<header><a href="../">${logo ? `<img src="${esc(logo)}" alt="" width="40" height="40">` : ''}<span>${esc(storeName)}</span></a></header>
<main>
<div class="ph">${img ? `<img src="${esc(img)}" alt="${esc(p.name)}" width="720" height="900" fetchpriority="high">` : '🧸'}</div>
${images.length > 1 ? `<div class="th">${images.slice(0, 8).map(u => `<img src="${esc(u)}" alt="${esc(p.name)}" loading="lazy" width="64" height="80">`).join('')}</div>` : ''}
<h1>${esc(p.name)}</h1>
${p.code ? `<div class="code">رقم الصنف: ${esc(p.code)}</div>` : ''}
<div class="price">${esc(cur)}${esc(show(p.price))}${p.old_price && Number(p.old_price) > Number(p.price) ? `<span class="old">${esc(cur)}${esc(show(p.old_price))}</span>` : ''}</div>
${inStock ? '' : '<div class="sold">نفدت الكمية حاليًا — راسلنا لنخبرك عند توفره</div>'}
${colors.length ? `<div class="lbl">الألوان</div><div class="chips">${chips(colors)}</div>` : ''}
${sizes.length ? `<div class="lbl">المقاسات المتوفرة</div><div class="chips">${chips(sizes)}</div>` : ''}
<p class="desc">${esc(desc)}</p>
<a class="btn b1" href="../#p/${esc(encodeURIComponent(p.id))}">اختر اللون والمقاس وأضف للعربة 🛒</a>
${wa ? `<a class="btn b2" id="wa" href="${esc(wa)}" rel="noopener">اطلب مباشرة عبر الواتساب</a>` : ''}
</main>
<footer>${esc(storeName)} — ${esc(S.address || 'ملابس أطفال')}</footer>
<script>var w=document.getElementById('wa');if(w)w.addEventListener('click',function(){try{fbq('track','Contact',${JSON.stringify(vc).replace(/</g, '\\u003c')})}catch(e){}});</script>
</body></html>`;
}

// ---------- كتابة الملفات ----------
await mkdir('p', { recursive: true });
await mkdir('feeds', { recursive: true });
const keep = new Set();
let pages = 0;
for (const p of cat) {
  if (!isUuid(p.id)) continue;
  await writeFile(`p/${p.id}.html`, productPage(p), 'utf8'); keep.add(`${p.id}.html`); pages++;
}
let removed = 0;
for (const f of await readdir('p')) if (/^[0-9a-f-]{36}\.html$/i.test(f) && !keep.has(f)) { await unlink(`p/${f}`); removed++; }

const day = new Date().toISOString().slice(0, 10);
const urls = [`<url><loc>${esc(SITE)}/</loc><lastmod>${day}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`]
  .concat(cat.filter(p => isUuid(p.id)).map(p => {
    const im = info(p).images.slice(0, 5).map(u => `<image:image><image:loc>${esc(u)}</image:loc></image:image>`).join('');
    return `<url><loc>${esc(pageUrl(p))}</loc><lastmod>${day}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>${im}</url>`;
  }));
await writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`, 'utf8');
await writeFile('robots.txt', `User-agent: *\nAllow: /\nDisallow: /*?admin\n\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8');

// ---------- كتالوج ميتا (CSV) ----------
const cols = ['id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'additional_image_link', 'brand', 'google_product_category', 'product_type', 'color', 'size'];
const lines = [cols.join(',')];
let skipped = 0;
for (const p of cat) {
  const { inStock, sizes, colors, images } = info(p);
  if (!isUuid(p.id) || !images.length || !(Number(p.price) > 0) || !flat(p.name)) { skipped++; continue; }
  const desc = flat(p.description) || `${p.name} — ملابس أطفال من ${storeName}`;
  const hasSale = p.old_price && Number(p.old_price) > Number(p.price);   // ميتا: price = السعر الأصلي، sale_price = بعد الخصم
  lines.push([
    p.id, flat(p.name).slice(0, 150), desc.slice(0, 5000), inStock ? 'in stock' : 'out of stock', 'new',
    `${money(hasSale ? p.old_price : p.price)} ILS`, hasSale ? `${money(p.price)} ILS` : '', pageUrl(p), images[0], images.slice(1, 10).join(','), storeName,
    'Apparel & Accessories > Clothing', flat(p.category), colors.join('/'), sizes.join('/')
  ].map(csv).join(','));
}
await writeFile('feeds/catalog.csv', lines.join('\n') + '\n', 'utf8');

console.log(`pages=${pages} removed=${removed} catalogRows=${lines.length - 1} skipped(no image/price)=${skipped}`);
