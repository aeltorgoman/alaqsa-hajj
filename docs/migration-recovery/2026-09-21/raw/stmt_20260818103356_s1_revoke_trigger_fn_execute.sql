-- دالّة محفِّز لا تُستدعى إلا من المحفِّز نفسه، فلا موجب لبقائها
-- في سطح الـAPI: PostgREST تنشرها تحت /rpc/ لأنها في `public`.
-- وتنفيذ المحفِّز لا يتطلّب EXECUTE من الدور المُدرِج، فالسحب آمن.
revoke execute on function public.passengers_assign_sort_order() from public, anon, authenticated;