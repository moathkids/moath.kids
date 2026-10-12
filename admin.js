/* ===================================================================
   admin.js — معاذ كيدز | Moath Kids
   الإصدار: 4.0 (ES2015)
   التاريخ: 2026-10-10
   
   المسؤولية: لوحة التحكم الكاملة.
   الجديد: نظام توصيل بالقسمين + مدن تابعة + رفع ملفات.
   =================================================================== */

window.Admin = (function () {
  'use strict';

  const C = window.MK_CONFIG;
  const U = window.MK_UTILS;
  const $ = U.$;
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);

  /* ═══════════════════════════════════════════════════════════
     📦 الحالة
     ═══════════════════════════════════════════════════════════ */

  const S = {
    products: [],
    categories: [],
    settings: null,
    orders: [],
    sales: [],
    capiLog: [],
    stats: {},
    editing: null,
    orderEditing: null,
    orderFilter: 'new',
    form: null,
    busy: false,
    settingsTab: 'store',
    ordersTimer: null,
    ops: [],
    opsReady: false,
    op: null,
    opView: null,
    capital: [],
    expenses: [],
    pick: null
  };

  /* ═══════════════════════════════════════════════════════════
     🔔 الإشعارات
     ═══════════════════════════════════════════════════════════ */

  function notify(msg, type) {
    U.toast(msg);
    const t = $('toast');
    if (t) {
      t.classList.remove('error', 'success');
      if (type) t.classList.add(type);
      setTimeout(() => t.classList.remove('error', 'success'), 3000);
    }
  }

  function fail(e, fallback) {
    console.error(e);
    const msg = (e && e.message) ? e.message : (fallback || 'حدث خطأ');
    notify(msg, 'error');
  }

  const esc = s => U.esc(s);

  /* ═══════════════════════════════════════════════════════════
     🔐 الدخول
     ═══════════════════════════════════════════════════════════ */

  async function checkSession() {
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) await enter();
      else showLogin();
    } catch (e) {
      console.error(e);
      showLogin();
    }
  }

  function showLogin() {
    const ls = $('loginScreen');
    const aa = $('adminApp');
    if (ls) ls.hidden = false;
    if (aa) aa.hidden = true;
  }

  async function enter() {
    const ls = $('loginScreen');
    const aa = $('adminApp');
    if (ls) ls.hidden = true;
    if (aa) aa.hidden = false;
    await loadAll();
    startOrdersRefresh();
  }

  async function login(e) {
    e.preventDefault();
    const btn = $('loginBtn');
    const err = $('loginError');
    if (err) err.textContent = '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'جاري الدخول...';
    }
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: $('loginEmail').value.trim(),
        password: $('loginPassword').value
      });
      if (error) throw error;
      $('loginPassword').value = '';
      await enter();
    } catch (ex) {
      const msg = /invalid/i.test(ex.message || '')
        ? 'الإيميل أو كلمة السر غير صحيحة'
        : (ex.message || 'تعذر تسجيل الدخول');
      if (err) err.textContent = msg;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'تسجيل الدخول';
      }
    }
  }

  async function logout() {
    if (S.ordersTimer) clearInterval(S.ordersTimer);
    try { await sb.auth.signOut(); } catch (e) {}
    S.products = [];
    S.categories = [];
    S.orders = [];
    S.sales = [];
    S.capiLog = [];
    S.ops = [];
    showLogin();
  }

  /* ═══════════════════════════════════════════════════════════
     📥 تحميل البيانات
     ═══════════════════════════════════════════════════════════ */

  async function loadAll() {
    const pl = $('productsList');
    if (pl) pl.innerHTML = '<div class="loading">جاري التحميل...</div>';
    try {
      await Promise.all([
        loadCategories(),
        loadProducts(),
        loadSettings(),
        loadOrders(),
        loadSales(),
        loadCapiLog(),
        loadCapital(),
        loadExpenses(),
        loadOps()
      ]);
      renderAll();
    } catch (e) {
      fail(e, 'تعذر تحميل البيانات');
      if (pl) pl.innerHTML = '<div class="empty-state"><strong>تعذر تحميل البيانات</strong></div>';
    }
  }

  async function loadCategories() {
    const { data, error } = await sb.from('categories').select('*').order('sort_order');
    if (error) throw error;
    S.categories = data || [];
  }

  async function loadProducts() {
    const { data, error } = await sb.from('products').select(`
      id, code, name, description, price, old_price, category_id, image_url, thumb_url,
      is_published, position, created_at,
      product_colors (
        id, name, gender, image_url, thumb_url, position,
        product_stock ( id, size, qty )
      ),
      product_costs ( cost )
    `).order('created_at', { ascending: false });
    if (error) throw error;
    S.products = data || [];
  }

  async function loadSettings() {
    const { data, error } = await sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    S.settings = data || { id: 1 };
  }

  async function loadOrders() {
    const { data, error } = await sb.from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { console.warn('Orders load failed:', error); return; }
    S.orders = data || [];
    updateOrdersBadge();
    updateTestOrdersBadge();
  }

  async function loadSales() {
    const { data, error } = await sb.from('sales')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) { console.warn('Sales load failed:', error); return; }
    S.sales = data || [];
    calculateStats();
  }

  async function loadCapiLog() {
    const { data, error } = await sb.from('capi_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) { console.warn('capi_log load failed:', error); return; }
    S.capiLog = data || [];
  }
  /* ═══════════════════════════════════════════════════════════
     💰 دوال تحميل المالية
     ═══════════════════════════════════════════════════════════ */

  async function loadCapital() {
    const { data, error } = await sb
      .from('capital')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('capital load failed:', error);
      S.capital = [];
      return;
    }
    S.capital = data || [];
  }

  async function loadExpenses() {
    const { data, error } = await sb
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false });
    if (error) {
      console.warn('expenses load failed:', error);
      S.expenses = [];
      return;
    }
    S.expenses = data || [];
  }


  function startOrdersRefresh() {
    if (S.ordersTimer) clearInterval(S.ordersTimer);
    S.ordersTimer = setInterval(async () => {
      try {
        const before = S.orders.filter(o => o.status === 'new' && !o.is_test).length;
        await loadOrders();
        const after = S.orders.filter(o => o.status === 'new' && !o.is_test).length;
        if (after > before) {
          notify('🔔 وصلك طلب جديد!', 'success');
          try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
        }
        const tabOrders = $('tab-orders');
        if (tabOrders && tabOrders.classList.contains('active')) renderOrders();
        else updateOrdersBadge();
      } catch (e) {}
    }, 30000);
  }
  
  function updateTestOrdersBadge() {
  const n = S.orders.filter(o => o.is_test).length;
  const badge = $('testOrdersBadge');
  if (!badge) return;
  if (n > 0) {
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

async function toggleTestOrder(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o) return;
  const newVal = !o.is_test;
  const msg = newVal
    ? 'تمييز الطلب كاختبار؟\n\n(لن يُحسب في الإحصائيات)'
    : 'إلغاء علامة الاختبار؟';
  if (!confirm(msg)) return;
  try {
    const { error } = await sb.from('leads').update({ is_test: newVal }).eq('id', id);
    if (error) throw error;
    o.is_test = newVal;
    notify(newVal ? 'تم التمييز كاختبار ✓' : 'تم إلغاء العلامة ✓', 'success');
    renderOrderDetail();
    renderOrders();
    updateTestOrdersBadge();
    updateOrdersBadge();
  } catch (e) {
    fail(e, 'فشل التحديث');
  }
}

async function deleteTestOrders() {
  const testOrders = S.orders.filter(o => o.is_test);
  if (!testOrders.length) return notify('لا توجد طلبات تجريبية', 'error');
const refsPreview = testOrders.slice(0, 5).map(o => o.ref || '').filter(Boolean).join(', ');
    const moreText = testOrders.length > 5 ? ' و ' + (testOrders.length - 5) + ' أخرى' : '';
    if (!confirm('حذف ' + testOrders.length + ' طلب تجريبي نهائياً؟\n\nالمراجع: ' + refsPreview + moreText + '\n\nسيتم حذفها من:\n- leads\n- sales\n- sale_items')) return;
  try {
    const ids = testOrders.map(o => o.id);
    const refs = testOrders.map(o => o.ref).filter(Boolean);
    if (refs.length) {
      const { data: salesToDelete } = await sb.from('sales').select('id').in('ref', refs);
      const saleIds = (salesToDelete || []).map(s => s.id);
      if (saleIds.length) {
        await sb.from('sale_items').delete().in('sale_id', saleIds);
        await sb.from('sales').delete().in('id', saleIds);
      }
    }
    await sb.from('leads').delete().in('id', ids);
    notify('تم حذف ' + ids.length + ' طلب ✓', 'success');
    await loadAll();
  } catch (e) {
    fail(e, 'فشل الحذف');
  }
}

async function markOrderAsTest(id) {
  const o = S.orders.find(x => x.id === id);
  if (!o) return;
  if (o.is_test) return toggleTestOrder(id);
  if (!confirm('تمييز هذا الطلب كاختبار؟\n\n(لن يُحسب في الإحصائيات)')) return;
  try {
    const { error } = await sb.from('leads').update({ is_test: true }).eq('id', id);
    if (error) throw error;
    o.is_test = true;
    notify('تم التمييز كاختبار ✓', 'success');
    renderOrderDetail();
    renderOrders();
    updateTestOrdersBadge();
    updateOrdersBadge();
  } catch (e) {
    fail(e, 'فشل التحديث');
  }
}


  function updateOrdersBadge() {
    const n = S.orders.filter(o => o.status === 'new' && !o.is_test).length;
    const badge = $('ordersBadge');
    if (!badge) return;
    if (n > 0) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function renderAll() {
    renderStats();
    renderCategoryFilter();
    renderProducts();
    renderCategories();
    renderOrders();
    renderOps();
    renderSettings();
    renderMetaTab();
    renderFinance();
  }

  /* ═══════════════════════════════════════════════════════════
     📑 التبويبات
     ═══════════════════════════════════════════════════════════ */

  function goTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
    if (name === 'orders') renderOrders();
    if (name === 'returns' || name === 'exchanges') renderOps();
    if (name === 'meta') renderMetaTab();
    window.scrollTo({ top: 0 });
  }

  /* ═══════════════════════════════════════════════════════════
     📊 الإحصائيات
     ═══════════════════════════════════════════════════════════ */

  function stockOf(p) {
    return (p.product_colors || []).reduce((a, c) =>
      a + (c.product_stock || []).reduce((b, s) =>
        b + Math.max(0, Number(s.qty) || 0), 0), 0);
  }

  function costOf(p) {
    const pc = p.product_costs;
    if (!pc) return null;
    const val = Array.isArray(pc) ? (pc[0] && pc[0].cost) : pc.cost;
    return val != null ? Number(val) : null;
  }

  function calculateStats() {
    /* الإحصائيات صافية: بعد المرتجعات والاستبدالات (تُستثنى الملغاة والتجريبية فقط) */
    const live = S.sales.filter(s => s.status !== 'cancelled' && !s.is_test);
    const stats = live.reduce((acc, s) => {
      const n = saleNet(s);
      acc.totalSales += n.rev;
      acc.totalCost += n.cost;
      acc.totalProfit += n.profit;
      acc.totalDelivery += n.delivery;
      acc.totalCollected += n.collected;
      if (s.status !== 'returned') acc.count++;
      return acc;
    }, {
      totalSales: 0,
      totalCost: 0,
      totalProfit: 0,
      totalDelivery: 0,
      totalCollected: 0,
      count: 0
    });
    stats.avgOrder = stats.count ? stats.totalSales / stats.count : 0;
    stats.profitMargin = stats.totalSales ? (stats.totalProfit / stats.totalSales) * 100 : 0;
    S.stats = stats;
  }

  function renderStats() {
    const pub = S.products.filter(p => p.is_published);
    let pieces = 0, saleValue = 0, costValue = 0, hasCost = false;

    pub.forEach(p => {
      const q = stockOf(p);
      pieces += q;
      saleValue += q * Number(p.price || 0);
      const c = costOf(p);
      if (c != null && c > 0) {
        costValue += q * c;
        hasCost = true;
      }
    });

    const el = (id) => document.getElementById(id);
    if (el('statProducts')) el('statProducts').textContent = U.fmt(pub.length);
    if (el('statCategories')) el('statCategories').textContent = U.fmt(S.categories.length);
    if (el('statStock')) el('statStock').textContent = U.fmt(pieces);
    if (el('statValue')) el('statValue').textContent = C.CURRENCY + U.fmt(saleValue);
    if (el('statOrders')) el('statOrders').textContent = U.fmt(S.stats.count || 0);
    if (el('statTotalSales')) el('statTotalSales').textContent = C.CURRENCY + U.fmt(S.stats.totalSales || 0);
    if (el('statTotalCost')) el('statTotalCost').textContent = C.CURRENCY + U.fmt(S.stats.totalCost || 0);
    if (el('statTotalProfit')) el('statTotalProfit').textContent = C.CURRENCY + U.fmt(S.stats.totalProfit || 0);
    if (el('statTotalDelivery')) el('statTotalDelivery').textContent = C.CURRENCY + U.fmt(S.stats.totalDelivery || 0);
    if (el('statTotalCollected')) el('statTotalCollected').textContent = C.CURRENCY + U.fmt(S.stats.totalCollected || 0);
    if (el('statAvgOrder')) el('statAvgOrder').textContent = C.CURRENCY + U.fmt(S.stats.avgOrder || 0);
    if (el('statProfitMargin')) el('statProfitMargin').textContent = U.fmt(S.stats.profitMargin || 0) + '%';

    let card = document.getElementById('statProfitCard');
    if (!card) {
      card = document.createElement('div');
      card.className = 'stat-card';
      card.id = 'statProfitCard';
      card.innerHTML = '<div class="stat-icon">📈</div><div class="stat-body"><strong id="statProfit">—</strong><span>الربح المتوقع</span></div>';
const grid = document.getElementById('statsSalesGrid');
      if (grid) grid.appendChild(card);
    }
    if (hasCost) {
      const profit = saleValue - costValue;
      if (el('statProfit')) {
        el('statProfit').textContent = C.CURRENCY + U.fmt(profit);
        el('statProfit').style.color = profit >= 0 ? '#157a3d' : '#c8102e';
      }
    } else {
      if (el('statProfit')) {
        el('statProfit').textContent = '—';
        el('statProfit').style.color = '#8a8a8a';
      }
    }
  }
  
  /* ═══════════════════════════════════════════════════════════
     💰 دوال عرض المالية
     ═══════════════════════════════════════════════════════════ */

  function calcFinanceTotals() {
    let capitalIn = 0;
    let capitalOut = 0;
    S.capital.forEach(c => {
      const a = Number(c.amount) || 0;
      if (c.kind === 'withdrawal') capitalOut += a;
      else capitalIn += a;
    });
    const capitalNet = capitalIn - capitalOut;

    const liveSales = (S.sales || []).filter(s => s.status !== 'cancelled' && !s.is_test);
    let totalRevenue = 0;
    let totalCost = 0;
    liveSales.forEach(s => {
      const items = Number(s.items_total) || 0;
      const cost = Number(s.items_cost) || 0;
      const retTotal = Number(s.returned_total) || 0;
      const retCost = Number(s.returned_cost) || 0;
      totalRevenue += items - retTotal;
      totalCost += cost - retCost;
    });
    const grossProfit = totalRevenue - totalCost;

    let totalExpenses = 0;
    S.expenses.forEach(e => {
      totalExpenses += Number(e.amount) || 0;
    });

    const netProfit = grossProfit - totalExpenses;
    const balance = capitalNet + netProfit;

    return {
      capitalIn, capitalOut, capitalNet,
      totalRevenue, totalCost, grossProfit,
      totalExpenses, netProfit, balance
    };
  }

  function renderFinance() {
    const cur = C.CURRENCY || '₪';
    const t = calcFinanceTotals();

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('finCapital', cur + U.fmt(t.capitalIn));
    set('finProfit', cur + U.fmt(t.netProfit));
    set('finExpenses', cur + U.fmt(t.totalExpenses));
    set('finWithdrawals', cur + U.fmt(t.capitalOut));
    set('finBalance', cur + U.fmt(t.balance));

    const profitEl = document.getElementById('finProfit');
    if (profitEl) profitEl.style.color = t.netProfit >= 0 ? '#157a3d' : '#c8102e';
    const balEl = document.getElementById('finBalance');
    if (balEl) balEl.style.color = t.balance >= 0 ? '#157a3d' : '#c8102e';

    renderExpensesList();
    renderCapitalList();
  }

  function renderExpensesList() {
    const box = document.getElementById('expensesList');
    if (!box) return;
    const cur = C.CURRENCY || '₪';

    if (!S.expenses.length) {
      box.innerHTML = '<div class="empty-state"><strong>لا توجد مصاريف</strong>اضغط «إضافة مصروف» للبدء</div>';
      return;
    }

    box.innerHTML = S.expenses.map(e => {
      const date = e.expense_date ? new Date(e.expense_date).toLocaleDateString('ar-EG') : '';
      return '<div class="finance-row expense">' +
        '<div class="finance-row-info">' +
          '<div class="finance-row-title">' + esc(e.category || 'مصروف') + '</div>' +
          (e.note ? '<div class="finance-row-meta">' + esc(e.note) + '</div>' : '') +
          (date ? '<div class="finance-row-meta">📅 ' + esc(date) + '</div>' : '') +
        '</div>' +
        '<div class="finance-row-amount">− ' + esc(cur) + U.fmt(e.amount) + '</div>' +
        '<button type="button" class="finance-row-delete" data-del-expense="' + esc(e.id) + '">✕</button>' +
      '</div>';
    }).join('');
  }

  function renderCapitalList() {
    const box = document.getElementById('capitalList');
    if (!box) return;
    const cur = C.CURRENCY || '₪';

    if (!S.capital.length) {
      box.innerHTML = '<div class="empty-state"><strong>لا يوجد رأس مال مسجّل</strong></div>';
      return;
    }

    box.innerHTML = S.capital.map(c => {
      const isWithdrawal = c.kind === 'withdrawal';
      const date = c.created_at ? new Date(c.created_at).toLocaleDateString('ar-EG') : '';
      const label = isWithdrawal ? 'سحب' : (c.kind === 'initial' ? 'رأس مال أولي' : 'ضخ سيولة');
      const sign = isWithdrawal ? '− ' : '+ ';
      return '<div class="finance-row ' + (isWithdrawal ? 'expense' : 'income') + '">' +
        '<div class="finance-row-info">' +
          '<div class="finance-row-title">' + esc(label) + '</div>' +
          (c.note ? '<div class="finance-row-meta">' + esc(c.note) + '</div>' : '') +
          (date ? '<div class="finance-row-meta">📅 ' + esc(date) + '</div>' : '') +
        '</div>' +
        '<div class="finance-row-amount">' + sign + esc(cur) + U.fmt(c.amount) + '</div>' +
        '<button type="button" class="finance-row-delete" data-del-capital="' + esc(c.id) + '">✕</button>' +
      '</div>';
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════
     🧸 المنتجات
     ═══════════════════════════════════════════════════════════ */

  function catName(id) {
    return (S.categories.find(c => c.id === id) || {}).name || 'بدون قسم';
  }

  function renderCategoryFilter() {
    const sel = $('productsFilter');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">كل الأقسام</option>' +
      S.categories.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>').join('');
    if (cur && !S.categories.some(c => c.id === cur)) sel.value = '';
    else sel.value = cur;
  }

  function filterProducts() { renderProducts(); }
  const filterProductsDebounced = U.debounce(renderProducts, 200);

  function renderProducts() {
    const ps = $('productsSearch');
    const pf = $('productsFilter');
    const q = (ps ? ps.value : '').trim().toLowerCase();
    const cat = pf ? pf.value : '';
    const list = S.products.filter(p =>
      (!cat || p.category_id === cat) &&
      (!q || [p.name, p.code, p.description].join(' ').toLowerCase().includes(q)));

    const box = $('productsList');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="empty-state"><strong>لا توجد منتجات</strong>' +
        (S.products.length ? 'جرّب تغيير البحث' : 'اضغط «إضافة منتج» للبدء') + '</div>';
      return;
    }

    box.innerHTML = list.map(p => {
      const img = p.thumb_url || p.image_url || ((p.product_colors || [])[0] || {}).thumb_url || '';
      const qty = stockOf(p);
      const cost = costOf(p);
      const profitHtml = (cost != null && cost > 0 && Number(p.price) > 0)
        ? '<div class="product-card-meta" style="color:#157a3d;font-weight:600">الربح: ' +
          esc(C.CURRENCY) + U.fmt(Number(p.price) - cost) + ' للقطعة</div>'
        : '';

      const stockDetail = (p.product_colors || []).map(col => {
        const sizes = (col.product_stock || [])
          .filter(s => Number(s.qty) > 0)
          .map(s => esc(s.size) + '(' + U.fmt(s.qty) + ')')
          .join(' · ');
        if (!sizes) return '';
        return '<div class="stock-detail-row"><b>' + esc(col.name) + ':</b> ' + sizes + '</div>';
      }).filter(Boolean).join('');

      return '<div class="product-card" data-id="' + esc(p.id) + '">' +
        '<div class="product-card-img">' +
          (img ? '<img src="' + esc(img) + '" alt="" loading="lazy">'
               : '<div style="display:grid;place-items:center;height:100%;font-size:40px">🧸</div>') +
        '</div>' +
        '<div class="product-card-body">' +
          '<div class="product-card-title">' + esc(p.name) + '</div>' +
          '<div class="product-card-meta">' + esc(catName(p.category_id)) + ' · المخزون: ' + U.fmt(qty) +
            (p.is_published ? '' : ' · <b style="color:#c8102e">مخفي</b>') + '</div>' +
          (stockDetail ? '<div class="product-card-stock">' + stockDetail + '</div>' : '') +
          '<div class="product-card-price">' + esc(C.CURRENCY) + U.fmt(p.price) + '</div>' +
          profitHtml +
          '<div class="product-card-actions">' +
            '<button type="button" class="btn-edit" data-act="edit">تعديل</button>' +
            '<button type="button" class="btn-delete" data-act="del">حذف</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════
     🧸 نموذج المنتج
     ═══════════════════════════════════════════════════════════ */

  function blankForm() {
    return {
      id: null,
      name: '',
      code: '',
      category_id: '',
      price: '',
      old_price: '',
      description: '',
      is_published: true,
      image_url: '',
      thumb_url: '',
      cost: '',
      colors: [{ key: U.uid(), id: null, name: '', gender: '', image_url: '', thumb_url: '' }],
      sizes: [],
      stock: {}
    };
  }

  function formFromProduct(p) {
    const cols = (p.product_colors || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    const sizes = [];
    const stock = {};

    (p.product_colors || []).forEach(col => {
      (col.product_stock || []).forEach(s => {
        if (!sizes.includes(s.size)) sizes.push(s.size);
        stock[col.id + '|' + s.size] = s.qty;
      });
    });

    const cost = costOf(p);

    return {
      id: p.id,
      name: p.name || '',
      code: p.code || '',
      category_id: p.category_id || '',
      price: p.price,
      old_price: p.old_price == null ? '' : p.old_price,
      description: p.description || '',
      is_published: !!p.is_published,
      image_url: p.image_url || '',
      thumb_url: p.thumb_url || '',
      cost: cost == null ? '' : cost,
      colors: cols.length
        ? cols.map(c => ({
            key: c.id,
            id: c.id,
            name: c.name,
            gender: c.gender || '',
            image_url: c.image_url || '',
            thumb_url: c.thumb_url || ''
          }))
        : [{ key: U.uid(), id: null, name: '', gender: '', image_url: '', thumb_url: '' }],
      sizes: sizes,
      stock: stock
    };
  }

  function openProductForm(id) {
    const p = id ? S.products.find(x => x.id === id) : null;
    S.form = p ? formFromProduct(p) : blankForm();
    renderProductForm();
    const modal = $('productModal');
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeProductForm() {
    const modal = $('productModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    S.form = null;
  }

  function syncFormFromDom() {
    const f = S.form;
    if (!f) return;
    const g = id => { const el = $(id); return el ? el.value : ''; };
    f.name = g('pfName');
    f.code = g('pfCode');
    f.category_id = g('pfCat');
    f.price = g('pfPrice');
    f.old_price = g('pfOld');
    f.description = g('pfDesc');
    f.cost = g('pfCost');

    const urlInp = $('pfMainImgUrl');
    if (urlInp && urlInp.value.trim()) {
      f.image_url = urlInp.value.trim();
      f.thumb_url = urlInp.value.trim();
    }

    const pub = $('pfPub');
    f.is_published = pub ? pub.checked : true;

    document.querySelectorAll('.col-name[data-col]').forEach(inp => {
      const c = f.colors.find(x => x.key === inp.dataset.col);
      if (!c) return;
      c.name = inp.value;
    });
    document.querySelectorAll('.col-gender[data-col]').forEach(sel => {
      const c = f.colors.find(x => x.key === sel.dataset.col);
      if (!c) return;
      c.gender = sel.value;
    });
    document.querySelectorAll('[data-st]').forEach(inp => {
      f.stock[inp.dataset.st] = inp.value;
    });
  }

  function renderProductForm() {
    const f = S.form;
    if (!f) return;
    const colKey = c => c.id || c.key;
    const cols = f.colors;

    const colRows = cols.map((c, idx) => {
      const img = c.thumb_url || c.image_url;
      const totalQty = f.sizes.reduce((a, z) => {
        const k = colKey(c) + '|' + z;
        return a + Math.max(0, parseInt(f.stock[k], 10) || 0);
      }, 0);

      const sizeRows = f.sizes.map(z => {
        const k = colKey(c) + '|' + z;
        return '<div class="zf-size-row">' +
          '<input class="zf-input" value="' + esc(z) + '" disabled>' +
          '<input class="zf-input zf-qty" type="number" min="0" inputmode="numeric" data-st="' + esc(k) + '" value="' + esc(f.stock[k] == null ? 0 : f.stock[k]) + '" placeholder="العدد">' +
          '<button type="button" class="zf-icon-btn" data-act="delsize" data-size="' + esc(z) + '">✕</button>' +
        '</div>';
      }).join('');

      return '<div class="zf-color-card" data-col="' + esc(c.key) + '">' +
        '<div class="zf-color-head">' +
          '<div class="zf-color-title">اللون ' + (idx + 1) + '</div>' +
          '<div class="zf-color-count"><b>' + totalQty + '</b> قطعة</div>' +
          '<button type="button" class="zf-del-color" data-act="delcol" data-key="' + esc(c.key) + '">حذف</button>' +
        '</div>' +
        '<div class="zf-field">' +
          '<input class="zf-input col-name" data-col="' + esc(c.key) + '" value="' + esc(c.name) + '" placeholder="اسم اللون (وردي، أزرق...)">' +
        '</div>' +
        '<div class="zf-field">' +
          '<div class="zf-img-picker">' +
            (img
              ? '<div class="zf-img-preview"><img src="' + esc(img) + '" alt=""></div>'
              : '<div class="zf-img-preview empty"><span>📷</span></div>') +
            '<div class="zf-img-actions">' +
              '<label class="zf-btn-soft">' +
                (img ? 'تغيير الصورة' : 'اختيار ملف') +
                '<input type="file" accept="image/*" hidden data-colimg="' + esc(c.key) + '">' +
              '</label>' +
              (idx === 0 && !img ? '<p class="zf-img-hint">صورة هذا اللون هي «صورة المنتج الرئيسية»</p>' : '') +
              (idx > 0 && !img ? '<p class="zf-img-hint">صورة هذا اللون (اختيارية)</p>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="zf-field">' +
        '<label class="zf-label">الجنس (اختياري)</label>' +
        '<select class="zf-input col-gender" data-col="' + esc(c.key) + '">' +
          '<option value="">محايد (يظهر للجميع)</option>' +
          '<option value="ذكر"' + (c.gender === 'ذكر' ? ' selected' : '') + '>ذكر</option>' +
          '<option value="أنثى"' + (c.gender === 'أنثى' ? ' selected' : '') + '>أنثى</option>' +
        '</select>' +
      '</div>' +
        '<div class="zf-field zf-sizes-block">' +
          sizeRows +
          '<div class="zf-sizes-footer">' +
            '<button type="button" class="zf-add-size" data-act="addsize">+ إضافة مقاس</button>' +
            (idx > 0 ? '<button type="button" class="zf-add-size zf-copy-sizes" data-act="copysizes" data-key="' + esc(c.key) + '">📋 نفس مقاسات السابق</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    const mainImg = f.thumb_url || f.image_url;

    $('productModalBody').innerHTML =
      '<h2 class="zf-title">' + (f.id ? 'تعديل المنتج' : 'إضافة منتج') + '</h2>' +
      '<div class="zf-row">' +
        '<div class="zf-field"><label class="zf-label">اسم الصنف *</label>' +
          '<input id="pfName" class="zf-input" value="' + esc(f.name) + '" placeholder="أفرول"></div>' +
        '<div class="zf-field"><label class="zf-label">الرقم (اتركه فارغاً للتوليد التلقائي)</label>' +
          '<input id="pfCode" class="zf-input" value="' + esc(f.code) + '" placeholder="cod-000001"></div>' +
      '</div>' +
      '<div class="zf-field"><label class="zf-label">الوصف</label>' +
        '<textarea id="pfDesc" class="zf-input zf-textarea" placeholder="أفرول شتوي مبطن">' + esc(f.description) + '</textarea></div>' +
      '<div class="zf-row">' +
        '<div class="zf-field"><label class="zf-label">السعر *</label>' +
          '<input id="pfPrice" class="zf-input" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(f.price) + '" placeholder="50"></div>' +
        '<div class="zf-field"><label class="zf-label">السعر قبل الخصم</label>' +
          '<input id="pfOld" class="zf-input" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(f.old_price) + '"></div>' +
      '</div>' +
      '<div class="zf-field"><label class="zf-label">سعر التكلفة (الإدارة)</label>' +
        '<input id="pfCost" class="zf-input" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(f.cost) + '"></div>' +
      '<div class="zf-field"><label class="zf-label">القسم</label>' +
        '<select id="pfCat" class="zf-input"><option value="">بدون قسم</option>' +
          S.categories.map(c => '<option value="' + esc(c.id) + '"' + (c.id === f.category_id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
        '</select></div>' +
      '<div class="zf-field"><label class="zf-label">صورة المنتج الرئيسية</label>' +
        '<div class="zf-main-img">' +
          (mainImg ? '<div class="zf-img-preview large"><img src="' + esc(mainImg) + '" alt=""></div>' : '') +
          '<label class="zf-btn-soft">اختيار ملف<input type="file" accept="image/*" hidden id="pfMainImg"></label>' +
          '<span class="zf-file-hint">' + (mainImg ? '✓ صورة محددة' : 'لم يتم تحديد أي ملف') + '</span>' +
        '</div>' +
        '<label class="zf-url-label">أو الصق رابط صورة:</label>' +
        '<input id="pfMainImgUrl" class="zf-input" type="url" placeholder="https://..." value="' + esc(f.image_url || '') + '">' +
      '</div>' +
      '<div class="zf-section-title">الألوان والمقاسات وعدد القطع</div>' +
      colRows +
      '<button type="button" class="zf-add-color" data-act="addcol">+ إضافة لون</button>' +
      '<label class="zf-pub-toggle"><input type="checkbox" id="pfPub"' + (f.is_published ? ' checked' : '') + '> ظاهر في المتجر</label>' +
      '<div class="zf-actions">' +
        '<button type="button" class="zf-btn-ghost" data-act="cancel">إلغاء</button>' +
        '<button type="button" class="zf-btn-primary" id="pfSave" data-act="save">حفظ المنتج</button>' +
      '</div>';
  }

  /* ═══════════════════════════════════════════════════════════
     🖼️ رفع الصور
     ═══════════════════════════════════════════════════════════ */

  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('تعذر قراءة الصورة')); };
      img.src = url;
    });
  }

  function toBlob(img, max, quality) {
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * r);
    cv.height = Math.round(img.height * r);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return new Promise(res => cv.toBlob(b => res(b), 'image/jpeg', quality));
  }

  async function uploadImage(file) {
    const img = await loadImage(file);
    const big = await toBlob(img, 1200, 0.85);
    const small = await toBlob(img, 420, 0.8);
    const base = 'p/' + U.uid();
    const bucket = sb.storage.from(C.BUCKET_NAME);

    const up1 = await bucket.upload(base + '.jpg', big, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (up1.error) throw up1.error;
    const up2 = await bucket.upload(base + '_t.jpg', small, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (up2.error) throw up2.error;

    return {
      image_url: bucket.getPublicUrl(base + '.jpg').data.publicUrl,
      thumb_url: bucket.getPublicUrl(base + '_t.jpg').data.publicUrl
    };
  }

  async function onPickImage(input, apply) {
    const file = input.files && input.files[0];
    if (!file) return;
    syncFormFromDom();
    notify('جاري رفع الصورة...');
    try {
      const u = await uploadImage(file);
      apply(u);
      renderProductForm();
      notify('تم رفع الصورة ✓', 'success');
    } catch (e) {
      fail(e, 'فشل رفع الصورة');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     💾 حفظ المنتج
     ═══════════════════════════════════════════════════════════ */

  async function saveProduct() {
    if (S.busy) return;
    syncFormFromDom();
    const f = S.form;
    const name = f.name.trim();
    const price = Number(f.price);

    if (!name) return notify('اكتب اسم المنتج', 'error');
    if (!(price >= 0) || f.price === '') return notify('اكتب السعر', 'error');

    const cols = f.colors.filter(c => c.name.trim());
    const names = cols.map(c => c.name.trim());
    if (new Set(names).size !== names.length) return notify('اسم اللون مكرر', 'error');

    S.busy = true;
    const btn = $('pfSave');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'جاري الحفظ...';
    }

    try {
      const firstImg = cols.find(c => c.image_url);
      const row = {
        name: name,
        category_id: f.category_id || null,
        price: price,
        old_price: f.old_price === '' ? null : Number(f.old_price),
        description: f.description.trim() || null,
        is_published: f.is_published,
        image_url: f.image_url || (firstImg && firstImg.image_url) || null,
        thumb_url: f.thumb_url || (firstImg && firstImg.thumb_url) || null
      };

      const codeVal = f.code ? f.code.trim() : '';
      if (codeVal) row.code = codeVal;

      let pid = f.id;
      if (pid) {
        const { error } = await sb.from('products').update(row).eq('id', pid);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('products').insert(row).select('id').single();
        if (error) throw error;
        pid = data.id;
      }

      const existing = S.products.find(p => p.id === pid);
      const oldIds = ((existing && existing.product_colors) || []).map(c => c.id);
      const keepIds = cols.filter(c => c.id).map(c => c.id);
      const removeIds = oldIds.filter(i => !keepIds.includes(i));

      if (removeIds.length) {
        let r = await sb.from('product_stock').delete().in('color_id', removeIds);
        if (r.error) throw r.error;
        r = await sb.from('product_colors').delete().in('id', removeIds);
        if (r.error) throw r.error;
      }

      const colId = {};
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const payload = {
          product_id: pid,
          name: c.name.trim(),
          gender: c.gender || null,
          image_url: c.image_url || null,
          thumb_url: c.thumb_url || null,
          position: i
        };
        if (c.id) {
          const { error } = await sb.from('product_colors').update(payload).eq('id', c.id);
          if (error) throw error;
          colId[c.key] = c.id;
        } else {
          const { data, error } = await sb.from('product_colors').insert(payload).select('id').single();
          if (error) throw error;
          colId[c.key] = data.id;
        }
      }

      const allColorIds = Object.values(colId);
      if (allColorIds.length) {
        const d = await sb.from('product_stock').delete().in('color_id', allColorIds);
        if (d.error) throw d.error;
      }

      const stockRows = [];
      cols.forEach(c => {
        const oldKey = (c.id || c.key);
        f.sizes.forEach(z => {
          const q = Math.max(0, parseInt(f.stock[oldKey + '|' + z], 10) || 0);
          stockRows.push({ color_id: colId[c.key], size: z, qty: q });
        });
      });

      if (stockRows.length) {
        const { error } = await sb.from('product_stock').insert(stockRows);
        if (error) throw error;
      }

      const costVal = (f.cost === '' || f.cost == null) ? null : Number(f.cost);
      if (costVal != null && !isNaN(costVal)) {
        const { error: costErr } = await sb.from('product_costs').upsert(
          { product_id: pid, cost: costVal },
          { onConflict: 'product_id' }
        );
        if (costErr) throw costErr;
      } else {
        await sb.from('product_costs').delete().eq('product_id', pid);
      }

      notify('تم حفظ المنتج ✓', 'success');
      closeProductForm();
      await loadProducts();
      renderStats();
      renderProducts();
    } catch (e) {
      fail(e, 'فشل الحفظ');
      const b = $('pfSave');
      if (b) {
        b.disabled = false;
        b.textContent = 'حفظ المنتج';
      }
    } finally {
      S.busy = false;
    }
  }

  async function deleteProduct(id) {
    const p = S.products.find(x => x.id === id);
    if (!p || !confirm('حذف «' + p.name + '» من المتجر؟')) return;
    try {
      const { error } = await sb.rpc('admin_delete_product', { p_product_id: id });
      if (error) throw error;
      notify('تم الحذف ✓', 'success');
      await loadProducts();
      renderStats();
      renderProducts();
    } catch (e) {
      fail(e, 'فشل الحذف');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     📥 الطلبات
     ═══════════════════════════════════════════════════════════ */

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'الآن';
    if (mins < 60) return 'قبل ' + mins + ' دقيقة';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return 'قبل ' + hours + ' ساعة';
    const days = Math.floor(hours / 24);
    if (days < 30) return 'قبل ' + days + ' يوم';
    return d.toLocaleDateString('ar-EG');
  }

  function statusLabel(s) {
    if (s === 'new') return 'جديدة';
    if (s === 'confirmed') return 'مؤكدة';
    if (s === 'cancelled') return 'ملغاة';
    return s || 'غير معروف';
  }

  function renderOrders() {
    const box = $('ordersList');
    if (!box) return;
    const filter = S.orderFilter || 'new';
    const delBtn = $('deleteTestBtn');
    if (delBtn) {
    const testCount = S.orders.filter(o => o.is_test).length;
    delBtn.style.display = testCount > 0 ? '' : 'none';
  }
    let list;
  if (filter === 'all') list = S.orders;
  else if (filter === 'test') list = S.orders.filter(o => o.is_test);
  else list = S.orders.filter(o => o.status === filter && !o.is_test);

    if (!list.length) {
      const msg = filter === 'new' ? 'لا توجد طلبات جديدة حاليًا' :
                  filter === 'confirmed' ? 'لا توجد طلبات مؤكدة' :
                  filter === 'cancelled' ? 'لا توجد طلبات ملغاة' : 'لا توجد طلبات';
      box.innerHTML = '<div class="empty-state"><strong>' + msg + '</strong>ستظهر هنا طلبات الزبائن الجديدة تلقائيًا</div>';
      return;
    }

    box.innerHTML = list.map(o => {
      const itemsCount = Array.isArray(o.items) ? o.items.reduce((a, x) => a + (Number(x.qty) || 0), 0) : 0;
      const firstItem = Array.isArray(o.items) && o.items[0] ? o.items[0].product_name : '';
      const customerDisplay = o.name
        ? esc(o.name) + (o.phone ? ' · ' + esc(o.phone) : '')
        : (o.phone ? esc(o.phone) : '<span class="no-phone">لا يوجد اسم ولا رقم</span>');
      const cur = C.CURRENCY;

      const meta = o.meta && typeof o.meta === 'object' ? o.meta : {};
      const srcHtml = meta.utm_source
        ? '<span class="order-card-source">📊 ' + esc(meta.utm_source) +
          (meta.utm_campaign ? ' · ' + esc(meta.utm_campaign) : '') + '</span>'
        : '';

      return '<div class="order-card status-' + esc(o.status || 'new') + '" data-order-id="' + esc(o.id) + '">' +
        '<div class="order-status-dot"></div>' +
        '<div class="order-card-body">' +
          '<div class="order-card-ref">' + esc(o.ref || '') + '</div>' +
          '<div class="order-card-customer">' + customerDisplay + '</div>' +
          '<div class="order-card-meta">' +
            (o.region ? '<span>📍 ' + esc(o.region) + '</span>' : '') +
            '<span>📦 ' + itemsCount + ' قطعة</span>' +
            (firstItem ? '<span>🧸 ' + esc(firstItem) + (itemsCount > 1 ? ' + ' + (itemsCount - 1) : '') + '</span>' : '') +
            srcHtml + opChip(o) +
          '</div>' +
        '</div>' +
        '<div class="order-card-right">' +
          '<div class="order-card-total">' + esc(cur) + U.fmt(o.total) + '</div>' +
          '<div class="order-card-badge ' + esc(o.status || 'new') + '">' + statusLabel(o.status) + '</div>' +
          '<div class="order-card-time">' + timeAgo(o.created_at) + '</div>' +
        '</div>' +
        (o.status === 'new' && !o.is_test
? '<button type="button" class="mark-test-btn" data-marktest="' + esc(o.id) + '" title="تمييز كتجريبي">🧪 ضع صح = تجريبي</button>'
        : '') +
      '</div>';
    }).join('');
  }

  function openOrderForm(id) {
    const o = S.orders.find(x => x.id === id);
    if (!o) return;
    S.orderEditing = o;
    renderOrderDetail();
    const modal = $('orderModal');
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeOrderForm() {
    const modal = $('orderModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    S.orderEditing = null;
  }

  function zoneLabelOf(meta) {
    const m = meta || {};
    if (m.zone_name) return m.zone_name;
    const z = getZones().find(x => (x.id || x.name) === m.zone);
    if (z && z.name) return z.name;
    return m.zone === 'zone_legacy' ? 'مناطق التوصيل' : (m.zone || '');
  }

  function fieldValue(o, field) {
    if (field.indexOf('meta:') === 0) return ((o.meta && typeof o.meta === 'object') ? o.meta : {})[field.slice(5)] || '';
    return o[field] || '';
  }

  /* مؤشر جودة بيانات المطابقة مع ميتا */
  function metaQualityHtml(o) {
    const parts = String(o.name || '').trim().split(/\s+/).filter(Boolean);
    const checks = [
      ['الإيميل', !!o.customer_email],
      ['الجوال', U.digits(o.phone).length >= 9],
      ['الاسم الأول', parts.length >= 1],
      ['اسم العائلة', parts.length >= 2],
      ['المدينة', !!o.region],
      ['fbp', !!o.fbp],
      ['fbc (من إعلان)', !!o.fbc]
    ];
    const done = checks.filter(c => c[1]).length;
    return '<div class="mq-box">' +
      '<div class="mq-title">🎯 بيانات مطابقة Meta <b>' + done + '/' + checks.length + '</b></div>' +
      '<div class="mq-chips">' + checks.map(c =>
        '<span class="mq ' + (c[1] ? 'ok' : 'no') + '">' + (c[1] ? '✓ ' : '✕ ') + c[0] + '</span>').join('') + '</div>' +
      '<div class="mq-hint">كلما اكتملت البيانات زادت دقة ربط المبيعات بالإعلانات. fbc يظهر فقط للزبون القادم من إعلان.</div>' +
    '</div>';
  }

  function cityOptions() {
    const set = new Set();
    getZones().forEach(z => (z.cities || []).forEach(c => { if (c && c.name) set.add(c.name); }));
    Object.keys(C.CITY_PRESETS || {}).forEach(k => (C.CITY_PRESETS[k] || []).forEach(n => set.add(n)));
    return Array.from(set);
  }

  function customerRow(label, value, field, disabled) {
    const isEmpty = !value;
    const display = isEmpty
      ? '<span class="val empty">غير محدد</span>'
      : '<span class="val">' + esc(value) + '</span>';
    const editBtn = disabled ? '' : '<button type="button" class="edit-btn" data-edit-field="' + field + '">✏️ تعديل</button>';
    return '<div class="order-customer-row" data-row-field="' + field + '">' +
      '<span class="lbl">' + label + ':</span>' + display + editBtn +
    '</div>';
  }

  function renderOrderDetail() {
    const o = S.orderEditing;
    if (!o) return;
    const cur = C.CURRENCY;
    const items = Array.isArray(o.items) ? o.items : [];
    const meta = o.meta && typeof o.meta === 'object' ? o.meta : {};
    const itemsHtml = items.length
      ? items.map(it => {
          const img = it.image || '';
          return '<div class="order-item">' +
            (img ? '<img class="order-item-img" src="' + esc(img) + '" alt="">' : '<div class="order-item-noimg">🧸</div>') +
            '<div class="order-item-info">' +
              '<div class="order-item-name">' + esc(it.product_name || '') + (it.product_code ? ' · رقم ' + esc(it.product_code) : '') + '</div>' +
              '<div class="order-item-meta">' +
                (it.size ? 'المقاس: ' + esc(it.size) : '') +
                (it.size && it.color_name ? ' · ' : '') +
                (it.color_name ? 'اللون: ' + esc(it.color_name) : '') +
              '</div>' +
              '<div class="order-item-bottom">' +
                '<div class="order-item-qty">الكمية: ' + (it.qty || 0) + ' × ' + esc(cur) + U.fmt(it.unit_price) + '</div>' +
                '<div class="order-item-price">' + esc(cur) + U.fmt((Number(it.unit_price) || 0) * (Number(it.qty) || 0)) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<p class="muted">لا توجد أصناف</p>';

    const itemsTotal = items.reduce((a, x) => a + ((Number(x.unit_price) || 0) * (Number(x.qty) || 0)), 0);
    const deliveryPrice = Number(meta.delivery_price) || 0;
    const grandTotal = Number(o.total) || 0;

    const itemsCost = items.reduce((a, x) => {
      const p = S.products.find(pp => pp.id === x.product_id);
      const unitCost = p ? (costOf(p) || 0) : 0;
      return a + (unitCost * (Number(x.qty) || 0));
    }, 0);
    const grossProfit = itemsTotal - itemsCost;

    const customerHtml =
      '<div class="order-customer-info">' +
        customerRow('الاسم', o.name, 'name') +
        customerRow('الجوال', o.phone, 'phone') +
        customerRow('الإيميل', o.customer_email, 'customer_email') +
        customerRow('المدينة / المنطقة', o.region, 'region') +
        customerRow('المحافظة', meta.state, 'meta:state') +
        customerRow('الرمز البريدي', meta.zip, 'meta:zip') +
      '</div>' + metaQualityHtml(o);
    const sale = saleByRef(o.ref);
    const ops = sale ? opsOfSale(sale.id) : [];
    const liveOps = ops.filter(r => !r.voided);
    const opsHtml = ops.length
      ? '<div class="order-detail-section">' +
          '<div class="order-detail-heading">🧾 سجل الإرجاع والاستبدال (' + liveOps.length + ')</div>' +
          '<div class="returns-list">' + ops.map(r => opCardHtml(r, false)).join('') + '</div>' +
        '</div>'
      : '';
    let netHtml = '';
    if (sale && liveOps.length) {
      const sn = saleNet(sale);
      netHtml =
        '<div class="order-detail-section">' +
          '<div class="order-detail-heading">📈 الصافي بعد الإرجاع والاستبدال</div>' +
          '<div class="order-summary">' +
            '<div class="order-summary-row"><span>إيراد المنتجات الصافي</span><span>' + esc(cur) + U.fmt(sn.rev) + '</span></div>' +
            '<div class="order-summary-row"><span>تكلفة المنتجات الصافية</span><span style="color:#c8102e">-' + esc(cur) + U.fmt(sn.cost) + '</span></div>' +
            '<div class="order-summary-row total" style="color:' + (sn.profit >= 0 ? '#157a3d' : '#c8102e') + '"><span>الربح الصافي</span><span>' + esc(cur) + U.fmt(sn.profit) + '</span></div>' +
            '<div class="order-summary-row"><span>المحصّل الصافي من الزبون</span><span>' + esc(cur) + U.fmt(sn.collected) + '</span></div>' +
          '</div>' +
        '</div>';
    }

    const sourceHtml = (meta.utm_source || meta.utm_campaign || meta.referrer || meta.device_type) ?
      '<div class="order-detail-section">' +
        '<div class="order-detail-heading">📊 مصدر الطلب</div>' +
        '<div class="order-source-info">' +
          (meta.zone ? '<div class="src-row"><span class="src-lbl">🚚 منطقة التوصيل:</span><b>' + esc(zoneLabelOf(meta)) + '</b></div>' : '') +
          (meta.city ? '<div class="src-row"><span class="src-lbl">🏙️ المدينة:</span>' + esc(meta.city) + '</div>' : '') +
          (meta.utm_source ? '<div class="src-row"><span class="src-lbl">🎯 المصدر:</span><b>' + esc(meta.utm_source) + '</b></div>' : '') +
          (meta.utm_medium ? '<div class="src-row"><span class="src-lbl">📌 الوسيط:</span>' + esc(meta.utm_medium) + '</div>' : '') +
          (meta.utm_campaign ? '<div class="src-row"><span class="src-lbl">📣 الحملة:</span><b>' + esc(meta.utm_campaign) + '</b></div>' : '') +
          (meta.utm_content ? '<div class="src-row"><span class="src-lbl">🎨 المحتوى:</span>' + esc(meta.utm_content) + '</div>' : '') +
          (meta.utm_term ? '<div class="src-row"><span class="src-lbl">🔑 الكلمة:</span>' + esc(meta.utm_term) + '</div>' : '') +
          (meta.device_type ? '<div class="src-row"><span class="src-lbl">📱 الجهاز:</span>' + esc(meta.device_type) + ' · ' + esc(meta.device_os || '') + '</div>' : '') +
          (meta.referrer ? '<div class="src-row"><span class="src-lbl">🔗 المرجع:</span>' + esc(String(meta.referrer).slice(0, 60)) + '</div>' : '') +
          (meta.landing_url ? '<div class="src-row"><span class="src-lbl">🌐 الهبوط:</span>' + esc(String(meta.landing_url).slice(0, 60)) + '</div>' : '') +
        '</div>' +
      '</div>' : '';

    const isPending = o.status === 'new';
    const isConfirmed = o.status === 'confirmed';
    const isCancelled = o.status === 'cancelled';

    let actionsHtml = '';
    if (isPending) {
      actionsHtml =
        '<button type="button" class="order-btn-confirm" data-oact="confirm">✅ تأكيد الطلب</button>' +
        '<button type="button" class="order-btn-cancel" data-oact="cancel">❌ إلغاء الطلب</button>' +
        (o.phone ? '<a class="order-btn-wa" href="' + U.waLink(o.phone, 'مرحباً، بخصوص طلبك رقم ' + (o.ref || '')) + '" target="_blank" rel="noopener">💬 تواصل مع الزبون</a>' : '');
 } else if (isConfirmed) {
      const rc = liveOps.filter(r => r.kind === 'return').length;
      const ec = liveOps.filter(r => r.kind === 'exchange').length;
      let noteText = '✅ تم تأكيد هذا الطلب وخُصم من المخزون';
      const parts = [];
      if (rc) parts.push('↩️ ' + rc + ' إرجاع');
      if (ec) parts.push('🔄 ' + ec + ' استبدال');
      if (parts.length) noteText += ' · ' + parts.join(' · ');
      const waBtn = o.phone ? '<a class="order-btn-wa" href="' + U.waLink(o.phone, 'مرحباً، بخصوص طلبك رقم ' + (o.ref || '')) + '" target="_blank" rel="noopener">💬 تواصل مع الزبون</a>' : '';
      actionsHtml = '<div class="order-completed-note">' + noteText + '</div>' +
        (!sale
          ? '<div class="order-completed-note" style="background:#fde8eb;color:#c8102e">⚠️ لا توجد فاتورة مسجّلة لهذا الطلب — لا يمكن الإرجاع أو الاستبدال</div>'
          : sale.status === 'returned'
            ? '<div class="order-completed-note">↩️ أُرجعت هذه الفاتورة بالكامل</div>'
            : '<button type="button" class="order-btn-return" data-oact="return">↩️ إرجاع</button>' +
              '<button type="button" class="order-btn-exchange" data-oact="exchange">🔄 استبدال</button>') +
              (liveOps.length === 0
        ? '<button type="button" class="order-btn-undo" data-oact="undo">↩️ إلغاء التأكيد</button>'
        : '') +
        waBtn;
    } else if (isCancelled) {
      actionsHtml =
        '<div class="order-completed-note" style="background:#fde8eb;color:#c8102e">❌ هذا الطلب ملغى</div>' +
        '<button type="button" class="order-btn-confirm" data-oact="reopen" style="grid-column:1/-1">🔄 إعادة فتح الطلب</button>';
    }

    const metaHtml = (o.fbp || o.fbc || o.ua || o.source_url || meta.event_id) ?
      '<div class="order-detail-section">' +
        '<div class="order-detail-heading">📊 بيانات Meta</div>' +
        '<div class="order-meta-info">' +
          (meta.event_id ? '<div class="meta-row"><span class="meta-lbl">event_id:</span><span class="meta-val">' + esc(meta.event_id) + '</span></div>' : '') +
          (o.fbp ? '<div class="meta-row"><span class="meta-lbl">fbp:</span><span class="meta-val">' + esc(o.fbp) + '</span></div>' : '') +
          (o.fbc ? '<div class="meta-row"><span class="meta-lbl">fbc:</span><span class="meta-val">' + esc(o.fbc) + '</span></div>' : '') +
          (meta.vid ? '<div class="meta-row"><span class="meta-lbl">vid:</span><span class="meta-val">' + esc(meta.vid) + '</span></div>' : '') +
        '</div>' +
      '</div>' : '';

   const testBadge = o.is_test
  ? '<div class="order-test-badge">🧪 تجريبي</div>'
  : '';

    
     $('orderModalTitle').textContent = 'تفاصيل الطلب';
    $('orderModalBody').innerHTML =
      testBadge +
      '<div class="order-detail-head">' +
        '<div>' +
          '<div class="order-detail-ref">' + esc(o.ref || '') + '</div>' +
          '<div class="order-detail-time">' + new Date(o.created_at).toLocaleString('ar-EG') + ' · ' + timeAgo(o.created_at) + '</div>' +
        '</div>' +
        '<div class="order-card-badge ' + esc(o.status || 'new') + '">' + statusLabel(o.status) + '</div>' +
      '</div>' +
      '<div class="order-detail-section">' +
        '<div class="order-detail-heading">👤 بيانات الزبون</div>' +
        customerHtml +
      '</div>' +
      '<div class="order-detail-section">' +
        '<div class="order-detail-heading">📦 المنتجات</div>' +
        '<div class="order-items">' + itemsHtml + '</div>' +
      '</div>' +
      sourceHtml +
      opsHtml +
      '<div class="order-detail-section">' +
        '<div class="order-detail-heading">💰 الحساب</div>' +
        '<div class="order-summary">' +
          '<div class="order-summary-row"><span>المجموع الفرعي</span><span>' + esc(cur) + U.fmt(itemsTotal) + '</span></div>' +
          '<div class="order-summary-row"><span>التوصيل' + (o.region ? ' (' + esc(o.region) + ')' : '') + '</span><span>' + (deliveryPrice > 0 ? esc(cur) + U.fmt(deliveryPrice) : '—') + '</span></div>' +
          '<div class="order-summary-row total"><span>الإجمالي</span><span>' + esc(cur) + U.fmt(grandTotal) + '</span></div>' +
        '</div>' +
      '</div>' +
      (itemsCost > 0 ?
      '<div class="order-detail-section">' +
        '<div class="order-detail-heading">📈 الأرباح</div>' +
        '<div class="order-summary">' +
          '<div class="order-summary-row"><span>تكلفة المنتجات</span><span style="color:#c8102e">-' + esc(cur) + U.fmt(itemsCost) + '</span></div>' +
          '<div class="order-summary-row total" style="color:#157a3d"><span>ربح المنتجات</span><span>' + esc(cur) + U.fmt(grossProfit) + '</span></div>' +
        '</div>' +
      '</div>' : '') +
      netHtml +
      metaHtml +
      '<div class="order-actions">' + actionsHtml + '</div>';

    const body = $('orderModalBody');
    body.querySelectorAll('[data-edit-field]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        editOrderField(btn.dataset.editField);
      });
    });
    body.querySelectorAll('[data-oact]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.oact;
        if (act === 'confirm') confirmOrder();
        else if (act === 'cancel') cancelOrder();
        else if (act === 'reopen') reopenOrder();
        else if (act === 'return') openReturnForm(o.ref || o.id);
        else if (act === 'exchange') openExchangeForm(o.ref || o.id);
        else if (act === 'undo') undoConfirmOrder();
      });
    });
  }

  function editOrderField(field) {
    const o = S.orderEditing;
    if (!o) return;
    const row = $('orderModalBody').querySelector('[data-row-field="' + field + '"]');
    if (!row) return;
    const current = fieldValue(o, field);
    const LABELS = { name: 'الاسم', phone: 'الجوال', customer_email: 'الإيميل', region: 'المدينة / المنطقة', 'meta:state': 'المحافظة', 'meta:zip': 'الرمز البريدي' };
    const label = LABELS[field] || field;
    const inputType = field === 'phone' ? 'tel' : (field === 'customer_email' ? 'email' : 'text');
    const listAttr = field === 'region' ? ' list="mkCityList" autocomplete="off"' : '';
    const listHtml = field === 'region'
      ? '<datalist id="mkCityList">' + cityOptions().map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>'
      : '';
    row.innerHTML =
      '<span class="lbl">' + label + ':</span>' +
      '<div class="order-customer-edit">' +
        '<input type="' + inputType + '"' + listAttr + ' id="editField_' + field + '" value="' + esc(current) + '">' + listHtml +
        '<button type="button" class="save-btn" data-save-field="' + field + '">حفظ</button>' +
        '<button type="button" class="cancel-btn" data-cancel-edit>إلغاء</button>' +
      '</div>';
    const inp = $('editField_' + field);
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); saveOrderField(field); }
        if (e.key === 'Escape') { e.preventDefault(); renderOrderDetail(); }
      });
    }
    const sbBtn = row.querySelector('[data-save-field]');
    if (sbBtn) sbBtn.addEventListener('click', e => { e.preventDefault(); saveOrderField(field); });
    const cbBtn = row.querySelector('[data-cancel-edit]');
    if (cbBtn) cbBtn.addEventListener('click', e => { e.preventDefault(); renderOrderDetail(); });
  }

  async function saveOrderField(field) {
    const o = S.orderEditing;
    if (!o) return;
    const inp = $('editField_' + field);
    if (!inp) return;
    let value = inp.value.trim();
    if (field === 'phone') value = value.replace(/\D/g, '');
    if (field === 'customer_email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return notify('الإيميل غير صحيح', 'error');
    }
    const baseMeta = (o.meta && typeof o.meta === 'object') ? o.meta : {};
    const upd = {};
    if (field.indexOf('meta:') === 0) {
      const m = Object.assign({}, baseMeta);
      if (value) m[field.slice(5)] = value; else delete m[field.slice(5)];
      upd.meta = m;
    } else {
      upd[field] = value || null;
      if (field === 'region') {
        const m = Object.assign({}, baseMeta);
        if (value) m.city = value; else delete m.city;
        upd.meta = m;
      }
    }
    try {
      const { error } = await sb.from('leads').update(upd).eq('id', o.id);
      if (error) throw error;
      Object.assign(o, upd);
      const idx = S.orders.findIndex(x => x.id === o.id);
      if (idx >= 0) Object.assign(S.orders[idx], upd);
      notify('تم الحفظ ✓', 'success');
      renderOrderDetail();
      renderOrders();
    } catch (e) {
      fail(e, 'فشل التحديث');
    }
  }

  async function confirmOrder() {
    const o = S.orderEditing;
    if (!o) return;
    if (o.status === 'confirmed') return notify('الطلب مؤكد مسبقًا', 'error');
    if (o.status === 'cancelled') return notify('الطلب ملغى', 'error');
    if (!o.phone) {
      if (!confirm('لا يوجد رقم جوال. هل تريد تأكيد الطلب مع ذلك؟')) return;
    }
    const isTest = o.is_test === true;
    const confirmMsg = isTest
      ? 'تأكيد الطلب التجريبي؟\n\nسيتم:\n🧪 تسجيل فاتورة اختبارية\n🧪 إرسال Purchase اختباري لـ Meta (في Test Events)\n\n❌ لن يُخصم من المخزون\n❌ لن يُضاف الزبون للإحصائيات\n❌ لن يُحسب في المبيعات'
      : 'تأكيد الطلب؟\n\nسيتم:\n✓ خصم الكميات من المخزون\n✓ تسجيل البيعة\n✓ إضافة الزبون\n✓ إرسال Purchase لـ Meta';
    if (!confirm(confirmMsg)) return;

    const body = $('orderModalBody');
    const btn = body.querySelector('[data-oact="confirm"]');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري التأكيد...'; }

    try {
      const items = Array.isArray(o.items) ? o.items : [];

      /* تكلفة كل منتج (للأرباح) — تُحسب هنا لأن المدير موثَّق، والتأكيد كله يتم ذرّياً في قاعدة البيانات */
      const costs = {};
      items.forEach(it => {
        const product = S.products.find(p => String(p.id) === String(it.product_id));
        const c = product ? costOf(product) : null;
        if (c != null && !isNaN(c)) costs[String(it.product_id)] = c;
      });

      /* 1. تأكيد ذرّي: مخزون + زبون + فاتورة + أصناف + حالة الطلب (كلها أو لا شيء) */
      const { data: conf, error: confErr } = await sb.rpc('confirm_order', { p_lead_id: o.id, p_costs: costs });
      if (confErr) throw confErr;
      if (!conf || !conf.ok || !conf.sale_id) throw new Error('فشل تأكيد الطلب');
      const saleId = conf.sale_id;

      /* 2. Purchase لـ Meta — الدالة تقرأ كل القيم من قاعدة البيانات وتمنع التكرار بـ event_id ثابت */
      let metaMsg = '';
      if (conf.already) {
        metaMsg = ' (كان مؤكدًا مسبقًا)';
      } else {
        try {
          const { data: mr, error: me } = await sb.functions.invoke(C.META_ADMIN_FN, {
            body: {
              action: 'purchase',
              sale_id: saleId,
              customer: {
                city: o.region || '',
                state: (o.meta && o.meta.state) || '',
                zip: (o.meta && o.meta.zip) || '',
                country: C.DEFAULT_COUNTRY || 'ps'
              }
            }
          });
          if (me || !mr || !mr.ok) {
            console.warn('Meta purchase failed:', me || mr);
            metaMsg = ' (تعذر إرسال Purchase لميتا — راجع سجل CAPI)';
          } else if (mr.skipped === 'test') {
            metaMsg = ' · طلب تجريبي: لم يُرسل لميتا';
          } else if (mr.already_sent) {
            metaMsg = ' · Purchase مُرسل سابقًا';
          } else {
            metaMsg = ' · أُرسل Purchase لميتا';
          }
        } catch (e) {
          console.warn('Meta purchase exception:', e);
          metaMsg = ' (تعذر إرسال Purchase لميتا)';
        }
      }

const stockMsg = o.is_test
        ? 'تم تأكيد الطلب التجريبي ✓ (لم يُخصم من المخزون)'
        : 'تم تأكيد الطلب ✓ وخُصم من المخزون';
      notify(stockMsg + metaMsg, 'success');
      o.status = 'confirmed';
      const idx = S.orders.findIndex(x => x.id === o.id);
      if (idx >= 0) S.orders[idx].status = 'confirmed';
      updateOrdersBadge();
      renderOrders();
      closeOrderForm();
      await loadProducts();
      await loadSales();
      renderStats();
      renderProducts();
    } catch (e) {
      fail(e, 'فشل تأكيد الطلب');
      const b = $('orderModalBody') && $('orderModalBody').querySelector('[data-oact="confirm"]');
      if (b) { b.disabled = false; b.textContent = '✅ تأكيد الطلب'; }
    }
  }

  async function cancelOrder() {
    const o = S.orderEditing;
    if (!o) return;
    if (!confirm('إلغاء الطلب؟')) return;
    try {
      const { error } = await sb.from('leads').update({ status: 'cancelled' }).eq('id', o.id);
      if (error) throw error;
      o.status = 'cancelled';
      const idx = S.orders.findIndex(x => x.id === o.id);
      if (idx >= 0) S.orders[idx].status = 'cancelled';
      notify('تم إلغاء الطلب ✓', 'success');
      updateOrdersBadge();
      renderOrders();
      closeOrderForm();
    } catch (e) {
      fail(e, 'فشل الإلغاء');
    }
  }
  async function undoConfirmOrder() {
    const o = S.orderEditing;
    if (!o) return;
    if (o.status !== 'confirmed') return notify('الطلب ليس مؤكداً', 'error');

    const confirmMsg = 'إلغاء تأكيد الطلب؟\n\n' +
      '✓ سيُعاد المخزون\n' +
      '✓ ستعود حالة الطلب إلى "جديدة"\n' +
      '✓ ستُعلَّم الفاتورة كملغاة\n\n' +
      '⚠️ Purchase في Meta لا يمكن إلغاؤه';

    if (!confirm(confirmMsg)) return;

    const body = $('orderModalBody');
    const btn = body.querySelector('[data-oact="undo"]');
    if (btn) { btn.disabled = true; btn.textContent = 'جاري الإلغاء...'; }

    try {
      const { data, error } = await sb.rpc('admin_undo_confirm', { p_lead_id: o.id });
      if (error) throw error;
      if (!data || !data.ok) throw new Error('فشل إلغاء التأكيد');

      notify('تم إلغاء التأكيد ✓ وعاد المخزون', 'success');
      o.status = 'new';
      const idx = S.orders.findIndex(x => x.id === o.id);
      if (idx >= 0) S.orders[idx].status = 'new';
      updateOrdersBadge();
      renderOrders();
      closeOrderForm();
      await loadProducts();
      await loadSales();
      renderStats();
      renderProducts();
    } catch (e) {
      fail(e, 'فشل إلغاء التأكيد');
      if (btn) { btn.disabled = false; btn.textContent = '↩️ إلغاء التأكيد'; }
    }
  }

  async function reopenOrder() {
    const o = S.orderEditing;
    if (!o) return;
    if (!confirm('إعادة فتح الطلب كطلب جديد؟')) return;
    try {
      const { error } = await sb.from('leads').update({ status: 'new' }).eq('id', o.id);
      if (error) throw error;
      o.status = 'new';
      const idx = S.orders.findIndex(x => x.id === o.id);
      if (idx >= 0) S.orders[idx].status = 'new';
      notify('تم إعادة فتح الطلب ✓', 'success');
      updateOrdersBadge();
      renderOrders();
      closeOrderForm();
    } catch (e) {
      fail(e, 'فشل إعادة الفتح');
    }
  }

/* ═══════════════════════════════════════════════════════════
   🧾 الإرجاع والاستبدال — نظام محاسبي موحّد
   كل عملية تُسجَّل في sale_returns عبر admin_process_return
   (قفل الفاتورة + تحقق من الكميات + إعادة حساب الصافي في Supabase).
   المنتجات لا تدخل إلا من «إضافة منتج»؛ هنا نتحرك على المخزون الموجود فقط.
   ═══════════════════════════════════════════════════════════ */

const RETURN_DAYS = C.RETURN_DAYS;

const OP_ERRORS = {
  not_admin: 'ليس لديك صلاحية',
  sale_not_found: 'الفاتورة غير موجودة',
  sale_closed: 'الفاتورة مغلقة (مرتجعة بالكامل أو ملغاة)',
  nothing_returned: 'اختر قطعة واحدة على الأقل',
  exchange_needs_items: 'اختر المنتج البديل',
  return_has_given: 'الإرجاع لا يحتوي منتجاً بديلاً',
  bad_amount: 'المبلغ غير صحيح',
  bad_qty: 'كمية غير صحيحة',
  refund_exceeds_paid: 'المبلغ المسترد أكبر مما دفعه الزبون',
  qty_exceeds_available: 'الكمية أكبر من المتبقي عند الزبون',
  inconsistent_quantities: 'لا يمكن الإلغاء لأن عمليات لاحقة تعتمد عليها — ألغِ اللاحقة أولاً',
  return_not_found: 'العملية غير موجودة',
  already_voided: 'العملية ملغاة مسبقاً'
};

function opErr(e) {
  const m = (e && e.message) ? String(e.message) : '';
  if (/sale_returns|returned_cost|status_before_return|updated_at/.test(m)) {
    return 'قاعدة البيانات تحتاج تحديث SQL أولاً (ملف 001_returns_exchanges.sql)';
  }
  for (const k in OP_ERRORS) if (m.indexOf(k) >= 0) return OP_ERRORS[k];
  return m || 'حدث خطأ';
}

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function saleById(id) { return S.sales.find(s => String(s.id) === String(id)) || null; }
function saleByRef(ref) { return ref ? (S.sales.find(s => s.ref === ref) || null) : null; }
function opsOfSale(id) { return S.ops.filter(r => String(r.sale_id) === String(id)); }
function saleClosed(s) { return !s || ['returned', 'cancelled'].includes(s.status); }
function productById(id) { return S.products.find(p => p.id === id) || null; }
function colorOfProduct(p, name) { return (p.product_colors || []).find(c => c.name === name) || null; }
function stockQty(p, color, size) {
  const c = colorOfProduct(p, color);
  if (!c) return 0;
  const s = (c.product_stock || []).find(x => x.size === size);
  return s ? Math.max(0, Number(s.qty) || 0) : 0;
}
function lineKey(l) { return (l.pid || '') + '|' + (l.color || '') + '|' + (l.size || ''); }
function lineMeta(l) { return [l.color, l.size].filter(Boolean).join(' · '); }

/* الصافي الحقيقي للفاتورة بعد كل المرتجعات والاستبدالات */
function saleNet(s) {
  const it = Number(s.items_total) || 0;
  const ic = Number(s.items_cost) || 0;
  const rt = Number(s.returned_total) || 0;
  const rc = Number(s.returned_cost) || 0;
  const hasOps = s.return_state && s.return_state !== 'none';
  let rev = hasOps ? it - rt : it;
  const cost = hasOps ? ic - rc : ic;
  let delivery = Number(s.delivery_price) || 0;
  if (rev < 0) { delivery = Math.max(0, delivery + rev); rev = 0; }
  const collected = s.net_total != null ? Number(s.net_total) : (Number(s.total) || 0);
  return { rev: r2(rev), cost: r2(cost), profit: r2(rev - cost), delivery: r2(delivery), collected: r2(collected) };
}

async function loadOps() {
  const { data, error } = await sb.from('sale_returns').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) {
    console.warn('sale_returns load failed:', error);
    S.ops = [];
    S.opsReady = false;
    return;
  }
  S.ops = data || [];
  S.opsReady = true;
}

function opChip(o) {
  const s = saleByRef(o.ref);
  if (!s || !s.return_state || s.return_state === 'none') return '';
  const t = s.return_state === 'returned' ? '↩️ مرتجعة' : s.return_state === 'exchanged' ? '🔄 فيها استبدال' : '↩️ مرتجع جزئي';
  return '<span>' + t + '</span>';
}

/* ─────────── قوائم الإرجاع والاستبدال ─────────── */

function opItemsText(arr) {
  return (Array.isArray(arr) ? arr : []).map(x =>
    esc(x.name || '') + (lineMeta(x) ? ' (' + esc(lineMeta(x)) + ')' : '') + ' ×' + (Number(x.qty) || 0)
  ).join('، ');
}

function opPending(r) {
  return !r.voided && !r.stock_applied && Array.isArray(r.stock_deltas) && r.stock_deltas.length > 0;
}

function opCardHtml(r, showSale) {
  const cur = C.CURRENCY;
  const sale = saleById(r.sale_id);
  const isEx = r.kind === 'exchange';
  const amt = Number(r.refund) > 0
    ? '<span class="op-neg">−' + esc(cur) + U.fmt(r.refund) + ' للزبون</span>'
    : Number(r.collect) > 0
      ? '<span class="op-pos">+' + esc(cur) + U.fmt(r.collect) + ' على الزبون</span>'
      : '<span class="muted">بدون فرق مالي</span>';
  return '<div class="return-row' + (isEx ? ' exchange' : '') + (r.voided ? ' voided' : '') + '" data-op-id="' + esc(r.id) + '">' +
    '<div class="return-row-head">' +
      '<span class="return-row-title">' + (isEx ? '🔄 استبدال' : '↩️ إرجاع') + (showSale && sale ? ' · ' + esc(sale.ref || '') : '') + '</span>' +
      '<span class="return-row-amount">' + amt + '</span>' +
    '</div>' +
    (showSale && sale && sale.customer_name ? '<div class="return-row-reason">👤 ' + esc(sale.customer_name) + '</div>' : '') +
    '<div class="return-row-reason">⬅️ راجع: ' + (opItemsText(r.returned) || '—') + '</div>' +
    (isEx ? '<div class="return-row-reason">➡️ بديل: ' + (opItemsText(r.given) || '—') + '</div>' : '') +
    (r.reason ? '<div class="return-row-reason">السبب: ' + esc(r.reason) + '</div>' : '') +
    '<div>' +
      (r.voided ? '<span class="op-badge void">ملغاة</span>' : '') +
      (opPending(r) ? '<span class="op-badge warn">⚠️ المخزون لم يُحدَّث</span>' : '') +
    '</div>' +
    '<div class="return-row-date">' + new Date(r.created_at).toLocaleString('ar-EG') + '</div>' +
  '</div>';
}

function renderOps() {
  const cur = C.CURRENCY;
  [['return', 'returnsList', 'returnsSummary', 'لا توجد مرتجعات بعد'],
   ['exchange', 'exchangesList', 'exchangesSummary', 'لا توجد استبدالات بعد']].forEach(a => {
    const box = $(a[1]), sum = $(a[2]);
    if (!box) return;
    if (!S.opsReady) {
      box.innerHTML = '<div class="empty-state"><strong>الجدول غير جاهز</strong>شغّل ملف 001_returns_exchanges.sql في Supabase أولاً</div>';
      if (sum) sum.innerHTML = '';
      return;
    }
    const all = S.ops.filter(r => r.kind === a[0]);
    const live = all.filter(r => !r.voided);
    const refund = live.reduce((t, r) => t + (Number(r.refund) || 0), 0);
    const collect = live.reduce((t, r) => t + (Number(r.collect) || 0), 0);
    if (sum) {
      sum.innerHTML =
        '<div class="ops-chip"><strong>' + live.length + '</strong>عملية</div>' +
        '<div class="ops-chip"><strong>' + esc(cur) + U.fmt(refund) + '</strong>مسترد للزبائن</div>' +
        '<div class="ops-chip"><strong>' + esc(cur) + U.fmt(collect) + '</strong>' + (a[0] === 'exchange' ? 'فروقات محصّلة' : 'محصّل') + '</div>';
    }
    box.innerHTML = all.length ? all.map(r => opCardHtml(r, true)).join('') : '<div class="empty-state"><strong>' + a[3] + '</strong>تبدأ العملية من «+» أو من تفاصيل الطلب المؤكد</div>';
  });
}

/* ─────────── اختيار الفاتورة ─────────── */

function openSalePicker(kind) {
  S.pick = { kind: kind, q: '' };
  $('salePickTitle').textContent = kind === 'return' ? '↩️ إرجاع جديد — اختر الفاتورة' : '🔄 استبدال جديد — اختر الفاتورة';
  $('salePickBody').innerHTML =
    '<div class="field"><input id="spQ" type="search" placeholder="🔍 رقم الطلب أو اسم الزبون أو الجوال" autocomplete="off"></div>' +
    '<div class="orders-list" id="spList"></div>';
  renderSalePickerList();
  $('salePickModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSalePick() {
  const m = $('salePickModal');
  if (m) m.classList.remove('open');
  document.body.style.overflow = '';
}

function renderSalePickerList() {
  const P = S.pick;
  const box = $('spList');
  if (!P || !box) return;
  const q = (P.q || '').trim().toLowerCase();
  const list = S.sales.filter(s => !saleClosed(s) && !s.is_test &&
    (!q || [s.ref, s.customer_name, s.customer_phone].join(' ').toLowerCase().includes(q))).slice(0, 40);
  box.innerHTML = list.length ? list.map(s =>
    '<div class="order-card status-confirmed" data-pick-sale="' + esc(s.id) + '">' +
      '<div class="order-status-dot"></div>' +
      '<div class="order-card-body">' +
        '<div class="order-card-ref">' + esc(s.ref || '') + '</div>' +
        '<div class="order-card-customer">' + esc(s.customer_name || s.customer_phone || '—') + '</div>' +
      '</div>' +
      '<div class="order-card-right">' +
        '<div class="order-card-total">' + esc(C.CURRENCY) + U.fmt(saleNet(s).collected) + '</div>' +
        '<div class="order-card-time">' + timeAgo(s.created_at) + '</div>' +
      '</div>' +
    '</div>').join('') : '<div class="empty-state"><strong>لا توجد فواتير مطابقة</strong>تظهر هنا الطلبات المؤكدة فقط</div>';
}

/* ─────────── نموذج الإرجاع / الاستبدال ─────────── */

async function openOp(kind, key) {
  const sale = saleById(key) || saleByRef(key);
  if (!sale) return notify('لم يتم العثور على الفاتورة — الطلب يجب أن يكون مؤكداً', 'error');
  if (saleClosed(sale)) return notify('هذه الفاتورة مغلقة (مرتجعة بالكامل أو ملغاة)', 'error');
  S.op = {
    kind: kind, sale: sale, lines: null, ret: {}, given: [],
    reason: '', method: 'نقداً', note: '', amount: null,
    pickQ: '', pickPid: '', pickColor: null, pickSize: null, pickQty: 1, busy: false
  };
  const isEx = kind === 'exchange';
  $(isEx ? 'exchangeModalBody' : 'returnModalBody').innerHTML = '<p class="muted">جاري التحميل...</p>';
  $(isEx ? 'exchangeModal' : 'returnModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  try {
    const { data, error } = await sb.rpc('admin_net_lines', { p_sale_id: String(sale.id) });
    if (error) throw error;
    S.op.lines = (data || []).filter(l => Number(l.qty) > 0);
    renderOp();
  } catch (e) {
    closeOp();
    fail(new Error(opErr(e)));
  }
}

function closeOp() {
  ['returnModal', 'exchangeModal'].forEach(id => { const m = $(id); if (m) m.classList.remove('open'); });
  document.body.style.overflow = '';
  S.op = null;
}

function opTotals() {
  const O = S.op;
  let retVal = 0, retQty = 0, giveVal = 0, giveQty = 0;
  O.lines.forEach(l => {
    const r = O.ret[lineKey(l)];
    if (r && r.qty > 0) { retVal += r.qty * (Number(l.price) || 0); retQty += r.qty; }
  });
  O.given.forEach(g => { giveVal += g.qty * g.price; giveQty += g.qty; });
  retVal = r2(retVal); giveVal = r2(giveVal);
  let dir, auto;
  if (O.kind === 'return') { dir = 'refund'; auto = retVal; }
  else {
    const d = r2(giveVal - retVal);
    dir = d > 0 ? 'collect' : (d < 0 ? 'refund' : 'none');
    auto = Math.abs(d);
  }
  let amount = auto;
  if (dir !== 'none' && O.amount != null && O.amount !== '') {
    const v = parseFloat(O.amount);
    if (isFinite(v) && v >= 0) amount = r2(v);
  }
  if (dir === 'none') amount = 0;
  return { retVal: retVal, retQty: retQty, giveVal: giveVal, giveQty: giveQty, dir: dir, auto: auto, amount: amount };
}

function pickProductsOptions(O) {
  const q = (O.pickQ || '').trim().toLowerCase();
  let list = S.products.filter(p => !q || [p.name, p.code].join(' ').toLowerCase().includes(q)).slice(0, 40);
  if (O.pickPid && !list.some(p => p.id === O.pickPid)) {
    const cur = productById(O.pickPid);
    if (cur) list.unshift(cur);
  }
  return '<option value="">— اختر المنتج —</option>' + list.map(p =>
    '<option value="' + esc(p.id) + '"' + (O.pickPid === p.id ? ' selected' : '') + '>' +
    esc(p.name) + (p.code ? ' · ' + esc(p.code) : '') + ' — ' + esc(C.CURRENCY) + U.fmt(p.price) + '</option>').join('');
}

function givenAlready(O, pid, color, size) {
  return O.given.filter(g => g.pid === pid && g.color === color && g.size === size).reduce((a, g) => a + g.qty, 0);
}

function renderOp() {
  const O = S.op;
  if (!O || !O.lines) return;
  const cur = C.CURRENCY;
  const sale = O.sale;
  const isEx = O.kind === 'exchange';
  const body = $(isEx ? 'exchangeModalBody' : 'returnModalBody');
  const sn = saleNet(sale);

  const linesHtml = O.lines.length ? O.lines.map(l => {
    const k = lineKey(l);
    const st = O.ret[k] || { qty: 0, restock: true };
    const max = Number(l.qty) || 0;
    return '<div class="return-item">' +
      '<div class="return-item-info">' +
        '<div class="return-item-name">' + esc(l.name || '') + '</div>' +
        '<div class="return-item-meta">' + esc(lineMeta(l) || '—') + '</div>' +
        '<div class="return-item-price">' + esc(cur) + U.fmt(l.price) + ' × ' + max + ' عند الزبون</div>' +
      '</div>' +
      (l.pid
        ? '<div class="return-item-inputs">' +
            '<label>الكمية الراجعة</label>' +
            '<input type="number" min="0" max="' + max + '" value="' + st.qty + '" data-op-qty="' + esc(k) + '" inputmode="numeric">' +
            '<label class="return-check"><input type="checkbox" data-op-restock="' + esc(k) + '"' + (st.restock !== false ? ' checked' : '') + '> سليمة وتعود للمخزون</label>' +
          '</div>'
        : '<div class="return-item-inputs"><span class="muted">منتج غير مرتبط بالمتجر — لا يمكن إرجاعه من هنا</span></div>') +
    '</div>';
  }).join('') : '<p class="muted">لا توجد قطع متبقية عند الزبون</p>';

  let givenHtml = '';
  if (isEx) {
    const p = productById(O.pickPid);
    const colors = p ? (p.product_colors || []) : [];
    const colorOpts = '<option value="">— اللون —</option>' + colors.map(c => {
      const total = (c.product_stock || []).reduce((a, s) => a + Math.max(0, Number(s.qty) || 0), 0);
      return '<option value="' + esc(c.name) + '"' + (O.pickColor === c.name ? ' selected' : '') + (total > 0 ? '' : ' disabled') + '>' + esc(c.name) + (total > 0 ? '' : ' (نفد)') + '</option>';
    }).join('');
    const col = p && O.pickColor != null ? colorOfProduct(p, O.pickColor) : null;
    const sizeOpts = '<option value="">— المقاس —</option>' + (col ? (col.product_stock || []).map(s => {
      const q = Math.max(0, (Number(s.qty) || 0) - givenAlready(O, p.id, col.name, s.size));
      return '<option value="' + esc(s.size) + '"' + (O.pickSize === s.size ? ' selected' : '') + (q > 0 ? '' : ' disabled') + '>' + esc(s.size) + (q > 0 ? ' (متوفر ' + q + ')' : ' (نفد)') + '</option>';
    }).join('') : '');

    givenHtml =
      '<div class="return-section-title">➡️ القطع البديلة (من مخزون المتجر)</div>' +
      '<div class="return-fields">' +
        '<input type="search" id="opPickQ" placeholder="🔍 ابحث بالاسم أو الكود" value="' + esc(O.pickQ) + '" autocomplete="off">' +
        '<select id="opPickP" class="return-select">' + pickProductsOptions(O) + '</select>' +
        (p ? '<select id="opPickC" class="return-select">' + colorOpts + '</select>' : '') +
        (p && O.pickColor != null ? '<select id="opPickS" class="return-select">' + sizeOpts + '</select>' : '') +
        (p && O.pickColor != null && O.pickSize != null
          ? '<label>الكمية</label><input type="number" id="opPickQty" min="1" value="' + O.pickQty + '" inputmode="numeric">' +
            '<button type="button" class="btn-secondary" data-op-act="addgiven" style="width:100%;margin-top:8px">+ إضافة للقائمة</button>'
          : '') +
      '</div>' +
      '<div class="returns-list" style="margin-top:10px">' +
        (O.given.length ? O.given.map((g, i) =>
          '<div class="return-row exchange"><div class="return-row-head">' +
            '<span class="return-row-title">' + esc(g.name) + '</span>' +
            '<span class="return-row-amount">' + esc(cur) + U.fmt(g.price * g.qty) + '</span></div>' +
            '<div class="return-row-reason">' + esc(lineMeta(g)) + ' · ×' + g.qty + '</div>' +
            '<button type="button" class="btn-soft danger" data-op-act="rmgiven" data-i="' + i + '">🗑️ حذف</button>' +
          '</div>').join('') : '<p class="muted">لم تُضف قطعة بديلة بعد</p>') +
      '</div>';
  }

  const methodOpts = ['نقداً', 'تحويل بنكي', 'محفظة إلكترونية', 'أخرى'].map(m =>
    '<option' + (O.method === m ? ' selected' : '') + '>' + m + '</option>').join('');

  body.innerHTML =
    '<div class="return-head">' +
      '<div><strong>الفاتورة:</strong> ' + esc(sale.ref || '') + '</div>' +
      '<div><strong>الزبون:</strong> ' + esc(sale.customer_name || '—') + '</div>' +
      '<div><strong>المحصّل حالياً:</strong> ' + esc(cur) + U.fmt(sn.collected) + '</div>' +
    '</div>' +
    '<div class="return-section-title">⬅️ ' + (isEx ? 'القطع التي يعيدها الزبون' : 'اختر القطع المرتجعة') + '</div>' +
    '<div class="return-items">' + linesHtml + '</div>' +
    givenHtml +
    '<div class="return-section-title">💰 الحساب</div>' +
    '<div class="return-summary">' +
      '<div>قيمة الراجع: <strong id="opSumRet">—</strong></div>' +
      (isEx ? '<div>قيمة البديل: <strong id="opSumGive">—</strong></div>' : '') +
      '<div id="opSumDir"></div>' +
    '</div>' +
    '<div class="return-fields">' +
      '<label id="opAmountLabel">المبلغ</label>' +
      '<input type="number" id="opAmount" min="0" step="0.01" inputmode="decimal" value="' + (O.amount != null ? esc(O.amount) : '') + '">' +
      '<label>طريقة الدفع / الاسترداد</label>' +
      '<select id="opMethod" class="return-select">' + methodOpts + '</select>' +
      '<label>السبب <span class="opt">(اختياري)</span></label>' +
      '<input type="text" id="opReason" placeholder="مثال: مقاس غير مناسب" value="' + esc(O.reason) + '">' +
      '<label>ملاحظة <span class="opt">(اختياري)</span></label>' +
      '<input type="text" id="opNote" value="' + esc(O.note) + '">' +
    '</div>' +
    '<div class="return-actions">' +
      '<button type="button" class="btn-secondary" data-op-act="cancel">إلغاء</button>' +
      '<button type="button" class="btn-primary" id="opSubmit" data-op-act="submit">' + (isEx ? 'حفظ الاستبدال' : 'حفظ الإرجاع') + '</button>' +
    '</div>';

  body.oninput = e => {
    const t = e.target;
    if (t.dataset.opQty != null) {
      const k = t.dataset.opQty;
      const l = O.lines.find(x => lineKey(x) === k);
      const max = l ? Number(l.qty) || 0 : 0;
      let v = parseInt(t.value, 10) || 0;
      v = Math.max(0, Math.min(max, v));
      if (t.value !== '' && String(v) !== t.value) t.value = v;
      (O.ret[k] = O.ret[k] || { qty: 0, restock: true }).qty = v;
      O.amount = null;
      updateOpSummary();
    } else if (t.id === 'opAmount') { O.amount = t.value; updateOpSummary(true); }
    else if (t.id === 'opReason') O.reason = t.value;
    else if (t.id === 'opNote') O.note = t.value;
    else if (t.id === 'opPickQ') {
      O.pickQ = t.value;
      const sel = $('opPickP');
      if (sel) sel.innerHTML = pickProductsOptions(O);
    } else if (t.id === 'opPickQty') O.pickQty = Math.max(1, parseInt(t.value, 10) || 1);
  };

  body.onchange = e => {
    const t = e.target;
    if (t.dataset.opRestock != null) {
      const k = t.dataset.opRestock;
      (O.ret[k] = O.ret[k] || { qty: 0, restock: true }).restock = t.checked;
    } else if (t.id === 'opMethod') O.method = t.value;
    else if (t.id === 'opPickP') { O.pickPid = t.value; O.pickColor = null; O.pickSize = null; O.pickQty = 1; renderOp(); }
    else if (t.id === 'opPickC') { O.pickColor = t.value || null; O.pickSize = null; O.pickQty = 1; renderOp(); }
    else if (t.id === 'opPickS') { O.pickSize = t.value || null; O.pickQty = 1; renderOp(); }
  };

  body.onclick = e => {
    const b = e.target.closest('[data-op-act]');
    if (!b) return;
    const act = b.dataset.opAct;
    if (act === 'cancel') closeOp();
    else if (act === 'submit') submitOp(false);
    else if (act === 'rmgiven') { O.given.splice(parseInt(b.dataset.i, 10), 1); O.amount = null; renderOp(); }
    else if (act === 'addgiven') addGiven();
  };

  updateOpSummary();
}

function addGiven() {
  const O = S.op;
  const p = productById(O.pickPid);
  if (!p || O.pickColor == null || O.pickSize == null) return notify('اختر المنتج واللون والمقاس', 'error');
  const qty = Math.max(1, parseInt(O.pickQty, 10) || 1);
  const avail = stockQty(p, O.pickColor, O.pickSize) - givenAlready(O, p.id, O.pickColor, O.pickSize);
  if (qty > avail) return notify('الكمية غير متوفرة (المتوفر: ' + Math.max(0, avail) + ')', 'error');
  const ex = O.given.find(g => g.pid === p.id && g.color === O.pickColor && g.size === O.pickSize);
  if (ex) ex.qty += qty;
  else O.given.push({ pid: p.id, code: p.code || null, name: p.name, color: O.pickColor, size: O.pickSize, qty: qty, price: Number(p.price) || 0 });
  O.pickPid = ''; O.pickColor = null; O.pickSize = null; O.pickQty = 1; O.pickQ = '';
  O.amount = null;
  renderOp();
}

function updateOpSummary(fromAmount) {
  const O = S.op;
  if (!O) return;
  const cur = C.CURRENCY;
  const t = opTotals();
  const set = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
  set('opSumRet', esc(cur) + U.fmt(t.retVal) + ' (' + t.retQty + ' قطعة)');
  set('opSumGive', esc(cur) + U.fmt(t.giveVal) + ' (' + t.giveQty + ' قطعة)');
  let dirTxt, lbl;
  if (t.dir === 'collect') { dirTxt = '<span class="op-pos">على الزبون دفع: ' + esc(cur) + U.fmt(t.amount) + '</span>'; lbl = 'المبلغ المطلوب من الزبون'; }
  else if (t.dir === 'refund') { dirTxt = '<span class="op-neg">نرجع للزبون: ' + esc(cur) + U.fmt(t.amount) + '</span>'; lbl = 'المبلغ المسترد للزبون'; }
  else { dirTxt = 'لا فرق في السعر'; lbl = 'المبلغ'; }
  set('opSumDir', dirTxt);
  set('opAmountLabel', lbl + ' <span class="opt">(يُحسب تلقائياً — عدّله عند الخصم)</span>');
  const inp = $('opAmount');
  if (inp) {
    inp.disabled = t.dir === 'none';
    if (!fromAmount && O.amount == null) inp.value = t.auto ? t.auto : '';
  }
  const ok = t.retQty > 0 && (O.kind === 'return' || O.given.length > 0);
  const sb2 = $('opSubmit');
  if (sb2) sb2.disabled = !ok || O.busy;
}

/* تطبيق تغييرات المخزون (تحقق كامل أولاً ثم تنفيذ) */
async function applyOpStock(opId, deltas) {
  const plan = [], bad = [];
  for (const d of (deltas || [])) {
    const qty = Number(d.qty) || 0;
    if (!qty) continue;
    try {
      if (!d.pid) { bad.push(d); continue; }
      const { data: cols } = await sb.from('product_colors').select('id').eq('product_id', d.pid).eq('name', d.color || '').limit(1);
      if (!cols || !cols[0]) { bad.push(d); continue; }
      const { data: sts } = await sb.from('product_stock').select('id').eq('color_id', cols[0].id).eq('size', d.size || '').limit(1);
      if (!sts || !sts[0]) { bad.push(d); continue; }
      plan.push({ id: sts[0].id, qty: qty, d: d });
    } catch (e) { bad.push(d); }
  }
  if (bad.length) return { ok: false, bad: bad, notDone: [] };
  const notDone = [];
  for (const p of plan) {
    const { error } = await sb.rpc('admin_adjust_stock', { p_stock_id: p.id, p_delta: p.qty, p_reason: 'return/exchange' });
    if (error) notDone.push(p.d);
  }
  await sb.rpc('admin_mark_return_stock', { p_id: opId });
  return { ok: notDone.length === 0, bad: [], notDone: notDone };
}

function stockFailText(res) {
  const list = res.bad.concat(res.notDone).map(d => (d.pid || '') + ' ' + (d.color || '') + ' ' + (d.size || '') + ' (' + (d.qty > 0 ? '+' : '') + d.qty + ')');
  return list.join(' | ');
}

async function refreshAfterOp() {
  await loadProducts();
  await loadSales();
  await loadOps();
  renderStats();
  renderProducts();
  renderOps();
  renderOrders();
  if (S.orderEditing) renderOrderDetail();
  if (S.opView) renderOpDetail();
}

async function submitOp(override) {
  const O = S.op;
  if (!O || O.busy) return;
  const t = opTotals();
  const returned = [];
  O.lines.forEach(l => {
    const r = O.ret[lineKey(l)];
    if (r && r.qty > 0) returned.push({ pid: l.pid, color: l.color || '', size: l.size || '', name: l.name, code: l.code, qty: r.qty, restock: r.restock !== false });
  });
  if (!returned.length) return notify('اختر قطعة واحدة على الأقل', 'error');
  if (O.kind === 'exchange' && !O.given.length) return notify('أضف القطعة البديلة', 'error');
  const maxPaid = saleNet(O.sale).collected;
  const refund = t.dir === 'refund' ? t.amount : 0;
  const collect = t.dir === 'collect' ? t.amount : 0;
  if (refund > maxPaid) return notify('المبلغ المسترد أكبر مما دفعه الزبون (' + C.CURRENCY + U.fmt(maxPaid) + ')', 'error');

  const damaged = returned.filter(x => !x.restock).reduce((a, x) => a + x.qty, 0);
  if (!override) {
    const msg = (O.kind === 'exchange' ? 'تأكيد الاستبدال؟' : 'تأكيد الإرجاع؟') + '\n\n' +
      'قطع راجعة: ' + t.retQty + (damaged ? ' (منها ' + damaged + ' تالفة لن تعود للمخزون)' : '') + '\n' +
      (O.kind === 'exchange' ? 'قطع بديلة: ' + t.giveQty + '\n' : '') +
      (refund ? 'سيُسترد للزبون: ' + C.CURRENCY + U.fmt(refund) : collect ? 'سيُحصَّل من الزبون: ' + C.CURRENCY + U.fmt(collect) : 'بدون فرق مالي');
    if (!confirm(msg)) return;
  }

  O.busy = true;
  const btn = $('opSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ...'; }
  try {
    const { data, error } = await sb.rpc('admin_process_return', {
      p_sale_id: String(O.sale.id),
      p_kind: O.kind,
      p_returned: returned,
      p_given: O.kind === 'exchange' ? O.given : [],
      p_refund: refund,
      p_collect: collect,
      p_reason: O.reason.trim() || null,
      p_note: O.note.trim() || null,
      p_method: O.method || null,
      p_days: RETURN_DAYS,
      p_override: !!override
    });
    if (error) throw error;

    const res = await applyOpStock(data.id, data.deltas);
    const kindTxt = O.kind === 'exchange' ? 'الاستبدال' : 'الإرجاع';
    closeOp();
    await refreshAfterOp();
    if (res.ok) notify('تم تسجيل ' + kindTxt + ' ✓ وتحدّث المخزون والأرباح', 'success');
    else if (res.bad.length) alert('تم تسجيل ' + kindTxt + ' لكن المخزون لم يُحدَّث.\nافتح العملية من القائمة واضغط «تطبيق المخزون» بعد التأكد من وجود اللون والمقاس.\n\n' + stockFailText(res));
    else alert('تم تسجيل ' + kindTxt + ' لكن بعض تعديلات المخزون لم تُنفَّذ بسبب الاتصال. عدّلها يدوياً من شاشة المنتج:\n\n' + stockFailText(res));
  } catch (e) {
    O.busy = false;
    if (/outside_window/.test((e && e.message) || '')) {
      if (confirm('الفاتورة أقدم من ' + RETURN_DAYS + ' يوماً. هل تريد المتابعة رغم ذلك؟')) return submitOp(true);
    } else {
      fail(new Error(opErr(e)));
    }
    if (btn) { btn.disabled = false; btn.textContent = O.kind === 'exchange' ? 'حفظ الاستبدال' : 'حفظ الإرجاع'; }
  }
}

/* ─────────── تفاصيل عملية + إلغاء ─────────── */

function openOpDetail(id) {
  if (!S.ops.find(x => x.id === id)) return;
  S.opView = id;
  renderOpDetail();
  $('opDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOpDetail() {
  const m = $('opDetailModal');
  if (m) m.classList.remove('open');
  S.opView = null;
  if (!document.querySelector('.modal-bg.open')) document.body.style.overflow = '';
}

function renderOpDetail() {
  const r = S.ops.find(x => x.id === S.opView);
  const body = $('opDetailBody');
  if (!r || !body) return;
  const cur = C.CURRENCY;
  const sale = saleById(r.sale_id);
  const isEx = r.kind === 'exchange';
  const ret = Array.isArray(r.returned) ? r.returned : [];
  const giv = Array.isArray(r.given) ? r.given : [];
  $('opDetailTitle').textContent = (isEx ? '🔄 استبدال' : '↩️ إرجاع') + (sale ? ' · ' + (sale.ref || '') : '');
  const lines = arr => arr.map(x =>
    '<div class="order-summary-row"><span>' + esc(x.name || '') + (lineMeta(x) ? ' (' + esc(lineMeta(x)) + ')' : '') + ' ×' + (Number(x.qty) || 0) +
    (x.restock === false ? ' · تالفة' : '') + '</span><span>' + esc(cur) + U.fmt((Number(x.price) || 0) * (Number(x.qty) || 0)) + '</span></div>').join('');
  const stockTxt = r.voided ? '' : opPending(r)
    ? '<div class="order-completed-note" style="background:#fff3e0;color:#e65100">⚠️ المخزون لم يُحدَّث لهذه العملية</div>'
    : '<div class="order-completed-note">✅ المخزون محدَّث</div>';
  body.innerHTML =
    (r.voided ? '<div class="order-completed-note" style="background:#fde8eb;color:#c8102e">❌ هذه العملية ملغاة</div>' : '') +
    '<div class="order-detail-head"><div>' +
      '<div class="order-detail-ref">' + esc(sale ? sale.customer_name || '' : '') + '</div>' +
      '<div class="order-detail-time">' + new Date(r.created_at).toLocaleString('ar-EG') + '</div></div></div>' +
    '<div class="order-detail-section"><div class="order-detail-heading">⬅️ القطع الراجعة</div><div class="order-summary">' + (lines(ret) || '—') + '</div></div>' +
    (isEx ? '<div class="order-detail-section"><div class="order-detail-heading">➡️ القطع البديلة</div><div class="order-summary">' + (lines(giv) || '—') + '</div></div>' : '') +
    '<div class="order-detail-section"><div class="order-detail-heading">💰 الحساب</div><div class="order-summary">' +
      (Number(r.refund) > 0 ? '<div class="order-summary-row"><span>مسترد للزبون</span><span class="op-neg">' + esc(cur) + U.fmt(r.refund) + '</span></div>' : '') +
      (Number(r.collect) > 0 ? '<div class="order-summary-row"><span>محصّل من الزبون</span><span class="op-pos">' + esc(cur) + U.fmt(r.collect) + '</span></div>' : '') +
      (!(Number(r.refund) > 0) && !(Number(r.collect) > 0) ? '<div class="order-summary-row"><span>بدون فرق مالي</span><span>—</span></div>' : '') +
      (r.refund_method ? '<div class="order-summary-row"><span>الطريقة</span><span>' + esc(r.refund_method) + '</span></div>' : '') +
    '</div></div>' +
    ((r.reason || r.note) ? '<div class="order-detail-section"><div class="order-detail-heading">📝 ملاحظات</div>' +
      (r.reason ? '<div class="return-row-reason">السبب: ' + esc(r.reason) + '</div>' : '') +
      (r.note ? '<div class="return-row-reason">' + esc(r.note) + '</div>' : '') + '</div>' : '') +
    stockTxt +
    '<div class="order-actions">' +
      (opPending(r) ? '<button type="button" class="order-btn-confirm" data-od="stock">📦 تطبيق المخزون</button>' : '') +
      (!r.voided ? '<button type="button" class="order-btn-cancel" data-od="void">❌ إلغاء هذه العملية</button>' : '') +
      (sale ? '<button type="button" class="btn-secondary" data-od="order">📥 فتح الطلب</button>' : '') +
    '</div>';
}

async function applyPendingOp() {
  const r = S.ops.find(x => x.id === S.opView);
  if (!r || !opPending(r)) return;
  try {
    const res = await applyOpStock(r.id, r.stock_deltas);
    await refreshAfterOp();
    if (res.ok) notify('تم تحديث المخزون ✓', 'success');
    else alert('تعذر تحديث المخزون لهذه القطع (تأكد من وجود اللون والمقاس):\n\n' + stockFailText(res));
  } catch (e) { fail(new Error(opErr(e))); }
}

async function voidOp() {
  const r = S.ops.find(x => x.id === S.opView);
  if (!r || r.voided) return;
  if (!confirm('إلغاء هذه العملية؟\n\nسيتم عكس أثرها على الفاتورة والمخزون والأرباح.')) return;
  try {
    const { data, error } = await sb.rpc('admin_void_return', { p_id: r.id });
    if (error) throw error;
    const res = await applyOpStock(r.id, data && data.deltas);
    await refreshAfterOp();
    if (res.ok) notify('تم إلغاء العملية ✓ وعاد كل شيء كما كان', 'success');
    else alert('أُلغيت العملية لكن المخزون لم يُعكس بالكامل. اضغط «تطبيق المخزون» أو عدّله يدوياً:\n\n' + stockFailText(res));
  } catch (e) { fail(new Error(opErr(e))); }
}

async function reloadOps() {
  notify('جاري التحديث...');
  await loadSales();
  await loadOps();
  renderStats();
  renderOps();
  notify('تم التحديث ✓', 'success');
}

function openReturnForm(key) { return openOp('return', key); }
function openExchangeForm(key) { return openOp('exchange', key); }
function closeReturnForm() { closeOp(); }
function closeExchangeForm() { closeOp(); }

  async function reloadOrders() {
    notify('جاري التحديث...');
    await loadOrders();
    renderOrders();
    notify('تم التحديث ✓', 'success');
  }

  /* ═══════════════════════════════════════════════════════════
     📂 الأقسام
     ═══════════════════════════════════════════════════════════ */

  function renderCategories() {
    const box = $('categoriesList');
    if (!box) return;
    if (!S.categories.length) {
      box.innerHTML = '<div class="empty-state"><strong>لا توجد أقسام</strong>اضغط «إضافة قسم»</div>';
      return;
    }
    box.innerHTML = S.categories.map(c => {
      const n = S.products.filter(p => p.category_id === c.id).length;
      return '<div class="category-card" data-id="' + esc(c.id) + '">' +
        '<div class="category-icon">📂</div>' +
        '<div class="category-body"><strong>' + esc(c.name) + '</strong><span>' + n + ' منتج' + (c.is_active === false ? ' · مخفي' : '') + '</span></div>' +
        '<div class="category-actions">' +
          '<button type="button" class="btn-edit" data-act="editcat" style="padding:8px 12px;border-radius:10px">تعديل</button>' +
          '<button type="button" class="btn-delete" data-act="delcat" style="padding:8px 12px;border-radius:10px">حذف</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
/* ═══════════════════════════════════════════════════════════
     💰 نماذج المالية (Modals)
     ═══════════════════════════════════════════════════════════ */

  function openFinanceModal(title) {
    const modal = $('financeModal');
    const titleEl = $('financeModalTitle');
    if (titleEl) titleEl.textContent = title;
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeFinanceModal() {
    const modal = $('financeModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function openExpenseForm() {
    const cur = C.CURRENCY || '₪';
    const today = new Date().toISOString().slice(0, 10);

    const categories = [
      'إعلانات',
      'تغليف',
      'شحن',
      'الإنترنت والهاتف',
      'الكهرباء والماء',
      'المواصلات',
      'الإيجار',
      'أخرى'
    ];

    const body = $('financeModalBody');
    body.innerHTML =
      '<div class="finance-form-field">' +
        '<label>الفئة *</label>' +
        '<select id="exCategory">' +
          categories.map(c => '<option value="' + c + '">' + c + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="finance-form-field">' +
        '<label>المبلغ (' + cur + ') *</label>' +
        '<input type="number" id="exAmount" min="0" step="0.01" inputmode="decimal" placeholder="مثال: 500">' +
      '</div>' +
      '<div class="finance-form-field">' +
        '<label>التاريخ</label>' +
        '<input type="date" id="exDate" value="' + today + '">' +
      '</div>' +
      '<div class="finance-form-field">' +
        '<label>ملاحظة <span style="color:#999;font-weight:400">(اختياري)</span></label>' +
        '<textarea id="exNote" placeholder="مثال: إعلان فيسبوك لشهر أكتوبر"></textarea>' +
      '</div>' +
      '<div class="finance-form-actions">' +
        '<button type="button" class="finance-form-cancel" onclick="Admin.closeFinanceModal()">إلغاء</button>' +
        '<button type="button" class="finance-form-save" id="exSave" onclick="Admin.saveExpense()">حفظ المصروف</button>' +
      '</div>';

    openFinanceModal('💸 إضافة مصروف');
  }

  function openCapitalForm(kind) {
    const cur = C.CURRENCY || '₪';
    const isWithdrawal = kind === 'withdrawal';
    const title = isWithdrawal ? '📤 سحب من رأس المال' : '📥 ضخ سيولة';

    const body = $('financeModalBody');
    body.innerHTML =
      '<div class="finance-form-field">' +
        '<label>المبلغ (' + cur + ') *</label>' +
        '<input type="number" id="capAmount" min="0" step="0.01" inputmode="decimal" placeholder="مثال: 1000">' +
      '</div>' +
      '<div class="finance-form-field">' +
        '<label>ملاحظة <span style="color:#999;font-weight:400">(اختياري)</span></label>' +
        '<textarea id="capNote" placeholder="' + (isWithdrawal ? 'مثال: سحب شخصي' : 'مثال: إضافة من مدخراتي') + '"></textarea>' +
      '</div>' +
      '<div class="finance-form-actions">' +
        '<button type="button" class="finance-form-cancel" onclick="Admin.closeFinanceModal()">إلغاء</button>' +
        '<button type="button" class="finance-form-save" id="capSave" onclick="Admin.saveCapital(\'' + kind + '\')">حفظ</button>' +
      '</div>';

    openFinanceModal(title);
  }

  function openCategoryForm(id) {
    const c = id ? S.categories.find(x => x.id === id) : null;
    S.editing = c ? c.id : null;
    $('categoryModalTitle').textContent = c ? 'تعديل قسم' : 'إضافة قسم';
    $('categoryModalBody').innerHTML =
      '<div class="field"><label>اسم القسم *</label><input id="cfName" value="' + esc(c ? c.name : '') + '"></div>' +
      '<div class="field"><label>الترتيب</label><input id="cfSort" type="number" inputmode="numeric" value="' + esc(c ? (c.sort_order || 0) : S.categories.length + 1) + '"></div>' +
      '<label style="display:flex;align-items:center;gap:10px;font-size:15px"><input type="checkbox" id="cfActive"' + (!c || c.is_active !== false ? ' checked' : '') + ' style="width:20px;height:20px"> ظاهر في المتجر</label>' +
      '<div class="modal-actions"><button type="button" class="btn-secondary" onclick="Admin.closeCategoryForm()">إلغاء</button>' +
      '<button type="button" class="btn-primary" id="cfSave" onclick="Admin.saveCategory()">حفظ</button></div>';
    const modal = $('categoryModal');
    if (modal) modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCategoryForm() {
    const modal = $('categoryModal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
    S.editing = null;
  }
/* ═══════════════════════════════════════════════════════════
     💾 حفظ وحذف المالية
     ═══════════════════════════════════════════════════════════ */

  async function saveExpense() {
    const category = $('exCategory').value;
    const amount = parseFloat($('exAmount').value);
    const date = $('exDate').value || new Date().toISOString().slice(0, 10);
    const note = ($('exNote').value || '').trim();
    const btn = $('exSave');

    if (!category) return notify('اختر الفئة', 'error');
    if (!isFinite(amount) || amount <= 0) return notify('أدخل مبلغاً صحيحاً', 'error');

    if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ...'; }

    try {
      const { error } = await sb.from('expenses').insert({
        category: category,
        amount: amount,
        expense_date: date,
        note: note || null
      });
      if (error) throw error;

      notify('تم حفظ المصروف ✓', 'success');
      closeFinanceModal();
      await loadExpenses();
      renderFinance();
    } catch (e) {
      fail(e, 'فشل حفظ المصروف');
      if (btn) { btn.disabled = false; btn.textContent = 'حفظ المصروف'; }
    }
  }

  async function saveCapital(kind) {
    const amount = parseFloat($('capAmount').value);
    const note = ($('capNote').value || '').trim();
    const btn = $('capSave');

    if (!isFinite(amount) || amount <= 0) return notify('أدخل مبلغاً صحيحاً', 'error');

    if (btn) { btn.disabled = true; btn.textContent = 'جاري الحفظ...'; }

    try {
      const { error } = await sb.from('capital').insert({
        amount: amount,
        kind: kind,
        note: note || null
      });
      if (error) throw error;

      notify('تم الحفظ ✓', 'success');
      closeFinanceModal();
      await loadCapital();
      renderFinance();
    } catch (e) {
      fail(e, 'فشل الحفظ');
      if (btn) { btn.disabled = false; btn.textContent = 'حفظ'; }
    }
  }

  async function deleteExpense(id) {
    if (!confirm('حذف هذا المصروف؟')) return;
    try {
      const { error } = await sb.from('expenses').delete().eq('id', id);
      if (error) throw error;
      notify('تم الحذف ✓', 'success');
      await loadExpenses();
      renderFinance();
    } catch (e) {
      fail(e, 'فشل الحذف');
    }
  }

  async function deleteCapital(id) {
    if (!confirm('حذف هذا السجل؟ سيؤثر على حساب رأس المال.')) return;
    try {
      const { error } = await sb.from('capital').delete().eq('id', id);
      if (error) throw error;
      notify('تم الحذف ✓', 'success');
      await loadCapital();
      renderFinance();
    } catch (e) {
      fail(e, 'فشل الحذف');
    }
  }

  async function saveCategory() {
    const name = $('cfName').value.trim();
    if (!name) return notify('اكتب اسم القسم', 'error');
    const row = {
      name: name,
      sort_order: parseInt($('cfSort').value, 10) || 0,
      is_active: $('cfActive').checked
    };
    const btn = $('cfSave');
    if (btn) btn.disabled = true;
    try {
      const q = S.editing
        ? sb.from('categories').update(row).eq('id', S.editing)
        : sb.from('categories').insert(row);
      const { error } = await q;
      if (error) throw error;
      notify('تم الحفظ ✓', 'success');
      closeCategoryForm();
      await loadCategories();
      renderStats();
      renderCategoryFilter();
      renderCategories();
      renderProducts();
    } catch (e) {
      fail(e, 'فشل حفظ القسم');
      if (btn) btn.disabled = false;
    }
  }

  async function deleteCategory(id) {
    const c = S.categories.find(x => x.id === id);
    if (!c) return;
    const n = S.products.filter(p => p.category_id === id).length;
    if (n) return notify('لا يمكن حذف قسم فيه ' + n + ' منتج.', 'error');
    if (!confirm('حذف قسم «' + c.name + '»؟')) return;
    try {
      const { error } = await sb.from('categories').delete().eq('id', id);
      if (error) throw error;
      notify('تم الحذف ✓', 'success');
      await loadCategories();
      const pf = $('productsFilter');
      if (pf && pf.value === id) pf.value = '';
      renderStats();
      renderCategoryFilter();
      renderCategories();
      renderProducts();
    } catch (e) {
      fail(e, 'فشل حذف القسم');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     📊 تبويب Meta Pixel
     ═══════════════════════════════════════════════════════════ */

  function renderMetaTab() {
    const box = $('metaContent');
    if (!box) return;

    if (!S.capiLog.length) {
      box.innerHTML = '<div class="empty-state"><strong>لا توجد أحداث بعد</strong>ستظهر هنا أحداث Meta CAPI عند إرسالها</div>';
      return;
    }

    const total = S.capiLog.length;
    const ok = S.capiLog.filter(e => e.ok).length;
    const failed = total - ok;
    const successRate = total ? Math.round((ok / total) * 100) : 0;

    const byEvent = {};
    S.capiLog.forEach(e => {
      byEvent[e.event_name] = (byEvent[e.event_name] || 0) + 1;
    });

    const statsHtml =
      '<div class="stats-grid" style="margin-bottom:20px">' +
        '<div class="stat-card"><div class="stat-icon">📊</div><div class="stat-body"><strong>' + total + '</strong><span>إجمالي الأحداث</span></div></div>' +
        '<div class="stat-card"><div class="stat-icon">✅</div><div class="stat-body"><strong style="color:#157a3d">' + ok + '</strong><span>ناجحة</span></div></div>' +
        '<div class="stat-card"><div class="stat-icon">❌</div><div class="stat-body"><strong style="color:#c8102e">' + failed + '</strong><span>فاشلة</span></div></div>' +
        '<div class="stat-card"><div class="stat-icon">📈</div><div class="stat-body"><strong>' + successRate + '%</strong><span>معدل النجاح</span></div></div>' +
      '</div>';

    const byEventHtml = Object.keys(byEvent).length
      ? '<div class="meta-by-event">' + Object.keys(byEvent).map(k =>
          '<div class="meta-event-chip"><b>' + esc(k) + '</b><span>' + byEvent[k] + '</span></div>'
        ).join('') + '</div>'
      : '';

    const rowsHtml = S.capiLog.slice(0, 50).map(e => {
      const dt = new Date(e.created_at);
      const timeStr = dt.toLocaleString('ar-EG');
      return '<tr>' +
        '<td>' + esc(e.event_name || '') + '</td>' +
        '<td style="font-family:monospace;font-size:11px">' + esc(String(e.event_id || '').slice(0, 30)) + '...</td>' +
        '<td>' + (e.ok ? '<span style="color:#157a3d">✅</span>' : '<span style="color:#c8102e">❌</span>') + '</td>' +
        '<td style="font-size:12px;color:#666">' + esc(timeStr) + '</td>' +
      '</tr>';
    }).join('');

    box.innerHTML =
      statsHtml +
      byEventHtml +
      '<div class="meta-actions">' +
        '<button type="button" class="btn-secondary" onclick="Admin.testMetaEvent(\'ViewContent\')">🧪 اختبار ViewContent</button>' +
        '<button type="button" class="btn-secondary" onclick="Admin.testMetaEvent(\'AddToCart\')">🧪 اختبار AddToCart</button>' +
        '<button type="button" class="btn-secondary" onclick="Admin.reloadMeta()">🔄 تحديث</button>' +
      '</div>' +
      '<h3 style="margin:20px 0 12px">📋 آخر 50 حدث</h3>' +
      '<div class="meta-table-wrap"><table class="meta-table">' +
        '<thead><tr><th>الحدث</th><th>event_id</th><th>الحالة</th><th>الوقت</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table></div>';
  }

  async function reloadMeta() {
    notify('جاري التحديث...');
    await loadCapiLog();
    renderMetaTab();
    notify('تم التحديث ✓', 'success');
  }

  async function testMetaEvent(eventName) {
    try {
      notify('جاري إرسال حدث اختباري...');
      const eventId = 'test-' + eventName.toLowerCase() + '-' + Date.now();
      const { data, error } = await sb.functions.invoke(C.META_TRACK_FN || 'meta-track', {
        body: {
          event_name: eventName,
          event_id: eventId,
          url: location.href,
          ua: navigator.userAgent,
          custom_data: {
            currency: 'ILS',
            value: 10,
            content_ids: ['TEST-001'],
            content_type: 'product'
          }
        }
      });
      if (error) throw error;
      if (data && data.ok) {
        notify('تم إرسال الحدث الاختباري ✓', 'success');
        setTimeout(reloadMeta, 2000);
      } else {
        notify('فشل: ' + ((data && data.error) || 'خطأ غير معروف'), 'error');
      }
    } catch (e) {
      fail(e, 'فشل الاختبار');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     🚚 أدوات التوصيل (قسمان + مدن تابعة)
     ═══════════════════════════════════════════════════════════ */

  function normalizeZones(raw) {
    // توافق عكسي: مصفوفة قديمة [{name, price}]
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
    // افتراضي: القسمان
    return (C.DELIVERY_ZONES || []).map(z => Object.assign({}, z, { cities: [] }));
  }

  function getZones() {
    const s = S.settings || {};
    return normalizeZones(s.delivery);
  }

  function setZones(zones) {
    S.settings.delivery = { zones: zones };
  }

  function parsePriceVal(v) {
    if (v == null || v === '') return '';
    const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? String(v).trim() : n;
  }

  function renderDeliverySection() {
    const zones = getZones();
    let h = '<div class="delivery-zones">';

    zones.forEach((zone, zi) => {
      const cities = zone.cities || [];
      h += '<div class="zone-card" data-zone-idx="' + zi + '">' +
        '<div class="zone-head">' +
          '<div class="zone-title">' +
            '<span class="zone-badge">القسم ' + (zi + 1) + '</span>' +
            '<input class="zone-name-inp" data-zone-field="name" data-zone-idx="' + zi + '" value="' + esc(zone.name || '') + '" placeholder="اسم القسم (إجباري)">' +
          '</div>' +
          '<button type="button" class="btn-soft danger zone-del" data-act="zonedel" data-zone-idx="' + zi + '">🗑️ حذف</button>' +
        '</div>' +

        '<div class="zone-default">' +
          '<label>💰 السعر العام لهذا القسم (أرقام أو حروف):</label>' +
          '<input class="zone-default-inp" data-zone-field="default_price" data-zone-idx="' + zi + '" value="' + esc(zone.default_price || '') + '" placeholder="مثال: 20 أو «حسب المنطقة»">' +
          '<small>يُستخدم لأي مدينة بدون سعر مخصص.</small>' +
        '</div>' +

        '<div class="zone-cities-head">' +
          '<span>🏙️ المدن (' + cities.length + ')</span>' +
          '<div class="zone-cities-actions">' +
            '<button type="button" class="btn-soft" data-act="cityadd" data-zone-idx="' + zi + '">+ مدينة</button>' +
            '<button type="button" class="btn-soft" data-act="citypreset" data-zone-idx="' + zi + '">📋 قائمة جاهزة</button>' +
            '<label class="btn-soft">📤 رفع ملف<input type="file" accept=".json,.csv,.txt" hidden data-zone-file="' + zi + '"></label>' +
          '</div>' +
        '</div>' +

        '<div class="zone-cities">';

      if (!cities.length) {
        h += '<p class="muted" style="padding:8px 0;font-size:12.5px">لا توجد مدن بعد.</p>';
      } else {
        cities.forEach((city, ci) => {
          h += '<div class="city-row">' +
            '<input class="city-name-inp" data-city-field="name" data-zone-idx="' + zi + '" data-city-idx="' + ci + '" value="' + esc(city.name || '') + '" placeholder="اسم المدينة">' +
            '<input class="city-price-inp" data-city-field="price" data-zone-idx="' + zi + '" data-city-idx="' + ci + '" value="' + esc(city.price == null ? '' : city.price) + '" placeholder="سعر مخصص">' +
            '<button type="button" class="city-del" data-act="citydel" data-zone-idx="' + zi + '" data-city-idx="' + ci + '">✕</button>' +
          '</div>';
        });
      }

      h += '</div></div>';
    });

    h += '<button type="button" class="btn-secondary" data-act="zoneadd" style="width:100%;margin-top:12px">+ إضافة قسم جديد</button>';
    h += '</div>';

    return h;
  }

  function openCityPresetPicker(zi) {
    const presets = C.CITY_PRESETS || {};
    const options = [
      { key: 'west_bank', label: 'مدن الضفة الغربية' },
      { key: 'east_jerusalem', label: 'مدن القدس الشرقية' },
      { key: 'west_jerusalem', label: 'مدن القدس الغربية' },
      { key: 'inside_48', label: 'مدن الداخل (أراضي 48)' }
    ];

    let modal = $('presetModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-bg';
      modal.id = 'presetModal';
      modal.innerHTML = '<div class="modal"><div class="modal-head"><h3>📋 قائمة مدن جاهزة</h3><button type="button" class="modal-close" id="presetClose">✕</button></div><div class="modal-body" id="presetBody"></div></div>';
      document.body.appendChild(modal);
    }

    let h = '<p class="muted" style="margin-bottom:12px;font-size:13px">اختر مجموعة، وستُضاف كل مدنها لهذا القسم:</p><div class="preset-picker">';
    options.forEach(o => {
      const list = presets[o.key] || [];
      h += '<button type="button" class="preset-btn" data-preset="' + o.key + '" data-zone-idx="' + zi + '">' +
        '<b>' + esc(o.label) + '</b>' +
        '<span>' + list.length + ' مدينة</span>' +
      '</button>';
    });
    h += '</div><button type="button" class="btn-secondary" data-act="presetcancel" style="width:100%;margin-top:12px">إلغاء</button>';

    $('presetBody').innerHTML = h;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    $('presetBody').onclick = (e) => {
      if (e.target.closest('[data-act="presetcancel"]') || e.target.id === 'presetClose') {
        modal.classList.remove('open');
        document.body.style.overflow = '';
        return;
      }
      const btn = e.target.closest('.preset-btn');
      if (!btn) return;
      const key = btn.dataset.preset;
      const zi2 = parseInt(btn.dataset.zoneIdx, 10);
      const list = (C.CITY_PRESETS || {})[key] || [];
      const zones = getZones();
      if (!zones[zi2]) return;
      if (!zones[zi2].cities) zones[zi2].cities = [];
      const existing = new Set(zones[zi2].cities.map(c => c.name));
      list.forEach(name => { if (!existing.has(name)) zones[zi2].cities.push({ name: name, price: '' }); });
      setZones(zones);
      modal.classList.remove('open');
      document.body.style.overflow = '';
      renderSettings();
      notify('تمت إضافة ' + list.length + ' مدينة ✓', 'success');
    };
  }

  function parseCitiesFile(text, filename) {
    const name = (filename || '').toLowerCase();
    const out = [];

    if (name.endsWith('.json')) {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          data.forEach(x => {
            if (typeof x === 'string') out.push({ name: x.trim(), price: '' });
            else if (x && typeof x === 'object') out.push({ name: String(x.name || x.city || '').trim(), price: x.price == null ? '' : x.price });
          });
        } else if (data && Array.isArray(data.cities)) {
          data.cities.forEach(x => out.push({ name: String(x.name || x).trim(), price: x.price == null ? '' : x.price }));
        }
      } catch (e) { throw new Error('ملف JSON غير صالح'); }
    } else {
      text.split(/\r?\n/).forEach(line => {
        line = line.trim();
        if (!line) return;
        const parts = line.split(/[,;\t]/).map(p => p.trim());
        if (!parts[0]) return;
        out.push({ name: parts[0], price: parts[1] == null ? '' : parts[1] });
      });
    }

    return out.filter(c => c.name);
  }

  function handleCitiesFile(input, zi) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const cities = parseCitiesFile(String(reader.result || ''), file.name);
        if (!cities.length) return notify('الملف لا يحتوي مدناً صالحة', 'error');
        const zones = getZones();
        if (!zones[zi]) return;
        if (!zones[zi].cities) zones[zi].cities = [];
        const existing = new Set(zones[zi].cities.map(c => c.name));
        cities.forEach(c => { if (!existing.has(c.name)) zones[zi].cities.push(c); });
        setZones(zones);
        renderSettings();
        notify('تمت إضافة ' + cities.length + ' مدينة ✓', 'success');
      } catch (e) {
        fail(e, 'فشل قراءة الملف');
      }
      input.value = '';
    };
    reader.readAsText(file, 'utf-8');
  }

  function syncDeliveryFromDom() {
    const zones = getZones();

    document.querySelectorAll('[data-zone-field]').forEach(inp => {
      const zi = parseInt(inp.dataset.zoneIdx, 10);
      const field = inp.dataset.zoneField;
      if (!zones[zi]) return;
      zones[zi][field] = inp.value;
    });

    document.querySelectorAll('[data-city-field]').forEach(inp => {
      const zi = parseInt(inp.dataset.zoneIdx, 10);
      const ci = parseInt(inp.dataset.cityIdx, 10);
      const field = inp.dataset.cityField;
      if (!zones[zi] || !zones[zi].cities[ci]) return;
      zones[zi].cities[ci][field] = inp.value;
    });

    setZones(zones);
  }

  /* ═══════════════════════════════════════════════════════════
     ⚙️ الإعدادات
     ═══════════════════════════════════════════════════════════ */

  async function uploadSettingImage(file, key) {
    const img = await loadImage(file);
    const maxDim = 1600;
    const r = Math.min(1, maxDim / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * r);
    cv.height = Math.round(img.height * r);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.9));
    const base = 'settings/' + key + '-' + U.uid() + '.jpg';
    const bucket = sb.storage.from(C.BUCKET_NAME);
    const { error } = await bucket.upload(base, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (error) throw error;
    return bucket.getPublicUrl(base).data.publicUrl;
  }

  async function onPickSettingImage(input, key) {
    const file = input.files && input.files[0];
    if (!file) return;
    notify('جاري رفع الصورة...');
    try {
      const url = await uploadSettingImage(file, key);
      const { error } = await sb.from('settings').update({ [key]: url }).eq('id', 1);
      if (error) throw error;
      S.settings[key] = url;
      renderSettings();
      notify('تم رفع الصورة ✓', 'success');
    } catch (e) {
      fail(e, 'فشل رفع الصورة');
    }
  }

  async function clearSettingImage(key) {
    if (!confirm('حذف الصورة؟')) return;
    try {
      const { error } = await sb.from('settings').update({ [key]: null }).eq('id', 1);
      if (error) throw error;
      S.settings[key] = null;
      renderSettings();
      notify('تم الحذف ✓', 'success');
    } catch (e) {
      fail(e, 'فشل الحذف');
    }
  }

  const SET_SECTIONS = [
    { id: 'store', icon: '🏪', label: 'المتجر', fields: [
      ['store_name', 'اسم المتجر'],
      ['store_name_full', 'الاسم الكامل'],
      ['phone', 'رقم الواتساب (بصيغة 972...)'],
      ['currency', 'العملة'],
      ['address', 'العنوان']
    ]},
    { id: 'brand', icon: '🎨', label: 'الهوية البصرية', images: [
      ['logo_url', 'الشعار (Logo)', 'يظهر في رأس الموقع والفوتر.'],
      ['cover_url', 'صورة الغلاف (Cover)', 'تظهر في الصفحة الرئيسية.']
    ]},
    { id: 'content', icon: '📝', label: 'المحتوى', fields: [
      ['title', 'العنوان الرئيسي'],
      ['tagline', 'الوصف تحت العنوان'],
      ['announce', 'شريط الإعلان']
    ]},
    { id: 'delivery', icon: '🚚', label: 'مناطق التوصيل', delivery: true },
    { id: 'social', icon: '🔗', label: 'التواصل', fields: [
      ['instagram', 'انستغرام'],
      ['facebook', 'فيسبوك'],
      ['tiktok', 'تيك توك']
    ]},
    { id: 'pixel', icon: '📊', label: 'Meta Pixel', fields: [
      ['pixel_id', 'Pixel ID']
    ]}
  ];

  function syncSettingsFromDom() {
    document.querySelectorAll('[data-set]').forEach(i => {
      S.settings[i.dataset.set] = i.value.trim() || null;
    });
    syncDeliveryFromDom();
  }

  function renderSettings() {
    const s = S.settings || {};
    const current = S.settingsTab || 'store';

    let h = '<div class="settings-tabs">';
    SET_SECTIONS.forEach(sec => {
      h += '<button type="button" class="settings-tab' + (sec.id === current ? ' active' : '') + '" data-stab="' + sec.id + '">' +
        '<span class="st-icon">' + sec.icon + '</span>' +
        '<span class="st-label">' + sec.label + '</span>' +
      '</button>';
    });
    h += '</div>';

    h += '<div class="settings-panel">';
    const sec = SET_SECTIONS.find(x => x.id === current) || SET_SECTIONS[0];

    h += '<div class="settings-panel-head">' +
      '<span class="sph-icon">' + sec.icon + '</span>' +
      '<h3>' + sec.label + '</h3>' +
    '</div>';

    if (sec.fields) {
      sec.fields.forEach(pair => {
        h += '<div class="field"><label>' + pair[1] + '</label>' +
          '<input data-set="' + pair[0] + '" value="' + esc(s[pair[0]] || '') + '"></div>';
      });
    }

    if (sec.images) {
      sec.images.forEach(pair => {
        const key = pair[0];
        const label = pair[1];
        const hint = pair[2] || '';
        const url = s[key] || '';
        h += '<div class="field"><label>' + label + '</label>' +
          '<div class="img-picker">' +
            '<div class="img-preview">' +
              (url ? '<img src="' + esc(url) + '" alt="">' : '<span>🖼️</span>') +
            '</div>' +
            '<div class="img-actions">' +
              (hint ? '<p class="img-hint">' + hint + '</p>' : '') +
              '<div class="img-btns">' +
                '<label class="btn-soft">📤 ' + (url ? 'تغيير الصورة' : 'رفع صورة') +
                  '<input type="file" accept="image/*" hidden data-setimg="' + key + '">' +
                '</label>' +
                (url ? '<button type="button" class="btn-soft danger" data-act="clearimg" data-key="' + key + '">🗑️ حذف</button>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
    }

    if (sec.delivery) {
      h += renderDeliverySection();
    }

    h += '</div>';

    h += '<div class="settings-footer">' +
      '<button type="button" class="btn-primary" id="setSave" data-act="saveset">💾 حفظ الإعدادات</button>' +
    '</div>';

    $('settingsList').innerHTML = h;
  }

  async function saveSettings() {
    syncSettingsFromDom();
const row = { id: 1 };
    const KNOWN = ['store_name','store_name_full','phone','currency','address','logo_url','cover_url','title','tagline','announce','instagram','facebook','tiktok','pixel_id','delivery','pages'];
    KNOWN.forEach(k => { if (k in S.settings) row[k] = S.settings[k]; });
    if (row.phone) row.phone = U.waPhone(row.phone);
    if (S.settingsTab === 'delivery') {
      syncDeliveryFromDom();
      row.delivery = S.settings.delivery;
    }

    const btn = $('setSave');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'جاري الحفظ...';
    }
    try {
      const { error } = await sb.from('settings').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      Object.assign(S.settings, row);
      notify('تم حفظ الإعدادات ✓', 'success');
    } catch (e) {
      fail(e, 'فشل حفظ الإعدادات');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 حفظ الإعدادات';
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     🎯 ربط الأحداث
     ═══════════════════════════════════════════════════════════ */

  function bind() {
    const lf = $('loginForm');
    if (lf) lf.addEventListener('submit', login);
    const lo = $('logoutBtn');
    if (lo) lo.addEventListener('click', logout);

    const tabs = document.querySelector('.admin-tabs');
    if (tabs) {
      tabs.addEventListener('click', e => {
        const t = e.target.closest('.tab');
        if (t) goTab(t.dataset.tab);
      });
    }

    const ofb = $('ordersFilterBar');
    if (ofb) {
      ofb.addEventListener('click', e => {
        const b = e.target.closest('[data-ostatus]');
        if (!b) return;
        S.orderFilter = b.dataset.ostatus;
        ofb.querySelectorAll('.ord-filter-btn').forEach(x => x.classList.toggle('active', x === b));
        renderOrders();
      });
    }

   const ol = $('ordersList');
    if (ol) {
      ol.addEventListener('click', e => {
        const markBtn = e.target.closest('[data-marktest]');
        if (markBtn) {
          e.stopPropagation();
          if (markBtn.disabled) return;
          markBtn.disabled = true;
          markOrderAsTest(markBtn.dataset.marktest).finally(() => {
            if (document.body.contains(markBtn)) markBtn.disabled = false;
          });
          return;
        }
        const card = e.target.closest('.order-card');
        if (card) openOrderForm(card.dataset.orderId);
      });
    }

    ['returnsList', 'exchangesList', 'orderModalBody'].forEach(id => {
      const box = $(id);
      if (box) box.addEventListener('click', e => {
        const c = e.target.closest('[data-op-id]');
        if (c) openOpDetail(c.dataset.opId);
      });
    });

    const spm = $('salePickModal');
    if (spm) {
      spm.addEventListener('input', e => {
        if (e.target.id === 'spQ' && S.pick) { S.pick.q = e.target.value; renderSalePickerList(); }
      });
      spm.addEventListener('click', e => {
        const c = e.target.closest('[data-pick-sale]');
        if (c && S.pick) { const k = S.pick.kind; closeSalePick(); openOp(k, c.dataset.pickSale); }
      });
    }

    const odm = $('opDetailModal');
    if (odm) {
      odm.addEventListener('click', e => {
        const b = e.target.closest('[data-od]');
        if (!b) return;
        if (b.dataset.od === 'stock') applyPendingOp();
        else if (b.dataset.od === 'void') voidOp();
        else if (b.dataset.od === 'order') {
          const r = S.ops.find(x => x.id === S.opView);
          const sale = r ? saleById(r.sale_id) : null;
          const lead = sale ? S.orders.find(o => o.ref === sale.ref) : null;
          closeOpDetail();
          if (lead) openOrderForm(lead.id);
        }
      });
    }

    const pl = $('productsList');
    if (pl) {
      pl.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const id = b.closest('.product-card').dataset.id;
        if (b.dataset.act === 'edit') openProductForm(id);
        else if (b.dataset.act === 'del') deleteProduct(id);
      });
    }

    const cl = $('categoriesList');
    if (cl) {
      cl.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const id = b.closest('.category-card').dataset.id;
        if (b.dataset.act === 'editcat') openCategoryForm(id);
        else if (b.dataset.act === 'delcat') deleteCategory(id);
      });
    }
// معالج حذف المصاريف ورأس المال
    const finList1 = $('expensesList');
    if (finList1) {
      finList1.addEventListener('click', e => {
        const btn = e.target.closest('[data-del-expense]');
        if (btn) {
          e.stopPropagation();
          deleteExpense(btn.dataset.delExpense);
        }
      });
    }
    const finList2 = $('capitalList');
    if (finList2) {
      finList2.addEventListener('click', e => {
        const btn = e.target.closest('[data-del-capital]');
        if (btn) {
          e.stopPropagation();
          deleteCapital(btn.dataset.delCapital);
        }
      });
    }

    const sl = $('settingsList');
    if (sl) {
      sl.addEventListener('click', e => {
        const tab = e.target.closest('[data-stab]');
        if (tab) {
          syncSettingsFromDom();
          S.settingsTab = tab.dataset.stab;
          renderSettings();
          return;
        }
        if (e.target.closest('[data-act="saveset"]')) return saveSettings();
        const clearBtn = e.target.closest('[data-act="clearimg"]');
        if (clearBtn) return clearSettingImage(clearBtn.dataset.key);

        // التوصيل: إضافة قسم
        if (e.target.closest('[data-act="zoneadd"]')) {
          syncDeliveryFromDom();
          const zones = getZones();
          zones.push({ id: 'zone_' + Date.now(), name: '', default_price: '', cities: [] });
          setZones(zones);
          renderSettings();
          return;
        }

        // التوصيل: حذف قسم
        const zoneDel = e.target.closest('[data-act="zonedel"]');
        if (zoneDel) {
          if (!confirm('حذف هذا القسم وكل مدنه؟')) return;
          syncDeliveryFromDom();
          const zi = parseInt(zoneDel.dataset.zoneIdx, 10);
          const zones = getZones();
          zones.splice(zi, 1);
          setZones(zones);
          renderSettings();
          return;
        }

        // التوصيل: إضافة مدينة
        const cityAdd = e.target.closest('[data-act="cityadd"]');
        if (cityAdd) {
          syncDeliveryFromDom();
          const zi = parseInt(cityAdd.dataset.zoneIdx, 10);
          const zones = getZones();
          if (!zones[zi].cities) zones[zi].cities = [];
          zones[zi].cities.push({ name: '', price: '' });
          setZones(zones);
          renderSettings();
          setTimeout(() => {
            const inp = document.querySelector('.zone-card[data-zone-idx="' + zi + '"] .city-name-inp:last-of-type');
            if (inp) inp.focus();
          }, 60);
          return;
        }

        // التوصيل: حذف مدينة
        const cityDel = e.target.closest('[data-act="citydel"]');
        if (cityDel) {
          syncDeliveryFromDom();
          const zi = parseInt(cityDel.dataset.zoneIdx, 10);
          const ci = parseInt(cityDel.dataset.cityIdx, 10);
          const zones = getZones();
          zones[zi].cities.splice(ci, 1);
          setZones(zones);
          renderSettings();
          return;
        }

        // التوصيل: قائمة جاهزة
        const cityPreset = e.target.closest('[data-act="citypreset"]');
        if (cityPreset) {
          openCityPresetPicker(parseInt(cityPreset.dataset.zoneIdx, 10));
          return;
        }
      });

      sl.addEventListener('change', e => {
        const inp = e.target;
        if (inp.dataset && inp.dataset.setimg) {
          onPickSettingImage(inp, inp.dataset.setimg);
          return;
        }
        if (inp.dataset && inp.dataset.zoneFile !== undefined) {
          handleCitiesFile(inp, parseInt(inp.dataset.zoneFile, 10));
          return;
        }
      });
    }

    const pm = $('productModalBody');
    if (pm) {
      pm.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b || !S.form) return;
        const a = b.dataset.act;
        if (a === 'cancel') return closeProductForm();
        if (a === 'save') return saveProduct();
        syncFormFromDom();

        if (a === 'addcol') {
          S.form.colors.push({ key: U.uid(), id: null, name: '', gender: '', image_url: '', thumb_url: '' });
        } else if (a === 'delcol') {
          if (S.form.colors.length === 1) return notify('لازم لون واحد على الأقل', 'error');
          S.form.colors = S.form.colors.filter(c => c.key !== b.dataset.key);
        } else if (a === 'addsize') {
          const v = prompt('اكتب اسم المقاس (مثال: 6 شهور)');
          if (!v) return;
          const v2 = v.trim();
          if (!v2) return;
          if (S.form.sizes.includes(v2)) return notify('المقاس موجود', 'error');
          S.form.sizes.push(v2);
        } else if (a === 'copysizes') {
          const key = b.dataset.key;
          const idx = S.form.colors.findIndex(c => c.key === key);
          if (idx > 0) {
            const prev = S.form.colors[idx - 1];
            const prevKey = prev.id || prev.key;
            S.form.sizes.forEach(z => {
              const k = key + '|' + z;
              const pk = prevKey + '|' + z;
              if (S.form.stock[pk] != null) S.form.stock[k] = S.form.stock[pk];
            });
            notify('تم نسخ المقاسات والكميات ✓', 'success');
          }
        } else if (a === 'delsize') {
          S.form.sizes = S.form.sizes.filter(z => z !== b.dataset.size);
        }
        renderProductForm();
      });

      pm.addEventListener('change', e => {
        const t = e.target;
        if (t.id === 'pfMainImg') {
          onPickImage(t, u => {
            S.form.image_url = u.image_url;
            S.form.thumb_url = u.thumb_url;
          });
        } else if (t.id === 'pfMainImgUrl') {
          S.form.image_url = t.value.trim();
          S.form.thumb_url = t.value.trim();
        } else if (t.dataset && t.dataset.colimg) {
          const key = t.dataset.colimg;
          onPickImage(t, u => {
            const c = S.form.colors.find(x => x.key === key);
            if (c) {
              c.image_url = u.image_url;
              c.thumb_url = u.thumb_url;
            }
          });
        }
      });
    }

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const odm2 = $('opDetailModal');
      const spm2 = $('salePickModal');
      const pm2 = $('productModal');
      const cm = $('categoryModal');
      const om = $('orderModal');
      const prm = $('presetModal');
      const rtm = $('returnModal');
      const exm = $('exchangeModal');
      const finModal = $('financeModal');
      if (odm2 && odm2.classList.contains('open')) closeOpDetail();
      else if (spm2 && spm2.classList.contains('open')) closeSalePick();
      else if (pm2 && pm2.classList.contains('open')) closeProductForm();
      else if (cm && cm.classList.contains('open')) closeCategoryForm();
      else if (rtm && rtm.classList.contains('open')) closeReturnForm();
      else if (finModal && finModal.classList.contains('open')) closeFinanceModal();
      else if (exm && exm.classList.contains('open')) closeExchangeForm();
      else if (om && om.classList.contains('open')) closeOrderForm();
      else if (prm && prm.classList.contains('open')) {
        prm.classList.remove('open');
        document.body.style.overflow = '';
      }
    });

    sb.auth.onAuthStateChange(ev => {
      if (ev === 'SIGNED_OUT') showLogin();
    });
  }

  /* ═══════════════════════════════════════════════════════════
     🚀 التهيئة
     ═══════════════════════════════════════════════════════════ */

  try {
    bind();
    checkSession();
  } catch (e) {
    console.error('Admin init failed:', e);
  }

  /* ═══════════════════════════════════════════════════════════
     📤 التصدير
     ═══════════════════════════════════════════════════════════ */

return {
    openProductForm: openProductForm,
    closeProductForm: closeProductForm,
    openCategoryForm: openCategoryForm,
    closeCategoryForm: closeCategoryForm,
    saveCategory: saveCategory,
    filterProducts: filterProducts,
    filterProductsDebounced: filterProductsDebounced,
    goTab: goTab,
    reloadOrders: reloadOrders,
    closeOrderForm: closeOrderForm,
    reloadMeta: reloadMeta,
    testMetaEvent: testMetaEvent,
    deleteTestOrders: deleteTestOrders,
    openReturnForm: openReturnForm,
    closeReturnForm: closeReturnForm,
    openExchangeForm: openExchangeForm,
    closeExchangeForm: closeExchangeForm,
    openSalePicker: openSalePicker,
    closeSalePick: closeSalePick,
    closeOpDetail: closeOpDetail,
    openExpenseForm: openExpenseForm,
    openCapitalForm: openCapitalForm,
    closeFinanceModal: closeFinanceModal,
    saveExpense: saveExpense,
    saveCapital: saveCapital,
    reloadOps: reloadOps
  };
})();