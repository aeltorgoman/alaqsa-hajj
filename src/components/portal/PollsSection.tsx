/* ═══ استطلاعاتُ الحاجّ — داخل تبويب التنبيهات (Phase 3) ═══
   لا تبويبَ رابع. بطاقةٌ لكلّ استطلاعٍ في جمهور الحاجّ المجمَّد، بحالاتٍ ثلاثٍ متمايزة:
   بانتظار إجابتك · أجبت (أو نهائيّة) · مغلق. والتصويتُ من الأب (`onSubmit`) بالجلسة وحدها:
   لا معرّفَ حاجٍّ من الواجهة، ورقمُ المراجعة المرئيّ يُرسَل، ولا يُكتب فوق إجابةٍ أحدث. */
import { useId, useRef, useState } from "react";
import { INK, BODY, LABEL, LINE, type PortalTheme } from "./portal.theme";
import { cardStyle } from "./portal.styles";
import type { PortalPoll } from "./portal.types";
import { pollPhase, sameIds, selectionError, type PollOutcome } from "./portal.polls";

type Props = {
  t: PortalTheme;
  polls: PortalPoll[];
  pending: number;
  onSubmit: (p: PortalPoll, optionIds: number[]) => Promise<PollOutcome>;
};

const fmt = (iso: string) => new Date(iso).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
const TONE = {
  success: { bg: "#e6f4ec", fg: "#1c6b45" }, info: { bg: "#eef3f8", fg: "#1f4e79" },
  warning: { bg: "#fdf3dc", fg: "#7a5200" }, error: { bg: "#fbe9ea", fg: "#9b1c25" },
} as const;

