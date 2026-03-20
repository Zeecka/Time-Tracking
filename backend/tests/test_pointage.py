"""
Tests for TimeEntry routes — complex user scenarios.

Covers:
 - Basic CRUD
 - Overlap detection (same day, half-day boundary, cross-day)
 - Adjacent-entry merging with note concatenation
 - Project extension (updating dates to trigger merge)
 - Bulk creation with mixed valid/invalid entries
 - Validation edge-cases (bad dates, bad periods, week mismatch)
 - Multi-user isolation (overlapping dates are OK for different users)
"""

import io

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE = "/api/v1/time-entries"


def make_payload(user_id, project_id, **kwargs):
    """Build a minimal valid time entry payload for week 10, 2026 (Mon=2026-03-02)."""
    defaults = {
        "user_id": user_id,
        "project_id": project_id,
        "start_date": "2026-03-02",
        "start_period": "morning",
        "end_date": "2026-03-02",
        "end_period": "evening",
        "week_number": 10,
        "year": 2026,
    }
    defaults.update(kwargs)
    return defaults


def post_time_entry(client, payload):
    return client.post(BASE, json=payload, content_type="application/json")


def put_time_entry(client, entry_id, payload):
    return client.put(
        f"{BASE}/{entry_id}", json=payload, content_type="application/json"
    )


class TestTimeEntryCsvImportExport:
    def test_export_time_entry_csv(self, client, user_alice, project_dev):
        rv_create = post_time_entry(
            client, make_payload(user_alice.id, project_dev.id)
        )
        assert rv_create.status_code == 201

        rv = client.get(f"{BASE}/export-csv")
        assert rv.status_code == 200
        body = rv.data.decode("utf-8")
        assert "start_date" in body
        assert "Alice" in body
        assert "Development" in body

    def test_import_time_entry_csv(self, client, user_alice, project_dev):
        csv_content = (
            "start_date,start_period,end_date,end_period,week_number,year,user,project,note\n"
            "2026-03-02,morning,2026-03-02,evening,10,2026,Alice,Development,Import test\n"
        )
        rv = client.post(
            f"{BASE}/import-csv",
            data={"file": (io.BytesIO(csv_content.encode("utf-8")), "entries.csv")},
            content_type="multipart/form-data",
        )

        assert rv.status_code == 201
        data = rv.get_json()
        assert data["created"] == 1
        assert len(data["errors"]) == 0


# ---------------------------------------------------------------------------
# Basic CRUD
# ---------------------------------------------------------------------------


class TestTimeEntryCRUD:
    def test_create_full_day(self, client, user_alice, project_dev):
        """Create a simple full-day entry and check the response."""
        payload = make_payload(user_alice.id, project_dev.id)
        rv = post_time_entry(client, payload)
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["start_date"] == "2026-03-02"
        assert data["start_period"] == "morning"
        assert data["end_period"] == "evening"
        assert data["user"]["id"] == user_alice.id

    def test_create_half_day_morning(self, client, user_alice, project_dev):
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_period="morning",
                end_period="midday",
            ),
        )
        assert rv.status_code == 201
        assert rv.get_json()["end_period"] == "midday"

    def test_create_half_day_afternoon(self, client, user_alice, project_dev):
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_period="midday",
                end_period="evening",
            ),
        )
        assert rv.status_code == 201

    def test_get_time_entry_by_id(self, client, user_alice, project_dev):
        rv = post_time_entry(client, make_payload(user_alice.id, project_dev.id))
        eid = rv.get_json()["id"]
        rv2 = client.get(f"{BASE}/{eid}")
        assert rv2.status_code == 200
        assert rv2.get_json()["id"] == eid

    def test_delete_time_entry(self, client, user_alice, project_dev):
        rv = post_time_entry(client, make_payload(user_alice.id, project_dev.id))
        eid = rv.get_json()["id"]
        rv_del = client.delete(f"{BASE}/{eid}")
        assert rv_del.status_code == 204
        rv_get = client.get(f"{BASE}/{eid}")
        assert rv_get.status_code == 404

    def test_create_with_note(self, client, user_alice, project_dev):
        payload = make_payload(
            user_alice.id,
            project_dev.id,
            note="Critical code review",
        )
        rv = post_time_entry(client, payload)
        assert rv.status_code == 201
        assert rv.get_json()["note"] == "Critical code review"

    def test_update_note(self, client, user_alice, project_dev):
        rv = post_time_entry(client, make_payload(user_alice.id, project_dev.id))
        eid = rv.get_json()["id"]
        rv2 = put_time_entry(client, eid, {"note": "Added note"})
        assert rv2.status_code == 200
        assert rv2.get_json()["note"] == "Added note"


