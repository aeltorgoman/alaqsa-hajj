/* ═══ عنوانُ الشاشة في البوابة ═══
   الشاشةُ المعروضة مشتقّةٌ من عنوان المتصفّح لا من حالةٍ مخزّنة —
   نفسُ مبدأ `useStaffRoute` في جانب الموظّفين: التحديثُ والرابطُ
   المباشر والرجوعُ والتقدّم كلُّها تقرأ العنوان نفسه. وكان التبويب
   `useState("trip")` فيضيع عند كلّ تحديث.

   ولا يُستورَد `navigation/nav.ts` هنا عمداً: ذاك يحمل صلاحيّاتِ
   الموظّفين ونوعَ `User`، وبوابةُ الحاجّ حزمةٌ عامّةٌ منفصلة يفصلها
   `main.tsx` قبل `ConfigProvider`. نفسُ النمط، لا نفسُ الملفّ.

   ⚠️ العناوينُ المؤقّتة (عارضُ المستند، بطاقةُ الفقدان، الحواراتُ)
   تبقى حالةَ React ولا عنوانَ لها. */
import { useCallback, useEffect, useState } from "react";
import type { TabId } from "./PortalNav";

/** جذرُ البوابة — يطابق ما يفحصه `main.tsx` بالبادئة */
const ROOT = "/hajj";

/* مصدرٌ واحد للاقتران: تبويبٌ ⇄ عنوان */
const PATH_BY_TAB: Record<TabId, string> = {
  trip: ROOT,
  stay: `${ROOT}/stay`,
  alerts: `${ROOT}/alerts`,
};

const TAB_BY_PATH: ReadonlyMap<string, TabId> = new Map(
  (Object.entries(PATH_BY_TAB) as [TabId, string][]).map(([tab, path]) => [path, tab]),
);

export function pathForTab(tab: TabId): string {
  return PATH_BY_TAB[tab] ?? ROOT;
}

/** التبويبُ لعنوانٍ ما — `null` لعنوانٍ غير معروف (ومنه `/hajj/trip`) */
export function tabForPath(pathname: string): TabId | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
  return TAB_BY_PATH.get(normalized) ?? null;
}

/* العنوانُ القانونيّ: غيرُ المعروف و`/hajj/trip` يصيران `/hajj`،
   و`/hajj/stay/` تصير `/hajj/stay`. البحثُ والمرساةُ يُحفظان. */
function currentTab(): TabId {
  const tab = tabForPath(window.location.pathname) ?? "trip";
  const canonical = pathForTab(tab);
  if (window.location.pathname !== canonical) {
    window.history.replaceState(window.history.state, "", canonical + window.location.search + window.location.hash);
  }
  return tab;
}

export function usePortalRoute() {
  const [tab, setTabState] = useState<TabId>(currentTab);

  useEffect(() => {
    const onPop = () => setTabState(currentTab());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** نفسُ توقيع `setTab` القديم — ويدفع إدخالاً في التاريخ كي يعمل
      زرُّ الرجوع بين الشاشات */
  const navigate = useCallback((id: TabId) => {
    const path = pathForTab(id);
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    setTabState(id);
  }, []);

  /** تصحيحُ العنوان بلا إدخالٍ في التاريخ — للخروج وانتهاء الجلسة
      وإطفاء التنبيهات: لا يصحّ أن يعيدهم زرُّ الرجوع إلى شاشةٍ
      لم تعد لهم */
  const resetToRoot = useCallback(() => {
    if (window.location.pathname !== ROOT) {
      window.history.replaceState(window.history.state, "", ROOT + window.location.search + window.location.hash);
    }
    setTabState("trip");
  }, []);

  return { tab, navigate, resetToRoot };
}
