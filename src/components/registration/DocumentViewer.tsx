import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { fetchDocumentBytes, storedDocMime, useSignedDoc } from "../../utils";
import type { ScanStatus } from "./useDocSlots";

/* ═══════════════════════════════════════════════════════════════
   عارض المستندات — الجواز والبطاقة في نافذة التسجيل والتعديل

   التدوير يُعرض فوراً ويُحفظ مع الصورة عند الحفظ (يملكه صاحب النافذة).
   التكبير والسحب والملاءمة للعرض وحده — لا تصل إلى الملفّ أبداً.
   وملفّ الـPDF تُعرض صفحتُه الأولى بلا تدوير: لا يُحوَّل ولا يُعاد ترميزه.
   ═══════════════════════════════════════════════════════════════ */

export type ViewerDoc = {
  key: string;
  label: string;
  file: File | null;
  stored: string | null;
  version: number;
  turns: number;
  onRotate?: (delta: 1 | -1) => void;
  onReplace?: (file: File) => void;
  accept?: string;
  status?: ScanStatus;
  emptyText: string;
  uploadLabel?: string;
};

type View = { zoom: number; x: number; y: number; version: number };
const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3, 4];

const isPdfDoc = (d: ViewerDoc) =>
  d.file ? d.file.type === "application/pdf" : storedDocMime(d.stored) === "application/pdf";

export function DocumentViewer({ docs, active, onActiveChange }: { docs: ViewerDoc[]; active: string; onActiveChange?: (key: string) => void }) {
  const doc = docs.find(d => d.key === active) ?? docs[0];
  const [views, setViews] = useState<Record<string, View>>({});
  const saved = views[doc.key];
  const view = saved && saved.version === doc.version ? saved : { zoom: 1, x: 0, y: 0, version: doc.version };
  const setView = (v: Partial<View>) => setViews(prev => ({ ...prev, [doc.key]: { ...view, ...v } }));
  const hasDoc = !!(doc.file || doc.stored);
  const pdf = hasDoc && isPdfDoc(doc);
  const zi = ZOOMS.indexOf(view.zoom);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="docv">
      {docs.length > 1 && (
        <div role="tablist" aria-label="المستندات" className="docv-tabs">
          {docs.map(d => (
            <button key={d.key} type="button" role="tab" aria-selected={d.key === doc.key}
              className={"docv-tab" + (d.key === doc.key ? " on" : "")} onClick={() => onActiveChange?.(d.key)}>
              {d.label}
              {d.status === "scanning" && <span className="docv-spin sm" aria-label="جارٍ القراءة" />}
            </button>
          ))}
        </div>
      )}

      <div className="docv-stage-wrap">
        {hasDoc ? (
          <Stage key={doc.key + ":" + doc.version} doc={doc} pdf={pdf} view={view} setView={setView} />
        ) : (
          <div className="docv-empty">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></svg>
            <div>{doc.emptyText}</div>
            {doc.onReplace && (
              <button type="button" className="docv-upload" onClick={() => fileInput.current?.click()}>{doc.uploadLabel ?? "رفع صورة"}</button>
            )}
          </div>
        )}
        {doc.status === "scanning" && (
          <div className="docv-scanning" role="status"><span className="docv-spin" />جارٍ قراءة المستند…</div>
        )}
      </div>

      {hasDoc && (
        <div className="docv-tools" role="toolbar" aria-label={`أدوات ${doc.label}`}>
          {doc.onRotate && (
            <>
              <ToolBtn label="تدوير عكس عقارب الساعة" disabled={pdf} onClick={() => doc.onRotate?.(-1)} icon='<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/>' />
              <ToolBtn label="تدوير مع عقارب الساعة" disabled={pdf} onClick={() => doc.onRotate?.(1)} icon='<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>' />
              <span className="docv-sep" />
            </>
          )}
          <ToolBtn label="تصغير" disabled={zi <= 0} onClick={() => setView({ zoom: ZOOMS[Math.max(0, zi - 1)], ...(zi - 1 <= 0 ? { x: 0, y: 0 } : {}) })} icon='<circle cx="11" cy="11" r="7"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16" y2="16"/>' />
          <span className="docv-zoom" aria-live="polite">{Math.round(view.zoom * 100)}٪</span>
          <ToolBtn label="تكبير" disabled={zi >= ZOOMS.length - 1} onClick={() => setView({ zoom: ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)] })} icon='<circle cx="11" cy="11" r="7"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="21" y1="21" x2="16" y2="16"/>' />
          <ToolBtn label="ملاءمة للمساحة" disabled={view.zoom === 1 && !view.x && !view.y} onClick={() => setView({ zoom: 1, x: 0, y: 0 })} icon='<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>' />
          {doc.onReplace && (
            <>
              <span className="docv-sep" />
              <button type="button" className="docv-replace" onClick={() => fileInput.current?.click()}>استبدال</button>
            </>
          )}
          {pdf && doc.onRotate && <span className="docv-note">ملفّ PDF يُحفظ كما هو بلا تدوير</span>}
        </div>
      )}
      {doc.onReplace && (
        <input ref={fileInput} type="file" accept={doc.accept ?? "image/*"} hidden
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doc.onReplace?.(f); }} />
      )}
      <style>{VIEWER_CSS}</style>
    </div>
  );
}

function ToolBtn({ label, icon, onClick, disabled }: { label: string; icon: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="docv-btn" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon }} />
    </button>
  );
}

