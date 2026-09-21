-- ════════════════════════════════════════════════════════════
-- مِسبارُ بصمة التخزين — يُشغَّل حيث يوجد مخطَّط `storage` وحده
-- ════════════════════════════════════════════════════════════
\pset pager off
\pset tuples_only on
\pset format unaligned

-- التخزين: يُتخطّى بصمتٍ على قاعدةٍ بلا مخطَّط `storage`
select 'BUCKET '||id||' public='||public::text||' size='||coalesce(file_size_limit::text,'-')
       ||' mime='||coalesce(array_to_string(allowed_mime_types,'|'),'-')
  from storage.buckets order by 1;

select 'STPOL  '||tablename||' '||policyname||' '||cmd||' roles='||array_to_string(roles,',')
       ||' qual='||md5(coalesce(qual,'-')||coalesce(with_check,'-'))
  from pg_policies where schemaname='storage' order by 1;
