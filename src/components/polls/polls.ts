/* ═══ الاستطلاعات — الأنواعُ والتحقّقُ والحمولة (Phase 3، فوق Phase 2) ═══
   عقدُ دوالّ Phase 2 كما في `20261111111656_polls_phase2.sql`، لا افتراضٌ عنه:
     create_poll(title, body, kind, max_choices, audience, options[], closes_at, allow_answer_changes) → id
     update_poll(id, …نفسُها)            · مسوّدةٌ أو مجدوَلٌ وحدهما
     publish_poll(id, publish_at|null)   · null = الآن (يُجمَّد الجمهور)، والمستقبلُ = جدولة
     unschedule_poll(id) · close_poll(id) · delete_poll(id) · poll_results(id) · get_poll_snapshot(id)
   والتحقّقُ هنا صدىً لتحقّق القاعدة (`_poll_validate`) لرسالةٍ أوضح قبل الإرسال؛ القاعدةُ هي
   الحَكَم، ورسائلُها تُعرض كما هي. ملفٌّ بلا مكوّنات (Fast Refresh) ويُختبر بـnode وحده. */
import { audienceIsEmpty, cleanAudience, type Audience } from "../announcements/audience.ts";

export type PollKind = "single" | "multiple";
export type PollStatus = "draft" | "scheduled" | "published" | "closed";

export type PollRow = {
  id: number; season_id: number; title: string; body: string | null; kind: PollKind; max_choices: number | null;
  audience: Audience; status: PollStatus; publish_at: string | null; published_at: string | null;
  audience_frozen_at: string | null; closes_at: string | null; closed_at: string | null; close_reason: string | null;
  allow_answer_changes: boolean; created_at: string; updated_at: string;
};
export type PollOption = { id: number; poll_id: number; label: string; sort_order: number };
/* الأعدادُ من poll_results (المنشور: إسنادٌ حاليّ) أو من لقطة الإغلاق (المغلق: لحظةُ الإغلاق) */
export type PollTotals = { audience: number; respondents: number; options: { id: number; label: string; count: number }[] };

export type PublishMode = "draft" | "now" | "scheduled";
export type PollForm = {
  title: string; body: string; kind: PollKind; maxChoices: string; options: string[];
  allowChanges: boolean; audience: Audience;
  hasClose: boolean; closesAt: string;          // datetime-local
  mode: PublishMode; publishAt: string;          // datetime-local
};

export const LIMITS = { title: 300, body: 4000, option: 300, minOptions: 2, maxOptions: 20 } as const;

export const STATUS_LABEL: Record<PollStatus, string> = { draft: "مسودة", scheduled: "مجدول", published: "منشور", closed: "مغلق" };
export const CLOSE_REASON_LABEL: Record<string, string> = { manual: "أُغلق يدوياً", expired: "انتهى موعده", season_close: "أُغلق مع إقفال الموسم" };
export const KIND_LABEL: Record<PollKind, string> = { single: "اختيار واحد", multiple: "اختيار متعدد" };

export function emptyForm(now = Date.now()): PollForm {
  return {
    title: "", body: "", kind: "single", maxChoices: "", options: ["", ""], allowChanges: true,
    audience: { all: true }, hasClose: false, closesAt: toLocalInput(new Date(now + 3 * 86400000)),
    mode: "now", publishAt: toLocalInput(new Date(now + 3600000)),
  };
}

export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** مسوّدةٌ أو مجدوَلٌ محفوظ → حقولُ النموذج */
export function formFromPoll(p: PollRow, opts: PollOption[], now = Date.now()): PollForm {
  const base = emptyForm(now);
  return {
    ...base,
    title: p.title, body: p.body || "", kind: p.kind, maxChoices: p.max_choices ? String(p.max_choices) : "",
    options: opts.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map(o => o.label),
    allowChanges: p.allow_answer_changes, audience: p.audience && typeof p.audience === "object" ? p.audience : { all: true },
    hasClose: !!p.closes_at, closesAt: p.closes_at ? toLocalInput(new Date(p.closes_at)) : base.closesAt,
    mode: p.status === "scheduled" ? "scheduled" : "draft",
    publishAt: p.publish_at ? toLocalInput(new Date(p.publish_at)) : base.publishAt,
  };
}

export type ValidForm = {
  errors: Record<string, string>;
  payload: null | {
    p_title: string; p_body: string | null; p_kind: PollKind; p_max_choices: number | null; p_audience: Audience;
    p_options: string[]; p_closes_at: string | null; p_allow_answer_changes: boolean;
  };
  publishAt: string | null;   // ISO للجدولة، null للآن أو المسوّدة
};

