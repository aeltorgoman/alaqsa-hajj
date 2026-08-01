import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { btnS } from "../utils";

/* ═══════════════════════════════════════════════════════════════
   تقرير وصول التنبيه
   يعرض من وصله التنبيه ومن لم يصله، مع إمكانية مراسلة
   من لم يصلهم عبر الواتساب مباشرة.
   ═══════════════════════════════════════════════════════════════ */

type Row = {
  passenger_id: number;
  status: string;
  read_at: string | null;
  name: string;
  phone: string | null;
};

const LABELS: Record<string, { text: string; bg: string; fg: string }> = {
  sent: { text: "وصلت", bg: "var(--success-bg, #d1fae5)", fg: "var(--success, #065f46)" },
  read: { text: "قُرئت", bg: "var(--info-bg, #e8eff5)", fg: "var(--info, #13456b)" },
  disabled: { text: "غير مفعّل", bg: "var(--warning-bg, #fef3c7)", fg: "var(--warning, #92400e)" },
  expired: { text: "اشتراك منتهٍ", bg: "var(--danger-bg, #f7eaef)", fg: "var(--primary)" },
  failed: { text: "فشل الإرسال", bg: "var(--danger-bg, #f7eaef)", fg: "var(--primary)" },
};

function DeliveryReportModal({
  announcementId,
  announcementBody,
  onClose,
}: {
  announcementId: number;
  announcementBody: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"missed" | "delivered">("missed");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("notification_deliveries")
        .select("passenger_id, status, read_at, passengers(name_ar, short_ar, phone)")
        .eq("announcement_id", announcementId);

      const mapped: Row[] = (data || []).map((d: any) => ({
        passenger_id: d.passenger_id,
        status: d.status,
        read_at: d.read_at,
        name: d.passengers?.name_ar || d.passengers?.short_ar || `حاج رقم ${d.passenger_id}`,
        phone: d.passengers?.phone || null,
      }));

      setRows(mapped);
      setLoading(false);
    })();
  }, [announcementId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isMissed = (s: string) => s === "disabled" || s === "expired" || s === "failed";

  const total = rows.length;
  const delivered = rows.filter(r => r.status === "sent" || r.status === "read").length;
  const readCount = rows.filter(r => r.read_at).length;
  const missed = rows.filter(r => isMissed(r.status));

  const shown = view === "missed" ? missed : rows.filter(r => !isMissed(r.status));

  const waLink = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, "");
    return `https://wa.me/${clean}?text=${encodeURIComponent(announcementBody)}`;
  };

  function openAllWhatsapp() {
    const first = missed.find(r => r.phone);
    if (first?.phone) window.open(waLink(first.phone), "_blank");
  }

  const kpi = (n: number, label: string, bg: string, fg: string) => (
    <div style={{ background: bg, borderRadius: "var(--radius-md)", padding: "12px 10px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: fg, lineHeight: 1.15 }}>{n}</div>
      <div style={{ fontSize: 11, color: fg, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(20,8,14,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", width: 760, maxWidth: "100%", height: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>

        {/* الرأس */}
        <div style={{ background: "var(--primary)", color: "var(--text-inverse)", padding: "15px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>تقرير وصول التنبيه</div>
            <div style={{ fontSize: 11.5, opacity: .8, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{announcementBody}</div>
          </div>
          <button onClick={onClose}
            style={{ background: "rgba(255,255,255,.15)", border: "none", color: "inherit", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 17, fontFamily: "inherit", lineHeight: 1 }}>×</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>جارٍ تحميل التقرير...</div>
        ) : total === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13, lineHeight: 2 }}>
            لا يوجد سجل وصول لهذا التنبيه.<br />
            التنبيهات المرسلة قبل تفعيل خاصية الإشعارات لا تحتوي على سجل.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, padding: "16px 20px 8px" }}>
              {kpi(total, "إجمالي المستهدفين", "var(--bg-hover)", "var(--text-main)")}
              {kpi(delivered, "وصلت بنجاح", "var(--success-bg, #d1fae5)", "var(--success, #065f46)")}
              {kpi(readCount, "قُرئت", "var(--info-bg, #e8eff5)", "var(--info, #13456b)")}
              {kpi(missed.length, "لم تصل", "var(--danger-bg, #f7eaef)", "var(--primary)")}
            </div>

            {/* التبويبات */}
            <div style={{ display: "flex", gap: 4, padding: "6px 20px 0", borderBottom: "1px solid var(--border)" }}>
              {[{ id: "missed", l: "لم تصل", n: missed.length }, { id: "delivered", l: "وصلت", n: total - missed.length }].map(t => (
                <button key={t.id} onClick={() => setView(t.id as typeof view)}
                  style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, padding: "8px 14px 9px", color: view === t.id ? "var(--primary)" : "var(--text-muted)", borderBottom: view === t.id ? "2.5px solid var(--primary)" : "2.5px solid transparent" }}>
                  {t.l} ({t.n})
                </button>
              ))}
            </div>

            {/* الجدول */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px 16px" }}>
              {shown.length === 0 && (
                <div style={{ padding: 26, textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>لا توجد سجلات في هذه القائمة.</div>
              )}
              {shown.map((r, i) => {
                const lb = LABELS[r.read_at ? "read" : r.status] || LABELS.failed;
                return (
                  <div key={r.passenger_id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: i < shown.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", width: 26, flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-main)" }}>{r.name}</div>
                      {r.phone && <div style={{ fontSize: 11, color: "var(--text-muted)", direction: "ltr", textAlign: "right" }}>{r.phone}</div>}
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, background: lb.bg, color: lb.fg, padding: "3px 11px", borderRadius: 99, flexShrink: 0 }}>{lb.text}</span>
                    {isMissed(r.status) && r.phone && (
                      <a href={waLink(r.phone)} target="_blank" rel="noreferrer"
                        style={{ ...btnS(), fontSize: 10.5, padding: "4px 12px", textDecoration: "none", flexShrink: 0 }}>واتساب</a>
                    )}
                  </div>
                );
              })}
            </div>

            {missed.length > 0 && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
                <button onClick={openAllWhatsapp} style={{ ...btnS(), fontSize: 12, padding: "8px 16px" }}>
                  مراسلة أول من لم يصله عبر الواتساب
                </button>
                <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center" }}>
                  المتصفح يمنع فتح عدة نوافذ دفعة واحدة، فيُفتح واحد في كل مرة.
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { DeliveryReportModal };
