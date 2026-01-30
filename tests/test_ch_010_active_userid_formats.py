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
        self.params = []
    def execute(self, sql, params=None):
        self.sqls.append(str(sql))
        self.params.append(params or {})
        return _Res([])

def test_ch_010_active_passes_userid_str_and_uuid():
    db = CaptureSession()
    _ = get_active_challenges(user_id=1, db=db)

    assert db.params, "execute() not called"
    p = db.params[0]
    assert p["user_id_str"] == "1"
    assert p["user_id_uuid"] == "00000000-0000-0000-0000-000000000001"

    joined = "\n".join(db.sqls)
    assert "IN (:user_id_str, :user_id_uuid)" in joined