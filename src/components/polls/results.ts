/* ═══ نتائجُ الاستطلاع — الحساب والتصدير (Phase 4) ═══
   مصدرٌ واحدٌ لكلّ رقمٍ في الشاشة وفي Excel وفي PDF: صفوفُ `poll_details` (صفٌّ لكلّ حاجٍّ في
   الجمهور المجمَّد بإجابته الحاليّة). فلا يختلف رقمُ الشاشة عن رقم الملفّ، ولا يُعدّ حاجٌّ مرّتين.
   النِّسَب:
     · المشاركة = المجيبون ÷ المستهدفين.
     · نتائجُ التصويت (الإجماليّ): الخيار = مختاروه ÷ المجيبين.
     · التوزيع — نسبتان لكلّ خيارٍ في كلّ مجموعة:
         الأساسيّة = مختاروه في المجموعة ÷ مستهدَفي المجموعة
         الثانويّة = مختاروه في المجموعة ÷ مجيبي المجموعة
     · في المتعدّد قد يتجاوز مجموعُ نسب الخيارات ١٠٠٪ (يختار الحاجُّ أكثرَ من خيار).
     · مقامٌ صفر ← ٠٪ لا قسمةٌ على صفر.
   التوزيع: الباصات · مخيمات منى · رحلات الذهاب · رحلات العودة. لكلّ حاجٍّ قيمةٌ واحدةٌ في كلّ بُعد
   (`flight_id` للذهاب و`return_flight_id` للعودة)، فلا يُعدّ مرّتين في مجموعةٍ واحدة. و«غير مُسنَد»
   مجموعةٌ صريحةٌ لا تُسقَط.
   ملفٌّ بلا مكوّنات (Fast Refresh) ويُختبر بـnode وحده. */

export type DetailOption = { id: number; label: string; sort_order?: number };
export type DetailRow = {
  passenger_id: number; name_ar: string | null; passenger_type: string | null; added_reason?: string | null;
  bus: number | null; camp_mina: number | null; flight_go: number | null; flight_back: number | null;
  responded: boolean; revision: number | null; option_ids: number[];
};
/* تفاصيلُ الرحلة — للمنشور من جدول الرحلات الآن؛ ولقطةُ الإغلاق لم تحفظها (الاسمُ وحده محفوظ) */
export type FlightInfo = { airline: string | null; date: string | null; time: string | null; from_airport: string | null; to_airport: string | null; type: string | null };
export type PollDetails = {
  poll_id: number; status: string; kind: "single" | "multiple"; max_choices: number | null;
  source: "live" | "snapshot"; as_of: string | null;
  options: DetailOption[];
  labels: Record<Dim, Record<string, string>>;
  flight_info?: Record<string, FlightInfo>;
  rows: DetailRow[];
};
export type Dim = "bus" | "camp_mina" | "flight_go" | "flight_back";
export const DIMS: Dim[] = ["bus", "camp_mina", "flight_go", "flight_back"];
export const DIM_LABEL: Record<Dim, string> = { bus: "الباصات", camp_mina: "مخيمات منى", flight_go: "رحلات الذهاب", flight_back: "رحلات العودة" };
export const DIM_ONE: Record<Dim, string> = { bus: "الباص", camp_mina: "مخيم منى", flight_go: "رحلة الذهاب", flight_back: "رحلة العودة" };
export const isFlight = (dim: Dim) => dim === "flight_go" || dim === "flight_back";
export const UNASSIGNED = "غير مُسنَد";

export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
export const fmtPct = (n: number, d: number) => `${pct(n, d).toLocaleString("en-US", { maximumFractionDigits: 1 })}٪`;

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const toRow = (e: Record<string, unknown>): DetailRow => ({
  passenger_id: Number(e.passenger_id), name_ar: (e.name_ar as string) ?? null, passenger_type: (e.passenger_type as string) ?? null,
  added_reason: (e.added_reason as string) ?? null, bus: num(e.bus), camp_mina: num(e.camp_mina),
  flight_go: num(e.flight_go), flight_back: num(e.flight_back),
  responded: !!e.responded, revision: (e.revision as number) ?? null, option_ids: ((e.option_ids as number[]) || []).map(Number),
});
const labelsFrom = (l: Record<string, Record<string, string>> | undefined) =>
  Object.fromEntries(DIMS.map(k => [k, (l || {})[k] || {}])) as Record<Dim, Record<string, string>>;

