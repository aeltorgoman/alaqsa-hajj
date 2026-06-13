import * as XLSX from "xlsx";
import { supabase } from "../supabase";

export function makeShort(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
  return [parts[0], parts[1], parts[parts.length - 1]].join(" ");
}

export function isExpiringSoon(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const now = new Date();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return d >= now && d < sixMonths;
}

export function isExpired(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d < new Date();
}

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  let d: Date | null = null;
  const parts = dateStr.split(/[\/\-.]/).map(s => s.trim());
  if (parts.length === 3) {
    if (parts[0].length === 4) d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    else d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
  }
  if (!d || isNaN(d.getTime())) return null;
  return d;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function scanDocument(file: File, mode: "passport" | "idcard" | "hajj_permit"): Promise<any> {
  const base64 = await fileToBase64(file);
  const response = await fetch("https://zkucwcnclbfvukhdqhgc.supabase.co/functions/v1/Scan-passport", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mediaType: file.type, mode })
  });
  const data = await response.json();
  const text = data.content ? data.content.map((i: any) => i.text || "").join("") : JSON.stringify(data);
  let parsed: any = {};
  try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {}
  return parsed;
}

export async function downloadFile(url: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = url.split("/").pop() || "file";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch { window.open(url, "_blank"); }
}

export function getStoragePath(url: string): string {
  const prefix = "/storage/v1/object/public/passengers-docs/";
  const idx = url.indexOf(prefix);
  if (idx === -1) return "";
  return decodeURIComponent(url.slice(idx + prefix.length));
}

