// ============================================================
// كشوفُ الحاويات — مصدرُ المحتوى والترتيب والعنوان، واحدٌ لا اثنان
// ============================================================
/* العطبُ الذي يحلّه هذا الملفّ: كشفُ الباص كان يُبنى مرّتين — مرّةً في
   `BusesPage` بترتيب `bus_sort_order` المحفوظ، ومرّةً في `ReportsPage`
   بالترتيب العامّ — فيُطبَع الركّابُ أنفسهم بترتيبين. وكذلك المخيّم.
   فصار المحتوى والترتيب والعنوان والوسم تُقرَّر هنا، وتستدعيه صفحةُ
   الإسناد وصفحةُ التقارير معاً. فاستحال الترتيبان.

   ⚠️ ولا ترتيبَ يُبتكر هنا: كلٌّ بعموده المعتمَد كما أُقرَّ —
   `bus_sort_order` للباص، و`camp_*_sort_order` للمخيّم (ترحيل
   `s1_resource_ordering`)، و`orderHajjThenAdmins` للرحلة (#114).
   ولا عمودَ `flight_sort_order` يُضاف. */
import type { Passenger, Bus, Camp, Flight } from "../types";
import { byOrder, orderHajjThenAdmins } from "../utils/passenger";

/** كشفٌ واحدٌ جاهزٌ للطباعة: من فيه، وبأيّ ترتيب، وبأيّ عنوان. */
export type Manifest = {
  title: string;
  subtitle: string;
  people: Passenger[];
};

export type CampPageType = "منى" | "عرفة";

/* ═══ الباص ═══ */
/** وسمُ VIP في العنوان — صيغةٌ واحدة. كانت الصفحةُ تكتب «⭐ VIP»
 *  والتقاريرُ «— VIP»، فالورقتان تختلفان في وصفِ الباص نفسه. */
export function busTitle(bus: Bus): string {
  return `باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`;
}

export function busRiders(bus: Bus, passengers: Passenger[]): Passenger[] {
  return passengers.filter(p => p.bus_id === bus.id).sort(byOrder("bus_sort_order"));
}

export function busManifest(bus: Bus, passengers: Passenger[]): Manifest {
  return { title: busTitle(bus), subtitle: "", people: busRiders(bus, passengers) };
}

/* ═══ المخيّم (منى · عرفة) ═══ */
export const campIdKeyOf = (pageType: CampPageType) =>
  pageType === "منى" ? "camp_mina_id" as const : "camp_arafa_id" as const;

export const campOrderKeyOf = (pageType: CampPageType) =>
  pageType === "منى" ? "camp_mina_sort_order" as const : "camp_arafa_sort_order" as const;

export function campTitle(camp: Camp, pageType: CampPageType): string {
  return `مخيم ${pageType} ${camp.name}`;
}

/** الجنسُ عنوانٌ فرعيّ — والفصلُ بالجنس مطلقٌ في المخيّمات. */
export const campSubtitle = (camp: Camp): string => (camp.gender === "ذكر" ? "رجال" : "نساء");

export function campDwellers(camp: Camp, passengers: Passenger[], pageType: CampPageType): Passenger[] {
  const idKey = campIdKeyOf(pageType);
  return passengers.filter(p => p[idKey] === camp.id).sort(byOrder(campOrderKeyOf(pageType)));
}

export function campManifest(camp: Camp, passengers: Passenger[], pageType: CampPageType): Manifest {
  return {
    title: campTitle(camp, pageType),
    subtitle: campSubtitle(camp),
    people: campDwellers(camp, passengers, pageType),
  };
}

/* ═══ الرحلة ═══ */
/** ساقُ الرحلة من اتّجاهها — عمودان مستقلّان كما أُقرّ في #114. */
export const flightLegOf = (type?: string) =>
  type === "إياب" ? "return_flight_id" as const : "flight_id" as const;

/** ترتيبُ كشوف الرحلة: `sort_order` ثم `id`، والحجّاج قبل الإداريين. */
export function flightPassengers(flight: Flight, passengers: Passenger[]): Passenger[] {
  const leg = flightLegOf(flight.type);
  return orderHajjThenAdmins(passengers.filter(p => p[leg] === flight.id));
}

export function flightManifest(flight: Flight, passengers: Passenger[]): Manifest {
  return {
    title: `${flight.name}${flight.type ? ` — ${flight.type}` : ""}`,
    subtitle: "",
    people: flightPassengers(flight, passengers),
  };
}

/* ═══ ترتيبُ الحاويات نفسها في المطبوع الجامع ═══
   المخيّمات بـ`camps.sort_order` — وهو القرارُ المحفوظ الذي يملكه
   الموظّف (#113 الخيار أ)، لا `created_at`. والرحلاتُ بالتاريخ ثم
   الوقت ثم `id`، فلا يتبادل متساويان مكانَهما بين طبعتين. */
export function campsInOrder(camps: Camp[]): Camp[] {
  return [...camps].sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || a.id - b.id);
}

export function flightsInOrder(flights: Flight[]): Flight[] {
  return [...flights].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "") ||
    (a.time || "").localeCompare(b.time || "") ||
    a.id - b.id);
}
