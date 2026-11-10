/* ═══ تعديلُ تنبيه — Phase 1 ═══
   العنوانُ والنصُّ والأولويةُ والانتهاء، بنداءٍ واحد (`update_announcement`): القاعدةُ
   ترفع نسخةَ المحتوى إن تغيّر العنوان أو النصّ، وتُصفّر جولةَ الدفع لمنشورٍ سارٍ فيُعاد
   إلى جمهوره المجمَّد نفسه. والأولويةُ والانتهاءُ وحدهما لا يُعيدان الدفع.
   الجمهورُ وموعدُ الظهور لا يُعدَّلان هنا: يُجمَّدان عند النشر. */
import { useState } from "react";
import { Modal } from "../Modal";
import { btnP, btnS, inp } from "../../utils";

export type EditableAnnouncement = {
  id: number; title: string | null; body: string; priority: string; show_at: string; expires_at: string | null;
};

const PRIORITIES = ["عاجل", "مهم", "عام"];

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  ann: EditableAnnouncement;
  saving: boolean;
  onCancel: () => void;
  onSave: (v: { title: string | null; body: string; priority: string; expires_at: string | null }) => void;
};

export function AnnouncementEditModal({ ann, saving, onCancel, onSave }: Props) {
  const [title, setTitle] = useState(ann.title || "");
  const [body, setBody] = useState(ann.body);
  const [priority, setPriority] = useState(ann.priority);
  const [hasExpiry, setHasExpiry] = useState(!!ann.expires_at);
  const [expiresAt, setExpiresAt] = useState(() =>
    toLocalInput(ann.expires_at ? new Date(ann.expires_at) : new Date(Math.max(Date.now(), new Date(ann.show_at).getTime()) + 24 * 3600000)));
  const [err, setErr] = useState("");

  /* يُحسب مرّةً عند الفتح: هل نُشر التنبيه؟ (للرسالة وحدها؛ القاعدةُ هي من يقرّر الدفع) */
  const [published] = useState(() => new Date(ann.show_at).getTime() <= Date.now());
  const contentChanged = title.trim() !== (ann.title || "").trim() || body.trim() !== ann.body.trim();

  function submit() {
    if (!body.trim()) { setErr("نص التنبيه مطلوب."); return; }
    let exp: string | null = null;
    if (hasExpiry) {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) { setErr("يرجى اختيار تاريخ ووقت صحيحين للانتهاء."); return; }
      if (d.getTime() <= new Date(ann.show_at).getTime()) { setErr("وقت الانتهاء يجب أن يكون بعد وقت الظهور."); return; }
      exp = d.toISOString();
    }
    setErr("");
    onSave({ title: title.trim() || null, body: body.trim(), priority, expires_at: exp });
  }

  return (
    <Modal show onClose={saving ? () => {} : onCancel} title="تعديل التنبيه" maxWidth={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان التنبيه" style={inp} />
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={6}
          style={{ ...inp, resize: "vertical", lineHeight: 1.9 }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>الأولوية</div>
          <div style={{ display: "flex", gap: 6 }}>
            {PRIORITIES.map(p => (
              <button key={p} type="button" onClick={() => setPriority(p)}
                style={{ border: priority === p ? "2px solid var(--primary)" : "1px solid var(--border)", background: priority === p ? "var(--primary)" : "var(--bg-card)", color: priority === p ? "var(--text-inverse)" : "var(--text-main)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "5px 15px", cursor: "pointer", fontFamily: "inherit" }}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-main)", cursor: "pointer" }}>
            <input type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} />
            ينتهي في
          </label>
          {hasExpiry && <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ ...inp, width: "auto", padding: "6px 10px" }} />}
          {!hasExpiry && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>بدون انتهاء</span>}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.8, color: "var(--text-muted)", background: "var(--bg-hover)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
          {!contentChanged
            ? "تغيير الأولوية أو الانتهاء لا يُرسل إشعاراً جديداً."
            : published
              ? "تعديل العنوان أو النص يُعلِّم التنبيه «مُحدَّثاً» لدى جمهوره، ويُرسل إشعاراً جديداً إلى الجمهور نفسه الذي نُشر له. الإشعار الذي وصل سابقاً لا يُسترجع."
              : "التنبيه مجدول: سيُرسل بالمحتوى الجديد عند موعده، لا قبله."}
        </div>
        {err && <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 700 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onCancel} disabled={saving} style={btnS()}>إلغاء</button>
          <button type="button" onClick={submit} disabled={saving} style={{ ...btnP(), opacity: saving ? 0.6 : 1 }}>
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
