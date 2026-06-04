import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "../supabase";
import { AppConfig, DEFAULT_CONFIG } from "./AppConfig";

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
      .then(({ data, error }) => {
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
        height: "100vh", fontSize: 13, color: "#aaa", fontFamily: "system-ui"
      }}>
        ⏳ جاري تحميل إعدادات النظام...
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): AppConfig {
