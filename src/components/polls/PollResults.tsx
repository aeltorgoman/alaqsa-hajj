/* ═══ شاشةُ نتائج الاستطلاع — داخل تبويب «الاستطلاعات» (Phase 4) ═══
   ثلاثةُ تبويبات: نتائج التصويت · تحليل التوزيع (الباصات · مخيمات منى · رحلات الذهاب · رحلات العودة)
   · المشاركة والمتابعة. وفي التوزيع لكلّ خيارٍ نسبتان: من المستهدفين (الأساسيّة) ومن المجيبين.
   المصدرُ دالّةٌ واحدة محروسةٌ بـmanage_portal: `poll_details` (ترحيلة Phase 4). وقبل تطبيقها:
   المغلقُ يُعرض من لقطة الإغلاق (`get_poll_snapshot` — Phase 2، بالحارس نفسه)، والمنشورُ يُبلَّغ
   بوضوح أنّ الشاشة تنتظر الترحيلة — لا التفافَ على الصلاحيات ولا قراءةَ جداولَ مغلقة.
   كلُّ رقمٍ يُحسب في `results.ts` — مصدرٌ واحدٌ للشاشة وExcel وPDF. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabase";
import { btnP, btnS, inp, makeHTML, printInPage, addSummarySheet, freezeHeaderRow } from "../../utils";
import { useReportBranding } from "../../company/CompanyContext";
import { STATUS_LABEL, type PollRow } from "./polls";
import {
  DIMS, DIM_LABEL, DIM_ONE, DIST_NOTE, FLIGHT_SNAPSHOT_NOTE, MULTI_NOTE, NONRESP_COLOR, OPTION_COLORS, SHEET_NAME, UNASSIGNED, answerLabels, cellText,
  detailsFromSnapshot, exportSheets, filterRows, fmtPct, groupBy, isFlight, labelOf, normalizeDetails, pct, reportBody, sortRows, sourceNote, summarize,
  type DetailRow, type Dim, type Group, type OptionStat, type PollDetails, type PollMeta, type SortKey,
} from "./results";

type Tab = "results" | "distribution" | "participation";
const TABS: { id: Tab; label: string }[] = [
  { id: "results", label: "نتائج التصويت" }, { id: "distribution", label: "تحليل التوزيع" }, { id: "participation", label: "المشاركة والمتابعة" },
];
const color = (i: number) => OPTION_COLORS[i % OPTION_COLORS.length];
const card = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 14, marginBottom: 12 } as const;
const linkBtn = { background: "none", border: "none", padding: "2px 4px", cursor: "pointer", fontFamily: "inherit", color: "var(--primary)", fontWeight: 800, fontSize: "inherit", textDecoration: "underline", textUnderlineOffset: 3 } as const;

export function PollResults({ poll, onBack }: { poll: PollRow; onBack: () => void }) {
  const branding = useReportBranding();
  const [d, setD] = useState<PollDetails | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error" | "denied" | "pending-migration">("loading");
  const [tab, setTab] = useState<Tab>("results");
  const [drawer, setDrawer] = useState<{ title: string; sub?: string; rows: DetailRow[] } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("poll_details", { p_poll_id: poll.id });
    if (!error && data) { setD(normalizeDetails(data as Record<string, unknown>)); setState("ok"); return; }
    if (error?.code === "42501") { setState("denied"); return; }
    /* الترحيلةُ لم تُطبَّق بعد (PGRST202): المغلقُ من لقطته (Phase 2)، والمنشورُ ينتظر */
    if (error?.code === "PGRST202") {
      if (poll.status === "closed") {
        const { data: snap, error: e2 } = await supabase.rpc("get_poll_snapshot", { p_poll_id: poll.id });
        if (!e2 && snap) { setD(detailsFromSnapshot(snap as Record<string, unknown>, poll.kind, poll.max_choices)); setState("ok"); return; }
        setState(e2?.code === "42501" ? "denied" : "error"); return;
      }
      setState("pending-migration"); return;
    }
    console.error("تعذر تحميل النتائج", error);
    setState("error");
  }, [poll.id, poll.status, poll.kind, poll.max_choices]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const meta: PollMeta = { title: poll.title, body: poll.body, kind: poll.kind, max_choices: poll.max_choices, status: d?.status || poll.status,
    published_at: poll.published_at, closed_at: poll.closed_at, close_reason: poll.close_reason, allow_answer_changes: poll.allow_answer_changes };

  async function exportExcel() {
    if (!d) return;
    setExportOpen(false);
    const XLSX = await import("xlsx");
    const sh = exportSheets(d, meta);
    const wb = XLSX.utils.book_new();
    const add = (aoa: (string | number)[][], name: string, cols: number[]) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = cols.map(wch => ({ wch })); freezeHeaderRow(ws);
      (ws as unknown as { "!dir"?: string })["!dir"] = "rtl";
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    add(sh.answers, SHEET_NAME.answers, [10, 28, 10, 18, 18, 18, 18, 34, 10]);
    for (const dim of DIMS) add(sh[dim], SHEET_NAME[dim], [22, ...(isFlight(dim) ? [34] : []), 10, 10, 10, 12, ...Array(sh[dim][0].length - (isFlight(dim) ? 6 : 5)).fill(14)]);
    add(sh.nonrespondents, SHEET_NAME.nonrespondents, [10, 28, 10, 18, 18, 18, 18]);
    addSummarySheet(wb, XLSX, `نتائج استطلاع: ${poll.title}`, branding.companyName || "", sh.summary, SHEET_NAME.summary);
    XLSX.writeFile(wb, `نتائج_استطلاع_${poll.id}.xlsx`);
  }
  function exportPdf() {
    if (!d) return;
    setExportOpen(false);
    printInPage(makeHTML(`نتائج استطلاع: ${poll.title}`, reportBody(d, meta), branding, { chrome: { pageNumbers: true } }));
  }

  return (
    <div className="poll-results" style={{ textAlign: "start" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <button type="button" onClick={onBack} style={{ ...btnS(), fontSize: 11.5, marginBottom: 8 }}>→ رجوع إلى الاستطلاعات</button>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: 0, overflowWrap: "anywhere" }}>{poll.title}</h2>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.8 }}>
            {STATUS_LABEL[poll.status]} · {poll.kind === "single" ? "اختيار واحد" : `اختيار متعدد${poll.max_choices ? ` (حتى ${poll.max_choices})` : ""}`}
            {d && <> · <span data-source>{sourceNote(d)}</span></>}
          </div>
        </div>
        {d && (
          <div style={{ position: "relative" }}>
            <button type="button" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(o => !o)} style={{ ...btnP(), minHeight: 34 }}>تصدير ▾</button>
            {exportOpen && (
              <div role="menu" style={{ position: "absolute", insetInlineEnd: 0, top: "calc(100% + 4px)", zIndex: 20, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)", minWidth: 170, padding: 4 }}>
                <button type="button" role="menuitem" onClick={exportExcel} style={menuItem}>Excel (.xlsx)</button>
                <button type="button" role="menuitem" onClick={exportPdf} style={menuItem}>PDF (طباعة)</button>
              </div>
            )}
          </div>
        )}
      </div>

      {state === "loading" && <div role="status" style={{ fontSize: 12, color: "var(--text-muted)", padding: 16 }}>جاري تحميل النتائج...</div>}
      {state === "error" && <div role="alert" style={{ fontSize: 12, color: "var(--danger)", fontWeight: 700, padding: 16 }}>تعذر تحميل النتائج — يرجى المحاولة مرة أخرى. <button type="button" onClick={load} style={{ ...btnS(), fontSize: 11 }}>إعادة المحاولة</button></div>}
      {state === "denied" && <div role="alert" style={{ fontSize: 12, color: "var(--danger)", fontWeight: 700, padding: 16 }}>لا تملك صلاحية عرض نتائج الاستطلاعات.</div>}
      {state === "pending-migration" && <div role="alert" style={{ ...card, fontSize: 12, color: "var(--warning)", fontWeight: 700, lineHeight: 1.9 }}>
        نتائجُ الاستطلاع المنشور بالأسماء تحتاج تحديث قاعدة البيانات (ترحيلة Phase 4) الذي لم يُطبَّق بعد. الاستطلاعات المغلقة تُعرض من لقطة إغلاقها.
      </div>}

      {d && state === "ok" && <>
        <div role="tablist" aria-label="أقسام النتائج" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 12, overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, padding: "8px 12px 10px", whiteSpace: "nowrap",
                       color: tab === t.id ? "var(--primary)" : "var(--text-muted)", borderBottom: tab === t.id ? "2.5px solid var(--primary)" : "2.5px solid transparent" }}>{t.label}</button>
          ))}
        </div>
        {tab === "results" && <ResultsTab d={d} open={(title, rows) => setDrawer({ title, rows })} />}
        {tab === "distribution" && <DistributionTab d={d} open={(title, rows, sub) => setDrawer({ title, sub, rows })} />}
        {tab === "participation" && <ParticipationTab d={d} />}
      </>}
      {drawer && d && <NamesDrawer d={d} title={drawer.title} sub={drawer.sub} rows={drawer.rows} onClose={() => setDrawer(null)} />}
    </div>
  );
}
const menuItem = { display: "block", width: "100%", textAlign: "start", background: "none", border: "none", padding: "8px 12px", fontFamily: "inherit", fontSize: 12, color: "var(--text)", cursor: "pointer", borderRadius: 8 } as const;

