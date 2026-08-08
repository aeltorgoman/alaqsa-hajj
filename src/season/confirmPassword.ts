// ============================================================
// تأكيد كلمة المرور — لعمليات الموسم التي لا رجعة فيها
// ============================================================
// س٣ / Security Architecture §٧.١: إعادة إدخال كلمة المرور تبقى
// **تأكيداً** لعملية لا رجعة فيها، لا آلية أمنية. الحارس الحقيقي
// صار JWT + has_permission على الخادم.
//
// ولذلك كلمة المرور لا تُرسل إلى أي دالة من دوالنا: تذهب إلى
// نقطة /auth/v1/token وحدها — الجهة التي تملك التحقّق منها — ولا
// تمرّ بشيفرتنا ولا بسجلّاتنا.
//
// عميل معزول لا الجلسة القائمة: persistSession:false فلا يكتب
// تخزيناً ولا يُطلق onAuthStateChange، والرمز العائد يُهمَل. فلا
// تُستبدل جلسة المستخدم في منتصف معالج الإقفال.
import { createClient } from "@supabase/supabase-js";

const confirmClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

export async function confirmPassword(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  const { data, error } = await confirmClient.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return !error && !!data?.user;
}
