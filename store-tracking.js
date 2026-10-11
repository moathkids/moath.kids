/* ===================================================================
   store-tracking.js — معاذ كيدز | Moath Kids
   الإصدار: 3.0 (ES2015)
   التاريخ: 2026-10-10
   
   المسؤولية: نظام التتبع الكامل + Meta CAPI.
   يعمل على كل الأجهزة (2015+).
   يُستخدم من خلال: window.MK_TRACKING
   =================================================================== */

window.MK_TRACKING = (function() {
  'use strict';

  const C = window.MK_CONFIG;
  const U = window.MK_UTILS;

  /* ═══════════════════════════════════════════════════════════
     📦 الحالة الداخلية
     ═══════════════════════════════════════════════════════════ */

  const STATE = {
    enabled: false,
    initialized: false,
    data: {},
    device: {},
    session: {},
    fbp: '',
    fbc: '',
    vid: '',
    firstTouch: {},
    lastTouch: {}
  };

  /* ═══════════════════════════════════════════════════════════
     🚀 التهيئة
     ═══════════════════════════════════════════════════════════ */

  function init() {
    if (STATE.initialized) return STATE.data;
    if (!C || !C.isTrackingEnabled || !C.isTrackingEnabled()) {
      STATE.enabled = false;
      return {};
    }

    STATE.enabled = true;
    STATE.initialized = true;

    STATE.device = U.getDeviceInfo();
    STATE.session = U.getSessionInfo();
    STATE.data = U.initTracking();
    STATE.fbp = U.getFbp();
    STATE.fbc = U.getFbc();
    STATE.vid = U.getVid();

    const stored = U.getTracking() || {};
    STATE.firstTouch = {
      source: stored.utm_source_first || '',
      campaign: stored.utm_campaign_first || '',
      first_seen: stored.first_seen || Date.now()
    };
    STATE.lastTouch = {
      source: stored.utm_source || '',
      campaign: stored.utm_campaign || '',
      content: stored.utm_content || '',
      term: stored.utm_term || '',
      medium: stored.utm_medium || '',
      last_seen: Date.now()
    };

    U.updateTracking({ last_seen: Date.now() });

    setTimeout(() => { refreshFbp(); }, 2000);

    return STATE.data;
  }

  /* ═══════════════════════════════════════════════════════════
     📊 قراءة البيانات
     ═══════════════════════════════════════════════════════════ */

  function getData() {
    return Object.assign({}, STATE.data, {
      device_type: STATE.device.type,
      device_os: STATE.device.os,
      device_browser: STATE.device.browser,
      screen: STATE.device.screen,
      user_agent: STATE.device.ua,
      referrer: STATE.session.referrer,
      landing_url: STATE.session.landing_url,
      language: STATE.session.language,
      timezone: STATE.session.timezone,
      fbp: STATE.fbp,
      fbc: STATE.fbc,
      vid: STATE.vid,
      first_touch: STATE.firstTouch,
      last_touch: STATE.lastTouch
    });
  }

  function getDevice() { return STATE.device; }
  function getSession() { return STATE.session; }
  function getFbp() { return STATE.fbp; }
  function getFbc() { return STATE.fbc; }
  function getVid() { return STATE.vid; }
  function getFirstTouch() { return STATE.firstTouch; }
  function getLastTouch() { return STATE.lastTouch; }

  /* ═══════════════════════════════════════════════════════════
     👤 بناء بيانات المستخدم
     ═══════════════════════════════════════════════════════════ */

  function buildUserData(customer) {
    const c = customer || {};
    const ud = {
      client_user_agent: STATE.device.ua || ''
    };
    if (STATE.fbp) ud.fbp = STATE.fbp;
    if (STATE.fbc) ud.fbc = STATE.fbc;

    const tasks = [];

    if (c.email) {
      tasks.push(
        U.sha256(U.normalize(c.email)).then(hash => {
          if (hash) ud.em = [hash];
        })
      );
    }

    if (c.phone) {
      const phoneNorm = U.normPhone(c.phone, C.DEFAULT_PHONE_CC || '972');
      if (phoneNorm.length >= 10 && phoneNorm.length <= 14) {
        const variants = U.phoneVariants(phoneNorm);
        tasks.push(
          Promise.all(variants.map(v => U.sha256(v))).then(hashes => {
            const valid = hashes.filter(h => h);
            if (valid.length) ud.ph = valid;
          })
        );
      }
    }

    if (c.name) {
      const parts = String(c.name).trim().split(/\s+/).filter(p => p);
      const fn = parts[0] ? U.letters(parts[0]) : '';
      const ln = parts.length > 1 ? U.letters(parts[parts.length - 1]) : '';
      if (fn) {
        tasks.push(U.sha256(fn).then(hash => { if (hash) ud.fn = [hash]; }));
      }
      if (ln) {
        tasks.push(U.sha256(ln).then(hash => { if (hash) ud.ln = [hash]; }));
      }
    }

    if (c.city) {
      const ct = U.letters(c.city);
      if (ct) {
        tasks.push(U.sha256(ct).then(hash => { if (hash) ud.ct = [hash]; }));
      }
    }

    const country = (C.DEFAULT_COUNTRY || 'ps').toLowerCase();
    tasks.push(U.sha256(country).then(hash => {
      if (hash) ud.country = [hash];
    }));

    const extTasks = [];
    if (STATE.vid) extTasks.push(U.sha256(STATE.vid));
    if (c.id) extTasks.push(U.sha256(String(c.id)));

    return Promise.all(tasks).then(() => {
      return Promise.all(extTasks);
    }).then(extHashes => {
      const validExt = extHashes.filter(h => h);
      if (ud.ph && ud.ph.length > 0) validExt.push(ud.ph[0]);
      if (validExt.length > 0) ud.external_id = validExt;

      const clean = {};
      for (const key in ud) {
        if (ud.hasOwnProperty(key)) {
          const val = ud[key];
          if (val != null) {
            if (Array.isArray(val) && val.length === 0) continue;
            clean[key] = val;
          }
        }
      }
      return clean;
    });
  }

  /* ═══════════════════════════════════════════════════════════
     📤 إرسال للسيرفر
     ═══════════════════════════════════════════════════════════ */

function isTestMode() {
    try {
      const url = new URL(location.href);
      if (url.searchParams.get('test') === '1') {
        sessionStorage.setItem('mk_test_mode', '1');
        return true;
      }
      if (url.searchParams.get('test') === '0') {
        sessionStorage.removeItem('mk_test_mode');
        return false;
      }
      return sessionStorage.getItem('mk_test_mode') === '1';
    } catch (e) {
      return false;
    }
  }

  function sendServer(eventName, eventId, customData, userData, ref) {
    if (!STATE.enabled) {
      return Promise.resolve({ ok: false, error: 'tracking disabled' });
    }

    try {
      const url = C.getTrackUrl();
      const body = {
        event_name: eventName,
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        url: location.href,
        ua: STATE.device.ua || '',
        vid: STATE.vid || '',
        fbp: STATE.fbp || '',
        fbc: STATE.fbc || '',
        is_test: isTestMode(),
        custom_data: customData || {},
        user: userData || {}
      };
      if (ref) body.ref = ref;

      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': C.SUPABASE_KEY
        },
        body: JSON.stringify(body),
        keepalive: true
      }).then(r => r.json().catch(() => ({ ok: false })))
        .catch(e => {
          console.warn('sendServer failed:', e);
          return { ok: false, error: String((e && e.message) || e) };
        });
    } catch (e) {
      console.warn('sendServer exception:', e);
      return Promise.resolve({ ok: false, error: String((e && e.message) || e) });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     🌐 إرسال للـ Pixel
     ═══════════════════════════════════════════════════════════ */

  function sendPixel(eventName, customData, eventId) {
    if (typeof fbq !== 'function') return false;
    if (!window.MK_PIXEL_READY) return false;

    try {
      fbq('track', eventName, customData || {}, { eventID: eventId });
      return true;
    } catch (e) {
      console.warn('sendPixel failed:', e);
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     🔄 التحديث
     ═══════════════════════════════════════════════════════════ */

  function refreshFbp() {
    const newFbp = U.getFbp();
    if (newFbp && newFbp !== STATE.fbp) STATE.fbp = newFbp;
  }

  function refreshFbc() {
    const newFbc = U.getFbc();
    if (newFbc && newFbc !== STATE.fbc) STATE.fbc = newFbc;
  }

  function refresh() {
    refreshFbp();
    refreshFbc();
    U.updateTracking({ last_seen: Date.now() });
  }

  /* ═══════════════════════════════════════════════════════════
     📊 Debug
     ═══════════════════════════════════════════════════════════ */

  function debug() {
    return {
      enabled: STATE.enabled,
      initialized: STATE.initialized,
      device: STATE.device.type,
      os: STATE.device.os,
      fbp: STATE.fbp ? '✓' : '✗',
      fbc: STATE.fbc ? '✓' : '✗',
      vid: STATE.vid ? '✓' : '✗',
      utm_source: STATE.data.utm_source || '—',
      utm_campaign: STATE.data.utm_campaign || '—',
      first_touch: STATE.firstTouch.source || '—',
      last_touch: STATE.lastTouch.source || '—'
    };
  }

  /* ═══════════════════════════════════════════════════════════
     📤 التصدير
     ═══════════════════════════════════════════════════════════ */

  return {
    init: init,
    getData: getData,
    getDevice: getDevice,
    getSession: getSession,
    getFbp: getFbp,
    getFbc: getFbc,
    getVid: getVid,
    getFirstTouch: getFirstTouch,
    getLastTouch: getLastTouch,
    buildUserData: buildUserData,
    sendServer: sendServer,
    sendPixel: sendPixel,
    refresh: refresh,
    refreshFbp: refreshFbp,
    refreshFbc: refreshFbc,
    debug: debug
  };
})();