# ---------------------------------------------------------------------------
# Overlap detection
# ---------------------------------------------------------------------------


class TestOverlapDetection:
    """Attempting to create a time entry that overlaps an existing one for the
    same user must return HTTP 409 Conflict."""

    def _create_monday_full(self, client, user_id, project_id):
        return post_time_entry(
            client,
            make_payload(
                user_id,
                project_id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="evening",
            ),
        )

    def test_exact_same_slot_rejected(
        self, client, user_alice, project_dev, project_bug
    ):
        """Same day morning→evening for same user: second entry must be rejected."""
        rv1 = self._create_monday_full(client, user_alice.id, project_dev.id)
        assert rv1.status_code == 201

        rv2 = self._create_monday_full(client, user_alice.id, project_bug.id)
        assert rv2.status_code == 409
        assert "overlaps" in rv2.get_json()["error"].lower()

    def test_partial_overlap_morning_vs_fullday(
        self, client, user_alice, project_dev, project_bug
    ):
        """Morning-only entry conflicts with a full-day entry on the same day."""
        post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_period="morning",
                end_period="evening",
            ),
        )
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_bug.id,
                start_period="morning",
                end_period="midday",
            ),
        )
        assert rv.status_code == 409

    def test_adjacent_halves_not_overlapping(
        self, client, user_alice, project_dev, project_bug
    ):
        """Morning entry (morning→midday) and afternoon entry (midday→evening) on the same
        day are adjacent, NOT overlapping. Both should be accepted (and then
        auto-merged if same project).  Here we use two different projects so
        no merge happens, but no conflict either."""
        rv1 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_period="morning",
                end_period="midday",
            ),
        )
        assert rv1.status_code == 201

        rv2 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_bug.id,
                start_period="midday",
                end_period="evening",
            ),
        )
        assert rv2.status_code == 201

    def test_multiday_overlap_rejected(
        self, client, user_alice, project_dev, project_bug
    ):
        """Monday–Wednesday full span conflicts with a Tuesday-only entry."""
        post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-04",
                end_period="evening",
            ),
        )
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_bug.id,
                start_date="2026-03-03",
                start_period="morning",
                end_date="2026-03-03",
                end_period="evening",
            ),
        )
        assert rv.status_code == 409

    def test_different_users_same_slot_allowed(
        self, client, user_alice, user_bob, project_dev
    ):
        """Two different users can record the same time slot with no conflict."""
        rv1 = self._create_monday_full(client, user_alice.id, project_dev.id)
        assert rv1.status_code == 201

        rv2 = self._create_monday_full(client, user_bob.id, project_dev.id)
        assert rv2.status_code == 201

    def test_overlap_via_update_rejected(
        self, client, user_alice, project_dev, project_bug
    ):
        """Extending an entry via PUT such that it now overlaps another must be rejected."""
        rv1 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="midday",
            ),
        )
        rv2 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_bug.id,
                start_date="2026-03-02",
                start_period="midday",
                end_date="2026-03-02",
                end_period="evening",
            ),
        )
        eid1 = rv1.get_json()["id"]
        rv3 = put_time_entry(
            client,
            eid1,
            {"end_date": "2026-03-02", "end_period": "evening"},
        )
        assert rv3.status_code == 409


# ---------------------------------------------------------------------------
# Adjacent merging
# ---------------------------------------------------------------------------


