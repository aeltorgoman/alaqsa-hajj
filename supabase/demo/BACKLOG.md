# Backlog findings discovered during the Demo implementation

Recorded here, **not fixed** in the Demo work (scope discipline). Each one is a product or Production concern, independent of the Demo.

## B-1 — Season close removes document objects but keeps their references

- **Where**
  - `src/components/SeasonCloseWizard.tsx`: after `close_season()` succeeds, it removes the closed season's files from `passengers-docs`. Around line 331.
  - `supabase/baseline/v1/v1_baseline.sql`: neither `close_season()` nor any trigger clears `passengers.*_url`.
- **Effect.** After a real season close, archived pilgrims still carry non-null `photo_url` / `passport_url` / … values. Those values point at objects that no longer exist. Archive screens can therefore show a document as present that fails to open.
- **Demo handling.** Archived-season pilgrims are seeded with no document references, so the Storage-truthfulness rule holds. The Season Storage Lifecycle was not redesigned.
- **Suggested direction** (separate task): either null the references in the same lifecycle step that removes the objects, or keep the objects for archived seasons. Add a verification query to the season-close acceptance tests.

## B-2 — `delete_season()` leaves `season_pricing_snapshot` rows behind

- **Where.** `delete_season(bigint, uuid)` deletes passengers, payments, rooms, camps, buses, flights, announcements and the season row. It never deletes `season_pricing_snapshot`, which has no foreign key to `seasons`.
- **Evidence.** On the local rehearsal stack, after one reset cycle, `select count(*) from season_pricing_snapshot s where not exists (select 1 from seasons x where x.id = s.season_id)` returned **70**.
- **Effect.** Orphan snapshot rows accumulate in Production whenever an archived season is deleted. This is hygiene, not a correctness issue: lookups are by an existing `season_id`.
- **Demo handling.** `sql/90_reset.sql` deletes only snapshot rows whose season no longer exists. The verifier asserts zero orphans.
- **Suggested direction.** Delete them inside `delete_season()` (and count them in its audit row), or add an FK with `on delete cascade`.

## B-3 (note) — `payment_receipts` rows outlive a deleted season

- **This is by design**, recorded so it is not mistaken for a bug.
- `trg_payment_receipts_immutable` forbids deleting a receipt. So `delete_season()` leaves the season's receipts, with their frozen season name and number.
- In the Demo, every reset therefore retains the deleted Demo seasons' receipts. They are invisible in the app and excluded from verification by `season_id`.
- If a full purge is ever wanted, the only clean path is recreating the Demo project.
