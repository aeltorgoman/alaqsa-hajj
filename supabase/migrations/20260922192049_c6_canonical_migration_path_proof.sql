-- ════════════════════════════════════════════════════════════
-- مِسبارُ الطريق المعتمَد — Checkpoint 6
-- ════════════════════════════════════════════════════════════
-- يُثبت هذا الملفُّ الطريقَ لا المخطَّط: هجرةٌ جديدة → المستودع →
-- تحقُّقٌ محلّيّ → PR → دمج → `supabase db push` → سجلُّ الإنتاج →
-- لا معلَّقَ بعدها.
--
-- ولا أثرَ له في القاعدة بحال: لا جدولَ ولا دالّةَ ولا سياسةَ ولا
-- مِنحةَ ولا تعليقاً ولا صفّاً. الكتلةُ أدناه تُقيَّم ثمّ تُنسى.
-- أثرُه الباقي الوحيد صفٌّ في `supabase_migrations.schema_migrations`
-- يضعه مسارُ الهجرة المعتاد.
--
-- This migration proves the PATH, not the schema. Its only persistent
-- effect is the ledger row the normal Supabase migration process
-- writes. It creates nothing, grants nothing, and changes no data.
do $$
begin
  perform 1;
end
$$;
