// بديلُ عميل Supabase للتحقّق في Node — لا شبكة ولا مفاتيح. أيُّ نداءٍ يُعيد كائناً فارغاً.
export const supabase: never = new Proxy({}, { get: () => () => ({}) }) as never;
export const portalSupabase: never = supabase;
