#!/usr/bin/env python3
"""
verify-demo.py — independent verification of the Demo environment
=================================================================
Expected state comes ONLY from demo.manifest.json (the approved
contract). Actual state comes from independent read-only database
queries and from the Storage API (every referenced object is
downloaded and its bytes checked). It never reads data/dataset.json
and never trusts anything the seed printed.

    DEMO_ENV_FILE=… python3 supabase/demo/tools/verify-demo.py [--fingerprint FILE] [--skip-download]

Exit 0 only when every check passes. --fingerprint writes a SHA-256 of
the canonical business dataset (ids and wall-clock timestamps
excluded) plus every object's content hash, for seed/reset/reseed
comparisons.

No dependencies beyond Python 3 and psql. Read-only: the database
session runs with default_transaction_read_only=on.
"""
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.dirname(HERE)
MANIFEST = json.load(open(os.path.join(DEMO, "demo.manifest.json"), encoding="utf-8"))

# ── environment ───────────────────────────────────────────────────
if os.environ.get("DEMO_ENV_FILE"):
    for line in open(os.environ["DEMO_ENV_FILE"], encoding="utf-8"):
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip("'\"")
for k in ("DEMO_PROJECT_REF", "DEMO_DB_URL", "DEMO_SUPABASE_URL", "DEMO_SERVICE_ROLE_KEY"):
    if not os.environ.get(k):
        sys.exit(f"✗ {k} is required")
args = sys.argv[1:]
FP_OUT = args[args.index("--fingerprint") + 1] if "--fingerprint" in args else None
SKIP_DL = "--skip-download" in args

if subprocess.run(["bash", os.path.join(HERE, "assert-demo-target.sh")]).returncode != 0:
    sys.exit(1)