class TestAdjacentMerge:
    """Two consecutive entries for the same user+project must be auto-merged."""

    def test_same_day_halves_merged(self, client, user_alice, project_dev):
        """Morning then afternoon, same project → merged into one full-day entry."""
        rv1 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="midday",
            ),
        )
        assert rv1.status_code == 201
        eid1 = rv1.get_json()["id"]

        rv2 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="midday",
                end_date="2026-03-02",
                end_period="evening",
            ),
        )
        assert rv2.status_code == 201
        merged = rv2.get_json()
        assert merged["start_period"] == "morning"
        assert merged["end_period"] == "evening"
        rv_get = client.get(f"{BASE}/{eid1}")
        assert rv_get.status_code == 404

    def test_consecutive_days_merged(self, client, user_alice, project_dev, db):
        """Monday full + Tuesday full → merged after second POST."""
        rv1 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="evening",
            ),
        )
        eid1 = rv1.get_json()["id"]

        rv2 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-03",
                start_period="morning",
                end_date="2026-03-03",
                end_period="evening",
            ),
        )
        assert rv2.status_code == 201
        merged = rv2.get_json()
        assert merged["start_date"] == "2026-03-02"
        assert merged["end_date"] == "2026-03-03"
        assert merged["start_period"] == "morning"
        assert merged["end_period"] == "evening"
        assert client.get(f"{BASE}/{eid1}").status_code == 404

    def test_merge_concatenates_notes(self, client, user_alice, project_dev):
        """Notes from both merged entries are joined with a newline."""
        rv1 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="midday",
                note="Morning note",
            ),
        )
        rv2 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="midday",
                end_date="2026-03-02",
                end_period="evening",
                note="Afternoon note",
            ),
        )
        assert rv2.status_code == 201
        note = rv2.get_json()["note"]
        assert "Morning note" in note
        assert "Afternoon note" in note

    def test_no_merge_different_project(
        self, client, user_alice, project_dev, project_bug
    ):
        """Adjacent entries with *different* projects must NOT be merged."""
        post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="midday",
            ),
        )
        rv2 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_bug.id,
                start_date="2026-03-02",
                start_period="midday",
                end_date="2026-03-02",
                end_period="evening",
            ),
        )
        assert rv2.status_code == 201
        data = rv2.get_json()
        assert data["start_date"] == "2026-03-02"
        assert data["start_period"] == "midday"

    def test_no_merge_across_intermediate_half_day_other_project(
        self, client, user_alice, project_dev, project_bug
    ):
        """A Monday full day + B Tuesday morning + A Tuesday afternoon must
        not merge the two A entries across the occupied Tuesday morning slot."""
        rv_a_monday = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="evening",
            ),
        )
        assert rv_a_monday.status_code == 201
        monday_a_id = rv_a_monday.get_json()["id"]

        rv_b_tuesday_morning = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_bug.id,
                start_date="2026-03-03",
                start_period="morning",
                end_date="2026-03-03",
                end_period="midday",
            ),
        )
        assert rv_b_tuesday_morning.status_code == 201

        rv_a_tuesday_afternoon = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-03",
                start_period="midday",
                end_date="2026-03-03",
                end_period="evening",
            ),
        )
        assert rv_a_tuesday_afternoon.status_code == 201

        tuesday_a = rv_a_tuesday_afternoon.get_json()
        assert tuesday_a["start_date"] == "2026-03-03"
        assert tuesday_a["start_period"] == "midday"
        assert tuesday_a["end_date"] == "2026-03-03"
        assert tuesday_a["end_period"] == "evening"

        monday_a = client.get(f"{BASE}/{monday_a_id}")
        assert monday_a.status_code == 200
        monday_a_data = monday_a.get_json()
        assert monday_a_data["start_date"] == "2026-03-02"
        assert monday_a_data["end_date"] == "2026-03-02"

    def test_three_way_merge(self, client, user_alice, project_dev):
        """Adding a new entry that bridges two non-adjacent existing entries
        triggers a three-way merge: before + new + after → one entry.

        A = Monday   morning→evening  (2026-03-02)
        C = Wednesday morning→evening (2026-03-04)  ← NOT adjacent to A (Tuesday gap)
        B = Tuesday   morning→evening (2026-03-03)  ← bridges A and C
        """
        rv_left = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="evening",
            ),
        )
        assert rv_left.status_code == 201
        left_id = rv_left.get_json()["id"]

        rv_right = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-04",
                start_period="morning",
                end_date="2026-03-04",
                end_period="evening",
            ),
        )
        assert rv_right.status_code == 201
        right_id = rv_right.get_json()["id"]

        rv_mid = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-03",
                start_period="morning",
                end_date="2026-03-03",
                end_period="evening",
            ),
        )
        assert rv_mid.status_code == 201
        merged = rv_mid.get_json()
        assert merged["start_date"] == "2026-03-02"
        assert merged["start_period"] == "morning"
        assert merged["end_date"] == "2026-03-04"
        assert merged["end_period"] == "evening"
        assert client.get(f"{BASE}/{left_id}").status_code == 404
        assert client.get(f"{BASE}/{right_id}").status_code == 404