/** ردُّ `poll_details` كما وصل ← الشكلُ الداخليّ (ويحتمل غيابَ حقلٍ في خادمٍ أقدم) */
export function normalizeDetails(raw: Record<string, unknown>): PollDetails {
  return {
    poll_id: Number(raw.poll_id), status: String(raw.status), kind: raw.kind === "multiple" ? "multiple" : "single",
    max_choices: (raw.max_choices as number) ?? null, source: raw.source === "snapshot" ? "snapshot" : "live", as_of: (raw.as_of as string) ?? null,
    options: (raw.options || []) as DetailOption[], labels: labelsFrom(raw.labels as Record<string, Record<string, string>>),
    flight_info: (raw.flight_info || {}) as Record<string, FlightInfo>,
    rows: ((raw.rows || []) as Record<string, unknown>[]).map(toRow).sort((a, b) => a.passenger_id - b.passenger_id),
  };
}

/** شكلُ لقطة Phase 2 (get_poll_snapshot) ← شكلُ poll_details. للمغلق وحده، قبل تطبيق ترحيلة Phase 4.
    اللقطةُ تحفظ إسنادَ الباص ومنى ورحلتي الذهاب والعودة وأسماءَها لحظةَ الإغلاق — لا تفاصيلَ الرحلات. */
export function detailsFromSnapshot(s: Record<string, unknown>, kind: "single" | "multiple", maxChoices: number | null): PollDetails {
  return {
    poll_id: Number(s.poll_id), status: "closed", kind, max_choices: maxChoices, source: "snapshot", as_of: (s.closed_at as string) ?? null,
    options: ((s.options || []) as DetailOption[]), labels: labelsFrom(s.labels as Record<string, Record<string, string>>), flight_info: {},
    rows: ((s.rows || []) as Record<string, unknown>[]).map(toRow).sort((a, b) => a.passenger_id - b.passenger_id),
  };
}

export const sortedOptions = (d: PollDetails) =>
  d.options.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

export type OptionStat = {
  id: number; label: string; count: number;
  /** ٪ من المجيبين */ pct: number;
  /** ٪ من المستهدفين */ pctTargeted: number;
  rows: DetailRow[];
};
export type Summary = { audience: number; respondents: number; nonrespondents: number; participation: number; options: OptionStat[]; multiple: boolean; optionTotal: number };

export function summarize(d: PollDetails, rows: DetailRow[] = d.rows): Summary {
  const respondents = rows.filter(r => r.responded).length;
  const options = sortedOptions(d).map(o => {
    const who = rows.filter(r => r.responded && r.option_ids.includes(o.id));
    return { id: o.id, label: o.label, count: who.length, pct: pct(who.length, respondents), pctTargeted: pct(who.length, rows.length), rows: who };
  });
  return {
    audience: rows.length, respondents, nonrespondents: rows.length - respondents, participation: pct(respondents, rows.length),
    options, multiple: d.kind === "multiple", optionTotal: options.reduce((s, o) => s + o.count, 0),
  };
}

export const labelOf = (d: PollDetails, dim: Dim, id: number | null) =>
  id == null ? UNASSIGNED : ((d.labels[dim] || {})[String(id)] || `#${id}`);

/** تفاصيلُ رحلةٍ للعرض (شركة · تاريخ ووقت · مسار). فارغةٌ حيث لم تُحفظ (لقطةُ الإغلاق) — لا تُستكمل من الحاليّ. */
export function flightDetail(d: PollDetails, id: number | null): string {
  if (id == null) return "";
  const f = (d.flight_info || {})[String(id)];
  if (!f) return "";
  /* المقاطعُ اللاتينيّة (التاريخ والوقت ورموز المطارات) معزولةٌ اتّجاهيّاً (LRI…PDI): بدونها يُعاد ترتيبُها
     داخل السطر العربيّ فيُقرأ التاريخُ والمسارُ مقلوبَين — في الشاشة وExcel وPDF */
  const ltr = (t: string) => `\u2066${t}\u2069`;
  const when = [f.date, f.time].filter(Boolean).join(" ");
  const route = f.from_airport || f.to_airport ? `من ${ltr(f.from_airport || "؟")} إلى ${ltr(f.to_airport || "؟")}` : "";
  return [f.airline, when ? ltr(when) : "", route].filter(Boolean).join(" · ");
}
export const FLIGHT_SNAPSHOT_NOTE = "في الاستطلاع المغلق تُعرض الرحلة التي كان الحاج مُسنَداً إليها لحظة الإغلاق باسمها المحفوظ؛ تفاصيلها (الشركة والتاريخ والمسار) لم تُحفظ في لقطة الإغلاق فلا تُعرض.";