export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const isPng = file.type === "image/png";
    const outputType = isPng ? "image/png" : "image/jpeg";
    const outputQuality = isPng ? 1 : 0.8;
    const img = new Image();
    img.onload = () => {
      const maxDim = 1400;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = height * maxDim / width; width = maxDim; }
        else { width = width * maxDim / height; height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx && !isPng) {
        ctx.fillStyle = "var(--text-inverse)";
        ctx.fillRect(0, 0, width, height);
      }
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => resolve(b || file), outputType, outputQuality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadDoc(file: File, passengerId: number, docType: string): Promise<string | null> {
  const compressed = await compressImage(file);
  const isPng = file.type === "image/png";
  const ext = file.type === "application/pdf" ? "pdf" : isPng ? "png" : "jpg";
  const contentType = file.type === "application/pdf" ? "application/pdf" : isPng ? "image/png" : "image/jpeg";
  const path = `${passengerId}/${docType}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("passengers-docs").upload(path, compressed, { upsert: true, contentType });
  if (error) { console.error("upload error", error); return null; }
  const { data } = supabase.storage.from("passengers-docs").getPublicUrl(path);
  return data?.publicUrl || null;
}

export function makeHTML(
  title: string,
  body: string,
  landscape = false,
  logoUrl = "",
  companyName = "حملة الأقصى",
  tagline = "",
  primaryColor = "#6B1F3A",
  accentColor = "#0C447C",
  noHeader = false
) {
  const initial = (companyName || "ح").trim().charAt(0);
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="logo" />`
    : `<span>${initial}</span>`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  // نقشة إسلامية (Girih) متشابكة بخطوط ذهبية أوضح (حوالي 5 نقشات في الصف)
  const patternSVG = `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'><g fill='none' stroke='#D4A017' stroke-width='1.6' stroke-opacity='0.26'><path d='M70 7 L91 32 L119 21 L108 49 L133 70 L108 91 L119 119 L91 108 L70 133 L49 108 L21 119 L32 91 L7 70 L32 49 L21 21 L49 32 Z'/><path d='M70 7 L70 133 M7 70 L133 70 M21 21 L119 119 M119 21 L21 119'/></g></svg>`;
  const patternURL = `data:image/svg+xml,${encodeURIComponent(patternSVG)}`;
  const headerHTML = noHeader ? "" : `<div class="doc-header">
  <div class="brand">
    <div class="logo-box">${logoHtml}</div>
    <div>
      <div class="company-name">${companyName}</div>
      ${tagline ? `<div class="tagline">${tagline}</div>` : ""}
    </div>
  </div>
  <div class="meta">
    <div>تاريخ الإصدار: ${dateStr}</div>
    <div>الساعة: ${timeStr}</div>
  </div>
</div>
<div class="doc-title-bar">${title}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html { background-color: #ffffff; background-image: url("${patternURL}"); background-repeat: repeat; background-size: 140px 140px; }
  body { font-family: 'Tajawal', 'Arial', sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 20px; color: #1c1c1c; background-color: #ffffff; background-image: url("${patternURL}"); background-repeat: repeat; background-size: 140px 140px; }
  .doc-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 3px solid ${primaryColor}; margin-bottom: 6px; }
  .doc-header .brand { display: flex; align-items: center; gap: 14px; }
  .doc-header .logo-box { width: 130px; height: 130px; border-radius: 18px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${primaryColor}; color: #fff; font-size: 52px; font-weight: 700; flex-shrink: 0; }
  .doc-header .logo-box img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .doc-header .company-name { font-size: 22px; font-weight: 700; color: ${primaryColor}; }
  .doc-header .tagline { font-size: 13px; color: #888; margin-top: 3px; }
  .doc-header .meta { text-align: left; font-size: 11px; color: #999; line-height: 1.7; }
  .doc-title-bar { background: linear-gradient(135deg, ${primaryColor}, ${accentColor}); color: #fff; text-align: center; padding: 12px 0; border-radius: 8px; font-size: 27px; font-weight: 700; margin: 14px 0 16px; }
  .camp-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
  .camp-header .camp-logo { width: 165px; height: 165px; border-radius: 50%; border: 6px solid ${primaryColor}; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fff; flex-shrink: 0; }
  .camp-header .camp-logo img { width: 100%; height: 100%; object-fit: cover; }
  .camp-header .camp-logo span { font-size: 62px; font-weight: 800; color: ${primaryColor}; }
  .camp-header .camp-title-box { flex: 1; text-align: center; }
  .camp-header .camp-title { font-size: 66px; font-weight: 800; color: #1c1c1c; }
  .camp-header .camp-subtitle { font-size: 17px; color: #888; margin-top: 5px; }
  .camp-table th { background: ${primaryColor}; color: #fff; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th { background: ${primaryColor}; color: #fff; padding: 18px 22px; text-align: right; font-size: 34px; font-weight: 600; }
  td { border: 0.5px solid rgba(0,0,0,0.08); padding: 18px 22px; text-align: right; background: transparent; font-size: 34px; white-space: nowrap; }
  tr:nth-child(even) td { background: rgba(212,160,23,0.05); }
  .section-title { font-size: 20px; font-weight: 700; color: ${primaryColor}; margin: 16px 0 8px; text-align: center; padding: 8px; background: ${primaryColor}14; border-radius: 6px; }
  .wide-table th, .wide-table td { font-size: 16px; padding: 8px 10px; }
  .ltr-table th, .ltr-table td { text-align: left; }
  .page-break { page-break-after: always; }
  .page-break-before { page-break-before: always; }
  .footer { text-align: center; color: #aaa; font-size: 10px; margin-top: 20px; border-top: 0.5px solid #eee; padding-top: 8px; }
  @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } }
</style></head><body>
${headerHTML}
${body}
<div class="footer">${companyName}${tagline ? " — " + tagline : ""} · تقرير ${title}</div>
</body></html>`;
}

// ============================================================
// دوال موحّدة لتوليد أقسام التقارير (مستخدمة في صفحة التقارير وصفحات التنظيم)
// ============================================================
export interface ReportBranding {
  logoUrl?: string;
  companyName?: string;
  tagline?: string;
  primaryColor?: string;
  accentColor?: string;
}
type NameItem = { short_ar?: string; name_ar: string };

// شعار القسم (دائرة بصورة اللوجو أو حرف اسم الشركة)
export function sectionLogoHtml(b: ReportBranding): string {
  const companyName = b.companyName || "حملة الأقصى";
  return b.logoUrl ? `<img src="${b.logoUrl}" alt="logo" />` : `<span>${companyName.trim().charAt(0)}</span>`;
}

