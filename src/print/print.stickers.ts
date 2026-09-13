// ============================================================
// مطبوعاتُ الشنط — مقاساتٌ فيزيائيّةٌ معايَرة، تبقى كما هي
// ============================================================
/* ⚠️ لا تُدخَل في الكتل العامّة: `@page margin:0` ومقاساتٌ بالمليمتر
   وخطٌّ خارجيّ، ومعايرةٌ بمحاكاة طباعةٍ فعليّة. تشترك في الإخراج
   (`printInPage`) ولا تشترك في القشرة — وهذا مقصود. */
// ============================================================
// مولّد مطبوعات الشنط الموحّد — مصدر واحد لملف الحاج وصفحة التقارير
// ============================================================
export interface StickerConfig {
  color_primary?: string;
  color_accent?: string;
  name_ar?: string;
  season_label?: string;
  hotel_name?: string;
  hotel_address?: string;
  admin_phone?: string;
  logo_url?: string;
}
export interface StickerPassenger {
  short_ar?: string; name_ar?: string; name_en?: string; phone?: string;
  room_id?: number | null; bus_id?: number | null; camp_mina_id?: number | null;
}
export interface StickerMeta {
  rooms: { id: number; number?: string; floor?: string | number }[];
  buses: { id: number; name?: string }[];
  camps: { id: number; name?: string }[];
}
export interface StickerTypes { sticker?: boolean; hand_tag?: boolean; long_tag?: boolean }

