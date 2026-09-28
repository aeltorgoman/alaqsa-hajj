#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════
# يرفض أيَّ هدفٍ ليس مشروعَ التمرين المُخصَّص للإتلاف
# ════════════════════════════════════════════════════════════
# يُستدعى في **كلّ** خطوةٍ تتّصل أو تكتب — لا مرّةً في الأعلى.
# ترتيبُ الخطوات ليس ضماناً، والنيّةُ ليست ضماناً. الضمانُ أن
# تسأل كلُّ خطوةٍ بنفسها قبل أن تفتح اتصالاً.
#
#   ALLOWED_TMP_REF=<ref> assert-not-production.sh <ref> [url-or-string ...]
#
# المرجعُ المسموحُ به يُمرَّر صراحةً في `ALLOWED_TMP_REF` من الـworkflow
# (مدخلٌ يكتبه المشغّل، لا سرٌّ ولا قيمةٌ في الشيفرة)، فلا يبقى مرجعٌ
# لمشروعٍ مؤقّتٍ محذوفٍ مثبَّتاً هنا. أمّا رفضُ الإنتاج فيبقى مثبَّتاً.
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
# المشروعُ المؤقّتُ المتوقَّع — يُمرَّر صراحةً، ويُفحص شكلُه، ولا يكون الإنتاجَ أبداً.
readonly EXPECTED_TMP_REF="${ALLOWED_TMP_REF:-}"
if [ -z "$EXPECTED_TMP_REF" ]; then
  echo "::error::ALLOWED_TMP_REF is not set - the allowed disposable ref must be supplied explicitly - refusing"; exit 1
fi
if ! printf '%s' "$EXPECTED_TMP_REF" | grep -qE '^[a-z]{20}$'; then
  echo "::error::ALLOWED_TMP_REF is not a well-formed ref - refusing"; exit 1
fi
if [ "$EXPECTED_TMP_REF" = "$PRODUCTION_REF" ]; then
  echo "::error::REFUSING: ALLOWED_TMP_REF is the PRODUCTION project. Nothing was touched."; exit 1
fi

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
  echo "::error::REFUSING: the target is neither production nor the explicitly allowed disposable"
  echo "::error::project (ALLOWED_TMP_REF). An unrecognised target is not a safe target."
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

echo "  guard ok: target is the explicitly allowed disposable project (not production)"
