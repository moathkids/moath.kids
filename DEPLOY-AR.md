# دليل التشغيل — معاذ كيدز (النسخة المُحدَّثة)

## ما تم
1. SQL (`supabase/001_orders_security.sql`) — نُفِّذ: المدراء، RLS، `confirm_order` الذرّية، أعمدة جديدة.
2. الدالتان القديمتان معدّلتان (نفس الأسماء والجداول والأسرار):
   - `supabase/functions/quick-task/index.ts`
   - `supabase/functions/dynamic-service/index.ts`
3. ملفات الموقع (بدون مجلد supabase).

## نشر الدالتين (Supabase → Edge Functions)
لكل دالة: افتحها ← Code ← احذف الكود القديم ← الصق الجديد ← Deploy. **لا تغيّر إعداد verify_jwt** (يبقى كما هو).

## الأسرار (Edge Functions → Secrets)
- `META_CAPI_TOKEN` : موجود، لا تغيّره.
- `ALLOWED_ORIGINS` : نطاق موقعك واللوحة، مثال `https://moathkids.com,https://www.moathkids.com` (بدون / في النهاية).
  إن لم تضبطه تبقى القيمة الافتراضية `https://moathkids.github.io`.
- `WEBHOOK_ALLOWED_HOSTS` : فقط إن كنت تستخدم `webhook_url` في settings_private. مثال `hooks.slack.com,hook.eu1.make.com`.

## قائمة الاختبار (Meta → Test Events؛ ضع test_event_code في settings_private)
- [ ] طلب عادي ← Lead واحد
- [ ] تأكيد الطلب ← Purchase واحد، قيمته سعر البضاعة فقط
- [ ] ضغطتا "تأكيد" ← فاتورة واحدة
- [ ] مخزون غير كافٍ ← رفض واضح بلا تغيير
- [ ] طلب ملغى ← لا Purchase
- [ ] طلب تجريبي (is_test) ← لا يُرسل لميتا
- [ ] التوصيل لا يدخل في المبيعات