/* بناء صفحة الاستيكر العريض (3 استيكرات رأسياً في A4) */
export function buildStickerPageHTML(p: StickerPassenger, cfg: StickerConfig, meta: StickerMeta): string {
  const primaryColor = cfg.color_primary || "#7D1F3C";
  const accentColor  = cfg.color_accent  || "#D4A017";
  const companyName  = cfg.name_ar || "";
  const room = meta.rooms.find(r => r.id === p.room_id);
  const bus  = meta.buses.find(b => b.id === p.bus_id);
  const roomNo    = room?.number || "—";
  const roomFloor = room?.floor  ? `الدور ${room.floor}` : "";
  const busName   = bus?.name || "";
  const minaName  = meta.camps.find(c => c.id === p.camp_mina_id)?.name || "";
  const shortName = p.short_ar || p.name_ar || "";
  const NUMFONT   = "'El Messiri',Cairo,serif";
  const logoImgEl = cfg.logo_url
    ? `<img src="${cfg.logo_url}" style="height:100%;max-height:48mm;width:auto;max-width:46mm;object-fit:contain;flex-shrink:0;display:block;" />`
    : `<div style="height:100%;max-height:48mm;width:42mm;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 24 24" style="width:88%;height:88%;" fill="none" stroke="${accentColor}" stroke-width="1.4"><path d="M12 2l2.4 4.8L19.5 8l-3.5 4 .7 5.5L12 15l-4.7 2.5.7-5.5-3.5-4 5.1-1.2z"/></svg></div>`;
  const stk = () => `
    <div style="width:100%;height:99mm;box-sizing:border-box;border-bottom:2px dashed #E8D5C4;display:flex;direction:rtl;page-break-inside:avoid;break-inside:avoid;overflow:hidden;position:relative;flex-shrink:0;">
      <div style="position:absolute;inset:5px;border:2.5px solid ${primaryColor};border-radius:10px;pointer-events:none;z-index:2;"></div>
      <div style="position:absolute;inset:9px;border:1px solid ${accentColor};border-radius:7px;pointer-events:none;opacity:.5;z-index:2;"></div>

      <!-- الجانب الأيمن: صفّان — الحملة فوق، الحاج تحت -->
      <div style="flex:1;display:flex;flex-direction:column;min-width:0;border-left:2px dashed #E8D5C4;">

        <!-- الصف العلوي: هوية الحملة -->
        <div style="height:55%;flex-shrink:0;background:#F8F2E4;border-bottom:2px solid ${accentColor};display:flex;align-items:center;gap:16pt;padding:6pt 16pt;">
          ${logoImgEl}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
            <div style="font-size:34pt;font-weight:700;color:${primaryColor};line-height:1.05;font-family:'El Messiri',Cairo,sans-serif;white-space:nowrap;">${companyName}</div>
            ${cfg.admin_phone ? `<div style="font-size:15pt;font-weight:800;color:#241318;direction:ltr;text-align:right;font-family:Arial,sans-serif;line-height:1.3;letter-spacing:.5px;">${String(cfg.admin_phone).split(/[،,\/|]+/).map(t => t.trim()).filter(Boolean).join("<br>")}</div>` : ""}
            ${cfg.season_label ? `<div style="font-size:13pt;font-weight:700;color:#8a6a10;font-family:Cairo,sans-serif;line-height:1.2;">${cfg.season_label}</div>` : ""}
          </div>
        </div>

        <!-- الصف السفلي: بيانات الحاج -->
        <div style="flex:1;padding:9pt 16pt;display:flex;flex-direction:column;justify-content:center;gap:6pt;min-height:0;">
          <div style="text-align:right;">
            <div style="font-size:16pt;font-weight:900;color:#1a0a10;line-height:1.2;font-family:Cairo,sans-serif;">${shortName}</div>
            ${p.name_en ? `<div style="font-size:9pt;font-weight:600;color:#7A6570;direction:ltr;text-align:right;margin-top:2px;font-family:Arial,sans-serif;">${p.name_en}</div>` : ""}
          </div>
          ${p.phone ? `<div style="display:flex;align-items:center;gap:8px;padding-top:5pt;border-top:1pt dashed #E8D5C4;">
            <span style="font-size:9pt;font-weight:800;color:#8a6a10;flex-shrink:0;font-family:Cairo,sans-serif;">الهاتف</span>
            <span style="font-size:12pt;font-weight:800;color:#241318;direction:ltr;font-family:Arial,sans-serif;">${p.phone}</span>
          </div>` : ""}
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;${p.phone ? "" : "padding-top:5pt;border-top:1pt dashed #E8D5C4;"}">
            <span style="font-size:9pt;font-weight:800;color:#8a6a10;flex-shrink:0;font-family:Cairo,sans-serif;">الفندق</span>
            <span style="font-size:11.5pt;font-weight:800;color:#241318;font-family:Cairo,sans-serif;">${cfg.hotel_name || companyName}</span>
            ${cfg.hotel_address ? `<span style="color:${accentColor};font-size:10pt;">•</span><span style="font-size:9.5pt;font-weight:700;color:#555;font-family:Cairo,sans-serif;">${cfg.hotel_address}</span>` : ""}
          </div>
        </div>
      </div>

      <!-- الجانب الأيسر: الغرفة -->
      <div style="width:26%;flex-shrink:0;background:${primaryColor};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10pt 8pt;gap:4px;">
        <div style="font-size:13pt;font-weight:700;color:#F0C84A;letter-spacing:3px;font-family:'El Messiri',Cairo,serif;">الغرفة</div>
        <div style="font-size:60pt;font-weight:700;color:#fff;line-height:1;font-family:${NUMFONT};">${roomNo}</div>
        <div style="font-size:10.5pt;font-weight:700;color:rgba(255,255,255,.9);background:rgba(255,255,255,.15);padding:2px 12px;border-radius:99px;font-family:Cairo,sans-serif;">${roomFloor}</div>
        ${(busName || minaName) ? `
        <div style="width:62%;height:1px;background:rgba(240,200,74,.35);margin:9px 0 7px;"></div>
        <div style="font-size:19pt;font-weight:700;color:#F0C84A;font-family:${NUMFONT};display:flex;gap:11px;align-items:center;line-height:1.1;">
          ${busName ? `<span>باص ${busName}</span>` : ""}
          ${busName && minaName ? `<span style="color:rgba(255,255,255,.35);font-size:18pt;font-weight:400;">·</span>` : ""}
          ${minaName ? `<span>منى ${minaName}</span>` : ""}
        </div>` : ""}
      </div>
    </div>`;
  return `<div style="width:210mm;height:297mm;background:#fff;display:block;font-family:Cairo,sans-serif;direction:rtl;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;" data-page="sticker">${stk()}${stk()}${stk()}</div>`;
}

