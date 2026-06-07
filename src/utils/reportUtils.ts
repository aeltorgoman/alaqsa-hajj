import * as XLSX from "xlsx";
import type { Passenger, Bus, Camp, Room } from "../types";

// ===== قالب HTML الموحد للتقارير =====
export function makeHTML(title: string, body: string, landscape = false, logoUrl = "", companyName = "النظام") {
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" style="height:60px;object-fit:contain" />`
    : `<div style="width:60px;height:60px;background:#0C447C;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:24px">✈️</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 10px; color: #222; }
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 2px solid #0C447C; padding-bottom: 10px; }
  .page-title { font-size: 20px; font-weight: 700; color: #0C447C; text-align: center; flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #0C447C; color: white; padding: 7px 10px; text-align: right; font-size: 10px; }
  td { border: 0.5px solid #ddd; padding: 6px 10px; text-align: right; }
  tr:nth-child(even) td { background: #f5f8ff; }
  .section-title { font-size: 14px; font-weight: 700; color: #0C447C; margin: 14px 0 6px; text-align: center; }
  .page-break { page-break-after: always; }
  .footer { text-align: center; color: #aaa; font-size: 9px; margin-top: 20px; border-top: 0.5px solid #eee; padding-top: 6px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="page-header">
  ${logoHtml}
  <div class="page-title">${title}</div>
  ${logoHtml}
</div>
${body}
<div class="footer">${companyName} — تقرير ${title}</div>
</body></html>`;
}

// ===== طباعة في نفس الصفحة عبر iframe مخفي =====
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

// ===== طباعة في نافذة جديدة =====
export function printInWindow(html: string) {
  const w = window.open("", "_blank");
  if (!w) { alert("يرجى السماح بفتح النوافذ المنبثقة"); return; }
  w.document.write(html);
  w.document.close();
}

