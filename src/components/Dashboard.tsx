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

  return (
    <div style={{ display: "flex", flex: 1 }}>

      {/* ══ العمود الأوسط ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: 14, gap: 12, minWidth: 0 }}>

        {/* 1) أزرار الإجراءات */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flexShrink: 0 }}>

          {/* مسح مستند — أساسي: تدرّج لون الثيم مع لمعةٍ عند المرور فقط */}
          <span className="dqa-slot">
            <button type="button" className="dqa dqa-primary" onClick={() => scanInputRef.current?.click()}>
              <span className="dqa-icon">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                  <line x1="7" y1="12" x2="17" y2="12"/>
                </svg>
                <span className="dqa-beam" aria-hidden="true" />
              </span>
              <span className="dqa-text">
                <span className="dqa-title">مسح مستند</span>
                <span className="dqa-sub" style={{ opacity: .75 }}>جواز / بطاقة / تصريح حج</span>
              </span>
            </button>
          </span>
          {/* نفس مدخل صفحة الحجاج: يقبل PDF فعلياً، والعرض يلحق بالواقع */}
          <input ref={scanInputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (onScan) { onScan(file); } else { (window as any).__hajj_pending_scan_file__ = file; setPage("passengers"); }
            e.target.value = "";
          }} />

          {/* إضافة يدوي — ثانوي: عاجيّ بإطارٍ ذهبي، بلا لمعة */}
          <span className="dqa-slot">
            <button type="button" className="dqa dqa-secondary" onClick={() => { onAddManual ? onAddManual() : navTo("passengers"); }}>
              <span className="dqa-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <g className="dqa-doc"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></g>
                  <g className="dqa-plus"><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></g>
                </svg>
              </span>
              <span className="dqa-text">
                <span className="dqa-title">إضافة يدوي</span>
                <span className="dqa-sub" style={{ opacity: .7 }}>إدخال بيانات الحاج يدوياً</span>
              </span>
            </button>
          </span>
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

/* أزرار الإجراءات السريعة — Scanner Motion V2
   الحالةُ «النشطة» واحدةٌ بثلاثة مداخل: المرورُ بالفأرة (لأجهزة المرور والمؤشّر
   الدقيق وحدها — فلا تعلق على اللمس)، والتركيزُ بالكيبورد، والضغطُ باللمس.
   المرورُ على غلافٍ ثابت (.dqa-slot) لا يتحرّك مع الزرّ، فلا ارتعاشَ عند الحافّة.
   الحركاتُ متوقّفةٌ وغيرُ مرئية خارج الحالة النشطة، وتظهر وتختفي بتلاشٍ ناعم؛
   وكلُّها محصورةٌ داخل الزرّ وإطار الأيقونة. */
const on = (cls: string, tail: string, body: string) =>
  `@media (hover:hover) and (pointer:fine){.dqa-slot:hover ${cls}${tail}{${body}}}\n${cls}:focus-visible${tail},${cls}:active${tail}{${body}}\n`;
