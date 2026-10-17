// ═══════════════════════════════════════════════════════════
// شركات الطيران — القائمة ومعرفة الشركة من اسمٍ محفوظ
// ═══════════════════════════════════════════════════════════
/* ═══ شركة الطيران ═══
   القائمة ثلاثةُ خيارات بالضبط. والقيمةُ المحفوظة نصٌّ حرّ قديم
   («Qatar Airways»، «الخطوط القطرية»، «EgyptAir»…): تُعرَف الشركة منه
   ولا يُعاد كتابته — فلا تمحو «أخرى» اسماً لا تعرفه القائمة. */
export const AIRLINE_QATAR = "الخطوط الجوية القطرية";
export const AIRLINE_SAUDIA = "الخطوط الجوية السعودية";
export const AIRLINE_OTHER = "أخرى";
export const AIRLINE_OPTIONS = [AIRLINE_QATAR, AIRLINE_SAUDIA, AIRLINE_OTHER] as const;

export type AirlineBrand = "qatar" | "saudia" | null;

export function airlineBrand(airline: string | null | undefined): AirlineBrand {
  const a = (airline || "").trim().toLowerCase();
  if (!a) return null;
  if (a.includes("qatar") || a.includes("قطري")) return "qatar";
  /* «Saudia» و«Saudi Arabian Airlines» و«الخطوط الجوية العربية السعودية» —
     لا «flynas» ولا «flyadeal»، فهما شركتان أخريان */
  if (a.includes("saudi") || a.includes("سعودي")) return "saudia";
  return null;
}

/* الخيار المعروض في القائمة لقيمةٍ محفوظة */
export const airlineOption = (airline: string): (typeof AIRLINE_OPTIONS)[number] =>
  airlineBrand(airline) === "qatar" ? AIRLINE_QATAR : airlineBrand(airline) === "saudia" ? AIRLINE_SAUDIA : AIRLINE_OTHER;
