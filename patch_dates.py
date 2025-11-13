import pathlib
p = pathlib.Path("/app/app/routers/groups_a41.py")
s = p.read_text(encoding="utf-8")
s = s.replace("ec.created_at >= :start_date::timestamptz", "ec.created_at::date >= :start_date::date")
s = s.replace("ec.created_at < (:end_date::date + INTERVAL '1 day')", "ec.created_at::date <= :end_date::date")
p.write_text(s, encoding="utf-8")
print("OK patched")
