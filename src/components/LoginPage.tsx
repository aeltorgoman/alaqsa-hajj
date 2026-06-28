import { useState } from "react";
import { supabase } from "../supabase";
import { useConfig } from "../config/ConfigContext";
import type { User } from "../types";

function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const config = useConfig();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) return;
    setLoading(true); setError("");
    const { data: userData } = await supabase.rpc("verify_user", { p_username: username, p_password: password });
    const data = userData?.[0] ?? null;
    if (data) { onLogin(data as User); }
    else setError("اسم المستخدم أو كلمة المرور غلط");
    setLoading(false);
  };

  /* ── styles مستقلة عن CSS classes ── */
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    fontSize: 14,
    fontFamily: "var(--font-body)",
    color: "var(--ink)",
    background: "var(--bg-2, #f7f2e7)",
    border: `1.5px solid ${error ? "var(--danger)" : "var(--border)"}`,
    borderRadius: "var(--radius-md, 10px)",
    outline: "none",
    direction: "rtl",
    transition: "border .15s",
    boxSizing: "border-box" as const,
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#5C1830",  /* خلفية ثابتة — جزء من هوية الحملة */
      direction: "rtl", fontFamily: "var(--font-body)",
      position: "relative", overflow: "hidden",
    }}>
      <div className="sidebar-pattern" style={{ opacity: 0.1 }} />
      <div style={{
        position: "relative", zIndex: 2,
        width: "100%", maxWidth: 380,
        background: "var(--bg-card)",
        borderRadius: "var(--radius-xl)",
        padding: 6,
        boxShadow: "var(--shadow-xl)",
        border: "1px solid var(--accent-dark)",
      }}>
        <div style={{ border: "1px solid var(--accent-light)", borderRadius: "calc(var(--radius-xl) - 4px)", padding: "38px 30px" }}>

          {/* شعار + اسم */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
            {config.logo_url ? (
              <img src={config.logo_url} alt={config.name_ar} style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", marginBottom: 8, border: "2px solid var(--accent-light)" }} />
            ) : (
              <svg width="96" height="118" viewBox="0 0 96 118" style={{ marginBottom: 8 }}>
                <path d="M8 116 V52 C8 26 28 6 48 6 C68 6 88 26 88 52 V116" fill="none" stroke="var(--accent)" strokeWidth="2.5"/>
                <path d="M15 116 V52 C15 30 31 13 48 13 C65 13 81 30 81 52 V116" fill="none" stroke="var(--accent-light)" strokeWidth="1"/>
                <g transform="translate(48,58) scale(1.05)">
                  <path d="M22,0 L8.3,3.4 L15.6,15.6 L3.4,8.3 L0,22 L-3.4,8.3 L-15.6,15.6 L-8.3,3.4 L-22,0 L-8.3,-3.4 L-15.6,-15.6 L-3.4,-8.3 L0,-22 L3.4,-8.3 L15.6,-15.6 L8.3,-3.4 Z" fill="none" stroke="var(--primary-dark)" strokeWidth="2"/>
                  <circle r="4.5" fill="var(--accent)"/>
                </g>
              </svg>
            )}
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 30, color: "var(--primary-dark)", letterSpacing: "0.5px" }}>
              {config.name_ar}
            </div>
            <div style={{ fontSize: 12, color: "var(--accent-dark)", letterSpacing: "2px", marginTop: 2 }}>
              {config.tagline}
            </div>
          </div>

          {/* فاصل */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 20px" }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent,var(--accent),transparent)" }} />
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent)" strokeWidth="1.4"><path d="M12 2l2.4 7.6H22l-6.2 4.7 2.4 7.7L12 17l-6.2 5 2.4-7.7L2 9.6h7.6z"/></svg>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent,var(--accent),transparent)" }} />
          </div>

          {/* اسم المستخدم */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--primary)", marginBottom: 6, fontWeight: 600 }}>
              اسم المستخدم
            </label>
            <input
              style={inputStyle}
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="أدخل اسم المستخدم"
              autoComplete="off"
              autoFocus
            />
          </div>

          {/* كلمة المرور */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--primary)", marginBottom: 6, fontWeight: 600 }}>
              كلمة المرور
            </label>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...inputStyle, paddingLeft: 40 }}
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                onClick={() => setShowPass(!showPass)}
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0, display: "flex" }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
                  {showPass
                    ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                    : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>
                  }
                </svg>
              </button>
            </div>
          </div>

          {/* رسالة الخطأ */}
          {error && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--danger)", textAlign: "center", background: "var(--danger-bg)", padding: "8px 12px", borderRadius: "var(--radius-md)" }}>
              {error}
            </div>
          )}

          {/* زر الدخول */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-gold"
            style={{ width: "100%", marginTop: 24, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "جاري التحقق..." : "دخول"}
          </button>

          <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "var(--text-muted)" }}>
            {config.name_ar} · دولة قطر
          </div>
        </div>
      </div>
    </div>
  );
}

export { LoginPage };