function Kpis({ d }: { d: PollDetails }) {
  const s = summarize(d);
  const k = (l: string, v: string | number, testId: string) => (
    <div data-kpi={testId} style={{ flex: "1 1 120px", background: "var(--bg-2)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{l}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{v}</div>
    </div>
  );
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
    {k("المستهدفون", s.audience, "audience")}{k("المجيبون", s.respondents, "respondents")}{k("لم يجيبوا", s.nonrespondents, "nonrespondents")}{k("نسبة المشاركة", fmtPct(s.respondents, s.audience), "participation")}
  </div>;
}

function ResultsTab({ d, open }: { d: PollDetails; open: (t: string, r: DetailRow[]) => void }) {
  const s = summarize(d);
  return <section aria-label="نتائج التصويت">
    <Kpis d={d} />
    <div style={card}>
      {s.respondents === 0 && <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>لا توجد إجابات بعد.</div>}
      {s.options.map((o, i) => (
        <div key={o.id} data-option-row={o.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <button type="button" onClick={() => open(`اختاروا «${o.label}»`, o.rows)} disabled={o.count === 0}
              style={{ ...linkBtn, color: "var(--text)", textDecoration: o.count ? "underline" : "none", cursor: o.count ? "pointer" : "default", fontSize: 13, textAlign: "start", overflowWrap: "anywhere" }}>
              <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: color(i), marginInlineEnd: 6 }} />{o.label}
            </button>
            <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 800, whiteSpace: "nowrap" }} data-count>{o.count} صوت · {fmtPct(o.count, s.respondents)}</span>
          </div>
          <div role="progressbar" aria-label={o.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={o.pct}
            style={{ height: 10, borderRadius: 99, background: "var(--bg-hover)", overflow: "hidden", marginTop: 5 }}>
            <div style={{ width: `${Math.min(100, o.pct)}%`, height: "100%", background: color(i) }} />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", lineHeight: 1.8 }}>
        {s.multiple ? MULTI_NOTE : "النسبة من عدد المجيبين."} اضغط اسم الخيار لعرض الحجاج الذين اختاروه.
      </div>
    </div>
  </section>;
}

function DistributionTab({ d, open }: { d: PollDetails; open: (t: string, r: DetailRow[], sub?: string) => void }) {
  const [dim, setDim] = useState<Dim>("bus");
  /* الجدولُ هو الافتراض: صفٌّ مضغوطٌ لكلّ مجموعة يسهّل المقارنة؛ والرسمُ اختياريّ */
  const [view, setView] = useState<"table" | "chart">("table");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupBy(d, dim), [d, dim]);
  const opts = summarize(d).options;
  const multiple = d.kind === "multiple";
  const gkey = (g: Group) => `${dim}:${g.key ?? "none"}`;
  const toggle = (k: string) => setExpanded(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const num = (n: number, title: string, rows: DetailRow[], sub?: string) => n > 0
    ? <button type="button" onClick={() => open(title, rows, sub)} style={linkBtn}>{n}</button> : <span style={{ color: "var(--text-muted)" }}>0</span>;
  const pill = (on: boolean) => ({ border: on ? "2px solid var(--primary)" : "1px solid var(--border)", background: on ? "var(--primary)" : "var(--bg-card)", color: on ? "var(--text-inverse)" : "var(--text)", borderRadius: 99, fontSize: 12, fontWeight: 800, padding: "5px 14px", cursor: "pointer", fontFamily: "inherit", minHeight: 32 });
  const swatch = (i: number) => <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: color(i), marginInlineEnd: 5, verticalAlign: "middle", flexShrink: 0 }} />;
  /* خليّةُ الخيار المضغوطة: العدد · الأساسيّة (عريضة) · (الثانويّة) */
  const optCell = (o: OptionStat, g: Group) => (
    <span style={{ whiteSpace: "nowrap" }}>
      {num(o.count, `${g.label} — «${o.label}»`, o.rows, cellText(o, g))}
      {" "}<b data-pct-targeted style={{ color: "var(--text)", fontSize: 13 }}>{fmtPct(o.count, g.audience)}</b>
      {" "}<span data-pct-respondents title="من المجيبين" style={{ color: "var(--text-muted)", fontSize: 11 }}>({fmtPct(o.count, g.respondents)})</span>
    </span>
  );
  const nameCell = (g: Group) => (
    <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 0 }}>
      <span style={{ color: g.key === null ? "var(--warning)" : "var(--text)", fontWeight: 800 }}>{g.label}</span>
      {g.detail && <span data-flight-detail style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap" }}>{g.detail}</span>}
    </span>
  );
  const headCols = [DIM_ONE[dim], "المستهدفون", "المجيبون", "المشاركة", "لم يجيبوا"];

  /* تفاصيلُ المجموعة الموسَّعة — تبقى ظاهرةً في إطار التمرير الأفقيّ (لاصقة) */
  const details = (g: Group) => (
    <div data-group-details style={{ position: "sticky", insetInlineStart: 0, width: "min(680px, calc(100vw - 48px))", padding: "10px 12px", boxSizing: "border-box" }}>
      {g.detail && <div style={{ fontSize: 12, color: "var(--text)", marginBottom: 6 }}><b>{DIM_ONE[dim]}:</b> {g.label} · <span style={{ color: "var(--text-muted)" }}>{g.detail}</span></div>}
      {isFlight(dim) && d.source === "snapshot" && g.key !== null && <div style={{ fontSize: 11, color: "var(--warning)", marginBottom: 6 }}>تفاصيل الرحلة غير محفوظة في لقطة الإغلاق.</div>}
      <div style={{ display: "flex", gap: "6px 16px", flexWrap: "wrap", fontSize: 12.5, marginBottom: 8 }}>
        <span>المستهدفون: {num(g.audience, `${g.label} — المستهدفون`, g.rows)}</span>
        <span>المجيبون: {num(g.respondents, `${g.label} — المجيبون`, g.rows.filter(r => r.responded))}</span>
        <span>لم يجيبوا: {num(g.nonrespondents, `${g.label} — لم يجيبوا`, g.rows.filter(r => !r.responded))}</span>
        <span>المشاركة: <b>{fmtPct(g.respondents, g.audience)}</b></span>
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        {g.options.map((o, i) => (
          <div key={o.id} data-detail-opt={o.id} style={{ display: "grid", gridTemplateColumns: "minmax(70px, 150px) 1fr auto", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>{swatch(i)}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.label}>{o.label}</span></span>
            <span style={{ height: 10, borderRadius: 5, background: "var(--bg-hover)", overflow: "hidden" }}><span style={{ display: "block", width: `${Math.min(100, pct(o.count, g.audience))}%`, height: "100%", background: color(i) }} /></span>
            <span style={{ whiteSpace: "nowrap" }}>{num(o.count, `${g.label} — «${o.label}»`, o.rows, cellText(o, g))} <b>{fmtPct(o.count, g.audience)}</b> <span style={{ color: "var(--text-muted)", fontSize: 11 }}>· {fmtPct(o.count, g.respondents)} من المجيبين</span></span>
          </div>
        ))}
      </div>
    </div>
  );

  return <section aria-label="تحليل التوزيع">
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
      <div role="radiogroup" aria-label="التوزيع حسب" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {DIMS.map(k => <button key={k} type="button" role="radio" aria-checked={dim === k} onClick={() => setDim(k)} style={pill(dim === k)}>{DIM_LABEL[k]}</button>)}
      </div>
      <div role="radiogroup" aria-label="طريقة العرض" style={{ display: "flex", gap: 6, marginInlineStart: "auto" }}>
        <button type="button" role="radio" aria-checked={view === "table"} onClick={() => setView("table")} style={pill(view === "table")}>جدول</button>
        <button type="button" role="radio" aria-checked={view === "chart"} onClick={() => setView("chart")} style={pill(view === "chart")}>رسم</button>
      </div>
    </div>
    {d.source === "snapshot" && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>الإسناد كما كان لحظة إغلاق الاستطلاع.</div>}
    {isFlight(dim) && d.source === "snapshot" && <div data-flight-snapshot-note style={{ fontSize: 11, color: "var(--warning)", fontWeight: 700, marginBottom: 6, lineHeight: 1.8 }}>{FLIGHT_SNAPSHOT_NOTE}</div>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8, alignItems: "center" }}>
      <span>في كل خانة: العدد · <b style={{ color: "var(--text)" }}>٪ من المستهدفين</b> (الأساسية) · (٪ من المجيبين)</span>
      <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap" }}>{opts.map((o, i) => <span key={o.id} style={{ color: "var(--text)" }}>{swatch(i)}{o.label}</span>)}
        {view === "chart" && !multiple && <span style={{ color: "var(--text)" }}><span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: NONRESP_COLOR, marginInlineEnd: 5, verticalAlign: "middle" }} />لم يجب</span>}
      </span>
    </div>

    {view === "table" ? (
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }} data-dist-table>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ background: "var(--bg-2)" }}>
            {headCols.map((h, i) => <th key={h} scope="col" style={{ ...th, ...(i === 0 ? stickyCell("var(--bg-2)") : {}) }}>{h}</th>)}
            {opts.map((o, i) => <th key={o.id} scope="col" style={{ ...th, whiteSpace: "normal", minWidth: 110, maxWidth: 180 }}><span style={{ display: "inline-flex", alignItems: "center" }}>{swatch(i)}{o.label}</span></th>)}
          </tr></thead>
          <tbody>
            {groups.map(g => {
              const k = gkey(g), on = expanded.has(k);
              return [
                <tr key={k} data-group={g.key ?? "none"} aria-expanded={on}
                  onClick={e => { if ((e.target as HTMLElement).closest("button,a,input,select")) return; toggle(k); }}
                  style={{ borderTop: "1px solid var(--border)", cursor: "pointer", background: on ? "var(--bg-hover)" : undefined }}>
                  <th scope="row" style={{ ...tdc, ...stickyCell(on ? "var(--bg-hover)" : "var(--bg-card)"), fontWeight: 400 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button type="button" data-expand aria-expanded={on} aria-controls={`dg-${k}`} aria-label={`${on ? "إخفاء" : "عرض"} تفاصيل ${g.label}`} onClick={() => toggle(k)}
                        style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text)", borderRadius: 6, width: 24, height: 24, padding: 0, cursor: "pointer", flexShrink: 0, fontSize: 11 }}>{on ? "▾" : "◂"}</button>
                      {nameCell(g)}
                    </span>
                  </th>
                  <td style={tdc}>{num(g.audience, `${g.label} — المستهدفون`, g.rows)}</td>
                  <td style={tdc}>{num(g.respondents, `${g.label} — المجيبون`, g.rows.filter(r => r.responded))}</td>
                  <td style={tdc}><b>{fmtPct(g.respondents, g.audience)}</b></td>
                  <td style={tdc}>{num(g.nonrespondents, `${g.label} — لم يجيبوا`, g.rows.filter(r => !r.responded))}</td>
                  {g.options.map(o => <td key={o.id} style={tdc} data-opt-cell={o.id}>{optCell(o, g)}</td>)}
                </tr>,
                on ? <tr key={`${k}-d`} id={`dg-${k}`} data-group-detail-row={g.key ?? "none"} style={{ background: "var(--bg-2)" }}><td colSpan={headCols.length + opts.length} style={{ padding: 0 }}>{details(g)}</td></tr> : null,
              ];
            })}
            {groups.length === 0 && <tr><td colSpan={headCols.length + opts.length} style={{ ...tdc, color: "var(--text-muted)" }}>لا يوجد جمهور.</td></tr>}
          </tbody>
        </table>
      </div>
    ) : multiple ? (
      /* المتعدّد: مصفوفةٌ مضغوطة — صفٌّ لكلّ مجموعة وعمودٌ لكلّ خيار، وشريطٌ مستقلٌّ بنسبته من المستهدفين (لا تكديس) */
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }} data-dist-chart data-chart-kind="matrix">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr style={{ background: "var(--bg-2)" }}>
            <th scope="col" style={{ ...th, ...stickyCell("var(--bg-2)") }}>{DIM_ONE[dim]}</th>
            <th scope="col" style={th}>المشاركة</th>
            {opts.map((o, i) => <th key={o.id} scope="col" style={{ ...th, whiteSpace: "normal", minWidth: 120 }}><span style={{ display: "inline-flex", alignItems: "center" }}>{swatch(i)}{o.label}</span></th>)}
          </tr></thead>
          <tbody>
            {groups.map(g => (
              <tr key={gkey(g)} data-chart-group={g.key ?? "none"} style={{ borderTop: "1px solid var(--border)" }}>
                <th scope="row" style={{ ...tdc, ...stickyCell("var(--bg-card)"), fontWeight: 400 }}>{nameCell(g)}</th>
                <td style={tdc}>{g.respondents}/{g.audience} · <b>{fmtPct(g.respondents, g.audience)}</b></td>
                {g.options.map((o, i) => (
                  <td key={o.id} style={tdc}>
                    <button type="button" role="img" disabled={!o.count} aria-label={`${g.label} — ${o.label}: ${cellText(o, g)}`} onClick={() => open(`${g.label} — «${o.label}»`, o.rows, cellText(o, g))}
                      style={{ display: "block", width: "100%", height: 10, borderRadius: 5, background: "var(--bg-hover)", border: "none", padding: 0, overflow: "hidden", cursor: o.count ? "pointer" : "default", marginBottom: 3 }}>
                      <span style={{ display: "block", width: `${Math.min(100, pct(o.count, g.audience))}%`, height: "100%", background: color(i) }} />
                    </button>
                    <span style={{ whiteSpace: "nowrap" }}><b>{fmtPct(o.count, g.audience)}</b> <span style={{ color: "var(--text-muted)", fontSize: 10.5 }}>({fmtPct(o.count, g.respondents)})</span></span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      /* الاختيار الواحد: شريطٌ واحدٌ لكلّ مجموعة = ١٠٠٪ من مستهدفيها (الخياراتُ متنافية + «لم يجب») — مقارنةٌ مباشرةٌ بين المجموعات */
      <div style={{ ...card, padding: "10px 12px" }} data-dist-chart data-chart-kind="stacked">
        {groups.map(g => (
          <div key={gkey(g)} data-chart-group={g.key ?? "none"} style={{ display: "grid", gridTemplateColumns: "minmax(80px, 160px) 1fr auto", alignItems: "center", gap: 10, padding: "5px 0" }}>
            <span style={{ fontSize: 12, minWidth: 0, overflow: "hidden" }} title={g.detail || g.label}>
              <span style={{ display: "block", color: g.key === null ? "var(--warning)" : "var(--text)", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
            </span>
            <div style={{ display: "flex", height: 18, borderRadius: 6, overflow: "hidden", background: "var(--bg-hover)" }}>
              {g.options.map((o, i) => o.count ? (
                <button key={o.id} type="button" role="img" aria-label={`${g.label} — ${o.label}: ${cellText(o, g)}`} title={`${o.label}: ${cellText(o, g)}`}
                  onClick={() => open(`${g.label} — «${o.label}»`, o.rows, cellText(o, g))}
                  style={{ width: `${pct(o.count, g.audience)}%`, background: color(i), border: "none", padding: 0, cursor: "pointer" }} />
              ) : null)}
              {g.nonrespondents > 0 && <button type="button" role="img" aria-label={`${g.label} — لم يجيبوا: ${g.nonrespondents} · ${fmtPct(g.nonrespondents, g.audience)} من المستهدفين`}
                title={`لم يجيبوا: ${g.nonrespondents}`} onClick={() => open(`${g.label} — لم يجيبوا`, g.rows.filter(r => !r.responded))}
                style={{ width: `${pct(g.nonrespondents, g.audience)}%`, background: NONRESP_COLOR, border: "none", padding: 0, cursor: "pointer" }} />}
            </div>
            <span style={{ fontSize: 11.5, whiteSpace: "nowrap", color: "var(--text-muted)" }}><b style={{ color: "var(--text)" }}>{fmtPct(g.respondents, g.audience)}</b> مشاركة · {g.audience}</span>
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>كل شريط = ١٠٠٪ من المستهدفين في المجموعة؛ مرّر أو اضغط مقطعاً لعرض العدد والنسبتين والأسماء.</div>
      </div>
    )}
    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.8 }}>
      اضغط صفاً لعرض تفاصيله، أو رقماً لعرض أسماء الحجاج. «{UNASSIGNED}» = حجاج بلا {DIM_ONE[dim]} ولا يُسقَطون من الحساب. {DIST_NOTE} {multiple ? MULTI_NOTE : ""}
    </div>
  </section>;
}
const th = { padding: "7px 10px", textAlign: "start", color: "var(--text)", fontWeight: 800, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", verticalAlign: "bottom" } as const;
const tdc = { padding: "6px 10px", textAlign: "start", color: "var(--text)", whiteSpace: "nowrap", verticalAlign: "middle" } as const;
/* العمودُ الأوّل لاصقٌ عند التمرير الأفقيّ (الخيارات الكثيرة) */
const stickyCell = (bg: string) => ({ position: "sticky", insetInlineStart: 0, background: bg, zIndex: 1, boxShadow: "inset -1px 0 0 var(--border)" }) as const;
const td = { padding: "8px 10px", textAlign: "start", color: "var(--text)", whiteSpace: "nowrap" } as const;

function ParticipationTab({ d }: { d: PollDetails }) {
  const [status, setStatus] = useState<"all" | "answered" | "not">("all");
  const [bus, setBus] = useState<string>("all");
  const [mina, setMina] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const toKey = (v: string): number | null | "all" => (v === "all" ? "all" : v === "none" ? null : Number(v));
  const scoped = filterRows(d.rows, { bus: toKey(bus), mina: toKey(mina) });
  const shown = sortRows(d, filterRows(scoped, { status, q }), sort);
  const s = summarize(d, scoped);
  const opt = (dim: Dim) => [...new Set(d.rows.map(r => r[dim] ?? null))].sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0) || labelOf(d, dim, a).localeCompare(labelOf(d, dim, b), "ar"));
  const sel = { ...inp, width: "auto", minWidth: 130, padding: "6px 10px" };
  return <section aria-label="المشاركة والمتابعة">
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
      <select aria-label="الباص" value={bus} onChange={e => setBus(e.target.value)} style={sel}>
        <option value="all">كل الباصات</option>{opt("bus").map(k => <option key={String(k)} value={k === null ? "none" : k}>{labelOf(d, "bus", k)}</option>)}
      </select>
      <select aria-label="مخيم منى" value={mina} onChange={e => setMina(e.target.value)} style={sel}>
        <option value="all">كل مخيمات منى</option>{opt("camp_mina").map(k => <option key={String(k)} value={k === null ? "none" : k}>{labelOf(d, "camp_mina", k)}</option>)}
      </select>
    </div>
    <Kpis d={{ ...d, rows: scoped }} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
      <div role="radiogroup" aria-label="الحالة" style={{ display: "flex", gap: 6 }}>
        {([["all", `الكل (${s.audience})`], ["answered", `أجابوا (${s.respondents})`], ["not", `لم يجيبوا (${s.nonrespondents})`]] as const).map(([k, l]) =>
          <button key={k} type="button" role="radio" aria-checked={status === k} onClick={() => setStatus(k)}
            style={{ border: status === k ? "2px solid var(--primary)" : "1px solid var(--border)", background: status === k ? "var(--primary)" : "var(--bg-card)", color: status === k ? "var(--text-inverse)" : "var(--text)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "5px 13px", cursor: "pointer", fontFamily: "inherit", minHeight: 32 }}>{l}</button>)}
      </div>
      <input type="search" aria-label="بحث بالاسم" placeholder="بحث بالاسم" value={q} onChange={e => setQ(e.target.value)} style={{ ...inp, width: "auto", flex: "1 1 160px" }} />
      <select aria-label="الترتيب" value={sort} onChange={e => setSort(e.target.value as SortKey)} style={sel}>
        <option value="name">ترتيب: الاسم</option><option value="status">ترتيب: الحالة</option><option value="bus">ترتيب: الباص</option><option value="mina">ترتيب: مخيم منى</option>
      </select>
    </div>
    <PeopleTable d={d} rows={shown} />
  </section>;
}

function PeopleTable({ d, rows }: { d: PollDetails; rows: DetailRow[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }} data-people>
        <thead><tr style={{ background: "var(--bg-2)" }}>
          {["الاسم", "الباص", "مخيم منى", "الحالة", "الإجابة"].map(h => <th key={h} scope="col" style={{ padding: "8px 10px", textAlign: "start", color: "var(--text)", fontWeight: 800, borderBottom: "1px solid var(--border)" }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.passenger_id} data-pid={r.passenger_id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ ...td, whiteSpace: "normal" }}><PilgrimLink r={r} /></td>
              <td style={{ ...td, color: r.bus == null ? "var(--warning)" : "var(--text)" }}>{labelOf(d, "bus", r.bus)}</td>
              <td style={{ ...td, color: r.camp_mina == null ? "var(--warning)" : "var(--text)" }}>{labelOf(d, "camp_mina", r.camp_mina)}</td>
              <td style={{ ...td, color: r.responded ? "var(--success)" : "var(--danger)", fontWeight: 800 }}>{r.responded ? "أجاب" : "لم يجب"}</td>
              <td style={{ ...td, whiteSpace: "normal" }}>{answerLabels(d, r).join("، ") || "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} style={{ ...td, color: "var(--text-muted)" }}>لا يوجد حجاج بهذه التصفية.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* فتحُ ملفّ الحاجّ: صفحةُ الحجاج نفسها (`/pilgrims?pid=`) بتبويبٍ جديد — فلا تضيع شاشةُ النتائج */
function PilgrimLink({ r }: { r: DetailRow }) {
  return <a href={`/pilgrims?pid=${r.passenger_id}`} target="_blank" rel="noopener" style={{ color: "var(--primary)", fontWeight: 700, textDecoration: "none" }}
    title="فتح ملف الحاج">{r.name_ar || `#${r.passenger_id}`}</a>;
}

function NamesDrawer({ d, title, sub, rows, onClose }: { d: PollDetails; title: string; sub?: string; rows: DetailRow[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => { document.removeEventListener("keydown", h); prev?.focus?.(); };
  }, [onClose]);
  const shown = sortRows(d, filterRows(rows, { q }), sort);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 300 }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} data-drawer onClick={e => e.stopPropagation()}
        style={{ position: "absolute", top: 0, bottom: 0, insetInlineEnd: 0, width: "min(440px, 100%)", background: "var(--bg-card)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column", outline: "none", direction: "rtl" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", overflowWrap: "anywhere" }}>{title}</div>
            <div data-drawer-sub style={{ fontSize: 11, color: "var(--text-muted)" }}>{sub || `${rows.length} حاج`}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" style={{ ...btnS(), padding: "6px 10px" }}>✕</button>
        </div>
        <div style={{ padding: "10px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
          <input type="search" aria-label="بحث بالاسم" placeholder="بحث بالاسم" value={q} onChange={e => setQ(e.target.value)} style={{ ...inp, flex: "1 1 150px", width: "auto" }} />
          <select aria-label="الترتيب" value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ ...inp, width: "auto" }}>
            <option value="name">الاسم</option><option value="bus">الباص</option><option value="mina">مخيم منى</option>
          </select>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: "4px 0", overflowY: "auto", flex: 1 }}>
          {shown.map(r => (
            <li key={r.passenger_id} data-pid={r.passenger_id} style={{ padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
              <PilgrimLink r={r} />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {labelOf(d, "bus", r.bus)} · {labelOf(d, "camp_mina", r.camp_mina)} · ذهاب: {labelOf(d, "flight_go", r.flight_go)} · عودة: {labelOf(d, "flight_back", r.flight_back)}
                {r.responded ? ` · ${answerLabels(d, r).join("، ")}` : " · لم يجب"}
              </div>
            </li>
          ))}
          {shown.length === 0 && <li style={{ padding: 14, fontSize: 12, color: "var(--text-muted)" }}>لا نتائج.</li>}
        </ul>
      </div>
    </div>
  );
}

