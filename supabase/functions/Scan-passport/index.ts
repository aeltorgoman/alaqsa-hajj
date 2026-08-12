// ============================================================
// Scan-passport — استخراج بيانات مستندات الحاج بالذكاء الاصطناعي
// ============================================================
// س٣ / Security Architecture v1.3 §٧.٣.
//
// الدالة كانت تُنفَّذ لمن يحمل مفتاح النشر العلني — وهو منشور في
// حزمة المتصفح. والفاتورة حقيقية: كل استدعاء يستهلك مفتاحاً مدفوعاً.
//
// ⚠️ النمط الثلاثي — §٧.٢. verify_jwt = true قائم منذ س٠، لكنه
// وحده لا يحمي: مفتاح anon هو JWT صالح يجتاز البوابة. الحارس أدناه
// هو ما يميّز موظفاً حقيقياً، والصلاحية manage_passengers هي نفسها
// التي تحرس صفحة الحجاج في NAV — فلا تتفارق الواجهة عن الخادم.
//
// التفويض كله عبر _shared/authorize.ts — لا منطق تفويض في هذا
// الملف ولا في أي دالة أخرى.
//
// نصوص الاستخراج الثلاثة والنموذج منقولة كما كانت بلا تغيير.
//
// س٩ / L2 — تصفية الاستجابة. كانت الدالة تُعيد استجابة المزوّد كما
// هي: اسم النموذج ومعرّف الرسالة وعدّاد الرموز وسبب التوقّف ونصّ
// خطئه. والعميل لا يقرأ منها إلا نصوص `content[].text`. فما زاد
// وصفٌ لبنيتنا الخلفية يُسلَّم مجاناً لمن يملك الصلاحية. الإسقاط
// أدناه يُخرج ما يُستعمَل وحده.
//
// وأخطاء المزوّد كانت تعود بحالة 200 مع جسمه الخام؛ صارت 502 برسالة
// عامة والتفصيل في سجلّ الخادم.
//
// س٩ / M4 — حدّ الاستدعاءات. الصلاحية تحدّ الحقّ لا الكمّ، وكل
// استدعاء هنا يستهلك مفتاحاً مدفوعاً.
//
// س٩ — وترويسات CORS صارت من الطبقة المشتركة، محسوبةً على أصل
// الطلب بدل `*` الثابتة.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authorize } from "../_shared/authorize.ts";
import { cors } from "../_shared/http.ts";
import { enforceRateLimit, LIMITS } from "../_shared/rateLimit.ts";

const REQUIRED_PERMISSION = "manage_passengers";

/* ────────────────────────────────────────────────────────────
   كتلة المحتوى بحسب نوع الملف

   ⚠️ العطل الذي يُغلقه هذا: كل ملف كان يُرسَل ككتلة `image`، وهي
   لا تقبل إلا jpeg/png/gif/webp. فتصريح حج بصيغة PDF كان يُرَدّ من
   المزوّد بـ400 (`media_type: Input should be 'image/jpeg'…`) فتردّ
   الدالة 502 — والمسح لا يبدأ أصلاً.
   وتصريح الحج **صادر من جهة حكومية** ويأتي PDF أو صورة، فالنوعان
   مساران شرعيّان لا استثناء وحالة عادية.

   وPDF له آليّته الرسمية عند المزوّد: كتلة `document`. ولا يُحوَّل
   إلى صورة التفافاً — التحويل يفقد النصّ المستخرَج ويضيف عطلاً
   جديداً في مسار لا يحتاجه. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

function mediaBlock(mediaType: string, data: string): Record<string, unknown> | null {
  if (mediaType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  /* jpg شائع من أجهزة المسح، وهو jpeg نفسه */
  const normalized = mediaType === "image/jpg" ? "image/jpeg" : mediaType;
  if ((IMAGE_TYPES as readonly string[]).includes(normalized)) {
    return { type: "image", source: { type: "base64", media_type: normalized, data } };
  }
  return null;
}