const QUICK_ACTION_CSS = `
.dqa-slot{display:flex;min-width:0}
.dqa{--lift:0px;position:relative;overflow:hidden;isolation:isolate;display:flex;align-items:center;gap:11px;width:100%;padding:13px 16px;border-radius:12px;cursor:pointer;font-family:inherit;text-align:start;
  transform:translateY(var(--lift));transition:transform .25s cubic-bezier(.2,.7,.3,1),box-shadow .3s ease,border-color .3s ease}
.dqa > *{position:relative;z-index:1}
.dqa:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
${on(".dqa", "", "--lift:-2px")}
.dqa:active{--lift:0px;transform:scale(.985);transition-duration:.12s}
.dqa-icon{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;transition:background-color .3s ease,box-shadow .3s ease}
.dqa-text{display:flex;flex-direction:column;min-width:0}
.dqa-title{font-size:13.5px;font-weight:700;line-height:1.2}
.dqa-sub{font-size:10.5px;margin-top:2px}

/* ── مسح مستند: تدرّجٌ بورديّ متحرّك + موجةُ ضوء + شعاعُ مسحٍ في الأيقونة ── */
.dqa-primary{border:1px solid rgba(255,255,255,.08);color:var(--text-inverse);
  background:linear-gradient(135deg,var(--primary-light) 0%,var(--primary) 55%,var(--primary-dark) 100%);
  box-shadow:0 4px 12px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.12)}
.dqa-primary::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;
  /* بلاطةٌ تبدأ وتنتهي باللون نفسه، وتتحرّك بعرضها تماماً: تدفّقٌ بلا حوافّ */
  background:linear-gradient(90deg,var(--primary-dark) 0%,var(--primary) 25%,var(--primary-light) 50%,var(--primary) 75%,var(--primary-dark) 100%) 0 0/200% 100% repeat-x;
  opacity:0;transition:opacity .5s ease;animation:dqa-flow 4s linear infinite paused}
.dqa-primary::after{content:"";position:absolute;inset:-1px;z-index:2;pointer-events:none;
  background:linear-gradient(100deg,transparent 28%,rgba(255,236,190,.12) 40%,rgba(255,255,255,.36) 50%,rgba(255,236,190,.12) 60%,transparent 72%);
  transform:translateX(115%);opacity:0;transition:opacity .45s ease;animation:dqa-wave 2.6s cubic-bezier(.45,.05,.35,1) infinite paused}
.dqa-primary .dqa-icon{background:rgba(255,255,255,.15)}
.dqa-primary .dqa-icon svg{transition:transform .35s ease,filter .35s ease}
/* الشعاع: ستارةُ ضوءٍ ذهبيّ يقودها خطٌّ ساطع، تمسح إطارَ الأيقونة ذهاباً وإياباً */
.dqa-beam{position:absolute;left:3px;right:3px;top:-10px;height:14px;z-index:2;pointer-events:none;
  background:linear-gradient(to bottom,rgba(231,205,138,0) 0%,rgba(231,205,138,.30) 70%,rgba(255,244,214,.95) 86%,#fff 90%,rgba(255,244,214,0) 100%);
  filter:drop-shadow(0 0 4px rgba(255,230,170,.9));
  opacity:0;transition:opacity .35s ease;animation:dqa-beam 1.4s ease-in-out infinite alternate paused}
${on(".dqa-primary", "", "box-shadow:0 8px 22px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.18)")}
${on(".dqa-primary", "::before", "opacity:1;animation-play-state:running")}
${on(".dqa-primary", "::after", "opacity:1;animation-play-state:running")}
${on(".dqa-primary", " .dqa-beam", "opacity:1;animation-play-state:running")}
${on(".dqa-primary", " .dqa-icon", "background:rgba(255,255,255,.22);box-shadow:inset 0 0 0 1px rgba(231,205,138,.45)")}
${on(".dqa-primary", " .dqa-icon svg", "transform:scale(1.06);filter:drop-shadow(0 0 3px rgba(231,205,138,.7))")}
@keyframes dqa-flow{from{background-position:0 0}to{background-position:200% 0}}
@keyframes dqa-wave{0%{transform:translateX(115%)}70%,100%{transform:translateX(-115%)}}
@keyframes dqa-beam{from{transform:translateY(0)}to{transform:translateY(38px)}}

/* ── إضافة يدوي: عاجيّ بإطارٍ ذهبي، والمستندُ والزائد يتحرّكان مرّةً — بلا وهجٍ ولا حركةٍ مستمرّة ── */
.dqa-secondary{color:var(--ink);background:var(--ivory);border:1px solid var(--accent);box-shadow:0 2px 8px rgba(0,0,0,.06)}
.dqa-secondary .dqa-icon{background:rgba(200,162,75,.14)}
.dqa-doc,.dqa-plus{transform-box:fill-box;transform-origin:center;transition:transform .5s cubic-bezier(.34,1.56,.64,1)}
${on(".dqa-secondary", "", "border-color:var(--accent-dark);box-shadow:0 6px 16px rgba(0,0,0,.1)")}
${on(".dqa-secondary", " .dqa-icon", "background:rgba(200,162,75,.24)")}
${on(".dqa-secondary", " .dqa-doc", "transform:translateY(-1.5px) rotate(-7deg)")}
${on(".dqa-secondary", " .dqa-plus", "transform:rotate(90deg) scale(1.2)")}

/* تقليلُ الحركة: لا حركةَ إطلاقاً — تبقى إشاراتُ الحالة الثابتة (اللون والإطار والظلّ) */
@media (prefers-reduced-motion:reduce){
  .dqa,.dqa:active{transform:none;transition:box-shadow .01s,border-color .01s}
  .dqa *,.dqa::before,.dqa::after{animation:none !important;transition:none !important}
  .dqa-primary::after,.dqa-beam{display:none}
  .dqa .dqa-icon svg,.dqa .dqa-doc,.dqa .dqa-plus{transform:none !important;filter:none !important}
}
`;

export { Dashboard };
