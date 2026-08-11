import { useSignedDoc, DOC_TTL } from "../utils";

/* ═══════════════════════════════════════════════════════════════
   عارض مستند — س٦ / الخطوة ١

   المستند لا يُعرض برابط مخزَّن بعد اليوم: القيمة في القاعدة مفتاحُ
   كائن، والرابط يُوقَّع عند العرض ويموت بعد خمس دقائق. ولهذا يمرّ
   كل `<img>` لمستند من هنا — فيوم تصير الحاوية خاصّة لا يتغيّر شيء
   في الشاشات.
   ═══════════════════════════════════════════════════════════════ */

type Props = {
  /** مفتاح الكائن أو رابط عامّ قديم — كلاهما مقبول */
  value: string | null | undefined;
  alt?: string;
  style?: React.CSSProperties;
  ttlSeconds?: number;
  /** ما يُعرض ريثما يُوقَّع الرابط أو إذا تعذّر */
  fallback?: React.ReactNode;
};

export function DocImage({ value, alt = "", style, ttlSeconds = DOC_TTL.view, fallback = null }: Props) {
  const src = useSignedDoc(value, ttlSeconds);
  if (!src) return <>{fallback}</>;
  return <img src={src} alt={alt} style={style} />;
}
