# 01 — Baseline (Checkpoint 1)

Captured: **2026-09-21**  ·  Strategy E, Checkpoint 1 (evidence preservation, read-only)

## Repository

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD SHA | `21cb1de67829778fea901cdfcffad8c095dc6204` |
| HEAD (short) | `21cb1de` |
| Working tree before capture | **clean** (`git status --short` empty) |
| Migration files in `supabase/migrations/` | **36** |
| `supabase/config.toml` | **absent** (project never CLI-initialised) |
| `.github/` workflows | **absent** |

## Supabase

| Item | Value |
|---|---|
| Project ref | `zkucwcnclbfvukhdqhgc` |
| Ledger table | `supabase_migrations.schema_migrations` |
| Ledger rows | **45** |
| Total bytes in `statements` | **186 082** |
| Rows with `statements` | 44 (baseline row `20260101000000` has 0) |
| Rows with non-null `idempotency_key` | **0** |
| Rows with non-null `rollback` | **0** |
| `created_by` on 44 of 45 rows | `abdelaziz.moh84@gmail.com` (dashboard/MCP apply signature) |
| `created_by` on `20260101000000` | `NULL` |

## Ordered repository migration files (36)

| # | Version | Name | Lines |
|---|---|---|---|
| 1 | 20260101000000 | baseline_schema | 658 |
| 2 | 20260731000000 | delete_empty_financial_groups | 47 |
| 3 | 20260731000100 | create_financial_group_with_member | 55 |
| 4 | 20260802021913 | season_integrity_backfill_constraints_indexes | 84 |
| 5 | 20260802021944 | season_reject_writes_to_closed_season | 122 |
| 6 | 20260802022009 | season_close_and_delete_transactions | 88 |
| 7 | 20260802022040 | portal_active_season_only | 102 |
| 8 | 20260802022310 | season_restrict_close_and_delete_execution | 21 |
| 9 | 20260804090000 | s1_identity_foundation | 107 |
| 10 | 20260804120000 | s1_user_profiles_email | 32 |
| 11 | 20260806110000 | company_profile_phase1 | 206 |
| 12 | 20260808120000 | s4_portal_announcements | 47 |
| 13 | 20260808140000 | s4_rls_and_anon_revocation | 197 |
| 14 | 20260809100000 | **s9_pin_search_path** | 32 |
| 15 | 20260810100000 | s9_edge_rate_limit | 87 |
| 16 | 20260811090000 | s5_drop_legacy_auth | 30 |
| 17 | 20260811140000 | s6_close_public_storage_writes | 49 |
| 18 | 20260811160000 | s6_backfill_object_keys | 35 |
| 19 | 20260811180000 | s6_company_assets_bucket | 41 |
| 20 | 20260811200000 | s6_repoint_company_asset_refs | 40 |
| 21 | 20260812090000 | s6_portal_hardening | 175 |
| 22 | 20260815100000 | s6_privatize_passengers_docs | 40 |
| 23 | 20260818090000 | s1_resource_ordering | 167 |
| 24 | 20260819120000 | b_permission_separation | 74 |
| 25 | 20260820100000 | s7_portal_session | 525 |
| 26 | 20260820110000 | s7_close_credential_path | 105 |
| 27 | 20260822120000 | s8_audit_log | 694 |
| 28 | 20260827120000 | season_pricing_snapshot | 186 |
| 29 | 20260829120000 | m7_season_flights_announcements | 498 |
| 30 | 20260909120000 | hotel_room_capacity | 204 |
| 31 | 20260909180000 | hotel_room_number_unique | 44 |
| 32 | 20260910120000 | allocation_integrity_bus_camp | 617 |
| 33 | 20260911120000 | flight_integrity | 386 |
| 34 | 20260918120000 | settings_security_remediation | 131 |
| 35 | 20260919120000 | season_master_data_and_settings_ia | 628 |
| 36 | 20260920120000 | drop_company_config_legacy_columns | 372 |

The full 45-row ledger listing (version, name, created_by, byte length, SHA-256) is in `02-ledger-export.json`.