export function PollsSection({ t, polls, pending, onSubmit }: Props) {
  if (polls.length === 0) return null;
  return (
    <section aria-labelledby="pp-polls-h" className="pp-polls" data-portal-polls>
      <style>{`.pp-polls label:has(input:focus-visible){outline:3px solid ${t.brand};outline-offset:2px}.pp-polls button:focus-visible{outline:3px solid ${t.brand};outline-offset:2px}`}</style>
      {/* رأسُ القسم بطاقةٌ بيضاء: أوّلُ التبويب يعلو حافّةَ الترويسة الداكنة (marginTop −36)، فنصٌّ عارٍ لا يُرى */}
      <div style={{ ...cardStyle, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 id="pp-polls-h" style={{ fontSize: 19, fontWeight: 900, color: INK, fontFamily: t.fontD, margin: 0 }}>استطلاعات الحملة</h2>
        {pending > 0 && <span style={{ fontSize: 13.5, fontWeight: 900, fontFamily: t.fontD, background: "#C1121F", color: "#fff", padding: "4px 12px", borderRadius: 99 }}>بانتظار إجابتك ({pending})</span>}
      </div>
      {polls.map(p => <PollCard key={p.id} t={t} p={p} onSubmit={onSubmit} />)}
    </section>
  );
}

function PollCard({ t, p, onSubmit }: { t: PortalTheme; p: PortalPoll; onSubmit: Props["onSubmit"] }) {
  const uid = useId();
  const phase = pollPhase(p);
  const recorded = (p.my_response?.option_ids || []).slice();
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<number[]>(recorded);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: keyof typeof TONE; text: string } | null>(null);
  const [selErr, setSelErr] = useState<string | null>(null);
  /* الإرسالُ مرّةً واحدة: ضغطتان سريعتان تصلان قبل أن تُعرض حالةُ الانشغال، فالحارسُ مرجعٌ لا حالة */
  const inFlight = useRef(false);
  /* الإجابةُ المسجَّلة تغيّرت من الخادم (تحديثٌ أو ردّ stale/final) ولا تعديلَ جارٍ: يتبعها الاختيارُ.
     تعديلُ الحالة أثناء العرض (لا في أثر) هو نمطُ React لاشتقاقٍ من خاصّيّة. */
  const recordedKey = `${p.my_response?.revision ?? 0}:${recorded.join(",")}`;
  const [seenKey, setSeenKey] = useState(recordedKey);
  if (seenKey !== recordedKey) { setSeenKey(recordedKey); if (!editing) setSel(recorded); }

  const canPick = phase === "open-unanswered" || (phase === "open-answered" && editing);
  const options = p.options || [];
  const max = p.kind === "multiple" ? (p.max_choices || options.length) : 1;

  const toggle = (id: number) => {
    if (!canPick) return;
    setSelErr(null); setMsg(null);
    if (p.kind === "single") setSel([id]);
    else setSel(s => (s.includes(id) ? s.filter(x => x !== id) : s.length >= max ? s : [...s, id]));
  };

  async function submit() {
    if (inFlight.current) return;
    const e = selectionError(p, sel);
    if (e) { setSelErr(e); return; }
    if (phase === "open-answered" && sameIds(sel, recorded)) { setEditing(false); setMsg({ tone: "info", text: "لم تغيّر إجابتك." }); return; }
    inFlight.current = true; setBusy(true); setMsg(null);
    try {
      const o = await onSubmit(p, sel);
      if (o.expired) return;
      setMsg({ tone: o.tone, text: o.text });
      if (o.adopt) setSel(o.adopt.option_ids);
      setEditing(!!o.keepEditing && p.allow_answer_changes);
    } finally { inFlight.current = false; setBusy(false); }
  }

  const status = phase === "closed" ? { l: "مغلق", bg: "#ece7e3", fg: BODY }
    : phase === "open-unanswered" ? { l: "بانتظار إجابتك", bg: "#C1121F", fg: "#fff" }
    : phase === "open-final" ? { l: "🔒 إجابة نهائية", bg: "#e6f4ec", fg: "#1c6b45" }
    : { l: "✓ تمت الإجابة", bg: "#e6f4ec", fg: "#1c6b45" };
  const accent = phase === "open-unanswered" ? t.gold : phase === "closed" ? LINE : "#1c6b45";
  const titleId = `${uid}-t`, hintId = `${uid}-h`;

  return (
    <article id={`poll-${p.id}`} data-phase={phase} aria-labelledby={titleId}
      style={{ ...cardStyle, borderRight: `5px solid ${accent}`, padding: "15px 17px", textAlign: "start", opacity: phase === "closed" ? 0.92 : 1,
               boxShadow: phase === "open-unanswered" ? `0 0 0 2px ${t.gold}55` : cardStyle.boxShadow }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontFamily: t.fontD, background: `${t.brand}14`, color: t.brand, padding: "4px 12px", borderRadius: 99, fontWeight: 900 }}>استطلاع</span>
        <span data-poll-status style={{ fontSize: 13, fontFamily: t.fontD, background: status.bg, color: status.fg, padding: "4px 12px", borderRadius: 99, fontWeight: 900 }}>{status.l}</span>
      </div>
      <h3 id={titleId} style={{ fontSize: 20, color: INK, fontWeight: 900, margin: "10px 0 0", lineHeight: 1.7, fontFamily: t.fontD, overflowWrap: "anywhere" }}>{p.title}</h3>
      {p.body && <div style={{ fontSize: 17, color: INK, fontWeight: 600, marginTop: 6, lineHeight: 2, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.body}</div>}

      <div id={hintId} style={{ fontSize: 14, color: LABEL, fontWeight: 700, marginTop: 8, lineHeight: 1.9 }}>
        {p.kind === "single" ? "اختر إجابة واحدة." : p.max_choices ? `يمكنك اختيار حتى ${p.max_choices} إجابات.` : "يمكنك اختيار أكثر من إجابة."}
        {phase !== "closed" && (p.allow_answer_changes ? " ويمكنك تغيير إجابتك ما دام الاستطلاع مفتوحاً." : " إجابتك الأولى نهائية ولا يمكن تغييرها.")}
        {p.closes_at && phase !== "closed" && <div>يُغلق في {fmt(p.closes_at)}</div>}
      </div>

      <fieldset aria-labelledby={titleId} aria-describedby={hintId} disabled={!canPick || busy}
        style={{ border: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 8, minWidth: 0 }}>
        {options.map(o => {
          const on = sel.includes(o.id);
          const mine = recorded.includes(o.id);
          const full = p.kind === "multiple" && !on && sel.length >= max;
          return (
            <label key={o.id} data-option={o.id}
              style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, padding: "8px 14px", borderRadius: 14,
                       border: `2px solid ${on ? t.brand : LINE}`, background: on ? `${t.brand}0d` : "#fff",
                       cursor: canPick && !full ? "pointer" : "default", opacity: canPick && full ? 0.55 : 1 }}>
              <input type={p.kind === "single" ? "radio" : "checkbox"} name={`poll-${p.id}`} checked={on} disabled={!canPick || busy || full}
                onChange={() => toggle(o.id)} style={{ width: 22, height: 22, accentColor: t.brand, flexShrink: 0, margin: 0 }} />
              <span style={{ flex: 1, fontSize: 17, fontWeight: on ? 800 : 600, color: INK, lineHeight: 1.7, overflowWrap: "anywhere" }}>{o.label}</span>
              {mine && !canPick && <span style={{ fontSize: 12.5, fontWeight: 900, color: "#1c6b45", fontFamily: t.fontD, whiteSpace: "nowrap" }}>إجابتك</span>}
            </label>
          );
        })}
      </fieldset>
      {selErr && <div role="alert" style={{ fontSize: 14.5, color: "#9b1c25", fontWeight: 800, marginTop: 8 }}>{selErr}</div>}

      <div aria-live="polite" role="status">
        {msg && <div data-poll-msg={msg.tone} style={{ marginTop: 10, background: TONE[msg.tone].bg, color: TONE[msg.tone].fg, borderRadius: 12, padding: "10px 14px", fontSize: 15, fontWeight: 800, lineHeight: 1.8 }}>{msg.text}</div>}
      </div>

      {phase === "closed" && (
        <div style={{ fontSize: 14.5, color: BODY, fontWeight: 700, marginTop: 10 }}>
          أُغلق هذا الاستطلاع{p.my_response ? " — إجابتك مسجّلة أعلاه." : " ولم تُسجَّل لك إجابة."}
        </div>
      )}
      {phase === "open-final" && !msg && <div style={{ fontSize: 14.5, color: "#1c6b45", fontWeight: 800, marginTop: 10 }}>سُجّلت إجابتك، وهي نهائية في هذا الاستطلاع.</div>}

      {phase !== "closed" && phase !== "open-final" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {canPick ? <>
            <button type="button" onClick={submit} disabled={busy} aria-busy={busy}
              style={{ background: t.brand, color: "#fff", border: "none", borderRadius: 14, padding: "0 22px", minHeight: 48, fontSize: 16.5, fontWeight: 900, fontFamily: t.fontD, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "جارٍ الإرسال..." : phase === "open-answered" ? "حفظ التعديل" : p.allow_answer_changes ? "إرسال الإجابة" : "إرسال الإجابة النهائية"}
            </button>
            {phase === "open-answered" && (
              <button type="button" disabled={busy} onClick={() => { setEditing(false); setSel(recorded); setSelErr(null); }}
                style={{ background: "#fff", color: BODY, border: `1.5px solid ${LINE}`, borderRadius: 14, padding: "0 18px", minHeight: 48, fontSize: 15.5, fontWeight: 800, fontFamily: t.fontD, cursor: "pointer" }}>
                إلغاء
              </button>
            )}
          </> : (
            <button type="button" onClick={() => { setEditing(true); setMsg(null); }}
              style={{ background: "#fff", color: t.brand, border: `2px solid ${t.brand}`, borderRadius: 14, padding: "0 20px", minHeight: 48, fontSize: 16, fontWeight: 900, fontFamily: t.fontD, cursor: "pointer" }}>
              تعديل الإجابة
            </button>
          )}
        </div>
      )}
    </article>
  );
}
