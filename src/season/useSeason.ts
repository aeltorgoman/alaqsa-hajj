// ============================================================
// عقد سياق الموسم — الأنواع والخطّاف
// ============================================================
// منفصل عن SeasonContext.tsx لأن الملف الذي يصدّر مكوّناً ودوالَّ
// معاً يكسر Fast Refresh. المكوّن هناك، والعقد هنا.
//
// المفهومان اللذان لا يجوز خلطهما:
//
//   activeSeason   الموسم الذي تنتمي إليه البيانات الجديدة. عام
//                  للنظام كلّه، ومصدره القاعدة وحدها.
//   viewedSeason   الموسم المعروض في هذا التبويب. خاصّ بالتبويب،
//                  ومصدره حالة الواجهة.
//
// لو تبدّل النشط بتبديل المعروض، لحوّل موظفٌ يتصفّح موسماً قديماً
// النظامَ كلَّه إليه. ولهذا لا يوجد هنا حقل اسمه `season` ولا دالة
// تكتب في `activeSeason` — التسمية نفسها هي الحارس.
import { createContext, useContext } from "react";

export interface Season {
  id: number;
  /** اسمُ العرض كما كتبه المدير. نصٌّ حرٌّ — ولا يُشتقّ منه شيء. */
  name: string;
  /** سنةُ الحجّ الهجريّة — هويّةُ الموسم وفريدتُه. */
  hijri_year: number;
  created_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  /* ═══ بياناتُ الموسم الرئيسة ═══
     يملكها الموسمُ لا `company_config`. ولهذا يقرأ المؤرشفُ
     فندقَه هو: القيمةُ لم تكن يوماً في مكانٍ مشترك. */
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_url: string | null;
  mina_address: string | null;
  mina_url: string | null;
  arafa_address: string | null;
  arafa_url: string | null;
  /* ═══ ترقيمُ إيصالاتِ الموسم ═══
     العدّادُ مِلكُ صفِّ الموسمِ لا `company_config`، ولكلِّ موسمٍ
     تسلسلُه. والقراءةُ تأتي مع `select("*")` القائمِ أصلاً — كان
     النوعُ وحدَه يُسقطهما، فلا استعلامَ ثانيَ يُضاف.

     · `receipt_start_number` رقمُ البداية، يُعدَّل قبل أوّلِ إيصالٍ فقط
     · `receipt_next_number`  الرقمُ القادم — وتقدُّمُه عن البدايةِ هو
       **وحدَه** دليلُ أنّ إيصالاً صدر، فلا رايةَ عميلٍ تُخترَع. */
  receipt_start_number: number;
  receipt_next_number: number;
}

export interface SeasonValue {
  /** الموسم المفتوح في القاعدة — وجهة كل كتابة جديدة */
  activeSeason: Season;
  /** الموسم المعروض في هذا التبويب — قد يكون مقفلاً */
  viewedSeason: Season;
  /** كل المواسم، الأحدث أولاً */
  seasons: Season[];
  /** هل الموسم المعروض هو النشط؟ */
  canWrite: boolean;
  /** نقيض canWrite — يُقرأ أوضح عند الحراسة */
  readOnly: boolean;
  /** تبديل الموسم المعروض في هذا التبويب وحده */
  viewSeason: (id: number) => void;
  /** العودة إلى الموسم النشط */
  returnToActive: () => void;
  /** إعادةُ قراءةِ المواسمِ من القاعدة بعد كتابةٍ على صفِّ الموسم */
  refreshSeasons: () => Promise<void>;
}

export const SeasonContext = createContext<SeasonValue | null>(null);

export function useSeason(): SeasonValue {
  const value = useContext(SeasonContext);
  if (!value) throw new Error("useSeason خارج SeasonProvider");
  return value;
}
