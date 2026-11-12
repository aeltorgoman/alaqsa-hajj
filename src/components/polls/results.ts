/* ═══ نتائجُ الاستطلاع — الحساب والتصدير (Phase 4) ═══
   مصدرٌ واحدٌ لكلّ رقمٍ في الشاشة وفي Excel وفي PDF: صفوفُ `poll_details` (صفٌّ لكلّ حاجٍّ في
   الجمهور المجمَّد بإجابته الحاليّة). فلا يختلف رقمُ الشاشة عن رقم الملفّ، ولا يُعدّ حاجٌّ مرّتين.
   النِّسَب:
     · المشاركة = المجيبون ÷ المستهدفين.
     · الخيار   = مختاروه ÷ المجيبين — في المتعدّد قد يتجاوز المجموعُ ١٠٠٪ (يختار الحاجُّ أكثرَ من خيار).
     · صفرُ مجيبين ← ٠٪ لا قسمةٌ على صفر.
   التوزيع: الباصاتُ ومخيّماتُ منى وحدها، و«غير مُسنَد» مجموعةٌ صريحةٌ لا تُسقَط.
   ملفٌّ بلا مكوّنات (Fast Refresh) ويُختبر بـnode وحده. */

export type DetailOption = { id: number; label: string; sort_order?: number };
export type DetailRow = {
  passenger_id: number; name_ar: string | null; passenger_type: string | null; added_reason?: string | null;
  bus: number | null; camp_mina: number | null; responded: boolean; revision: number | null; option_ids: number[];
};
export type PollDetails = {
  poll_id: number; status: string; kind: "single" | "multiple"; max_choices: number | null;
  source: "live" | "snapshot"; as_of: string | null;
  options: DetailOption[];
  labels: { bus: Record<string, string>; camp_mina: Record<string, string> };
  rows: DetailRow[];
};
export type Dim = "bus" | "camp_mina";
export const DIM_LABEL: Record<Dim, string> = { bus: "الباصات", camp_mina: "مخيمات منى" };
export const DIM_ONE: Record<Dim, string> = { bus: "الباص", camp_mina: "مخيم منى" };
export const UNASSIGNED = "غير مُسنَد";

export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
export const fmtPct = (n: number, d: number) => `${pct(n, d).toLocaleString("en-US", { maximumFractionDigits: 1 })}٪`;

/** شكلُ لقطة Phase 2 (get_poll_snapshot) ← شكلُ poll_details. للمغلق وحده، قبل تطبيق ترحيلة Phase 4. */
export function detailsFromSnapshot(s: Record<string, unknown>, kind: "single" | "multiple", maxChoices: number | null): PollDetails {
  const labels = (s.labels || {}) as Record<string, Record<string, string>>;
  const rows = ((s.rows || []) as Record<string, unknown>[]).map(e => ({
    passenger_id: Number(e.passenger_id), name_ar: (e.name_ar as string) ?? null, passenger_type: (e.passenger_type as string) ?? null,
    added_reason: (e.added_reason as string) ?? null, bus: (e.bus as number) ?? null, camp_mina: (e.camp_mina as number) ?? null,
    responded: !!e.responded, revision: (e.revision as number) ?? null, option_ids: ((e.option_ids as number[]) || []).map(Number),
  })).sort((a, b) => a.passenger_id - b.passenger_id);
  return {
    poll_id: Number(s.poll_id), status: "closed", kind, max_choices: maxChoices, source: "snapshot", as_of: (s.closed_at as string) ?? null,
    options: ((s.options || []) as DetailOption[]), labels: { bus: labels.bus || {}, camp_mina: labels.camp_mina || {} }, rows,
  };
}

export const sortedOptions = (d: PollDetails) =>
  d.options.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

export type OptionStat = { id: number; label: string; count: number; pct: number; rows: DetailRow[] };
export type Summary = { audience: number; respondents: number; nonrespondents: number; participation: number; options: OptionStat[]; multiple: boolean; optionTotal: number };

export function summarize(d: PollDetails, rows: DetailRow[] = d.rows): Summary {
  const respondents = rows.filter(r => r.responded).length;
  const options = sortedOptions(d).map(o => {
    const who = rows.filter(r => r.responded && r.option_ids.includes(o.id));
    return { id: o.id, label: o.label, count: who.length, pct: pct(who.length, respondents), rows: who };
  });
  return {
    audience: rows.length, respondents, nonrespondents: rows.length - respondents, participation: pct(respondents, rows.length),
    options, multiple: d.kind === "multiple", optionTotal: options.reduce((s, o) => s + o.count, 0),
  };
}

export const labelOf = (d: PollDetails, dim: Dim, id: number | null) =>
  id == null ? UNASSIGNED : (d.labels[dim][String(id)] || `#${id}`);

export type Group = Summary & { key: number | null; label: string; rows: DetailRow[] };
/** التوزيعُ بالباص أو بمخيّم منى. غيرُ المُسنَد مجموعةٌ أخيرةٌ صريحة؛ والبقيّةُ بالاسم. */
export function groupBy(d: PollDetails, dim: Dim): Group[] {
  const keys = new Map<string, number | null>();
  for (const r of d.rows) keys.set(r[dim] == null ? "" : String(r[dim]), r[dim] ?? null);
  return Array.from(keys.values())
    .map(key => {
      const rows = d.rows.filter(r => (r[dim] ?? null) === key);
      return { ...summarize(d, rows), key, label: labelOf(d, dim, key), rows };
    })
    .sort((a, b) => (a.key === null ? 1 : 0) - (b.key === null ? 1 : 0) || a.label.localeCompare(b.label, "ar") || (a.key ?? 0) - (b.key ?? 0));
}

