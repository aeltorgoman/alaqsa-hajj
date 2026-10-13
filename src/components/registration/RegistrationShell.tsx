import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ConfirmModal, useConfirm } from "../AlertModal";
import { btnP, btnS } from "../../utils";

/* ═══════════════════════════════════════════════════════════════
   إطار نافذة التسجيل — الحاجّ والإداري بتصميمٍ واحد

   العارض يساراً والنموذج يميناً، والنموذج يتمرّر وحده والعارض ثابت،
   والحفظ والإلغاء مثبّتان في الأسفل. وتحت عرضٍ ضيّق يصير عموداً واحداً.

   والإغلاق مسارٌ واحد — Escape وزرّ ✕ وزرّ الإلغاء والنقر خارج النافذة:
   نموذجٌ لم يُمسّ يُغلق فوراً، وما فيه تغييرٌ يُسأل عنه مرّةً واحدة.
   والنافذة تملك Escape ما دامت مفتوحة: لا يصل إلى مستمعي الصفحة، فلا
   يتضاعف سؤال ولا يُغلق ما خلفها.
   ═══════════════════════════════════════════════════════════════ */

type Props = {
  show: boolean;
  title: string;
  subtitle?: string;
  /** في النافذة ما يضيع بإغلاقها */
  dirty: boolean;
  /** إغلاقٌ وتجاهلٌ للمسوّدة — بعد التأكيد إن لزم */
  onDiscard: () => void;
  viewer: ReactNode;
  /** شريط الحالة فوق الحقول (قراءةٌ جارية أو خطأ) */
  status?: ReactNode;
  children: ReactNode;
  primary: { label: ReactNode; onClick: () => void; disabled?: boolean };
  /** الحفظ جارٍ: لا إغلاق حتى ينتهي */
  busy?: boolean;
};

export function RegistrationShell({ show, title, subtitle, dirty, onDiscard, viewer, status, children, primary, busy }: Props) {
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const dialog = useRef<HTMLDivElement>(null);

  const requestClose = async () => {
    if (busy || confirmState) return;
    if (!dirty) { onDiscard(); return; }
    const discard = await confirmAction("في النافذة بياناتٌ لم تُحفظ. هل تريد تجاهلها وإغلاق النافذة؟", {
      title: "تغييرات غير محفوظة", confirmLabel: "تجاهل التغييرات", cancelLabel: "متابعة التعديل",
    });
    if (discard) onDiscard();
  };

  /* المستمع على `window` في طور الالتقاط: يسبق مستمعي `document` في
     الصفحة، ويوقف الحدث عندهم. */
  const latest = useRef({ requestClose, confirmOpen: false, cancelConfirm: handleCancel });
  useEffect(() => { latest.current = { requestClose, confirmOpen: !!confirmState, cancelConfirm: handleCancel }; });
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      if (latest.current.confirmOpen) { latest.current.cancelConfirm(); return; }
      /* نافذةُ تأكيدٍ أخرى مفتوحة فوقنا: Escape لا يُغلق ما تحتها */
      if (document.querySelector("[data-confirm-dialog]")) return;
      void latest.current.requestClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [show]);

  useEffect(() => { if (show) dialog.current?.focus(); }, [show]);

  if (!show) return null;
  return (
    <div className="regs-backdrop" onClick={() => void requestClose()}>
      <div ref={dialog} className="regs" role="dialog" aria-modal="true" aria-labelledby="regs-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="regs-head">
          <div>
            <div id="regs-title" className="regs-title">{title}</div>
            {subtitle && <div className="regs-sub">{subtitle}</div>}
          </div>
          <button type="button" className="regs-x" aria-label="إغلاق" disabled={busy} onClick={() => void requestClose()}>✕</button>
        </div>
        <div className="regs-body">
          <div className="regs-form">
            {status && <div className="regs-status">{status}</div>}
            {children}
          </div>
          <div className="regs-viewer">{viewer}</div>
        </div>
        <div className="regs-foot">
          <button type="button" onClick={primary.onClick} disabled={primary.disabled}
            style={{ ...btnP(), flex: "0 1 220px", opacity: primary.disabled ? 0.6 : 1, cursor: primary.disabled ? "not-allowed" : "pointer" }}>
            {primary.label}
          </button>
          <button type="button" onClick={() => void requestClose()} disabled={busy} style={{ ...btnS(), opacity: busy ? 0.6 : 1 }}>إلغاء</button>
        </div>
      </div>
      <div onClick={e => e.stopPropagation()}>
        <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      </div>
      <style>{SHELL_CSS}</style>
    </div>
  );
}

const SHELL_CSS = `
.regs-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
.regs{width:min(1080px,100%);height:min(780px,100%);display:flex;flex-direction:column;background:var(--bg-card);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);border:.5px solid var(--border);overflow:hidden;outline:none}
.regs-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:12px 18px;border-bottom:.5px solid var(--border);flex-shrink:0}
.regs-title{font-size:14px;font-weight:700;color:var(--text)}
.regs-sub{font-size:11px;color:var(--text-muted);margin-top:2px}
.regs-x{background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-muted);line-height:1;padding:2px 4px;border-radius:6px}
.regs-x:focus-visible{outline:2px solid var(--primary)}
.regs-body{flex:1;min-height:0;display:flex}
.regs-form{flex:55 1 0;min-width:0;overflow-y:auto;padding:14px 18px}
.regs-viewer{flex:45 1 0;min-width:0;padding:14px;border-inline-start:.5px solid var(--border);background:var(--bg-2,#faf8f4)}
.regs-status{position:sticky;top:-14px;z-index:2;margin:-14px -18px 12px;padding:9px 18px;background:var(--bg-card);border-bottom:.5px solid var(--border)}
.regs-foot{display:flex;gap:8px;padding:10px 18px;border-top:.5px solid var(--border);background:var(--bg-card);flex-shrink:0}
@media (max-width:860px){
  .regs{height:100%}
  .regs-body{flex-direction:column-reverse;overflow-y:auto}
  .regs-viewer{flex:0 0 auto;height:min(42vh,360px);border-inline-start:none;border-bottom:.5px solid var(--border)}
  .regs-form{flex:none;overflow:visible}
}
`;
