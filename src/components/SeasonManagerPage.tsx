// ============================================================
// إدارة المواسم — المرجع الوحيد لدورة حياة الموسم
// ============================================================
// هذه الصفحة لا تعرض بيانات موسم إطلاقاً. التطبيق كلّه صار يعرض
// أي موسم بعد م٤، فلا حاجة لصفحة أرشيف موازية بتقاريرها الخاصة.
// مسؤوليتها الوحيدة: المواسم نفسها — تصفّحها والانتقال إليها،
// ولاحقاً إقفالها وحذفها.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useSeason } from "../season/useSeason";
import type { Season } from "../season/useSeason";
import { AlertModal, useAlert } from "./AlertModal";
import { SeasonCloseWizard } from "./SeasonCloseWizard";
import { SeasonDeleteDialog } from "./SeasonDeleteDialog";
import type { User } from "../types";
import { btnP } from "../utils";

/* عدّادات الموسم — أربعة أرقام لا صفوف. تُجلب بـ head+count فلا
   ينتقل جسم أي صفّ عبر الشبكة. */
type Counts = { passengers: number; buses: number; camps: number; rooms: number };

const TABLES = ["passengers", "buses", "camps", "rooms"] as const;

/* مدة الموسم بالأيام — من الفتح إلى الإقفال، أو إلى اليوم إن كان
   ما زال نشطاً. تُعرض عند مراجعة المواسم القديمة. */
function durationDays(from: string | null, to: string | null): number | null {
  if (!from) return null;
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 86400000);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function SeasonManagerPage({ currentUser }: { currentUser: User }) {
  const { alert: alertState, showAlert } = useAlert();
  /* ⚠️ activeSeason لا viewedSeason — الصفحة تدير المواسم من فوقها
     لا من داخلها. لو تصفّح المستخدم موسماً مؤرشفاً ثم فتحها، يجب
     أن يرى الموسم النشط في بطاقة النشط لا الموسم الذي يتصفّحه.
     هذا الموضع والثاني في تبويب تنبيهات البوابة هما الوحيدان في
     التطبيق اللذان يقرآن activeSeason. لا تُصحّحه إلى viewedSeason. */
  const { activeSeason, seasons, viewSeason } = useSeason();

  const [showClose, setShowClose] = useState(false);
  const [toDelete, setToDelete] = useState<Season | null>(null);
  const [counts, setCounts] = useState<Record<number, Counts>>({});
  const [countsError, setCountsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        seasons.flatMap(s =>
          TABLES.map(t =>
            supabase.from(t).select("id", { count: "exact", head: true }).eq("season_id", s.id)
              .then(({ count, error }) => ({ id: s.id, t, count: count ?? 0, error }))
          )
        )
      );
      if (cancelled) return;
      /* الفشل يُبلَّغ عنه بدل عرض أصفار تبدو كموسم فارغ — والفرق
         بين «صفر حاج» و«تعذّر العدّ» جوهريّ قبل إقفال موسم */
      if (results.some(r => r.error)) {
        console.error("تعذر حساب عدّادات المواسم", results.find(r => r.error)?.error);
        setCountsError(true);
        return;
      }
      const map: Record<number, Counts> = {};
      for (const s of seasons) map[s.id] = { passengers: 0, buses: 0, camps: 0, rooms: 0 };
      for (const r of results) map[r.id][r.t] = r.count;
      setCounts(map);
      setCountsError(false);
    })();
    return () => { cancelled = true; };
  }, [seasons]);

  const closed = seasons.filter(s => s.closed_at !== null);

  const countLine = (id: number) => {
    if (countsError) return "تعذّر حساب المحتوى";
    const c = counts[id];
    if (!c) return "…";
    return `${c.passengers} حاجاً · ${c.buses} باصات · ${c.camps} مخيمات · ${c.rooms} غرف`;
  };

  return (
    <div style={{ padding: 20, fontFamily: "var(--font-body)", direction: "rtl" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>إدارة المواسم</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
        الموسم النشط تُضاف إليه البيانات الجديدة. المواسم السابقة للعرض فقط.
      </div>

      {/* ── الموسم النشط ── */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--em7)" }}>{activeSeason.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--success-bg)", color: "var(--success)" }}>نشط</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
          بدأ في {fmtDate(activeSeason.created_at)}
          {durationDays(activeSeason.created_at, null) !== null &&
            ` · مستمرّ منذ ${durationDays(activeSeason.created_at, null)} يوماً`}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{countLine(activeSeason.id)}</div>
        <button onClick={() => setShowClose(true)} style={btnP({ marginTop: 12 })}>إقفال الموسم</button>
      </div>

      {/* ── المواسم السابقة ── */}
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
        المواسم السابقة {closed.length > 0 && <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>({closed.length})</span>}
      </div>

      {closed.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "var(--text-muted)", background: "var(--paper)", border: "1px dashed var(--line)", borderRadius: 12 }}>
          لم يُقفل أي موسم بعد.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {closed.map(s => (
            <div key={s.id} style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{s.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--bg-2)", color: "var(--text-muted)" }}>مقفل</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>
                  بدأ في {fmtDate(s.created_at)} · أُقفل في {fmtDate(s.closed_at)}
                  {s.closed_by ? ` · بواسطة ${s.closed_by}` : ""}
                  {durationDays(s.created_at, s.closed_at) !== null &&
                    ` · استمرّ ${durationDays(s.created_at, s.closed_at)} يوماً`}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{countLine(s.id)}</div>
              </div>
              {/* الزرّان في حاوية واحدة ليبقيا متجاورين عند الالتفاف */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => {
                  viewSeason(s.id);
                  /* الغرض من الدخول تصفّح البيانات، فينتقل المستخدم
                     إلى الحجاج بدل أن يبقى في شاشة لا تعرض شيئاً */
                  window.dispatchEvent(new CustomEvent("hajj_goto_page", { detail: "passengers" }));
                  showAlert("success", `أنت الآن تتصفّح موسم ${s.name} — للعرض فقط.`);
                }}
                style={btnP()}
              >
                تصفّح هذا الموسم
              </button>
              <button onClick={() => setToDelete(s)}
                style={{ background: "var(--female-bg)", border: "none", color: "var(--danger)", padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                حذف
              </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SeasonCloseWizard
        show={showClose}
        onClose={() => setShowClose(false)}
        activeSeason={activeSeason}
        counts={counts[activeSeason.id]}
        currentUser={currentUser}
        existingNames={seasons.map(s => s.name)}
        onGoToNewSeason={() => { sessionStorage.setItem("hajj_page", "passengers"); window.location.reload(); }}
      />

      <SeasonDeleteDialog
        season={toDelete}
        counts={toDelete ? counts[toDelete.id] : undefined}
        currentUser={currentUser}
        onClose={() => setToDelete(null)}
      />

      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
    </div>
  );
}

export { SeasonManagerPage };