# ---------------------------------------------------------------------------
# Project extension (update triggers merge)
# ---------------------------------------------------------------------------


class TestProjectExtension:
    """User extends (updates) a time entry so it becomes adjacent to another
    entry; the backend must merge them automatically."""

    def test_extend_end_date_merges_adjacent(
        self, client, user_alice, project_dev
    ):
        """Extend a Monday entry to include Tuesday → the pre-existing Wednesday
        entry becomes adjacent and is automatically merged.

        eid1 = Monday morning→evening  (2026-03-02)
        eid2 = Wednesday morning→evening (2026-03-04)   ← not adjacent (Tuesday gap)
        PUT eid1: extend end_date to Tuesday evening
          → Wednesday is now adjacent → merged into Monday–Wednesday
        """
        rv1 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                start_period="morning",
                end_date="2026-03-02",
                end_period="evening",
            ),
        )
        assert rv1.status_code == 201
        eid1 = rv1.get_json()["id"]

        rv2 = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-04",
                start_period="morning",
                end_date="2026-03-04",
                end_period="evening",
            ),
        )
        assert rv2.status_code == 201
        eid2 = rv2.get_json()["id"]

        rv3 = put_time_entry(
            client,
            eid1,
            {"end_date": "2026-03-03", "end_period": "evening"},
        )
        assert rv3.status_code == 200
        merged = rv3.get_json()
        assert merged["start_date"] == "2026-03-02"
        assert merged["end_date"] == "2026-03-04"
        assert client.get(f"{BASE}/{eid2}").status_code == 404


# ---------------------------------------------------------------------------
# Bulk creation
# ---------------------------------------------------------------------------


class TestBulkCreate:
    """POST /bulk accepts a list; valid entries are created, invalid ones get
    an error report without rolling back the valid ones."""

    def test_bulk_all_valid(self, client, user_alice, project_dev):
        payload = {
            "time_entries": [
                make_payload(
                    user_alice.id,
                    project_dev.id,
                    start_date="2026-03-02",
                    start_period="morning",
                    end_date="2026-03-02",
                    end_period="midday",
                ),
                make_payload(
                    user_alice.id,
                    project_dev.id,
                    start_date="2026-03-03",
                    start_period="morning",
                    end_date="2026-03-03",
                    end_period="evening",
                ),
            ]
        }
        rv = client.post(f"{BASE}/bulk", json=payload)
        assert rv.status_code in (200, 201)
        data = rv.get_json()
        assert data["created"] >= 1

    def test_bulk_partial_error_still_commits_valid(
        self, client, user_alice, project_dev
    ):
        """One invalid date in a bulk list → that entry errors; the valid entry is
        still committed and returned."""
        bulk = {
            "time_entries": [
                make_payload(
                    user_alice.id,
                    project_dev.id,
                    start_date="2026-03-02",
                    start_period="morning",
                    end_date="2026-03-02",
                    end_period="evening",
                ),
                # Invalid: date not in declared week 10
                make_payload(
                    user_alice.id,
                    project_dev.id,
                    start_date="2026-03-09",  # week 11
                    end_date="2026-03-09",
                    week_number=10,
                    year=2026,
                ),
            ]
        }
        rv = client.post(f"{BASE}/bulk", json=bulk)
        assert rv.status_code in (200, 201)
        data = rv.get_json()
        assert data["created"] >= 1
        assert len(data["errors"]) >= 1

    def test_bulk_missing_field_reports_error(
        self, client, user_alice, project_dev
    ):
        """A bulk entry missing a required field gets an individual error."""
        bulk = {
            "time_entries": [
                # Missing project_id
                {
                    "user_id": user_alice.id,
                    "start_date": "2026-03-02",
                    "start_period": "morning",
                    "end_date": "2026-03-02",
                    "end_period": "evening",
                    "week_number": 10,
                    "year": 2026,
                },
            ]
        }
        rv = client.post(f"{BASE}/bulk", json=bulk)
        assert rv.status_code in (400, 200, 201)
        data = rv.get_json()
        assert len(data.get("errors", [])) >= 1 or "error" in data


