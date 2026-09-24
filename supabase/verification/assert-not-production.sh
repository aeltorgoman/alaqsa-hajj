#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# يرفض أيَّ هدفٍ ليس مشروعَ التمرين المُخصَّص للإتلاف
# ════════════════════════════════════════════════════════════
# يُستدعى في **كلّ** خطوةٍ تتّصل أو تكتب — لا مرّةً في الأعلى.
# ترتيبُ الخطوات ليس ضماناً، والنيّةُ ليست ضماناً. الضمانُ أن
# تسأل كلُّ خطوةٍ بنفسها قبل أن تفتح اتصالاً.
#
#   assert-not-production.sh <ref> [url-or-string ...]
#
# يُخفق إن كان المرجع فارغاً، أو غيرَ مطابقٍ للشكل، أو مرجعَ
# الإنتاج، أو غيرَ مرجعِ مشروع التمرين المتوقَّع. ويفحص كذلك كلَّ
# نصٍّ إضافيّ (رابط اتصالٍ مثلاً) فيرفضه إن حمل مرجعَ الإنتاج أو
# لم يحمل مرجعَ الهدف.
#
# ولا يطبع الروابطَ ولا الأسرار: يقول ما وجد، لا ما قرأ.
set -euo pipefail

# مرجعُ الإنتاج — قيمةٌ محرَّمةٌ مثبَّتةٌ في الشيفرة، لا مُدخَلٌ ولا سرّ.
readonly PRODUCTION_REF="zkucwcnclbfvukhdqhgc"
# مشروعُ التمرين المتوقَّع — «Alaqsa Recovery Test»، مُعايَنٌ قبل الكتابة.
readonly EXPECTED_TMP_REF="edkngsadjkeujyacqidd"

ref="${1:-}"
shift || true

[ -n "$ref" ] || { echo "::error::target project ref is empty - refusing"; exit 1; }

if [ "${#ref}" -ne 20 ] || ! printf '%s' "$ref" | grep -qE '^[a-z]{20}$'; then
  echo "::error::target project ref is not a well-formed ref - refusing"; exit 1
fi

if [ "$ref" = "$PRODUCTION_REF" ]; then
  echo "::error::REFUSING: the target is the PRODUCTION project. Nothing was touched."
  exit 1
fi

if [ "$ref" != "$EXPECTED_TMP_REF" ]; then
  echo "::error::REFUSING: the target is neither production nor the expected disposable"
  echo "::error::rehearsal project. An unrecognised target is not a safe target."
  exit 1
fi

# وكلُّ نصٍّ إضافيّ: لا يحمل مرجعَ الإنتاج، ويحمل مرجعَ الهدف.
for s in "$@"; do
  if printf '%s' "$s" | grep -qF "$PRODUCTION_REF"; then
    echo "::error::REFUSING: a connection string carries the production ref."; exit 1
  fi
  if ! printf '%s' "$s" | grep -qF "$ref"; then
    echo "::error::REFUSING: a connection string does not carry the target ref."; exit 1
  fi
done

echo "  guard ok: target is the disposable rehearsal project (not production)"