/** التحقّقُ وبناءُ الحمولة معاً — الحمولةُ لا تُبنى من نموذجٍ فيه خطأ. */
export function validateForm(f: PollForm, now = Date.now()): ValidForm {
  const errors: Record<string, string> = {};
  const title = f.title.trim();
  if (!title) errors.title = "يرجى كتابة سؤال الاستطلاع.";
  else if (title.length > LIMITS.title) errors.title = `السؤال أطول من ${LIMITS.title} حرف.`;
  const body = f.body.trim();
  if (body.length > LIMITS.body) errors.body = `التوضيح أطول من ${LIMITS.body} حرف.`;

  const options = f.options.map(o => o.trim());
  if (options.length < LIMITS.minOptions) errors.options = "يحتاج الاستطلاع خيارين على الأقل.";
  else if (options.length > LIMITS.maxOptions) errors.options = `الحد الأقصى ${LIMITS.maxOptions} خياراً.`;
  else if (options.some(o => !o)) errors.options = "لا يُترك خيارٌ فارغاً — اكتبه أو احذفه.";
  else if (new Set(options).size !== options.length) errors.options = "خياران متطابقان — يجب أن تختلف الخيارات.";
  else if (options.some(o => o.length > LIMITS.option)) errors.options = `خيارٌ أطول من ${LIMITS.option} حرف.`;

  let maxChoices: number | null = null;
  if (f.kind === "multiple" && f.maxChoices.trim()) {
    const n = Number(f.maxChoices);
    if (!Number.isInteger(n) || n < 1 || n > options.length) errors.maxChoices = `الحد الأقصى للاختيارات بين ١ و${options.length}.`;
    else maxChoices = n;
  }

  const audience = cleanAudience(f.audience);
  if (audienceIsEmpty(audience)) errors.audience = "يرجى اختيار الجمهور: جميع الحجاج أو فئة واحدة على الأقل.";

  let publishAt: string | null = null;
  let publishMs = now;
  if (f.mode === "scheduled") {
    const d = new Date(f.publishAt);
    if (!f.publishAt || Number.isNaN(d.getTime())) errors.publishAt = "يرجى اختيار تاريخ ووقت صحيحين للنشر.";
    else if (d.getTime() <= now) errors.publishAt = "موعد النشر يجب أن يكون في المستقبل.";
    else { publishAt = d.toISOString(); publishMs = d.getTime(); }
  }
  let closesAt: string | null = null;
  if (f.hasClose) {
    const d = new Date(f.closesAt);
    if (!f.closesAt || Number.isNaN(d.getTime())) errors.closesAt = "يرجى اختيار تاريخ ووقت صحيحين للإغلاق.";
    else if (d.getTime() <= now) errors.closesAt = "موعد الإغلاق يجب أن يكون في المستقبل.";
    else if (f.mode === "scheduled" && publishAt && d.getTime() <= publishMs) errors.closesAt = "موعد الإغلاق يجب أن يكون بعد موعد النشر.";
    else closesAt = d.toISOString();
  }

  if (Object.keys(errors).length) return { errors, payload: null, publishAt: null };
  return {
    errors,
    payload: {
      p_title: title, p_body: body || null, p_kind: f.kind, p_max_choices: f.kind === "multiple" ? maxChoices : null,
      p_audience: audience, p_options: options, p_closes_at: closesAt, p_allow_answer_changes: f.allowChanges,
    },
    publishAt,
  };
}

/** الأفعالُ التي تقبلها القاعدةُ لكلّ حال — لا يُعرض غيرُها. */
export function actionsFor(status: PollStatus): { edit: boolean; publish: boolean; schedule: boolean; unschedule: boolean; close: boolean; remove: boolean } {
  return {
    edit: status === "draft" || status === "scheduled",
    /* «نشر الآن» للمسوّدة وحدها: publish_poll على مجدوَلٍ يعتمد موعدَه المحفوظ (published_at = publish_at)،
       فلا يصير نشراً فوريّاً. والطريقُ للمجدوَل: «إلغاء الجدولة» ثم «نشر الآن». */
    publish: status === "draft",
    schedule: status === "draft",
    unschedule: status === "scheduled",
    close: status === "published",
    remove: status === "draft" || status === "scheduled",
  };
}

type RpcError = { code?: string; message?: string } | null | undefined;
/** رسالةُ خطأ القاعدة للموظّف. رسائلُ التحقّق (22023 · P0001 · P0002) عربيّةٌ من القاعدة نفسها. */
export function rpcErrorText(error: RpcError, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "42501") return "لا تملك صلاحية إدارة بوابة الحاج.";
  if ((error.code === "22023" || error.code === "P0001" || error.code === "P0002") && error.message) return error.message;
  return fallback;
}

export function participation(t: PollTotals | null | undefined): string {
  if (!t) return "";
  const pct = t.audience > 0 ? Math.round((t.respondents / t.audience) * 100) : 0;
  return `${t.respondents} من ${t.audience} (${pct}٪)`;
}