/* ── المسرح: يقيس مساحته ومقاسَ المستند، ويرسمه ملائماً مهما دار ── */
function Stage({ doc, pdf, view, setView }: { doc: ViewerDoc; pdf: boolean; view: View; setView: (v: Partial<View>) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const media = useDocMedia(doc, pdf);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const turns = pdf ? 0 : ((doc.turns % 4) + 4) % 4;
  const sideways = turns % 2 === 1;
  const fw = nat ? (sideways ? nat.h : nat.w) : 0;
  const fh = nat ? (sideways ? nat.w : nat.h) : 0;
  const pad = 16;
  const fit = nat && size.w && size.h ? Math.min((size.w - pad) / fw, (size.h - pad) / fh) : 0;
  const scale = fit * view.zoom;
  const maxX = Math.max(0, (fw * scale - size.w) / 2 + pad);
  const maxY = Math.max(0, (fh * scale - size.h) / 2 + pad);
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  const x = clamp(view.x, maxX), y = clamp(view.y, maxY);
  const canPan = view.zoom > 1;

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canPan) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x, y };
    setDragging(true);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setView({ x: clamp(d.x + e.clientX - d.px, maxX), y: clamp(d.y + e.clientY - d.py, maxY) });
  };
  const onUp = () => { drag.current = null; setDragging(false); };

  return (
    <div ref={box} className={"docv-stage" + (canPan ? " pan" : "") + (dragging ? " drag" : "")}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onDoubleClick={() => setView(view.zoom > 1 ? { zoom: 1, x: 0, y: 0 } : { zoom: 2 })}>
      {media.error ? (
        <div className="docv-empty">{media.error}</div>
      ) : !media.src ? (
        <div className="docv-empty"><span className="docv-spin" />جارٍ تحميل المستند…</div>
      ) : (
        <img src={media.src} alt={doc.label} draggable={false}
          onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{
            position: "absolute", left: "50%", top: "50%",
            width: nat?.w, height: nat?.h, maxWidth: "none",
            visibility: fit ? "visible" : "hidden",
            transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${turns * 90}deg) scale(${scale || 1})`,
            transition: dragging ? "none" : "transform .18s ease",
          }} />
      )}
    </div>
  );
}

/* ── مصدر العرض: ملفٌّ اختير الآن أو مستندٌ محفوظ؛ صورةٌ أو PDF ──
   كلّ ضبطٍ للحالة يقع في ردٍّ لاحق (قراءة/توقيع/تصيير)، والمكوّن
   يُعاد تركيبه بتغيّر المعروض (`key`) فلا تحمل حالتُه أثرَ ما سبق. */
function useDocMedia(doc: ViewerDoc, pdf: boolean): { src: string; error: string } {
  const [state, setState] = useState({ src: "", error: "" });
  const storedImage = useSignedDoc(!doc.file && !pdf ? doc.stored : null);
  const { file, stored } = doc;

  useEffect(() => {
    let alive = true;
    const fail = () => { if (alive) setState({ src: "", error: "تعذّر عرض المستند" }); };
    if (file && !pdf) {
      const reader = new FileReader();
      reader.onload = () => { if (alive) setState({ src: String(reader.result), error: "" }); };
      reader.onerror = fail;
      reader.readAsDataURL(file);
      return () => { alive = false; reader.abort(); };
    }
    if (pdf) {
      const bytes = file ? file.arrayBuffer().then(b => new Uint8Array(b)) : fetchDocumentBytes(stored ?? "");
      bytes
        .then(async b => (await import("../../print/print.pdf")).renderPdfPagesToImages(b, { maxPages: 1, targetWidth: 1400 }))
        .then(pages => { if (alive) setState(pages[0] ? { src: pages[0], error: "" } : { src: "", error: "تعذّر عرض المستند" }); })
        .catch(e => { console.error("تعذّر تصيير صفحة الـPDF", e); fail(); });
    }
    return () => { alive = false; };
  }, [file, stored, pdf]);

  if (!file && !pdf) return { src: storedImage, error: "" };
  return state;
}

const VIEWER_CSS = `
.docv{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px}
.docv-tabs{display:flex;gap:4px;background:var(--bg-2,#f3f0ea);padding:3px;border-radius:10px}
.docv-tab{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;border:none;border-radius:8px;background:transparent;font-family:inherit;font-size:12px;font-weight:700;color:var(--text-muted);cursor:pointer}
.docv-tab.on{background:var(--paper,#fff);color:var(--primary);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.docv-tab:focus-visible,.docv-btn:focus-visible,.docv-replace:focus-visible,.docv-upload:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.docv-stage-wrap{position:relative;flex:1;min-height:0;border-radius:12px;border:1px solid var(--line);background:#2a2326;overflow:hidden}
.docv-stage{position:absolute;inset:0;overflow:hidden;touch-action:none;user-select:none}
.docv-stage.pan{cursor:grab}.docv-stage.drag{cursor:grabbing}
.docv-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:rgba(255,255,255,.75);font-size:12.5px;text-align:center;padding:16px}
.docv-upload{padding:7px 16px;border-radius:99px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.1);color:#fff;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}
.docv-scanning{position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:99px;background:rgba(255,255,255,.95);color:var(--primary);font-size:12px;font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,.2)}
.docv-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(125,31,60,.2);border-top-color:var(--primary,#7D1F3C);animation:hajjSpin .8s linear infinite;display:inline-block}
.docv-spin.sm{width:10px;height:10px;border-width:1.5px}
.docv-tools{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.docv-btn{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid var(--line);background:var(--paper,#fff);color:var(--ink);cursor:pointer}
.docv-btn:disabled{opacity:.35;cursor:default}
.docv-zoom{min-width:44px;text-align:center;font-size:11.5px;font-weight:700;color:var(--text-muted)}
.docv-sep{width:1px;height:20px;background:var(--line);margin:0 4px}
.docv-replace{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--paper,#fff);color:var(--ink);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}
.docv-note{font-size:10.5px;color:var(--text-muted);margin-inline-start:6px}
@keyframes hajjSpin{to{transform:rotate(360deg)}}
`;
