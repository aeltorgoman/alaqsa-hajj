import { useCallback, useEffect, useState } from "react";
import { pageForPath, pathForPage, type PageId } from "./nav";

/* الصفحةُ الحاليّة مشتقّةٌ من عنوان المتصفّح (History API) لا من حالةٍ
   مخزّنة: التحديثُ والرابطُ المباشر وفتحُ تبويبٍ جديد والرجوعُ والتقدّم
   كلُّها تقرأ العنوان نفسه. والعنوانُ غيرُ المعروف يُطبَّع إلى `/`.
   ولا يُمسّ `/hajj` هنا أصلاً: `main.tsx` يوجّهه إلى بوابة الحاجّ قبل
   أن يُركَّب هذا الغلاف. */
function currentPage(): PageId {
  const page = pageForPath(window.location.pathname) ?? "dash";
  /* العنوانُ القانونيّ: غيرُ المعروف يصير `/`، و`/finance/` يصير `/finance` */
  const canonical = pathForPage(page);
  if (window.location.pathname !== canonical) {
    window.history.replaceState(window.history.state, "", canonical + window.location.search + window.location.hash);
  }
  return page;
}

export function useStaffRoute() {
  const [page, setPageState] = useState<PageId>(currentPage);

  useEffect(() => {
    const onPop = () => setPageState(currentPage());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** مُحوِّلُ `setPage` القديم — نفسُ التوقيع، ويدفع إدخالاً في التاريخ.
      المعرّفُ غيرُ المعروف يذهب إلى الرئيسية كما كان `default` يفعل. */
  const navigate = useCallback((id: string) => {
    const path = pathForPage(id);
    const next = pageForPath(path) ?? "dash";
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
    setPageState(next);
  }, []);

  return { page, navigate };
}
