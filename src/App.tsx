import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { NAV } from "./utils";
import type { Passenger, User } from "./types";
import { mapPassenger, upsertPassenger } from "./utils/passenger";
import type { PassengerRow } from "./utils/passenger";
import { Sidebar } from "./components/Sidebar";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./components/Dashboard";
import { DashboardBanner } from "./components/DashboardBanner";
import { TopBar } from "./components/TopBar";
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
import { PortalPage } from "./components/PortalPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingSpinner } from "./components/LoadingSpinner";

// الصلاحية المطلوبة لكل صفحة، مشتقّة من NAV نفسه الذي يبني الـ Sidebar
// فلا تنفصل عنه إذا أُضيفت صفحة أو تغيّرت صلاحيتها
const PAGE_PERM: Record<string, string> = Object.fromEntries(
  NAV.flatMap(s => s.items).filter(it => it.perm).map(it => [it.id, it.perm])
);

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try { const s = sessionStorage.getItem("hajj_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [page, setPage] = useState(() => sessionStorage.getItem("hajj_page") || "dash");
  const [reportsResetKey, setReportsResetKey] = useState(0);

  useEffect(() => {
    const handler = () => setPage("dash");
    window.addEventListener("hajj_return_dash", handler);
    return () => window.removeEventListener("hajj_return_dash", handler);
  }, []);

  useEffect(() => { sessionStorage.setItem("hajj_page", page); }, [page]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [passengersLoading, setPassengersLoading] = useState(true);
  const [passengersError, setPassengersError] = useState(false);
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


  useEffect(() => {
    const loadPassengers = async () => {
      const { data, error } = await supabase.from("passengers").select("*").order("sort_order", { ascending: true }).order("id", { ascending: true });
      /* الفشل يُبلَّغ عنه بدل عرض قائمة فارغة تبدو كـ«لا يوجد حجاج» */
      if (error || !data) {
        setPassengersError(true);
      } else {
        setPassengers(data.map(mapPassenger));
        setPassengersError(false);
      }
      setPassengersLoading(false);
    };
    loadPassengers();
    const channel = supabase.channel("passengers-realtime")
      .on<PassengerRow>("postgres_changes", { event: "*", schema: "public", table: "passengers" }, payload => {
        if (payload.eventType === "INSERT") {
          const added = mapPassenger(payload.new);
          setPassengers(prev => upsertPassenger(prev, added));
        } else if (payload.eventType === "UPDATE") {
          const updated = mapPassenger(payload.new);
          setPassengers(prev => prev.map(p => p.id === updated.id ? updated : p));
        } else if (payload.eventType === "DELETE") {
          const removedId = payload.old.id;
          setPassengers(prev => prev.filter(p => p.id !== removedId));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!currentUser) return <LoginPage onLogin={handleLogin} />;

  const FULL_PAGES = ["dash", "passengers", "manual", "buses", "flights", "mina", "arafa", "hotel", "finance", "admins", "users"];
  const isFull = FULL_PAGES.includes(page);

  const renderPage = () => {
    const requiredPerm = PAGE_PERM[page];
    if (requiredPerm && !currentUser.permissions?.[requiredPerm]) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 15, fontWeight: 700, color: "var(--danger)" }}>
          لا تملك صلاحية الوصول لهذه الصفحة
        </div>
      );
    }
    switch (page) {
      case "dash":       return <Dashboard passengers={passengers} setPage={setPage} currentUser={currentUser!} onAddManual={() => { setGlobalShowManual(true); (window as any).__hajj_scan_return_dash__ = true; setPage("passengers"); }} onScan={(file) => { (window as any).__hajj_pending_scan_file__ = file; (window as any).__hajj_scan_return_dash__ = true; setPage("passengers"); }} />;
      case "passengers": return <PassengersPage passengers={passengers} setPassengers={setPassengers} currentUser={currentUser!} globalShowManual={globalShowManual} onGlobalManualClose={() => setGlobalShowManual(false)} />;
      case "buses":      return <BusesPage passengers={passengers} setPassengers={setPassengers} />;
      case "flights":    return <FlightsPage passengers={passengers} setPassengers={setPassengers} />;
      case "mina":       return <CampsPage pageType="منى" passengers={passengers} setPassengers={setPassengers} />;
      case "arafa":      return <CampsPage pageType="عرفة" passengers={passengers} setPassengers={setPassengers} />;
      case "hotel":      return <HotelPage passengers={passengers} setPassengers={setPassengers} />;
      case "reports":    return <ReportsPage passengers={passengers} resetKey={reportsResetKey} />;
      case "archive":    return <ArchivePage currentUser={currentUser} />;
      case "users":      return <UsersPage currentUser={currentUser} />;
      case "finance":    return <FinancePage passengers={passengers} setPassengers={setPassengers} currentUser={currentUser!} />;
      case "admins":     return <AdminsPage passengers={passengers} setPassengers={setPassengers} />;
      case "portal":     return <PortalPage currentUser={currentUser!} />;
      default:           return <Dashboard passengers={passengers} setPage={setPage} currentUser={currentUser!} />;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", direction: "rtl", fontFamily: "var(--font-body)", background: "var(--ivory)" }}>

      {/* البانر — كامل العرض فوق الكل، يظهر فقط في الداشبورد */}
      {page === "dash" && (
        <DashboardBanner setPage={setPage} currentUser={currentUser!} onLogout={handleLogout} />
      )}

      {/* الجسم — السايدبار + المحتوى */}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start" }}>
        {/* السايدبار ثابت */}
        <div style={{ position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>
          <Sidebar
            page={page} setPage={setPage}
            count={passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج").length}
            currentUser={currentUser} onLogout={handleLogout}
            onReportsClick={() => setReportsResetKey(k => k + 1)}
          />
        </div>

        {/* المحتوى — يتمرر بشكل طبيعي */}
        <div style={{ flex: 1, minWidth: 0, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          {page !== "dash" && (
            <TopBar page={page} setPage={setPage} currentUser={currentUser!} onLogout={handleLogout} />
          )}
          {isFull ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <ErrorBoundary>
                {passengersLoading ? <LoadingSpinner /> : passengersError ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6, padding: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger)" }}>تعذر تحميل بيانات الحجاج</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>يرجى التحقق من الاتصال وتحديث الصفحة</div>
                </div>
                ) : renderPage()}
              </ErrorBoundary>
            </div>
          ) : (
            <div style={{ background: "var(--ivory)", padding: "20px" }}>
              <div style={{ maxWidth: page === "scan" ? 620 : 900, margin: "0 auto" }}>
                <ErrorBoundary>
                  {passengersLoading ? <LoadingSpinner /> : passengersError ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 6, padding: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger)" }}>تعذر تحميل بيانات الحجاج</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>يرجى التحقق من الاتصال وتحديث الصفحة</div>
                </div>
                ) : renderPage()}
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
