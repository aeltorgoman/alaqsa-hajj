-- ════════════════════════════════════════════════════════════
-- مِسبارُ البصمة — أداةُ المقارنة بين الحيّ والمبنيّ من الصفر
-- ════════════════════════════════════════════════════════════
-- سكربتٌ **للقراءة فقط**. يُشغَّل على الطرفين — القاعدة الحيّة
-- والقاعدة المحلّيّة المبنيّة من خطّ الأساس — فيُخرج نصّاً
-- مرتَّباً حتميّاً يقبل `diff` سطراً بسطر.
--
-- ⚠️ ولا يُستعاض به عن `supabase db diff`، ولا يُستعاض بـ`db diff`
-- عنه: الأولُ يقارن شكلَ المخطَّط، وهذا يقارن **الأمن** —
-- الصلاحيات وRLS والسياسات ووضعَ الدوالّ ومسارَ بحثها. والبند
-- §٣٥.١ من دليل الهندسة يُلزم بالاثنين معاً.
--
-- ولا يمسّ صفّاً ولا كائناً: `select` فحسب.

\pset pager off
\pset tuples_only on
\pset format unaligned

select 'COUNT  '||k||' = '||v from (
  select 'tables' k, count(*)::text v from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
  union all select 'views', count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'
  union all select 'sequences', count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S'
  union all select 'functions', count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
  union all select 'triggers', count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
  union all select 'indexes', count(*)::text from pg_indexes where schemaname='public'
  union all select 'policies', count(*)::text from pg_policies where schemaname='public'
  union all select 'columns', count(*)::text from information_schema.columns where table_schema='public'
  union all select 'constraints', count(*)::text from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
  union all select 'rls_tables', count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity
) s order by 1;

-- الأعمدة: الاسمُ والنوعُ وقابليّةُ العدمِ والافتراضُ والهويّة
select 'COLUMN '||table_name||'.'||column_name||' '||data_type
       ||' null='||is_nullable||' def='||coalesce(column_default,'-')
       ||' ident='||coalesce(identity_generation,'-')
  from information_schema.columns where table_schema='public' order by 1;

select 'CONSTRAINT '||c.relname||' '||con.conname||' '||pg_get_constraintdef(con.oid)
  from pg_constraint con join pg_class c on c.oid=con.conrelid
  join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by 1;

select 'INDEX  '||indexdef from pg_indexes where schemaname='public' order by 1;

select 'VIEW   '||c.relname||' opts='||coalesce(array_to_string(c.reloptions,','),'-')||' md5='||md5(pg_get_viewdef(c.oid))
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='v' order by 1;

-- الدوالّ: التوقيعُ واللغةُ والتقلّبُ ووضعُ الأمن ومسارُ البحث
-- و**صلاحيةُ التنفيذ من دلالات الـACL لا من نصّها**.
select 'FUNC   '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
       ||' lang='||l.lanname||' vol='||p.provolatile::text
       ||' secdef='||p.prosecdef::text
       ||' cfg='||coalesce(array_to_string(p.proconfig,','),'-')
       ||' acl='||coalesce((select string_agg(a.privilege_type||':'||coalesce(nullif(pg_get_userbyid(a.grantee),''),'PUBLIC'),' ' order by coalesce(nullif(pg_get_userbyid(a.grantee),''),'PUBLIC'))
                            from aclexplode(p.proacl) a),'DEFAULT-PUBLIC-EXECUTE')
       ||' md5='||md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname='public' and p.prokind='f' order by 1;

select 'TRIGGER '||c.relname||' '||t.tgname||' md5='||md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and not t.tgisinternal order by 1;

select 'RLS    '||c.relname||' enabled='||c.relrowsecurity::text||' forced='||c.relforcerowsecurity::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' order by 1;

select 'POLICY '||tablename||' '||policyname||' '||cmd||' '||permissive
       ||' roles='||array_to_string(roles,',')
       ||' qual='||md5(coalesce(qual,'-'))||' chk='||md5(coalesce(with_check,'-'))
  from pg_policies where schemaname='public' order by 1;

-- صلاحياتُ الجداول لأدوار التطبيق و**لـPUBLIC** (المستفيد ٠)
select 'GRANT  '||c.relname||' '||coalesce(nullif(pg_get_userbyid(a.grantee),''),'PUBLIC')||'='||a.privilege_type
  from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(c.relacl) a
 where n.nspname='public' and c.relkind in ('r','v')
   and (a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated','service_role'))
 order by 1;

select 'SCHEMA '||nspname||' acl='||coalesce(nspacl::text,'-')
  from pg_namespace where nspname in ('public','extensions') order by 1;

-- الصلاحياتُ الافتراضية — مقصورةٌ على ما يملكه `postgres`، فما
-- يملكه `supabase_admin` بنيةٌ منصّيّةٌ لا يملكها هذا التطبيق.
select 'DEFACL role='||pg_get_userbyid(d.defaclrole)||' schema='||coalesce(n.nspname,'(all)')
       ||' objtype='||d.defaclobjtype::text||' acl='||d.defaclacl::text
  from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 where pg_get_userbyid(d.defaclrole) = 'postgres' order by 1;

select 'EXT    '||e.extname||' schema='||n.nspname
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by 1;

-- ⚠️ التخزينُ في ملفٍّ مستقلّ (`fingerprint-storage.sql`): مخطَّطُ
--    `storage` لا يوجد على بوستجرس عاديّ، وذكرُه هنا يُسقط
--    السكربتَ كلَّه بخطأ تحليلٍ قبل أن يُخرج سطراً واحداً.
