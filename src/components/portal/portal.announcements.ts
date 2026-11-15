/* ═══ تنبيهاتُ البوابة — صفحاتٌ تالية وعزلُ الجلسة ═══
   ملفٌّ بلا مكوّنات، ويُختبر بـnode وحده (portal_session_isolation_unit.mjs).

   ١ — عزلُ الجلسة: كلُّ تغييرٍ لهويّة الحاجّ على الجهاز (خروج · انتهاء · دخولُ حاجٍّ آخر) يرفع
       «جيلَ» الجلسة. وكلُّ طلبٍ غير متزامن يلتقط الجيلَ والرمزَ قبل أن يبدأ، ولا يكتب في الحالة بعد
       عودته إلا إن بقيا كما هما. فردٌّ متأخّرٌ لجلسةٍ سابقة لا يعيد ملءَ شاشة حاجٍّ آخر، ولا يُنهي
       جلسةً جديدةً بردِّ رفضٍ قديم.
   ٢ — الصفحاتُ التالية تُدمج **بالمعرّف مع التحديث**: نسخةٌ أحدث تحلّ محلّ المخزَّنة، فلا يبقى نصٌّ
       قديمٌ بعد التعديل. وتحديثُ الصفحة الأولى يعيد جلبَ ما حُمّل بعدها (بعددها لا أكثر)، فما حُذف
       أو انتهى يغيب. */
import type { Ann, AnnPage } from "./portal.types";

export type SessionSnapshot = { gen: number; token: string | null };

/** جيلُ الجلسة: يُرفع عند كلّ تغييرٍ للهويّة، ويُسأل بعد كلّ انتظار */
export function createSessionGate() {
  let gen = 0;
  return {
    /** يُلتقط قبل الطلب */
    snapshot: (token: string | null): SessionSnapshot => ({ gen, token }),
    /** بعد العودة: لم تتغيّر الجلسةُ ولا رمزُها */
    isCurrent: (s: SessionSnapshot, token: string | null) => s.gen === gen && s.token !== null && s.token === token,
    /** خروجٌ أو انتهاءٌ أو دخولُ حاجٍّ آخر */
    bump: () => { gen += 1; return gen; },
    get gen() { return gen; },
  };
}
export type SessionGate = ReturnType<typeof createSessionGate>;

/** دمجُ صفحةٍ تالية: لا تكرارَ لما في الصفحة الأولى، والمعرّفُ الموجود يُستبدل بنسخته الأحدث */
export function mergeAnnPage(first: Ann[], prev: Ann[], items: Ann[]): Ann[] {
  const firstIds = new Set(first.map(a => a.id));
  const fresh = new Map(items.filter(a => !firstIds.has(a.id)).map(a => [a.id, a] as const));
  const out = prev.filter(a => !firstIds.has(a.id)).map(a => fresh.get(a.id) ?? a);
  const have = new Set(out.map(a => a.id));
  for (const a of fresh.values()) if (!have.has(a.id)) out.push(a);
  return out;
}

/** إعادةُ جلب ما حُمّل بعد الصفحة الأولى: من موضعها الجديد وبعددِ ما كان معروضاً (صفحةٌ على الأقلّ)،
    بحدٍّ أعلى لعدد الطلبات. null = تعذّر (الجلسةُ أو الشبكة): المتّصلُ يُسقط الصفحاتِ التالية. */
export async function collectAnnRange(
  fetchPage: (offset: number) => Promise<AnnPage | null>,
  start: number, want: number, pageSize: number,
): Promise<{ items: Ann[]; has_more: boolean } | null> {
  const size = Math.max(1, pageSize || 10);
  const maxRequests = Math.ceil(Math.max(want, 1) / size) + 1;
  const items: Ann[] = [];
  let has_more = true;
  for (let i = 0; i < maxRequests && has_more && items.length < Math.max(want, 1); i++) {
    const page = await fetchPage(start + items.length);
    if (!page || !Array.isArray(page.items)) return null;
    items.push(...page.items);
    has_more = !!page.has_more;
    if (page.items.length === 0) break;
  }
  return { items, has_more };
}
