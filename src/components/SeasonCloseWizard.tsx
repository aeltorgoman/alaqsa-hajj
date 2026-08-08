// ============================================================
// معالج إقفال الموسم
// ============================================================
// خمس خطوات، ولا كتابة واحدة قبل الخطوة الخامسة.
//
// التحقق من الهوية يقع في الخطوة الأولى ويبقى سارياً ما دام
// المعالج مفتوحاً — دورة حياة المكوّن هي الحدّ: التفكيك يمحو
// كلمة المرور، فالإلغاء ثم البدء من جديد يعيد السؤال.
//
// ⚠️ الإقفال يحفظ البيانات ولا يحذفها. الشيء الوحيد الذي يُحذف
// هو ملفات المستندات. حذف بيانات الموسم عملية أخرى تماماً
// (delete_season) تقع لاحقاً على موسم مقفل بالفعل.
import { useState } from "react";
import { supabase } from "../supabase";
import type { Passenger, User } from "../types";
import type { Season } from "../season/useSeason";
import { Modal } from "./Modal";
import { btnP, btnS, inp, getStoragePath } from "../utils";

/* أعمدة المستندات الستة — مصدر العدّ ومصدر الحذف معاً */
const DOC_COLUMNS = [
  "photo_url", "passport_url", "national_id_url",
  "contract_url", "hajj_permit_url", "flight_ticket_url",
] as const;

type Counts = { passengers: number; buses: number; camps: number; rooms: number };
type Step = 1 | 2 | 3 | 4 | 5 | "executing" | "done";

interface Props {
  show: boolean;
  onClose: () => void;
  activeSeason: Season;
  counts: Counts | undefined;
  currentUser: User;
  onGoToNewSeason: () => void;
  /* أسماء المواسم القائمة — لفحص التكرار قبل الإرسال */
  existingNames: string[];
}

/* الموسم التالي بالرقم إن كان الاسم رقماً محضاً، وإلا فارغ.
   لا حساب هجريّاً: أسماء المواسم نصوص حرّة، وأي منطق تقويميّ
   سيخطئ يوماً ما بصمت. */
/* functions.invoke يضع الاستجابة غير الناجحة في error ويترك data
   فارغاً، فرسالة الخادم العربية تضيع خلف رسالة عامة. هذه تستخرجها
   من جسم الاستجابة لتصل إلى المستخدم كما كتبتها الدالة. */
type AdminResult = { ok?: boolean; name?: string; newSeasonId?: number; closedBy?: string };

async function invokeAdmin(body: Record<string, unknown>): Promise<{ data: AdminResult | null; message: string }> {
  const { data, error } = await supabase.functions.invoke("season-admin", { body });
  if (!error) return { data, message: "" };
  let message = "";
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx) message = (await ctx.json())?.error || "";
  } catch { /* الجسم ليس JSON */ }
  return { data: null, message };
}

function suggestName(current: string): string {
  return /^\d+$/.test(current.trim()) ? String(Number(current.trim()) + 1) : "";
}