export type Group = Summary & { key: number | null; label: string; detail: string; rows: DetailRow[] };
/** التوزيعُ بأحد الأبعاد الأربعة. غيرُ المُسنَد مجموعةٌ أخيرةٌ صريحة؛ والبقيّةُ بالاسم. */
export function groupBy(d: PollDetails, dim: Dim): Group[] {
  const keys = new Map<string, number | null>();
  for (const r of d.rows) keys.set(r[dim] == null ? "" : String(r[dim]), r[dim] ?? null);
  return Array.from(keys.values())
    .map(key => {
      const rows = d.rows.filter(r => (r[dim] ?? null) === key);
      return { ...summarize(d, rows), key, label: labelOf(d, dim, key), detail: isFlight(dim) ? flightDetail(d, key) : "", rows };
    })
    .sort((a, b) => (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0) || a.label.localeCompare(b.label, "ar") || (a.key ?? 0) - (b.key ?? 0));
}

export const answerLabels = (d: PollDetails, r: DetailRow) =>
  sortedOptions(d).filter(o => r.option_ids.includes(o.id)).map(o => o.label);

/** سطرُ التفصيل لخيارٍ في مجموعة: العددُ والنسبتان — الأساسيّةُ (من المستهدفين) أوّلاً */
export const cellText = (o: OptionStat, g: Summary) =>
  `${o.count} · ${fmtPct(o.count, g.audience)} من المستهدفين · ${fmtPct(o.count, g.respondents)} من المجيبين`;

export type RowFilter = { q?: string; bus?: number | null | "all"; mina?: number | null | "all"; status?: "all" | "answered" | "not" };
export type SortKey = "name" | "bus" | "mina" | "status";
export function filterRows(rows: DetailRow[], f: RowFilter): DetailRow[] {
  const q = (f.q || "").trim();
  return rows.filter(r =>
    (f.status === "answered" ? r.responded : f.status === "not" ? !r.responded : true)
    && (f.bus === undefined || f.bus === "all" || (r.bus ?? null) === f.bus)
    && (f.mina === undefined || f.mina === "all" || (r.camp_mina ?? null) === f.mina)
    && (!q || (r.name_ar || "").includes(q) || String(r.passenger_id) === q));
}
export function sortRows(d: PollDetails, rows: DetailRow[], key: SortKey): DetailRow[] {
  const name = (r: DetailRow) => r.name_ar || "";
  const cmp: Record<SortKey, (a: DetailRow, b: DetailRow) => number> = {
    name: (a, b) => name(a).localeCompare(name(b), "ar"),
    bus: (a, b) => labelOf(d, "bus", a.bus).localeCompare(labelOf(d, "bus", b.bus), "ar") || name(a).localeCompare(name(b), "ar"),
    mina: (a, b) => labelOf(d, "camp_mina", a.camp_mina).localeCompare(labelOf(d, "camp_mina", b.camp_mina), "ar") || name(a).localeCompare(name(b), "ar"),
    status: (a, b) => Number(b.responded) - Number(a.responded) || name(a).localeCompare(name(b), "ar"),
  };
  return rows.slice().sort(cmp[key]);
}

/* ═══ التصدير ═══ */
export type PollMeta = { title: string; body: string | null; kind: "single" | "multiple"; max_choices: number | null; status: string;
  published_at: string | null; closed_at: string | null; close_reason: string | null; allow_answer_changes: boolean };
