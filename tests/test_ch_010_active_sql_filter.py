from app.routers.challenges import get_active_challenges

class _Map:
    def __init__(self, rows): self._rows = rows
    def all(self): return self._rows

class _Res:
    def __init__(self, rows): self._rows = rows
    def mappings(self): return _Map(self._rows)

class CaptureSession:
    def __init__(self):
        self.sqls = []
    def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        return _Res([])

def test_ch_010_active_sql_filter_non_terminal():
    db = CaptureSession()
    _ = get_active_challenges(user_id=1, db=db)

    assert len(db.sqls) >= 1
    s = db.sqls[0]
    assert "TRIM(UPPER(ci.status)) NOT IN ('SUCCESS','FAILED')" in s