export const answerLabels = (d: PollDetails, r: DetailRow) =>
  sortedOptions(d).filter(o => r.option_ids.includes(o.id)).map(o => o.label);

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
  ? `لقطة الإغلاق — الأعداد والإسناد (الباص ومنى) كما كانت لحظة الإغلاق (${dt(d.as_of)})`
  : `نتائج حيّة — الإسناد (الباص ومنى) الحالي، حتى ${dt(d.as_of)}`;
export const MULTI_NOTE = "في الاختيار المتعدد تُحسب نسبة كل خيار من عدد المجيبين، فقد يتجاوز مجموع النسب ١٠٠٪.";

/** أوراقُ Excel (مصفوفاتٌ صافية) — تختبرها الوحداتُ بلا متصفّح */
export function exportSheets(d: PollDetails, m: PollMeta): Record<"summary" | "answers" | "bus" | "mina" | "nonrespondents", Cell[][]> {
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
  ];
  const answers: Cell[][] = [
    ["رقم الحاج", "الاسم", "النوع", "الباص", "مخيم منى", "الإجابة", "رقم المراجعة"],
    ...sortRows(d, d.rows.filter(r => r.responded), "name").map(r => [r.passenger_id, r.name_ar || "", r.passenger_type || "",
      labelOf(d, "bus", r.bus), labelOf(d, "camp_mina", r.camp_mina), answerLabels(d, r).join("، "), r.revision ?? ""] as Cell[]),
  ];
  const dimSheet = (dim: Dim): Cell[][] => [
    [DIM_ONE[dim], "المستهدفون", "المجيبون", "نسبة المشاركة", ...opts.flatMap(o => [`${o.label} (عدد)`, `${o.label} (٪)`])],
    ...groupBy(d, dim).map(g => [g.label, g.audience, g.respondents, fmtPct(g.respondents, g.audience),
      ...g.options.flatMap(o => [o.count, fmtPct(o.count, g.respondents)])] as Cell[]),
  ];
  const nonrespondents: Cell[][] = [
    ["رقم الحاج", "الاسم", "النوع", "الباص", "مخيم منى"],
    ...sortRows(d, d.rows.filter(r => !r.responded), "name").map(r => [r.passenger_id, r.name_ar || "", r.passenger_type || "",
      labelOf(d, "bus", r.bus), labelOf(d, "camp_mina", r.camp_mina)] as Cell[]),
  ];
  return { summary, answers, bus: dimSheet("bus"), mina: dimSheet("camp_mina"), nonrespondents };
}

export const OPTION_COLORS = ["#2E7D32", "#1565C0", "#B8860B", "#6A1B9A", "#C62828", "#00838F", "#AD1457", "#5D4037", "#3949AB", "#7CB342"];
const escHtml = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** جسمُ تقرير PDF (يُلفّ بـmakeHTML بهويّة الحملة). كلُّ نصٍّ مُهرَّب، والرسومُ أشرطةٌ بـCSS تُطبع بألوانها. */
export function reportBody(d: PollDetails, m: PollMeta): string {
  const s = summarize(d);
  const opts = sortedOptions(d);
  const color = (i: number) => OPTION_COLORS[i % OPTION_COLORS.length];
  const bar = (p: number, c: string) => `<div style="background:#eee;border-radius:3pt;height:8pt;width:100%;overflow:hidden"><div style="width:${Math.min(100, Math.max(0, p))}%;height:100%;background:${c}"></div></div>`;
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
  const dimTable = (dim: Dim) => {
    const gs = groupBy(d, dim);
    const stacked = (g: Group) => `<div style="display:flex;height:9pt;border-radius:3pt;overflow:hidden;background:#eee;min-width:60pt">${
      g.respondents ? g.options.map((o, i) => o.count ? `<div style="width:${(o.count / Math.max(1, g.options.reduce((x, y) => x + y.count, 0))) * 100}%;background:${color(i)}"></div>` : "").join("") : ""}</div>`;
    return `<div class="section-title">${DIM_LABEL[dim]}</div>
    <table class="wide-table"><thead><tr><th>${DIM_ONE[dim]}</th><th>المستهدفون</th><th>المجيبون</th><th>المشاركة</th>${opts.map(o => `<th>${escHtml(o.label)}</th>`).join("")}<th style="width:18%">التوزيع</th></tr></thead><tbody>
      ${gs.map(g => `<tr><td>${escHtml(g.label)}</td><td>${g.audience}</td><td>${g.respondents}</td><td>${fmtPct(g.respondents, g.audience)}</td>${g.options.map(o => `<td>${o.count} (${fmtPct(o.count, g.respondents)})</td>`).join("")}<td>${stacked(g)}</td></tr>`).join("") || `<tr><td colspan="${5 + opts.length}">لا يوجد جمهور</td></tr>`}
    </tbody></table>`;
  };
  const legend = `<div style="display:flex;flex-wrap:wrap;gap:8pt;font-size:8pt;margin:2pt 0 6pt">${opts.map((o, i) => `<span><span style="display:inline-block;width:7pt;height:7pt;border-radius:2pt;background:${color(i)};margin-left:3pt"></span>${escHtml(o.label)}</span>`).join("")}</div>`;
  return `<div class="section-title">معلومات الاستطلاع</div>${info}
<div class="section-title">نتائج التصويت</div>${kpis}${results}
${legend}${dimTable("bus")}${dimTable("camp_mina")}`;
}
