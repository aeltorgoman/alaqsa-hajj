import { useCallback, useEffect, useState } from "react";

const COMPACT_KEY = "hajj_sidebar_compact";
/* تحت هذا العرض يصير السايدبار درجاً — الجوّال. اللوحيُّ (≈768) وما
   فوقه يُبقي السايدبارَ في مكانه. */
const NARROW_QUERY = "(max-width: 767px)";

function readCompact(): boolean {
  try { return localStorage.getItem(COMPACT_KEY) === "1"; } catch { return false; }
}

/** طيُّ السايدبار — تفضيلُ مستخدمٍ محفوظٌ محلّياً، لا يتغيّر بتغيّر الصفحة. */
export function useSidebarPrefs() {
  const [compact, setCompact] = useState(readCompact);
  const toggleCompact = useCallback(() => {
    setCompact(c => {
      const next = !c;
      try { localStorage.setItem(COMPACT_KEY, next ? "1" : "0"); } catch { /* تخزينٌ محجوب: يبقى للجلسة */ }
      return next;
    });
  }, []);
  return { compact, toggleCompact };
}

function matchQuery(q: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches;
}

export function useIsNarrow(): boolean {
  return useMedia(NARROW_QUERY);
}

/** شاشاتٌ لا تتّسع لصفحةٍ عريضة بجانب السايدبار (جوّال ولوحيّ) */
export function useIsCompactViewport(): boolean {
  return useMedia("(max-width: 1024px)");
}

function useMedia(query: string): boolean {
  const [narrow, setNarrow] = useState(() => matchQuery(query));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}
