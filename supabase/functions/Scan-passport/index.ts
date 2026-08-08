import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
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
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