/* الإسقاط المضبوط: نصوص المحتوى وحدها — لا نموذج ولا رموز ولا معرّفات */
function projectContent(payload: unknown): { content: { type: "text"; text: string }[] } {
  const content = (payload as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return { content: [] };
  return {
    content: content
      .filter((item): item is { text: string } =>
        typeof item === "object" && item !== null && typeof (item as { text?: unknown }).text === "string")
      .map((item) => ({ type: "text" as const, text: item.text })),
  };
}

serve(async (req) => {
  const corsHeaders = cors(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  /* الهوية والصلاحية قبل قراءة الجسم وقبل أي استهلاك للمفتاح المدفوع */
  const auth = await authorize(req, REQUIRED_PERMISSION);
  if (!auth.ok) return auth.response;

  /* الحدّ الكمّي قبل استهلاك المفتاح المدفوع */
  const limited = await enforceRateLimit(
    req, auth.admin, LIMITS.scan.scope, auth.userId, LIMITS.scan.limit, LIMITS.scan.windowSeconds,
  );
  if (limited) return limited;

  try {
    const { imageBase64, mediaType, mode } = await req.json();
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    let prompt = "";
    if (mode === "idcard") {
      prompt = `استخرج بيانات البطاقة الشخصية وأجب فقط بـ JSON بدون أي نص إضافي:
{
  "national_id": "رقم البطاقة الشخصية",
  "id_expiry": "تاريخ انتهاء البطاقة DD/MM/YYYY"
}
فقط الرقم والصلاحية. لا تضيف أي بيانات أخرى.`;
    } else if (mode === "hajj_permit") {
      /* ⚠️ كان هذا الوضع يسقط في نصّ الجواز أدناه، فيُستخرَج من
         التصريح ما ليس فيه. والتحليل هنا **بالمحتوى لا بالقالب**:
         التصريح صادر من جهة حكومية وقد يتغيّر تصميمه ومواضع حقوله
         بين موسم وآخر، فلا يُبنى الاستخراج على موضع ولا على شكل. */
      prompt = `هذا مستند تصريح حج (قد يكون صورة أو PDF، وقد يختلف تصميمه من موسم لآخر ومن جهة لأخرى).

اقرأ المستند كاملاً وابحث عن بيانات هوية صاحب التصريح **أينما وردت** — لا تعتمد على موضع ثابت ولا على شكل معيّن ولا على ترتيب الحقول. قد تكون العناوين بالعربي أو بالإنجليزي أو الاثنين معاً.

أجب فقط بـ JSON بدون أي نص إضافي:
{
  "national_id": "رقم الهوية أو البطاقة الشخصية أو الرقم القومي إن وُجد في المستند",
  "passport_number": "رقم جواز السفر إن وُجد في المستند",
  "full_name": "اسم صاحب التصريح كما هو مكتوب حرفياً (العربي إن وُجد، وإلا الإنجليزي)"
}

قواعد مُلزِمة:
- أي حقل لا تجده في المستند اتركه "" — لا تخمّن ولا تستنتج ولا تؤلّف.
- غياب رقم الهوية ليس فشلاً: أعد ما وجدته من الحقول الأخرى.
- لا تترجم الاسم ولا تُعِد ترتيبه ولا تصحّح إملاءه.
- انقل الأرقام كما هي بلا فواصل ولا مسافات ولا أصفار تضيفها من عندك.`;
    } else if (mode === "auto") {
      prompt = `هذه صورة مستند سفر لحاج. حدد أولاً نوع المستند، ثم استخرج البيانات المناسبة له فقط، وأجب فقط بـ JSON بدون أي نص إضافي بالشكل التالي:

لو المستند "جواز سفر" (passport):
{
  "doc_type": "passport",
  "name_en": "الاسم الكامل بالإنجليزي كما هو مكتوب في الجواز حرفياً",
  "name_ar": "الاسم بالعربي فقط لو مكتوب في الجواز — لو مش موجود اتركه فاضي",
  "short_en": "الاسم الأول بالإنجليزي فقط",
  "short_ar": "الاسم الأول بالعربي فقط لو موجود",
  "passport": "رقم الجواز",
  "nationality": "الجنسية بالعربي مثل: قطري، مصري، سعودي، أردني، باكستاني، هندي...",
  "dob": "تاريخ الميلاد DD/MM/YYYY",
  "expiry": "تاريخ انتهاء الجواز DD/MM/YYYY",
  "gender": "ذكر أو أنثى",
  "national_id": "رقم البطاقة الشخصية/الهوية لو مطبوع في الجواز (يحدث غالبًا في جوازات بعض الجنسيات) — لو غير موجود اتركه فاضي"
}

لو المستند "بطاقة شخصية / هوية" (national ID card):
{
  "doc_type": "idcard",
  "national_id": "رقم البطاقة الشخصية",
  "id_expiry": "تاريخ انتهاء البطاقة DD/MM/YYYY",
  "name_ar": "الاسم بالعربي كما هو مكتوب في البطاقة",
  "name_en": "الاسم بالإنجليزي لو موجود على البطاقة — لو مش موجود اتركه فاضي",
  "short_ar": "الاسم الأول بالعربي فقط",
  "short_en": "الاسم الأول بالإنجليزي فقط لو موجود",
  "nationality": "الجنسية بالعربي",
  "dob": "تاريخ الميلاد DD/MM/YYYY",
  "gender": "ذكر أو أنثى"
}

لو المستند "تصريح حج / بطاقة حملة" (hajj permit):
{
  "doc_type": "hajj_permit",
  "name_ar": "اسم الحاج بالعربي كما هو مكتوب في التصريح",
  "name_en": "اسم الحاج بالإنجليزي لو موجود",
  "passport": "رقم جواز السفر لو موجود في التصريح",
  "national_id": "رقم البطاقة الشخصية لو موجود في التصريح"
}

مهم: لا تترجم أي اسم. فقط انقل البيانات الموجودة فعليًا في الصورة، واترك أي حقل غير موجود فاضي "".`;
    } else {
      prompt = `استخرج بيانات جواز السفر وأجب فقط بـ JSON بدون أي نص إضافي:
{
  "name_en": "الاسم الكامل بالإنجليزي كما هو مكتوب في الجواز حرفياً",
  "name_ar": "الاسم بالعربي فقط لو مكتوب في الجواز — لو مش موجود اتركه فاضي",
  "short_en": "الاسم الأول بالإنجليزي فقط",
  "short_ar": "الاسم الأول بالعربي فقط لو موجود",
  "passport": "رقم الجواز",
  "nationality": "الجنسية بالعربي مثل: قطري، مصري، سعودي، أردني، باكستاني، هندي...",
  "dob": "تاريخ الميلاد DD/MM/YYYY",
  "expiry": "تاريخ انتهاء الجواز DD/MM/YYYY",
  "gender": "ذكر أو أنثى",
  "national_id": "رقم البطاقة الشخصية/الهوية لو مطبوع في الجواز — لو غير موجود اتركه فاضي"
}
مهم: لا تترجم الاسم. فقط انقل البيانات الموجودة في الجواز.`;
    }

    /* النوع يُفحص هنا لا عند المزوّد: رفضه يعود 502 عامة، وهذا يعود
       415 برسالة تقول للموظّف ما الصيغ المقبولة */
    const block = mediaBlock(String(mediaType ?? ""), imageBase64);
    if (!block) {
      console.error("نوع ملف غير مدعوم للمسح", { mediaType, mode });
      return new Response(
        JSON.stringify({ error: "صيغة الملف غير مدعومة للمسح. المدعوم: JPG · PNG · WebP · GIF · PDF." }),
        { status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1000,
        messages: [{
          role: "user",
          /* الملف قبل النصّ — الترتيب المعتمد لكتل المستندات */
          content: [block, { type: "text", text: prompt }]
        }]
      })
    });

    const data = await response.json().catch(() => null);

    /* فشل المزوّد: تفصيله في السجلّ، والعميل يأخذ حالةً صادقة ورسالةً عامة */
    if (!response.ok) {
      console.error("فشل استدعاء مزوّد التحليل", { status: response.status, body: data });
      return new Response(JSON.stringify({ error: "تعذّر تحليل المستند." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(projectContent(data)), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("خطأ غير متوقّع في مسح المستند", error);
    return new Response(JSON.stringify({ error: "تعذّر تحليل المستند." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