def q(sql):
    env = dict(os.environ, PGOPTIONS="-c default_transaction_read_only=on")
    r = subprocess.run(["psql", os.environ["DEMO_DB_URL"], "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
                       capture_output=True, text=True, env=env)
    if r.returncode != 0:
        sys.exit(f"✗ query failed: {r.stderr.splitlines()[0] if r.stderr else '?'}")
    out = r.stdout.strip()
    return json.loads(out) if out else None

# ── results ───────────────────────────────────────────────────────
PASS, FAIL, WARN = [], [], []
def check(name, actual, expected):
    (PASS if actual == expected else FAIL).append((name, actual, expected))
def ok(name, cond, detail=""):
    (PASS if cond else FAIL).append((name, detail or cond, True))

# ── snapshot (one read-only pass) ─────────────────────────────────
S = q("""
select json_build_object(
 'seasons', (select coalesce(json_agg(row_to_json(s) order by s.hijri_year), '[]') from (
     select id, name, hijri_year, closed_at is not null as closed, receipt_start_number, receipt_next_number,
            hotel_name, hotel_address, hotel_url, mina_address, mina_url, arafa_address, arafa_url from public.seasons) s),
 'passengers', (select coalesce(json_agg(row_to_json(p) order by p.passport), '[]') from (
     select id, season_id, name_ar, short_ar, name_en, short_en, passport, national_id, nat, dob, expiry, id_expiry, gender, phone,
            family_id, passenger_type, bus, flight, hotel_type, hotel_view, camp_mina, camp_arafa, custom_price, wants_flight,
            sort_order, created_by, bus_id, room_id, camp_mina_id, camp_arafa_id, flight_id, return_flight_id, flight_class,
            photo_url, passport_url, national_id_url, contract_url, hajj_permit_url, flight_ticket_url from public.passengers) p),
 'buses', (select coalesce(json_agg(row_to_json(b) order by b.id), '[]') from (select id, season_id, name, type, capacity from public.buses) b),
 'camps', (select coalesce(json_agg(row_to_json(c) order by c.id), '[]') from (select id, season_id, name, gender, type, page_type, capacity from public.camps) c),
 'rooms', (select coalesce(json_agg(row_to_json(r) order by r.id), '[]') from (select id, season_id, number, floor, type, capacity from public.rooms) r),
 'flights', (select coalesce(json_agg(row_to_json(f) order by f.id), '[]') from (select id, season_id, name, type, airline, date, time, arrival_date, arrival_time, from_airport, to_airport, capacity from public.flights) f),
 'pricing', (select coalesce(json_object_agg(key, json_build_object('amount', amount, 'label', label, 'type', type)), '{}') from public.pricing_settings),
 'snapshot', (select coalesce(json_agg(json_build_object('season_id', season_id, 'key', key, 'amount', amount)), '[]') from public.season_pricing_snapshot),
 'receipts', (select coalesce(json_agg(row_to_json(r) order by r.season_id, r.receipt_number), '[]') from (
     select id, season_id, receipt_number, total_amount, payer_name, method, payment_date, group_name, status, cancel_reason, notes from public.payment_receipts) r),
 'payments', (select coalesce(json_agg(row_to_json(x) order by x.id), '[]') from (select id, passenger_id, amount, payment_date, method, receipt_id from public.payments) x),
 'charges', (select coalesce(json_agg(row_to_json(c) order by c.id), '[]') from (select id, passenger_id, description, amount, type, notes, created_by from public.custom_charges) c),
 'groups', (select coalesce(json_agg(row_to_json(g) order by g.id), '[]') from (select id, season_id, name, notes from public.financial_groups) g),
 'members', (select coalesce(json_agg(row_to_json(m)), '[]') from (select group_id, passenger_id from public.financial_group_members) m),
 'announcements', (select coalesce(json_agg(row_to_json(a) order by a.id), '[]') from (
     select id, season_id, title, body, priority, show_at, expires_at, target_type, target_ids, push_sent_at,
            show_at <= now() and (expires_at is null or expires_at > now()) as visible_now from public.announcements) a),
 'company', (select row_to_json(c) from (select name_ar, name_en, tagline, color_primary, color_accent, color_sidebar, contact_phone, contact_email,
     admin_name, admin_phone, admin_whatsapp, country, city, commercial_registration, bank_name, bank_account_name, bank_account_number,
     bank_iban, bank_swift, portal_welcome_message, portal_help_message, portal_settings from public.company_config where id = 1) c),
 'assets', (select coalesce(json_agg(row_to_json(a) order by a.asset_key), '[]') from (select asset_key, asset_url, metadata from public.company_assets) a),
 'sessions', (select count(*) from public.pilgrim_sessions),
 'push', (select count(*) from public.pilgrim_push_subscriptions),
 'deliveries', (select count(*) from public.notification_deliveries),
 'operator', (select count(*) from public.user_profiles where is_active and (permissions->>'manage_payments')::boolean)
)""")

M = MANIFEST
H, A = M["active_season"], M["archived_season"]
seasons = S["seasons"]
active = [s for s in seasons if not s["closed"]]
archived = [s for s in seasons if s["closed"]]
check("seasons: exactly one active", len(active), 1)
check("seasons: exactly one archived", len(archived), 1)
if len(active) != 1 or len(archived) != 1:
    print("✗ cannot continue without exactly one active and one archived season"); sys.exit(1)
ACT, ARC = active[0], archived[0]
check("active season hijri year", ACT["hijri_year"], M["seasons"]["active"]["hijri_year"])
check("archived season hijri year", ARC["hijri_year"], M["seasons"]["archived"]["hijri_year"])
for f in M["seasons"]["active"]["location_fields_populated"]:
    ok(f"active season location {f} populated", bool((ACT.get(f) or "").strip()))

pas = S["passengers"]
act = [p for p in pas if p["season_id"] == ACT["id"]]
arc = [p for p in pas if p["season_id"] == ARC["id"]]
hj = [p for p in act if (p["passenger_type"] or "حاج") == "حاج"]
st = [p for p in act if (p["passenger_type"] or "حاج") != "حاج"]
def dist(rows, f):
    d = {}
    for r in rows:
        v = f(r); d[v] = d.get(v, 0) + 1
    return dict(sorted(d.items()))
srt = lambda d: dict(sorted(d.items()))

# ── people ────────────────────────────────────────────────────────
P = H["passengers"]
check("active passengers total", len(act), P["total"])
check("active passenger types", dist(act, lambda p: p["passenger_type"]), srt(P["by_passenger_type"]))
check("hajj by gender", dist(hj, lambda p: p["gender"]), srt(P["hajj_by_gender"]))
check("staff by gender", dist(st, lambda p: p["gender"]), srt(P["staff_by_gender"]))
check("staff by type/gender", {t: dist([p for p in st if p["passenger_type"] == t], lambda p: p["gender"]) for t in sorted(P["staff_by_type_and_gender"])},
      {t: srt({g: n for g, n in v.items() if n}) for t, v in sorted(P["staff_by_type_and_gender"].items())})
check("staff wants_flight", sum(1 for p in st if p["wants_flight"]), P["staff_wants_flight"])
base = lambda n: re.sub("ة$", "", n)
check("hajj nationality (base form)", dist(hj, lambda p: base(p["nat"])), srt(P["hajj_by_nationality_base"]))
fams = dist([p for p in hj if p["family_id"]], lambda p: p["family_id"])
check("families count", len(fams), P["families"]["count"])
check("family members", sum(fams.values()), P["families"]["members_total"])
check("family size distribution", dist(list(fams.values()), lambda n: str(n)), srt(P["families"]["size_distribution"]))
ok("families are hajj only", all(not p["family_id"] for p in st))
ok("dob format DD/MM/YYYY", all(re.fullmatch(r"\d{2}/\d{2}/\d{4}", p["dob"] or "") for p in pas))
ok("name fields populated", all(all((p[f] or "").strip() for f in P["name_fields_populated"]) for p in pas))
check("archived passengers", len(arc), A["passengers"]["total"])
check("archived types", dist(arc, lambda p: p["passenger_type"]), srt(A["passengers"]["by_passenger_type"]))
check("archived gender", dist(arc, lambda p: p["gender"]), srt(A["passengers"]["hajj_by_gender"]))

# ── synthetic markers ─────────────────────────────────────────────
SI = M["synthetic_identifiers"]
ok("every passenger created_by = demo-seed", all(p["created_by"] == SI["created_by_tag"] for p in pas), f"{sum(p['created_by'] != 'demo-seed' for p in pas)} not tagged")
ok("passport pattern DX+7 digits", all(re.fullmatch(r"DX\d{7}", p["passport"] or "") for p in pas))
ok("national id pattern 99+12 digits", all(re.fullmatch(r"99\d{12}", p["national_id"] or "") for p in pas))
ok("phones in non-routable range", all(p["phone"] is None or re.fullmatch(r"\+97400\d{6}", p["phone"]) for p in pas))
ok("passports unique", len({p["passport"] for p in pas}) == len(pas))
ok("company identity marked Demo", "DEMO" in (S["company"]["name_en"] or "") and "العرض" in (S["company"]["name_ar"] or ""))
sentinel = [a for a in S["assets"] if a["asset_key"] == "demo_environment_marker"]
ok("Demo sentinel present for this ref", len(sentinel) == 1 and sentinel[0]["metadata"].get("project_ref") == os.environ["DEMO_PROJECT_REF"])
for f in M["company"]["fields_populated"]:
    v = S["company"].get(f)
    ok(f"company {f} populated", bool(v) and (not isinstance(v, str) or v.strip() != ""))
check("operator account with manage_payments", S["operator"] >= M["auth"]["minimum_accounts"], True)

# ── commercial services ───────────────────────────────────────────
CS = H["commercial_services_hajj"]
for k in ("hotel_type", "hotel_view", "bus", "flight", "camp_mina", "camp_arafa"):
    check(f"service {k}", dist(hj, lambda p, k=k: p[k]), srt(CS[k]))
check("custom prices for خاص", sorted(float(p["custom_price"]) for p in hj if p["hotel_type"] == "خاص"), sorted(float(x) for x in CS["custom_price_for_خاص"]))

# ── resources ─────────────────────────────────────────────────────
by = lambda rows, key: {r["id"]: r for r in rows if r["season_id"] == key}
B, C, R, F = by(S["buses"], ACT["id"]), by(S["camps"], ACT["id"]), by(S["rooms"], ACT["id"]), by(S["flights"], ACT["id"])
occ = lambda rows, col, rid: sum(1 for p in rows if p[col] == rid)
check("buses count", len(B), H["buses"]["count"])
check("buses (type, capacity, hajj, staff)", sorted((b["type"], b["capacity"], occ(hj, "bus_id", b["id"]), occ(st, "bus_id", b["id"])) for b in B.values()),
      sorted((b["type"], b["capacity"], b["occupancy"]["hajj"], b["occupancy"]["staff"]) for b in H["buses"]["items"]))
check("hajj on a bus", sum(1 for p in hj if p["bus_id"]), H["buses"]["hajj_assigned"])
vip_bus = [b["id"] for b in B.values() if b["type"] == "VIP"]
coh = H["buses"]["service_coherence"]
check("VIP payers on VIP bus", sum(1 for p in hj if p["bus"] == "VIP" and p["bus_id"] in vip_bus), coh["vip_payers_on_vip_bus"])
check("VIP payers on regular bus (mismatch example)", sum(1 for p in hj if p["bus"] == "VIP" and p["bus_id"] and p["bus_id"] not in vip_bus), coh["vip_payers_on_regular_bus_mismatch"])
check("VIP payers unassigned", sum(1 for p in hj if p["bus"] == "VIP" and not p["bus_id"]), coh["vip_payers_unassigned"])
ok("no bus over capacity", all(occ(act, "bus_id", b["id"]) <= b["capacity"] for b in B.values()))

check("camps count", len(C), H["camps"]["count"])
exp_camps = [(c["gender"], c["type"], c["capacity"], c["occupancy"]["hajj"], c["occupancy"]["staff"], "منى") for c in H["camps"]["mina"]] + \
            [(c["gender"], c["type"], c["capacity"], c["occupancy"]["hajj"], c["occupancy"]["staff"], "عرفة") for c in H["camps"]["arafat"]]
col_for = lambda c: "camp_mina_id" if c["page_type"] == "منى" else "camp_arafa_id"
check("camps (gender, type, capacity, hajj, staff, page)", sorted((c["gender"], c["type"], c["capacity"], occ(hj, col_for(c), c["id"]), occ(st, col_for(c), c["id"]), c["page_type"]) for c in C.values()), sorted(exp_camps))
ok("every camp has a capacity", all(c["capacity"] for c in C.values()))
ok("camp occupants match camp gender", all(p["gender"] == C[p[col]]["gender"] for p in act for col in ("camp_mina_id", "camp_arafa_id") if p[col]))
ok("camp page types match column", all(C[p["camp_mina_id"]]["page_type"] == "منى" for p in act if p["camp_mina_id"]) and all(C[p["camp_arafa_id"]]["page_type"] == "عرفة" for p in act if p["camp_arafa_id"]))
check("hajj in Mina", sum(1 for p in hj if p["camp_mina_id"]), H["camps"]["hajj_assigned"]["mina"])
check("hajj in Arafat", sum(1 for p in hj if p["camp_arafa_id"]), H["camps"]["hajj_assigned"]["arafat"])
mc = H["camps"]["service_coherence"]["mina_خاص_payers"]
check("Mina خاص payers (in خاص, mismatch, unassigned)",
      (sum(1 for p in hj if p["camp_mina"] == "خاص" and p["camp_mina_id"] and C[p["camp_mina_id"]]["type"] == "خاص"),
       sum(1 for p in hj if p["camp_mina"] == "خاص" and p["camp_mina_id"] and C[p["camp_mina_id"]]["type"] != "خاص"),
       sum(1 for p in hj if p["camp_mina"] == "خاص" and not p["camp_mina_id"])),
      (mc["in_خاص_camp"], mc["in_regular_camp_mismatch"], mc["unassigned"]))

RM = H["rooms"]
check("rooms count", len(R), RM["count"])
ok("floors are numeric strings", all(re.fullmatch(r"\d+", r["floor"] or "") for r in R.values()))
ok("room types explicit and valid", all(r["type"] in RM["by_type"] for r in R.values()))
def room_state(r):
    if r["type"] == "مجلس": return "مجلس"
    if r["capacity"] is None: return "غير محدّدة"
    o = occ(act, "room_id", r["id"])
    return "تجاوز" if o > r["capacity"] else "جاهزة" if o == 0 else "مكتملة" if o >= r["capacity"] else "قيد التسكين"
check("room status totals", dist(list(R.values()), room_state), srt({k: v for k, v in RM["status_totals"].items() if v}))
for t, spec in RM["by_type"].items():
    rs = [r for r in R.values() if r["type"] == t]
    check(f"rooms {t}: count/capacity", (len(rs), sorted({r['capacity'] for r in rs})), (spec["rooms"], [spec["capacity_each"]]))
    check(f"rooms {t}: hajj/staff occupancy", (sum(occ(hj, "room_id", r["id"]) for r in rs), sum(occ(st, "room_id", r["id"]) for r in rs)), (spec["occupancy"]["hajj"], spec["occupancy"]["staff"]))
check("hajj housed", sum(1 for p in hj if p["room_id"]), RM["hajj_assigned"])
ok("every housed hajj sits in a room of the type they paid for", all(R[p["room_id"]]["type"] == p["hotel_type"] for p in hj if p["room_id"]))

FL = H["flights"]
check("flights count", len(F), FL["count"])
check("flights (type, airline, capacity, hajj, staff)",
      sorted((f["type"], f["airline"], f["capacity"], occ(hj, "flight_id" if f["type"] == "ذهاب" else "return_flight_id", f["id"]), occ(st, "flight_id" if f["type"] == "ذهاب" else "return_flight_id", f["id"])) for f in F.values()),
      sorted((f["type"], f["airline"], f["capacity"], f["occupancy"]["hajj"], f["occupancy"]["staff"]) for f in FL["items"]))
ok("flight fields populated", all(all((f[k] or "") for k in FL["fields_populated"]) for f in F.values()))
need = [p for p in hj if p["flight"] != "بدون"]
check("hajj needing a flight", len(need), FL["hajj_needing_flight"])
check("outbound assigned", sum(1 for p in hj if p["flight_id"]), FL["hajj_outbound_assigned"])
check("return assigned", sum(1 for p in hj if p["return_flight_id"]), FL["hajj_return_assigned"])
check("both legs", sum(1 for p in hj if p["flight_id"] and p["return_flight_id"]), FL["hajj_both_legs"])
check("outbound only", sum(1 for p in hj if p["flight_id"] and not p["return_flight_id"]), FL["hajj_outbound_only"])
check("بدون with a flight", sum(1 for p in hj if p["flight"] == "بدون" and (p["flight_id"] or p["return_flight_id"])), 0)
check("first class with outbound", sum(1 for p in hj if p["flight"] == "درجة أولى" and p["flight_id"]), FL["first_class_payers_with_outbound"])
ok("flight_class derived by the database (first class)", all(p["flight_class"] == "درجة أولى" for p in hj if p["flight"] == "درجة أولى" and p["flight_id"]))

# ── documents ─────────────────────────────────────────────────────
D = H["documents"]
cols = D["columns"]
for c in cols:
    check(f"hajj documents {c}", sum(1 for p in hj if p[c]), D["hajj_present_per_column"][c])
    check(f"staff documents {c}", sum(1 for p in st if p[c]), D["staff_present_per_column"][c])
trio = lambda p: (not p["photo_url"], not p["passport_url"], not p["national_id_url"])
STATES = {(False, False, False): "photo_passport_national_id_complete", (False, True, False): "missing_passport_only",
          (False, False, True): "missing_national_id_only", (True, False, False): "missing_photo_only", (False, True, True): "photo_only",
          (True, True, False): "missing_photo_and_passport", (True, False, True): "missing_photo_and_national_id", (True, True, True): "missing_all_three"}
check("identity document states", dist(hj, lambda p: STATES[trio(p)]), srt(D["hajj_identity_document_states"]))
ok("tickets only with an outbound flight", all(p["flight_id"] for p in act if p["flight_ticket_url"]))
check("archived document references", sum(1 for p in arc for c in cols if p[c]), A["documents"]["non_null_document_references"])

# ── operations room (the app's rules) ─────────────────────────────
anchor = dt.date.fromisoformat(M["demo_anchor_date"])
today = dt.date.today()
def pd(s):
    try:
        d, m, y = (int(x) for x in s.split("/")); return dt.date(y, m, d)
    except Exception: return None
def plus6(d):
    m = d.month + 6; y = d.year + (m - 1) // 12; m = (m - 1) % 12 + 1
    return dt.date(y, m, min(d.day, 28))
def ops(at):
    six = plus6(at)
    expd = lambda s: (pd(s) or dt.date.max) < at
    expg = lambda s: pd(s) is not None and at <= pd(s) < six
    phones = [p["phone"] for p in hj if p["phone"]]
    return {
        "expired_passport": sum(expd(p["expiry"]) for p in hj), "expiring_passport": sum(expg(p["expiry"]) for p in hj),
        "expired_id": sum(expd(p["id_expiry"]) for p in hj), "expiring_id": sum(expg(p["id_expiry"]) for p in hj),
        "missing_phone": sum(not p["phone"] for p in hj), "missing_passport": sum(not p["passport_url"] for p in hj),
        "missing_id": sum(not p["national_id_url"] for p in hj), "missing_photo": sum(not p["photo_url"] for p in hj),
        "missing_ticket": sum(not p["flight_ticket_url"] for p in hj), "missing_permit": sum(not p["hajj_permit_url"] for p in hj),
        "missing_hotel": sum(not p["room_id"] for p in hj), "missing_bus": sum(not p["bus_id"] for p in hj),
        "missing_mina": sum(not p["camp_mina_id"] for p in hj), "missing_arafah": sum(not p["camp_arafa_id"] for p in hj),
        "missing_flight": sum(p["flight"] != "بدون" and not p["flight_id"] for p in hj),
        "missing_return_flight": sum(p["flight"] != "بدون" and not p["return_flight_id"] for p in hj),
        "duplicate_phone_pilgrims": sum(1 for p in hj if p["phone"] and phones.count(p["phone"]) > 1),
    }
check("operations room counts at DEMO_ANCHOR_DATE", ops(anchor), H["operations_room_expected_hajj_counts"])
drift = (today - anchor).days
window = M["anchor_policy"]["drift_window_days"]
if 0 <= drift <= window:
    check(f"operations room counts today ({today}, {drift}d after anchor)", ops(today), H["operations_room_expected_hajj_counts"])
else:
    WARN.append(f"today is {drift} days from the anchor (window {window}): live expiry alerts may differ — refresh DEMO_ANCHOR_DATE")

# ── pricing ───────────────────────────────────────────────────────
PR = M["pricing"]
check("pricing keys", sorted(S["pricing"]), sorted(PR["keys"]))
check("live pricing amounts", {k: float(v["amount"]) for k, v in sorted(S["pricing"].items())}, {k: float(v) for k, v in sorted(PR["live_amounts"].items())})
snap = {r["key"]: float(r["amount"]) for r in S["snapshot"] if r["season_id"] == ARC["id"]}
check("archived pricing snapshot (by close_season)", dict(sorted(snap.items())), {k: float(v) for k, v in sorted(PR["archived_snapshot_amounts"].items())})
check("no orphan pricing-snapshot rows", sum(1 for r in S["snapshot"] if r["season_id"] not in {s["id"] for s in seasons}), 0)
check("active season has no snapshot", sum(1 for r in S["snapshot"] if r["season_id"] == ACT["id"]), 0)

# ── finance (the app's arithmetic, re-implemented independently) ──
live = {k: float(v["amount"]) for k, v in S["pricing"].items()}
pkg = {"ثنائية": "package_double", "ثلاثية": "package_triple", "رباعية": "package_quad", "فردية": "package_suite"}
rec_by_id = {r["id"]: r for r in S["receipts"]}
charges_by = {}
for c in S["charges"]: charges_by.setdefault(c["passenger_id"], []).append(c)
def due(p, prices):
    t = float(p["custom_price"] or 0) if p["hotel_type"] == "خاص" else prices.get(pkg.get(p["hotel_type"] or "ثنائية"), 0)
    if (p["hotel_view"] or "مطلة") == "مطلة": t += prices["addon_view"]
    if p["camp_mina"] == "خاص": t += prices["addon_mina"]
    if p["camp_arafa"] == "خاص": t += prices["addon_arafa"]
    if p["bus"] == "VIP": t += prices["addon_bus_vip"]
    if p["flight"] == "درجة أولى": t += prices["addon_first_class"]
    if p["flight"] == "بدون": t -= prices["discount_no_ticket"]
    for c in charges_by.get(p["id"], []): t += float(c["amount"]) if c["type"] == "إضافة" else -float(c["amount"])
    return max(0.0, t)
paid_by = {}
for x in S["payments"]:
    if rec_by_id.get(x["receipt_id"], {}).get("status") != "cancelled":
        paid_by[x["passenger_id"]] = paid_by.get(x["passenger_id"], 0) + float(x["amount"])
def status(d, pd_):
    if d <= 0 and pd_ <= 0: return "غير مسعّر"
    if pd_ > d: return "رصيد دائن"
    if pd_ >= d and d > 0: return "مسدد"
    return "جزئي" if pd_ > 0 else "لم يدفع"
FN = H["finance"]
check("finance status counts", dist(hj, lambda p: status(due(p, live), paid_by.get(p["id"], 0))), srt({k: v for k, v in FN["status_counts"].items() if v}))
ok("staff carry no payments", all(p["id"] not in paid_by for p in st))
rc = [r for r in S["receipts"] if r["season_id"] == ACT["id"]]
RC = FN["receipts"]
check("receipts total", len(rc), RC["total"])
check("receipts valid/cancelled", (sum(r["status"] == "valid" for r in rc), sum(r["status"] == "cancelled" for r in rc)), (RC["valid"], RC["cancelled"]))
check("receipts individual/group", (sum(not r["group_name"] for r in rc), sum(bool(r["group_name"]) for r in rc)), (RC["individual"], RC["group"]))
check("receipts by method", dist(rc, lambda r: r["method"]), srt(RC["by_method"]))
check("receipt number range", [min(r["receipt_number"] for r in rc), max(r["receipt_number"] for r in rc)], RC["number_range"])
ok("receipt numbers contiguous", sorted(r["receipt_number"] for r in rc) == list(range(RC["number_range"][0], RC["number_range"][1] + 1)))
check("active receipt_start_number", ACT["receipt_start_number"], M["seasons"]["active"]["receipt_start_number"])
check("active receipt_next_number = max + 1", ACT["receipt_next_number"], max(r["receipt_number"] for r in rc) + 1)
check("active receipt_next_number (contract)", ACT["receipt_next_number"], M["seasons"]["active"]["receipt_next_number"])
ok("cancelled receipts carry a reason", all(r["cancel_reason"] for r in rc if r["status"] == "cancelled"))
act_ids = {p["id"] for p in act}
lines = [x for x in S["payments"] if x["passenger_id"] in act_ids]
PL = FN["payment_lines"]
check("payment lines total", len(lines), PL["total"])
check("payment lines on cancelled receipts", sum(rec_by_id[x["receipt_id"]]["status"] == "cancelled" for x in lines), PL["on_cancelled_receipts"])
check("payment lines in group receipts", sum(bool(rec_by_id[x["receipt_id"]]["group_name"]) for x in lines), PL["group"])
check("legacy payments without receipt", sum(x["receipt_id"] is None for x in S["payments"]), PL["legacy_without_receipt"])
ok("receipt totals equal their lines", all(abs(float(r["total_amount"]) - sum(float(x["amount"]) for x in S["payments"] if x["receipt_id"] == r["id"])) < 0.005 for r in rc))
dates = {r["payment_date"] for r in rc}
check("distinct payment dates", len(dates), FN["payment_dates"]["distinct"])
lo, hi = FN["payment_dates"]["offset_range_days"]
ok("payment dates within anchor window", all(anchor + dt.timedelta(days=lo) <= dt.date.fromisoformat(d) <= anchor + dt.timedelta(days=hi) for d in dates))
cc = [c for c in S["charges"] if c["passenger_id"] in act_ids]
CC = FN["custom_charges"]
check("custom charges (total, إضافة, خصم, distinct)", (len(cc), sum(c["type"] == "إضافة" for c in cc), sum(c["type"] == "خصم" for c in cc), len({c["passenger_id"] for c in cc})),
      (CC["total"], CC["إضافة"], CC["خصم"], CC["distinct_pilgrims"]))
grp = [g for g in S["groups"] if g["season_id"] == ACT["id"]]
gids = {g["id"] for g in grp}
mem = [m for m in S["members"] if m["group_id"] in gids]
FG = FN["financial_groups"]
check("financial groups", len(grp), FG["count"])
check("group memberships", len(mem), FG["memberships"])
check("group size distribution", dist([sum(1 for m in mem if m["group_id"] == g) for g in gids], lambda n: str(n)), srt(FG["size_distribution"]))
ok("a pilgrim belongs to at most one group", len({m["passenger_id"] for m in mem}) == len(mem))
pid = {p["id"]: p for p in pas}
fam_groups = sum(1 for g in gids if len({pid[m["passenger_id"]]["family_id"] for m in mem if m["group_id"] == g}) == 1 and pid[next(m["passenger_id"] for m in mem if m["group_id"] == g)]["family_id"])
check("groups matching one family", fam_groups, FG["groups_matching_a_family"])
check("group members paying", sum(1 for m in mem if paid_by.get(m["passenger_id"], 0) > 0), FG["paying_members"])
check("fully unpaid groups", sum(1 for g in gids if all(paid_by.get(m["passenger_id"], 0) == 0 for m in mem if m["group_id"] == g)), FG["fully_unpaid_groups"])
arc_ids = {p["id"] for p in arc}
arc_rc = [r for r in S["receipts"] if r["season_id"] == ARC["id"]]
AF = A["finance"]
check("archived receipts", (len(arc_rc), sum(r["status"] == "valid" for r in arc_rc), [min(r["receipt_number"] for r in arc_rc), max(r["receipt_number"] for r in arc_rc)]),
      (AF["receipts"]["total"], AF["receipts"]["valid"], AF["receipts"]["number_range"]))
check("archived receipt_next_number", ARC["receipt_next_number"], M["seasons"]["archived"]["receipt_next_number"])
snapprices = dict(live); snapprices.update(snap)
check("archived finance status (snapshot pricing)", dist(arc, lambda p: status(due(p, snapprices), paid_by.get(p["id"], 0))), srt(AF["status_counts"]))

# ── announcements ─────────────────────────────────────────────────
AN = H["announcements"]
an = [a for a in S["announcements"] if a["season_id"] == ACT["id"]]
check("announcements", len(an), AN["count"])
check("announcements by priority", dist(an, lambda a: a["priority"]), srt(AN["by_priority"]))
check("announcements by target", dist(an, lambda a: a["target_type"]), srt(AN["by_target_type"]))
check("announcements visible now", sum(a["visible_now"] for a in an), AN["visible_in_portal"])
check("announcements without expiry", sum(a["expires_at"] is None for a in an), AN["without_expires_at"])
check("announcements push_sent_at", sum(a["push_sent_at"] is not None for a in an), AN["push_sent_at_set"])
ok("targeted announcements carry ids", all(len(a["target_ids"] or []) > 0 for a in an if a["target_type"] != "all"))
check("archived announcements", sum(1 for a in S["announcements"] if a["season_id"] == ARC["id"]), A["announcements"]["count"])

# ── notifications / sessions ──────────────────────────────────────
NT = H["notifications"]
check("notification deliveries", S["deliveries"], NT["notification_deliveries"])
check("push subscriptions", S["push"], NT["pilgrim_push_subscriptions"])
check("pilgrim sessions (clean seed)", S["sessions"], NT["pilgrim_sessions"])

# ── portal demo pilgrim ───────────────────────────────────────────
PP = H["portal_demo_pilgrim"]
pp = [p for p in act if p["passport"] == PP["passport"]]
ok("portal pilgrim exists once in the active season", len(pp) == 1)
if pp:
    p = pp[0]
    check("portal pilgrim dob/type/gender", (p["dob"], p["passenger_type"], p["gender"]), (PP["dob"], PP["passenger_type"], PP["gender"]))
    ok("portal pilgrim fully allocated", all(p[c] for c in ("bus_id", "room_id", "camp_mina_id", "camp_arafa_id", "flight_id", "return_flight_id")))
    ok("portal pilgrim family ≥ 3", p["family_id"] and sum(1 for q_ in act if q_["family_id"] == p["family_id"]) >= 3)
    ok("portal pilgrim has roommates", sum(1 for q_ in act if q_["room_id"] == p["room_id"]) >= 2)
    ok("portal pilgrim photo/permit/ticket referenced", all(p[c] for c in ("photo_url", "hajj_permit_url", "flight_ticket_url")))
    ok("portal pilgrim phone unique", p["phone"] and sum(1 for q_ in pas if q_["phone"] == p["phone"]) == 1)
    six = plus6(anchor)
    ok("portal pilgrim documents valid", all(pd(p[c]) and pd(p[c]) >= six for c in ("expiry", "id_expiry")))

# ── Storage: existence, orphans, bytes ─────────────────────────────
API = os.environ["DEMO_SUPABASE_URL"].rstrip("/")
KEY = os.environ["DEMO_SERVICE_ROLE_KEY"]
def http(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()
def listall(bucket, prefix=""):
    out, off = [], 0
    while True:
        page = json.loads(http("POST", f"{API}/storage/v1/object/list/{bucket}", {"prefix": prefix, "limit": 1000, "offset": off, "sortBy": {"column": "name", "order": "asc"}}))
        for e in page:
            path = f"{prefix}/{e['name']}" if prefix else e["name"]
            if e.get("id") is None: out += listall(bucket, path)
            else: out.append((path, (e.get("metadata") or {}).get("size"), (e.get("metadata") or {}).get("mimetype")))
        if len(page) < 1000: return out
        off += 1000
objs = {b: {p: (s, m) for p, s, m in listall(b)} for b in ("passengers-docs", "company-assets", "company-private")}
refs = [(p, c, p[c]) for p in pas for c in cols if p[c]]
EO = M["storage"]["expected_objects"]
check("passengers-docs objects", len(objs["passengers-docs"]), EO["passengers-docs"]["total"])
check("company-assets objects", len(objs["company-assets"]), EO["company-assets"])
check("company-private objects", len(objs["company-private"]), EO["company-private"])
check("non-null references without an object", [k for _, _, k in refs if k not in objs["passengers-docs"]], [])
refset = [k for _, _, k in refs]
check("orphan passenger objects (no reference)", sorted(set(objs["passengers-docs"]) - set(refset)), [])
check("objects referenced more than once", sorted({k for k in refset if refset.count(k) > 1}), [])
ok("keys follow <passenger_id>/<doc_type>_demo.<ext>", all(re.fullmatch(rf"{p['id']}/{c[:-4]}_demo\.(png|pdf)", k) for p, c, k in refs))
ext_ok = all(m in M["storage"]["allowed_formats"] for _, (_, m) in objs["passengers-docs"].items())
ok("stored content types allowed", ext_ok)
assets = {a["asset_key"]: a for a in S["assets"]}
check("company asset keys", sorted(k for k in assets if k != "demo_environment_marker"), sorted(M["company"]["public_asset_keys"] + M["company"]["private_asset_keys"]))
pub_prefix = f"{API}/storage/v1/object/public/company-assets/"
for k in M["company"]["public_asset_keys"]:
    u = (assets.get(k) or {}).get("asset_url", "")
    ok(f"public asset {k} stores a full URL to an existing object", u.startswith(pub_prefix) and urllib.parse.unquote(u[len(pub_prefix):]) in objs["company-assets"])
for k in M["company"]["private_asset_keys"]:
    u = (assets.get(k) or {}).get("asset_url", "")
    ok(f"private asset {k} stores a key to an existing object", bool(u) and "://" not in u and u in objs["company-private"])

MAGIC = {"png": b"\x89PNG\r\n\x1a\n", "pdf": b"%PDF", "jpg": b"\xff\xd8\xff"}
digests = {}
if SKIP_DL:
    WARN.append("downloads skipped (--skip-download): bytes not verified")
else:
    bad = []
    for p, c, k in refs:
        data = http("GET", f"{API}/storage/v1/object/passengers-docs/{urllib.parse.quote(k)}")
        ext = k.rsplit(".", 1)[-1]
        if not data.startswith(MAGIC[ext]) or len(data) > 5 * 1024 * 1024 or b"<html" in data[:512].lower():
            bad.append(k)
        digests[f"{p['passport']}/{c}"] = hashlib.sha256(data).hexdigest()
    for k in M["company"]["public_asset_keys"]:
        u = assets[k]["asset_url"]
        with urllib.request.urlopen(u, timeout=60) as r:   # anonymous — as a browser would
            data = r.read()
        if not data.startswith(MAGIC["png"]): bad.append(u)
        digests[f"company/{k}"] = hashlib.sha256(data).hexdigest()
    for k in M["company"]["private_asset_keys"]:
        data = http("GET", f"{API}/storage/v1/object/company-private/{urllib.parse.quote(assets[k]['asset_url'])}")
        if not data.startswith(MAGIC["png"]): bad.append(k)
        digests[f"company/{k}"] = hashlib.sha256(data).hexdigest()
    check("downloaded objects with valid magic bytes / size / not HTML", bad, [])
    check("objects downloaded and checked", len(digests), EO["total"])
    # the signed-URL path the app uses for staff viewing
    k = pp[0]["photo_url"] if pp else refs[0][2]
    signed = json.loads(http("POST", f"{API}/storage/v1/object/sign/passengers-docs/{urllib.parse.quote(k)}", {"expiresIn": 300}))
    with urllib.request.urlopen(f"{API}/storage/v1{signed['signedURL']}", timeout=60) as r:
        ok("a signed URL for a private document opens", r.read().startswith(MAGIC["png"]))

# ── fingerprint (ids and wall-clock fields excluded) ──────────────
if FP_OUT:
    yr = {s["id"]: s["hijri_year"] for s in seasons}
    name_of = {}
    for tbl, label in (("buses", "name"), ("camps", "name"), ("rooms", "number"), ("flights", "name")):
        for r in S[tbl]: name_of[(tbl, r["id"])] = f"{yr[r['season_id']]}:{r[label]}"
    canon = {
        "seasons": [{k: v for k, v in s.items() if k != "id"} for s in seasons],
        "passengers": [{**{k: v for k, v in p.items() if k not in ("id", "season_id") and not k.endswith("_url") and k not in ("bus_id", "room_id", "camp_mina_id", "camp_arafa_id", "flight_id", "return_flight_id")},
                        "season": yr[p["season_id"]], "bus": [p["bus"], name_of.get(("buses", p["bus_id"]))], "room": name_of.get(("rooms", p["room_id"])),
                        "mina": name_of.get(("camps", p["camp_mina_id"])), "arafa": name_of.get(("camps", p["camp_arafa_id"])),
                        "out": name_of.get(("flights", p["flight_id"])), "ret": name_of.get(("flights", p["return_flight_id"])),
                        "docs": sorted(c for c in cols if p[c])} for p in pas],
        "resources": {t: sorted([{**{k: v for k, v in r.items() if k not in ("id", "season_id")}, "season": yr[r["season_id"]]} for r in S[t]], key=json.dumps) for t in ("buses", "camps", "rooms", "flights")},
        "pricing": S["pricing"], "snapshot": sorted([{"season": yr[r["season_id"]], "key": r["key"], "amount": r["amount"]} for r in S["snapshot"] if r["season_id"] in yr], key=json.dumps),
        "receipts": [{**{k: v for k, v in r.items() if k not in ("id", "season_id")}, "season": yr[r["season_id"]],
                      "lines": sorted([pid[x["passenger_id"]]["passport"], x["amount"]] for x in S["payments"] if x["receipt_id"] == r["id"])}
                     for r in S["receipts"] if r["season_id"] in yr],
        "charges": sorted([{**{k: v for k, v in c.items() if k not in ("passenger_id", "id")}, "passport": pid[c["passenger_id"]]["passport"]} for c in S["charges"]], key=json.dumps),
        "groups": sorted([{"name": g["name"], "notes": g["notes"], "season": yr[g["season_id"]], "members": sorted(pid[m["passenger_id"]]["passport"] for m in S["members"] if m["group_id"] == g["id"])} for g in S["groups"]], key=json.dumps),
        "announcements": sorted([{k: v for k, v in a.items() if k not in ("id", "season_id", "target_ids", "visible_now")} | {"season": yr[a["season_id"]], "targets": len(a["target_ids"] or [])} for a in S["announcements"]], key=json.dumps),
        "company": S["company"],
        "assets": sorted(k for k in assets),
        "object_digests": dict(sorted(digests.items())),
    }
    blob = json.dumps(canon, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    fp = hashlib.sha256(blob.encode()).hexdigest()
    with open(FP_OUT, "w", encoding="utf-8") as f:
        json.dump({"fingerprint": fp, "objects_hashed": len(digests), "canonical": canon}, f, ensure_ascii=False, sort_keys=True, indent=1, default=str)
    print(f"  fingerprint: {fp}  ({len(digests)} object digests)")

# ── report ────────────────────────────────────────────────────────
for w in WARN: print(f"  ⚠ {w}")
for name, a, e in FAIL:
    print(f"  ✗ {name}\n      actual:   {json.dumps(a, ensure_ascii=False, default=str)[:400]}\n      expected: {json.dumps(e, ensure_ascii=False, default=str)[:400]}")
print(f"\n{'✓' if not FAIL else '✗'} verify-demo: {len(PASS)} checks passed, {len(FAIL)} failed, {len(WARN)} warnings")
sys.exit(1 if FAIL else 0)
