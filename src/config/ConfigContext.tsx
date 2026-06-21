import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AppConfig } from "./AppConfig";
import { DEFAULT_CONFIG } from "./AppConfig";
import { ThemeProvider } from "./ThemeContext";
import { supabase } from "../supabase";

const ConfigContext = createContext<AppConfig>(DEFAULT_CONFIG);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("company_config")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (data && !error) {
          setConfig({ ...DEFAULT_CONFIG, ...data });
        }
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", fontFamily: "'Tajawal', sans-serif",
        background: "linear-gradient(150deg, #5C1830 0%, #7D1F3C 55%, #5C1830 100%)",
        position: "relative", overflow: "hidden",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;600&family=Tajawal:wght@400;500&display=swap" rel="stylesheet" />
        {/* نقشة النجمة الثمانية الخافتة في الخلفية */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.07, pointerEvents: "none",
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cpath d='M52,30 L38.3,33.4 L45.6,45.6 L33.4,38.3 L30,52 L26.6,38.3 L14.4,45.6 L21.7,33.4 L8,30 L21.7,26.6 L14.4,14.4 L26.6,21.7 L30,8 L33.4,21.7 L45.6,14.4 L38.3,26.6 Z' fill='none' stroke='%23e7cd8a' stroke-width='1.1'/%3E%3C/svg%3E\")",
        }} />
        <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
          <svg width="64" height="64" viewBox="0 0 44 44" fill="none" stroke="#e7cd8a" strokeWidth="1.4" style={{ margin: "0 auto 18px", display: "block", animation: "aqsa-spin 3.2s linear infinite" }}>
            <path d="M22 3 L26.5 8.5 L33.5 8 L33 15 L38.5 19.5 L33 24 L33.5 31 L26.5 30.5 L22 36 L17.5 30.5 L10.5 31 L11 24 L5.5 19.5 L11 15 L10.5 8 L17.5 8.5 Z" />
            <circle cx="22" cy="19.5" r="4.5" fill="#e7cd8a" stroke="none" />
          </svg>
          <div style={{ fontFamily: "'Reem Kufi', serif", fontWeight: 600, fontSize: 22, color: "#fffdf8", marginBottom: 6, letterSpacing: "0.5px" }}>
            حملة الأقصى
          </div>
          <div style={{ fontSize: 12, color: "rgba(231,205,138,0.85)", letterSpacing: "1px", marginBottom: 22 }}>
            نظام إدارة الحج
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c8a24b", animation: "aqsa-pulse 1.2s ease-in-out infinite" }} />
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c8a24b", animation: "aqsa-pulse 1.2s ease-in-out 0.2s infinite" }} />
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#c8a24b", animation: "aqsa-pulse 1.2s ease-in-out 0.4s infinite" }} />
          </div>
        </div>
        <style>{`
          @keyframes aqsa-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes aqsa-pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.15); } }
        `}</style>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={config}>
      <ThemeProvider config={config}>
        {children}
      </ThemeProvider>
    </ConfigContext.Provider>
  );
}

export function useConfig(): AppConfig {
  return useContext(ConfigContext);
}
