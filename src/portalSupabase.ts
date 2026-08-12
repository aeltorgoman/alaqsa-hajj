import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types/database";

/* ═══════════════════════════════════════════════════════════════
   عميل بوابة الحاج — منفصل عن عميل التطبيق

   البوابة صفحة عامة بلا تسجيل دخول، ومسارها في القاعدة مبنيّ على
   دور `anon` وحده: `get_pilgrim_portal` و`get_portal_announcements`
   ممنوعتان عن `authenticated` بقرار س٤ المعتمد (revoke منذ
   20260806110000، وgrant لـanon وحده في 20260808140000).

   وكان العميل المشترك يُلحق **جلسة الموظّف** بكل طلب إن وُجدت في
   المتصفّح، فيصل استدعاء البوابة بدور `authenticated` فيردّ
   PostgREST خطأ 42501 → 403. أي أن فتح البوابة من متصفّح موظّف
   مسجَّل الدخول كان يكسرها، والسبب ليس في البوابة ولا في الصلاحيات
   بل في هوية زائدة تُحمَل بلا داعٍ.

   ولهذا عميل خاصّ **لا يعرف جلسات أصلاً**:

     persistSession    false — لا يكتب جلسة في التخزين
     autoRefreshToken  false — لا يجدّد رمزاً ولا يطلب واحداً
     detectSessionInUrl false — لا يلتقط رمزاً من شريط العنوان
     storageKey        مفتاح خاصّ — لا يلمس مفتاح جلسة الموظّف
     storage           مخزن معطّل — لا يقرأ ولا يكتب شيئاً

   الأربعة الأولى تكفي منطقياً، والخامس هو الضمان: حتى لو تغيّر
   سلوك المكتبة يوماً، لا يوجد مخزن يقرأ منه هذا العميل جلسةً.
   فطلباته تخرج بمفتاح anon وحده، دائماً، مهما كانت حال المتصفّح.

   ⚠️ لا يُستعمل هذا العميل إلا في مسارات البوابة العامة. وشاشات
   الموظّفين تبقى على `supabase` المشترك بجلستها كما هي.
   ═══════════════════════════════════════════════════════════════ */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* مخزن لا يخزّن — يُمرَّر إلى المكتبة فيصير الاستعادة مستحيلة لا
   مجرّد معطّلة بإعداد */
const noStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const portalSupabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: "hajj_portal_no_session",
    storage: noStorage,
  },
});
