from datetime import datetime, timedelta

from app.routers.challenges import evaluate_challenge


class _ExecResult:
    def __init__(self, row=None):
        self._row = row

    def mappings(self):
        return self

    def first(self):
        return self._row


class FakeSession:
    def __init__(self, select_row, ref_row, cur_row):
        self.select_row = select_row
        self.ref_row = ref_row
        self.cur_row = cur_row

    def execute(self, stmt, params=None):
        sql = str(stmt)

        if "FROM public.challenge_instances" in sql and "JOIN public.challenges" in sql:
            return _ExecResult(self.select_row)

        if "FROM co2_cart_history" in sql:
            # differentiate ref vs cur by operator (< :end) vs (<= :end)
            if "created_at < :end" in sql:
                return _ExecResult(self.ref_row)
            return _ExecResult(self.cur_row)

        # UPDATE or other: no-op
        return _ExecResult(None)

    def commit(self):
        return None

    def rollback(self):
        return None


def test_ch_013_progress_uses_target_value_pct():
    now = datetime.utcnow()
    start = now - timedelta(days=1)
    end = now + timedelta(days=29)

    select_row = {
        "instance_id": 3,
        "challenge_id": 2,
        "user_id": "1",
        "start_date": start,
        "end_date": end,
        "status": "ACTIVE",
        "created_at": start,
        "updated_at": start,
        "code": "CO2_30D_MINUS_10",
        "name": "CO2 30d -10%",
        "metric": "CO2",
        "logic_type": "REDUCTION_PCT",
        "period_type": "DAYS",
        "target_value": 10.0,  # 10% (raw)
    }

    # reference 100kg, current 95kg => reduction 5% => progress 50% of target 10%
    ref_row = {"total_co2_g": 100000.0, "days_count": 10}
    cur_row = {"total_co2_g": 95000.0, "days_count": 5}

    db = FakeSession(select_row, ref_row, cur_row)
    res = evaluate_challenge(user_id=1, instance_id=3, db=db)

    assert res.status == "en_cours"
    assert abs(res.progress_percent - 50.0) < 0.01


def test_ch_013_not_enough_reference_history():
    now = datetime.utcnow()
    start = now - timedelta(days=1)
    end = now + timedelta(days=29)

    select_row = {
        "instance_id": 3,
        "challenge_id": 2,
        "user_id": "1",
        "start_date": start,
        "end_date": end,
        "status": "ACTIVE",
        "created_at": start,
        "updated_at": start,
        "code": "CO2_30D_MINUS_10",
        "name": "CO2 30d -10%",
        "metric": "CO2",
        "logic_type": "REDUCTION_PCT",
        "period_type": "DAYS",
        "target_value": 10.0,
    }

    # ref exists but days_count too low => treated as not enough history
    ref_row = {"total_co2_g": 100000.0, "days_count": 2}
    cur_row = {"total_co2_g": 95000.0, "days_count": 1}

    db = FakeSession(select_row, ref_row, cur_row)
    res = evaluate_challenge(user_id=1, instance_id=3, db=db)

    assert res.status == "en_cours"
    assert res.progress_percent is None
    assert "Pas assez d'historique CO2" in (res.message or "")