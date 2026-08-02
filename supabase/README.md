# قاعدة بيانات نظام الأقصى

## البنية

```
supabase/
├── migrations/
│   ├── 20260101000000_baseline_schema.sql            المخطط الكامل
│   ├── 20260731000000_delete_empty_financial_groups.sql
│   ├── 20260731000100_create_financial_group_with_member.sql
│   ├── 20260802021913_season_integrity_backfill_constraints_indexes.sql
│   ├── 20260802021944_season_reject_writes_to_closed_season.sql
│   ├── 20260802022009_season_close_and_delete_transactions.sql
│   ├── 20260802022040_portal_active_season_only.sql
│   └── 20260802022310_season_restrict_close_and_delete_execution.sql
└── scripts/
    └── cleanup_empty_financial_groups.sql            يدوي — لا يعمل تلقائياً
```

الخمسة الأخيرة هي **م١ من معمارية المواسم** (Issue #42) — تُقرأ بالترتيب،
وكلٌّ منها قابل لإعادة التشغيل وحده.

## إنشاء قاعدة جديدة من الصفر

```bash
supabase db reset          # محلياً
supabase db push           # على مشروع Supabase جديد
```

لا خطوات يدوية ولا إنشاء جداول من لوحة التحكم.

## ما تنشئه الـ baseline

16 جدولاً · 33 قيداً · 26 فهرساً · 10 دوال · 18 سياسة RLS ·
حاوية `passengers-docs` وسياساتها الثلاث · صلاحيات `anon`/`authenticated`/`service_role`.

الـ migrationان التاليتان تضيفان دالتين ومحفّزاً (12 دالة).

## ما تضيفه م١ (المواسم)

خمس دوال (`active_season_id` · `close_season` · `delete_season` ودالتا
المحفّز) فتصير **17 دالة** · تسعة محفّزات `trg_reject_closed_season` ·
أربعة مفاتيح أجنبية على `season_id` · خمسة فهارس · و`not null` +
`default` على `season_id` في الجداول الأربعة.

**ثوابت مفروضة في القاعدة لا في الواجهة:**

| | |
|---|---|
| موسم مفتوح واحد لا أكثر | `seasons_one_open_idx` |
| موسم مفتوح واحد لا أقل | `close_season()` في معاملة واحدة |
| لا كتابة على موسم مقفل | `trg_reject_closed_season` على تسعة جداول |
| كل صفّ موسميّ له موسم قائم | `not null` + `default` + مفتاح أجنبي |
| بوابة الحاج للموسم النشط فقط | فلتر داخل `get_pilgrim_portal` |

`close_season` و`delete_season` **محجوبتان عن `anon` و`authenticated`**
عمداً: بوستجرس يمنح `execute` لـ PUBLIC تلقائياً، ولا يجوز أن تُشحن
دالة هدّامة قابلة للاستدعاء بمفتاح النشر العلني. لا شيء يستدعيهما بعد.

## قواعد التعديل

**كل تغيير في القاعدة يمرّ عبر migration في هذا المجلد.** لا تُنشئ ولا
تُعدّل جدولاً أو دالة أو سياسة من لوحة تحكم Supabase — التغيير الذي
لا يُسجَّل هنا يضيع عند إنشاء أي بيئة جديدة.

الملفات **idempotent** (`IF NOT EXISTS` / `OR REPLACE` / حُرّاس `DO`)،
فتشغيلها على قاعدة قائمة لا يفعل شيئاً ولا يفشل.

**لا migration تحذف بيانات.** ما يحذف بيانات يوضع في `scripts/`
ويُشغَّل يدوياً بعد معاينة.

## متطلّب بيئي

`verify_user` و`create_user` و`update_user` تستدعي `crypt()` و`gen_salt()`
من امتداد `pgcrypto` المثبَّت في schema `extensions`، وتعتمد على
`search_path` الذي يضبطه Supabase على مستوى الدور:

```
search_path = "$user", public, extensions
```

هذا افتراضي في أي مشروع Supabase. على Postgres عادي يلزم ضبطه:

```sql
alter role postgres set search_path to "$user", public, extensions;
```

تثبيت `search_path` داخل الدوال الثلاث مؤجَّل ضمن أعمال التأمين.

## مزامنة قاعدة إنتاج قائمة

القاعدة الحالية أُنشئت جداولها من لوحة التحكم، فسجلّها لا يعرف
الـ baseline. لتسجيلها دون إعادة تنفيذ:

```bash
supabase migration repair --status applied 20260101000000
```

أو شغّلها كما هي — فهي idempotent ولن تغيّر شيئاً.
