// ============================================================
// تحميلُ الختم والتوقيع للطباعة — رابطٌ موقَّع، ثم تحميلٌ وفكّ، ثم طباعة
// ============================================================
/* الأصلان خاصّان في `company-private`، والمخزَّنُ منهما مفتاحُ كائنٍ لا رابط.
   فيُوقَّعان هنا لحظةَ الطباعة بالمسار القائم نفسه (`signedPrivateCompanyUrl`)
   — لا حاويةَ تُفتح ولا سياسةَ تُوسَّع — ثم تُحمَّل الصورةُ وتُفكّ قبل بناء
   المستند، فيُعرَف مقاسُها الطبيعيّ وتصل جاهزةً إلى `printInPage`.

   ⚠️ ولا طباعةَ ناقصةً بصمت: إن طُلب الختمُ أو التوقيعُ فتعذّر (لم يُرفع،
   أو لا يملك الموظّفُ صلاحيةَ قراءته، أو فشل التحميل) أُبلغ الموظّفُ ولم
   يُطبع شيء. وقراءتُهما اليوم لـ`manage_users` (الحاويةُ كلُّها) و`manage_payments`
   (الختمُ والتوقيع وحدهما) — الترحيلة 20260926092000.

   ولا يُسجَّل رابطٌ موقَّعٌ في سجلٍّ ولا رسالة. */
import { useCallback, useMemo } from "react";
import { useCompanyAssets } from "./CompanyContext";
import type { CompanyAsset } from "./types";
import { signedPrivateCompanyUrl } from "../utils";
import type { PrintSeals, SealImage, PrintReportKey, PrintOptionsState } from "../print";
import { trimSealImage } from "./sealTrim";
import { requestedSeals, effectiveOptions } from "../print";

export type SealRequest = { stamp: boolean; signature: boolean };
type Assets = Partial<Record<string, CompanyAsset>>;
export type SealLoadResult = { ok: true; seals: PrintSeals } | { ok: false; message: string };

/** أقصى انتظارٍ لتحميل صورةٍ واحدة وفكِّها. */
const LOAD_CAP_MS = 15_000;

const NAMES = { stamp: "ختم الشركة", signature: "التوقيع المعتمد" } as const;
const ASSET_KEY = { stamp: "company_stamp", signature: "manager_signature" } as const;

/** يحمّل الصورةَ ويفكّها ويقصّ حشوَها، ويعيد أبعادَها — أو null إن تعذّرت. */
export async function loadImage(url: string, capMs = LOAD_CAP_MS): Promise<SealImage | null> {
  const raw = await loadRawImage(url, capMs);
  if (!raw) return null;
  try {
    const cut = await Promise.race([trimSealImage(url), new Promise<null>(r => setTimeout(() => r(null), capMs))]);
    if (!cut) return raw;
    return (await loadRawImage(cut.url, capMs)) ? cut : raw;
  } catch {
    return raw;
  }
}

function loadRawImage(url: string, capMs: number): Promise<SealImage | null> {
  return new Promise(resolve => {
    const img = new Image();
    let settled = false;
    const done = (v: SealImage | null) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done(null), capMs);
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.onload = () => {
      const finish = () => {
        clearTimeout(timer);
        done(img.naturalWidth > 0 && img.naturalHeight > 0
          ? { url, width: img.naturalWidth, height: img.naturalHeight } : null);
      };
      if (typeof img.decode === "function") img.decode().then(finish, finish); else finish();
    };
    img.src = url;
  });
}

/** يوقّع ما طُلب ويحمّله. والفشلُ برسالةٍ تسمّي الأصلَ وسببَه. */
export async function loadPrintSeals(
  assets: Assets, req: SealRequest,
  deps: { sign: (key: string) => Promise<string>; load: (url: string) => Promise<SealImage | null> } =
    { sign: k => signedPrivateCompanyUrl(k), load: loadImage },
): Promise<SealLoadResult> {
  const seals: PrintSeals = {};
  for (const which of ["stamp", "signature"] as const) {
    if (!req[which]) continue;
    const key = assets[ASSET_KEY[which]]?.url;
    if (!key) return { ok: false, message: `لم يُرفع ${NAMES[which]} في الإعدادات.` };
    const url = await deps.sign(key);
    if (!url) return { ok: false, message: `تعذّر الوصول إلى ${NAMES[which]} — قد لا تملك صلاحية عرضه.` };
    const img = await deps.load(url);
    if (!img) return { ok: false, message: `تعذّر تحميل صورة ${NAMES[which]}.` };
    seals[which] = img;
  }
  return { ok: true, seals };
}

/** ما لا يمكن طلبُه أصلاً في هذه الحملة — سببٌ يُعرَض بجوار الخيار المعطَّل. */
export function sealUnavailability(assets: Assets): Partial<Record<"stamp" | "signature", string>> {
  return {
    ...(assets.company_stamp ? {} : { stamp: "لم يُرفع ختمُ الشركة في الإعدادات." }),
    ...(assets.manager_signature ? {} : { signature: "لم يُرفع التوقيعُ المعتمد في الإعدادات." }),
  };
}

/** خطّافُ الصفحات: `resolve` تُعيد الصورَ المطلوبة، أو null بعد إبلاغ الموظّف
 *  (فلا يُطبع شيء)؛ و`unavailable` أسبابُ تعطيل الخيارين في القائمة. */
export function usePrintSeals(showAlert: (type: "error", message: string) => void) {
  const assets = useCompanyAssets() as Assets;
  const unavailable = useMemo(() => sealUnavailability(assets), [assets]);
  const resolve = useCallback(async (req: SealRequest): Promise<PrintSeals | null> => {
    if (!req.stamp && !req.signature) return {};
    const r = await loadPrintSeals(assets, req);
    if (!r.ok) { showAlert("error", `${r.message} لم يُطبع شيء.`); return null; }
    return r.seals;
  }, [assets, showAlert]);
  /** الصورُ التي طلبها الموظّفُ لهذا التقرير — والمعطَّلُ (لم يُرفع) لا يُطلَب. */
  const sealsFor = useCallback((key: PrintReportKey, opts: PrintOptionsState) =>
    resolve(requestedSeals(key, effectiveOptions(opts, unavailable))), [resolve, unavailable]);
  return { resolve, sealsFor, unavailable };
}
