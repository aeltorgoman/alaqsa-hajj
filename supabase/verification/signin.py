#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
تسجيلُ دخولِ حسابِ اختبار — يطبع رمزَ الوصول وحده على المخرج القياسيّ.

يُشحن ملفّاً في المستودع ولا يُكتب داخل مجرى YAML: مُنهي الـheredoc
يقع في العمود صفر فيكسر الكتلةَ النصّية، وقد كسرها مرّتين من قبل.

ولا يطبع على **المخرج القياسيّ** شيئاً غير الرمز — لا جسمَ الاستجابة
ولا رسالةَ الخطأ: جسمُ `/auth/v1/token` يحمل رمزَ التحديث أيضاً.
فالفشل سطرٌ فارغ، ويفسّره المُنادي، ويلتقطه `$(...)` وحده.

⚠️ وعند الإخفاق **وحده** يُكتب سطرُ تشخيصٍ على **مخرج الخطأ**:

    signin: http=400 code=invalid_credentials class=rejected

لأن `except Exception: token = ""` كانت تبتلع السببَ كلَّه، فصار
الإخفاقُ في الجولات ٦ و٧ لا يُفرَّق فيه بين كلمةِ مرورٍ خاطئة،
وحسابٍ محظور، وعطلٍ في الشبكة، ومفتاحٍ عامٍّ غيرِ صالح. والتشخيصُ
بلا دليلٍ تخمين.

وما يُكتب غيرُ سرّيٍّ بالبناء لا بالنيّة:
  · `http`  — رمزُ الحالة وحده، عددٌ صحيح.
  · `code`  — سليقةُ خطأ Supabase (مثل `invalid_credentials`)،
              وتُمرَّر عبر قائمة سماحٍ نمطيّة `[a-z0-9_]{1,64}`
              بمطابقةٍ كاملة (`fullmatch`)،
              فلا يُسرَّب نصٌّ حرٌّ من الخادم إلى السجلّ ولا يُحقَن.
  · `class` — تصنيفٌ خشن من رمز الحالة لا من جسم الاستجابة.

ولا يُكتب: البريدُ، ولا كلمةُ المرور، ولا الرمزُ، ولا المفتاحُ
العامّ، ولا جسمُ الاستجابة، ولا رسالةُ الخطأ الحرّة. وجسمُ النجاح
لا يُقرأ منه إلا `access_token` ولا يُطبع منه شيء بحال.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

# سليقةُ الخطأ وحدها تُنقل، وبقائمةِ سماحٍ نمطيّة لا بثقةٍ في الخادم.
#
# ⚠️ `fullmatch` لا `match`، وبلا مرساتَي `^` و`$`: مرساةُ `$` في
# بايثون تُطابق **قبل سطرٍ جديدٍ أخير** أيضاً، فكان `"user_banned\n"`
# يجتاز القائمة ويشقُّ سطرَ التشخيص شطرين في سجلّ Actions. ولم يكن
# ذلك حقناً لأمرِ سير عمل — إذ لا يُسمح بحرفٍ بعد السطر الجديد،
# ويَلحق `diagnose` بعده ` class=...` فيبدأ الشطرُ الثاني بفراغٍ لا
# بـ`::` — لكنه نصٌّ من الخادم يُغيّر بنيةَ السجلّ، وهذا وحده كافٍ.
# و`fullmatch` تُلزم المطابقةَ بكامل النصّ فلا تُستثنى نهايةٌ.
CODE = re.compile(r"[a-z0-9_]{1,64}")


def classify(status):
    """تصنيفٌ خشن من رمز الحالة — لا يقرأ جسمَ الاستجابة."""
    if status == 400 or status == 401:
        return "rejected"          # بيانات دخولٍ مرفوضة
    if status == 403:
        return "forbidden"         # حسابٌ محظورٌ أو مفتاحٌ غيرُ مخوَّل
    if status == 422:
        return "unprocessable"     # طلبٌ غيرُ مقبولِ الشكل
    if status == 429:
        return "rate_limited"
    if 500 <= status < 600:
        return "server_error"
    return "unexpected_status"


def diagnose(http=None, code=None, klass=None):
    """سطرٌ واحدٌ على مخرج الخطأ، بحقولٍ غيرِ سرّيّةٍ فقط."""
    parts = ["signin:"]
    parts.append("http=%s" % (http if http is not None else "none"))
    parts.append("code=%s" % (code if code else "none"))
    parts.append("class=%s" % (klass or "unknown"))
    sys.stderr.write(" ".join(parts) + "\n")


def main(argv):
    if len(argv) != 3:
        diagnose(klass="bad_usage")
        return 1
    email, password = argv[1], argv[2]
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/token?grant_type=password"
    req = urllib.request.Request(
        url,
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers={
            "apikey": os.environ["SUPABASE_ANON_KEY"],
            "Content-Type": "application/json",
        },
        method="POST",
    )

    token = ""
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            # لا يُقرأ من جسم النجاح إلا هذا الحقل، ولا يُطبع منه شيء
            token = json.load(res).get("access_token") or ""
        if not token:
            diagnose(http=200, klass="no_access_token")
    except urllib.error.HTTPError as err:
        # الجسمُ يُقرأ لحقلٍ واحدٍ مُصفّى، ولا يُطبع منه حرفٌ سواه
        code = None
        try:
            body = json.loads(err.read().decode("utf-8", "replace"))
            raw = body.get("error_code") or body.get("error") or ""
            if isinstance(raw, str) and CODE.fullmatch(raw):
                code = raw
        except Exception:                 # noqa: BLE001 — جسمٌ غيرُ مفهوم لا يُنقل
            code = None
        diagnose(http=err.code, code=code, klass=classify(err.code))
    except urllib.error.URLError:
        diagnose(klass="network")
    except Exception:                     # noqa: BLE001 — أيُّ فشلٍ فشل، ولا يُفصح
        diagnose(klass="unexpected")

    sys.stdout.write(token)
    return 0 if token else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
