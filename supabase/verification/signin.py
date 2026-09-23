#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
تسجيلُ دخولِ حسابِ اختبار — يطبع رمزَ الوصول وحده.

يُشحن ملفّاً في المستودع ولا يُكتب داخل مجرى YAML: مُنهي الـheredoc
يقع في العمود صفر فيكسر الكتلةَ النصّية، وقد كسرها مرّتين من قبل.

ولا يطبع شيئاً غير الرمز — لا جسمَ الاستجابة ولا رسالةَ الخطأ: جسمُ
`/auth/v1/token` يحمل رمزَ التحديث أيضاً. فالفشل سطرٌ فارغ، ويفسّره
المُنادي.
"""
import json
import os
import sys
import urllib.request


def main(argv):
    if len(argv) != 3:
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
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            token = json.load(res).get("access_token") or ""
    except Exception:                     # noqa: BLE001 — أيُّ فشلٍ فشل، ولا يُفصح
        token = ""
    sys.stdout.write(token)
    return 0 if token else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
