/* ═══ نموذجُ الاستطلاع — إنشاءٌ وتعديلُ مسوّدةٍ أو مجدوَل (Phase 3) ═══
   مضمَّنٌ في الصفحة كصندوق إرسال التنبيهات، لا نافذة. الجمهورُ بـAudiencePicker نفسِه
   (Phase 1): اختيارُ عنصرٍ يُلغي «جميع الحجاج»، وتفعيلُها يُفرغ العناصر، و«الجميع» للحجّاج
   وحدهم ما لم يُختر نوعٌ آخر صراحةً. والعددُ من announcement_audience_preview — الدالّةُ
   نفسُها (`_announcement_audience_members`) التي يُجمَّد بها جمهورُ الاستطلاع عند النشر. */
import { useEffect, useId, useState } from "react";
import { supabase } from "../../supabase";
import { btnP, btnS, inp } from "../../utils";
import { AudiencePicker } from "../announcements/AudiencePicker";
import { audienceIsEmpty, cleanAudience, type Audience } from "../announcements/audience";
import { LIMITS, validateForm, type PollForm, type PollRow, type PublishMode, type ValidForm } from "./polls";

type Props = {
  seasonId: number;
  form: PollForm;
  setForm: (f: PollForm) => void;
  editing: PollRow | null;
  saving: boolean;
  onSubmit: (v: ValidForm, mode: PublishMode) => void;
  onCancel: () => void;
  onNames: (n: Record<string, Record<number, string>>) => void;
};

const label = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6, display: "block" } as const;
const errStyle = { fontSize: 11.5, color: "var(--danger)", fontWeight: 700, marginTop: 5, lineHeight: 1.7 } as const;
const pill = (on: boolean) => ({
  border: on ? "2px solid var(--primary)" : "1px solid var(--border)", background: on ? "var(--primary)" : "var(--bg-card)",
  color: on ? "var(--text-inverse)" : "var(--text)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "6px 15px",
  cursor: "pointer", fontFamily: "inherit", minHeight: 32,
});

