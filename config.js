/* ===================================================================
   config.js — معاذ كيدز | Moath Kids
   الإصدار: 4.2 (ES2015)
   التاريخ: 2026-10-11
   
   التعديلات عن النسخة السابقة:
   - توحيد RETURN_DAYS = 14 (كان متعارضاً بين config.js و admin.js)
   - 4.2: إصدار Graph موحّد v23.0 (الدالتان quick-task و dynamic-service بعد التعديل)
   =================================================================== */

(function() {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     🔐 الاتصال بـ Supabase
     ═══════════════════════════════════════════════════════════ */

  const SUPABASE_URL = 'https://smzkgmznlmjljuhehlcd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_8ndTsC3I_gcB7CAFqFEJDg_3tUnJUtc';
  const BUCKET_NAME = 'product-images';

  /* ═══════════════════════════════════════════════════════════
     🏪 معلومات المتجر
     ═══════════════════════════════════════════════════════════ */

  const STORE_NAME = 'معاذ كيدز';
  const STORE_NAME_FULL = 'معاذ كيدز - Moath Kids';
  const CURRENCY = '₪';
  const CURRENCY_ISO = 'ILS';
  const PHONE = '972598904686';
  const ADDRESS = 'فلسطين - طولكرم - فرعون';
  const DEFAULT_COUNTRY = 'ps';
  const DEFAULT_PHONE_CC = '972';

  /* ═══════════════════════════════════════════════════════════
     💾 Storage Keys
     ═══════════════════════════════════════════════════════════ */

  const CART_KEY = 'mk_cart_v2';
  const CUSTOMER_KEY = 'mk_customer_v2';
  const TRACKING_KEY = 'mk_tracking_v1';
  const VISITOR_ID_KEY = 'mk_vid';
  const FBC_KEY = 'mk_fbc';
  const UTM_KEY = 'mk_utm';
  const SESSION_KEY = 'mk_session';

  /* ═══════════════════════════════════════════════════════════
     📊 Meta
     ═══════════════════════════════════════════════════════════ */

  const PIXEL_ID = '2086766978646211';
  const META_TRACK_FN = 'quick-task';
  const META_ADMIN_FN = 'dynamic-service';
  const META_API_VERSION = 'v23.0';

  /* ═══════════════════════════════════════════════════════════
     📈 نظام التتبع
     ═══════════════════════════════════════════════════════════ */

  const TRACKING = {
    enabled: true,
    captureUTM: true,
    captureClickIDs: true,
    captureReferrer: true,
    captureDevice: true,
    captureSession: true,
    firstTouchAttribution: true,
    lastTouchAttribution: true,
    storageDuration: 30,
    useSmartEventIds: true,
    emqBoost: true,
    platforms: {
      facebook: {
        clickId: 'fbclid',
        cookie: '_fbc',
        domain: ['l.facebook.com', 'lm.facebook.com', 'facebook.com']
      },
      instagram: {
        clickId: 'fbclid',
        cookie: '_fbc',
        domain: ['l.instagram.com', 'instagram.com']
      },
      tiktok: {
        clickId: 'ttclid',
        cookie: '_ttp',
        domain: ['tiktok.com', 'vm.tiktok.com']
      },
      google: {
        clickId: 'gclid',
        cookie: '_gcl_aw',
        domain: ['google.com', 'googleadservices.com']
      },
      snapchat: {
        clickId: 'sccid',
        cookie: '_scid',
        domain: ['snapchat.com', 'sc.snapchat.com']
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════
     💰 نظام الأرباح
     ═══════════════════════════════════════════════════════════ */

  const PROFIT = {
    includeDelivery: false,
    trackItemsCost: true,
    trackDeliveryRevenue: true,
    currency: 'ILS'
  };

  /* 🔧 موحّد: 14 يوماً (نفس القيمة المستخدمة في admin.js) */
  const RETURN_DAYS = 14;

  /* ═══════════════════════════════════════════════════════════
     🚚 القسمان الرئيسيان للتوصيل (إجباريان للزبون)
     - هذه أسماء افتراضية فقط
     - يمكن تعديلها بالكامل من لوحة التحكم
     - يمكن إضافة/حذف مناطق ومدن من اللوحة
     ═══════════════════════════════════════════════════════════ */

  const DELIVERY_ZONES = [
    {
      id: 'zone_1',
      name: 'الضفة وضواحي القدس والقدس الشرقية والغربية والداخل',
      default_price: '',
      cities: []
    },
    {
      id: 'zone_2',
      name: 'المدن التابعة للقسم الأول',
      default_price: '',
      cities: []
    }
  ];

  /* ═══════════════════════════════════════════════════════════
     🏙️ قوائم مدن جاهزة (اختيارية — للتحميل السريع من اللوحة)
     ═══════════════════════════════════════════════════════════ */

  const CITY_PRESETS = {
    west_bank: [
      'طولكرم', 'نابلس', 'رام الله', 'البيرة', 'الخليل', 'بيت لحم',
      'جنين', 'قلقيلية', 'سلفيت', 'طوباس', 'أريحا', 'بيت جالا',
      'بيت ساحور', 'دورا', 'يطا', 'حلحول', 'عناتا', 'الرام',
      'بدو', 'بيت حنينا', 'شعفاط', 'كفر عقب', 'مخيم قلنديا',
      'العيزرية', 'أبو ديس', 'السواحرة', 'صور باهر', 'سلوان'
    ],
    east_jerusalem: [
      'القدس الشرقية', 'البلدة القديمة', 'بيت حنينا', 'شعفاط',
      'كفر عقب', 'مخيم شعفاط', 'رأس العامود', 'وادي الجوز',
      'الطور', 'السواحرة الشرقية', 'أبو ديس', 'العيزرية',
      'صور باهر', 'أم طوبا', 'جبل المكبر', 'سلوان'
    ],
    west_jerusalem: [
      'القدس الغربية', 'بيت شيمش', 'بيتاح تكفا', 'رمات غان',
      'غفعات شموئيل', 'هرتسليا', 'كفار سابا', 'رعنانا'
    ],
    inside_48: [
      'حيفا', 'يافا', 'تل أبيب', 'الناصرة', 'عكا', 'اللد', 'الرملة',
      'بئر السبع', 'أم الفحم', 'سخنين', 'شفاعمرو', 'كفر كنا',
      'عرابة', 'طمرة', 'كفرمندا', 'البعنة', 'دير الأسد', 'مجد الكروم',
      'باقة الغربية', 'جت المثلث', 'الطيرة', 'قلنسوة', 'الطيبة',
      'كفر قاسم', 'جلجولية'
    ]
  };

  /* ═══════════════════════════════════════════════════════════
     📝 النصوص
     ═══════════════════════════════════════════════════════════ */

  const TEXTS = {
    EMPTY_CART: 'العربة فارغة. أضف منتجات من المتجر ثم ارجع هنا.',
    ORDER_SENT: 'تم إرسال طلبك ✓ شكرًا لك',
    SAVED: 'تم الحفظ في قاعدة البيانات ✓',
    LOAD_ERROR: 'تعذر تحميل المنتجات — تأكد من الإعدادات',
    SELECT_SIZE: 'اختر المقاس أولاً',
    SELECT_COLOR: 'اختر اللون أولاً',
    SELECT_ZONE: 'اختر المنطقة أولاً',
    SELECT_CITY: 'اختر المدينة أولاً',
    NOT_AVAILABLE: 'هذا الخيار غير متوفر',
    OUT_OF_STOCK: 'نفد من المخزون',
    AVAILABLE_QTY: 'المتوفر',
    PIECES: 'قطعة',
    ORDER_CONFIRMED: 'تم تأكيد طلبك ✓',
    ORDER_CANCELLED: 'تم إلغاء الطلب',
    ORDER_COMPLETED: 'تم إتمام الطلب بنجاح',
    LOADING: 'جاري التحميل...',
    CONNECTION_ERROR: 'تعذر الاتصال بالخادم',
    INVALID_PHONE: 'رقم الجوال غير صحيح',
    INVALID_EMAIL: 'البريد الإلكتروني غير صحيح'
  };

  /* ═══════════════════════════════════════════════════════════
     ⚙️ الثوابت
     ═══════════════════════════════════════════════════════════ */

  const CONSTANTS = {
    ORDER_STATUS: {
      NEW: 'new',
      CONFIRMED: 'confirmed',
      CANCELLED: 'cancelled'
    },
    PRODUCT_STATE: {
      PUBLISHED: true,
      HIDDEN: false
    },
    GENDER: {
      MALE: 'ذكر',
      FEMALE: 'أنثى'
    },
    EVENTS: {
      VIEW_CONTENT: 'ViewContent',
      ADD_TO_CART: 'AddToCart',
      INITIATE_CHECKOUT: 'InitiateCheckout',
      ADD_PAYMENT_INFO: 'AddPaymentInfo',
      PURCHASE: 'Purchase',
      LEAD: 'Lead',
      COMPLETE_REGISTRATION: 'CompleteRegistration',
      SEARCH: 'Search',
      CONTACT: 'Contact'
    },
    DEVICE_TYPE: {
      MOBILE: 'mobile',
      TABLET: 'tablet',
      DESKTOP: 'desktop'
    },
    OS: {
      IOS: 'iOS',
      ANDROID: 'Android',
      WINDOWS: 'Windows',
      MACOS: 'macOS',
      LINUX: 'Linux',
      OTHER: 'Other'
    }
  };

  /* ═══════════════════════════════════════════════════════════
     🚀 الأداء
     ═══════════════════════════════════════════════════════════ */

  const PERFORMANCE = {
    debounceDelay: 250,
    toastDuration: 2600,
    ordersRefreshInterval: 30000,
    maxSearchResults: 50,
    imageCacheDuration: 31536000
  };

  /* ═══════════════════════════════════════════════════════════
     🎨 الافتراضيات
     ═══════════════════════════════════════════════════════════ */

  const DEFAULTS = {
    menu: [
      { label: 'الرئيسية', action: 'home', hasSub: false },
      { label: 'المنتجات', action: 'products', hasSub: true },
      { label: 'الأقسام', action: 'categories', hasSub: false },
      { label: 'من نحن', action: 'who', hasSub: false },
      { label: 'الأسئلة الشائعة', action: 'about', hasSub: false },
      { label: 'تواصل معنا', action: 'contact', hasSub: false }
    ],
    settings: {
      name: 'معاذ كيدز',
      name_full: 'معاذ كيدز - Moath Kids',
      phone: '972598904686',
      currency: '₪',
      title: 'ملابس أطفال بأجمل التفاصيل',
      tagline: 'ناعمة ودافئة، بتصاميم تفرح الصغار وأهلهم',
      announce: 'توصيل لمناطق الضفة والقدس والداخل · اطلب مباشرة عبر الواتساب',
      address: 'فلسطين - طولكرم - فرعون',
      logo: '',
      cover: '',
      instagram: '',
      facebook: '',
      tiktok: '',
      delivery: DELIVERY_ZONES.map(function(z) {
        return { id: z.id, name: z.name, default_price: z.default_price, cities: [] };
      }),
      pages: [],
      pixel_id: '2086766978646211'
    }
  };

  /* ═══════════════════════════════════════════════════════════
     ⚠️ دوال مساعدة
     ═══════════════════════════════════════════════════════════ */

  function getTrackUrl() {
    return SUPABASE_URL + '/functions/v1/' + META_TRACK_FN;
  }

  function getAdminFnUrl() {
    return SUPABASE_URL + '/functions/v1/' + META_ADMIN_FN;
  }

  function getCurrencyISO() {
    const map = { '₪': 'ILS', '$': 'USD', '€': 'EUR', '£': 'GBP' };
    return map[CURRENCY] || CURRENCY_ISO || 'ILS';
  }

  function isTrackingEnabled() {
    return TRACKING && TRACKING.enabled === true;
  }

  /* ═══════════════════════════════════════════════════════════
     📤 التصدير
     ═══════════════════════════════════════════════════════════ */

  window.MK_CONFIG = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_KEY: SUPABASE_KEY,
    BUCKET_NAME: BUCKET_NAME,

    STORE_NAME: STORE_NAME,
    STORE_NAME_FULL: STORE_NAME_FULL,
    CURRENCY: CURRENCY,
    CURRENCY_ISO: CURRENCY_ISO,
    PHONE: PHONE,
    ADDRESS: ADDRESS,
    DEFAULT_COUNTRY: DEFAULT_COUNTRY,
    DEFAULT_PHONE_CC: DEFAULT_PHONE_CC,

    CART_KEY: CART_KEY,
    CUSTOMER_KEY: CUSTOMER_KEY,
    TRACKING_KEY: TRACKING_KEY,
    VISITOR_ID_KEY: VISITOR_ID_KEY,
    FBC_KEY: FBC_KEY,
    UTM_KEY: UTM_KEY,
    SESSION_KEY: SESSION_KEY,

    PIXEL_ID: PIXEL_ID,
    META_TRACK_FN: META_TRACK_FN,
    META_ADMIN_FN: META_ADMIN_FN,
    META_API_VERSION: META_API_VERSION,

    TRACKING: TRACKING,
    PROFIT: PROFIT,
    RETURN_DAYS: RETURN_DAYS,
    TEXTS: TEXTS,
    CONSTANTS: CONSTANTS,
    PERFORMANCE: PERFORMANCE,
    DEFAULTS: DEFAULTS,

    DELIVERY_ZONES: DELIVERY_ZONES,
    CITY_PRESETS: CITY_PRESETS,

    getTrackUrl: getTrackUrl,
    getAdminFnUrl: getAdminFnUrl,
    getCurrencyISO: getCurrencyISO,
    isTrackingEnabled: isTrackingEnabled
  };

})();