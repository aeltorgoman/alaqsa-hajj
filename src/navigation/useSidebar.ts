import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, PointerEvent } from "react";

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

/* صفحاتٌ تُعرض والسايدبار أيقوناتٌ (٥٦) يتّسع مؤقّتاً فوقها ولا يزيحها.
   التفضيلُ المحفوظ لا يُمسّ: يعود كما كان في سائر الصفحات. */
const OPEN_DELAY = 150;
const CLOSE_DELAY = 250;

/** اتّساعُ السايدبار المؤقّت فوق المحتوى: تحويمٌ بتأخير، وتركيزُ لوحة
    المفاتيح، وEscape، والنقرُ خارجه يغلقه — ولا يغيّر مقاسَ الصفحة. */
export function useSidebarPeek(enabled: boolean) {
  const [peek, setPeek] = useState(false);
  /* الخروجُ من الصفحة بغير السايدبار (زرّ الرجوع مثلاً) لا يُبقيه مفتوحاً للعودة */
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) { setWasEnabled(enabled); setPeek(false); }
  const timer = useRef<number | undefined>(undefined);
  const open = enabled && peek;

  const set = useCallback((next: boolean, delay = 0) => {
    window.clearTimeout(timer.current);
    if (delay) timer.current = window.setTimeout(() => setPeek(next), delay);
    else setPeek(next);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") set(false); };
    /* اللمس: لا تحويم — يُفتح بزرّ التوسيع ويُغلق بلمسةٍ خارجه */
    const onDown = (e: globalThis.PointerEvent) => { if (!(e.target as Element | null)?.closest?.("[data-sidebar-rail]")) set(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, set]);

  const handlers = {
    /* الفأرةُ وحدها تحوّم؛ اللمسُ يولّد أحداثَ فأرةٍ مقلَّدة تُغلقه فور فتحه */
    onPointerEnter: (e: PointerEvent<HTMLDivElement>) => { if (e.pointerType === "mouse") set(true, OPEN_DELAY); },
    onPointerLeave: (e: PointerEvent<HTMLDivElement>) => { if (e.pointerType === "mouse") set(false, CLOSE_DELAY); },
    /* تركيزُ لوحة المفاتيح وحده يفتح — لا نقرةُ الفأرة على زرّ التوسيع */
    onFocus: (e: FocusEvent<HTMLDivElement>) => { if (e.target.matches(":focus-visible")) set(true); },
    onBlur: (e: FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) set(false); },
  };

  return { open, handlers, toggle: () => set(!peek), close: () => set(false) };
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