// عرض قائمة أسماء: عمود واحد لو 20 أو أقل، وعمودين لو أكتر
export function renderNamesTable(items: NameItem[], nameLabel = "اسم الحاج", primaryColor = "#6B1F3A"): string {
  if (items.length === 0) {
    return `<table style="width:60%;margin:0 auto"><tr><th style="text-align:center;width:40px">م</th><th>${nameLabel}</th></tr><tr><td></td><td>لا يوجد مسافرون</td></tr></table>`;
  }
  if (items.length <= 20) {
    const rows = items.map((p, i) => `<tr><td style="text-align:center;width:40px">${i + 1}</td><td>${p.short_ar || p.name_ar}</td></tr>`).join("");
    return `<table style="width:60%;margin:0 auto"><tr><th style="text-align:center;width:40px">م</th><th>${nameLabel}</th></tr>${rows}</table>`;
  }
  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);
  const maxRows = Math.max(col1.length, col2.length);
  let rows = "";
  for (let i = 0; i < maxRows; i++) {
    const p1 = col1[i], p2 = col2[i];
    rows += `<tr>
      <td style="text-align:center;width:30px">${p1 ? i + 1 : ""}</td>
      <td>${p1 ? (p1.short_ar || p1.name_ar) : ""}</td>
      <td style="text-align:center;width:30px;border-right:2px solid ${primaryColor}">${p2 ? half + i + 1 : ""}</td>
      <td>${p2 ? (p2.short_ar || p2.name_ar) : ""}</td>
    </tr>`;
  }
  return `<table>
    <tr><th style="text-align:center;width:30px">م</th><th>${nameLabel}</th><th style="text-align:center;width:30px">م</th><th>${nameLabel}</th></tr>
    ${rows}
  </table>`;
}

// قسم بشعارين (يمين/شمال) وعنوان كبير في الوسط + جدول أسماء — مستخدم لكل باص/مخيم
export function makeTwoLogoSectionHTML(title: string, subtitle: string, namesHTML: string, b: ReportBranding): string {
  const logo = sectionLogoHtml(b);
  return `<div class="camp-header">
    <div class="camp-logo">${logo}</div>
    <div class="camp-title-box">
      <div class="camp-title">${title}</div>
      ${subtitle ? `<div class="camp-subtitle">${subtitle}</div>` : ""}
    </div>
    <div class="camp-logo">${logo}</div>
  </div>${namesHTML}`;
}

// تجميع أقسام متعددة مع فاصل صفحة قبل كل قسم إلا الأول
export function joinSections(sections: string[]): string {
  return sections.map((s, idx) => `<div class="${idx > 0 ? "page-break-before" : ""}">${s}</div>`).join("");
}

// قسم رحلة طيران واحدة (هيدر معلومات الرحلة + جدول الحجاج بالعربي)
export function makeFlightSectionHTML(flight: { name: string; type?: string; airline?: string; date?: string; time?: string; from_airport?: string; to_airport?: string }, fp: (NameItem & { nat?: string; passport?: string; phone?: string; gender?: string; flight_class?: string })[], b: ReportBranding): string {
  const primaryColor = b.primaryColor || "#6B1F3A";
  const rows = fp.map((p, i) => {
    const cls = p.flight_class === "درجة أولى" ? "درجة أولى" : "اقتصادية";
    return `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${p.nat || ""}</td><td>${p.passport || ""}</td><td>${p.phone || "—"}</td><td>${p.gender || ""}</td><td>${cls}</td></tr>`;
  }).join("");
  return `<div style="background:${primaryColor}10;border:1px solid ${primaryColor};border-radius:8px;padding:14px 18px;margin-bottom:16px;direction:rtl">
    <div style="font-size:20px;font-weight:700;color:${primaryColor};margin-bottom:10px">${flight.name}${flight.type ? ` — ${flight.type}` : ""}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:13px">
      <div><span style="color:#888">الخط:</span> ${flight.airline || "—"}</div>
      <div><span style="color:#888">التاريخ:</span> ${flight.date || "—"}</div>
      <div><span style="color:#888">الوقت:</span> ${flight.time || "—"}</div>
      <div><span style="color:#888">من:</span> ${flight.from_airport || "—"}</div>
      <div><span style="color:#888">إلى:</span> ${flight.to_airport || "—"}</div>
      <div><span style="color:#888">عدد الحجاج:</span> ${fp.length}</div>
    </div>
  </div>
  <table class="wide-table"><tr><th style="text-align:center;width:30px">م</th><th>اسم الحاج / الحاجة</th><th>الجنسية</th><th>رقم الجواز</th><th>التليفون</th><th>الجنس</th><th>الدرجة</th></tr>${rows}</table>`;
}

export function printInPage(html: string) {
  const existing = document.getElementById("__print_frame__");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 600);
}