# ---------------------------------------------------------------------------
# Validation rules
# ---------------------------------------------------------------------------


class TestValidation:
    def test_end_before_start_rejected(self, client, user_alice, project_dev):
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-03",
                end_date="2026-03-02",
            ),
        )
        assert rv.status_code == 400

    def test_same_day_wrong_period_order_rejected(
        self, client, user_alice, project_dev
    ):
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-02",
                end_date="2026-03-02",
                start_period="midday",
                end_period="midday",  # must be strictly after start
            ),
        )
        assert rv.status_code == 400

    def test_invalid_period_value(self, client, user_alice, project_dev):
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_period="invalid_period",
            ),
        )
        assert rv.status_code == 400

    def test_date_outside_declared_week_rejected(
        self, client, user_alice, project_dev
    ):
        """Declared week 10 but date is in week 11 — must be rejected."""
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_date="2026-03-09",  # week 11
                end_date="2026-03-09",
                week_number=10,
                year=2026,
            ),
        )
        assert rv.status_code == 400

    def test_legacy_period_values_accepted(self, client, user_alice, project_dev):
        """Legacy 'full_day' is mapped to morning/evening."""
        rv = post_time_entry(
            client,
            make_payload(
                user_alice.id,
                project_dev.id,
                start_period="full_day",
                end_period="full_day",
            ),
        )
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["start_period"] == "morning"
        assert data["end_period"] == "evening"

    def test_nonexistent_user_returns_404(self, client, project_dev):
        rv = post_time_entry(client, make_payload(99999, project_dev.id))
        assert rv.status_code == 404

    def test_nonexistent_project_returns_404(self, client, user_alice):
        rv = post_time_entry(client, make_payload(user_alice.id, 99999))
        assert rv.status_code == 404

    def test_year_out_of_range_rejected(self, client, user_alice, project_dev):
        rv = post_time_entry(
            client,
            make_payload(user_alice.id, project_dev.id, year=1999),
        )
        assert rv.status_code == 400


# ---------------------------------------------------------------------------
# Filtering / list
# ---------------------------------------------------------------------------


class TestFiltering:
    def test_filter_by_user(
        self, client, user_alice, user_bob, project_dev
    ):
        post_time_entry(client, make_payload(user_alice.id, project_dev.id))
        post_time_entry(
            client,
            make_payload(
                user_bob.id,
                project_dev.id,
                start_date="2026-03-03",
                end_date="2026-03-03",
            ),
        )
        rv = client.get(f"{BASE}?user_id={user_alice.id}")
        data = rv.get_json()
        assert all(p["user"]["id"] == user_alice.id for p in data)

    def test_filter_by_week(self, client, user_alice, project_dev):
        post_time_entry(client, make_payload(user_alice.id, project_dev.id))
        rv = client.get(f"{BASE}?week_number=10&year=2026")
        data = rv.get_json()
        assert len(data) >= 1
        assert all(p["week_number"] == 10 for p in data)