function SeasonCloseWizard({ show, onClose, activeSeason, counts, currentUser, onGoToNewSeason, existingNames }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* الخطوة ٢ */
  const [warnings, setWarnings] = useState<string[] | null>(null);
  /* الخطوة ٣ */
  const [docUrls, setDocUrls] = useState<string[]>([]);
  const [downloaded, setDownloaded] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);
  /* عدد الملفات التي تعذّر ضمّها — نسخة ناقصة تُعلَن ولا تُقدَّم كاملة */
  const [dlFailed, setDlFailed] = useState(0);
  /* الخطوة ٤ */
  const [newName, setNewName] = useState(() => suggestName(activeSeason.name));
  /* النتيجة */
  const [result, setResult] = useState<{ newSeasonId: number; closedBy: string; at: string; docsMsg: string; docsOk: boolean } | null>(null);

  const reset = () => {
    setStep(1); setPassword(""); setError(""); setBusy(false);
    setWarnings(null); setDocUrls([]); setDownloaded(false); setDlProgress(0); setDlFailed(0);
    setNewName(suggestName(activeSeason.name)); setResult(null);
  };

  const closeAndReset = () => { reset(); onClose(); };

  /* ── الخطوة ١: الهوية ───────────────────────────────────── */
  const verify = async () => {
    setBusy(true); setError("");
    const { data, message } = await invokeAdmin({ action: "verify", username: currentUser.email, password });
    setBusy(false);
    if (!data?.ok) {
      setError(message || "تعذّر التحقق، يرجى المحاولة مرة أخرى.");
      return;
    }
    await loadReview();
    setStep(2);
  };

  /* ── الخطوة ٢: التحذيرات + عدّ المستندات ────────────────── */
  const loadReview = async () => {
    const { data, error: err } = await supabase
      .from("passengers")
      .select(`id,bus_id,room_id,camp_mina_id,camp_arafa_id,${DOC_COLUMNS.join(",")}`)
      .eq("season_id", activeSeason.id);

    if (err || !data) {
      /* الفحص استشاريّ، ففشله لا يوقف عملية إدارية */
      setWarnings(null);
      setDocUrls([]);
      return;
    }
    const rows = data as unknown as (Passenger & Record<string, string | null>)[];

    const undistributed = rows.filter(p =>
      !p.bus_id || !p.room_id || !p.camp_mina_id || !p.camp_arafa_id).length;
    const noPassport = rows.filter(p => !p.passport_url).length;

    const urls: string[] = [];
    for (const p of rows) for (const c of DOC_COLUMNS) if (p[c]) urls.push(p[c] as string);
    setDocUrls(urls);

    const { count: scheduled } = await supabase
      .from("announcements").select("id", { count: "exact", head: true })
      .gt("show_at", new Date().toISOString());

    const list: string[] = [];
    if (undistributed) list.push(`${undistributed} حاجاً بلا توزيع كامل (باص أو غرفة أو مخيم)`);
    if (noPassport) list.push(`${noPassport} حاجاً بلا صورة جواز مرفوعة`);
    if (scheduled) list.push(`${scheduled} تنبيهاً مجدولاً لن يصل بعد الإقفال`);
    setWarnings(list);
  };

  /* ── الخطوة ٣: تنزيل نسخة ──────────────────────────────── */
  const downloadZip = async () => {
    setBusy(true); setError(""); setDlProgress(0); setDlFailed(0);
    let failed = 0;
    try {
      /* استيراد ديناميكي: المكتبة لا تدخل الحزمة الرئيسية،
         وتُحمَّل عند الضغط على الزرّ لا قبله */
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let done = 0;
      for (const url of docUrls) {
        const path = getStoragePath(url);
        /* الفشل يُعدّ ولا يُبتلع: نسخة ناقصة تخرج صامتة أسوأ من
           عدم التنزيل، لأن المستخدم يحذف المستندات واثقاً بها */
        if (!path) { failed++; }
        else {
          try {
            const res = await fetch(url);
            if (res.ok) zip.file(path, await res.blob());
            else { failed++; console.error("تعذر تنزيل مستند", { url, status: res.status }); }
          } catch (e) { failed++; console.error("تعذر تنزيل مستند", { url, e }); }
        }
        setDlProgress(++done);
      }
      setDlFailed(failed);
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `مستندات-موسم-${activeSeason.name}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      setDownloaded(true);
    } catch (e) {
      console.error("تعذر تجهيز نسخة المستندات", e);
      setError("تعذّر تجهيز النسخة. يمكنك المتابعة أو المحاولة مرة أخرى.");
    }
    setBusy(false);
  };

  /* ── التنفيذ ────────────────────────────────────────────── */
  const execute = async () => {
    setStep("executing"); setError("");

    /* الإقفال أولاً: هو الجوهر، ومعاملة واحدة في القاعدة */
    const { data, message } = await invokeAdmin({
      action: "close", username: currentUser.email, password, newSeasonName: newName.trim(),
    });
    if (!data?.newSeasonId) {
      setError(message || "تعذّر إقفال الموسم. لم يتغيّر شيء — يمكنك إعادة المحاولة.");
      setStep(5);
      return;
    }

    /* حذف الملفات تنظيف تخزين لا سلامة بيانات: فشله لا يمسّ
       الإقفال ولا يُعرض كقرار على المستخدم */
    let docsOk = true;
    let docsMsg = "لا مستندات في هذا الموسم.";
    if (docUrls.length > 0) {
      const paths = docUrls.map(getStoragePath).filter(Boolean);
      const { data: removedData, error: rmErr } = await supabase.storage.from("passengers-docs").remove(paths);
      /* remove() ينجح جزئياً: ما لم يُذكر في data لم يُحذف. المسارات
         الباقية تُسجَّل بأسمائها لا بعددها، فالملف اليتيم يُعثر عليه
         لاحقاً بدل أن يبقى مجهولاً في الحاوية. */
      const removed = new Set((removedData || []).map(f => f.name));
      const orphans = paths.filter(p => !removed.has(p));
      if (rmErr || orphans.length > 0) {
        console.error("[season-close] مستندات لم تُحذف — ملفات يتيمة في passengers-docs", {
          season: activeSeason.name,
          seasonId: activeSeason.id,
          at: new Date().toISOString(),
          count: orphans.length,
          paths: orphans,
          error: rmErr,
        });
        docsOk = false;
        docsMsg = `تعذّر حذف ${orphans.length || docUrls.length} من مستندات موسم ${activeSeason.name}، ويمكن معالجتها لاحقاً.`;
      } else {
        docsMsg = `حُذفت مستندات موسم ${activeSeason.name} (${paths.length} ملفاً).`;
      }
    }

    setResult({
      newSeasonId: data.newSeasonId,
      closedBy: data.closedBy || currentUser.name,
      at: new Date().toLocaleString("ar-EG"),
      docsMsg, docsOk,
    });
    setStep("done");
  };

  const locked = step === "executing";
  const nameTaken = existingNames.some(n => n.trim() === newName.trim()) && newName.trim() !== "";

  return (
    <Modal
      show={show}
      /* أثناء التنفيذ: لا Escape ولا نقر خارجيّ ولا ✕ */
      onClose={locked ? () => {} : closeAndReset}
      title={step === "done" ? "تم إقفال الموسم" : `إقفال موسم ${activeSeason.name}`}
      maxWidth={720}
    >
      {/* مؤشّر الخطوات */}
      {typeof step === "number" && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {["التحقق", "مراجعة الموسم", "المستندات", "الموسم الجديد", "التأكيد"].map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 700,
              padding: "5px 2px", borderRadius: 6,
              background: i + 1 === step ? "var(--primary)" : i + 1 < step ? "var(--success-bg)" : "var(--bg-2)",
              color: i + 1 === step ? "var(--text-inverse)" : i + 1 < step ? "var(--success)" : "var(--text-muted)" }}>
              {i + 1}. {label}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ padding: "8px 12px", marginBottom: 12, borderRadius: 8, fontSize: 12,
          background: "var(--danger-bg, #fdecea)", color: "var(--danger)" }}>{error}</div>
      )}

      {/* ── ١ الهوية ── */}
      {step === 1 && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
            إقفال الموسم عملية إدارية. أدخل كلمة مرورك للمتابعة.
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
            المستخدم: <b>{currentUser.name}</b>
          </div>
          <input type="password" value={password} autoFocus
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && password && !busy) verify(); }}
            placeholder="كلمة المرور" style={inp} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={verify} disabled={!password || busy} style={btnP({ flex: 1, opacity: !password || busy ? 0.6 : 1 })}>
              {busy ? "جارٍ التحقق…" : "متابعة"}
            </button>
            <button onClick={closeAndReset} style={btnS()}>إلغاء</button>
          </div>
        </>
      )}

      {/* ── ٢ مراجعة الموسم ── */}
      {step === 2 && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
            سيصير هذا المحتوى أرشيفاً للعرض فقط، ويبقى محفوظاً بالكامل.
          </div>
          <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: 12, fontSize: 12, marginBottom: 14 }}>
            {counts
              ? `${counts.passengers} حاجاً · ${counts.buses} باصات · ${counts.camps} مخيمات · ${counts.rooms} غرف`
              : "تعذّر حساب المحتوى"}
            {docUrls.length > 0 && <div style={{ marginTop: 6, color: "var(--text-muted)" }}>{docUrls.length} مستنداً مرفوعاً</div>}
          </div>

          {warnings === null ? (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>تعذّر فحص الموسم — يمكنك المتابعة.</div>
          ) : warnings.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--success)" }}>لا توجد ملاحظات — الموسم مكتمل.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {warnings.map(w => (
                <div key={w} style={{ fontSize: 12, color: "var(--warning)" }}>⚠ {w}</div>
              ))}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                هذه ملاحظات للعلم ولا تمنع الإقفال.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => setStep(docUrls.length > 0 ? 3 : 4)} style={btnP({ flex: 1 })}>التالي</button>
            <button onClick={closeAndReset} style={btnS()}>إلغاء</button>
          </div>
        </>
      )}

      {/* ── ٣ المستندات ── */}
      {step === 3 && (
        <>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            موسم {activeSeason.name} يحتوي <b>{docUrls.length}</b> مستنداً.
          </div>
          <div style={{ fontSize: 12, color: "var(--warning)", marginBottom: 14 }}>
            ⚠ ستُحذف نهائياً عند الإقفال ولا يمكن استعادتها.
          </div>
          {downloaded
            ? (dlFailed > 0
                ? <div style={{ fontSize: 12, color: "var(--warning)", marginBottom: 12 }}>
                    ⚠ تم تنزيل النسخة، لكن تعذّر تنزيل {dlFailed} مستنداً.
                  </div>
                : <div style={{ fontSize: 12, color: "var(--success)", marginBottom: 12 }}>✓ نُزّلت النسخة كاملة.</div>)
            : (
              <button onClick={downloadZip} disabled={busy} style={btnS({ width: "100%", marginBottom: 12 })}>
                {busy ? `جارٍ التجهيز… ${dlProgress} / ${docUrls.length}` : "تنزيل نسخة (ZIP)"}
              </button>
            )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setStep(4)} disabled={busy} style={btnP({ flex: 1 })}>التالي</button>
            <button onClick={() => setStep(2)} disabled={busy} style={btnS()}>السابق</button>
            <button onClick={closeAndReset} disabled={busy} style={btnS()}>إلغاء</button>
          </div>
        </>
      )}

      {/* ── ٤ الموسم الجديد ── */}
      {step === 4 && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
            سيبدأ الموسم الجديد فارغاً: لا حجاج ولا باصات ولا مخيمات ولا غرف.
          </div>
          <input value={newName} autoFocus onChange={e => setNewName(e.target.value)}
            placeholder="اسم الموسم الجديد" style={inp} />
          {nameTaken && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>يوجد موسم بهذا الاسم.</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => setStep(5)} disabled={!newName.trim() || nameTaken} style={btnP({ flex: 1, opacity: newName.trim() && !nameTaken ? 1 : 0.6 })}>التالي</button>
            <button onClick={() => setStep(docUrls.length > 0 ? 3 : 2)} style={btnS()}>السابق</button>
            <button onClick={closeAndReset} style={btnS()}>إلغاء</button>
          </div>
        </>
      )}

      {/* ── ٥ التأكيد ── */}
      {step === 5 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>سيتم تنفيذ الآن</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, marginBottom: 16 }}>
            <div>✅ سيتم إغلاق موسم {activeSeason.name}.</div>
            <div>✅ سيتم إنشاء موسم {newName.trim()}.</div>
            <div>✅ سيتم حفظ جميع بيانات موسم {activeSeason.name} داخل الأرشيف.</div>
          </div>

          {docUrls.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "var(--warning)" }}>يتطلب انتباهك</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, marginBottom: 16, color: "var(--warning)" }}>
                <div>⚠ سيتم حذف مستندات موسم {activeSeason.name} من النظام.</div>
                {downloaded
                  ? <div style={{ color: "var(--success)" }}>✓ نُزّلت نسخة من المستندات.</div>
                  : <div>⚠ إذا كنت ترغب في الاحتفاظ بها، قم بتنزيلها قبل المتابعة.</div>}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={execute} style={btnP({ flex: 1, background: "var(--danger)" })}>تنفيذ الإقفال</button>
            <button onClick={() => setStep(4)} style={btnS()}>السابق</button>
            <button onClick={closeAndReset} style={btnS()}>إلغاء</button>
          </div>
        </>
      )}

      {/* ── التنفيذ — بلا أزرار ── */}
      {step === "executing" && (
        <div style={{ padding: "24px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>جارٍ إقفال الموسم…</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>لا تغلق هذه النافذة.</div>
        </div>
      )}

      {/* ── الإيصال ── */}
      {step === "done" && result && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, marginBottom: 16 }}>
            <div>✅ تم إغلاق موسم {activeSeason.name} بنجاح.</div>
            <div>✅ تم إنشاء موسم {newName.trim()}.</div>
            <div>✅ أصبح موسم {newName.trim()} هو الموسم النشط.</div>
            <div style={{ color: result.docsOk ? "var(--success)" : "var(--warning)" }}>
              {result.docsOk && dlFailed === 0 ? "✅" : "⚠️"}{" "}
              {downloaded && dlFailed > 0
                ? `تم تنزيل النسخة، لكن تعذّر تنزيل ${dlFailed} مستنداً. ${result.docsMsg}`
                : downloaded && result.docsOk
                  ? "تم تنزيل نسخة المستندات كاملة وحُذفت من النظام."
                  : result.docsMsg}
            </div>
          </div>

          <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: 12, fontSize: 12, marginBottom: 16 }}>
            {[
              ["الموسم المقفل", activeSeason.name],
              ["الموسم الجديد", newName.trim()],
              ["الحجاج", String(counts?.passengers ?? "—")],
              ["الباصات", String(counts?.buses ?? "—")],
              ["المخيمات", String(counts?.camps ?? "—")],
              ["الغرف", String(counts?.rooms ?? "—")],
              ["نفّذ العملية", result.closedBy],
              ["التاريخ والوقت", result.at],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ color: "var(--text-muted)" }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {/* المزوّد يحمّل المواسم عند التركيب وحده، فالخروج من
                الإيصال يعيد التحميل ليصير الموسم الجديد هو النشط */}
            <button onClick={onGoToNewSeason} style={btnP({ flex: 1 })}>
              الانتقال إلى موسم {newName.trim()}
            </button>
            <button onClick={() => window.location.reload()} style={btnS()}>العودة إلى إدارة المواسم</button>
          </div>
        </>
      )}
    </Modal>
  );
}

export { SeasonCloseWizard };
