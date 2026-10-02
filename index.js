/* =====================================================
   معاذ كيدز - طبقة الربط مع قاعدة البيانات (Supabase)
   1) أضف قبل سكربت المتجر في index.html:
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
      <script src="cms-api.js"></script>
   2) عدّل السطرين تحت (URL و KEY) من: Supabase > Project Settings > API
   ===================================================== */

const SUPABASE_URL = 'https://mklqjlobvvloqrygkkqx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5ZdvTLfBuLlb_7dLgkjBjQ_W-VCubM5';  // Publishable key (آمن للنشر)

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'product-images';

/* ---------- الزبائن: قراءة المتجر ---------- */
async function cmsLoadStore() {
  const [{ data: s, error: e1 }, { data: cat, error: e2 }] = await Promise.all([
    sb.from('settings').select('*').eq('id', 1).single(),
    sb.from('store_catalog').select('*').order('position').order('created_at', { ascending: false })
  ]);
  if (e1 || e2) throw (e1 || e2);

  // تحويل الشكل ليطابق DATA الحالي في index.html
  const settings = {
    name: s.name, phone: s.phone, currency: s.currency, logo: s.logo_url, cover: s.cover_url,
    title: s.title, tagline: s.tagline, announce: s.announce, address: s.address,
    instagram: s.instagram, facebook: s.facebook, tiktok: s.tiktok,
    deliveryTime: s.delivery_time, sizeGuide: s.size_guide, delivery: s.delivery, pages: s.pages
  };
  const products = cat.map(p => {
    const cols = p.colors || [];
    const first = cols[0] || { name: '', gender: '', sizes: [] };
    const sizes = [], inv = {}, avail = {};
    cols.forEach(c => c.sizes.forEach(z => { if (!sizes.includes(z.size)) sizes.push(z.size); }));
    cols.forEach(c => {
      c.sizes.forEach(z => { inv[c.name + '|' + z.size] = z.qty; });   // عدّل المفتاح ليطابق ik() عندك
      if (c.name && c.sizes.length < sizes.length) avail[c.name] = c.sizes.map(z => z.size);
    });
    return {
      id: p.id, code: p.code, name: p.name, price: Number(p.price),
      oldPrice: p.old_price == null ? null : Number(p.old_price),
      category: p.category || '', desc: p.description || '',
      image: p.image_url, thumb: p.thumb_url || p.image_url,
      color: first.name, colorGender: first.gender, sizes, avail, track: true, inv,
      variants: cols.slice(1).map(c => ({ color: c.name, image: c.image, thumb: c.thumb, gender: c.gender }))
    };
  });
  return { updatedAt: Date.now(), settings, products };
}

/* ---------- الأدمن: تسجيل الدخول ---------- */
async function cmsLogin(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data } = await sb.from('admins').select('user_id').maybeSingle();
  if (!data) { await sb.auth.signOut(); throw new Error('هذا الحساب ليس أدمن'); }
  return true;
}
const cmsLogout = () => sb.auth.signOut();
async function cmsIsAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  const { data } = await sb.from('admins').select('user_id').maybeSingle();
  return !!data;
}

/* ---------- الأدمن: رفع صورة (dataURL أو File) ---------- */
async function cmsUploadImage(fileOrDataUrl, folder = 'products') {
  let blob = fileOrDataUrl;
  if (typeof fileOrDataUrl === 'string') blob = await (await fetch(fileOrDataUrl)).blob();
  const ext = (blob.type.split('/')[1] || 'webp').replace('jpeg', 'jpg');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/* ---------- الأدمن: حفظ منتج كامل (منتج + ألوان + مقاسات) ---------- */
// product = { id?, code, name, price, oldPrice, category, desc, image, thumb, isActive,
//             colors: [{ name, gender, image, thumb, sizes: [{size, qty}] }] }
async function cmsSaveProduct(product) {
  let category_id = null;
  if (product.category) {
    const { data: c } = await sb.from('categories')
      .upsert({ name: product.category }, { onConflict: 'name' }).select('id').single();
    category_id = c && c.id;
  }
  const row = {
    code: product.code, name: product.name, price: product.price,
    old_price: product.oldPrice ?? null, category_id, description: product.desc || '',
    image_url: product.image || '', thumb_url: product.thumb || '',
    is_active: product.isActive !== false
  };
  if (product.id) row.id = product.id;
  const { data: p, error } = await sb.from('products').upsert(row).select('id').single();
  if (error) throw error;

  // إعادة بناء الألوان والمقاسات (حذف القديم ثم إضافة الجديد)
  await sb.from('product_colors').delete().eq('product_id', p.id);
  for (let i = 0; i < product.colors.length; i++) {
    const c = product.colors[i];
    const { data: col, error: ce } = await sb.from('product_colors').insert({
      product_id: p.id, name: c.name || '', gender: c.gender || '',
      image_url: c.image || '', thumb_url: c.thumb || '', position: i
    }).select('id').single();
    if (ce) throw ce;
    const stock = c.sizes.map((s, j) => ({ color_id: col.id, size: s.size, qty: Math.max(0, parseInt(s.qty, 10) || 0), position: j }));
    if (stock.length) { const { error: se } = await sb.from('product_stock').insert(stock); if (se) throw se; }
  }
  return p.id;
}

async function cmsDeleteProduct(id) {
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) throw error;
}

/* ---------- الأدمن: تعديل كمية مقاس واحد بسرعة ---------- */
async function cmsSetQty(colorId, size, qty) {
  const { error } = await sb.from('product_stock').update({ qty }).eq('color_id', colorId).eq('size', size);
  if (error) throw error;
}

/* ---------- الأدمن: حفظ الإعدادات ---------- */
async function cmsSaveSettings(s) {
  const { error } = await sb.from('settings').update({
    name: s.name, phone: s.phone, currency: s.currency, logo_url: s.logo, cover_url: s.cover,
    title: s.title, tagline: s.tagline, announce: s.announce, address: s.address,
    instagram: s.instagram, facebook: s.facebook, tiktok: s.tiktok,
    delivery_time: s.deliveryTime, size_guide: s.sizeGuide, delivery: s.delivery, pages: s.pages,
    updated_at: new Date().toISOString()
  }).eq('id', 1);
  if (error) throw error;
}

/* ---------- الطلبات (اختياري) ---------- */
async function cmsCreateOrder(order) {
  const { error } = await sb.from('orders').insert(order);
  if (error) console.warn('order log failed', error);
}
