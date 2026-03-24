"""Tests for stats route with absence-project based presence calculation."""

import importlib
import os

BASE_ENTRY = "/api/v1/time-entry"
BASE_STATS = "/api/v1/stats"


def make_payload(user_id, project_id, **kwargs):
    payload = {
        "user_id": user_id,
        "project_id": project_id,
        "start_date": "2026-03-02",
        "start_period": "morning",
        "end_date": "2026-03-02",
        "end_period": "evening",
        "week_number": 10,
        "year": 2026,
    }
    payload.update(kwargs)
    return payload


def _get_user(stats_payload, user_id):
    return next(u for u in stats_payload["users"] if u["id"] == user_id)


def test_stats_presence_is_ratio_of_non_absence_projects(
    client, app, user_alice, project_dev, project_abs
):
    app.config["STATS_EXCLUDE_CODES"] = ["ABS"]

    rv_work = client.post(
        BASE_ENTRY,
        json=make_payload(
            user_alice.id,
            project_dev.id,
            start_date="2026-03-02",
            end_date="2026-03-02",
            start_period="morning",
            end_period="evening",
        ),
    )
    assert rv_work.status_code == 201

    rv_abs = client.post(
        BASE_ENTRY,
        json=make_payload(
            user_alice.id,
            project_abs.id,
            start_date="2026-03-03",
            end_date="2026-03-03",
            start_period="morning",
            end_period="midday",
        ),
    )
    assert rv_abs.status_code == 201

    rv_stats = client.get(f"{BASE_STATS}?granularity=month&year=2026&month=3")
    assert rv_stats.status_code == 200
    data = rv_stats.get_json()

    alice = _get_user(data, user_alice.id)
    assert alice["worked_half_days"] == 2
    assert alice["absent_half_days"] == 1
    assert alice["total_classified_half_days"] == 3
    assert alice["presence_rate"] == 0.6667
    assert alice["absence_rate"] == 0.3333

    assert data["possible_half_days"] == 3
    assert [p["name"] for p in data["projects"]] == ["Development"]
    assert [c["code"] for c in data["tracking_codes"]] == ["DEV"]


def test_stats_absence_only_gives_zero_presence_rate(
    client, app, user_alice, project_abs
):
    app.config["STATS_EXCLUDE_CODES"] = ["ABS"]

    rv_abs = client.post(
        BASE_ENTRY,
        json=make_payload(
            user_alice.id,
            project_abs.id,
            start_date="2026-03-02",
            end_date="2026-03-02",
            start_period="morning",
            end_period="evening",
        ),
    )
    assert rv_abs.status_code == 201

    rv_stats = client.get(f"{BASE_STATS}?granularity=month&year=2026&month=3")
    assert rv_stats.status_code == 200
    data = rv_stats.get_json()

    alice = _get_user(data, user_alice.id)
    assert alice["worked_half_days"] == 0
    assert alice["absent_half_days"] == 2
    assert alice["total_classified_half_days"] == 2
    assert alice["presence_rate"] == 0.0
    assert alice["absence_rate"] == 1.0

    assert data["possible_half_days"] == 2
    assert data["projects"] == []
    assert data["tracking_codes"] == []

    w10 = next(t for t in data["trend"] if t.get("week") == 10)
    assert w10["half_days"] == 0
    assert w10["possible_half_days"] == 2


def test_stats_period_without_entries_returns_zero_classified_time(
    client, app, user_alice
):
    app.config["STATS_EXCLUDE_CODES"] = ["ABS"]

    rv_stats = client.get(f"{BASE_STATS}?granularity=month&year=2026&month=3")
    assert rv_stats.status_code == 200
    data = rv_stats.get_json()

    alice = _get_user(data, user_alice.id)
    assert alice["worked_half_days"] == 0
    assert alice["absent_half_days"] == 0
    assert alice["total_classified_half_days"] == 0
    assert alice["presence_rate"] == 0.0
    assert alice["absence_rate"] == 0.0

    assert data["possible_half_days"] == 0


def test_config_parses_stats_exclude_codes_env():
    config_module = importlib.import_module("app.config")
    original_codes = os.environ.get("STATS_EXCLUDE_CODES")

    try:
        os.environ["STATS_EXCLUDE_CODES"] = " abs, rtt "

        importlib.reload(config_module)
        assert config_module.Config.STATS_EXCLUDE_CODES == ["ABS", "RTT"]
    finally:
        if original_codes is None:
            os.environ.pop("STATS_EXCLUDE_CODES", None)
        else:
            os.environ["STATS_EXCLUDE_CODES"] = original_codes

        importlib.reload(config_module)
