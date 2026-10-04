// scripts/build-seo.mjs — يبني صفحات المنتجات + sitemap + robots + كتالوج ميتا من Supabase
// يعمل على GitHub Actions (Node 20، بدون أي حزم). يقرأ فقط بالمفتاح العام (publishable).
// أمان: إذا فشلت القراءة أو رجعت 0 منتج، يتوقف دون أن يمسح أي ملف.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

const SB = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_KEY || '';
const SITE = (process.env.SITE_URL || '').replace(/\/+$/, '');
if (!SB || !KEY || !SITE) { console.error('SUPABASE_URL / SUPABASE_KEY / SITE_URL مطلوبة'); process.exit(1); }

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);

async function rest(q) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { headers: { apikey: KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function loadAll() {
  const step = 500; let all = [];
  for (let off = 0; off < 20000; off += step) {
    const rows = await rest(`store_catalog?select=*&order=position.asc,created_at.desc,id.asc&limit=${step}&offset=${off}`);
    all = all.concat(rows);
    if (rows.length < step) break;
  }
  return all;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xesc = (s) => esc(s).replace(/'/g, '&apos;');
const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const abs = (u) => {
  u = String(u || '').trim(); if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return SITE + '/' + u.replace(/^\/+/, '');
};
const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

function normalize(p) {
  const colors = Array.isArray(p.colors) ? p.colors : [];
  let total = 0; const sizes = [];
  colors.forEach((c) => (c.sizes || []).forEach((z) => {
    total += Math.max(0, Number(z.qty) || 0);
    if (z.size && !sizes.includes(z.size)) sizes.push(z.size);
  }));
  const images = [];
  [p.image_url, ...colors.map((c) => c.image)].map(abs).filter(Boolean).forEach((u) => { if (!images.includes(u)) images.push(u); });
  const price = Number(p.price) || 0;
  const old = Number(p.old_price) || 0;
  const g = colors.map((c) => String(c.gender || '')).join(' ');
  const gender = /ولد|ذكر|male|boy/i.test(g) && !/بنت|أنثى|female|girl/i.test(g) ? 'male'
    : /بنت|أنثى|female|girl/i.test(g) && !/ولد|ذكر|male|boy/i.test(g) ? 'female' : 'unisex';
  return {
    id: String(p.id), code: p.code || '', name: String(p.name || '').trim(), desc: String(p.description || '').trim(),
    category: p.category || '', price, old: old > price ? old : 0,
    inStock: colors.length ? total > 0 : true, colors: colors.map((c) => c.name).filter(Boolean), sizes, images, gender,
    updated: String(p.updated_at || p.created_at || '').slice(0, 10) || TODAY,
  };
}

function productPage(p, store) {
  const url = `${SITE}/p/${p.id}.html`;
  const title = clip(`${p.name} | ${store.name}`, 70);
  const desc = clip(p.desc || `${p.name} - ${money(p.price)} ₪ - اطلب مباشرة عبر الواتساب من ${store.name}`, 155);
  const img = p.images[0] || '';
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: clip(p.desc || p.name, 500),
    image: p.images.slice(0, 6), sku: p.code || p.id, brand: { '@type': 'Brand', name: store.name },
    offers: {
      '@type': 'Offer', url, priceCurrency: 'ILS', price: money(p.price), itemCondition: 'https://schema.org/NewCondition',
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
  const chips = (arr) => arr.map((x) => `<span>${esc(x)}</span>`).join('');
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="product"><meta property="og:locale" content="ar_AR">
<meta property="og:site_name" content="${esc(store.name)}"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
${img ? `<meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta property="product:price:amount" content="${money(p.price)}"><meta property="product:price:currency" content="ILS">
<meta name="theme-color" content="#ffffff">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script>/* الزائر العادي يُحوَّل لعرض المنتج داخل المتجر (مع fbclid وUTM). الزواحف تقرأ هذه الصفحة كما هي. التتبع يتم داخل المتجر فقط. */
(function(){var ua=navigator.userAgent||'';if(!/bot|crawl|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|preview|lighthouse/i.test(ua)){location.replace('../'+location.search+'#p/${p.id}')}})();</script>
<style>
body{margin:0;font-family:Tajawal,system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;background:#faf8f6;color:#222;line-height:1.7}
main{max-width:560px;margin:0 auto;padding:16px 16px calc(24px + env(safe-area-inset-bottom))}
.im{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:18px;background:#eee}
h1{font-size:1.35rem;margin:16px 0 4px}.pr{font-size:1.3rem;font-weight:800}.pr s{font-weight:400;color:#888;font-size:1rem;margin-inline-start:8px}
.ch span{display:inline-block;margin:4px 0 0 6px;padding:4px 12px;border:1px solid #ddd;border-radius:999px;font-size:.9rem;background:#fff}
a.b{display:block;margin-top:20px;background:#111;color:#fff;text-align:center;text-decoration:none;padding:15px;border-radius:14px;font-weight:700}
</style></head><body><main>
${img ? `<img class="im" src="${esc(img)}" alt="${esc(p.name)}" fetchpriority="high" decoding="async">` : ''}
<h1>${esc(p.name)}</h1>
<div class="pr">${money(p.price)} ₪${p.old ? `<s>${money(p.old)} ₪</s>` : ''}</div>
${p.desc ? `<p>${esc(clip(p.desc, 600))}</p>` : ''}
${p.colors.length ? `<div class="ch"><b>الألوان:</b> ${chips(p.colors)}</div>` : ''}
${p.sizes.length ? `<div class="ch"><b>المقاسات:</b> ${chips(p.sizes)}</div>` : ''}
<a class="b" href="../#p/${p.id}">اختر اللون والمقاس واطلب عبر الواتساب</a>
</main></body></html>
`;
}

function sitemap(items) {
  const urls = [`<url><loc>${xesc(SITE + '/')}</loc><lastmod>${TODAY}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`];
  items.forEach((p) => {
    urls.push(`<url><loc>${xesc(`${SITE}/p/${p.id}.html`)}</loc><lastmod>${p.updated}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>` +
      p.images.slice(0, 5).map((u) => `<image:image><image:loc>${xesc(u)}</image:loc></image:image>`).join('') + '</url>');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`;
}

// كتالوج ميتا (CSV). المعرّف id = معرّف المنتج نفسه = content_ids في البكسل وفي CAPI
function catalogCsv(items, store) {
  const cols = ['id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link',
    'additional_image_link', 'brand', 'google_product_category', 'product_type', 'color', 'age_group', 'gender'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = items.filter((p) => p.images[0] && p.price > 0).map((p) => {
    const price = p.old ? p.old : p.price;
    return [p.id, clip(p.name, 150), clip(p.desc || p.name, 4000), p.inStock ? 'in stock' : 'out of stock', 'new',
      `${money(price)} ILS`, p.old ? `${money(p.price)} ILS` : '', `${SITE}/p/${p.id}.html`, p.images[0],
      p.images.slice(1, 11).join(','), store.name, 'Apparel & Accessories > Clothing', p.category,
      p.colors[0] || '', 'kids', p.gender].map(q).join(',');
  });
  return '\ufeff' + cols.join(',') + '\n' + rows.join('\n') + '\n';
}

async function main() {
  const [raw, srows] = await Promise.all([loadAll(), rest('settings?id=eq.1&select=*').catch(() => [])]);
  if (!raw.length) throw new Error('لم يرجع أي منتج — إلغاء بدون تعديل الملفات');
  const s = (srows && srows[0]) || {};
  const store = { name: s.name || 'معاذ كيدز' };
  const items = raw.map(normalize).filter((p) => /^[0-9a-fA-F-]{36}$/.test(p.id) && p.name);
  if (!items.length) throw new Error('لا منتجات صالحة — إلغاء');

  await rm(path.join(ROOT, 'p'), { recursive: true, force: true });
  await rm(path.join(ROOT, 'feeds'), { recursive: true, force: true });
  await mkdir(path.join(ROOT, 'p'), { recursive: true });
  await mkdir(path.join(ROOT, 'feeds'), { recursive: true });
  for (const p of items) await writeFile(path.join(ROOT, 'p', `${p.id}.html`), productPage(p, store));
  await writeFile(path.join(ROOT, 'sitemap.xml'), sitemap(items));
  await writeFile(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /*?admin\n\nSitemap: ${SITE}/sitemap.xml\n`);
  await writeFile(path.join(ROOT, 'feeds', 'meta-catalog.csv'), catalogCsv(items, store));
  console.log(`OK: ${items.length} صفحة منتج + sitemap + robots + feeds/meta-catalog.csv`);
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