type Cell = string | number;
const KIND_AR = { single: "اختيار واحد", multiple: "اختيار متعدد" } as const;
const STATUS_AR: Record<string, string> = { draft: "مسودة", scheduled: "مجدول", published: "منشور", closed: "مغلق" };
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ar-EG", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
export const sourceNote = (d: PollDetails) => d.source === "snapshot"
  ? `لقطة الإغلاق — الأعداد والإسناد (الباص ومنى ورحلتا الذهاب والعودة) كما كانت لحظة الإغلاق (${dt(d.as_of)})`
  : `نتائج حيّة — الإسناد (الباص ومنى ورحلتا الذهاب والعودة) الحالي، حتى ${dt(d.as_of)}`;
export const MULTI_NOTE = "في الاختيار المتعدد قد يختار الحاج أكثر من خيار، فقد يتجاوز مجموع نسب الخيارات ١٠٠٪.";
export const DIST_NOTE = "في التوزيع لكل خيار نسبتان: الأساسية من المستهدفين في المجموعة، والثانوية من المجيبين فيها.";

export type SheetKey = "summary" | "answers" | Dim | "nonrespondents";
export const SHEET_NAME: Record<SheetKey, string> = {
  summary: "الملخص", answers: "الإجابات", bus: "تحليل الباصات", camp_mina: "تحليل منى",
  flight_go: "رحلات الذهاب", flight_back: "رحلات العودة", nonrespondents: "لم يجيبوا",
};

/** أوراقُ Excel (مصفوفاتٌ صافية) — تختبرها الوحداتُ بلا متصفّح */
export function exportSheets(d: PollDetails, m: PollMeta): Record<SheetKey, Cell[][]> {
  const s = summarize(d);
  const opts = sortedOptions(d);
  const summary: Cell[][] = [
    ["السؤال", m.title], ["النوع", KIND_AR[m.kind] + (m.kind === "multiple" && m.max_choices ? ` (حتى ${m.max_choices})` : "")],
    ["الحالة", STATUS_AR[m.status] || m.status], ["تاريخ النشر", dt(m.published_at)], ["تاريخ الإغلاق", dt(m.closed_at)],
    ["تغيير الإجابة", m.allow_answer_changes ? "مسموح" : "الإجابة الأولى نهائية"], ["مصدر الأرقام", sourceNote(d)],
    ["المستهدفون", s.audience], ["المجيبون", s.respondents], ["لم يجيبوا", s.nonrespondents], ["نسبة المشاركة", fmtPct(s.respondents, s.audience)],
    [],
    ["الخيار", "عدد الأصوات", "النسبة من المجيبين"],
    ...s.options.map(o => [o.label, o.count, fmtPct(o.count, s.respondents)] as Cell[]),
    ...(s.multiple ? [[], [MULTI_NOTE]] : []),
    [], [DIST_NOTE],
    ...(d.source === "snapshot" ? [[FLIGHT_SNAPSHOT_NOTE]] : []),
  ];
  const where = (r: DetailRow) => [labelOf(d, "bus", r.bus), labelOf(d, "camp_mina", r.camp_mina), labelOf(d, "flight_go", r.flight_go), labelOf(d, "flight_back", r.flight_back)];
  const answers: Cell[][] = [
    ["رقم الحاج", "الاسم", "النوع", "الباص", "مخيم منى", "رحلة الذهاب", "رحلة العودة", "الإجابة", "رقم المراجعة"],
    ...sortRows(d, d.rows.filter(r => r.responded), "name").map(r => [r.passenger_id, r.name_ar || "", r.passenger_type || "",
      ...where(r), answerLabels(d, r).join("، "), r.revision ?? ""] as Cell[]),
  ];
  const dimSheet = (dim: Dim): Cell[][] => [
    [DIM_ONE[dim], ...(isFlight(dim) ? ["تفاصيل الرحلة"] : []), "المستهدفون", "المجيبون", "نسبة المشاركة", "لم يجيبوا",
      ...opts.flatMap(o => [`${o.label} (عدد)`, `${o.label} (٪ من المستهدفين)`, `${o.label} (٪ من المجيبين)`])],
    ...groupBy(d, dim).map(g => [g.label, ...(isFlight(dim) ? [g.detail || (d.source === "snapshot" && g.key != null ? "غير محفوظة في لقطة الإغلاق" : "")] : []),
      g.audience, g.respondents, fmtPct(g.respondents, g.audience), g.nonrespondents,
      ...g.options.flatMap(o => [o.count, fmtPct(o.count, g.audience), fmtPct(o.count, g.respondents)])] as Cell[]),
  ];
  const nonrespondents: Cell[][] = [
    ["رقم الحاج", "الاسم", "النوع", "الباص", "مخيم منى", "رحلة الذهاب", "رحلة العودة"],
    ...sortRows(d, d.rows.filter(r => !r.responded), "name").map(r => [r.passenger_id, r.name_ar || "", r.passenger_type || "", ...where(r)] as Cell[]),
  ];
  return { summary, answers, bus: dimSheet("bus"), camp_mina: dimSheet("camp_mina"), flight_go: dimSheet("flight_go"), flight_back: dimSheet("flight_back"), nonrespondents };
}

