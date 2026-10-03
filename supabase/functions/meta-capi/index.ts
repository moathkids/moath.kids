// Supabase Edge Function: meta-capi
// يرسل حدث الشراء إلى Meta Conversions API من الخادم، فيبقى التوكن سرًّا ولا يصل للمتصفح.
// الأسرار المطلوبة (Edge Functions → Secrets):  META_CAPI_TOKEN   (إجباري)
//                                              META_PIXEL_ID     (اختياري، الافتراضي أدناه)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_PIXEL = '945957301459601';
const ALLOWED_EVENTS = ['Purchase'];
const GRAPH = 'https://graph.facebook.com'; // بدون رقم إصدار: يتبع الإصدار الافتراضي لميتا (لا ينتهي)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);

  // 1) لا يُسمح إلا للأدمن المسجَّل
  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'unauthorized' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('MK_PUBLISHABLE_KEY') || '';
  const sb = createClient(url, key, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await sb.auth.getUser(jwt);
  if (ue || !u?.user) return json({ ok: false, error: 'unauthorized' }, 401);
  const { data: adm } = await sb.from('admins').select('user_id').maybeSingle();
  if (!adm) return json({ ok: false, error: 'forbidden' }, 403);

  const token = Deno.env.get('META_CAPI_TOKEN') || '';
  const pixel = Deno.env.get('META_PIXEL_ID') || DEFAULT_PIXEL;

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }

  // فحص الجاهزية (يستخدمه التطبيق لمعرفة هل الخادم جاهز)
  if (body?.ping) return json({ ok: true, configured: !!token });
  if (!token) return json({ ok: false, error: 'META_CAPI_TOKEN غير مضبوط في Secrets' }, 500);

  // 2) تحقق من الحدث
  const ev = body?.event;
  if (!ev || typeof ev !== 'object' || !ALLOWED_EVENTS.includes(ev.event_name)) return json({ ok: false, error: 'event not allowed' }, 400);
  if (JSON.stringify(ev).length > 20000) return json({ ok: false, error: 'event too large' }, 413);

  // 3) إرسال لميتا
  const form = new URLSearchParams();
  form.set('data', JSON.stringify([ev]));
  form.set('access_token', token);
  if (typeof body.test === 'string' && body.test.trim()) form.set('test_event_code', body.test.trim().slice(0, 40));
  try {
    const r = await fetch(`${GRAPH}/${pixel}/events`, { method: 'POST', body: form });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.events_received >= 1) return json({ ok: true, events_received: j.events_received });
    return json({ ok: false, error: j?.error?.message ? String(j.error.message).slice(0, 200) : `Meta HTTP ${r.status}` }, 502);
  } catch (e) {
    return json({ ok: false, error: 'تعذر الوصول إلى ميتا' }, 502);
  }
});
