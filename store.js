/* ===================================================================
   store.js — معاذ كيدز | Moath Kids
   الإصدار: 4.1 (ES2015)
   التاريخ: 2026-10-10
   
   المسؤولية: منطق المتجر الكامل.
   الجديد: حقل الإيميل الاختياري + دعم meta.zone في الطلب.
   =================================================================== */

(function() {
  'use strict';

  const C = window.MK_CONFIG;
  const U = window.MK_UTILS;
  const T = window.MK_TRACKING;
  const E = window.MK_EVENTS;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);

  /* ═══════════════════════════════════════════════════════════
     📦 الحالة الداخلية
     ═══════════════════════════════════════════════════════════ */

  const STORE = {
    settings: Object.assign({}, C.DEFAULTS.settings),
    categories: [],
    products: [],
    cart: [],
    activeCat: '',
    activeGender: '',
    selectedSizes: {},
    selectedColors: {},
    LB: { items: [], i: 0, name: '' },
    menuView: 'main',
    customer: { name: '', phone: '', email: '', zone: '', region: '' }
  };

  /* ═══════════════════════════════════════════════════════════
     🛒 السلة
     ═══════════════════════════════════════════════════════════ */

  function saveCart() {
    U.writeLS(C.CART_KEY, STORE.cart);
    updateCartBadge();
  }

  function saveCustomer() {
    U.writeLS(C.CUSTOMER_KEY, STORE.customer);
  }

  function updateCartBadge() {
    const n = STORE.cart.reduce((a, c) => a + c.qty, 0);
    ['cartCount', 'headerCartCount'].forEach(id => {
      const el = U.$(id);
      if (el) el.textContent = n ? n : '';
    });
    const mt = U.$('mobileCartText');
    if (mt) mt.textContent = n ? (n + ' قطعة') : 'فارغة';
  }

  function cartItems() {
    return STORE.cart
      .map(c => ({ c: c, p: STORE.products.find(x => x.id === c.id) }))
      .filter(x => x.p);
  }

  function cartTotal(items) {
    return items.reduce((a, x) => a + Number(x.p.price) * x.c.qty, 0);
  }

  function addToCart(id) {
    const p = STORE.products.find(x => x.id === id);
    if (!p || soldOut(p)) return;

    const sizes = p.sizes || [];
    const size = sizes.length ? (STORE.selectedSizes[id] || '') : '';
    if (sizes.length > 1 && !size) return U.toast(C.TEXTS.SELECT_SIZE);

    const opts = colorOptions(p);
    const color = opts.length
      ? (STORE.selectedColors[id] || (opts.length === 1 ? opts[0].color : ''))
      : (p.color || '');
    if (opts.length > 1 && !color) return U.toast(C.TEXTS.SELECT_COLOR);
    if (size && !sizeOk(p, color, size)) return U.toast(C.TEXTS.NOT_AVAILABLE);

    const hit = STORE.cart.find(c =>
      c.id === id && c.size === size && (c.color || '') === color
    );

    if (p.track) {
      const q = qtyOf(p, color, size);
      if (q <= 0) return U.toast(C.TEXTS.NOT_AVAILABLE);
      if ((hit ? hit.qty : 0) + 1 > q) return U.toast('المتوفر ' + q + ' فقط');
    }

    if (hit) hit.qty++;
    else STORE.cart.push({ id: id, size: size, color: color, qty: 1 });

    saveCart();
    U.toast('تمت الإضافة إلى العربة 🛒');

    if (E) E.addToCart(p, { color: color, size: size }, 1);
  }

  function changeQty(i, d) {
    if (!STORE.cart[i]) return;
    if (d > 0) {
      const c = STORE.cart[i];
      const p = STORE.products.find(x => x.id === c.id);
      if (p && p.track && c.qty + 1 > qtyOf(p, c.color || '', c.size || '')) {
        return U.toast('وصلت للحد المتوفر');
      }
    }
    STORE.cart[i].qty += d;
    if (STORE.cart[i].qty <= 0) STORE.cart.splice(i, 1);
    saveCart();
    renderCart();
  }

  function removeItem(i) {
    STORE.cart.splice(i, 1);
    saveCart();
    renderCart();
  }

  function clearCart() {
    if (!confirm('تفريغ العربة؟')) return;
    STORE.cart = [];
    saveCart();
    renderCart();
  }

  /* ═══════════════════════════════════════════════════════════
     🧸 دوال المنتج
     ═══════════════════════════════════════════════════════════ */

  function variantsOf(p) {
    return (p.variants || []).filter(v => v && v.color);
  }

  function colorOptions(p) {
    const o = [];
    if (p.color) {
      o.push({
        color: p.color,
        image: p.image || '',
        thumb: p.thumb || '',
        gender: p.colorGender || ''
      });
    }
    variantsOf(p).forEach(v => {
      if (!o.some(x => x.color === v.color)) {
        o.push({
          color: v.color,
          image: v.image || '',
          thumb: v.thumb || '',
          gender: v.gender || ''
        });
      }
    });
    return o;
  }

  function colorsOf(p) {
    const o = colorOptions(p).map(x => x.color);
    return o.length ? o : [p.color || ''];
  }

  function sizesList(p) {
    return (p.sizes && p.sizes.length) ? p.sizes : [''];
  }

  function imageFor(p, color) {
    const o = colorOptions(p).find(x => x.color === color);
    return (o && o.image) || p.image ||
      (variantsOf(p).find(v => v.image) || {}).image || '';
  }

  function thumbFor(p, color) {
    const o = colorOptions(p).find(x => x.color === color);
    if (o && (o.thumb || o.image)) return o.thumb || o.image;
    if (p.image) return p.thumb || p.image;
    const v = variantsOf(p).find(x => x.image) || {};
    return v.thumb || v.image || '';
  }

  function qtyOf(p, c, s) {
    if (!p.track) return Infinity;
    let t = 0;
    const inv = p.inv || {};
    (c ? [c] : colorsOf(p)).forEach(a =>
      (s ? [s] : sizesList(p)).forEach(b => {
        t += Math.max(0, +inv[U.ik(a, b)] || 0);
      })
    );
    return t;
  }

  function sizeOk(p, c, z) {
    if (!z) return true;
    return qtyOf(p, c || '', z) > 0;
  }

  function colorHas(p, c) {
    const sizes = sizesList(p);
    if (!sizes.length) return true;
    return sizes.some(z => sizeOk(p, c, z));
  }

  function soldOut(p) {
    return !!(p.track && qtyOf(p, '', '') <= 0);
  }

  function cid(p) {
    return String(p.code || p.id);
  }

  /* ═══════════════════════════════════════════════════════════
     📊 Meta Pixel — التهيئة
     ═══════════════════════════════════════════════════════════ */

  function initPixel(pixelId) {
    if (!pixelId) return;

    const tryInit = (attempt) => {
      if (typeof fbq !== 'function') {
        if (attempt < 20) return setTimeout(() => tryInit(attempt + 1), 250);
        return;
      }
      try {
        const vid = T ? T.getVid() : U.getVid();
        fbq('init', pixelId, { external_id: vid });
        fbq('track', 'PageView');
        window.MK_PIXEL_READY = true;
        console.log('✅ Meta Pixel initialized:', pixelId);
        setTimeout(() => { if (T) T.refreshFbp(); }, 1000);
      } catch (e) {
        console.warn('Pixel init failed:', e);
      }
    };
    tryInit(0);
  }

  /* ═══════════════════════════════════════════════════════════
     📥 تحميل البيانات
     ═══════════════════════════════════════════════════════════ */

  async function loadStore() {
    try {
      const { data: st, error: sErr } = await sb
        .from('settings').select('*').eq('id', 1).maybeSingle();
      if (sErr) throw sErr;

      if (st) {
        STORE.settings.name = st.store_name || STORE.settings.name;
        STORE.settings.name_full = st.store_name_full || STORE.settings.name_full;
        STORE.settings.phone = st.phone || STORE.settings.phone;
        STORE.settings.currency = st.currency || STORE.settings.currency;
        STORE.settings.title = st.title || STORE.settings.title;
        STORE.settings.tagline = st.tagline || STORE.settings.tagline;
        STORE.settings.announce = st.announce || STORE.settings.announce;
        STORE.settings.address = st.address || STORE.settings.address;
        STORE.settings.logo = st.logo_url || '';
        STORE.settings.cover = st.cover_url || '';
        STORE.settings.instagram = st.instagram || '';
        STORE.settings.facebook = st.facebook || '';
        STORE.settings.tiktok = st.tiktok || '';
        STORE.settings.delivery = st.delivery || STORE.settings.delivery;
        STORE.settings.pages = st.pages || [];
        STORE.settings.pixel_id = st.pixel_id || C.PIXEL_ID || '';
        if (Array.isArray(st.menu) && st.menu.length) {
          STORE.settings.menu = st.menu;
        }
      }

      const { data: cats, error: cErr } = await sb
        .from('categories').select('*').eq('is_active', true).order('sort_order');
      if (cErr) throw cErr;
      STORE.categories = cats || [];

      const { data: prods, error: pErr } = await sb.from('products').select(`
        id, code, name, description, price, old_price, category_id,
        image_url, thumb_url, is_published, position, created_at,
        product_colors (
          id, name, gender, image_url, thumb_url, position,
          product_stock ( id, size, qty )
        )
      `).eq('is_published', true)
        .order('position')
        .order('created_at', { ascending: false });
      if (pErr) throw pErr;

      STORE.products = (prods || []).map(pr => {
        const cols = (pr.product_colors || [])
          .slice()
          .sort((a, b) => (a.position || 0) - (b.position || 0));
        const first = cols[0] || { name: '', gender: '', image_url: '', thumb_url: '' };
        const sizes = [];
        const inv = {};

        cols.forEach(col => {
          (col.product_stock || []).forEach(s => {
            if (!sizes.includes(s.size)) sizes.push(s.size);
            inv[U.ik(col.name, s.size)] = s.qty;
          });
        });

        return {
          id: pr.id,
          created: pr.created_at || '',
          code: pr.code || '',
          name: pr.name,
          price: Number(pr.price),
          oldPrice: pr.old_price == null ? null : Number(pr.old_price),
          category_id: pr.category_id || '',
          category: (STORE.categories.find(c => c.id === pr.category_id) || {}).name || '',
          desc: pr.description || '',
          image: pr.image_url || '',
          thumb: pr.thumb_url || pr.image_url || '',
          color: first.name,
          colorGender: first.gender || '',
          sizes: sizes,
          inv: inv,
          track: true,
          variants: cols.slice(1).map(c => ({
            color: c.name,
            image: c.image_url || '',
            thumb: c.thumb_url || '',
            gender: c.gender || ''
          })),
          images: []
        };
      });

      const saved = U.readLS(C.CUSTOMER_KEY, null);
      if (saved && typeof saved === 'object') {
        STORE.customer = {
          name: saved.name || '',
          phone: saved.phone || '',
          email: saved.email || '',
          zone: saved.zone || '',
          region: saved.region || ''
        };
      }
      return true;
    } catch (e) {
      console.warn('loadStore failed:', e);
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     🎨 تطبيق الإعدادات
     ═══════════════════════════════════════════════════════════ */

  function applySettings() {
    const s = STORE.settings;
    document.title = s.name_full;

    const an = U.$('announce');
    if (an) an.textContent = s.announce || '';
    const short = (s.name || '').split('-')[0].trim() || s.name;

    ['brandName', 'footName'].forEach(id => {
      const el = U.$(id);
      if (el) el.textContent = short;
    });
    const cn = U.$('copyName');
    if (cn) cn.textContent = s.name_full;
    const yr = U.$('year');
    if (yr) yr.textContent = new Date().getFullYear();

    const ht = U.$('heroTitle');
    if (ht) {
      // العلامة | في العنوان = سطر جديد (مثال: أجمل إطلالات | لأصغر أحلامك)
      ht.textContent = '';
      String(s.title || '').split('|').forEach(function (part, i) {
        if (i) ht.appendChild(document.createElement('br'));
        ht.appendChild(document.createTextNode(part.trim()));
      });
    }
    const hct = U.$('heroCtaText');
    if (hct) hct.textContent = (C.HERO_BTN_TEXT || 'تسوق الآن');
    const tg = U.$('tagline');
    if (tg) tg.textContent = s.tagline || '';

    [['brandLogo'], ['footLogo']].forEach(pair => {
      const el = U.$(pair[0]);
      if (!el) return;
      if (s.logo) {
        el.src = s.logo;
        el.style.display = 'block';
        const sib = el.nextElementSibling;
        if (sib && sib.tagName === 'SPAN') sib.style.display = 'none';
      } else {
        el.removeAttribute('src');
        el.style.display = 'none';
        const sib = el.nextElementSibling;
        if (sib && sib.tagName === 'SPAN') sib.style.display = 'block';
      }
    });

    const fav = U.$('favicon');
    if (fav && s.logo) fav.href = s.logo;

    updateWaLinks();
    renderSocial();
    renderAddress();
    renderHero();
    renderDelivery();
    renderFootPages();
  }

  const SOC_ICONS = {
    instagram: '<svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="4.6" fill="none" stroke="#000" stroke-width="1.9"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="#000" stroke-width="1.9"/><circle cx="16.7" cy="7.3" r="1.15" fill="#000"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path fill="#000" d="M13.5 21.5v-8h2.7l.4-3.2h-3.1V8.3c0-.9.3-1.5 1.6-1.5h1.7V3.9c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.6v3.2h2.8v8h3.1z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><g fill="none" stroke="#000" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M13.6 4v10.3a3.3 3.3 0 1 1-3.3-3.3"/><path d="M13.6 4c.3 2.3 1.9 4 4.3 4.3"/></g></svg>'
  };

  function socialUrl(kind, v) {
    v = (v || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    v = v.replace(/^@/, '');
    const base = {
      instagram: 'https://instagram.com/',
      facebook: 'https://facebook.com/',
      tiktok: 'https://tiktok.com/@'
    };
    return (base[kind] || '') + v;
  }

  function renderSocial() {
    const s = STORE.settings;
    const soc = [
      ['instagram', 'انستغرام'],
      ['facebook', 'فيسبوك'],
      ['tiktok', 'تيك توك']
    ].map(pair => [pair[0], socialUrl(pair[0], s[pair[0]]), pair[1]])
      .filter(x => x[1]);

    const fs = U.$('footSocial');
    if (!fs) return;
    fs.innerHTML = soc.map(x =>
      '<a class="soc-' + x[0] + '" href="' + U.esc(x[1]) + '" target="_blank" rel="noopener" aria-label="' + x[2] + '">' + (SOC_ICONS[x[0]] || '') + '</a>'
    ).join('');
  }

  function renderAddress() {
    const s = STORE.settings;
    ['footAddr', 'bandAddr'].forEach(id => {
      const a = U.$(id);
      if (!a) return;
      if (s.address) {
        a.textContent = '📍 ' + s.address;
        a.hidden = false;
        a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.address);
      } else {
        a.hidden = true;
        a.textContent = '';
      }
    });
  }

  function bindHeroCta() {
    const a = U.$('heroCta');
    if (!a || a.dataset.bound) return;
    a.dataset.bound = '1';
    a.addEventListener('click', function (e) {
      const target = U.$('shop');
      if (!target) return;
      e.preventDefault();
      const bar = document.querySelector('.topbar');
      const off = (bar ? bar.offsetHeight : 70) + 8;
      const y = target.getBoundingClientRect().top + window.pageYOffset - off;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  }

  function renderHero() {
    bindHeroCta();
    const s = STORE.settings;
    const src = s.cover || (STORE.products.find(p => p.image) || {}).image || '';
    const hv = U.$('heroVisual');
    if (!hv) return;
    hv.innerHTML = src
      ? '<div class="frame"><img src="' + U.esc(src) + '" alt="' + U.esc(s.name) + '" fetchpriority="high" decoding="async"></div>'
      : '<div class="frame ph" aria-hidden="true"></div>';
  }

  /* ═══════════════════════════════════════════════════════════
     🚚 التوصيل (نظام القسمين + المدن)
     ═══════════════════════════════════════════════════════════ */

  function normalizeZones(raw) {
    if (Array.isArray(raw) && raw.length) {
      if (raw[0].cities) return raw;
      return [{
        id: 'zone_legacy',
        name: 'مناطق التوصيل',
        default_price: '',
        cities: raw.map(d => ({ name: d.name || '', price: d.price == null ? '' : d.price }))
      }];
    }
    if (raw && Array.isArray(raw.zones)) return raw.zones;
    return [];
  }

  function getZones() {
    return normalizeZones(STORE.settings.delivery);
  }

  function parsePriceVal(v) {
    if (v == null || v === '') return '';
    const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? String(v).trim() : n;
  }

  function zonePrice(zone, city) {
    if (city && city.price != null && city.price !== '') {
      return parsePriceVal(city.price);
    }
    return parsePriceVal(zone.default_price);
  }

  function getSelectedDelivery() {
    const zoneId = STORE.customer.zone || '';
    const cityName = STORE.customer.region || '';
    const zones = getZones();
    const zone = zones.find(z => (z.id || z.name) === zoneId);
    if (!zone) return null;

    if (cityName) {
      const c = (zone.cities || []).find(x => x.name === cityName);
      if (c) {
        return {
          kind: 'city',
          zone: zone,
          name: c.name,
          price: zonePrice(zone, c),
          label: (zone.name || '') + ' — ' + c.name
        };
      }
    }
    return {
      kind: 'zone',
      zone: zone,
      name: zone.name || '',
      price: parsePriceVal(zone.default_price),
      label: zone.name || ''
    };
  }

  function priceDisplay(p) {
    if (p === '' || p == null) return 'حسب المنطقة';
    return typeof p === 'number' ? U.esc(STORE.settings.currency) + U.fmt(p) : U.esc(String(p));
  }

  function renderDelivery() {
    const zones = getZones();
    const hasZones = zones.length > 0;
    const dv = U.$('delivery');
    if (dv) dv.hidden = !hasZones;
    const ds = U.$('deliverySub');
    if (ds) ds.textContent = hasZones ? 'التوصيل متاح إلى: ' + zones.map(z => z.name).filter(Boolean).join('، ') : '';
    const dg = U.$('deliveryGrid');
    if (!dg) return;

    let html = '';
    zones.forEach(zone => {
      const cities = (zone.cities || []).filter(c => c.name);
      const general = parsePriceVal(zone.default_price);
      const generalTxt = general === '' ? 'حسب المنطقة' : priceDisplay(general);
      html += '<div class="dcard">' +
        '<i>🚚</i>' +
        '<div class="dname">' + U.esc(zone.name || '') + '</div>' +
        '<div class="dprice">' + generalTxt + '</div>' +
        (cities.length ? '<div class="dcount">' + cities.length + ' مدينة متاحة</div>' : '') +
      '</div>';
    });
    dg.innerHTML = html;
  }

  function renderFootPages() {
    const fp = U.$('footPages');
    if (!fp) return;
    const pages = (STORE.settings.pages || []).filter(x => x.title && x.text);
    fp.innerHTML = pages.map((x, i) =>
      '<a href="#" data-pg="' + i + '">' + U.esc(x.title) + '</a>'
    ).join('');
  }

  function updateWaLinks() {
    const msg = 'مرحباً، عندي استفسار';
    ['waTop', 'waBand', 'waFoot'].forEach(id => {
      const el = U.$(id);
      if (el) el.href = U.waLink(STORE.settings.phone, msg);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     📋 القائمة
     ═══════════════════════════════════════════════════════════ */

  function renderMenuMain() {
    const list = U.$('catsList');
    if (!list) return;
    const menu = (STORE.settings.menu && STORE.settings.menu.length)
      ? STORE.settings.menu
      : C.DEFAULTS.menu;

    list.innerHTML = menu.map(m => {
      const arrow = m.hasSub ? '<span class="arrow">‹</span>' : '';
      return '<button type="button" class="cat-item" data-action="' + U.esc(m.action || '') + '">' +
        '<span>' + U.esc(m.label) + '</span>' + arrow + '</button>';
    }).join('');

    const back = U.$('catsBack');
    if (back) back.style.display = 'none';
    const title = U.$('catsTitle');
    if (title) title.textContent = 'القائمة';
    STORE.menuView = 'main';
  }

  function renderMenuProducts() {
    const list = U.$('catsList');
    if (!list) return;
    const items = [{ name: '', label: 'الكل' }].concat(
      STORE.categories.map(c => ({ name: c.name, label: c.name }))
    );
    list.innerHTML = items.map(it => {
      const active = (STORE.activeCat === it.name) ? ' active' : '';
      return '<button type="button" class="cat-item' + active + '" data-cat="' + U.esc(it.name) + '">' +
        '<span>' + U.esc(it.label) + '</span></button>';
    }).join('');

    const back = U.$('catsBack');
    if (back) back.style.display = 'inline-flex';
    const title = U.$('catsTitle');
    if (title) title.textContent = 'المنتجات';
    STORE.menuView = 'products';
  }

  /* ═══════════════════════════════════════════════════════════
     👦 الفلاتر
     ═══════════════════════════════════════════════════════════ */

  const GSET = ['ذكر', 'أنثى'];

  function hasTags(p) {
    return GSET.includes(p.colorGender) ||
      variantsOf(p).some(v => GSET.includes(v.gender));
  }

  function gOk(gen, g) {
    return !g || !GSET.includes(gen) || gen === g;
  }

  function inGender(p, g) {
    if (!g || !GSET.includes(g)) return true;
    if (hasTags(p)) {
      return !!(p.image && gOk(p.colorGender, g)) ||
        variantsOf(p).some(v => gOk(v.gender, g));
    }
    return true;
  }

  function visibleOpts(p) {
    const o = colorOptions(p);
    const g = STORE.activeGender;
    return (g && hasTags(p)) ? o.filter(x => gOk(x.gender, g)) : o;
  }

  /* ═══════════════════════════════════════════════════════════
     🎨 عرض المنتجات
     ═══════════════════════════════════════════════════════════ */

  function isNew(p) {
    const ts = Date.parse(p.created || '');
    return !!ts && Date.now() - ts < 14 * 864e5;
  }

  function sorted(l) {
    const ss = U.$('sortSel');
    const v = ss ? ss.value : '';
    if (v === 'lo') return l.slice().sort((a, b) => a.price - b.price);
    if (v === 'hi') return l.slice().sort((a, b) => b.price - a.price);
    return l;
  }

  function swatchHtml(o, cls, attrs) {
    const pic = o.thumb || o.image;
    return '<button type="button" class="swatch' + (pic ? '' : ' txt') + cls + '" ' + attrs +
      ' title="' + U.esc(o.color) + '" aria-label="' + U.esc(o.color) + '">' +
      (pic ? '<img src="' + U.esc(pic) + '" alt="" loading="lazy" decoding="async">' : U.esc(o.color)) +
      '</button>';
  }

  function sizesBlock(p) {
    const sizes = p.sizes || [];
    const sel = STORE.selectedSizes[p.id] || '';
    const cl = STORE.selectedColors[p.id] || '';
    let h = '';

    if (sizes.length > 1) {
      h = '<div class="card-meta">اختر المقاس:</div><div class="sizes">' +
        sizes.map(z => {
          const off = !sizeOk(p, cl, z);
          return '<button type="button" class="size-chip' +
            (sel === z ? ' selected' : '') +
            (off ? ' off' : '') + '"' +
            (off ? ' disabled' : '') +
            ' data-id="' + U.esc(p.id) + '" data-size="' + U.esc(z) + '">' +
            U.esc(z) + '</button>';
        }).join('') + '</div>';
    } else if (sizes.length) {
      h = '<div class="card-meta">المقاس: ' + U.esc(sizes[0]) + '</div>';
    }

    return '<div data-szbox>' + h + '</div>';
  }

  function renderProducts() {
    const searchEl = U.$('headerSearch');
    const q = (searchEl ? searchEl.value : '').trim().toLowerCase();
    const box = U.$('productContainer');
    if (!box) return;
    const cur = STORE.settings.currency;

    const list = STORE.products.filter(p =>
      (!STORE.activeCat || p.category === STORE.activeCat) &&
      (!STORE.activeGender || inGender(p, STORE.activeGender)) &&
      (!q || [p.name, p.code, p.color, p.desc, p.category, (p.sizes || []).join(' ')]
        .join(' ').toLowerCase().includes(q))
    );

    const shopTitle = U.$('shopHeadTitle');
    if (shopTitle) shopTitle.textContent = STORE.activeCat ? STORE.activeCat : 'مختارات معاذ كيدز';

    if (!list.length) {
      if (!STORE.products.length) {
        box.innerHTML = '';
      } else {
        box.innerHTML = '<div class="no-results"><b>لا توجد نتائج مطابقة</b>جرّب كلمة أخرى أو غيّر الفلتر.' +
          '<br><button type="button" data-reset-filters>عرض كل المنتجات</button></div>';
      }
      return;
    }

    box.innerHTML = sorted(list).map((p, idx) => {
      const sizes = p.sizes || [];
      if (sizes.length === 1) STORE.selectedSizes[p.id] = sizes[0];

      const opts = visibleOpts(p);
      if (opts.length === 1) STORE.selectedColors[p.id] = opts[0].color;

      const prev = STORE.selectedColors[p.id];
      if (!prev || !opts.some(o => o.color === prev)) {
        STORE.selectedColors[p.id] = opts[0] ? opts[0].color : '';
      }
      const selColor = STORE.selectedColors[p.id] || '';
      const showColor = selColor || (opts[0] ? opts[0].color : '');
      const shown = imageFor(p, showColor);
      const shownT = thumbFor(p, showColor);

      const img = shown
        ? '<img class="product-img" src="' + U.esc(shownT) + '" alt="' + U.esc(p.name) + '" width="400" height="500" ' +
          (idx < 4 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"') +
          ' decoding="async" onload="this.classList.add(\'ld\')" onerror="this.classList.add(\'ld\')">'
        : '<div class="no-img" aria-hidden="true">🧸</div>';

      const zoom = shown ? ' data-zoom="' + U.esc(p.id) + '" role="button" tabindex="0"' : '';
      const sizeHtml = sizesBlock(p);
      const colorHtml = opts.length > 1
        ? '<div class="card-meta">اللون: <b class="color-name">' + U.esc(selColor || 'اختر') + '</b></div><div class="swatches">' +
          opts.map(o => swatchHtml(o, (o.color === selColor ? ' selected' : '') +
            (!colorHas(p, o.color) ? ' off' : ''),
            'data-id="' + U.esc(p.id) + '" data-color="' + U.esc(o.color) + '"')).join('') + '</div>'
        : (opts.length === 1 ? '<div class="card-meta">اللون: ' + U.esc(opts[0].color) + '</div>' : '');

      const isSold = soldOut(p);
      const badge = isSold
        ? '<span class="badge-sold">نفد</span>'
        : (p.oldPrice > p.price
          ? '<span class="badge-sale">خصم ' + Math.round((1 - p.price / p.oldPrice) * 100) + '%</span>'
          : (isNew(p) ? '<span class="badge-sale" style="background:#25D366">جديد</span>' : ''));

      return '<article class="card" data-id="' + U.esc(p.id) + '">' + badge +
        '<div class="ph-wrap"' + zoom + '>' + img + (shown ? '<span class="zoom-hint" aria-hidden="true">🔍</span>' : '') + '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + U.esc(p.name) + '</h3>' +
          (p.code ? '<div class="card-code">رقم الصنف: ' + U.esc(p.code) + '</div>' : '') +
          colorHtml + sizeHtml +
          (p.desc ? '<div class="card-desc">' + U.esc(p.desc) + '</div>' : '') +
          '<div class="price">' + U.esc(cur) + U.fmt(p.price) +
            (p.oldPrice ? '<span class="old-price">' + U.esc(cur) + U.fmt(p.oldPrice) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<button type="button" class="order-btn' + (isSold ? ' disabled' : '') + '"' +
          (isSold ? ' disabled' : ' data-add="' + U.esc(p.id) + '"') + '>' +
          (isSold ? 'غير متوفر' : 'أضف للعربة 🛒') + '</button>' +
      '</article>';
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════
     📝 نص الواتساب
     ═══════════════════════════════════════════════════════════ */

  function cartMessage(items, withLinks) {
    const cur = STORE.settings.currency;
    let msg = 'مرحباً، أريد طلب المنتجات التالية:\n';

    items.forEach((x, i) => {
      msg += '\n' + (i + 1) + ') *' + x.p.name + '*' + (x.p.code ? ' (رقم ' + x.p.code + ')' : '');
      if (x.c.size) msg += '\n   المقاس: ' + x.c.size;
      const col = x.c.color || x.p.color;
      if (col) msg += '\n   اللون: ' + col;
      msg += '\n   الكمية: ' + x.c.qty + ' - ' + cur + U.fmt(x.p.price * x.c.qty);
    });

    msg += '\n\nالمجموع: ' + cur + U.fmt(cartTotal(items)) + ' (بدون التوصيل)';
    return msg;
  }

  function imageUrlOf(p, color) {
    const src = imageFor(p, color);
    if (!src || src.startsWith('data:')) return '';
    try { return new URL(src, location.href).href; } catch (e) { return ''; }
  }

  /* ═══════════════════════════════════════════════════════════
     🛒 عرض السلة (Checkout)
     ═══════════════════════════════════════════════════════════ */

  function renderCart() {
    if (document.activeElement && document.activeElement.id) {
      window.__lastActiveId = document.activeElement.id;
    }
    const items = cartItems();
    const cur = STORE.settings.currency;
    const box = U.$('cartBody');
    if (!box) return;
    updateCartBadge();

    if (!items.length) {
      box.innerHTML =
        '<div class="chk-empty">' +
          '<div class="chk-empty-icon">🛒</div>' +
          '<div>' + C.TEXTS.EMPTY_CART + '</div>' +
        '</div>';
      return;
    }

    const itemsHtml = items.map((x, i) => {
      const pic = thumbFor(x.p, x.c.color);
      const col = x.c.color || x.p.color;
      return '<div class="chk-item">' +
        (pic ? '<img src="' + U.esc(pic) + '" alt="">' : '<div class="chk-noimg">🧸</div>') +
        '<div class="chk-item-info">' +
          '<div class="chk-item-name">' + U.esc(x.p.name) + '</div>' +
          '<div class="chk-item-meta">' +
            (x.c.size ? 'المقاس: ' + U.esc(x.c.size) : '') +
            (x.c.size && col ? ' · ' : '') +
            (col ? 'اللون: ' + U.esc(col) : '') +
          '</div>' +
          '<div class="chk-item-bottom">' +
            '<div class="chk-item-qty">' +
              '<button type="button" onclick="MK_STORE.changeQty(' + i + ',-1)" aria-label="إنقاص">−</button>' +
              '<b>' + x.c.qty + '</b>' +
              '<button type="button" onclick="MK_STORE.changeQty(' + i + ',1)" aria-label="زيادة">+</button>' +
            '</div>' +
            '<div class="chk-item-price">' + U.esc(cur) + U.fmt(x.p.price * x.c.qty) + '</div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="chk-item-remove" onclick="MK_STORE.removeItem(' + i + ')" aria-label="حذف">✕</button>' +
      '</div>';
    }).join('');

    const zones = getZones();
    const zonesOptionsHtml = zones.length
      ? '<option value="">اختر منطقة التوصيل...</option>' +
        zones.map((z, i) =>
          '<option value="' + U.esc(z.id || z.name) + '"' + (STORE.customer.zone === (z.id || z.name) ? ' selected' : '') + '>' +
          U.esc(z.name || ('المنطقة ' + (i + 1))) + '</option>'
        ).join('')
      : '<option value="">لا توجد مناطق توصيل</option>';

    const currentZone = zones.find(z => (z.id || z.name) === STORE.customer.zone);
    const citiesOptionsHtml = currentZone
      ? '<option value="">— اختر مدينة (اختياري) —</option>' +
        (currentZone.cities || []).filter(c => c.name).map(c => {
          const p = zonePrice(currentZone, c);
          const priceTxt = priceDisplay(p);
          return '<option value="' + U.esc(c.name) + '"' + (STORE.customer.region === c.name ? ' selected' : '') + '>' +
            U.esc(c.name) + ' — ' + priceTxt + '</option>';
        }).join('')
      : '<option value="">— اختر المنطقة أولاً —</option>';

    const itemsTotal = cartTotal(items);
    const selDelivery = getSelectedDelivery();
    const deliveryPrice = selDelivery && typeof selDelivery.price === 'number' ? selDelivery.price : 0;
    const grandTotal = itemsTotal + deliveryPrice;

    const summaryHtml =
      '<div class="chk-summary">' +
        '<div class="chk-summary-row"><span>المجموع الفرعي</span><span class="val">' + U.esc(cur) + U.fmt(itemsTotal) + '</span></div>' +
        '<div class="chk-summary-row"><span>التوصيل ' + (selDelivery ? '(' + U.esc(selDelivery.name) + ')' : '') + '</span>' +
          '<span class="val">' + (selDelivery ? (typeof selDelivery.price === 'number' ? U.esc(cur) + U.fmt(selDelivery.price) : U.esc(String(selDelivery.price))) : '—') + '</span></div>' +
        '<div class="chk-summary-row total"><span>الإجمالي</span><span class="val">' + U.esc(cur) + U.fmt(grandTotal) + '</span></div>' +
      '</div>';

    const html =
      '<div class="chk-section">' +
        '<div class="chk-section-head"><span class="chk-num">1</span> منتجاتك</div>' +
        '<div class="chk-items">' + itemsHtml + '</div>' +
      '</div>' +
      '<div class="chk-section">' +
        '<div class="chk-section-head"><span class="chk-num">2</span> بياناتك</div>' +
        '<div class="chk-fields">' +
          '<div class="chk-field">' +
            '<label for="chkName">الاسم <span class="opt">(اختياري)</span></label>' +
            '<input type="text" id="chkName" value="' + U.esc(STORE.customer.name) + '" placeholder="اسمك الكامل" autocomplete="name">' +
          '</div>' +
          '<div class="chk-field">' +
            '<label for="chkPhone">رقم الجوال <span class="opt">(اختياري)</span></label>' +
            '<input type="tel" id="chkPhone" value="' + U.esc(STORE.customer.phone) + '" placeholder="05XXXXXXXX" inputmode="tel" autocomplete="tel">' +
          '</div>' +
          '<div class="chk-field">' +
            '<label for="chkEmail">الإيميل <span class="opt">(اختياري — يساعدنا نخدمك أفضل)</span></label>' +
            '<input type="email" id="chkEmail" value="' + U.esc(STORE.customer.email || '') + '" placeholder="you@example.com" inputmode="email" autocomplete="email">' +
          '</div>' +
          '<div class="chk-field">' +
            '<label for="chkZone">منطقة التوصيل *</label>' +
            '<select id="chkZone">' + zonesOptionsHtml + '</select>' +
          '</div>' +
          (currentZone ?
          '<div class="chk-field">' +
            '<label for="chkRegion">المدينة <span class="opt">(اختياري)</span></label>' +
            '<select id="chkRegion">' + citiesOptionsHtml + '</select>' +
          '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="chk-section">' +
        '<div class="chk-section-head"><span class="chk-num">3</span> ملخص الطلب</div>' +
        summaryHtml +
      '</div>' +
      '<div class="chk-actions">' +
        '<button type="button" class="chk-submit" id="chkSubmit">' +
          '<svg viewBox="0 0 24 24" fill="currentColor"><use href="#icon-wa"/></svg>' +
          'إتمام الطلب عبر واتساب' +
        '</button>' +
      '</div>';

    box.innerHTML = html;

    const nameInp = U.$('chkName');
    const phoneInp = U.$('chkPhone');
    const emailInp = U.$('chkEmail');
    const zoneInp = U.$('chkZone');
    const regionInp = U.$('chkRegion');
    const submit = U.$('chkSubmit');

    if (nameInp) nameInp.addEventListener('input', e => {
      STORE.customer.name = e.target.value.trim();
      saveCustomer();
    });
    if (phoneInp) phoneInp.addEventListener('input', e => {
      STORE.customer.phone = e.target.value.trim();
      saveCustomer();
    });
    if (emailInp) emailInp.addEventListener('input', e => {
      STORE.customer.email = e.target.value.trim();
      saveCustomer();
    });

    if (zoneInp) zoneInp.addEventListener('change', e => {
      STORE.customer.zone = e.target.value;
      STORE.customer.region = '';
      saveCustomer();
      renderCart();
    });

    if (regionInp) regionInp.addEventListener('change', e => {
      STORE.customer.region = e.target.value;
      saveCustomer();
      const items2 = cartItems();
      if (items2.length) {
        const sel = getSelectedDelivery();
        const dp = sel && typeof sel.price === 'number' ? sel.price : 0;
        const newTotal = cartTotal(items2) + dp;
        const summary = box.querySelector('.chk-summary');
        if (summary) {
          summary.outerHTML =
            '<div class="chk-summary">' +
              '<div class="chk-summary-row"><span>المجموع الفرعي</span><span class="val">' + U.esc(cur) + U.fmt(cartTotal(items2)) + '</span></div>' +
              '<div class="chk-summary-row"><span>التوصيل ' + (sel ? '(' + U.esc(sel.name) + ')' : '') + '</span>' +
                '<span class="val">' + (sel ? (typeof sel.price === 'number' ? U.esc(cur) + U.fmt(sel.price) : U.esc(String(sel.price))) : '—') + '</span></div>' +
              '<div class="chk-summary-row total"><span>الإجمالي</span><span class="val">' + U.esc(cur) + U.fmt(newTotal) + '</span></div>' +
            '</div>';
        }
      }
    });

if (submit) submit.addEventListener('click', submitOrder);

    if (window.__lastActiveId) {
      const newActive = document.getElementById(window.__lastActiveId);
      if (newActive) newActive.focus();
    }
  }
  

  /* ═══════════════════════════════════════════════════════════
     🚀 إرسال الطلب
     ═══════════════════════════════════════════════════════════ */

  function genRef() {
    const d = new Date();
    const parts = [
      String(d.getFullYear()).slice(2),
      ('0' + (d.getMonth() + 1)).slice(-2),
      ('0' + d.getDate()).slice(-2)
    ];
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), b =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
    return 'MK-' + parts.join('') + '-' + rand;
  }

  async function submitOrder() {
    const items = cartItems();
    if (!items.length) return;

    const zones = getZones();
    if (zones.length && !STORE.customer.zone) {
      return U.toast(C.TEXTS.SELECT_ZONE || 'اختر منطقة التوصيل');
    }

    const selDelivery = getSelectedDelivery();
    const region = STORE.customer.region || '';

    const submitBtn = U.$('chkSubmit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري تجهيز الطلب...';
    }

    const ref = genRef();
    const cur = STORE.settings.currency;
    const itemsTotal = cartTotal(items);
    const deliveryPrice = selDelivery && typeof selDelivery.price === 'number' ? selDelivery.price : 0;
    const grandTotal = itemsTotal + deliveryPrice;

    const customerName = (STORE.customer.name || '').trim();
    const customerPhone = (STORE.customer.phone || '').trim();
    const customerEmail = (STORE.customer.email || '').trim();

    if (customerPhone) {
      const cleanPhone = customerPhone.replace(/\D/g, '');
      if (cleanPhone.length < 9) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'إتمام الطلب عبر واتساب';
        }
        return U.toast('رقم الجوال غير صحيح، يرجى إدخاله بشكل صحيح أو تركه فارغاً');
      }
    }
    
    if (customerEmail) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);
      if (!emailOk) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'إتمام الطلب عبر واتساب';
        }
        return U.toast('الإيميل غير صحيح، يرجى تصحيحه أو تركه فارغاً');
      }
    }

    const fbp = T ? T.getFbp() : U.getFbp();
    const fbc = T ? T.getFbc() : U.getFbc();
    const vid = T ? T.getVid() : U.getVid();
    const ua = navigator.userAgent || '';
    const sourceUrl = location.href;
    const trackingData = T ? T.getData() : {};

    const itemsPayload = items.map(x => ({
      product_id: x.p.id,
      product_code: x.p.code || '',
      product_name: x.p.name,
      color_name: x.c.color || x.p.color || '',
      size: x.c.size || '',
      qty: x.c.qty,
      unit_price: Number(x.p.price) || 0,
      line_total: (Number(x.p.price) || 0) * x.c.qty,
      image: imageUrlOf(x.p, x.c.color) || ''
    }));

    let msg = '🛒 *طلب جديد*\n';
    msg += 'رقم الطلب: ' + ref + '\n';
    if (customerName) msg += 'الاسم: ' + customerName + '\n';
    if (customerPhone) msg += 'الجوال: ' + customerPhone + '\n';
    if (customerEmail) msg += 'الإيميل: ' + customerEmail + '\n';
    if (STORE.customer.zone) {
      const z = zones.find(zz => (zz.id || zz.name) === STORE.customer.zone);
      msg += 'منطقة التوصيل: ' + (z ? z.name : STORE.customer.zone) + '\n';
    }
    if (region) msg += 'المدينة: ' + region + '\n';
    msg += '\n*المنتجات:*\n';

    items.forEach((x, i) => {
      msg += '\n' + (i + 1) + ') *' + x.p.name + '*' + (x.p.code ? ' (رقم ' + x.p.code + ')' : '');
      if (x.c.size) msg += '\n   المقاس: ' + x.c.size;
      const col = x.c.color || x.p.color;
      if (col) msg += '\n   اللون: ' + col;
      msg += '\n   الكمية: ' + x.c.qty + ' × ' + cur + U.fmt(x.p.price) + ' = *' + cur + U.fmt(x.p.price * x.c.qty) + '*';
    });

    msg += '\n\n*الحساب:*';
    msg += '\nالمجموع الفرعي: ' + cur + U.fmt(itemsTotal);
    if (selDelivery) {
      const priceTxt = typeof selDelivery.price === 'number' ? cur + U.fmt(selDelivery.price) : String(selDelivery.price);
      msg += '\nالتوصيل (' + selDelivery.label + '): ' + priceTxt;
    }
    msg += '\n*الإجمالي: ' + cur + U.fmt(grandTotal) + '*';

    const waUrl = U.waLink(STORE.settings.phone, msg);



    // 1) احفظ الطلب أولاً
    let savedOk = false;
    const isTestRequest = (function () {
        try {
          const url = new URL(location.href);
          if (url.searchParams.get('test') === '1') return true;
          return sessionStorage.getItem('mk_test_mode') === '1';
        } catch (e) { return false; }
      })();
    try {
      const row = {
        ref: ref,
        name: customerName || null,
        phone: customerPhone || null,
        customer_email: customerEmail || null,
        region: region || null,
        items: itemsPayload,
        total: grandTotal,
        status: 'new',
        is_test: isTestRequest,
        fbp: fbp || null,
        fbc: fbc || null,
        ua: ua || null,
        source_url: sourceUrl || null,
        meta: Object.assign({
          event_id: 'lead-' + ref,
          vid: vid || '',
          zone: STORE.customer.zone || '',
          city: region || '',
          zone_name: selDelivery ? (selDelivery.zone ? selDelivery.zone.name : '') : '',
          delivery_price: deliveryPrice,
          items_total: itemsTotal,
          currency: cur,
          email: customerEmail || '',
          referrer: document.referrer || '',
          screen: (window.screen ? window.screen.width + 'x' + window.screen.height : '')
        }, trackingData)
      };

      const res = await sb.from('leads').insert(row);
      if (res.error) console.warn('Lead save failed:', res.error);
      else savedOk = true;
    } catch (e) {
      console.warn('Lead save exception:', e);
    }

    // تتبّع Lead فقط بعد نجاح حفظ الطلب، حتى لا تُحتسب محاولات الحفظ الفاشلة.
    if (savedOk && E) {
      E.lead({
        ref: ref,
        items: itemsPayload,
        total: itemsTotal,
        customer: { name: customerName, phone: customerPhone, email: customerEmail, city: region }
      });
    }

// 3) النتيجة للزبون
    if (savedOk) {
      const successRef = U.$('successRef');
      if (successRef) successRef.textContent = ref;
      const successWa = U.$('successWaLink');
      if (successWa) successWa.href = waUrl;
      U.$('successModal')?.classList.add('open');
      STORE.cart = [];
      saveCart();
      renderCart();
      startWhatsAppAutoOpen(waUrl);
    } else {
      U.toast('⚠️ تعذّر حفظ الطلب، حاول مرة أخرى');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'إتمام الطلب عبر واتساب';
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ⏱️ فتح واتساب تلقائياً مع مؤقّت مرئي
     ═══════════════════════════════════════════════════════════ */

  let _waTimer = null;

  function startWhatsAppAutoOpen(waUrl) {
    const timerEl = U.$('successTimer');
    let seconds = 5;

    if (_waTimer) clearInterval(_waTimer);

    const updateTimerText = () => {
      if (!timerEl) return;
      timerEl.textContent = '⏳ سيُفتح واتساب تلقائياً خلال ' + seconds + ' ثوان...';
    };
    updateTimerText();

    _waTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(_waTimer);
        _waTimer = null;
        try { window.location.href = waUrl; } catch (_) {}
      } else {
        updateTimerText();
      }
    }, 1000);

    const closeBtn = U.$('successCloseBtn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        if (_waTimer) { clearInterval(_waTimer); _waTimer = null; }
        if (timerEl) timerEl.textContent = 'يمكنك فتح واتساب يدوياً من الزر الأخضر';
      };
    }

    const waBtn = U.$('successWaLink');
    if (waBtn) {
      waBtn.onclick = () => {
        if (_waTimer) { clearInterval(_waTimer); _waTimer = null; }
      };
    }
  }

  /* ═══════════════════════════════════════════════════════════
     🔍 Lightbox
     ═══════════════════════════════════════════════════════════ */

  function galleryOf(p) {
    const g = [];
    const seen = new Set();
    const add = (src, label, th) => {
      if (src && !seen.has(src)) {
        seen.add(src);
        g.push({ src: src, label: label || '', thumb: th || src });
      }
    };
    add(p.image, p.color, p.thumb);
    variantsOf(p).forEach(v => add(v.image, v.color, v.thumb));
    (p.images || []).forEach(src => add(src, '', ''));
    return g;
  }

  function openLightbox(id) {
    const p = STORE.products.find(x => x.id === id);
    if (!p) return;

    if (E) E.viewContent(p);

    const items = galleryOf(p);
    if (!items.length) return;

    const cur = imageFor(p, STORE.selectedColors[id] || '');
    STORE.LB = {
      items: items,
      i: Math.max(0, items.findIndex(x => x.src === cur)),
      name: p.name
    };
    renderLightbox();
    U.$('lightbox').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function renderLightbox() {
    const it = STORE.LB.items[STORE.LB.i];
    const many = STORE.LB.items.length > 1;
    if (!it) return;
    const img = U.$('lbImg');
    if (img) {
      img.src = it.src;
      img.alt = STORE.LB.name;
    }
    const cap = U.$('lbCap');
    if (cap) cap.textContent = STORE.LB.name + (it.label ? ' - ' + it.label : '');
    const cnt = U.$('lbCount');
    if (cnt) cnt.textContent = many ? (STORE.LB.i + 1) + ' / ' + STORE.LB.items.length : '';
    const th = U.$('lbThumbs');
    if (th) {
      th.innerHTML = many ? STORE.LB.items.map((x, k) =>
        '<button type="button" class="lb-th' + (k === STORE.LB.i ? ' on' : '') + '" data-k="' + k + '">' +
        '<img src="' + U.esc(x.thumb || x.src) + '" alt="" decoding="async"></button>'
      ).join('') : '';
    }
    document.querySelectorAll('#lbPrev,#lbNext').forEach(b => {
      b.style.display = many ? '' : 'none';
    });
  }

  function lbStep(d) {
    const n = STORE.LB.items.length;
    if (n < 2) return;
    STORE.LB.i = (STORE.LB.i + d + n) % n;
    renderLightbox();
  }

  function closeLightbox() {
    U.$('lightbox').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ═══════════════════════════════════════════════════════════
     🎯 ربط الأحداث
     ═══════════════════════════════════════════════════════════ */

  function bindEvents() {
    const catsList = U.$('catsList');
    if (catsList) {
      catsList.addEventListener('click', e => {
        const catItem = e.target.closest('.cat-item[data-cat]');
        if (catItem) {
          STORE.activeCat = catItem.dataset.cat || '';
          renderProducts();
          if (window.__closeCatsPanel) window.__closeCatsPanel();
          U.$('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const link = e.target.closest('.cat-item[data-action]');
        if (!link) return;
        const action = link.dataset.action;
        switch (action) {
          case 'home':
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (window.__closeCatsPanel) window.__closeCatsPanel();
            break;
          case 'products':
          case 'categories':
            renderMenuProducts();
            break;
          case 'who': {
            const pages = (STORE.settings.pages || []).filter(x => x.title && x.text);
            const pg = pages.find(x => /من نحن|about/i.test(x.title)) || pages[0];
            if (pg) {
              U.$('infoTitle').textContent = pg.title;
              U.$('infoText').textContent = pg.text;
              U.$('infoModal').classList.add('open');
              document.body.style.overflow = 'hidden';
            } else {
              U.toast('صفحة «من نحن» لم تُضف بعد من الإعدادات');
            }
            if (window.__closeCatsPanel) window.__closeCatsPanel();
            break;
          }
          case 'about':
            U.$('faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (window.__closeCatsPanel) window.__closeCatsPanel();
            break;
          case 'contact':
            U.$('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            if (window.__closeCatsPanel) window.__closeCatsPanel();
            break;
          default:
            if (window.__closeCatsPanel) window.__closeCatsPanel();
        }
      });
    }

    const back = U.$('catsBack');
    if (back) back.addEventListener('click', e => { e.stopPropagation(); renderMenuMain(); });

    const searchBtn = U.$('searchBtn');
    const searchPanel = U.$('searchPanel');
    if (searchBtn && searchPanel) {
      searchBtn.addEventListener('click', () => {
        const open = searchPanel.classList.contains('open');
        if (open) searchPanel.classList.remove('open');
        else {
          searchPanel.classList.add('open');
          setTimeout(() => U.$('headerSearch')?.focus(), 100);
        }
      });
    }
    const searchClose = U.$('searchClose');
    if (searchClose && searchPanel) {
      searchClose.addEventListener('click', () => {
        searchPanel.classList.remove('open');
        const inp = U.$('headerSearch');
        if (inp) {
          inp.value = '';
          inp.blur();
        }
        renderProducts();
      });
    }

    function openCart() {
      renderCart();
      const items = cartItems();
      if (items.length) {
        if (E) E.initiateCheckout(items, cartTotal(items));
      }
      U.$('cartModal')?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    U.$('cartBtn')?.addEventListener('click', openCart);
    U.$('mobileCartBar')?.addEventListener('click', openCart);
    U.$('cartCloseBtn')?.addEventListener('click', () => {
      U.$('cartModal')?.classList.remove('open');
      document.body.style.overflow = '';
    });
    U.$('infoCloseBtn')?.addEventListener('click', () => {
      U.$('infoModal')?.classList.remove('open');
      document.body.style.overflow = '';
    });
    U.$('successCloseBtn')?.addEventListener('click', () => {
      U.$('successModal')?.classList.remove('open');
      U.$('cartModal')?.classList.remove('open');
      document.body.style.overflow = '';
    });

    const pc = U.$('productContainer');
    if (pc) {
      pc.addEventListener('click', e => {
        const chip = e.target.closest('.size-chip');
        if (chip) {
          const id = chip.dataset.id;
          const size = chip.dataset.size;
          STORE.selectedSizes[id] = STORE.selectedSizes[id] === size ? '' : size;
          const p = STORE.products.find(x => x.id === id);
          if (p) chip.closest('[data-szbox]').outerHTML = sizesBlock(p);
          return;
        }
        const sw = e.target.closest('.swatch');
        if (sw) {
          const id = sw.dataset.id;
          const color = sw.dataset.color;
          const p = STORE.products.find(x => x.id === id);
          if (!p) return;
          STORE.selectedColors[id] = color;
          const card = sw.closest('.card');
          card.querySelectorAll('.swatch').forEach(b => b.classList.toggle('selected', b.dataset.color === color));
          const nm = card.querySelector('.color-name');
          if (nm) nm.textContent = color;
          const im = card.querySelector('img.product-img');
          if (im) im.src = thumbFor(p, color);
          const szb = card.querySelector('[data-szbox]');
          if (szb) {
            const curSize = STORE.selectedSizes[id];
            if (curSize && !sizeOk(p, color, curSize)) STORE.selectedSizes[id] = '';
            szb.outerHTML = sizesBlock(p);
          }
          return;
        }
        const rs = e.target.closest('[data-reset-filters]');
        if (rs) {
          STORE.activeCat = '';
          STORE.activeGender = '';
          const si = U.$('headerSearch'); if (si) si.value = '';
          document.querySelectorAll('#genderBar .gender-btn').forEach(x => x.classList.toggle('active', !x.dataset.gender));
          renderProducts();
          return;
        }
        const z = e.target.closest('[data-zoom]');
        if (z) { openLightbox(z.dataset.zoom); return; }
        const b = e.target.closest('[data-add]');
        if (b) { addToCart(b.dataset.add); return; }
      });
    }

    if (pc) {
      pc.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const z = e.target.closest('[data-zoom]');
        if (z) { e.preventDefault(); openLightbox(z.dataset.zoom); }
      });
    }

    ['cartModal', 'infoModal'].forEach(id => {
      const m = U.$(id);
      if (!m) return;
      m.addEventListener('click', e => {
        if (e.target !== m) return;
        m.classList.remove('open');
        if (!document.querySelector('.modal-bg.open')) document.body.style.overflow = '';
      });
    });

    const gb = U.$('genderBar');
    if (gb) {
      gb.addEventListener('click', e => {
        const b = e.target.closest('.gender-btn');
        if (!b) return;
        STORE.activeGender = b.dataset.gender || '';
        gb.querySelectorAll('.gender-btn').forEach(x => x.classList.toggle('active', x === b));
        renderProducts();
      });
    }

    U.$('headerSearch')?.addEventListener('input', U.debounce(() => {
      renderProducts();
      const q = (U.$('headerSearch')?.value || '').trim();
      if (E && q.length >= 3) E.search(q);
    }, 250));

    U.$('sortSel')?.addEventListener('change', renderProducts);

    U.$('lbClose') && (U.$('lbClose').onclick = closeLightbox);
    U.$('lbPrev') && (U.$('lbPrev').onclick = () => lbStep(-1));
    U.$('lbNext') && (U.$('lbNext').onclick = () => lbStep(1));
    const lb = U.$('lightbox');
    if (lb) lb.addEventListener('click', e => {
      if (e.target.id === 'lightbox' || e.target.id === 'lbStage') closeLightbox();
    });
    const stage = U.$('lbStage');
    if (stage) {
      let sx = 0, sy = 0;
      stage.addEventListener('touchstart', e => {
        if (!e.touches.length) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      }, { passive: true });
      stage.addEventListener('touchend', e => {
        const t = e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) lbStep(dx < 0 ? 1 : -1);
      }, { passive: true });
    }
    document.addEventListener('keydown', e => {
      if (!U.$('lightbox')?.classList.contains('open')) return;
      if (e.key === 'ArrowLeft') lbStep(1);
      if (e.key === 'ArrowRight') lbStep(-1);
    });

    const lt = U.$('lbThumbs');
    if (lt) lt.addEventListener('click', e => {
      const b = e.target.closest('.lb-th');
      if (!b) return;
      STORE.LB.i = +b.dataset.k;
      renderLightbox();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const open = document.querySelectorAll('.modal-bg.open');
        if (open.length) {
          const last = open[open.length - 1];
          last.classList.remove('open');
          if (!document.querySelector('.modal-bg.open')) document.body.style.overflow = '';
        }
        if (U.$('lightbox')?.classList.contains('open')) closeLightbox();
      }
    });

    const fp = U.$('footPages');
    if (fp) {
      fp.addEventListener('click', e => {
        const a = e.target.closest('[data-pg]');
        if (!a) return;
        e.preventDefault();
        const pages = (STORE.settings.pages || []).filter(x => x.title && x.text);
        const pg = pages[+a.dataset.pg];
        if (!pg) return;
        U.$('infoTitle').textContent = pg.title;
        U.$('infoText').textContent = pg.text;
        U.$('infoModal').classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    }

    document.querySelectorAll('[data-wa]').forEach(el => {
      el.addEventListener('click', () => {
        if (E) E.contact(el.id || 'wa');
      });
    });

    try {
      const url = new URL(location.href);
      const fbclid = url.searchParams.get('fbclid');
      if (fbclid) sessionStorage.setItem('mk_fbclid', fbclid);
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════
     🚀 بدء التشغيل
     ═══════════════════════════════════════════════════════════ */

  async function boot() {
    if (T) T.init();
    if (E) E.init();

    const saved = U.readLS(C.CART_KEY, []);
    if (Array.isArray(saved)) STORE.cart = saved;

    const ok = await loadStore();
    if (!ok) U.toast(C.TEXTS.LOAD_ERROR);

    applySettings();

    if (STORE.settings.pixel_id) initPixel(STORE.settings.pixel_id);

    renderMenuMain();
    renderProducts();
    updateCartBadge();

    bindEvents();

    setInterval(() => { if (T) T.refresh(); }, 30000);
  }

  window.MK_STORE = {
    changeQty: changeQty,
    removeItem: removeItem,
    clearCart: clearCart,
    state: STORE
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();