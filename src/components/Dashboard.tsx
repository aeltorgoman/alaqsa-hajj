import { useRef } from "react";
import type { Passenger, User } from "../types";
import { canAccessPage } from "../navigation/nav";
import { SeasonPhaseCard, PackagesCard, TotalPilgrimsCard, SmartAlertsCard } from "./Seasontimeline";

function Dashboard({ passengers, setPage, currentUser, onAddManual, onScan }: {
  passengers: Passenger[];
  setPage: (p: string) => void;
  currentUser: User;
  onAddManual?: () => void;
  onScan?: (file: File) => void;
}) {

  const navTo = (page: string) => {
    /* الصلاحيةُ من مصدر التنقّل الواحد — لا خريطةَ ثانية */
    if (canAccessPage(currentUser, page)) setPage(page);
  };

  const scanInputRef = useRef<HTMLInputElement>(null);

  /* جذبٌ مغناطيسيّ خفيف نحو المؤشّر — للفأرة وحدها، ويتوقّف مع تقليل الحركة.
     يكتب متغيّرَي CSS على الزرّ مباشرةً: لا حالةَ ولا إعادةَ رسم. */
  const magnetic = {
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = e.currentTarget, r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width - 0.5) * 6}px`);
      el.style.setProperty("--my", `${((e.clientY - r.top) / r.height - 0.5) * 4}px`);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.style.removeProperty("--mx");
      e.currentTarget.style.removeProperty("--my");
    },
  };

  return (
    <div style={{ display: "flex", flex: 1 }}>

      {/* ══ العمود الأوسط ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: 14, gap: 12, minWidth: 0 }}>

        {/* 1) أزرار الإجراءات */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flexShrink: 0 }}>

          {/* مسح مستند — أساسي: تدرّج لون الثيم مع لمعةٍ عند المرور فقط */}
          <button type="button" className="dqa dqa-primary" onClick={() => scanInputRef.current?.click()} {...magnetic}>
            <span className="dqa-icon">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                <line x1="7" y1="12" x2="17" y2="12"/>
              </svg>
            </span>
            <span className="dqa-text">
              <span className="dqa-title">مسح مستند</span>
              <span className="dqa-sub" style={{ opacity: .75 }}>جواز / بطاقة / تصريح حج</span>
            </span>
          </button>
          {/* نفس مدخل صفحة الحجاج: يقبل PDF فعلياً، والعرض يلحق بالواقع */}
          <input ref={scanInputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (onScan) { onScan(file); } else { (window as any).__hajj_pending_scan_file__ = file; setPage("passengers"); }
            e.target.value = "";
          }} />

          {/* إضافة يدوي — ثانوي: عاجيّ بإطارٍ ذهبي، بلا لمعة */}
          <button type="button" className="dqa dqa-secondary" onClick={() => { onAddManual ? onAddManual() : navTo("passengers"); }} {...magnetic}>
            <span className="dqa-icon">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent-dark)" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </span>
            <span className="dqa-text">
              <span className="dqa-title">إضافة يدوي</span>
              <span className="dqa-sub" style={{ opacity: .7 }}>إدخال بيانات الحاج يدوياً</span>
            </span>
          </button>
          <style>{QUICK_ACTION_CSS}</style>
        </div>

        {/* 2) كارت مراحل الموسم */}
        <SeasonPhaseCard passengers={passengers} setPage={navTo} />

        {/* 3) الصف السفلي: آخر المسجلين + توزيع الباقات */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1, minHeight: 0, overflowY: "auto" }}>

          {/* الكارت الذكي — تنبيهات حسب المرحلة */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <SmartAlertsCard passengers={passengers} setPage={navTo} />
          </div>


          {/* توزيع الباقات */}
          <PackagesCard passengers={passengers} setPage={navTo} />
        </div>
      </div>

      {/* ══ العمود الأيسر — Analytics ══ */}
      <div style={{ width: "var(--sidebar-width)", flexShrink: 0, background: "var(--paper)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0", display: "flex", flexDirection: "column", minHeight: 0, gap: 12 }}>
          <div style={{ flexShrink: 0, padding: "0 12px" }}>
            <TotalPilgrimsCard passengers={passengers} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* أزرار الإجراءات السريعة — حركةٌ عند التفاعل وحده، لا حركةَ مستمرّة */
const QUICK_ACTION_CSS = `
.dqa{--mx:0px;--my:0px;--lift:0px;position:relative;overflow:hidden;display:flex;align-items:center;gap:11px;width:100%;padding:13px 16px;border-radius:12px;cursor:pointer;font-family:inherit;text-align:start;
  transform:translate3d(var(--mx),calc(var(--my) + var(--lift)),0);transition:transform .25s cubic-bezier(.2,.7,.3,1),box-shadow .25s ease,border-color .25s ease}
.dqa:hover{--lift:-2px}
.dqa:active{--lift:0px;transition-duration:.1s}
.dqa:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.dqa-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.dqa-text{display:flex;flex-direction:column;min-width:0}
.dqa-title{font-size:13.5px;font-weight:700;line-height:1.2}
.dqa-sub{font-size:10.5px;margin-top:2px}
.dqa-primary{border:1px solid rgba(255,255,255,.08);color:var(--text-inverse);
  background:linear-gradient(135deg,var(--primary-light) 0%,var(--primary) 55%,var(--primary-dark) 100%);
  box-shadow:0 4px 12px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.12)}
.dqa-primary:hover{box-shadow:0 8px 20px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.16)}
.dqa-primary .dqa-icon{background:rgba(255,255,255,.15)}
/* اللمعة: مسحةٌ واحدة عند المرور، وتعود مخفيّةً بلا حركة عند الخروج */
.dqa-primary::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.18) 50%,transparent 65%);
  transform:translateX(110%);opacity:0}
.dqa-primary:hover::after{transform:translateX(-110%);opacity:1;transition:transform .8s ease,opacity .2s ease}
.dqa-secondary{color:var(--ink);background:var(--ivory);border:1px solid var(--accent);
  box-shadow:0 2px 8px rgba(0,0,0,.06)}
.dqa-secondary:hover{border-color:var(--accent-dark);box-shadow:0 6px 16px rgba(0,0,0,.1)}
.dqa-secondary .dqa-icon{background:rgba(200,162,75,.14)}
@media (prefers-reduced-motion:reduce){
  .dqa,.dqa:hover,.dqa:active{transform:none;transition:box-shadow .01s,border-color .01s}
  .dqa-primary::after{display:none}
}
`;

export { Dashboard };
