import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import type { Passenger, User } from "./types";
import { Sidebar } from "./components/Sidebar";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./components/Dashboard";
import { DashboardBanner } from "./components/DashboardBanner";
import { PassengersPage } from "./components/PassengersPage";
import { BusesPage } from "./components/BusesPage";
import { FlightsPage } from "./components/FlightsPage";
import { CampsPage } from "./components/CampsPage";
import { HotelPage } from "./components/HotelPage";
import { ReportsPage } from "./components/ReportsPage";
import { ArchivePage } from "./components/ArchivePage";
import { UsersPage } from "./components/UsersPage";
import { FinancePage } from "./components/FinancePage";
import { AdminsPage } from "./components/AdminsPage";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try { const s = sessionStorage.getItem("hajj_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [page, setPage] = useState(() => sessionStorage.getItem("hajj_page") || "dash");
  const [reportsResetKey, setReportsResetKey] = useState(0);

  useEffect(() => { sessionStorage.setItem("hajj_page", page); }, [page]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [globalShowManual, setGlobalShowManual] = useState(false);

  const handleLogin = (user: User) => {
    const { password: _, ...userWithoutPassword } = user;
    sessionStorage.setItem("hajj_user", JSON.stringify(userWithoutPassword));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("hajj_user");
    sessionStorage.removeItem("hajj_page");
    setCurrentUser(null);
    setPage("dash");
  };

  const mapPassenger = (p: Record<string, unknown>) => ({
    id: p.id, name_ar: p.name_ar || "", name_en: p.name_en || "",
    short_ar: p.short_ar || "", short_en: p.short_en || "",
    passport: p.passport || "", national_id: p.national_id || "",
    nat: p.nat || "", dob: p.dob || "", expiry: p.expiry || "",
    gender: p.gender || "", phone: p.phone || "",
    services: { bus: p.bus || "عادي", flight: p.flight || "عادي", hotel_type: p.hotel_type || "ثنائية", hotel_view: p.hotel_view || "مطلة", camp_mina: p.camp_mina || "عادي", camp_arafa: p.camp_arafa || "عادي" },
    rel: "", linked: -1,
    photo_url: p.photo_url || "", id_expiry: p.id_expiry || "",
    national_id_url: p.national_id_url || "", contract_url: p.contract_url || "",
    passport_url: p.passport_url || "",
    bus_id: p.bus_id || null, camp_mina_id: p.camp_mina_id || null,
    camp_arafa_id: p.camp_arafa_id || null, room_id: p.room_id || null,
    family_id: p.family_id || null,
    flight_id: p.flight_id || null, flight_class: p.flight_class || null,
    return_flight_id: p.return_flight_id || null,
    sort_order: p.sort_order || 0,
    passenger_type: p.passenger_type || "حاج",
  });

  useEffect(() => {
    const loadPassengers = async () => {
      const { data, error } = await supabase.from("passengers").select("*").order("sort_order", { ascending: true }).order("id", { ascending: true });
      if (!error && data) setPassengers(data.map(mapPassenger) as any);
    };
    loadPassengers();
    const channel = supabase.channel("passengers-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "passengers" }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          setPassengers(prev => {
            if ((prev as any[]).some((p: any) => p.id === payload.new.id)) return prev;
            return [mapPassenger(payload.new), ...(prev as any[])];
          });
        } else if (payload.eventType === "UPDATE") {
          setPassengers(prev => (prev as any[]).map((p: any) => p.id === payload.new.id ? mapPassenger(payload.new) : p) as any);
        } else if (payload.eventType === "DELETE") {
          setPassengers(prev => (prev as any[]).filter((p: any) => p.id !== payload.old.id) as any);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!currentUser) return <LoginPage onLogin={handleLogin} />;

  const pageTitles: Record<string, string> = { dash: "الرئيسية", passengers: "الحجاج", buses: "الباصات", flights: "الطيران", mina: "مخيمات منى", arafa: "مخيمات عرفة", hotel: "الفندق", reports: "التقارير", archive: "الأرشيف", users: "المستخدمين", finance: "الحسابات المالية" };
  const FULL_PAGES = ["dash", "passengers", "manual", "buses", "flights", "mina", "arafa", "hotel", "finance", "admins"];
  const isFull = FULL_PAGES.includes(page);

  const renderPage = () => {
    switch (page) {
      case "dash":       return <Dashboard passengers={passengers} setPage={setPage} onAddManual={() => setGlobalShowManual(true)} />;
      case "passengers": return <PassengersPage passengers={passengers} setPassengers={setPassengers} currentUser={currentUser!} globalShowManual={globalShowManual} onGlobalManualClose={() => setGlobalShowManual(false)} />;
      case "buses":      return <BusesPage passengers={passengers} setPassengers={setPassengers} />;
      case "flights":    return <FlightsPage passengers={passengers} setPassengers={setPassengers} />;
      case "mina":       return <CampsPage pageType="منى" passengers={passengers} setPassengers={setPassengers} />;
      case "arafa":      return <CampsPage pageType="عرفة" passengers={passengers} setPassengers={setPassengers} />;
      case "hotel":      return <HotelPage passengers={passengers} setPassengers={setPassengers} />;
      case "reports":    return <ReportsPage passengers={passengers} resetKey={reportsResetKey} />;
      case "archive":    return <ArchivePage currentUser={currentUser} />;
      case "users":      return <UsersPage currentUser={currentUser} />;
      case "finance":    return <FinancePage passengers={passengers} currentUser={currentUser!} />;
      case "admins":     return <AdminsPage passengers={passengers} setPassengers={setPassengers} />;
      default:           return <Dashboard passengers={passengers} setPage={setPage} />;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", direction: "rtl", fontFamily: "var(--font-body)", background: "var(--ivory)", overflow: "hidden" }}>

      {/* البانر — كامل العرض فوق الكل، يظهر فقط في الداشبورد */}
      {page === "dash" && (
        <DashboardBanner setPage={setPage} currentUser={currentUser!} />
      )}

      {/* الجسم — السايدبار + المحتوى */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <Sidebar
          page={page} setPage={setPage}
          count={passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج").length}
          currentUser={currentUser} onLogout={handleLogout}
          onReportsClick={() => setReportsResetKey(k => k + 1)}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {isFull ? (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {renderPage()}
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", background: "var(--ivory)" }}>
              <div style={{ maxWidth: page === "scan" ? 620 : 900, margin: "0 auto", padding: page === "reports" ? "12px 20px" : "20px" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, color: "var(--text)", marginBottom: page === "reports" ? 8 : 16 }}>{pageTitles[page]}</div>
                {renderPage()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
