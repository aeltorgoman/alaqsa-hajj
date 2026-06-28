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

// وقت نسبي (منذ X) — يُستخدم لعرض وقت إضافة الحاج في "آخر المضافين"
export function timeAgo(isoString?: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "الآن";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `منذ ${diffDay} يوم`;
  const diffMonth = Math.floor(diffDay / 30);
  return `منذ ${diffMonth} شهر`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function scanDocument(file: File, mode: "passport" | "idcard" | "hajj_permit" | "auto"): Promise<any> {
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
  noHeader = false,
  patternOpacity = 0.08
) {
  const initial = (companyName || "ح").trim().charAt(0);
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="logo" />`
    : `<span>${initial}</span>`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  // نقشة إسلامية (Girih) متشابكة بخطوط ذهبية أوضح (حوالي 5 نقشات في الصف)
  const patternSVG = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 400.133262 400.311513'><g transform='translate(0.037827,400.180592) scale(0.1,-0.1)' fill='#C9A876' fill-opacity='${patternOpacity}' stroke='none'><path d="M136 3956 c30 -53 103 -103 332 -225 l22 -12 0 141 0 140 -189 0 -190 0 25 -44z"/><path d="M691 3960 c13 -22 27 -40 33 -40 14 0 280 71 285 76 2 2 -73 4 -168 4 l-172 0 22 -40z"/><path d="M1322 3961 l-133 -37 -151 -151 -151 -151 58 -100 57 -101 103 -60 103 -59 156 157 c86 87 156 165 156 175 0 10 20 93 45 185 25 92 45 170 45 174 0 21 -163 2 -288 -32z"/><path d="M1720 3958 c-7 -24 -20 -74 -31 -113 -10 -38 -19 -72 -19 -75 0 -2 50 45 110 105 131 131 130 125 30 125 l-79 0 -11 -42z"/><path d="M2044 3979 l-21 -21 38 -145 c21 -80 40 -150 42 -156 1 -5 22 59 44 144 l41 154 -21 23 c-28 30 -94 31 -123 1z"/><path d="M2420 3885 c63 -63 115 -113 117 -112 2 3 -36 155 -53 210 -5 14 -18 17 -92 17 l-87 0 115 -115z"/><path d="M2603 3978 c4 -13 28 -103 54 -200 l47 -177 151 -150 150 -149 103 60 102 60 57 100 56 100 -153 153 -152 153 -142 36 c-175 45 -282 50 -273 14z"/><path d="M3201 3996 c5 -5 273 -76 286 -76 5 0 19 18 32 40 l22 40 -172 0 c-95 0 -170 -2 -168 -4z"/><path d="M3720 3867 c0 -74 3 -136 6 -139 3 -3 65 29 137 71 l132 77 3 62 3 62 -141 0 -140 0 0 -133z"/><path d="M601 3769 l-1 -117 92 -53 c51 -30 97 -56 102 -58 5 -2 -4 20 -20 48 l-28 52 109 109 c61 61 105 110 100 110 -6 0 -73 -18 -150 -39 l-140 -39 -22 37 c-12 20 -26 43 -32 51 -7 10 -10 -21 -10 -101z"/><path d="M3577 3831 l-27 -49 -112 30 c-62 17 -130 36 -150 43 -54 18 -50 11 67 -105 117 -117 115 -111 79 -163 -36 -54 -31 -53 79 10 l97 55 0 114 c0 132 1 129 -33 65z"/><path d="M0 3642 l0 -227 101 101 100 100 -59 103 c-48 83 -67 107 -101 126 l-41 24 0 -227z"/><path d="M1762 3697 c-89 -89 -162 -168 -162 -175 0 -8 -23 -97 -50 -199 -28 -102 -49 -188 -46 -190 2 -3 50 -31 105 -63 l100 -57 114 5 115 5 55 203 55 203 -58 211 c-32 116 -60 213 -62 215 -2 2 -77 -69 -166 -158z"/><path d="M2276 3844 c-17 -56 -107 -401 -108 -414 -1 -8 23 -104 52 -212 l54 -198 122 0 121 0 97 57 c53 31 96 59 96 62 0 3 -25 96 -55 205 l-54 200 -159 159 c-130 130 -161 156 -166 141z"/><path d="M290 3695 c0 -3 12 -27 26 -52 l27 -45 -109 -109 c-60 -60 -105 -109 -102 -109 4 0 66 16 137 35 162 44 154 45 190 -17 l31 -53 0 120 0 121 -62 36 c-35 19 -80 46 -100 58 -21 12 -38 19 -38 15z"/><path d="M3818 3643 l-98 -56 0 -113 c0 -131 -1 -129 38 -65 l31 49 78 -22 c141 -41 133 -41 133 -4 0 27 -12 45 -67 100 l-67 67 32 51 c38 61 39 61 -80 -7z"/><path d="M600 3336 l0 -186 88 -151 c49 -83 93 -151 98 -152 5 0 31 38 59 86 l49 87 104 0 c57 0 102 4 100 8 -1 4 -43 76 -91 159 l-88 151 -122 70 c-67 38 -139 79 -159 92 l-38 22 0 -186z"/><path d="M3447 3427 l-158 -92 -89 -155 c-49 -85 -90 -157 -90 -160 0 -3 46 -4 103 -2 l104 4 49 -87 c27 -48 54 -87 59 -87 5 0 48 68 97 152 l88 152 -2 184 -3 183 -158 -92z"/><path d="M1335 3270 l-109 -109 -55 32 c-54 30 -56 31 -40 7 9 -14 35 -59 58 -101 l41 -76 118 -5 c139 -6 136 -7 73 29 -28 15 -51 32 -51 37 0 10 66 254 75 279 11 28 5 23 -110 -93z"/><path d="M2770 3365 c0 -6 16 -68 35 -140 43 -160 44 -145 -13 -177 l-47 -27 90 -1 c50 0 100 -3 112 -6 19 -5 108 121 142 199 2 5 -21 -5 -50 -22 l-54 -31 -107 108 c-60 58 -108 102 -108 97z"/><path d="M172 3272 l-172 -46 2 -216 3 -215 45 -8 c38 -7 74 0 240 46 l195 53 3 117 3 117 -50 82 c-27 46 -53 91 -56 101 -9 23 -15 22 -213 -31z"/><path d="M3817 3283 c-13 -21 -40 -68 -61 -105 l-37 -66 3 -113 3 -112 138 -37 137 -37 -2 235 -3 235 -65 18 c-87 24 -86 24 -113 -18z"/><path d="M2064 3053 l-39 -148 -58 0 c-73 0 -73 0 40 -66 l96 -55 100 55 99 56 -58 5 -58 5 -37 144 c-21 79 -40 145 -42 147 -2 2 -21 -62 -43 -143z"/><path d="M600 2862 c0 -70 15 -60 -170 -108 -58 -15 -109 -30 -113 -34 -4 -4 57 -24 137 -45 l145 -38 3 -59 3 -59 58 99 57 100 -56 98 c-31 55 -58 101 -60 103 -2 2 -4 -23 -4 -57z"/><path d="M1473 2903 l-171 -3 54 -90 54 -90 -50 -88 c-28 -49 -50 -91 -50 -95 0 -4 81 -7 180 -7 l181 0 82 49 c45 27 117 69 160 94 l79 45 -69 40 c-205 118 -265 152 -271 150 -4 -1 -84 -4 -179 -5z"/><path d="M3036 2890 c-21 -25 -96 -158 -96 -171 0 -6 23 -52 51 -101 l51 -89 106 3 106 3 53 92 53 92 -53 90 -52 90 -103 3 c-82 2 -106 0 -116 -12z"/><path d="M3548 2817 l-57 -98 57 -102 57 -102 3 61 3 62 117 31 c64 17 132 34 151 37 42 9 31 15 -79 43 -47 13 -108 29 -137 37 l-52 15 -3 57 -3 57 -57 -98z"/><path d="M903 2809 l-53 -91 56 -94 55 -95 106 3 105 3 53 91 52 91 -51 91 -51 92 -110 0 -110 0 -52 -91z"/><path d="M2372 2808 l-153 -91 163 -93 163 -94 183 0 183 0 -28 48 c-15 26 -39 67 -54 91 -31 51 -32 45 36 158 19 32 35 61 35 66 0 4 -84 7 -187 6 l-188 -1 -153 -90z"/><path d="M28 2648 l-28 -10 0 -213 c0 -195 2 -214 17 -219 10 -3 88 -23 173 -46 85 -22 160 -43 167 -45 7 -2 39 42 72 100 l61 103 0 116 0 115 -37 10 c-21 5 -115 30 -209 55 -186 50 -177 49 -216 34z"/><path d="M2008 2597 c-112 -67 -112 -67 -42 -67 l60 0 33 -132 c19 -73 37 -139 41 -147 6 -11 58 157 76 247 6 30 8 31 68 34 l61 3 -97 58 c-115 68 -93 67 -200 4z"/><path d="M3875 2591 c-55 -15 -112 -31 -127 -35 l-28 -6 0 -115 0 -116 60 -103 61 -104 79 21 80 21 0 233 c0 180 -3 233 -12 232 -7 0 -58 -13 -113 -28z"/><path d="M691 2441 l-91 -159 0 -181 c0 -100 2 -181 5 -181 3 0 76 41 163 91 l157 92 85 149 c47 82 87 154 88 159 2 5 -42 9 -101 9 l-105 0 -52 90 c-28 50 -53 90 -54 90 -2 0 -44 -72 -95 -159z"/><path d="M3371 2510 l-52 -90 -105 0 c-57 0 -104 -2 -104 -5 0 -7 168 -295 182 -312 8 -10 281 -170 310 -181 4 -2 8 79 8 181 l0 184 -86 149 c-48 82 -90 153 -94 157 -4 4 -30 -33 -59 -83z"/><path d="M1178 2320 c-31 -55 -55 -100 -52 -100 2 0 26 12 54 28 l50 27 107 -107 c58 -60 107 -108 108 -108 1 0 -16 64 -37 142 -21 78 -38 146 -38 149 0 4 24 21 53 38 l52 31 -120 -1 -120 0 -57 -99z"/><path d="M1605 2365 c-49 -30 -93 -56 -98 -58 -5 -1 16 -95 47 -209 l55 -206 156 -153 c86 -85 159 -154 163 -154 3 0 31 96 62 213 l57 213 -56 204 -55 205 -121 -1 -120 0 -90 -54z"/><path d="M2220 2218 c-64 -238 -64 -186 4 -436 31 -111 56 -205 56 -207 0 -3 73 69 162 161 l163 166 53 200 c29 110 52 201 50 202 -2 1 -47 28 -102 59 l-99 57 -116 0 -117 0 -54 -202z"/><path d="M2750 2416 c0 -2 20 -16 45 -30 54 -32 53 -19 6 -188 -21 -76 -37 -138 -36 -138 1 0 50 48 108 108 l107 107 50 -27 c28 -16 52 -28 54 -28 3 0 -21 45 -52 100 l-57 100 -112 0 c-62 0 -113 -2 -113 -4z"/><path d="M1097 2071 l-98 -58 -54 -98 c-30 -55 -55 -102 -55 -105 0 -15 310 -310 325 -310 10 0 103 -23 208 -51 104 -28 191 -48 194 -46 2 3 -21 101 -53 219 l-57 213 -151 147 c-83 81 -153 147 -156 147 -3 0 -49 -27 -103 -58z"/><path d="M2852 1977 l-154 -154 -49 -189 c-70 -268 -66 -246 -37 -235 14 5 113 33 219 61 l194 52 148 146 c81 81 147 150 147 155 0 35 -119 211 -155 229 -22 11 -65 36 -96 54 -31 19 -58 34 -60 34 -3 0 -73 -69 -157 -153z"/><path d="M463 2045 c-12 -22 -26 -46 -31 -53 -8 -11 -183 28 -289 65 -10 3 30 -43 89 -103 122 -124 116 -111 82 -165 -14 -23 -23 -43 -21 -45 4 -4 174 90 190 105 4 4 6 59 5 122 l-3 114 -22 -40z"/><path d="M3720 1966 l0 -114 96 -56 c109 -64 116 -65 80 -7 -34 53 -36 49 39 120 54 52 65 68 65 95 l0 33 -106 -29 c-59 -16 -108 -27 -109 -26 -1 2 -14 24 -29 51 -37 62 -36 64 -36 -67z"/><path d="M0 1789 l0 -221 43 25 c34 20 54 45 101 126 l58 102 -93 94 c-52 52 -97 95 -101 95 -5 0 -8 -99 -8 -221z"/><path d="M698 1841 l-97 -56 -1 -120 0 -120 30 53 c17 28 34 52 38 52 8 0 248 -65 277 -76 11 -4 -28 42 -87 102 -122 124 -118 114 -78 177 36 58 37 58 -82 -12z"/><path d="M3411 1895 c3 -6 16 -32 29 -58 l25 -48 -108 -106 c-59 -59 -106 -107 -105 -108 2 -1 57 13 123 31 189 53 169 53 204 -7 l30 -53 3 117 3 117 -80 47 c-44 25 -91 53 -104 62 -13 8 -22 11 -20 6z"/><path d="M2068 1647 c-20 -72 -39 -139 -42 -147 -4 -10 9 -30 36 -57 l43 -42 42 37 43 37 -40 149 c-21 82 -41 150 -43 152 -2 2 -20 -56 -39 -129z"/><path d="M312 1617 l-153 -92 -79 -142 c-103 -182 -104 -173 20 -173 93 0 100 -1 111 -22 6 -13 30 -54 51 -91 l40 -69 94 163 94 162 0 178 c0 137 -3 179 -12 178 -7 0 -82 -42 -166 -92z"/><path d="M3720 1532 c0 -150 3 -182 18 -208 132 -233 168 -293 172 -294 3 0 24 36 48 80 l42 80 0 184 0 184 -132 76 c-72 42 -135 76 -140 76 -4 0 -8 -80 -8 -178z"/><path d="M1670 1670 c0 -12 79 -303 83 -307 6 -5 111 -33 112 -30 1 1 8 25 16 53 l16 51 -113 119 c-63 65 -114 117 -114 114z"/><path d="M2427 1553 c-118 -115 -118 -116 -87 -198 8 -22 91 -17 114 6 7 7 87 292 83 295 -1 2 -51 -45 -110 -103z"/><path d="M658 1418 l-58 -101 0 -119 c0 -65 3 -118 6 -118 3 0 98 -25 211 -55 112 -30 208 -53 213 -50 6 4 193 56 376 104 l41 11 -166 163 -166 164 -180 46 c-99 26 -189 49 -200 52 -17 4 -30 -12 -77 -97z"/><path d="M3279 1464 l-196 -53 -154 -156 c-162 -164 -171 -175 -144 -175 10 0 109 -25 221 -55 155 -42 208 -53 227 -46 13 5 103 31 201 57 l176 47 0 119 0 118 -57 100 c-32 55 -62 99 -68 99 -5 -1 -98 -25 -206 -55z"/><path d="M1360 1345 c0 -5 48 -56 106 -115 l106 -108 59 16 c44 12 58 20 55 32 -3 8 -10 33 -15 56 l-11 41 -135 37 c-74 20 -142 39 -150 42 -8 4 -15 3 -15 -1z"/><path d="M1973 1298 c-6 -29 -16 -65 -22 -80 l-10 -27 -68 20 c-76 21 -97 24 -88 9 7 -11 45 -144 42 -146 -1 0 -31 -9 -67 -18 -36 -9 -71 -19 -79 -22 -10 -3 3 -23 44 -64 l59 -60 -57 -58 -58 -59 58 -13 c32 -7 68 -16 79 -21 l22 -8 -19 -68 c-27 -96 -28 -94 42 -72 93 29 93 29 114 -48 10 -38 20 -72 23 -76 2 -5 30 16 61 47 l56 55 55 -54 c69 -68 63 -69 84 20 20 84 21 85 102 60 57 -17 88 -19 79 -5 -4 6 -15 40 -25 76 l-18 65 22 8 c11 5 47 14 79 21 70 16 70 14 0 77 l-58 52 59 60 c33 33 58 62 55 64 -2 1 -35 10 -73 20 -88 22 -83 15 -62 98 22 86 23 85 -63 61 -39 -11 -73 -17 -75 -14 -2 4 -12 36 -21 72 -9 36 -19 68 -21 72 -2 3 -27 -18 -56 -48 -62 -66 -59 -66 -125 1 -65 66 -57 66 -70 3z"/><path d="M2725 1316 c-66 -18 -132 -36 -146 -39 -22 -6 -29 -16 -38 -54 -16 -66 -16 -66 42 -86 l52 -17 115 115 c63 63 110 115 105 114 -6 0 -64 -15 -130 -33z"/><path d="M426 1016 c-42 -71 -56 -103 -50 -115 38 -75 100 -181 106 -181 4 0 8 26 10 57 l3 58 139 37 c76 20 140 39 142 41 3 2 -61 22 -140 43 l-145 38 -3 61 -3 60 -59 -99z"/><path d="M3720 1052 l0 -59 -146 -38 c-81 -21 -140 -41 -132 -45 7 -4 73 -22 146 -41 l132 -34 0 -58 c0 -72 5 -69 70 45 l53 93 -27 45 c-15 25 -39 69 -53 98 -35 67 -43 66 -43 -6z"/><path d="M0 915 l0 -185 64 0 65 0 54 92 54 92 -53 90 -53 91 -66 3 -65 3 0 -186z"/><path d="M1387 957 c-81 -22 -146 -41 -144 -43 1 -1 68 -21 147 -43 l145 -40 42 41 42 41 -36 41 c-46 51 -23 50 -196 3z"/><path d="M2633 958 l-41 -43 37 -42 38 -42 148 39 c81 21 149 41 151 43 2 2 -56 20 -129 39 -72 20 -139 39 -147 42 -10 4 -30 -9 -57 -36z"/><path d="M3984 932 c-9 -14 -8 -22 2 -37 13 -17 14 -16 14 18 0 42 -1 44 -16 19z"/><path d="M788 797 l-188 -51 0 -119 0 -118 57 -97 c31 -53 57 -98 59 -100 1 -2 95 21 209 51 l206 55 150 156 c82 85 151 158 152 162 3 10 -392 113 -428 112 -16 0 -114 -23 -217 -51z"/><path d="M2972 795 c-107 -29 -196 -55 -198 -57 -7 -8 317 -323 339 -330 66 -20 380 -99 382 -96 1 2 28 46 59 100 l56 96 0 119 0 119 -197 52 c-236 62 -203 63 -441 -3z"/><path d="M3813 636 l-93 -164 0 -174 c0 -96 2 -177 5 -180 3 -3 66 31 140 75 l135 80 0 185 0 185 -46 79 c-25 43 -47 78 -47 77 -1 0 -44 -74 -94 -163z"/><path d="M247 705 l-48 -85 -100 0 c-124 0 -123 7 -15 -180 l84 -145 158 -91 159 -91 3 181 2 182 -91 157 c-50 86 -94 157 -98 157 -3 0 -28 -38 -54 -85z"/><path d="M1466 593 c-64 -62 -114 -113 -111 -113 6 0 259 65 292 75 7 2 16 21 22 42 19 76 20 74 -35 92 l-51 17 -117 -113z"/><path d="M2575 688 c-16 -5 -35 -11 -42 -13 -11 -3 6 -98 20 -111 6 -6 290 -84 294 -81 1 2 -44 51 -101 110 -105 110 -114 114 -171 95z"/><path d="M1805 482 c-27 -8 -51 -15 -52 -16 -4 -3 -83 -299 -80 -302 2 -2 52 46 112 106 l108 109 -12 55 c-15 67 -14 66 -76 48z"/><path d="M2345 487 c-2 -7 -11 -32 -19 -57 l-15 -44 111 -113 c62 -62 113 -112 114 -110 2 1 -14 70 -36 152 l-38 150 -57 17 c-41 12 -57 13 -60 5z"/><path d="M1390 371 l-206 -57 -144 -148 c-80 -81 -146 -152 -148 -157 -2 -5 127 -9 307 -9 241 0 312 3 315 13 14 47 106 406 106 411 0 10 -15 6 -230 -53z"/><path d="M2064 390 l-42 -38 39 -147 c21 -81 40 -149 42 -152 2 -2 19 49 36 114 18 65 36 131 42 148 9 27 6 33 -33 72 l-43 42 -41 -39z"/><path d="M2590 424 c0 -3 25 -100 56 -215 l57 -209 308 0 c170 0 309 3 309 8 0 4 -69 76 -153 160 l-152 152 -210 55 c-232 61 -215 57 -215 49z"/><path d="M600 165 l0 -120 40 -22 c56 -33 123 -32 114 1 -5 20 10 38 100 122 59 54 102 100 98 102 -5 1 -68 -13 -139 -33 -162 -43 -147 -45 -183 18 l-30 52 0 -120z"/><path d="M3592 249 c-9 -17 -24 -41 -33 -52 l-17 -21 -147 41 -147 40 107 -107 c85 -86 107 -113 102 -129 -7 -29 58 -29 113 -1 l39 20 3 120 c3 134 4 132 -20 89z"/><path d="M0 131 l0 -131 100 0 c55 0 100 3 100 8 -3 35 -122 210 -159 230 l-41 23 0 -130z"/><path d="M1800 125 l-125 -125 162 0 161 0 -32 119 c-17 66 -34 122 -37 125 -3 3 -61 -51 -129 -119z"/><path d="M2275 238 c-2 -7 -17 -64 -33 -125 l-30 -113 162 0 161 0 -125 125 c-136 136 -129 130 -135 113z"/><path d="M290 86 c0 -40 53 -86 100 -86 64 0 63 1 -17 47 -81 45 -83 46 -83 39z"/><path d="M3848 52 c-89 -50 -90 -52 -27 -52 53 1 54 1 81 45 33 54 31 55 -54 7z"/></g></svg>`;
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
<link href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html { background-color: #ffffff; background-image: url("${patternURL}"); background-repeat: repeat; background-size: 140px 140px; }
  body { font-family: 'Tajawal', 'Arial', sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 9pt; color: #1c1c1c; background-color: #ffffff; background-image: url("${patternURL}"); background-repeat: repeat; background-size: 140px 140px; }
  .doc-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 8px; border-bottom: 2pt solid ${primaryColor}; margin-bottom: 4px; }
  .doc-header .brand { display: flex; align-items: center; gap: 10px; }
  .doc-header .logo-box { width: 22mm; height: 22mm; border-radius: 4mm; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${primaryColor}; color: #fff; font-size: 16pt; font-weight: 700; flex-shrink: 0; }
  .doc-header .logo-box img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .doc-header .company-name { font-size: 13pt; font-weight: 700; color: ${primaryColor}; }
  .doc-header .tagline { font-size: 8pt; color: #888; margin-top: 2px; }
  .doc-header .meta { text-align: left; font-size: 7pt; color: #999; line-height: 1.7; }
  .doc-title-bar { background: linear-gradient(135deg, ${primaryColor}, ${accentColor}); color: #fff; text-align: center; padding: 5pt 0; border-radius: 8pt; font-size: 14pt; font-weight: 700; margin: 8pt 0 10pt; }
  .camp-header { display: flex; align-items: center; justify-content: space-between; gap: 10pt; margin-bottom: 10pt; }
  .camp-header .camp-logo { width: 30mm; height: 30mm; border-radius: 50%; border: 3pt solid ${primaryColor}; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fff; flex-shrink: 0; }
  .camp-header .camp-logo img { width: 100%; height: 100%; object-fit: cover; }
  .camp-header .camp-logo span { font-size: 18pt; font-weight: 800; color: ${primaryColor}; }
  .camp-header .camp-title-box { flex: 1; text-align: center; }
  .camp-header .camp-title { display: inline-block; background: ${primaryColor}; color: #fff; padding: 6pt 20pt; border-radius: 5pt; font-size: 18pt; font-weight: 700; font-family: 'El Messiri', 'Tajawal', sans-serif; }
  .camp-header .camp-subtitle { font-size: 13pt; font-weight: 600; color: #a8852f; margin-top: 6pt; font-family: 'El Messiri', 'Tajawal', sans-serif; }
  .camp-table th { background: ${primaryColor}; color: #fff; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 8pt; border-radius: 6pt; overflow: hidden; }
  th { background: ${primaryColor}; color: #fff; padding: 5pt 7pt; text-align: right; font-size: 9pt; font-weight: 600; }
  td { border: 0.5pt solid rgba(0,0,0,0.12); padding: 5pt 7pt; text-align: right; background: transparent; font-size: 9pt; white-space: nowrap; }
  tr:nth-child(even) td { background: rgba(212,160,23,0.05); }
  .section-title { font-size: 10pt; font-weight: 700; color: ${primaryColor}; margin: 8pt 0 4pt; text-align: center; padding: 4pt; background: ${primaryColor}14; border-radius: 3pt; }
  .wide-table th, .wide-table td { font-size: 8pt; padding: 4pt 6pt; }
  .flight-table th, .flight-table td { font-size: 8pt; padding: 4pt 6pt; white-space: nowrap; }
  .ltr-table th, .ltr-table td { text-align: left; }
  .page-break { page-break-after: always; }
  .page-break-before { page-break-before: always; }
  .footer { text-align: center; color: #aaa; font-size: 7pt; margin-top: 10pt; border-top: 0.5pt solid #eee; padding-top: 5pt; }
  /* الألوان (الهيدر/الجداول/الشارات) تُطبع دائماً بغض النظر عن إعدادات المستخدم */
  /* أما خلفية النقشة على html/body فتُستثنى عمداً لتبقى خاضعة لتفضيل "خلفيات الصفحة" في حوار الطباعة */
  @media print { *:not(html):not(body) { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } }
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
    return `<table style="width:100%;margin:0 auto"><tr><th style="text-align:center;width:36px;font-size:12pt;padding:7pt">م</th><th style="font-size:12pt;padding:7pt">${nameLabel}</th></tr><tr><td style="font-size:12pt;padding:7pt"></td><td style="font-size:12pt;padding:7pt">لا يوجد مسافرون</td></tr></table>`;
  }

  // جدول معايرة حقيقي (عدد صفوف -> أقصى حجم خط آمن) تم اختباره بمحاكاة طباعة A4 فعلية
  // مطابقة 100% لبنية الجدول الفعلية، بقيم محافظة (أقل قيمة آمنة في كل نطاق) لضمان عدم الفيضان مطلقاً
  const FONT_CALIBRATION: [number, number][] = [[6, 17], [11, 17], [14, 14.5], [18, 11.5], [22, 11.5], [24, 10.5], [31, 10]];
  const calcSizes = (rowCount: number) => {
    let fontSize = FONT_CALIBRATION[FONT_CALIBRATION.length - 1][1];
    if (rowCount <= FONT_CALIBRATION[0][0]) {
      fontSize = FONT_CALIBRATION[0][1];
    } else if (rowCount >= FONT_CALIBRATION[FONT_CALIBRATION.length - 1][0]) {
      fontSize = FONT_CALIBRATION[FONT_CALIBRATION.length - 1][1];
    } else {
      for (let i = 0; i < FONT_CALIBRATION.length - 1; i++) {
        const [r1, f1] = FONT_CALIBRATION[i];
        const [r2, f2] = FONT_CALIBRATION[i + 1];
        if (rowCount >= r1 && rowCount <= r2) {
          const ratio = (rowCount - r1) / (r2 - r1);
          fontSize = Math.round((f1 + (f2 - f1) * ratio) * 2) / 2;
          break;
        }
      }
    }
    const padding = Math.round(fontSize * 0.55 * 10) / 10;
    return { fontSize, padding };
  };

  if (items.length <= 20) {
    const { fontSize, padding } = calcSizes(items.length + 1); // +1 لصف الهيدر
    const numSize = Math.max(10, fontSize - 1);
    const rows = items.map((p, i) => `<tr><td style="text-align:center;width:38px;font-size:${numSize}pt;padding:${padding}pt 6pt">${i + 1}</td><td style="font-size:${fontSize}pt;padding:${padding}pt 6pt;font-weight:600">${p.short_ar || p.name_ar}</td></tr>`).join("");
    return `<table style="width:100%;margin:0 auto"><tr><th style="text-align:center;width:38px;font-size:${numSize}pt;padding:${padding}pt 6pt">م</th><th style="font-size:${numSize}pt;padding:${padding}pt 6pt">${nameLabel}</th></tr>${rows}</table>`;
  }

  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);
  const maxRows = Math.max(col1.length, col2.length);
  const { fontSize, padding } = calcSizes(maxRows + 1); // +1 لصف الهيدر
  const numSize = Math.max(10, fontSize - 1);

  let rows = "";
  for (let i = 0; i < maxRows; i++) {
    const p1 = col1[i], p2 = col2[i];
    rows += `<tr>
      <td style="text-align:center;width:32px;font-size:${numSize}pt;padding:${padding}pt 4pt">${p1 ? i + 1 : ""}</td>
      <td style="font-size:${fontSize}pt;padding:${padding}pt 5pt;font-weight:600">${p1 ? (p1.short_ar || p1.name_ar) : ""}</td>
      <td style="text-align:center;width:32px;font-size:${numSize}pt;padding:${padding}pt 4pt;border-right:2px solid ${primaryColor}">${p2 ? half + i + 1 : ""}</td>
      <td style="font-size:${fontSize}pt;padding:${padding}pt 5pt;font-weight:600">${p2 ? (p2.short_ar || p2.name_ar) : ""}</td>
    </tr>`;
  }
  return `<table style="width:100%">
    <tr><th style="text-align:center;width:32px;font-size:${numSize}pt;padding:${padding}pt 4pt">م</th><th style="font-size:${numSize}pt;padding:${padding}pt 4pt">${nameLabel}</th><th style="text-align:center;width:32px;font-size:${numSize}pt;padding:${padding}pt 4pt">م</th><th style="font-size:${numSize}pt;padding:${padding}pt 4pt">${nameLabel}</th></tr>
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
export function makeFlightSectionHTML(flight: { name: string; type?: string; airline?: string; date?: string; time?: string; from_airport?: string; to_airport?: string }, fp: (NameItem & { nat?: string; passport?: string; phone?: string; gender?: string; flight_class?: string; services?: { flight?: string } })[], b: ReportBranding): string {
  const primaryColor = b.primaryColor || "#6B1F3A";
  const rows = fp.map((p, i) => {
    const wantsFirst = p.flight_class === "درجة أولى" || p.services?.flight === "درجة أولى";
    const cls = wantsFirst ? "درجة أولى" : "اقتصادية";
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
  <table class="flight-table"><tr><th style="text-align:center;width:30px">م</th><th>اسم الحاج / الحاجة</th><th>الجنسية</th><th>رقم الجواز</th><th>التليفون</th><th>الجنس</th><th>الدرجة</th></tr>${rows}</table>`;
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
  setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 1000);
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
  { key: "manage_passengers", label: "إدارة الحجاج (عرض، إضافة، تعديل، حذف)" },
  { key: "manage_buses", label: "إدارة الباصات" },
  { key: "manage_camps", label: "إدارة المخيمات" },
  { key: "manage_hotel", label: "إدارة الفندق" },
  { key: "view_reports", label: "التقارير (عرض، طباعة، تصدير)" },
  { key: "manage_users", label: "إدارة المستخدمين" },
  { key: "view_archive", label: "عرض الأرشيف" },
  { key: "manage_flights", label: "إدارة الطيران" },
  { key: "manage_payments", label: "إدارة الحسابات المالية" },
  { key: "manage_admins", label: "إدارة الإداريين" },
];

export const ROOM_TYPES = ["فردية", "ثنائية", "ثلاثية", "رباعية"] as const;
export const ROOM_COLORS: Record<string, [string, string]> = { "فردية": ["var(--info-bg)", "var(--info)"], "ثنائية": ["var(--male-bg)", "var(--info)"], "ثلاثية": ["#f3e8ff", "#6B21A8"], "رباعية": ["var(--success-bg)", "var(--primary-dark)"] };

// ============================================================
// أيقونات ملوّنة موحّدة (باصات/مخيمات/غرف/رحلات) — صفحات التنظيم وصفحة التقارير
// ============================================================
export const ICON_COLOR_CYCLE = ["#7D1F3C", "#0C447C", "#2A9D8F", "#E8951A", "#8B3A6B", "#5C7C2E", "#B5651D", "#3F51B5"];
export const VIP_ICON_COLOR = "#B5651D";
export const ROOM_ICON_COLORS: Record<string, string> = { "فردية": "#5C7C2E", "ثنائية": "#0C447C", "ثلاثية": "#6B21A8", "رباعية": "#2A9D8F", "فارغة": "#999999" };
export const FLIGHT_ICON_COLORS: Record<string, string> = { "ذهاب": "#0C447C", "إياب": "#8B3A6B" };

export const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "الرئيسية", perm: "" }] },
  { section: "التنظيم", items: [{ id: "passengers", label: "الحجاج", perm: "manage_passengers" }, { id: "buses", label: "الباصات", perm: "manage_buses" }, { id: "flights", label: "الطيران", perm: "manage_flights" }, { id: "mina", label: "مخيمات منى", perm: "manage_camps" }, { id: "arafa", label: "مخيمات عرفة", perm: "manage_camps" }, { id: "hotel", label: "الفندق", perm: "manage_hotel" }] },
  { section: "التقارير", items: [{ id: "reports", label: "التقارير", perm: "view_reports" }] },
  { section: "الأرشيف", items: [{ id: "archive", label: "الأرشيف", perm: "view_archive" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "الإعدادات", perm: "manage_users" }, { id: "finance", label: "الحسابات", perm: "manage_payments" }, { id: "admins", label: "الإداريون", perm: "manage_admins" }] },
];

export const NAV_ICONS: Record<string, string> = {
  dash:       '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  passengers: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  buses:      '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>',
  flights:    '<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
  mina:       '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  arafa:      '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  hotel:      '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/>',
  reports:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
  archive:    '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v11h16V9"/><path d="M10 13h4"/>',
  users:      '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  finance:    '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  admins:     '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
};

export const inp = { fontSize: 12, background: "var(--bg-input)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: "7px 10px", width: "100%", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" as const, color: "var(--text)" };
export const btnP = (extra?: any) => ({ background: "var(--primary)", color: "var(--text-inverse)", border: "none", padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", fontWeight: 500, fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
export const btnS = (extra?: any) => ({ background: "transparent", border: "0.5px solid var(--border)", padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)", fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
