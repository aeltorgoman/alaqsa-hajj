-- (included, as the operator) receipts of demo.season_key, in issuance
-- order, through the real RPCs. Numbering is allocated by the database;
-- the loop asserts it equals the contract's number.
do $$
declare
  k   text := current_setting('demo.season_key');
  ds  jsonb := current_setting('demo.dataset')::jsonb;
  r   jsonb;
  a   jsonb;
  alloc jsonb;
  rec public.payment_receipts;
  v_id bigint;
begin
  for r in select x from jsonb_array_elements(ds->'receipts'->k) x order by (x->>'receipt_number')::int loop
    alloc := '[]'::jsonb;
    for a in select y from jsonb_array_elements(r->'allocations') y loop
      select p.id into v_id from public.passengers p
       where p.passport = (select q->>'passport' from jsonb_array_elements(ds->'people') q where q->>'ref' = a->>'person');
      if v_id is null then raise exception 'receipt %: person % not visible', r->>'receipt_number', a->>'person'; end if;
      alloc := alloc || jsonb_build_object('passenger_id', v_id, 'amount', (a->>'amount')::numeric);
    end loop;
    rec := public.issue_payment_receipt(alloc, (r->>'payment_date')::date, r->>'method', r->>'notes', r->>'group_name');
    if rec.receipt_number <> (r->>'receipt_number')::int then
      raise exception 'receipt number drift: database issued %, contract expects %', rec.receipt_number, r->>'receipt_number';
    end if;
    if r->>'cancel_reason' is not null then
      perform public.cancel_payment_receipt(rec.id, r->>'cancel_reason');
    end if;
  end loop;
end $$;
