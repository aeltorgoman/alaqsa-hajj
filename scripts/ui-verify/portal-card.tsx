import { createRoot } from "react-dom/client";
import { FlightCard } from "../../src/components/portal/FlightCard";
import { buildTheme } from "../../src/components/portal/portal.theme";
const t = buildTheme({ color_primary: "#5d2222", color_accent: "#B08D3C" } as never);
const base = { name: "QR 1186", from_airport: "DOH", to_airport: "JED", time: "08:30", arrival_time: "10:45", date: "2026-05-20", arrival_date: "2026-05-20", class: "عادي" };
const flights = [
  { ...base, airline: "الخطوط الجوية القطرية" },
  { ...base, name: "SV 1234", airline: "الخطوط الجوية السعودية", from_airport: "JED", to_airport: "DOH", time: "23:40", arrival_time: "01:55", arrival_date: "2026-05-21", class: "درجة أولى" },
  { ...base, name: "XY 77", airline: "طيران آخر" },
];
createRoot(document.getElementById("root")!).render(<>{flights.map((f, i) => <FlightCard key={i} t={t} f={f as never} label={i === 1 ? "رحلة العودة" : "رحلة الذهاب"} />)}</>);
