// ============================================================
// حذف موسم مقفل نهائياً
// ============================================================
// نقيض الإقفال تماماً: الإقفال يحفظ كل شيء ولا يحذف غير المستندات،
// وهذا يمحو الموسم وبياناته كلها بلا رجعة.
//
// ولذلك لا معالج بخطوات هنا — العملية واحدة لا تتفرّع، والوضوح
// أنفع من التدرّج: ما سيُحذف معروض، وكلمة المرور شرط، والزرّ أحمر.
//
// المستندات لا تُذكر لأنها لم تعد موجودة: حُذفت عند إقفال الموسم.
import { useState } from "react";
import { supabase } from "../supabase";
import type { User } from "../types";
import type { Season } from "../season/useSeason";
import { Modal } from "./Modal";
import { btnP, btnS, inp } from "../utils";

type Counts = { passengers: number; buses: number; camps: number; rooms: number };

interface Props {
  season: Season | null;
  counts: Counts | undefined;
  currentUser: User;
  onClose: () => void;
}

function SeasonDeleteDialog({ season, counts, currentUser, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!season) return null;

  const run = async () => {
    setBusy(true); setError("");
    const { error: err } = await supabase.functions.invoke("season-admin", {
      body: { action: "delete", username: currentUser.username, password, seasonId: season.id },
    });
    if (err) {
      /* رسالة الخادم تُستخرج من جسم الاستجابة: functions.invoke يضع
         غير الناجح في error ويترك data فارغاً */
      let message = "";
      try {
        const ctx = (err as { context?: Response }).context;
        if (ctx) message = (await ctx.json())?.error || "";
      } catch { /* الجسم ليس JSON */ }
      setError(message || "تعذّر حذف الموسم، يرجى المحاولة مرة أخرى.");
      setBusy(false);
      return;
    }
    /* المزوّد يحمّل المواسم عند التركيب وحده، فإعادة التحميل هي ما
       يُسقط الموسم المحذوف من الشاشة */
    window.location.reload();
  };

  return (
    <Modal
      show
      /* أثناء التنفيذ: لا Escape ولا نقر خارجيّ ولا ✕ */
      onClose={busy ? () => {} : () => { setPassword(""); setError(""); onClose(); }}
      title={`حذف موسم ${season.name} نهائياً`}
      maxWidth={520}
    >
      <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 700, marginBottom: 10 }}>
        ⚠ هذه العملية لا يمكن التراجع عنها.
      </div>

      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
        سيُحذف موسم {season.name} وكل ما يخصّه نهائياً:
      </div>
      <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: 12, fontSize: 12, marginBottom: 14 }}>
        {counts
          ? `${counts.passengers} حاجاً · ${counts.buses} باصات · ${counts.camps} مخيمات · ${counts.rooms} غرف`
          : "تعذّر حساب المحتوى"}
        <div style={{ marginTop: 6, color: "var(--text-muted)" }}>
          ومعها دفعاته وبنوده المالية ومجموعاته وسجلّ تنبيهاته.
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
        أدخل كلمة مرورك لتأكيد الحذف — المستخدم: <b>{currentUser.name}</b>
      </div>
      <input type="password" value={password} autoFocus disabled={busy}
        onChange={e => setPassword(e.target.value)}
        placeholder="كلمة المرور" style={inp} />

      {error && (
        <div style={{ padding: "8px 12px", marginTop: 10, borderRadius: 8, fontSize: 12,
          background: "var(--danger-bg, #fdecea)", color: "var(--danger)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={run} disabled={!password || busy}
          style={btnP({ flex: 1, background: "var(--danger)", opacity: !password || busy ? 0.6 : 1 })}>
          {busy ? "جارٍ الحذف…" : "حذف الموسم نهائياً"}
        </button>
        {!busy && (
          <button onClick={() => { setPassword(""); setError(""); onClose(); }} style={btnS()}>إلغاء</button>
        )}
      </div>
    </Modal>
  );
}

export { SeasonDeleteDialog };