/* «لم يجب» في الرسم — اللونُ نفسُه في الشاشة وPDF */
export const NONRESP_COLOR = "#A8A29E";
export const OPTION_COLORS = ["#2E7D32", "#1565C0", "#B8860B", "#6A1B9A", "#C62828", "#00838F", "#AD1457", "#5D4037", "#3949AB", "#7CB342"];
const escHtml = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** جسمُ تقرير PDF (يُلفّ بـmakeHTML بهويّة الحملة). كلُّ نصٍّ مُهرَّب، والرسومُ أشرطةٌ بـCSS تُطبع بألوانها. */
export function reportBody(d: PollDetails, m: PollMeta): string {
  const s = summarize(d);
  const opts = sortedOptions(d);
  const color = (i: number) => OPTION_COLORS[i % OPTION_COLORS.length];
  const bar = (p: number, c: string, h = 8) => `<div style="background:#eee;border-radius:3pt;height:${h}pt;width:100%;overflow:hidden"><div style="width:${Math.min(100, Math.max(0, p))}%;height:100%;background:${c}"></div></div>`;
  const info = `<table><tbody>
    <tr><td style="width:28%;font-weight:700">السؤال</td><td style="white-space:normal">${escHtml(m.title)}</td></tr>
    ${m.body ? `<tr><td style="font-weight:700">التوضيح</td><td style="white-space:normal">${escHtml(m.body)}</td></tr>` : ""}
    <tr><td style="font-weight:700">النوع</td><td>${escHtml(KIND_AR[m.kind])}${m.kind === "multiple" && m.max_choices ? ` (حتى ${m.max_choices})` : ""}</td></tr>
    <tr><td style="font-weight:700">الحالة</td><td>${escHtml(STATUS_AR[m.status] || m.status)} · نُشر ${escHtml(dt(m.published_at))}${m.closed_at ? ` · أُغلق ${escHtml(dt(m.closed_at))}` : ""}</td></tr>
    <tr><td style="font-weight:700">مصدر الأرقام</td><td style="white-space:normal">${escHtml(sourceNote(d))}</td></tr>
  </tbody></table>`;
  const kpi = (l: string, v: string) => `<div style="flex:1;border:0.5pt solid #ddd;border-radius:5pt;padding:6pt;text-align:center"><div style="font-size:8pt;color:#777">${l}</div><div style="font-size:15pt;font-weight:800">${v}</div></div>`;
  const kpis = `<div style="display:flex;gap:6pt;margin:6pt 0 10pt">${kpi("المستهدفون", String(s.audience))}${kpi("المجيبون", String(s.respondents))}${kpi("لم يجيبوا", String(s.nonrespondents))}${kpi("نسبة المشاركة", fmtPct(s.respondents, s.audience))}</div>`;
  const results = `<table><thead><tr><th>الخيار</th><th style="width:12%">الأصوات</th><th style="width:12%">النسبة</th><th style="width:36%">الرسم</th></tr></thead><tbody>
    ${s.options.map((o, i) => `<tr><td style="white-space:normal"><span style="display:inline-block;width:7pt;height:7pt;border-radius:2pt;background:${color(i)};margin-left:4pt"></span>${escHtml(o.label)}</td><td>${o.count}</td><td>${fmtPct(o.count, s.respondents)}</td><td>${bar(pct(o.count, s.respondents), color(i))}</td></tr>`).join("")}
  </tbody></table>${s.multiple ? `<div style="font-size:8pt;color:#666;margin:-4pt 0 8pt">${escHtml(MULTI_NOTE)}</div>` : ""}`;
  /* الخليّة كما في الشاشة: العدد · الأساسيّةُ (عريضة) · (الثانويّة) */
  const cell = (o: OptionStat, g: Group) => `<td>${o.count} · <b>${fmtPct(o.count, g.audience)}</b> <span style="font-size:7pt;color:#777">(${fmtPct(o.count, g.respondents)})</span></td>`;
  /* الرسم كما في الشاشة: الاختيارُ الواحد شريطٌ واحدٌ = ١٠٠٪ من المستهدفين (الخيارات + «لم يجب»)؛
     والمتعدّدُ شريطٌ مستقلٌّ لكلّ خيار بنسبته من المستهدفين (لا تكديس — قد يتجاوز المجموعُ ١٠٠٪) */
  const chart = (g: Group) => s.multiple
    ? g.options.map((o, i) => `<div style="margin:1pt 0">${bar(pct(o.count, g.audience), color(i), 5)}</div>`).join("")
    : `<div style="display:flex;height:9pt;border-radius:3pt;overflow:hidden;background:#eee">${g.options.map((o, i) => o.count ? `<div style="width:${pct(o.count, g.audience)}%;background:${color(i)}"></div>` : "").join("")}${g.nonrespondents ? `<div style="width:${pct(g.nonrespondents, g.audience)}%;background:${NONRESP_COLOR}"></div>` : ""}</div>`;
  const dimTable = (dim: Dim) => {
    const gs = groupBy(d, dim);
    return `<div style="break-inside:avoid;page-break-inside:avoid"><div class="section-title">${DIM_LABEL[dim]}</div>
    ${isFlight(dim) && d.source === "snapshot" ? `<div style="font-size:7.5pt;color:#666;margin:-2pt 0 4pt">${escHtml(FLIGHT_SNAPSHOT_NOTE)}</div>` : ""}
    <table class="wide-table"><thead><tr><th>${DIM_ONE[dim]}</th><th>المستهدفون</th><th>المجيبون</th><th>المشاركة</th><th>لم يجيبوا</th>${opts.map((o, i) => `<th style="white-space:normal"><span style="display:inline-block;width:6pt;height:6pt;border-radius:1.5pt;background:${color(i)};margin-left:3pt"></span>${escHtml(o.label)}</th>`).join("")}<th style="width:14%">الرسم (٪ من المستهدفين)</th></tr></thead><tbody>
      ${gs.map(g => `<tr style="break-inside:avoid"><td style="white-space:normal"><b>${escHtml(g.label)}</b>${g.detail ? `<div style="font-size:7pt;color:#777">${escHtml(g.detail)}</div>` : ""}</td><td>${g.audience}</td><td>${g.respondents}</td><td><b>${fmtPct(g.respondents, g.audience)}</b></td><td>${g.nonrespondents}</td>${g.options.map(o => cell(o, g)).join("")}<td>${chart(g)}</td></tr>`).join("") || `<tr><td colspan="${6 + opts.length}">لا يوجد جمهور</td></tr>`}
    </tbody></table></div>`;
  };
  const legend = `<div style="display:flex;flex-wrap:wrap;gap:8pt;font-size:8pt;margin:2pt 0 6pt">${opts.map((o, i) => `<span><span style="display:inline-block;width:7pt;height:7pt;border-radius:2pt;background:${color(i)};margin-left:3pt"></span>${escHtml(o.label)}</span>`).join("")}${s.multiple ? "" : `<span><span style="display:inline-block;width:7pt;height:7pt;border-radius:2pt;background:${NONRESP_COLOR};margin-left:3pt"></span>لم يجب</span>`}</div>
  <div style="font-size:7.5pt;color:#666;margin-bottom:2pt">في كل خانة: العدد · <b>٪ من المستهدفين</b> (الأساسية) · (٪ من المجيبين)</div>
  <div style="font-size:7.5pt;color:#666;margin-bottom:4pt">${escHtml(DIST_NOTE)}${s.multiple ? ` ${escHtml(MULTI_NOTE)}` : ""}</div>`;
  return `<div class="section-title">معلومات الاستطلاع</div>${info}
<div class="section-title">نتائج التصويت</div>${kpis}${results}
${legend}${DIMS.map(dimTable).join("")}`;
}
