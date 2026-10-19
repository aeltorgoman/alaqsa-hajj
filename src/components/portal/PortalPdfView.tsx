/* ═══ عرضُ PDF داخل البوابة — صفحةً صفحة على Canvas ═══
   لماذا لا `<iframe>`: Chrome على Android لا يعرض PDF داخل إطار (يضع مكانه
   بطاقةً بزرّ «فتح» يُحيل إلى التنزيل)، وSafari على iPhone يعرض أولى الصفحات
   وحدها. فيُقرأ الملفُّ (`loadBytes` — مسارُ `pilgrim-doc` نفسُه) ويُصيَّر هنا.

   الذاكرة:
     · pdf.js يُحمَّل بـ`import()` عند أوّل PDF وحده.
     · لكلّ صفحةٍ حاويةٌ بأبعادها، واللوحةُ تُنشأ حين تقترب الصفحةُ من الشاشة
       وتُحرَّر (width = height = 0) حين تبتعد — فلا حدَّ لعدد الصفحات، والحيُّ
       منها ما حول الشاشة، وبسقفٍ صريحٍ فوق ذلك (`MAX_LIVE`).
     · رسمٌ واحدٌ في كلّ لحظة، بطابور.
   والإغلاقُ أو تغيّرُ المستند: يُلغى الجلبُ والرسم، وتُحرَّر اللوحاتُ والمستندُ
   وعاملُه ورابطُ الـBlob. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PortalDocError, type PortalDocErrorKind } from "../../utils";
import type { PortalPdf, PageSize } from "./portal.pdf";
import type { PortalTheme } from "./portal.theme";

/** أقصى عددٍ من اللوحات الحيّة معاً — فوق ما تملؤه الشاشةُ وما حولها */
const MAX_LIVE = 6;

const ERRORS: Record<PortalDocErrorKind | "render", string> = {
  unavailable: "المستند غير متاح الآن. أعد فتح البوابة وحاول مرة أخرى.",
  network: "تعذر تحميل المستند، يرجى التحقق من الإنترنت والمحاولة مرة أخرى",
  invalid: "تعذّر عرض هذا الملف داخل البوابة.",
  too_large: "الملف أكبر من أن يُعرض داخل البوابة.",
  aborted: "",
  render: "تعذّر عرض هذا الملف داخل البوابة.",
};

type Props = {
  t: PortalTheme;
  title: string;
  /** يجلب بايتات الملف ويتحقّق منها — الأبُ يملك الجلسة والتوقيع */
  loadBytes: (signal: AbortSignal) => Promise<Uint8Array>;
  /** إذنُ التنزيل — بدونه لا يُنشأ Blob ولا يظهر رابطٌ يفتح الملفَّ خارج البوابة */
  showDownload: boolean;
  /** الرابطُ الموقَّع نفسُه — مخرجٌ لمتصفّحٍ تعذّر فيه العرض */
  fallbackUrl: string;
  /** رابطُ التنزيل (Blob) حين يجهز، أو "" */
  onDownloadUrl: (url: string) => void;
};

