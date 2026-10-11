/* ===================================================================
   utils.js — معاذ كيدز | Moath Kids
   الإصدار: 3.0 (ES2015)
   التاريخ: 2026-10-10
   
   الدوال المساعدة الأساسية + نظام التتبع.
   =================================================================== */

window.MK_UTILS = (function() {
  'use strict';

  const C = window.MK_CONFIG;

  /* ═══════════════════════════════════════════════════════════
     🎯 الدوال الأساسية
     ═══════════════════════════════════════════════════════════ */

  const $ = id => document.getElementById(id);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const fmt = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

  const ik = (color, size) => (color || '') + '|' + (size || '');

  /* ═══════════════════════════════════════════════════════════
     🔔 الإشعارات
     ═══════════════════════════════════════════════════════════ */

  function toast(msg) {
    let t = $('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    const dur = (C && C.PERFORMANCE && C.PERFORMANCE.toastDuration) || 2600;
    t._h = setTimeout(() => t.classList.remove('show'), dur);
  }

  /* ═══════════════════════════════════════════════════════════
     ⏱️ التحكم في التوقيت
     ═══════════════════════════════════════════════════════════ */

  function debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /* ═══════════════════════════════════════════════════════════
     💾 التخزين
     ═══════════════════════════════════════════════════════════ */

  function readLS(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : (fallback || null);
    } catch (e) { return fallback || null; }
  }

  function writeLS(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }

  function removeLS(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════
     🆔 المعرّفات
     ═══════════════════════════════════════════════════════════ */

  function uid() {
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function orderRef() {
    let r = '';
    try { r = sessionStorage.getItem('mk_ref') || ''; } catch (e) {}
    if (!r) {
      const d = new Date();
      r = 'MK-' + String(d.getFullYear()).slice(2) +
        ('0' + (d.getMonth() + 1)).slice(-2) +
        ('0' + d.getDate()).slice(-2) + '-' +
        Array.from(crypto.getRandomValues(new Uint8Array(5)), b =>
          'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
      try { sessionStorage.setItem('mk_ref', r); } catch (e) {}
    }
    return r;
  }

  function eventId(eventName, extra) {
    const e = String(eventName || 'evt').toLowerCase().replace(/[^a-z0-9]/g, '');
    const x = extra ? '-' + String(extra).replace(/[^a-z0-9-]/gi, '').slice(0, 40) : '';
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return e + x + '-' + t + '-' + r;
  }

  /* ═══════════════════════════════════════════════════════════
     🔗 الروابط
     ═══════════════════════════════════════════════════════════ */

  function qs(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  function waPhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function waLink(phone, msg) {
    return 'https://wa.me/' + waPhone(phone) + (msg ? '?text=' + encodeURIComponent(msg) : '');
  }

  /* ═══════════════════════════════════════════════════════════
     🍪 الكوكيز
     ═══════════════════════════════════════════════════════════ */

  function getCookie(name) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }

  function setCookie(name, value, days) {
    try {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = name + '=' + encodeURIComponent(value) +
        '; expires=' + expires + '; path=/; SameSite=Lax';
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════
     🔐 التشفير
     ═══════════════════════════════════════════════════════════ */

  async function sha256(v) {
    if (!v) return '';
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return ''; }
  }

  function normalize(v) {
    return String(v || '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function letters(v) {
    return String(v || '').trim().toLowerCase().replace(/[^\p{L}]/gu, '');
  }

  /* ═══════════════════════════════════════════════════════════
     📱 الجهاز والجلسة
     ═══════════════════════════════════════════════════════════ */

  function getDeviceInfo() {
    const ua = navigator.userAgent || '';
    let type = 'desktop';
    let os = 'Other';
    let browser = 'Other';

    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) type = 'tablet';
    else if (/Mobi|Android|iPhone|iPod/i.test(ua)) type = 'mobile';

    if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Opera|OPR\//i.test(ua)) browser = 'Opera';

    const screen = (window.screen ? window.screen.width + 'x' + window.screen.height : '');

    return { type, os, browser, screen, ua: ua.slice(0, 200) };
  }

  function getSessionInfo() {
    const d = getDeviceInfo();
    return {
      screen: d.screen,
      language: navigator.language || 'ar',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      referrer: document.referrer || '',
      landing_url: location.href,
      timestamp: Date.now()
    };
  }

  /* ═══════════════════════════════════════════════════════════
     📊 نظام التتبع
     ═══════════════════════════════════════════════════════════ */

  function captureTracking() {
    if (!C || !C.isTrackingEnabled || !C.isTrackingEnabled()) {
      return {};
    }

    const url = new URL(location.href);
    const params = url.searchParams;

    const utm = {
      source: params.get('utm_source') || '',
      medium: params.get('utm_medium') || '',
      campaign: params.get('utm_campaign') || '',
      content: params.get('utm_content') || '',
      term: params.get('utm_term') || ''
    };

    const clickIds = {
      fbclid: params.get('fbclid') || '',
      gclid: params.get('gclid') || '',
      ttclid: params.get('ttclid') || '',
      sccid: params.get('sccid') || '',
      msclkid: params.get('msclkid') || '',
      twclid: params.get('twclid') || ''
    };

    const session = getSessionInfo();
    const device = getDeviceInfo();

    return {
      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
      utm_content: utm.content,
      utm_term: utm.term,
      fbclid: clickIds.fbclid,
      gclid: clickIds.gclid,
      ttclid: clickIds.ttclid,
      sccid: clickIds.sccid,
      msclkid: clickIds.msclkid,
      twclid: clickIds.twclid,
      referrer: session.referrer,
      landing_url: session.landing_url,
      language: session.language,
      timezone: session.timezone,
      device_type: device.type,
      device_os: device.os,
      device_browser: device.browser,
      screen: device.screen,
      user_agent: device.ua,
      first_seen: Date.now(),
      last_seen: Date.now(),
      utm_source_first: utm.source,
      utm_campaign_first: utm.campaign
    };
  }

  function getTracking() {
    const stored = readLS(C.TRACKING_KEY, null);
    return stored || {};
  }

  function saveTracking(tracking) {
    if (!tracking || !C.isTrackingEnabled()) return;
    writeLS(C.TRACKING_KEY, tracking);
  }

  function updateTracking(updates) {
    const existing = getTracking();
    const merged = Object.assign({}, existing, updates, { last_seen: Date.now() });
    if (existing.first_seen) merged.first_seen = existing.first_seen;
    if (existing.utm_source_first) merged.utm_source_first = existing.utm_source_first;
    if (existing.utm_campaign_first) merged.utm_campaign_first = existing.utm_campaign_first;
    saveTracking(merged);
    return merged;
  }

  function initTracking() {
    if (!C.isTrackingEnabled()) return {};

    const existing = getTracking();
    if (existing && existing.first_seen) {
      return updateTracking({});
    }

    const fresh = captureTracking();
    saveTracking(fresh);

    if (fresh.fbclid) {
      try { sessionStorage.setItem('mk_fbclid', fresh.fbclid); } catch (e) {}
    }

    return fresh;
  }

  /* ═══════════════════════════════════════════════════════════
     🎯 fbp / fbc / vid
     ═══════════════════════════════════════════════════════════ */

  function getFbp() {
    const v = getCookie('_fbp');
    return /^fb\.\d\.\d+\.\d+$/.test(v) ? v : '';
  }

  function getFbc() {
    let v = getCookie('_fbc');
    if (v) return v;

    try {
      const saved = readLS(C.FBC_KEY, null);
      if (saved && saved.v && Date.now() - saved.t < 7776000000) return saved.v;
    } catch (e) {}

    let fbclid = '';
    try {
      const url = new URL(location.href);
      fbclid = url.searchParams.get('fbclid') || sessionStorage.getItem('mk_fbclid') || '';
    } catch (e) {}

    if (fbclid) {
      v = 'fb.1.' + Date.now() + '.' + fbclid;
      writeLS(C.FBC_KEY, { v, t: Date.now() });
      setCookie('_fbc', v, 90);
      return v;
    }

    return '';
  }

  function getVid() {
    let vid = readLS(C.VISITOR_ID_KEY, '');
    if (!vid) {
      vid = crypto.randomUUID ? crypto.randomUUID() :
        Date.now() + '-' + Math.random().toString(36).slice(2);
      writeLS(C.VISITOR_ID_KEY, vid);
    }
    return vid;
  }

  /* ═══════════════════════════════════════════════════════════
     📞 الأرقام
     ═══════════════════════════════════════════════════════════ */

  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  function digits(v) {
    return String(v == null ? '' : v)
      .replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)))
      .replace(/\D/g, '');
  }

  function normPhone(raw, cc) {
    const d = digits(raw).replace(/^00/, '').replace(/^(97[02])0/, '$1');
    if (!d) return '';
    if (d.startsWith('972') || d.startsWith('970')) return d;
    if (d.startsWith('0')) return cc + d.slice(1);
    if (d.length === 9 && d.startsWith('5')) return cc + d;
    return d;
  }

  function phoneVariants(p) {
    if (/^97[02]5\d{8}$/.test(p)) {
      return [p, (p.startsWith('972') ? '970' : '972') + p.slice(3)];
    }
    return [p];
  }

  /* ═══════════════════════════════════════════════════════════
     🧮 أدوات إضافية
     ═══════════════════════════════════════════════════════════ */

  function merge() {
    const args = Array.prototype.slice.call(arguments).filter(Boolean);
    return Object.assign.apply(Object, [{}].concat(args));
  }

  function isFilled(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }

  function cleanEmpty(obj) {
    const out = {};
    for (const k in obj) {
      if (isFilled(obj[k])) out[k] = obj[k];
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════════
     📤 التصدير
     ═══════════════════════════════════════════════════════════ */

  return {
    $: $,
    esc: esc,
    fmt: fmt,
    ik: ik,
    toast: toast,
    debounce: debounce,
    readLS: readLS,
    writeLS: writeLS,
    removeLS: removeLS,
    uid: uid,
    orderRef: orderRef,
    eventId: eventId,
    qs: qs,
    waPhone: waPhone,
    waLink: waLink,
    getCookie: getCookie,
    setCookie: setCookie,
    sha256: sha256,
    normalize: normalize,
    letters: letters,
    getDeviceInfo: getDeviceInfo,
    getSessionInfo: getSessionInfo,
    captureTracking: captureTracking,
    getTracking: getTracking,
    saveTracking: saveTracking,
    updateTracking: updateTracking,
    initTracking: initTracking,
    getFbp: getFbp,
    getFbc: getFbc,
    getVid: getVid,
    digits: digits,
    normPhone: normPhone,
    phoneVariants: phoneVariants,
    merge: merge,
    isFilled: isFilled,
    cleanEmpty: cleanEmpty
  };
})();