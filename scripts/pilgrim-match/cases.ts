// قواعدُ مطابقة الحاجّ (src/utils/pilgrimMatch.ts) — حالاتٌ صريحة تُنفَّذ بـ`run.mjs`
import {
  possibleNameMatch, nameMatchCandidates, nameComponents, normalizeDob, normalizeDocNumber,
  findDocOwner, findDocConflict, docUniqueViolation, docConflictMessage,
} from "../../src/utils/pilgrimMatch";

type Case = { name: string; ok: boolean; detail?: string };
const out: Case[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => out.push({ name, ok, detail: detail === undefined ? undefined : JSON.stringify(detail) });

const P = (id: number, name_ar: string, extra: Record<string, string> = {}) => ({ id, name_ar, name_en: "", dob: "", passport: "", national_id: "", ...extra });
/* حجّاجُ الموسم الحالي — أسماءٌ عربيّةٌ شائعة تتشارك الاسم الأول والثاني واسم العائلة */
const season = [
  P(1, "محمد علي سالم الهاجري", { dob: "01/02/1960", passport: "A1234567", national_id: "28763400001", name_en: "MOHAMMED ALI SALEM ALHAJRI" }),
  P(2, "محمد علي حسن المري", { dob: "05/06/1970" }),
  P(3, "محمد خالد ناصر الهاجري", { dob: "07/08/1965" }),
  P(4, "عبد الله أحمد إبراهيم آل ثاني", { dob: "" }),
];

// ١) الاسم الأول وحده — لا تحذير
check("1. same first name only → no warning",
  nameMatchCandidates(season, { name_ar: "محمد يوسف عمر الكواري", dob: "01/02/1960" }).length === 0);
// ٢) الاسمان الأوّلان — لا تحذير (ولو اتّفق تاريخ الميلاد)
check("2. same first two names → no warning (even with same DOB)",
  nameMatchCandidates(season, { name_ar: "محمد علي يوسف الكواري", dob: "01/02/1960" }).length === 0);
// ٣) الثلاثة الأولى بتاريخ ميلادٍ مختلف — لا تحذير
check("3. same first three names, different DOB → no warning",
  possibleNameMatch("محمد علي سالم الهاجري", "محمد علي سالم المري", "01/02/1960", "02/02/1960") === null);
check("3b. same first three names, DOB missing on one side → no warning",
  possibleNameMatch("محمد علي سالم الهاجري", "محمد علي سالم المري", "01/02/1960", "") === null);
check("3c. same first three names, invalid DOB → no warning",
  possibleNameMatch("محمد علي سالم الهاجري", "محمد علي سالم المري", "31/02/1960", "31/02/1960") === null);
// ٤) الثلاثة الأولى بتاريخ الميلاد نفسه — اقتراح
check("4. same first three names + same DOB → possible match",
  possibleNameMatch("محمد علي سالم الهاجري", "محمد علي سالم المري", "01/02/1960", "1/2/1960") === "three_names_and_dob");
check("4b. DOB formats DD/MM/YYYY vs YYYY-MM-DD compare by date",
  possibleNameMatch("محمد علي سالم", "محمد علي سالم", "01/02/1960", "1960-02-01") === "three_names_and_dob");
check("4c. candidate list returns that pilgrim only",
  JSON.stringify(nameMatchCandidates(season, { name_ar: "محمد علي سالم الكبيسي", dob: "01/02/1960" }).map(p => p.id)) === "[1]");
// ٥) الاسم الرباعي الكامل — اقتراح بلا تاريخ ميلاد
check("5. identical complete four-part name → possible match (no DOB needed)",
  possibleNameMatch("محمد علي سالم الهاجري", "محمد علي سالم الهاجري", "", "") === "full_name_four_plus");
check("5b. three-part identical name without DOB → no warning (needs 4+ parts)",
  possibleNameMatch("محمد علي سالم", "محمد علي سالم", "", "") === null);
check("5c. four-part vs five-part (not the complete name) without DOB → no warning",
  possibleNameMatch("محمد علي سالم الهاجري", "محمد علي سالم الهاجري الدوسري", "", "") === null);
// ٦) اختلافات الإملاء العربيّ
check("6. Arabic variants: أ/إ/آ/ا, ة/ه, ى/ي, diacritics, tatweel",
  possibleNameMatch("أحمد إبراهيم مصطفى حمزة", "احمـد ابراهيم مصطفي حمزه", "", "") === "full_name_four_plus",
  [nameComponents("أحمد إبراهيم مصطفى حمزة"), nameComponents("احمـد ابراهيم مصطفي حمزه")]);
check("6b. «عبد الله» = «عبدالله», «آل ثاني» = «ال ثاني»",
  possibleNameMatch("عبد الله أحمد إبراهيم آل ثاني", "عبدالله احمد ابراهيم ال ثاني", "", "") === "full_name_four_plus",
  nameComponents("عبد الله أحمد إبراهيم آل ثاني"));
check("6c. «بن» is a connector, not a component",
  JSON.stringify(nameComponents("محمد بن علي بن سالم")) === JSON.stringify(["محمد", "علي", "سالم"]));
check("6d. diacritics on full name: «مُحَمَّد عَلِيّ سَالِم الهَاجِرِيّ»",
  possibleNameMatch("مُحَمَّد عَلِيّ سَالِم الهَاجِرِيّ", "محمد علي سالم الهاجري", "", "") === "full_name_four_plus");
// ٧) الإنجليزيّة: الحالة والفراغات والشرطة
check("7. English: case, extra spaces, hyphen",
  possibleNameMatch("MOHAMMED ALI SALEM AL-HAJRI", "  mohammed   ali salem   al hajri ", "", "") === "full_name_four_plus",
  [nameComponents("MOHAMMED ALI SALEM AL-HAJRI"), nameComponents("  mohammed   ali salem   al hajri ")]);
check("7b. English: Abdul Rahman = Abdulrahman = Abdel Rahman",
  JSON.stringify(nameComponents("Abdul Rahman Ali Saleh")) === JSON.stringify(nameComponents("ABDULRAHMAN ALI SALEH"))
  && JSON.stringify(nameComponents("Abdel Rahman Ali Saleh")) === JSON.stringify(nameComponents("abdulrahman ali saleh")));
check("7c. English candidate via name_en",
  JSON.stringify(nameMatchCandidates(season, { name_en: "Mohammed Ali Salem Al-Hajri" }).map(p => p.id)) === "[1]");
// لا تحذير لاسم العائلة الشائع وحده، ولا لاختلاف الاسم الأوّل
check("no warning for a common family name only",
  nameMatchCandidates(season, { name_ar: "يوسف حمد خالد الهاجري", dob: "07/08/1965" }).length === 0);
check("short names are never compared (short_ar ignored)",
  nameMatchCandidates([{ ...season[0], name_ar: "", name_en: "", short_ar: "محمد علي سالم الهاجري" } as never], { name_ar: "محمد علي سالم الهاجري" }).length === 0);
// ٨) و٩) تطابق المستند
check("8. exact passport → duplicate owner",
  findDocOwner(season, "passport", "A1234567")?.id === 1);
check("8b. passport normalized: spaces, lowercase",
  findDocOwner(season, "passport", " a12 34567 ")?.id === 1);
check("8c. no normalization that merges distinct numbers (dash kept, leading zero kept)",
  findDocOwner(season, "passport", "A-1234567") === undefined && findDocOwner(season, "passport", "0A1234567") === undefined);
check("9. exact national ID → duplicate owner (Arabic-Indic digits normalized)",
  findDocOwner(season, "national_id", "٢٨٧٦٣٤٠٠٠٠١")?.id === 1);
check("9b. conflict reports the field and names the pilgrim",
  (() => { const c = findDocConflict(season, { national_id: "28763400001" }); return !!c && c.field === "national_id" && docConflictMessage(c).includes("محمد علي سالم الهاجري"); })());
// ١٠) موسمٌ سابق: القائمة هي الموسم الحالي وحده
check("10. pilgrim from a previous season (not in the current list) → new registration allowed",
  findDocConflict([], { passport: "A1234567", national_id: "28763400001" }) === null);
// ١٢) ربطُ رقمٍ لحاجٍّ آخر
check("12. linking a document number owned by another pilgrim → conflict",
  findDocConflict(season, { passport: "A1234567" }, 2)?.pilgrim.id === 1);
// ١٣) فشلُ القراءة أو غيابُ الرقم
check("13. OCR without a document number → no exact match, nothing claimed",
  findDocOwner(season, "passport", "") === undefined && findDocOwner(season, "national_id", null) === undefined
  && findDocConflict(season, { passport: "", national_id: "   " }) === null);
check("13b. empty numbers never match pilgrims with empty numbers",
  findDocOwner([P(9, "x", { passport: "" }), P(10, "y", { passport: "" })], "passport", "  ") === undefined);
// ١٥) تعديلُ الحاجّ نفسه
check("15. editing a pilgrim does not match their own record",
  findDocConflict(season, { passport: "A1234567", national_id: "28763400001" }, 1) === null
  && nameMatchCandidates(season, { name_ar: "محمد علي سالم الهاجري" }, 1).length === 0);
// ١١) رسالةُ الرفض من الفهرس الفريد (الحفظ المتزامن)
check("11. DB unique violation (concurrent save) is recognized per field",
  docUniqueViolation({ code: "23505", message: 'duplicate key value violates unique constraint "passengers_season_passport_uniq"' }) === "passport"
  && docUniqueViolation({ code: "23505", message: 'duplicate key value violates unique constraint "passengers_season_national_id_uniq"' }) === "national_id"
  && docUniqueViolation({ code: "23505", message: 'duplicate key value violates unique constraint "other_uniq"' }) === null
  && docUniqueViolation(null) === null);
check("normalizers", normalizeDocNumber(" ab ١٢٣ ") === "AB123" && normalizeDob("29/02/2000") === "2000-02-29"
  && normalizeDob("29/02/2001") === null && normalizeDob("") === null && normalizeDob("1960") === null);

console.log(JSON.stringify(out));