/* بناء صفحة تاج اليد (3 شرائط رأسية) */
export function buildHandTagPageHTML(p: StickerPassenger, cfg: StickerConfig, meta: StickerMeta): string {
  const primaryColor = cfg.color_primary || "#7D1F3C";
  const accentColor  = cfg.color_accent  || "#D4A017";
  const companyName  = cfg.name_ar || "";
  const room = meta.rooms.find(r => r.id === p.room_id);
  const bus  = meta.buses.find(b => b.id === p.bus_id);
  const roomNo    = room?.number || "—";
  const roomFloor = room?.floor ? `الدور ${room.floor}` : "";
  const busName   = bus?.name || "";
  const handShort = p.short_ar || p.name_ar || "";
  const hotelName = cfg.hotel_name || companyName;
  const hotelAddr = cfg.hotel_address || "";
  const minaName  = meta.camps.find(c => c.id === p.camp_mina_id)?.name || "";
  const NUMFONT_H = "'El Messiri',Cairo,serif";
  const phoneLines = String(cfg.admin_phone || "").split(/[،,\/|]+/).map(t => t.trim()).filter(Boolean);
  const logoEl = cfg.logo_url
    ? `<img src="${cfg.logo_url}" style="width:132px;height:132px;object-fit:contain;border-radius:50%;border:3.5px solid ${accentColor};background:#F8F2E4;padding:4px;" />`
    : `<div style="width:132px;height:132px;border-radius:50%;border:3.5px solid ${accentColor};display:flex;align-items:center;justify-content:center;background:#F8F2E4;"><svg width="62" height="62" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.4"><path d="M12 2l2.4 4.8L19.5 8l-3.5 4 .7 5.5L12 15l-4.7 2.5.7-5.5-3.5-4 5.1-1.2z"/></svg></div>`;
  const strip = () => `
    <div style="width:70mm;height:297mm;border-left:2px dashed #E8D5C4;position:relative;overflow:hidden;background:#fff;box-sizing:border-box;flex-shrink:0;">
      <div style="position:absolute;inset:5px;border:2px solid ${primaryColor};border-radius:8px;pointer-events:none;z-index:2;"></div>
      <div style="position:absolute;inset:8px;border:1px solid ${accentColor};border-radius:5px;opacity:.55;pointer-events:none;z-index:2;"></div>
      <div style="position:absolute;width:297mm;height:70mm;top:113.5mm;left:-113.5mm;transform:rotate(-90deg);transform-origin:center center;display:flex;flex-direction:row;align-items:stretch;direction:rtl;">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:12px 16px;flex-shrink:0;min-width:95mm;">
          <div style="font-size:19px;font-weight:700;color:#8a6a10;letter-spacing:4px;font-family:${NUMFONT_H};">الغرفة</div>
          <div style="font-size:104px;font-weight:700;color:${primaryColor};line-height:1;font-family:${NUMFONT_H};">${roomNo}</div>
          ${roomFloor ? `<div style="font-size:13px;font-weight:800;color:#241318;background:rgba(125,31,60,.08);border-radius:99px;padding:3px 16px;white-space:nowrap;font-family:Cairo,sans-serif;">${roomFloor}</div>` : ""}
          ${(busName || minaName) ? `
          <div style="width:55%;height:1.5px;background:${accentColor};opacity:.4;margin:8px 0 6px;"></div>
          <div style="font-size:26px;font-weight:700;color:${primaryColor};font-family:${NUMFONT_H};display:flex;gap:12px;align-items:center;white-space:nowrap;">
            ${busName ? `<span>باص ${busName}</span>` : ""}
            ${busName && minaName ? `<span style="color:${accentColor};font-size:24px;font-weight:400;">·</span>` : ""}
            ${minaName ? `<span>منى ${minaName}</span>` : ""}
          </div>` : ""}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:14px 14px;border-left:2px solid #E8D5C4;border-right:2px solid #E8D5C4;background:#F8F2E4;">
          <div style="font-size:32px;font-weight:900;color:#241318;text-align:center;line-height:1.2;white-space:nowrap;font-family:Cairo,sans-serif;">${handShort}</div>
          ${p.name_en ? `<div style="font-size:13px;font-weight:600;color:#7A6570;direction:ltr;text-align:center;white-space:nowrap;font-family:Arial,sans-serif;margin-top:-5px;">${p.name_en}</div>` : ""}
          <div style="width:80%;height:1.5px;background:linear-gradient(90deg,transparent,${accentColor},transparent);"></div>
          ${p.phone ? `<div style="font-size:18px;font-weight:800;color:#241318;direction:ltr;text-align:center;white-space:nowrap;font-family:Arial,sans-serif;">${p.phone}</div>` : ""}
          <div style="font-size:24px;font-weight:800;color:#241318;text-align:center;white-space:nowrap;font-family:Cairo,sans-serif;">${hotelName}</div>
          ${hotelAddr ? `<div style="font-size:15px;font-weight:600;color:#7A6570;text-align:center;white-space:nowrap;font-family:Cairo,sans-serif;margin-top:-4px;">${hotelAddr}</div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;padding:12px 12px;flex-shrink:0;min-width:82mm;">
          ${logoEl}
          <div style="font-family:${NUMFONT_H};font-size:40px;font-weight:700;color:${primaryColor};text-align:center;line-height:1.1;white-space:nowrap;">${companyName}</div>
          ${(phoneLines.length || cfg.season_label) ? `
          <div style="display:flex;align-items:center;gap:10px;justify-content:center;white-space:nowrap;padding-top:3px;border-top:1.5px solid rgba(212,160,23,.35);width:82%;justify-content:center;margin-top:2px;">
            ${phoneLines.length ? `<span style="font-size:15px;font-weight:800;color:#241318;direction:ltr;font-family:Arial,sans-serif;">${phoneLines.join(" · ")}</span>` : ""}
            ${phoneLines.length && cfg.season_label ? `<span style="color:${accentColor};font-size:13px;">•</span>` : ""}
            ${cfg.season_label ? `<span style="font-size:14px;font-weight:700;color:#8a6a10;font-family:Cairo,sans-serif;">${cfg.season_label}</span>` : ""}
          </div>` : ""}
        </div>
      </div>
    </div>`;
  return `<div style="width:210mm;height:297mm;background:#fff;display:flex;flex-direction:row;font-family:Cairo,sans-serif;direction:rtl;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact;" data-page="hand">${strip()}${strip()}${strip()}</div>`;
}

/* بناء صفحة التاج المعلق (4 تاجات 2×2) */
export function buildLongTagPageHTML(p: StickerPassenger, cfg: StickerConfig, meta: StickerMeta): string {
  const primaryColor = cfg.color_primary || "#7D1F3C";
  const companyName  = cfg.name_ar || "";
  const room = meta.rooms.find(r => r.id === p.room_id);
  const bus  = meta.buses.find(b => b.id === p.bus_id);
  const roomNo    = room?.number || "—";
  const roomFloor = room?.floor ? `الدور ${room.floor}` : "";
  const busName   = bus?.name || "";
  const shortName = p.short_ar || p.name_ar || "";
  const hotelName = cfg.hotel_name || companyName;
  const minaName  = meta.camps.find(c => c.id === p.camp_mina_id)?.name || "";
  const logoEl = cfg.logo_url
    ? `<img src="${cfg.logo_url}" style="width:90pt;height:90pt;object-fit:contain;border-radius:50%;border:2.5px solid #F0C84A;background:rgba(240,200,74,.12);" />`
    : `<div style="width:90pt;height:90pt;border-radius:50%;border:2.5px solid #F0C84A;display:flex;align-items:center;justify-content:center;background:rgba(240,200,74,.12);"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F0C84A" stroke-width="1.5"><path d="M12 2l2.4 4.8L19.5 8l-3.5 4 .7 5.5L12 15l-4.7 2.5.7-5.5-3.5-4 5.1-1.2z"/></svg></div>`;
  const patBg2 = `url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22 viewBox=%220 0 64 64%22%3E%3Cg fill=%22none%22 stroke=%22%237D1F3C%22 stroke-width=%221%22%3E%3Cpath d=%22M32 8l6 12 13 2.5-9 10.5 2 14-12-6-12 6 2-14-9-10.5L26 20z%22/%3E%3C/g%3E%3C/svg%3E')`;
  const tag = () => `
    <div style="width:89.3mm;height:125.8mm;box-sizing:border-box;border-radius:6.8pt;overflow:hidden;position:relative;background:#fff;display:flex;flex-direction:column;page-break-inside:avoid;break-inside:avoid;box-shadow:0 0 0 1px #E8D5C4;margin:3mm;">
      <div style="position:absolute;top:8.5pt;left:50%;transform:translateX(-50%);width:31pt;height:11pt;border-radius:99px;background:#241318;z-index:5;"></div>
      <div style="background:linear-gradient(135deg,${primaryColor},#3d0f1f);color:#fff;padding:4pt 9pt 7pt;text-align:center;position:relative;flex-shrink:0;">
        <div style="display:flex;justify-content:center;margin-top:17pt;margin-bottom:2pt;">${logoEl}</div>
        <div style="font-family:'El Messiri',Cairo,sans-serif;font-size:17pt;font-weight:700;line-height:1;">${companyName}</div>
        <div style="font-size:8pt;color:#F0C84A;font-weight:700;margin-top:0;">${cfg.season_label || ""}</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;position:relative;">
        <div style="position:absolute;inset:0;opacity:.05;background-image:${patBg2};pointer-events:none;"></div>
        <div style="font-size:11pt;font-weight:800;color:#8a6a10;font-family:Cairo,sans-serif;position:relative;line-height:1;">الغرفة</div>
        <div style="font-family:Impact,Arial Black,sans-serif;font-size:98pt;font-weight:900;color:${primaryColor};line-height:0.9;position:relative;">${roomNo}</div>
        <div style="font-size:11pt;font-weight:800;color:#241318;font-family:Cairo,sans-serif;position:relative;line-height:1;margin-top:2pt;">${roomFloor}</div>
      </div>
      <div style="background:#F8F2E4;border-top:2px solid ${cfg.color_accent || "#D4A017"};padding:8pt 12pt;text-align:center;flex-shrink:0;">
        <div style="font-family:Cairo,sans-serif;font-size:12pt;font-weight:700;color:#8a6a10;margin-bottom:2pt;">${hotelName}</div>
        <div style="font-family:Cairo,sans-serif;font-size:13.5pt;font-weight:900;color:#241318;line-height:1.1;">${shortName}</div>
        ${p.name_en ? `<div style="font-size:8.5pt;font-weight:600;color:#7A6570;direction:ltr;margin-top:1pt;line-height:1;">${p.name_en}</div>` : ""}
        <div style="display:flex;justify-content:center;gap:10pt;margin-top:4pt;font-size:9pt;font-weight:700;color:#8a6a10;flex-wrap:wrap;">
          ${busName ? `<span>باص ${busName}</span>` : ""}
          ${minaName ? `<span>منى ${minaName}</span>` : ""}
        </div>
      </div>
    </div>`;
  return `<div style="width:210mm;height:297mm;background:#fff;display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:center;align-items:flex-start;gap:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:Cairo,sans-serif;direction:rtl;" data-page="long">${tag()}${tag()}${tag()}${tag()}</div>`;
}

/* المولّد الكامل — يجمع الأنواع المطلوبة ويرجّع HTML جاهز للطباعة */
export function buildStickersHTML(passengers: StickerPassenger[], cfg: StickerConfig, meta: StickerMeta, types: StickerTypes = { sticker: true, hand_tag: true, long_tag: true }): string {
  let body = "";
  for (const p of passengers) {
    if (types.sticker)  body += buildStickerPageHTML(p, cfg, meta);
    if (types.hand_tag) body += buildHandTagPageHTML(p, cfg, meta);
    if (types.long_tag) body += buildLongTagPageHTML(p, cfg, meta);
  }
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800;900&family=El+Messiri:wght@600;700&display=swap" rel="stylesheet"><style>@page{size:A4;margin:0}body{margin:0;padding:0}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}</style></head><body>${body}</body></html>`;
}