// ===== تحميل كـ HTML قابل للطباعة =====
export function downloadHTML(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== تصدير Excel عام =====
export function exportToExcel(
  headers: string[],
  rows: (string | number)[][],
  sheetName: string,
  filename: string,
  colWidths?: number[]
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  if (colWidths) ws["!cols"] = colWidths.map(w => ({ wch: w }));
  else ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length + 2, 15) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ===== تصدير Excel متعدد الشيتات =====
export function exportToExcelMultiSheet(
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[],
  filename: string
) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(sheet => {
    const ws = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    ws["!cols"] = sheet.headers.map(h => ({ wch: Math.max(h.length + 2, 15) }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });
  XLSX.writeFile(wb, filename);
}

// ===== HTML تقرير الحجاج =====
export function getPassengersHTML(
  passengers: Passenger[],
  cols: { key: string; label: string; get: (p: Passenger) => string | undefined }[],
  logoUrl = "",
  companyName = ""
) {
  const rows = passengers.map((p, i) =>
    `<tr><td style="text-align:center">${i + 1}</td>${cols.map(c => `<td>${c.get(p) || "—"}</td>`).join("")}</tr>`
  ).join("");
  const body = `<table><tr><th style="text-align:center;width:30px">م</th>${cols.map(c => `<th>${c.label}</th>`).join("")}</tr>${rows}</table>`;
  return makeHTML("كشف الحجاج", body, true, logoUrl, companyName);
}

// ===== HTML تقرير الطيران (بالشركة) =====
export function getFlightByAirlineHTML(passengers: Passenger[], logoUrl = "", companyName = "") {
  const airlines = [...new Set(passengers.map(p => (p as any).flight_airline || "غير محدد"))];
  const sections = airlines.map(airline => {
    const group = passengers.filter(p => ((p as any).flight_airline || "غير محدد") === airline);
    const rows = group.map((p, i) =>
      `<tr><td>${i + 1}</td><td>${p.name_ar}</td><td>${p.name_en}</td><td>${p.nat}</td><td style="text-align:center">${p.passport}</td><td>${p.gender}</td></tr>`
    ).join("");
    return `<div class="page-break"><div class="section-title">✈️ ${airline} (${group.length} حاج)</div>
    <table><tr><th>م</th><th>الاسم بالعربي</th><th>الاسم بالإنجليزي</th><th>الجنسية</th><th>رقم الجواز</th><th>الجنس</th></tr>${rows}</table></div>`;
  }).join("");
  return makeHTML("Pilgrims Flight List", sections, true, logoUrl, companyName);
}

// ===== HTML تقرير الباصات =====
export function getBusesHTML(
  buses: Bus[],
  passengers: Passenger[],
  logoUrl = "",
  companyName = ""
) {
  const sections = buses.map(bus => {
    const bp = passengers.filter(p => p.bus_id === bus.id);
    if (bp.length === 0) return "";
    const rows = bp.map((p, i) =>
      `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${p.nat}</td><td>${p.gender}</td></tr>`
    ).join("");
    return `<div class="page-break">
      <div class="section-title">🚌 ${bus.name} ${bus.type === "VIP" ? "(VIP ⭐)" : ""} — ${bp.length} مسافر</div>
      <table><tr><th>م</th><th>الاسم</th><th>الجنسية</th><th>الجنس</th></tr>${rows}</table>
    </div>`;
  }).join("");
  return makeHTML("تقرير الباصات", sections, false, logoUrl, companyName);
}

// ===== HTML تقرير المخيمات =====
export function getCampsHTML(
  camps: Camp[],
  passengers: Passenger[],
  campIdKey: string,
  pageType: string,
  logoUrl = "",
  companyName = ""
) {
  const icon = pageType === "منى" ? "⛺" : "🏔";
  const sections = camps.map(camp => {
    const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id);
    if (cp.length === 0) return "";
    const headerColor = camp.gender === "ذكر" ? "#0C447C" : "#72243E";
    const rows = cp.map((p, i) =>
      `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${p.nat}</td></tr>`
    ).join("");
    return `<div class="page-break">
      <div class="section-title" style="background:${headerColor};color:white;padding:8px;border-radius:6px">
        ${icon} مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"} (${camp.type}) — ${cp.length} حاج
      </div>
      <table><tr><th>م</th><th>الاسم</th><th>الجنسية</th></tr>${rows}</table>
    </div>`;
  }).join("");
  return makeHTML(`مخيمات ${pageType}`, sections, false, logoUrl, companyName);
}

// ===== HTML تقرير الفندق =====
export function getHotelHTML(
  rooms: Room[],
  passengers: Passenger[],
  filter: { type: "all" | "floor" | "type"; floor?: string; roomType?: string },
  logoUrl = "",
  companyName = ""
) {
  let filteredRooms = rooms;
  let subtitle = "";
  if (filter.type === "floor" && filter.floor) {
    filteredRooms = rooms.filter(r => r.floor === filter.floor);
    subtitle = ` — طابق ${filter.floor}`;
  } else if (filter.type === "type" && filter.roomType) {
    filteredRooms = rooms.filter(r => r.type === filter.roomType);
    subtitle = ` — غرف ${filter.roomType}`;
  }

  const sections = filteredRooms.map(room => {
    const rp = passengers.filter(p => p.room_id === room.id);
    if (rp.length === 0) return "";
    const rows = rp.map((p, i) =>
      `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${p.nat}</td><td>${p.gender}</td><td>${p.services?.hotel_type || "—"}</td></tr>`
    ).join("");
    return `<div style="margin-bottom:12px;break-inside:avoid">
      <div class="section-title">🏨 غرفة ${room.number} — طابق ${room.floor} — ${room.type} (${rp.length} نزيل)</div>
      <table><tr><th>م</th><th>الاسم</th><th>الجنسية</th><th>الجنس</th><th>نوع الغرفة المطلوب</th></tr>${rows}</table>
    </div>`;
  }).join("");

  return makeHTML(`تقرير الفندق${subtitle}`, sections, true, logoUrl, companyName);
}

// ===== تصدير Excel الحجاج =====
export function exportPassengersXLSX(
  passengers: Passenger[],
  cols: { key: string; label: string; get: (p: Passenger) => string | undefined }[]
) {
  const headers = ["م", ...cols.map(c => c.label)];
  const rows = passengers.map((p, i) => [i + 1, ...cols.map(c => c.get(p) || "")]);
  exportToExcel(headers, rows, "الحجاج", "تقرير_الحجاج.xlsx");
}

// ===== تصدير Excel الباصات =====
export function exportBusesXLSX(buses: Bus[], passengers: Passenger[]) {
  const rows: (string | number)[][] = [["اسم الباص", "النوع", "م", "اسم الحاج", "الجنس", "الجنسية"]];
  buses.forEach(bus => {
    const bp = passengers.filter(p => p.bus_id === bus.id);
    bp.forEach((p, i) => rows.push([bus.name, bus.type, i + 1, p.short_ar || p.name_ar, p.gender, p.nat]));
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 4 }, { wch: 30 }, { wch: 8 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الباصات");
  XLSX.writeFile(wb, "تقرير_الباصات.xlsx");
}

// ===== تصدير Excel المخيمات =====
export function exportCampsXLSX(camps: Camp[], passengers: Passenger[], campIdKey: string, pageType: string) {
  const rows: (string | number)[][] = [["المخيم", "النوع", "الجنس", "م", "اسم الحاج", "الجنسية"]];
  camps.forEach(camp => {
    const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id);
    cp.forEach((p, i) => rows.push([camp.name, camp.type, camp.gender, i + 1, p.short_ar || p.name_ar, p.nat]));
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 4 }, { wch: 30 }, { wch: 15 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `مخيمات ${pageType}`);
  XLSX.writeFile(wb, `تقرير_مخيمات_${pageType}.xlsx`);
}

// ===== تصدير Excel الفندق =====
export function exportHotelXLSX(rooms: Room[], passengers: Passenger[]) {
  const rows: (string | number)[][] = [["رقم الغرفة", "الطابق", "النوع", "م", "اسم الحاج", "الجنس", "طلب الحاج"]];
  rooms.forEach(room => {
    const rp = passengers.filter(p => p.room_id === room.id);
    rp.forEach((p, i) => rows.push([room.number, room.floor, room.type, i + 1, p.short_ar || p.name_ar, p.gender, p.services?.hotel_type || ""]));
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 4 }, { wch: 30 }, { wch: 8 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الفندق");
  XLSX.writeFile(wb, "تقرير_الفندق.xlsx");
}