export function PortalPdfView({ t, title, loadBytes, showDownload, fallbackUrl, onDownloadUrl }: Props) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; kind: PortalDocErrorKind | "render" } | { status: "ready"; pdf: PortalPdf; sizes: PageSize[] }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  /* ١ — الجلبُ والفتح */
  useEffect(() => {
    const ac = new AbortController();
    let pdf: PortalPdf | null = null;
    let blobUrl = "";
    let alive = true;
    (async () => {
      try {
        const bytes = await loadBytes(ac.signal);
        if (!alive) return;
        /* الـBlob نسخةٌ قبل أن تنتقل البايتاتُ إلى عامل pdf.js */
        if (showDownload) {
          blobUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
          onDownloadUrl(blobUrl);
        }
        const { openPortalPdf } = await import("./portal.pdf");
        if (!alive) return;
        pdf = await openPortalPdf(bytes, ac.signal);
        if (!alive) { void pdf.destroy(); pdf = null; return; }
        const first = await pdf.pageSize(1);
        if (!alive) return;
        setState({ status: "ready", pdf, sizes: Array.from({ length: pdf.numPages }, () => first) });
      } catch (e) {
        if (!alive) return;
        const kind = e instanceof PortalDocError ? e.kind : "render";
        if (kind !== "aborted") console.error("تعذّر عرض مستند PDF", { kind });
        setState({ status: "error", kind });
      }
    })();
    return () => {
      alive = false;
      ac.abort();
      if (pdf) void pdf.destroy();
      if (blobUrl) { URL.revokeObjectURL(blobUrl); onDownloadUrl(""); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadBytes, showDownload, attempt]);

  /* ٢ — التصييرُ عند الاقتراب، والتحريرُ عند الابتعاد */
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const pdf = state.status === "ready" ? state.pdf : null;
  useEffect(() => {
    if (!pdf) return;
    const canvases = new Map<number, HTMLCanvasElement>();
    const wanted = new Set<number>();
    const visible = new Set<number>();
    const queue: number[] = [];
    let job: { n: number; cancel: () => void } | null = null;
    let disposed = false;

    const release = (n: number) => {
      if (job?.n === n) { job.cancel(); job = null; }
      const c = canvases.get(n);
      if (c) { c.width = 0; c.height = 0; c.remove(); canvases.delete(n); }
      pdf.release(n);
      const slot = slots.current[n - 1];
      if (slot) slot.dataset.state = "idle";
    };
    const pump = () => {
      if (disposed || job) return;
      const n = queue.shift();
      if (n === undefined) return;
      if (!wanted.has(n) || canvases.has(n)) { pump(); return; }
      const slot = slots.current[n - 1];
      if (!slot) { pump(); return; }
      /* سقفٌ صريح: الأبعدُ عن هذه الصفحة يُحرَّر أوّلاً — وما على الشاشة لا يُحرَّر */
      while (canvases.size >= MAX_LIVE) {
        const far = [...canvases.keys()].filter(k => !visible.has(k)).sort((a, b) => Math.abs(b - n) - Math.abs(a - n))[0];
        if (far === undefined) break;
        wanted.delete(far); release(far);
      }
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "display:block;width:100%;height:100%";
      slot.appendChild(canvas);
      canvases.set(n, canvas);
      slot.dataset.state = "rendering";
      const r = pdf.render(n, canvas, slot.clientWidth || 360);
      job = { n, cancel: r.cancel };
      r.promise.then(async () => {
        if (disposed || !canvases.has(n)) return;
        slot.dataset.state = "rendered";
        /* أبعادُ الصفحة الفعليّة (قد تختلف عن الأولى) */
        const sz = await pdf.pageSize(n).catch(() => null);
        if (sz && !disposed) slot.style.aspectRatio = `${sz.width} / ${sz.height}`;
      }).catch(err => {
        if (disposed || (err && err.name === "RenderingCancelledException")) return;
        console.error("تعذّر تصيير صفحة PDF", { page: n });
        slot.dataset.state = "failed";
      }).finally(() => {
        if (job?.n === n) job = null;
        pump();
      });
    };

    const want = (n: number) => { if (!wanted.has(n) || !canvases.has(n)) { wanted.add(n); queue.push(n); } };
    /* «قريبة»: شاشةٌ فوق وشاشةٌ تحت — تُجهَّز قبل أن تصل وتُحرَّر بعد أن تبتعد */
    const near = new IntersectionObserver(entries => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page);
        if (e.isIntersecting) want(n);
        else if (wanted.has(n)) { wanted.delete(n); release(n); }
      }
      queue.sort((a, b) => a - b);
      pump();
    }, { rootMargin: "100% 0px" });
    /* «ظاهرة»: لا تُحرَّر بالسقف، وتُعاد إن كانت قد حُرِّرت */
    const seen = new IntersectionObserver(entries => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page);
        if (e.isIntersecting) { visible.add(n); if (!canvases.has(n)) want(n); }
        else visible.delete(n);
      }
      queue.sort((a, b) => a - b);
      pump();
    });
    slots.current.forEach(el => { if (el) { near.observe(el); seen.observe(el); } });

    return () => {
      disposed = true;
      near.disconnect();
      seen.disconnect();
      job?.cancel();
      [...canvases.keys()].forEach(release);
    };
  }, [pdf]);

  const msg: CSSProperties = { color: "#fff", fontFamily: t.fontD, fontWeight: 700, fontSize: 15.5, textAlign: "center", lineHeight: 2, padding: "40px 16px" };
  const fallback = showDownload && fallbackUrl
    ? <a href={fallbackUrl} target="_blank" rel="noreferrer" data-testid="pdf-fallback"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, marginTop: 10, borderRadius: 13, background: "rgba(255,255,255,.14)", border: "1.5px solid rgba(255,255,255,.3)", color: "#fff", fontFamily: t.fontD, fontWeight: 800, fontSize: 15.5, textDecoration: "none" }}>
        لا يظهر المستند؟ افتحه في صفحة مستقلة
      </a>
    : null;

  if (state.status === "loading") {
    return <div data-testid="pdf-loading" style={msg}>جارٍ تحميل المستند…</div>;
  }
  if (state.status === "error") {
    return (
      <div data-testid="pdf-error" data-kind={state.kind}>
        <div style={msg}>{ERRORS[state.kind]}</div>
        {(state.kind === "network" || state.kind === "unavailable") && (
          <button type="button" onClick={() => { setState({ status: "loading" }); setAttempt(a => a + 1); }}
            style={{ display: "block", margin: "0 auto", minHeight: 46, padding: "0 26px", border: "none", borderRadius: 99, background: t.goldBright, color: t.brandDeep, fontFamily: t.fontD, fontWeight: 800, fontSize: 15.5, cursor: "pointer" }}>
            إعادة المحاولة
          </button>
        )}
        {(state.kind === "invalid" || state.kind === "render" || state.kind === "too_large") && fallback}
      </div>
    );
  }
  return (
    <div data-testid="pdf-pages" aria-label={title}>
      {state.sizes.map((sz, i) => (
        <div key={i} ref={el => { slots.current[i] = el; }} data-page={i + 1} data-state="idle"
          style={{ position: "relative", width: "100%", aspectRatio: `${sz.width} / ${sz.height}`, background: "#fff", borderRadius: 10, overflow: "hidden", marginBottom: 10 }} />
      ))}
      {fallback}
    </div>
  );
}
