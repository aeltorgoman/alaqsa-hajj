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
  name: string;
  created_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
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
}

export const SeasonContext = createContext<SeasonValue | null>(null);

export function useSeason(): SeasonValue {
  const value = useContext(SeasonContext);
  if (!value) throw new Error("useSeason خارج SeasonProvider");
  return value;
}
