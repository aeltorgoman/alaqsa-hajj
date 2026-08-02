// ============================================================
// مزوّد سياق الموسم
// ============================================================
// العقد والأنواع في useSeason.ts — هنا المكوّن وحده.
import { useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { supabase } from "../supabase";
import { SeasonContext } from "./useSeason";
import type { Season } from "./useSeason";

/* مفتاح التبويب لا المتصفّح: ث٦ — الموسم الذي أتصفّحه لا يغيّر ما
   يراه زميلي في نافذة أخرى، ولا يبقى معلّقاً في الزيارة القادمة */
const VIEWED_KEY = "hajj_viewed_season";

function readStoredId(): number | null {
  try {
    const raw = sessionStorage.getItem(VIEWED_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isFinite(id) ? id : null;
  } catch { return null; }
}

export function SeasonProvider({ children }: { children: ReactNode }) {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [viewedId, setViewedId] = useState<number | null>(readStoredId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("seasons").select("*").order("id", { ascending: false });
      if (cancelled) return;
      const open = (data || []).find(s => s.closed_at === null) || null;
      /* لا موسم مفتوح = النظام بلا وجهة للكتابة. الفهرس الفريد
         الجزئي يمنع الحالة، لكن عرضها أصدق من التظاهر بموسم */
      if (err || !data || !open) {
        console.error("تعذر تحميل المواسم", err);
        setError(true);
      } else {
        setSeasons(data);
        setActiveSeason(open);
        setError(false);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const viewSeason = useCallback((id: number) => {
    setViewedId(id);
    try { sessionStorage.setItem(VIEWED_KEY, String(id)); } catch { /* التخزين غير متاح */ }
  }, []);

  const returnToActive = useCallback(() => {
    setViewedId(null);
    try { sessionStorage.removeItem(VIEWED_KEY); } catch { /* التخزين غير متاح */ }
  }, []);

  /* الشاشة مملوءة أصلاً بشاشة بدء ConfigProvider، فلا داعي لثانية */
  if (loading) return null;

  if (error || !activeSeason) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 6, padding: 24, textAlign: "center", direction: "rtl", fontFamily: "var(--font-body)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger)" }}>تعذر تحديد الموسم الحالي</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>يرجى التحقق من الاتصال وتحديث الصفحة</div>
      </div>
    );
  }

  /* موسم محفوظ لم يعد موجوداً (حُذف من تبويب آخر) يسقط إلى النشط
     بدل أن يترك الشجرة بلا موسم */
  const viewedSeason = seasons.find(s => s.id === viewedId) || activeSeason;
  const canWrite = viewedSeason.id === activeSeason.id;

  return (
    <SeasonContext.Provider value={{
      activeSeason, viewedSeason, seasons,
      canWrite, readOnly: !canWrite,
      viewSeason, returnToActive,
    }}>
      {children}
    </SeasonContext.Provider>
  );
}
