import { useConfig } from "../config/ConfigContext";
import type { Passenger, User } from "../types";

function DashboardBanner({ passengers, setPage, currentUser }: { passengers: Passenger[]; setPage: (p: string) => void; currentUser: User }) {
  const config = useConfig();
  const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
  const males   = hajj.filter(p => p.gender === "ذكر").length;
  const females  = hajj.filter(p => p.gender === "أنثى").length;
  const total   = hajj.length || 1;
  const primary = config.color_primary || "#7D1F3C";

  const statCards = [
    { label: "الحجاج", num: hajj.length, sub: "+" + (Math.min(12,hajj.length)) + " هذا الأسبوع", bg: "linear-gradient(145deg," + (primary) + "dd," + (primary) + ")", shadow: (primary) + "55", icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
    { label: "رجال",   num: males,       sub: (Math.round(males/total*100)) + "٪ من الإجمالي", bg: "linear-gradient(145deg,#13456b,#2F78C5)", shadow: "rgba(19,69,107,0.45)", icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
    { label: "نساء",   num: females,     sub: (Math.round(females/total*100)) + "٪ من الإجمالي", bg: "linear-gradient(145deg,#C8730A,#E8951A)", shadow: "rgba(200,115,10,0.45)", icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
  ];

  return (
    <div style={{ position:"relative", flexShrink:0, height:240 }}>
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(110deg," + (primary) + "f0 0%," + (primary) + " 50%," + (primary) + "cc 100%)", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, pointerEvents:"none", backgroundImage:'url("data:image/svg+xml,%3Csvg width=%2280%22 height=%2280%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 stroke=%22%23D4A017%22 stroke-opacity=%220.06%22%3E%3Cpath d=%22M40 5l8 27h28l-22 17 8 27-22-17-22 17 8-27L12 32h28z%22/%3E%3C/g%3E%3C/svg%3E")' }} />
        <div style={{ position:"absolute", inset:0, overflow:"hidden" }}>
          {config.banner_image_url
            ? <img src={config.banner_image_url} alt="banner" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:((config as any).banner_position || "center") }} />
            : null}
          <div style={{ position:"absolute", inset:0, background:["linear-gradient(to right, rgba(0,0,0,0.05) 0%","transparent 25%","transparent 50%",primary+"aa 100%)"].join(", ") }} />
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.15) 0%, transparent 40%)" }} />
        </div>
        <div style={{ position:"absolute", right:0, top:0, bottom:0, width:"40%", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px 24px 40px", zIndex:4, gap:14 }}>
          <div style={{ width:86, height:86, borderRadius:"50%", flexShrink:0, overflow:"hidden", border:"3px solid rgba(212,160,23,0.75)", boxShadow:"0 6px 24px rgba(0,0,0,0.45)" }}>
            {config.logo_url
              ? <img src={config.logo_url} alt="logo" style={{ width:"100%", height:"100%", objectFit:"contain", background:"rgba(255,255,255,0.05)" }} />
              : <div style={{ width:"100%", height:"100%", background:"rgba(255,255,255,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ fontSize:26, fontWeight:900, color:"#D4A017" }}>{(config.name_ar||"ح").charAt(0)}</span></div>}
          </div>
          <div>
            <div style={{ fontSize:10, color:"rgba(212,160,23,0.9)", fontWeight:700, letterSpacing:"0.1em", marginBottom:4 }}>نظام إدارة الحج</div>
            <div style={{ fontSize:22, fontWeight:900, color:"#fff", lineHeight:1, marginBottom:5, textShadow:"0 2px 8px rgba(0,0,0,0.5)" }}>{config.name_ar||"حملة الأقصى"}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", lineHeight:1.5 }}>{config.tagline||"نظام إدارة الحج"}</div>
          </div>
        </div>
        <div style={{ position:"absolute", top:12, left:14, display:"flex", alignItems:"center", gap:8, zIndex:5 }}>
          <div style={{ width:30, height:30, borderRadius:9, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <div onClick={() => setPage("users")} style={{ width:30, height:30, borderRadius:9, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:99, padding:"3px 10px 3px 3px", cursor:"pointer" }}>
            <div style={{ width:22, height:22, borderRadius:"50%", background:"linear-gradient(135deg,#D4A017,#C8932A)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:800, color:"#fff" }}>
              {currentUser.name.trim().split(" ").map((w: string) => w[0]).slice(0,2).join("")}
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:"#fff" }}>{currentUser.name.split(" ")[0]}</span>
          </div>
        </div>
      </div>
      {/* كروت الإحصاء متداخلة أسفل البانر */}
      <div style={{ position:"absolute", bottom:-30, left:0, right:0, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, padding:"0 12px", zIndex:10, maxWidth:680, margin:"0 auto" }}>
        {statCards.map(({ label, num, sub, bg, shadow, icon }) => (
          <div key={label} style={{ borderRadius:14, padding:"10px 14px", color:"#fff", background:bg, boxShadow:"0 6px 24px " + (shadow), border:"1.5px solid rgba(255,255,255,0.12)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
              <div style={{ fontSize:11, fontWeight:600, opacity:0.85 }}>{label}</div>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
            </div>
            <div style={{ fontSize:26, fontWeight:900, lineHeight:1, marginBottom:3 }}>{num}</div>
            <div style={{ fontSize:10, opacity:0.6 }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { DashboardBanner };
