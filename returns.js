/* ===================================================================
   الإرجاع والاستبدال — يُحمَّل من loadAdminUI() بعد واجهة الإدارة
   يعتمد على: returns.sql + دوال index.html (DATA, sb, ST, reload, persist, flushSync …)
   =================================================================== */
(function () {
  const RET_DAYS = () => Number(DATA.settings._returnDays) || 3;
  const REASONS = ['المقاس غير مناسب', 'عيب في المنتج', 'غير مطابق للمطلوب', 'الزبون غير رأيه', 'أخرى'];
  const STATE = { partial: '↩️ مرتجع جزئي', exchanged: '🔄 تم استبدال', returned: '↩️ مرتجع كامل' };
  const ERR = {
    not_admin: 'ليست لديك صلاحية', sale_not_found: 'البيع غير موجود', sale_closed: 'هذا البيع ملغى أو مرتجع بالكامل',
    outside_window: 'خارج مدة الإرجاع', nothing_returned: 'اختر صنفًا للإرجاع', qty_exceeds_available: 'الكمية أكبر من المتبقي عند الزبون (ربما أُرجع جزء منها سابقًا)',
    exchange_needs_items: 'اختر الصنف البديل', bad_amount: 'المبلغ غير صحيح', refund_exceeds_paid: 'مبلغ الاسترجاع أكبر مما دفعه الزبون',
    bad_qty: 'كمية غير صحيحة', inconsistent_quantities: 'لا يمكن التراجع: عمليات لاحقة تعتمد على هذه العملية، تراجع عنها أولًا',
    already_voided: 'تم التراجع عنها مسبقًا', return_not_found: 'العملية غير موجودة'
  };
  const RT = { lines: [], sales: [], q: '', sale: null, mode: 'return', giv: [], busy: false, pend: [], touched: false };
  const cur = () => esc(DATA.settings.currency || '');
  const money = n => Math.round((Number(n) || 0) * 100) / 100;
  const refOf = s => s.ref || s.order_ref || '';
  const dead = s => ['cancelled', 'returned'].includes(s.status);
  const norm = i => ({ pid: i.pid || i.product_id || '', code: i.code || '', name: i.name || '', color: i.color || '', size: i.size || '', qty: parseInt(i.qty, 10) || 0, price: Number(i.price) || 0 });
    const netTotal = s => Number(s.net_total != null ? s.net_total : s.total) || 0;
  const label = l => esc(l.name) + (l.color ? ' · ' + esc(l.color) : '') + (l.size ? ' · ' + esc(l.size) : '');
  const errMsg = e => { const m = (e && e.message) || String(e); const k = Object.keys(ERR).find(x => m.includes(x)); return k ? ERR[k] : m; };
  const body = () => $('rt_body'), acts = h => { $('rt_actions').innerHTML = h; };
  const closeBtn = '<button type="button" class="btn" onclick="closeModal(\'retModal\')">إغلاق</button>';

  /* ---------- تحميل ---------- */
  async function load() {
    try {
      const { data, error } = await sb.from('sales').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error; RT.sales = data || [];
      const ids = RT.sales.map(s => s.id), items = {};
      for (let i = 0; i < ids.length; i += 100) {
        const r = await sb.from('sale_items').select('*').in('sale_id', ids.slice(i, i + 100)).order('position');
        if (r.error) throw r.error;
        (r.data || []).forEach(x => (items[x.sale_id] = items[x.sale_id] || []).push({ pid: x.product_id, code: x.product_code, name: x.product_name, color: x.color_name, size: x.size, qty: x.qty, price: x.unit_price }));
      }
      RT.sales.forEach(s => { s.items = items[s.id] || []; });
    } catch (e) { RT.sales = []; toast('تعذّر تحميل المبيعات: ' + errMsg(e)); }
  }
  async function pending() {
    try {
      const { data, error } = await sb.from('sale_returns').select('*').eq('stock_applied', false);
      if (error) throw error; RT.pend = data || [];
    } catch (e) { RT.pend = []; }
    return RT.pend;
  }

  /* ---------- المخزون ---------- */
  async function applyStock(deltas) {
    deltas = deltas || []; if (!deltas.length) return true;
    const todo = [], skipped = [];
    for (const d of deltas) {
      const p = DATA.products.find(x => x.id === d.pid), c = d.color || '', z = d.size || '';
      if (!p || !sizeOk(p, c, z)) { skipped.push(d); continue; }
      const k = ik(c, z), have = Math.max(0, parseInt((p.inv || {})[k], 10) || 0);
      if (have + d.qty < 0) throw new Error('المخزون لا يكفي لتطبيق التعديل على «' + p.name + '»');
      todo.push([p, k, have + d.qty]);
    }
    todo.forEach(([p, k, v]) => { p.inv = p.inv || {}; p.inv[k] = v; });
    if (todo.length) { persist(); renderProducts(); await flushSync(); }
    if (skipped.length) toast('⚠️ ' + skipped.length + ' صنف لم يعد موجودًا في المنتجات — لم يُعدَّل مخزونه');
    return !isUnsaved();
  }
  async function applyAndMark(id, deltas) {
    try {
      if (!(await applyStock(deltas))) throw new Error('تعذّر حفظ المخزون');
      const { error } = await sb.rpc('admin_mark_return_stock', { p_id: id }); if (error) throw error;
      return true;
    } catch (e) { toast('تعذّر تحديث المخزون: ' + errMsg(e) + ' — سيبقى تنبيه لتطبيقه'); return false; }
  }
  async function applyPending() {
    if (isUnsaved()) await flushSync();
    await reload();
    let ok = 0;
    for (const r of RT.pend) if (await applyAndMark(r.id, r.stock_deltas)) ok++;
    await pending(); toast(ok ? 'تم تحديث المخزون ✓' : 'لم يتم التحديث'); renderPend(); renderRows();
  }
  function renderPend() {
    const b = $('rt_pend'); if (!b) return;
    b.innerHTML = RT.pend.length ? '<div class="cart-note" style="border:1px solid #c8102e;background:#fff5f5">⚠️ ' + RT.pend.length + ' عملية لم يُحدَّث مخزونها بعد. <button type="button" class="btn" data-rt="applypend">تطبيق الآن</button></div>' : '';
  }

  /* ---------- القائمة ---------- */
  window.openReturns = async function () {
    RT.sale = null; RT.q = '';
    $('rt_title').textContent = '🔁 إرجاع / استبدال';
    body().innerHTML = '<div class="cart-note">جاري التحميل…</div>'; acts(closeBtn); openModal('retModal');
    await Promise.all([load(), pending()]); showList();
  };
  function showList() {
    RT.sale = null; $('rt_title').textContent = '🔁 إرجاع / استبدال'; acts(closeBtn);
    body().innerHTML = '<div id="rt_pend"></div><div class="field"><input type="text" id="rt_q" placeholder="🔎 ابحث بالاسم أو الهاتف أو رقم الطلب" value="' + esc(RT.q) + '"></div><div class="cart-note">اختر البيع الذي يريد الزبون إرجاعه أو استبداله.</div><div id="rt_list"></div>';
    renderPend(); renderRows();
  }
  function renderRows() {
    const box = $('rt_list'); if (!box) return;
    const q = RT.q.trim().toLowerCase();
    const L = RT.sales.filter(s => s.status !== 'cancelled' && (!q || (refOf(s) + ' ' + (s.customer_name || '') + ' ' + (s.customer_phone || '')).toLowerCase().includes(q))).slice(0, 40);
    box.innerHTML = L.length ? L.map(s => {
      const st = STATE[s.return_state] || '', d = dead(s), id = esc(String(s.id));
      return '<div class="ord"><div class="oh"><span><b>' + esc(s.customer_name || '—') + '</b> · ' + esc(s.customer_phone || '') + (st ? ' <span class="newb">' + st + '</span>' : '') + '</span><span>' + new Date(s.created_at).toLocaleDateString('ar-EG') + '</span></div>' +
        '<div class="ol">' + (refOf(s) ? esc(refOf(s)) + '<br>' : '') + (s.items || []).map(i => '• ' + esc(i.name || '') + (i.color ? ' · ' + esc(i.color) : '') + (i.size ? ' · ' + esc(i.size) : '') + ' × ' + (parseInt(i.qty, 10) || 1)).join('<br>') + '</div>' +
        '<div class="ot"><span>المبلغ الصافي</span><span>' + cur() + fmt(netTotal(s)) + (s.net_total != null ? ' <small style="color:#888">(الأصل ' + fmt(s.total) + ')</small>' : '') + '</span></div>' +
        '<div class="oa">' + (d ? '' : '<button type="button" class="btn" data-rt="return" data-id="' + id + '">↩️ إرجاع</button><button type="button" class="btn" data-rt="exchange" data-id="' + id + '">🔄 استبدال</button>') +
        (s.return_state && s.return_state !== 'none' ? '<button type="button" class="btn" data-rt="hist" data-id="' + id + '">📋 السجل</button>' : '') + '</div></div>';
    }).join('') : '<div class="cart-empty">لا توجد مبيعات مطابقة.</div>';
  }

  /* ---------- نموذج الإرجاع / الاستبدال ---------- */
  async function showForm(id, mode) {
    const s = RT.sales.find(x => String(x.id) === String(id)); if (!s) return;
    body().innerHTML = '<div class="cart-note">جاري التحميل…</div>';
    try {
      const { data, error } = await sb.rpc('admin_net_lines', { p_sale_id: String(s.id) }); if (error) throw error;
      RT.lines = (data || []).map(norm).filter(i => i.qty > 0);
    } catch (e) { toast('تعذّر تحميل أصناف البيع: ' + errMsg(e)); return showList(); }
    if (!RT.lines.length) { toast('لا توجد أصناف متبقية في هذا البيع'); return showList(); }
    RT.sale = s; RT.mode = mode; RT.giv = []; RT.touched = false;
    const L = RT.lines, days = (Date.now() - new Date(s.created_at).getTime()) / 864e5, over = days > RET_DAYS();
    $('rt_title').textContent = mode === 'return' ? '↩️ إرجاع' : '🔄 استبدال';
    let h = '<div class="cart-note"><b>' + esc(s.customer_name || '—') + '</b> · ' + esc(s.customer_phone || '') + '<br>' + esc(refOf(s)) + ' · قبل ' + Math.floor(days) + ' يوم · المدفوع ' + cur() + fmt(netTotal(s)) + '</div>';
    if (over) h += '<div class="cart-note" style="border:1px solid #c8102e;background:#fff5f5">⚠️ تجاوز مدة الإرجاع (' + RET_DAYS() + ' أيام). <label><input type="checkbox" id="rt_over"> أوافق على الإرجاع استثناءً</label></div>';
    h += '<b>1) ما الذي أرجعه الزبون؟</b>' + L.map((l, i) =>
      '<div style="padding:8px 0;border-bottom:1px solid #eee"><div>' + label(l) + ' <small style="color:#888">(المتبقي ' + l.qty + ' · ' + cur() + fmt(l.price) + ')</small></div>' +
      '<div class="row" style="align-items:center;margin-top:4px"><div class="field" style="max-width:90px;margin:0"><input type="number" class="rt-q" data-i="' + i + '" min="0" max="' + l.qty + '" value="0" inputmode="numeric" style="width:100%;padding:8px"></div>' +
      '<label style="font-size:14px"><input type="checkbox" class="rt-r" data-i="' + i + '" checked> سليم — يرجع للمخزون</label></div></div>').join('');
    if (mode === 'exchange') {
      h += '<hr class="sep"><b>2) الصنف البديل</b><div class="field" style="margin-top:8px"><input type="text" id="rt_pq" placeholder="ابحث عن منتج"></div>' +
        '<div class="field"><select id="rt_p" style="width:100%;padding:10px;border:1px solid #ddd;font-family:inherit"></select></div>' +
        '<div class="row"><div class="field"><select id="rt_c" style="width:100%;padding:10px;border:1px solid #ddd;font-family:inherit"></select></div><div class="field"><select id="rt_z" style="width:100%;padding:10px;border:1px solid #ddd;font-family:inherit"></select></div><div class="field" style="max-width:80px"><input type="number" id="rt_n" min="1" value="1" inputmode="numeric" style="width:100%;padding:10px"></div></div>' +
        '<button type="button" class="btn" data-rt="addgiv">+ إضافة البديل</button><div id="rt_giv" class="cart-note"></div>';
    }
    h += '<hr class="sep"><b>' + (mode === 'exchange' ? '3' : '2') + ') التفاصيل</b><div class="row" style="margin-top:8px"><div class="field"><label for="rt_reason">السبب</label><select id="rt_reason" style="width:100%;padding:10px;border:1px solid #ddd;font-family:inherit">' + REASONS.map(r => '<option>' + r + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="rt_method">طريقة الدفع/الاسترجاع</label><select id="rt_method" style="width:100%;padding:10px;border:1px solid #ddd;font-family:inherit"><option>نقدًا</option><option>تحويل</option><option>أخرى</option></select></div></div>' +
      '<div class="field"><label for="rt_note">ملاحظة (اختياري)</label><input type="text" id="rt_note" maxlength="300"></div>' +
      '<div class="field"><label for="rt_amt" id="rt_amtl">المبلغ</label><input type="number" id="rt_amt" min="0" step="any" inputmode="decimal"></div><div id="rt_sum" class="cart-note"></div>';
    body().innerHTML = h;
    acts('<button type="button" class="btn green" id="rt_go" data-rt="submit">✅ تأكيد</button><button type="button" class="btn" data-rt="back">رجوع</button>');
    if (mode === 'exchange') { fillProducts(); }
    calc();
  }

  /* اختيار الصنف البديل */
  function fillProducts() {
    const q = ($('rt_pq').value || '').trim().toLowerCase(), keep = $('rt_p').value;
    const list = DATA.products.filter(p => !q || (p.name + ' ' + (p.code || '')).toLowerCase().includes(q));
    $('rt_p').innerHTML = '<option value="">— اختر المنتج —</option>' + list.map(p => '<option value="' + esc(p.id) + '">' + esc((p.code ? p.code + ' · ' : '') + p.name) + ' (' + fmt(p.price) + ')</option>').join('');
    if (keep && list.some(p => p.id === keep)) $('rt_p').value = keep;
    fillColors();
  }
  function fillColors() {
    const p = DATA.products.find(x => x.id === $('rt_p').value);
    $('rt_c').innerHTML = p ? colorsOf(p).map(c => '<option value="' + esc(c) + '">' + esc(c || 'بدون لون') + '</option>').join('') : '';
    fillSizes();
  }
  function fillSizes() {
    const p = DATA.products.find(x => x.id === $('rt_p').value), c = $('rt_c').value;
    $('rt_z').innerHTML = p ? sizesList(p).filter(z => sizeOk(p, c, z)).map(z => { const q = qtyOf(p, c, z); return '<option value="' + esc(z) + '"' + (q <= 0 ? ' disabled' : '') + '>' + esc(z || 'بدون مقاس') + (p.track ? ' (متبقي ' + q + ')' : '') + '</option>'; }).join('') : '';
  }
  function addGiv() {
    const p = DATA.products.find(x => x.id === $('rt_p').value), c = $('rt_c').value, z = $('rt_z').value, n = parseInt($('rt_n').value, 10);
    if (!p) return toast('اختر المنتج'); if (!(n > 0)) return toast('اكتب كمية صحيحة');
    const have = RT.giv.filter(g => g.pid === p.id && g.color === c && g.size === z).reduce((a, g) => a + g.qty, 0);
    if (p.track && n + have > qtyOf(p, c, z)) return toast('المتوفر ' + Math.max(0, qtyOf(p, c, z) - have) + ' فقط');
    const ex = RT.giv.find(g => g.pid === p.id && g.color === c && g.size === z);
    if (ex) ex.qty += n; else RT.giv.push({ pid: p.id, code: p.code || '', name: p.name, color: c, size: z, qty: n, price: Number(p.price) || 0 });
    $('rt_n').value = 1; RT.touched = false; calc();
  }

  /* الحساب: المبلغ المرتجع يتناسب مع الخصم (المدفوع ÷ مجموع الأسعار) */
  function collectReturned() {
    const L = RT.lines, out = [];
    document.querySelectorAll('.rt-q').forEach(inp => {
      const i = +inp.dataset.i, n = Math.min(L[i].qty, Math.max(0, parseInt(inp.value, 10) || 0));
      if (n > 0) out.push({ ...L[i], qty: n, restock: document.querySelector('.rt-r[data-i="' + i + '"]').checked });
    });
    return out;
  }
  function calc() {
    if (!RT.sale) return;
    const L = RT.lines, sum = L.reduce((a, l) => a + l.price * l.qty, 0), f = sum > 0 ? Math.min(1, netTotal(RT.sale) / sum) : 1;
    const ret = collectReturned(), retVal = money(ret.reduce((a, l) => a + l.price * l.qty * f, 0)), givVal = money(RT.giv.reduce((a, g) => a + g.price * g.qty, 0));
    const diff = RT.mode === 'return' ? -retVal : money(givVal - retVal);
    const amt = $('rt_amt'); if (!RT.touched) amt.value = Math.abs(diff) || '';
    $('rt_amtl').textContent = diff > 0 ? 'يدفعها الزبون (فرق السعر)' : diff < 0 ? 'تُرجَّع للزبون' : 'لا فرق في السعر';
    amt.disabled = diff === 0; if (diff === 0) amt.value = 0;
    const giv = $('rt_giv'); if (giv) giv.innerHTML = RT.giv.length ? RT.giv.map((g, i) => '<div style="display:flex;justify-content:space-between;padding:4px 0"><span>' + label(g) + ' × ' + g.qty + '</span><span>' + cur() + fmt(g.price * g.qty) + ' <button type="button" class="btn" style="padding:2px 8px" data-rt="delgiv" data-i="' + i + '">✕</button></span></div>').join('') : 'لم يُضف بديل بعد.';
    $('rt_sum').innerHTML = 'قيمة المرتجع: <b>' + cur() + fmt(retVal) + '</b>' + (RT.mode === 'exchange' ? ' · قيمة البديل: <b>' + cur() + fmt(givVal) + '</b>' : '') + (f < 1 ? '<br><small>تم احتساب الخصم على المرتجع تلقائيًا</small>' : '');
    RT.calc = { diff, retVal, givVal };
  }

  /* ---------- التنفيذ ---------- */
  async function submit() {
    if (RT.busy || ST.busy) return;
    const s = RT.sale, mode = RT.mode, ret = collectReturned(), c = RT.calc || { diff: 0 };
    if (!ret.length) return toast('حدّد كمية الصنف المرتجع');
    if (mode === 'exchange' && !RT.giv.length) return toast('أضف الصنف البديل');
    const ov = $('rt_over'); if (ov && !ov.checked) return toast('تجاوز مدة الإرجاع — وافق على الاستثناء أو ألغِ');
    const amt = money(parseFloat($('rt_amt').value) || 0);
    if (c.diff !== 0 && !(amt >= 0)) return toast('اكتب المبلغ');
    const refund = c.diff < 0 ? amt : 0, collect = c.diff > 0 ? amt : 0;
    if (refund > netTotal(s)) return toast('مبلغ الاسترجاع أكبر مما دفعه الزبون');
    const sum = ret.map(l => '↩️ ' + l.name + ' ' + l.color + ' ' + l.size + ' × ' + l.qty + (l.restock ? '' : ' (تالف — لن يرجع للمخزون)')).join('\n') +
      (RT.giv.length ? '\n' + RT.giv.map(g => '🔄 ' + g.name + ' ' + g.color + ' ' + g.size + ' × ' + g.qty).join('\n') : '') +
      '\n\n' + (refund ? 'تُرجَّع للزبون: ' + DATA.settings.currency + fmt(refund) : collect ? 'يدفع الزبون: ' + DATA.settings.currency + fmt(collect) : 'بدون فرق مالي');
    if (!confirm('تأكيد العملية؟\n\n' + sum)) return;
    RT.busy = true; $('rt_go').disabled = true;
    try {
      if (isUnsaved()) await flushSync();
      await reload();                                    // مخزون حديث قبل التحقق
      const need = {}; RT.giv.forEach(g => { const k = g.pid + '|' + ik(g.color, g.size); need[k] = (need[k] || 0) + g.qty; });
      for (const g of RT.giv) {
        const p = DATA.products.find(x => x.id === g.pid);
        if (!p) throw new Error('المنتج «' + g.name + '» لم يعد موجودًا');
        if (p.track && (!sizeOk(p, g.color, g.size) || qtyOf(p, g.color, g.size) < need[g.pid + '|' + ik(g.color, g.size)])) throw new Error('البديل غير متوفر بالكمية المطلوبة: ' + g.name + ' ' + g.color + ' ' + g.size);
      }
      const { data, error } = await sb.rpc('admin_process_return', {
        p_sale_id: String(s.id), p_kind: mode,
        p_returned: ret.map(l => ({ pid: l.pid, code: l.code, name: l.name, color: l.color, size: l.size, qty: l.qty, price: l.price, restock: l.restock })),
        p_given: RT.giv.map(g => ({ pid: g.pid, code: g.code, name: g.name, color: g.color, size: g.size, qty: g.qty, price: g.price })),
        p_refund: refund, p_collect: collect, p_reason: $('rt_reason').value, p_note: $('rt_note').value.trim(), p_method: $('rt_method').value,
        p_days: RET_DAYS(), p_override: !!(ov && ov.checked)
      });
      if (error) throw error;
      const okStock = await applyAndMark(data.id, data.deltas);
      await Promise.all([load(), pending()]);
      try { if ($('saleModal').classList.contains('open')) renderSale(); } catch (e) {}
      done(s, mode, ret, RT.giv.slice(), refund, collect, okStock, data.state);
    } catch (e) { toast('تعذّرت العملية: ' + errMsg(e)); console.warn(e); }
    RT.busy = false; const b = $('rt_go'); if (b) b.disabled = false;
  }
  function done(s, mode, ret, giv, refund, collect, okStock, state) {
    const cu = DATA.settings.currency, ph = String(s.customer_phone || '').replace(/\D/g, '');
    const msg = 'مرحبًا ' + (s.customer_name || '') + '،\n' + (mode === 'return' ? 'تم استلام مرتجع طلبك' : 'تم استلام طلب الاستبدال') + (refOf(s) ? ' ' + refOf(s) : '') + ':\n' +
      ret.map(l => '↩️ ' + l.name + (l.color ? ' ' + l.color : '') + (l.size ? ' ' + l.size : '') + ' × ' + l.qty).join('\n') +
      (giv.length ? '\n' + giv.map(g => '🔄 ' + g.name + (g.color ? ' ' + g.color : '') + (g.size ? ' ' + g.size : '') + ' × ' + g.qty).join('\n') : '') +
      '\n' + (refund ? 'المبلغ المسترجع: ' + cu + fmt(refund) : collect ? 'فرق السعر المطلوب: ' + cu + fmt(collect) : 'بدون فرق في السعر') + '\nشكرًا لك 🌸';
    $('rt_title').textContent = '✅ تمت العملية';
    body().innerHTML = '<div class="cart-note"><b>' + (STATE[state] || 'تم') + '</b><br>' + (refund ? 'رجّع للزبون: ' + esc(cu) + fmt(refund) : collect ? 'اقبض من الزبون: ' + esc(cu) + fmt(collect) : 'لا فرق مالي') + '</div>' +
      (okStock ? '<div class="cart-note">✔ تم تحديث المخزون والأرباح وبيانات الزبون.</div>' : '<div class="cart-note" style="border:1px solid #c8102e">⚠️ سُجّلت العملية لكن لم يُحدَّث المخزون — سيظهر تنبيه لتطبيقه.</div>');
    acts((ph ? '<a class="btn green" target="_blank" rel="noopener" href="https://wa.me/' + ph + '?text=' + encodeURIComponent(msg) + '">💬 أرسل تأكيدًا للزبون</a>' : '') + '<button type="button" class="btn" data-rt="back">عمليات أخرى</button>' + closeBtn);
  }

  /* ---------- السجل والتراجع ---------- */
  async function hist(id) {
    const s = RT.sales.find(x => String(x.id) === String(id)); if (!s) return;
    $('rt_title').textContent = '📋 سجل ' + (s.customer_name || ''); acts('<button type="button" class="btn" data-rt="back">رجوع</button>');
    body().innerHTML = '<div class="cart-note">جاري التحميل…</div>';
    const { data, error } = await sb.from('sale_returns').select('*').eq('sale_id', String(id)).order('created_at', { ascending: false });
    if (error) { body().innerHTML = '<div class="cart-empty">تعذّر التحميل</div>'; return; }
    const lst = x => (x || []).map(l => esc(l.name || '') + (l.color ? ' ' + esc(l.color) : '') + (l.size ? ' ' + esc(l.size) : '') + ' ×' + l.qty).join('، ');
    body().innerHTML = (data || []).map(r => '<div class="ord" style="' + (r.voided ? 'opacity:.55' : '') + '"><div class="oh"><span><b>' + (r.kind === 'return' ? '↩️ إرجاع' : '🔄 استبدال') + '</b>' + (r.voided ? ' <span class="newb">ملغاة</span>' : '') + '</span><span>' + new Date(r.created_at).toLocaleString('ar-EG') + '</span></div>' +
      '<div class="ol">↩️ ' + lst(r.returned) + (r.given && r.given.length ? '<br>🔄 ' + lst(r.given) : '') + '<br><small>' + esc(r.reason || '') + (r.note ? ' · ' + esc(r.note) : '') + '</small></div>' +
      '<div class="ot"><span>' + (r.refund > 0 ? 'رُجّع للزبون' : r.collect > 0 ? 'قُبض من الزبون' : 'بدون فرق') + '</span><span>' + cur() + fmt(r.refund || r.collect || 0) + '</span></div>' +
      (r.voided ? '' : '<div class="oa"><button type="button" class="btn danger" data-rt="void" data-id="' + esc(r.id) + '" data-sale="' + esc(id) + '">↩️ تراجع عن هذه العملية</button></div>') + '</div>').join('') || '<div class="cart-empty">لا توجد عمليات.</div>';
  }
  async function voidRet(id, saleId) {
    if (RT.busy || ST.busy) return;
    if (!confirm('التراجع عن العملية؟\n\nسيُعاد حساب البيع والأرباح وبيانات الزبون، وسيُعكس تغيّر المخزون.')) return;
    RT.busy = true;
    try {
      if (isUnsaved()) await flushSync();
      await reload();
      const { data, error } = await sb.rpc('admin_void_return', { p_id: id }); if (error) throw error;
      const ok = await applyAndMark(id, data.deltas);
      await Promise.all([load(), pending()]);
      toast(ok ? 'تم التراجع ✓' : 'تم التراجع لكن المخزون بانتظار التطبيق');
      await hist(saleId);
    } catch (e) { toast('تعذّر التراجع: ' + errMsg(e)); }
    RT.busy = false;
  }

  /* ---------- الأحداث ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rt]'); if (!b || !b.closest('#retModal')) return;
    const a = b.dataset.rt;
    if (a === 'return' || a === 'exchange') showForm(b.dataset.id, a);
    else if (a === 'hist') hist(b.dataset.id);
    else if (a === 'back') showList();
    else if (a === 'addgiv') addGiv();
    else if (a === 'delgiv') { RT.giv.splice(+b.dataset.i, 1); RT.touched = false; calc(); }
    else if (a === 'submit') submit();
    else if (a === 'void') voidRet(b.dataset.id, b.dataset.sale);
    else if (a === 'applypend') applyPending();
  });
  document.addEventListener('input', e => {
    if (!e.target.closest('#retModal')) return;
    if (e.target.id === 'rt_q') { RT.q = e.target.value; renderRows(); }
    else if (e.target.id === 'rt_pq') fillProducts();
    else if (e.target.id === 'rt_amt') { RT.touched = true; }
    else if (e.target.classList.contains('rt-q')) { RT.touched = false; calc(); }
  });
  document.addEventListener('change', e => {
    if (!e.target.closest('#retModal')) return;
    if (e.target.id === 'rt_p') fillColors(); else if (e.target.id === 'rt_c') fillSizes();
    else if (e.target.classList.contains('rt-r')) calc();
  });

  /* تنبيه عند دخول الإدارة إن وُجدت عمليات مخزونها غير مطبّق */
  const _ta = window.toggleAdmin;
  window.toggleAdmin = async function (on) {
    const r = await _ta.apply(this, arguments);
    if (on) setTimeout(async () => { const p = await pending(); if (p.length) toast('⚠️ ' + p.length + ' عملية إرجاع/استبدال مخزونها غير محدّث — افتح «إرجاع / استبدال»'); }, 2500);
    return r;
  };
})();
