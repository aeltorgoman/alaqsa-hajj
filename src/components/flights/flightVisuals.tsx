// ═══════════════════════════════════════════════════════════
// هويّة الرحلة المرئيّة — شركة الطيران ومسار الرحلة
// ═══════════════════════════════════════════════════════════
import { useState } from "react";
import { airlineBrand } from "./flightAirlines";
import qatarLogo from "../../assets/airlines/qatar-airways.svg";
import saudiaLogo from "../../assets/airlines/saudia.svg";

const LOGOS: Record<"qatar" | "saudia", string> = { qatar: qatarLogo, saudia: saudiaLogo };

/* أيقونة الطائرة العامّة — ما كانت عليه البطاقة قبل الشعارات */
export const PlaneGlyph = ({ size = 16 }: { size?: number }) => (
  <span aria-hidden style={{ fontSize: size, lineHeight: 1, display: "block" }}>✈</span>
);

/* شعار الشركة من ملفٍّ محليّ — وإن تعذّر تحميله عادت الطائرة العامّة */
export function AirlineMark({ airline, size = 26 }: { airline: string | null | undefined; size?: number }) {
  const brand = airlineBrand(airline);
  const [failed, setFailed] = useState<string | null>(null);
  const src = brand ? LOGOS[brand] : null;
  if (!src || failed === src) return <span data-airline-mark="generic" style={{ display: "contents" }}><PlaneGlyph size={size} /></span>;
  return (
    <img src={src} alt={airline || ""} data-airline-mark={brand}
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
      onError={() => setFailed(src)} />
  );
}

/* ═══ الطائرة على خطّ المسار ═══
   المغادرة يميناً والوصول يساراً (اتّجاه القراءة العربيّة)، فالطائرة
   تتقدّم يساراً نحو مطار الوصول وأنفُها إليه. الصورة طائرةٌ أنفُها إلى
   الأعلى، تُدار ‎-90°‎ فيصير أنفها إلى اليسار. والاتّجاه هندسيٌّ ثابت لا
   يتبع `dir` الصفحة ولا كلمة «ذهاب/إياب»: المسار يُرسم دائماً من مطار
   المغادرة إلى مطار الوصول كما يُعرضان. */
export const ROUTE_CSS = `
  .fl-route-line { position: relative; width: 100%; height: 2px; border-radius: 99px;
    background: linear-gradient(90deg, var(--accent), var(--line)); }
  .fl-route-arrow { position: absolute; left: -1px; top: 50%; width: 0; height: 0; transform: translateY(-50%);
    border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-right: 6px solid var(--accent); }
  .fl-route-plane { position: absolute; top: 50%; left: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px;
    color: var(--primary); will-change: transform, opacity; }
  .fl-route-plane svg { display: block; transform: rotate(-90deg); }
  .fl-route-plane.plane-float { animation: flPlaneFly 4.5s ease-in-out infinite; }
  .fl-route-plane.plane-pulse { animation: flPlaneFlyPulse 2.6s ease-in-out infinite; }
  @keyframes flPlaneFly {
    0%   { transform: translateX(14px);  opacity: 0; }
    15%  { opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translateX(-14px); opacity: 0; }
  }
  @keyframes flPlaneFlyPulse {
    0%   { transform: translateX(14px) scale(1);    opacity: 0; }
    15%  { opacity: 1; }
    50%  { transform: translateX(0) scale(1.15); }
    80%  { opacity: 1; }
    100% { transform: translateX(-14px) scale(1);   opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .fl-route-plane.plane-float, .fl-route-plane.plane-pulse { animation: none; opacity: 1; transform: none; }
  }
`;

export function RoutePlane({ urgent }: { urgent: boolean }) {
  return (
    <div className="fl-route-line" aria-hidden>
      <span className="fl-route-arrow" />
      <div className={`fl-route-plane ${urgent ? "plane-pulse" : "plane-float"}`} data-route-plane>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      </div>
    </div>
  );
}
