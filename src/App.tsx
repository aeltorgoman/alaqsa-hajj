import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { NAV } from "./utils";
import type { Passenger, User } from "./types";
import type { Database } from "./types/database";
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

/* صف جدول passengers كما تولّده Supabase — مصدر الحقيقة لشكل البيانات
   القادمة من القاعدة، سواء من الجلب الأولي أو من أحداث Realtime */
type PassengerRow = Database["public"]["Tables"]["passengers"]["Row"];

const PASSENGER_TYPES = ["حاج", "مرافق", "مشرف", "إداري"] as const;
type PassengerType = (typeof PASSENGER_TYPES)[number];

function toPassengerType(value: string | null): PassengerType {
  return (PASSENGER_TYPES as readonly string[]).includes(value ?? "")
    ? (value as PassengerType)
    : "حاج";
}

/* ترتيب موحّد: نفس ترتيب الجلب الأولي (sort_order ثم id)
   حتى لا يختلف ترتيب القائمة بعد وصول حدث Realtime */
function sortPassengers(list: Passenger[]): Passenger[] {
  return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
}

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

  const mapPassenger = (p: PassengerRow): Passenger => ({
    id: p.id, name_ar: p.name_ar || "", name_en: p.name_en || "",
    short_ar: p.short_ar || "", short_en: p.short_en || "",
    passport: p.passport || "", national_id: p.national_id || "",
    nat: p.nat || "", dob: p.dob || "", expiry: p.expiry || "",
    gender: p.gender || "", phone: p.phone || "",
    services: { bus: p.bus || "عادي", flight: p.flight || "عادي", hotel_type: p.hotel_type || "ثنائية", hotel_view: p.hotel_view || "مطلة", camp_mina: p.camp_mina || "عادي", camp_arafa: p.camp_arafa || "عادي", custom_price: p.custom_price != null ? String(p.custom_price) : "" },
    rel: "", linked: -1,
    photo_url: p.photo_url || "", id_expiry: p.id_expiry || "",
    national_id_url: p.national_id_url || "", contract_url: p.contract_url || "",
    passport_url: p.passport_url || "",
    hajj_permit_url: p.hajj_permit_url || "", flight_ticket_url: p.flight_ticket_url || "",
    bus_id: p.bus_id || null, camp_mina_id: p.camp_mina_id || null,
    camp_arafa_id: p.camp_arafa_id || null, room_id: p.room_id || null,
    family_id: p.family_id || null,
    flight_id: p.flight_id || null, flight_class: p.flight_class || undefined,
    return_flight_id: p.return_flight_id || null,
    sort_order: p.sort_order || 0,
    passenger_type: toPassengerType(p.passenger_type),
    wants_flight: p.wants_flight || false,
    /* حقول كانت تُسقَط صامتاً فتُعطَّل ميزة التدقيق في PassengersPage */
    season_id: p.season_id ?? null,
    created_at: p.created_at,
    created_by: p.created_by ?? null,
    updated_by: p.updated_by ?? null,
    updated_at: p.updated_at ?? null,
  });

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
          setPassengers(prev => {
            if (prev.some(p => p.id === added.id)) return prev;
            /* إعادة الفرز حتى يبقى الترتيب مطابقاً لترتيب الجلب الأولي */
            return sortPassengers([...prev, added]);
          });
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