export function downloadPDF(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== تثبيت صف العنوان (Freeze Header Row) =====
export function freezeHeaderRow(ws: import("xlsx").WorkSheet, rows = 1) {
  (ws as any)["!views"] = [{ state: "frozen", xSplit: 0, ySplit: rows, topLeftCell: `A${rows + 1}`, activePane: "bottomLeft" }];
}

// ===== تنسيق صف عنوان رئيسي (دمج + خلفية ملوّنة) =====
export function styleTitleRow(ws: import("xlsx").WorkSheet, rowIndex: number, colCount: number, primaryColor: string) {
  const rgb = primaryColor.replace("#", "");
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"]!.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: colCount - 1 } });
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    (ws[addr] as any).s = { fill: { fgColor: { rgb } }, font: { color: { rgb: "FFFFFF" }, bold: true, sz: 13 }, alignment: { horizontal: "center", vertical: "center" } };
  }
}

// ===== تنسيق صف رؤوس الأعمدة (خلفية ملوّنة + خط أبيض) =====
export function styleHeaderRow(ws: import("xlsx").WorkSheet, rowIndex: number, colCount: number, primaryColor: string) {
  const rgb = primaryColor.replace("#", "");
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    if (!ws[addr]) continue;
    (ws[addr] as any).s = { fill: { fgColor: { rgb } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
  }
}

// ===== اسم شيت صالح (حد 31 حرف وبدون رموز ممنوعة) =====
export function safeSheetName(name: string): string {
  return (name || "ورقة").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "ورقة";
}

// ===== إضافة شيت ملخص في أول الملف =====
export function addSummarySheet(
  wb: import("xlsx").WorkBook,
  XLSXLib: typeof import("xlsx"),
  reportTitle: string,
  companyName: string,
  stats: (string | number)[][],
  sheetName = "ملخص"
) {
  const now = new Date();
  const aoa: (string | number)[][] = [
    [companyName],
    [reportTitle],
    [`تاريخ الإصدار: ${now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}`],
    [],
    ["البيان", "القيمة"],
    ...stats,
  ];
  const ws = XLSXLib.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, { wch: 16 }];
  XLSXLib.utils.book_append_sheet(wb, ws, sheetName);
  // نقل شيت الملخص لأول الملف
  wb.SheetNames.unshift(wb.SheetNames.pop() as string);
}

export const ALL_PERMISSIONS = [
  { key: "add_passenger", label: "إضافة حجاج" },
  { key: "edit_passenger", label: "تعديل حجاج" },
  { key: "delete_passenger", label: "حذف حجاج" },
  { key: "view_passengers", label: "عرض الحجاج" },
  { key: "manage_buses", label: "إدارة الباصات" },
  { key: "manage_camps", label: "إدارة المخيمات" },
  { key: "manage_hotel", label: "إدارة الفندق" },
  { key: "view_reports", label: "عرض التقارير" },
  { key: "export_reports", label: "تصدير التقارير" },
  { key: "print_reports", label: "طباعة التقارير" },
  { key: "manage_users", label: "إدارة المستخدمين" },
  { key: "view_archive", label: "عرض الأرشيف" },
  { key: "manage_flights", label: "إدارة الطيران" },
];

export const ROOM_TYPES = ["ثنائية", "ثلاثية", "رباعية", "سويت"] as const;
export const ROOM_COLORS: Record<string, [string, string]> = { "ثنائية": ["var(--male-bg)", "var(--info)"], "ثلاثية": ["var(--warning-bg)", "var(--warning)"], "رباعية": ["var(--success-bg)", "var(--primary-dark)"], "سويت": ["var(--info-bg)", "var(--info)"] };

export const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "الرئيسية", perm: "" }] },
  { section: "التنظيم", items: [{ id: "passengers", label: "الحجاج", perm: "view_passengers" }, { id: "buses", label: "الباصات", perm: "manage_buses" }, { id: "flights", label: "الطيران", perm: "manage_flights" }, { id: "mina", label: "مخيمات منى", perm: "manage_camps" }, { id: "arafa", label: "مخيمات عرفة", perm: "manage_camps" }, { id: "hotel", label: "الفندق", perm: "manage_hotel" }] },
  { section: "التقارير", items: [{ id: "reports", label: "التقارير", perm: "view_reports" }] },
  { section: "الأرشيف", items: [{ id: "archive", label: "الأرشيف", perm: "view_archive" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "الإعدادات", perm: "manage_users" }] },
];

export const inp = { fontSize: 12, background: "var(--bg-input)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: "7px 10px", width: "100%", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" as const, color: "var(--text)" };
export const btnP = (extra?: any) => ({ background: "var(--primary)", color: "var(--text-inverse)", border: "none", padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", fontWeight: 500, fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
export const btnS = (extra?: any) => ({ background: "transparent", border: "0.5px solid var(--border)", padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)", fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
