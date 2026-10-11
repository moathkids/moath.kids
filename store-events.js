/* ===================================================================
   store-events.js — معاذ كيدز | Moath Kids
   الإصدار: 3.0 (ES2015)
   التاريخ: 2026-10-10
   
   المسؤولية: أحداث Meta (Pixel + CAPI).
   يُستخدم من خلال: window.MK_EVENTS
   =================================================================== */

window.MK_EVENTS = (function() {
  'use strict';

  const C = window.MK_CONFIG;
  const U = window.MK_UTILS;
  const T = window.MK_TRACKING;

  /* ═══════════════════════════════════════════════════════════
     📦 الحالة الداخلية
     ═══════════════════════════════════════════════════════════ */

  const STATE = {
    enabled: false,
    viewedProducts: new Set(),
    lastSearch: '',
    lastContactAt: 0
  };

  /* ═══════════════════════════════════════════════════════════
     🚀 التهيئة
     ═══════════════════════════════════════════════════════════ */

  function init() {
    if (!C || !C.isTrackingEnabled || !C.isTrackingEnabled()) {
      STATE.enabled = false;
      return;
    }
    STATE.enabled = true;
  }

  /* ═══════════════════════════════════════════════════════════
     🆔 Smart Event IDs
     ═══════════════════════════════════════════════════════════ */

  function simpleHash(str) {
    let hash = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const chr = s.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function smartId(eventName, data) {
    const d = data || {};
    const ts = Date.now().toString(36);
    const prefix = String(eventName || 'evt').toLowerCase().replace(/[^a-z0-9]/g, '');

    switch (eventName) {
      case 'ViewContent': {
        const pid = d.product_id || (d.content_ids && d.content_ids[0]) || 'x';
        return 'view-' + String(pid).slice(0, 20) + '-' + ts;
      }
      case 'AddToCart': {
        const pid = d.product_id || (d.content_ids && d.content_ids[0]) || 'x';
        const col = d.color ? '-' + String(d.color).slice(0, 10) : '';
        const sz = d.size ? '-' + String(d.size).slice(0, 10) : '';
        return 'add-' + String(pid).slice(0, 20) + col + sz + '-' + ts;
      }
      case 'InitiateCheckout': {
        const items = d.contents || [];
        const hash = simpleHash(items.map(i => i.id + 'x' + i.quantity).join('|'));
        return 'checkout-' + hash + '-' + ts;
      }
      case 'Lead': {
        const ref = d.order_id || d.ref || 'x';
        return 'lead-' + String(ref).slice(0, 30) + '-' + ts;
      }
      case 'Contact': {
        return 'contact-' + ts;
      }
      case 'Search': {
        const q = String(d.search_string || '').slice(0, 20);
        const hash = simpleHash(q);
        return 'search-' + hash + '-' + ts;
      }
      case 'Purchase': {
        const oid = d.order_id || d.ref || 'x';
        return 'purchase-' + String(oid).slice(0, 30) + '-' + ts;
      }
      default:
        return prefix + '-' + ts + '-' + Math.random().toString(36).slice(2, 6);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     🎯 track() — الدالة الرئيسية
     ═══════════════════════════════════════════════════════════ */

  function track(eventName, data, opts) {
    if (!STATE.enabled) return '';
    const o = opts || {};

    // 1. بناء custom_data
    const custom = Object.assign(
      {
        currency: C.getCurrencyISO ? C.getCurrencyISO() : 'ILS',
        content_type: 'product'
      },
      data || {}
    );
    if (custom.currency && custom.currency.length !== 3) {
      custom.currency = C.getCurrencyISO ? C.getCurrencyISO() : 'ILS';
    }

    // 2. توليد event_id
    const eventId = o.eventId || smartId(eventName, custom);

    // 3. Pixel
    if (o.pixel !== false && T) {
      T.sendPixel(eventName, custom, eventId);
    }

    // 4. Server
    if (o.server !== false && T) {
      T.sendServer(eventName, eventId, custom, o.user || {}, o.ref || '')
        .catch(e => console.warn('[track] server error:', e));
    }

    if (window.MK_DEBUG) {
      console.log('[track] ' + eventName, { eventId: eventId, custom: custom });
    }

    return eventId;
  }

  /* ═══════════════════════════════════════════════════════════
     🎯 الأحداث المُحددة
     ═══════════════════════════════════════════════════════════ */

  function viewContent(product, extras) {
    if (!product) return '';
    const pid = product.id || product.code;
    if (!pid) return '';

    if (STATE.viewedProducts.has(pid)) return '';
    STATE.viewedProducts.add(pid);

    const e = extras || {};
    const price = Number(e.price || product.price) || 0;
    const cid = e.product_id || product.code || product.id;

    return track('ViewContent', {
      content_ids: [String(cid)],
      contents: [{ id: String(cid), quantity: 1, item_price: price }],
      content_name: e.name || product.name || '',
      content_type: 'product',
      value: price,
      product_id: product.id || ''
    }, {
      eventId: 'view-' + String(pid).slice(0, 20) + '-' + Date.now().toString(36)
    });
  }

  function addToCart(product, variant, qty) {
    if (!product) return '';
    const v = variant || {};
    const q = Number(qty) || 1;
    const cid = product.code || product.id;
    const price = Number(product.price) || 0;

    return track('AddToCart', {
      content_ids: [String(cid)],
      contents: [{ id: String(cid), quantity: q, item_price: price }],
      content_name: product.name || '',
      content_type: 'product',
      value: price * q,
      num_items: q,
      product_id: product.id || '',
      color: v.color || '',
      size: v.size || ''
    });
  }

  function initiateCheckout(items, total) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return '';

    const contents = list.map(x => ({
      id: String((x.product && (x.product.code || x.product.id)) || ''),
      quantity: Number(x.qty) || 1,
      item_price: Number(x.product && x.product.price) || 0
    }));
    const contentIds = contents.map(c => c.id).filter(Boolean);
    const numItems = contents.reduce((a, c) => a + c.quantity, 0);
    const value = Number(total) || contents.reduce((a, c) => a + (c.quantity * c.item_price), 0);

    return track('InitiateCheckout', {
      content_ids: contentIds,
      contents: contents,
      content_type: 'product',
      value: value,
      num_items: numItems
    });
  }

  function lead(order) {
    const o = order || {};
    const items = Array.isArray(o.items) ? o.items : [];
    const contents = items.map(x => ({
      id: String(x.product_code || x.product_id || ''),
      quantity: Number(x.qty) || 1,
      item_price: Number(x.unit_price) || 0
    })).filter(c => c.id);
    const contentIds = contents.map(c => c.id);
    const numItems = contents.reduce((a, c) => a + c.quantity, 0);
    const value = Number(o.total) || contents.reduce((a, c) => a + (c.quantity * c.item_price), 0);
// 🔑 event_id ثابت لكل طلب (لإلغاء التكرار بين Pixel و CAPI)
  const eventId = 'lead-' + (o.ref || Date.now());
    return track('Lead', {
      content_ids: contentIds,
      contents: contents,
      content_type: 'product',
      value: value,
      num_items: numItems,
      order_id: o.ref || '',
      content_name: items.map(x => x.product_name).join(', ').slice(0, 200)
    }, {
      ref: o.ref || '',
      eventId: eventId,
      user: o.customer || {}
    });
  }

  function contact(context) {
    const now = Date.now();
    if (now - STATE.lastContactAt < 10000) return '';
    STATE.lastContactAt = now;

    return track('Contact', {
      content_name: context || 'whatsapp'
    });
  }

  function search(query) {
    const q = String(query || '').trim();
    if (!q || q.length < 2) return '';
    if (q === STATE.lastSearch) return '';
    STATE.lastSearch = q;

    return track('Search', {
      search_string: q.slice(0, 100)
    });
  }

  function purchase(order) {
    const o = order || {};
    const items = Array.isArray(o.items) ? o.items : [];
    const contents = items.map(x => ({
      id: String(x.product_code || x.product_id || ''),
      quantity: Number(x.qty) || 1,
      item_price: Number(x.unit_price) || 0
    })).filter(c => c.id);
    const contentIds = contents.map(c => c.id);
    const numItems = contents.reduce((a, c) => a + c.quantity, 0);
    const value = Number(o.total) || contents.reduce((a, c) => a + (c.quantity * c.item_price), 0);

    return track('Purchase', {
      content_ids: contentIds,
      contents: contents,
      content_type: 'product',
      value: value,
      num_items: numItems,
      order_id: o.ref || ''
    }, {
      ref: o.ref || '',
      user: o.customer || {},
      server: false
    });
  }

  function resetViewed() {
    STATE.viewedProducts.clear();
  }

  function debug() {
    return {
      enabled: STATE.enabled,
      viewedCount: STATE.viewedProducts.size,
      lastSearch: STATE.lastSearch,
      lastContactAt: STATE.lastContactAt
    };
  }

  /* ═══════════════════════════════════════════════════════════
     📤 التصدير
     ═══════════════════════════════════════════════════════════ */

  return {
    init: init,
    track: track,
    smartId: smartId,
    simpleHash: simpleHash,
    viewContent: viewContent,
    addToCart: addToCart,
    initiateCheckout: initiateCheckout,
    lead: lead,
    contact: contact,
    search: search,
    purchase: purchase,
    resetViewed: resetViewed,
    debug: debug
  };
})();