export function PollFormPanel({ seasonId, form, setForm, editing, saving, onSubmit, onCancel, onNames }: Props) {
  const uid = useId();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const set = <K extends keyof PollForm>(k: K, v: PollForm[K]) => setForm({ ...form, [k]: v });

  /* عددُ المستهدفين الآن — للمعاينة وحدها؛ والجمهورُ يُجمَّد في القاعدة عند النشر الفعليّ */
  const audienceKey = JSON.stringify(cleanAudience(form.audience));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = JSON.parse(audienceKey) as Audience;
      if (audienceIsEmpty(a)) { setCount(0); setCountError(false); return; }
      const { data, error } = await supabase.rpc("announcement_audience_preview", { p_audience: a });
      if (cancelled) return;
      if (error) { setCount(null); setCountError(true); return; }
      setCount((data || []).length); setCountError(false);
    })();
    return () => { cancelled = true; };
  }, [audienceKey]);

  const modes: { id: PublishMode; l: string }[] = editing?.status === "scheduled"
    ? [{ id: "scheduled", l: "مجدول" }, { id: "draft", l: "إلغاء الجدولة (مسودة)" }]
    : [{ id: "now", l: "الآن" }, { id: "scheduled", l: "مجدول" }, { id: "draft", l: "مسودة (بلا نشر)" }];
  const submitLabel = saving ? "جارٍ الحفظ..."
    : form.mode === "now" ? (editing ? "حفظ ونشر الآن" : "نشر الاستطلاع")
    : form.mode === "scheduled" ? (editing ? "حفظ الجدولة" : "جدولة الاستطلاع")
    : editing?.status === "scheduled" ? "حفظ وإلغاء الجدولة" : "حفظ المسودة";

  function submit() {
    if (saving) return;
    const v = validateForm(form);
    setErrors(v.errors);
    if (!v.payload) {
      const first = Object.keys(v.errors)[0];
      document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    onSubmit(v, form.mode);
  }

  const err = (k: string) => errors[k] ? <div id={`${uid}-${k}-err`} role="alert" style={errStyle}>{errors[k]}</div> : null;
  const described = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${uid}-${k}-err` } : {});

  return (
    <section aria-label={editing ? "تعديل الاستطلاع" : "استطلاع جديد"} data-poll-form
      style={{ background: "var(--bg-card)", border: editing ? "2px solid var(--primary)" : "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>
          {editing ? `تعديل ${editing.status === "scheduled" ? "استطلاع مجدول" : "مسودة"}` : "استطلاع جديد"}
        </div>
        {editing && <button type="button" onClick={onCancel} disabled={saving} style={{ ...btnS(), fontSize: 11.5 }}>إلغاء التعديل</button>}
      </div>

      {/* السؤال */}
      <label htmlFor={`${uid}-title`} style={label}>سؤال الاستطلاع</label>
      <input id={`${uid}-title`} value={form.title} maxLength={LIMITS.title} onChange={e => set("title", e.target.value)} {...described("title")}
        placeholder="مثال: ما الوقت المناسب لك لزيارة المدينة المنورة؟" style={{ ...inp, fontSize: 13 }} />
      {err("title")}

      <label htmlFor={`${uid}-body`} style={{ ...label, marginTop: 10 }}>توضيح (اختياري)</label>
      <textarea id={`${uid}-body`} value={form.body} maxLength={LIMITS.body} rows={2} onChange={e => set("body", e.target.value)} {...described("body")}
        placeholder="تفاصيل تساعد الحاج على الإجابة" style={{ ...inp, resize: "vertical", lineHeight: 1.9 }} />
      {err("body")}

      {/* النوع والحد */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12 }}>
        <div>
          <span id={`${uid}-kind-l`} style={label}>نوع الاستطلاع</span>
          <div role="radiogroup" aria-labelledby={`${uid}-kind-l`} style={{ display: "flex", gap: 6 }}>
            {([["single", "اختيار واحد"], ["multiple", "اختيار متعدد"]] as const).map(([k, l]) => (
              <button type="button" key={k} role="radio" aria-checked={form.kind === k} onClick={() => setForm({ ...form, kind: k, maxChoices: k === "single" ? "" : form.maxChoices })} style={pill(form.kind === k)}>{l}</button>
            ))}
          </div>
        </div>
        {form.kind === "multiple" && (
          <div>
            <label htmlFor={`${uid}-maxChoices`} style={label}>أقصى عدد للاختيارات (اختياري)</label>
            <input id={`${uid}-maxChoices`} type="number" inputMode="numeric" min={1} max={form.options.length} value={form.maxChoices}
              onChange={e => set("maxChoices", e.target.value)} {...described("maxChoices")} placeholder="بلا حد" style={{ ...inp, width: 120 }} />
            {err("maxChoices")}
          </div>
        )}
      </div>

      {/* الخيارات */}
      <fieldset style={{ border: "none", padding: 0, margin: "14px 0 0" }}>
        <legend style={label}>الخيارات ({form.options.length} من {LIMITS.maxOptions})</legend>
        <div id={`${uid}-options`} tabIndex={-1} style={{ display: "grid", gap: 6 }}>
          {form.options.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span aria-hidden style={{ fontSize: 11, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
              <input value={o} maxLength={LIMITS.option} aria-label={`الخيار ${i + 1}`} {...described("options")}
                onChange={e => set("options", form.options.map((x, j) => (j === i ? e.target.value : x)))} style={inp} />
              <button type="button" aria-label={`حذف الخيار ${i + 1}`} disabled={form.options.length <= LIMITS.minOptions}
                onClick={() => set("options", form.options.filter((_, j) => j !== i))}
                style={{ ...btnS(), padding: "6px 10px", opacity: form.options.length <= LIMITS.minOptions ? 0.4 : 1 }}>✕</button>
            </div>
          ))}
        </div>
        {err("options")}
        {form.options.length < LIMITS.maxOptions && (
          <button type="button" onClick={() => set("options", [...form.options, ""])} style={{ ...btnS(), marginTop: 8, fontSize: 11.5 }}>+ إضافة خيار</button>
        )}
      </fieldset>

      {/* تغيير الإجابة */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "10px 12px", background: "var(--bg-2)", borderRadius: "var(--radius-md)" }}>
        <div style={{ flex: 1 }}>
          <div id={`${uid}-allow-l`} style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>السماح بتغيير الإجابة</div>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.7 }}>
            {form.allowChanges ? "يستطيع الحاج تعديل إجابته ما دام الاستطلاع مفتوحاً." : "أول إجابة يرسلها الحاج نهائية ولا تُغيَّر."}
          </div>
        </div>
        <button type="button" role="switch" aria-checked={form.allowChanges} aria-labelledby={`${uid}-allow-l`} onClick={() => set("allowChanges", !form.allowChanges)}
          style={{ width: 44, height: 25, borderRadius: 99, border: "none", background: form.allowChanges ? "var(--primary)" : "var(--border)", position: "relative", cursor: "pointer", flexShrink: 0, padding: 0 }}>
          <span style={{ position: "absolute", top: 3, insetInlineStart: form.allowChanges ? 22 : 3, width: 19, height: 19, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }} />
        </button>
      </div>

      {/* الجمهور */}
      <div style={{ marginTop: 14 }} id={`${uid}-audience`} tabIndex={-1}>
        <span style={label}>المستهدفون — يمكن الجمع بين أكثر من فئة، ويُحتسب كل حاج مرة واحدة</span>
        <AudiencePicker seasonId={seasonId} value={form.audience} onChange={a => set("audience", a)} onNames={onNames} />
        {err("audience")}
        {!errors.audience && (countError
          ? <div style={{ ...errStyle, marginTop: 9 }}>تعذر حساب عدد المستهدفين. يرجى المحاولة مرة أخرى.</div>
          : count !== null && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 9 }} aria-live="polite">
              يستهدف الآن <b style={{ color: "var(--text)" }}>{count}</b> من الحجاج — ويُجمَّد الجمهور عند النشر الفعلي.
            </div>)}
      </div>

      {/* المواعيد */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 14 }}>
        <div>
          <span id={`${uid}-mode-l`} style={label}>النشر</span>
          <div role="radiogroup" aria-labelledby={`${uid}-mode-l`} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {modes.map(m => <button type="button" key={m.id} role="radio" aria-checked={form.mode === m.id} onClick={() => set("mode", m.id)} style={pill(form.mode === m.id)}>{m.l}</button>)}
            {form.mode === "scheduled" && (
              <input id={`${uid}-publishAt`} type="datetime-local" aria-label="موعد النشر" value={form.publishAt} onChange={e => set("publishAt", e.target.value)}
                {...described("publishAt")} style={{ ...inp, width: "auto", padding: "6px 10px" }} />
            )}
          </div>
          {err("publishAt")}
        </div>
        <div>
          <span style={label}>الإغلاق</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text)", cursor: "pointer", minHeight: 32 }}>
              <input type="checkbox" checked={form.hasClose} onChange={e => set("hasClose", e.target.checked)} />
              يُغلق تلقائياً في موعد محدد
            </label>
            {form.hasClose && (
              <input id={`${uid}-closesAt`} type="datetime-local" aria-label="موعد الإغلاق" value={form.closesAt} onChange={e => set("closesAt", e.target.value)}
                {...described("closesAt")} style={{ ...inp, width: "auto", padding: "6px 10px" }} />
            )}
          </div>
          {err("closesAt")}
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.8 }}>
        بعد النشر لا يتغيّر السؤال ولا الخيارات ولا الجمهور ولا إعداد تغيير الإجابة.
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" data-poll-submit onClick={submit} disabled={saving} aria-busy={saving} style={{ ...btnP(), opacity: saving ? .6 : 1, padding: "9px 26px", minHeight: 38 }}>
          {submitLabel}
        </button>
      </div>
    </section>
  );
}
