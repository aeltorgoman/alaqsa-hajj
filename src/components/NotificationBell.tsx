import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";

interface Notif {
  id: number;
  type: "add" | "update" | "delete";
  msg: string;
  time: Date;
  read: boolean;
}

const TYPE = {
  add:    { color: "#2A9D8F", bg: "rgba(42,157,143,.12)",  label: "إضافة",  svgPath: `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>` },
  update: { color: "#C8A24B", bg: "rgba(200,162,75,.13)",  label: "تعديل",  svgPath: `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>` },
  delete: { color: "#E76F51", bg: "rgba(231,111,81,.12)",  label: "حذف",    svgPath: `<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>` },
};

function timeAgo(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5)   return "الآن";
  if (s < 60)  return `منذ ${s} ث`;
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`;
  return `منذ ${Math.floor(s / 3600)} س`;
}

function NotificationBell() {
  const [notifs, setNotifs]   = useState<Notif[]>([]);
  const [open,   setOpen]     = useState(false);
  const wrapRef               = useRef<HTMLDivElement>(null);
  const tickRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  /* تحديث الوقت كل دقيقة */
  useEffect(() => {
    tickRef.current = setInterval(() => setNotifs(n => [...n]), 30_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  /* Supabase Realtime */
  useEffect(() => {
    const push = (type: Notif["type"], row: Record<string, unknown>) => {
      const name = (row.name_ar || row.name || "غير معروف") as string;
      const msgs: Record<Notif["type"], string> = {
        add:    `تم إضافة حاج جديد: ${name}`,
        update: `تم تحديث بيانات: ${name}`,
        delete: `تم حذف حاج من القائمة`,
      };
      setNotifs(prev => [
        { id: Date.now(), type, msg: msgs[type], time: new Date(), read: false },
        ...prev,
      ].slice(0, 60));
    };

    const ch = supabase
      .channel("hajj-notif-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "passengers" }, p => push("add",    p.new as Record<string, unknown>))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "passengers" }, p => push("update", p.new as Record<string, unknown>))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "passengers" }, p => push("delete", (p.old || {}) as Record<string, unknown>))
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  /* إغلاق عند الضغط خارجاً */
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const unread = notifs.filter(n => !n.read).length;

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAll = () => setNotifs([]);

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>

      {/* زرار الجرس */}
      <div onClick={handleOpen}
        style={{ width:32, height:32, borderRadius:8, background: open ? "rgba(200,162,75,.25)" : "rgba(0,0,0,.3)", border:"1px solid rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, position:"relative", transition:"background .15s" }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,.15)"; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLDivElement).style.background = "rgba(0,0,0,.3)"; }}>

        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke={unread > 0 ? "#C8A24B" : "rgba(255,255,255,.65)"}
            strokeWidth="1.8" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            {unread > 0 && <circle cx="18" cy="5" r="3" fill="#C8A24B" stroke="#1a0e1a" strokeWidth="1.5"/>}
          </svg>
          {unread > 0 && (
            <span style={{
              position: "absolute", top: -7, left: -7,
              minWidth: 17, height: 17, borderRadius: 99,
              background: "#C8A24B", color: "#fff",
              fontSize: 10, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 4px", lineHeight: 1,
              boxShadow: "0 1px 4px rgba(0,0,0,.35)",
              animation: "bellPop .3s cubic-bezier(.34,1.56,.64,1)",
            }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </div>

        <span style={{ fontSize: 12.5, fontWeight: 500, color: unread > 0 ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.65)", flex: 1 }}>
          الإشعارات
        </span>

        {unread > 0 && (
          <span style={{ fontSize: 10, background: "rgba(200,162,75,.25)", color: "#C8A24B", padding: "1px 7px", borderRadius: 99, fontWeight: 700 }}>
            {unread} جديد
          </span>
        )}
      </div>

      {/* لوحة الإشعارات */}
      {open && (
        <div style={{
          position: "fixed", top: 50, left: 14, zIndex: 9999,
          width: 290, maxHeight: 380,
          background: "var(--bg-sidebar)",
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 14, overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,.45)",
          display: "flex", flexDirection: "column",
        }}>

          {/* الهيدر */}
          <div style={{ display: "flex", alignItems: "center", padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,.08)", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8A24B" strokeWidth="1.8" strokeLinecap="round" style={{ marginLeft: 6 }}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.9)", flex: 1 }}>الإشعارات الحية</span>
            {notifs.length > 0 && (
              <span onClick={e => { e.stopPropagation(); clearAll(); }}
                style={{ fontSize: 10.5, color: "rgba(255,255,255,.4)", cursor: "pointer", padding: "2px 6px", borderRadius: 6 }}
                onMouseEnter={e => (e.currentTarget as HTMLSpanElement).style.color = "rgba(231,111,81,.8)"}
                onMouseLeave={e => (e.currentTarget as HTMLSpanElement).style.color = "rgba(255,255,255,.4)"}>
                مسح الكل
              </span>
            )}
          </div>

          {/* قائمة الإشعارات */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 16px", color: "rgba(255,255,255,.35)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" style={{ marginBottom: 10, opacity: .5 }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>لا توجد إشعارات</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: .6 }}>ستظهر هنا أي تغييرات في البيانات</div>
              </div>
            ) : (
              notifs.map(n => {
                const cfg = TYPE[n.type];
                return (
                  <div key={n.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 14px",
                    borderBottom: "1px solid rgba(255,255,255,.05)",
                    background: n.read ? "transparent" : "rgba(200,162,75,.05)",
                    transition: "background .2s",
                  }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                      background: cfg.bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginTop: 1,
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={cfg.color} strokeWidth="2" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: cfg.svgPath }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.85)", lineHeight: 1.4, marginBottom: 3 }}>
                        {n.msg}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "1px 7px", borderRadius: 99 }}>
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>
                          {timeAgo(n.time)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* فوتر — مؤشر الاتصال المباشر */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2A9D8F", display: "inline-block", boxShadow: "0 0 6px #2A9D8F", animation: "livePulse 2s infinite" }} />
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.35)" }}>متصل مباشرة</span>
          </div>
        </div>
      )}

    </div>
  );
}

export { NotificationBell };
