/* ═══ إدارةُ الاستطلاعات — تبويبٌ في «بوابة الحاج» (Phase 3) ═══
   القراءةُ من `polls` و`poll_options` (سياسةُ manage_portal للقراءة وحدها)، وكلُّ كتابةٍ بدوالّ
   Phase 2 — لا كتابةَ مباشرة على جداول الاستطلاعات. ولا يُعلَن نجاحٌ قبل أن تؤكّده القاعدة.
   الموسمُ النشط لا المعروض، كالتنبيهات: البوابةُ تخدم النشطَ وحده، والقاعدةُ ترفض غيره. */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../supabase";
import { AlertModal, ConfirmModal, useAlert, useConfirm } from "../AlertModal";
import { btnS } from "../../utils";
import { useSeason } from "../../season/useSeason";
import { describeAudience } from "../announcements/audience";
import { PollFormPanel } from "./PollFormPanel";
import { PollResults } from "./PollResults";
import {
  CLOSE_REASON_LABEL, KIND_LABEL, STATUS_LABEL, actionsFor, emptyForm, formFromPoll, participation, rpcErrorText,
  type PollForm, type PollOption, type PollRow, type PollStatus, type PollTotals, type PublishMode, type ValidForm,
} from "./polls";

type Filter = "all" | PollStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "draft", label: "مسودات" }, { key: "scheduled", label: "مجدولة" },
  { key: "published", label: "منشورة" }, { key: "closed", label: "مغلقة" },
];
const STATUS_BADGE: Record<PollStatus, { bg: string; fg: string }> = {
  draft: { bg: "var(--bg-hover)", fg: "var(--text-muted)" },
  scheduled: { bg: "var(--warning-bg)", fg: "var(--warning)" },
  published: { bg: "var(--success-bg)", fg: "var(--success)" },
  closed: { bg: "var(--info-bg)", fg: "var(--info)" },
};
const fmt = (iso: string) => new Date(iso).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export function PollsAdmin() {
  const { activeSeason } = useSeason();
  const { alert: alertState, showAlert } = useAlert();
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const [polls, setPolls] = useState<PollRow[]>([]);
  const [options, setOptions] = useState<Record<number, PollOption[]>>({});
  const [totals, setTotals] = useState<Record<number, PollTotals>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState<PollForm>(() => emptyForm());
  const [editing, setEditing] = useState<PollRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [names, setNames] = useState<Record<string, Record<number, string>>>({});
  const formRef = useRef<HTMLDivElement>(null);
  /* Phase 4 — شاشةُ النتائج تحلّ محلّ القائمة داخل التبويب نفسه (لا وحدةَ جديدة في القائمة الجانبيّة) */
  const [resultsFor, setResultsFor] = useState<PollRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("polls")
      .select("id,season_id,title,body,kind,max_choices,audience,status,publish_at,published_at,audience_frozen_at,closes_at,closed_at,close_reason,allow_answer_changes,created_at,updated_at")
      .eq("season_id", activeSeason.id).order("created_at", { ascending: false });
    if (error || !data) { console.error("تعذر تحميل الاستطلاعات", error); setLoadError(true); setLoading(false); return; }
    const rows = data as unknown as PollRow[];
    const ids = rows.map(r => r.id);
    const opt = ids.length
      ? await supabase.from("poll_options").select("id,poll_id,label,sort_order").in("poll_id", ids).order("sort_order")
      : { data: [], error: null };
    if (opt.error) { console.error("تعذر تحميل خيارات الاستطلاعات", opt.error); setLoadError(true); setLoading(false); return; }
    const byPoll: Record<number, PollOption[]> = {};
    for (const o of (opt.data || []) as PollOption[]) (byPoll[o.poll_id] ||= []).push(o);
    /* المشاركة: المنشورُ من poll_results (الإسناد الحاليّ)، والمغلقُ من لقطة إغلاقه. والفشلُ لا يُظهر رقماً. */
    const t: Record<number, PollTotals> = {};
    await Promise.all(rows.filter(r => r.status === "published" || r.status === "closed").map(async r => {
      if (r.status === "published") {
        const { data: res, error: e } = await supabase.rpc("poll_results", { p_poll_id: r.id });
        if (!e && res) t[r.id] = (res as { totals: PollTotals }).totals;
      } else {
        const { data: snap, error: e } = await supabase.rpc("get_poll_snapshot", { p_poll_id: r.id });
        const s = snap as { totals?: PollTotals } | null;
        if (!e && s?.totals) t[r.id] = s.totals;
      }
    }));
    setPolls(rows); setOptions(byPoll); setTotals(t); setLoadError(false); setLoading(false);
  }, [activeSeason.id]);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const t = setInterval(load, 30000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [load]);

  const resetForm = () => { setEditing(null); setForm(emptyForm()); };

  async function publishNow(id: number): Promise<{ ok: boolean; text: string }> {
    const { data, error } = await supabase.rpc("publish_poll", { p_poll_id: id, p_publish_at: null });
    if (error || !data) return { ok: false, text: rpcErrorText(error, "تعذر نشر الاستطلاع.") };
    const r = data as { status: string; recipients?: number };
    return { ok: r.status === "published", text: `تم نشر الاستطلاع إلى ${r.recipients ?? 0} من الحجاج، وجُمِّد جمهوره.` };
  }
  async function schedule(id: number, at: string): Promise<{ ok: boolean; text: string }> {
    const { data, error } = await supabase.rpc("publish_poll", { p_poll_id: id, p_publish_at: at });
    if (error || !data) return { ok: false, text: rpcErrorText(error, "تعذرت جدولة الاستطلاع.") };
    const r = data as { status: string };
    return { ok: r.status === "scheduled", text: `تمت جدولة الاستطلاع لموعد ${fmt(at)}.` };
  }
  const publishWarning = "بعد النشر يُجمَّد الجمهور، ولا يتغيّر السؤال ولا الخيارات ولا الجمهور ولا إعداد تغيير الإجابة.";

  async function submit(v: ValidForm, mode: PublishMode) {
    if (!v.payload || saving) return;
    if (mode === "now" && !await confirmAction(`سيُنشر الاستطلاع الآن ويصل إلى جمهوره في البوابة. ${publishWarning}`, { title: "نشر الاستطلاع", confirmLabel: "نشر", danger: false })) return;
    setSaving(true);
    try {
      let id: number;
      if (editing) {
        const { error } = await supabase.rpc("update_poll", { p_poll_id: editing.id, ...v.payload });
        if (error) { showAlert("error", rpcErrorText(error, "تعذر حفظ التعديل، يرجى المحاولة مرة أخرى.")); return; }
        id = editing.id;
      } else {
        const { data, error } = await supabase.rpc("create_poll", v.payload);
        if (error || typeof data !== "number") { showAlert("error", rpcErrorText(error, "تعذر حفظ الاستطلاع، يرجى المحاولة مرة أخرى.")); return; }
        id = data;
      }
      const wasScheduled = editing?.status === "scheduled";
      const saved = editing ? "تم حفظ التعديل" : "تم حفظ الاستطلاع كمسودة";
      if (mode === "now") {
        const r = await publishNow(id);
        showAlert(r.ok ? "success" : "warning", r.ok ? r.text : `${saved}، لكن لم يُنشر: ${r.text}`);
      } else if (mode === "scheduled") {
        const keep = wasScheduled && editing?.publish_at && v.publishAt && new Date(editing.publish_at).getTime() === new Date(v.publishAt).getTime();
        if (keep) showAlert("success", `${saved}. يبقى موعد النشر ${fmt(editing!.publish_at!)}.`);
        else {
          const r = await schedule(id, v.publishAt!);
          showAlert(r.ok ? "success" : "warning", r.ok ? `${saved}. ${r.text}` : `${saved}، لكن لم تُحفظ الجدولة: ${r.text}`);
        }
      } else if (wasScheduled) {
        const { error } = await supabase.rpc("unschedule_poll", { p_poll_id: id });
        showAlert(error ? "warning" : "success", error ? `${saved}، لكن لم تُلغَ الجدولة: ${rpcErrorText(error, "تعذر إلغاء الجدولة.")}` : `${saved}، وأُلغيت الجدولة فصار مسودة.`);
      } else {
        showAlert("success", `${saved}.`);
      }
      resetForm();
    } finally { setSaving(false); load(); }
  }

  async function act(p: PollRow, run: () => Promise<{ ok: boolean; text: string }>) {
    setBusyId(p.id);
    try {
      const r = await run();
      showAlert(r.ok ? "success" : "error", r.text);
      if (r.ok && editing?.id === p.id) resetForm();
    } finally { setBusyId(null); load(); }
  }
  const onPublish = async (p: PollRow) => {
    if (!await confirmAction(`سيُنشر «${p.title}» الآن. ${publishWarning}`, { title: "نشر الاستطلاع", confirmLabel: "نشر", danger: false })) return;
    await act(p, () => publishNow(p.id));
  };
  const onUnschedule = async (p: PollRow) => act(p, async () => {
    const { error } = await supabase.rpc("unschedule_poll", { p_poll_id: p.id });
    return error ? { ok: false, text: rpcErrorText(error, "تعذر إلغاء الجدولة.") } : { ok: true, text: "أُلغيت الجدولة، وصار الاستطلاع مسودة." };
  });
  const onClose = async (p: PollRow) => {
    if (!await confirmAction(`سيُغلق «${p.title}» فوراً ولا يُعاد فتحه، وتُحفظ نتائجه كما هي الآن. هل أنت متأكد؟`, { title: "إغلاق الاستطلاع", confirmLabel: "إغلاق" })) return;
    await act(p, async () => {
      const { data, error } = await supabase.rpc("close_poll", { p_poll_id: p.id });
      if (error || !data) return { ok: false, text: rpcErrorText(error, "تعذر إغلاق الاستطلاع.") };
      const r = data as { audience: number; respondents: number };
      return { ok: true, text: `أُغلق الاستطلاع. أجاب ${r.respondents} من ${r.audience}.` };
    });
  };
  const onDelete = async (p: PollRow) => {
    if (!await confirmAction(`سيُحذف «${p.title}» نهائياً (${STATUS_LABEL[p.status]}). لا يمكن التراجع. هل أنت متأكد؟`, { title: "حذف الاستطلاع", confirmLabel: "حذف نهائي" })) return;
    await act(p, async () => {
      const { data, error } = await supabase.rpc("delete_poll", { p_poll_id: p.id });
      return error || data !== true ? { ok: false, text: rpcErrorText(error, "تعذر حذف الاستطلاع.") } : { ok: true, text: "تم حذف الاستطلاع." };
    });
  };
  const onEdit = (p: PollRow) => {
    setEditing(p);
    setForm(formFromPoll(p, options[p.id] || []));
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const counts = Object.fromEntries(FILTERS.map(f => [f.key, f.key === "all" ? polls.length : polls.filter(p => p.status === f.key).length])) as Record<Filter, number>;
  const shown = polls.filter(p => filter === "all" || p.status === filter);
  const smallBtn = { ...btnS(), fontSize: 11.5, padding: "6px 12px", minHeight: 32 };

  const card = (p: PollRow) => {
    const a = actionsFor(p.status);
    const b = STATUS_BADGE[p.status];
    const busy = busyId === p.id || saving;
    const opts = options[p.id] || [];
    const tot = totals[p.id];
    const locked = p.status === "published" || p.status === "closed";
    const meta = (k: string, v: string) => <span><span style={{ color: "var(--text-muted)" }}>{k}: </span><b style={{ color: "var(--text)", fontWeight: 700 }}>{v}</b></span>;
    return (
      <article key={p.id} data-poll-id={p.id} aria-label={p.title}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRight: `3px solid ${b.fg}`, borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: 9, opacity: p.status === "closed" ? 0.85 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span data-status style={{ fontSize: 10.5, background: b.bg, color: b.fg, padding: "2px 10px", borderRadius: 99, fontWeight: 800 }}>{STATUS_LABEL[p.status]}</span>
          <span style={{ fontSize: 10.5, background: "var(--bg-hover)", color: "var(--text)", padding: "2px 10px", borderRadius: 99, fontWeight: 700 }}>
            {KIND_LABEL[p.kind]}{p.kind === "multiple" && p.max_choices ? ` · حتى ${p.max_choices}` : ""}
          </span>
          <span style={{ fontSize: 10.5, background: "var(--bg-hover)", color: "var(--text)", padding: "2px 10px", borderRadius: 99, fontWeight: 700 }}>
            {p.allow_answer_changes ? "تغيير الإجابة مسموح" : "الإجابة الأولى نهائية"}
          </span>
          {locked && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>🔒 ثابت بعد النشر</span>}
        </div>
        <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 800, marginTop: 8, overflowWrap: "anywhere" }}>{p.title}</div>
        {p.body && <div style={{ fontSize: 12.5, color: "var(--text)", marginTop: 3, lineHeight: 1.9, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.body}</div>}
        <ol style={{ margin: "8px 0 0", paddingInlineStart: 22, fontSize: 12.5, color: "var(--text)", lineHeight: 1.9 }}>
          {opts.map(o => <li key={o.id} style={{ overflowWrap: "anywhere" }}>{o.label}</li>)}
        </ol>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 11, marginTop: 8 }}>
          {meta("الجمهور", describeAudience(p.audience, {}, names) + (p.audience_frozen_at ? " · مُجمَّد" : ""))}
          {p.status === "scheduled" && p.publish_at && meta("يُنشر", fmt(p.publish_at))}
          {(p.status === "published" || p.status === "closed") && p.published_at && meta("نُشر", fmt(p.published_at))}
          {p.closes_at && p.status !== "closed" && meta("يُغلق", fmt(p.closes_at))}
          {p.status === "closed" && p.closed_at && meta("أُغلق", `${fmt(p.closed_at)}${p.close_reason ? ` · ${CLOSE_REASON_LABEL[p.close_reason] ?? p.close_reason}` : ""}`)}
          {locked && meta("المشاركة", tot ? participation(tot) : "—")}
        </div>
        {(a.edit || a.publish || a.unschedule || a.close || a.remove || locked) && (
          <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
            {locked && <button type="button" onClick={() => setResultsFor(p)} style={{ ...smallBtn, color: "var(--primary)", fontWeight: 800 }}>عرض النتائج</button>}
            {a.edit && <button type="button" disabled={busy} onClick={() => onEdit(p)} style={smallBtn}>تعديل</button>}
            {a.publish && <button type="button" disabled={busy} onClick={() => onPublish(p)} style={smallBtn}>نشر الآن</button>}
            {a.unschedule && <button type="button" disabled={busy} onClick={() => onUnschedule(p)} style={smallBtn}>إلغاء الجدولة</button>}
            {a.close && <button type="button" disabled={busy} onClick={() => onClose(p)} style={smallBtn}>إغلاق الاستطلاع</button>}
            {a.remove && <button type="button" disabled={busy} onClick={() => onDelete(p)} style={{ ...smallBtn, color: "var(--danger)" }}>حذف</button>}
          </div>
        )}
      </article>
    );
  };

  if (resultsFor) return (
    <div className="polls-admin" style={{ textAlign: "start" }}>
      {/* حلقةُ تركيزٍ ظاهرة للوحة المفاتيح: نمطُ الحقول المشترك (`inp`) يُطفئ outline في السطر نفسه، فـ!important */}
      <style>{`.polls-admin input:focus-visible,.polls-admin textarea:focus-visible,.polls-admin select:focus-visible,.polls-admin a:focus-visible,.polls-admin button:focus-visible{outline:2px solid var(--primary)!important;outline-offset:2px}`}</style>
      <PollResults poll={resultsFor} onBack={() => { setResultsFor(null); void load(); }} />
    </div>
  );

  return (
    <div className="polls-admin" style={{ textAlign: "start" }}>
      {/* حلقةُ تركيزٍ ظاهرة للوحة المفاتيح: نمطُ الحقول المشترك (`inp`) يُطفئ outline في السطر نفسه، فـ!important */}
      <style>{`.polls-admin input:focus-visible,.polls-admin textarea:focus-visible,.polls-admin select:focus-visible,.polls-admin a:focus-visible,.polls-admin button:focus-visible{outline:2px solid var(--primary)!important;outline-offset:2px}`}</style>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <div ref={formRef}>
        <PollFormPanel key={editing?.id ?? "new"} seasonId={activeSeason.id} form={form} setForm={setForm} editing={editing}
          saving={saving} onSubmit={submit} onCancel={resetForm} onNames={setNames} />
      </div>

      {loading ? (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "18px 2px" }} role="status">جاري تحميل الاستطلاعات...</div>
      ) : loadError && polls.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 700, padding: "18px 2px" }} role="alert">تعذر تحميل الاستطلاعات — يرجى التحقق من الاتصال وتحديث الصفحة</div>
      ) : <>
        {loadError && <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 700, padding: "8px 2px 0" }} role="alert">تعذر تحديث القائمة — المعروض أدناه آخر بيانات وصلت</div>}
        <div role="tablist" aria-label="تصفية الاستطلاعات" style={{ display: "flex", gap: 6, margin: "16px 2px 10px", flexWrap: "wrap" }}>
          {FILTERS.map(f => (
            <button type="button" key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
              style={{ border: filter === f.key ? "2px solid var(--primary)" : "1px solid var(--border)", background: filter === f.key ? "var(--primary)" : "var(--bg-card)", color: filter === f.key ? "var(--text-inverse)" : "var(--text)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "5px 15px", cursor: "pointer", fontFamily: "inherit", minHeight: 32 }}>
              {f.label} ({counts[f.key]})
            </button>
          ))}
        </div>
        {shown.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "4px 2px" }}>
          {polls.length === 0 ? "لا توجد استطلاعات بعد. أنشئ أول استطلاع من النموذج أعلاه." : "لا توجد استطلاعات بهذه الحالة."}
        </div>}
        {shown.map(card)}
      </>}
    </div>
  );
}
