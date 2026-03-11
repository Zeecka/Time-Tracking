"""
Tests for Pointage (time entry) routes — complex user scenarios.

Covers:
 - Basic CRUD
 - Overlap detection (same day, half-day boundary, cross-day)
 - Adjacent-entry merging with note concatenation
 - Project extension (updating dates to trigger merge)
 - Bulk creation with mixed valid/invalid entries
 - Validation edge-cases (bad dates, bad periods, week mismatch)
 - Multi-user isolation (overlapping dates are OK for different users)
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE = "/api/v1/pointages"


def make_payload(utilisateur_id, projet_id, **kwargs):
    """Build a minimal valid pointage payload for week 10, 2026 (Mon=2026-03-02)."""
    defaults = {
        "utilisateur_id": utilisateur_id,
        "projet_id": projet_id,
        "date_debut": "2026-03-02",
        "periode_debut": "matin",
        "date_fin": "2026-03-02",
        "periode_fin": "soir",
        "numero_semaine": 10,
        "annee": 2026,
    }
    defaults.update(kwargs)
    return defaults


def post_pointage(client, payload):
    return client.post(BASE, json=payload, content_type="application/json")


def put_pointage(client, pointage_id, payload):
    return client.put(
        f"{BASE}/{pointage_id}", json=payload, content_type="application/json"
    )


# ---------------------------------------------------------------------------
# Basic CRUD
# ---------------------------------------------------------------------------


class TestPointageCRUD:
    def test_create_full_day(self, client, utilisateur_alice, projet_dev):
        """Create a simple full-day entry and check the response."""
        payload = make_payload(utilisateur_alice.id, projet_dev.id)
        rv = post_pointage(client, payload)
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["date_debut"] == "2026-03-02"
        assert data["periode_debut"] == "matin"
        assert data["periode_fin"] == "soir"
        assert data["utilisateur"]["id"] == utilisateur_alice.id

    def test_create_half_day_morning(self, client, utilisateur_alice, projet_dev):
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                periode_debut="matin",
                periode_fin="midi",
            ),
        )
        assert rv.status_code == 201
        assert rv.get_json()["periode_fin"] == "midi"

    def test_create_half_day_afternoon(self, client, utilisateur_alice, projet_dev):
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                periode_debut="midi",
                periode_fin="soir",
            ),
        )
        assert rv.status_code == 201

    def test_get_pointage_by_id(self, client, utilisateur_alice, projet_dev):
        rv = post_pointage(client, make_payload(utilisateur_alice.id, projet_dev.id))
        pid = rv.get_json()["id"]
        rv2 = client.get(f"{BASE}/{pid}")
        assert rv2.status_code == 200
        assert rv2.get_json()["id"] == pid

    def test_delete_pointage(self, client, utilisateur_alice, projet_dev):
        rv = post_pointage(client, make_payload(utilisateur_alice.id, projet_dev.id))
        pid = rv.get_json()["id"]
        rv_del = client.delete(f"{BASE}/{pid}")
        assert rv_del.status_code == 204
        rv_get = client.get(f"{BASE}/{pid}")
        assert rv_get.status_code == 404

    def test_create_with_note(self, client, utilisateur_alice, projet_dev):
        payload = make_payload(
            utilisateur_alice.id,
            projet_dev.id,
            note="Revue de code critique",
        )
        rv = post_pointage(client, payload)
        assert rv.status_code == 201
        assert rv.get_json()["note"] == "Revue de code critique"

    def test_update_note(self, client, utilisateur_alice, projet_dev):
        rv = post_pointage(client, make_payload(utilisateur_alice.id, projet_dev.id))
        pid = rv.get_json()["id"]
        rv2 = put_pointage(client, pid, {"note": "Ajout de note"})
        assert rv2.status_code == 200
        assert rv2.get_json()["note"] == "Ajout de note"


# ---------------------------------------------------------------------------
# Overlap detection
# ---------------------------------------------------------------------------


class TestOverlapDetection:
    """Attempting to create a pointage that overlaps an existing one for the
    same user must return HTTP 409 Conflict."""

    def _create_monday_full(self, client, user_id, proj_id):
        return post_pointage(
            client,
            make_payload(
                user_id,
                proj_id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-02",
                periode_fin="soir",
            ),
        )

    def test_exact_same_slot_rejected(
        self, client, utilisateur_alice, projet_dev, projet_bug
    ):
        """Same day matin→soir for same user: second entry must be rejected."""
        rv1 = self._create_monday_full(client, utilisateur_alice.id, projet_dev.id)
        assert rv1.status_code == 201

        rv2 = self._create_monday_full(client, utilisateur_alice.id, projet_bug.id)
        assert rv2.status_code == 409
        assert "chevauche" in rv2.get_json()["error"].lower()

    def test_partial_overlap_morning_vs_fullday(
        self, client, utilisateur_alice, projet_dev, projet_bug
    ):
        """Morning-only entry conflicts with a full-day entry on the same day."""
        post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                periode_debut="matin",
                periode_fin="soir",
            ),
        )
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_bug.id,
                periode_debut="matin",
                periode_fin="midi",
            ),
        )
        assert rv.status_code == 409

    def test_adjacent_halves_not_overlapping(
        self, client, utilisateur_alice, projet_dev, projet_bug
    ):
        """Morning entry (matin→midi) and afternoon entry (midi→soir) on the same
        day are adjacent, NOT overlapping. Both should be accepted (and then
        auto-merged if same project).  Here we use two different projects so
        no merge happens, but no conflict either."""
        rv1 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                periode_debut="matin",
                periode_fin="midi",
            ),
        )
        assert rv1.status_code == 201

        rv2 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_bug.id,
                periode_debut="midi",
                periode_fin="soir",
            ),
        )
        assert rv2.status_code == 201

    def test_multiday_overlap_rejected(
        self, client, utilisateur_alice, projet_dev, projet_bug
    ):
        """Monday–Wednesday full span conflicts with a Tuesday-only entry."""
        # Mon-Wed full span (week 10)
        post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-04",
                periode_fin="soir",
            ),
        )
        # Attempt Tuesday
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_bug.id,
                date_debut="2026-03-03",
                periode_debut="matin",
                date_fin="2026-03-03",
                periode_fin="soir",
            ),
        )
        assert rv.status_code == 409

    def test_different_users_same_slot_allowed(
        self, client, utilisateur_alice, utilisateur_bob, projet_dev
    ):
        """Two different users can point the same time slot with no conflict."""
        rv1 = self._create_monday_full(client, utilisateur_alice.id, projet_dev.id)
        assert rv1.status_code == 201

        rv2 = self._create_monday_full(client, utilisateur_bob.id, projet_dev.id)
        assert rv2.status_code == 201

    def test_overlap_via_update_rejected(
        self, client, utilisateur_alice, projet_dev, projet_bug
    ):
        """Extending an entry via PUT such that it now overlaps another must be rejected."""
        # Monday morning
        rv1 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-02",
                periode_fin="midi",
            ),
        )
        # Monday afternoon — different project, no merge
        rv2 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_bug.id,
                date_debut="2026-03-02",
                periode_debut="midi",
                date_fin="2026-03-02",
                periode_fin="soir",
            ),
        )
        pid1 = rv1.get_json()["id"]
        # Attempt to extend first entry to full day → overlap with second
        rv3 = put_pointage(
            client,
            pid1,
            {"date_fin": "2026-03-02", "periode_fin": "soir"},
        )
        assert rv3.status_code == 409


# ---------------------------------------------------------------------------
# Adjacent merging
# ---------------------------------------------------------------------------


class TestAdjacentMerge:
    """Two consecutive entries for the same user+project must be auto-merged."""

    def test_same_day_halves_merged(self, client, utilisateur_alice, projet_dev):
        """Morning then afternoon, same project → merged into one full-day entry."""
        rv1 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-02",
                periode_fin="midi",
            ),
        )
        assert rv1.status_code == 201
        pid1 = rv1.get_json()["id"]

        rv2 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="midi",
                date_fin="2026-03-02",
                periode_fin="soir",
            ),
        )
        assert rv2.status_code == 201
        merged = rv2.get_json()
        # The merged entry should span matin→soir
        assert merged["periode_debut"] == "matin"
        assert merged["periode_fin"] == "soir"
        # The original first entry must no longer exist
        rv_get = client.get(f"{BASE}/{pid1}")
        assert rv_get.status_code == 404

    def test_consecutive_days_merged(self, client, utilisateur_alice, projet_dev, db):
        """Friday end of week 10 adjacent to Monday start of week 10 via same week — or
        adjacent days within the same week are merged.
        Monday matin→midi then Monday midi→soir (same day), already tested.
        Here: Monday full + Tuesday full → merged Tue (after second POST)."""
        # Monday full (week 10)
        rv1 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-02",
                periode_fin="soir",
            ),
        )
        pid1 = rv1.get_json()["id"]

        # Tuesday full — adjacent, same project/user → merges
        # Note: week number must match the date (week 10 is 2026-03-02 to 2026-03-08)
        rv2 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-03",
                periode_debut="matin",
                date_fin="2026-03-03",
                periode_fin="soir",
            ),
        )
        assert rv2.status_code == 201
        merged = rv2.get_json()
        assert merged["date_debut"] == "2026-03-02"
        assert merged["date_fin"] == "2026-03-03"
        assert merged["periode_debut"] == "matin"
        assert merged["periode_fin"] == "soir"
        # First entry absorbed into merged
        assert client.get(f"{BASE}/{pid1}").status_code == 404

    def test_merge_concatenates_notes(self, client, utilisateur_alice, projet_dev):
        """Notes from both merged entries are joined with a newline."""
        rv1 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-02",
                periode_fin="midi",
                note="Note matin",
            ),
        )
        rv2 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="midi",
                date_fin="2026-03-02",
                periode_fin="soir",
                note="Note après-midi",
            ),
        )
        assert rv2.status_code == 201
        note = rv2.get_json()["note"]
        assert "Note matin" in note
        assert "Note après-midi" in note

    def test_no_merge_different_project(
        self, client, utilisateur_alice, projet_dev, projet_bug
    ):
        """Adjacent entries with *different* projects must NOT be merged."""
        post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-02",
                periode_fin="midi",
            ),
        )
        rv2 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_bug.id,
                date_debut="2026-03-02",
                periode_debut="midi",
                date_fin="2026-03-02",
                periode_fin="soir",
            ),
        )
        assert rv2.status_code == 201
        data = rv2.get_json()
        # Should keep its own dates, not extended
        assert data["date_debut"] == "2026-03-02"
        assert data["periode_debut"] == "midi"

    def test_three_way_merge(self, client, utilisateur_alice, projet_dev):
        """Adding a new entry that bridges two non-adjacent existing entries
        triggers a three-way merge: before + new + after → one entry.

        A = Monday   matin→midi  (2026-03-02)
        C = Wednesday matin→soir (2026-03-04)  ← NOT adjacent to A (Tuesday gap)
        B = Tuesday   matin→soir (2026-03-03)  ← bridges A and C
        """
        # A — Monday matin→midi
        rv_left = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-02",
                periode_fin="midi",
            ),
        )
        assert rv_left.status_code == 201
        left_id = rv_left.get_json()["id"]

        # C — Wednesday matin→soir (not adjacent to A, Tuesday gap)
        rv_right = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-04",
                periode_debut="matin",
                date_fin="2026-03-04",
                periode_fin="soir",
            ),
        )
        assert rv_right.status_code == 201
        right_id = rv_right.get_json()["id"]

        # B — Tuesday full day → bridges A (Mon) and C (Wed) → three-way merge
        rv_mid = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-03",
                periode_debut="matin",
                date_fin="2026-03-03",
                periode_fin="soir",
            ),
        )
        assert rv_mid.status_code == 201
        merged = rv_mid.get_json()
        assert merged["date_debut"] == "2026-03-02"
        assert merged["periode_debut"] == "matin"
        assert merged["date_fin"] == "2026-03-04"
        assert merged["periode_fin"] == "soir"
        # Both originals are gone
        assert client.get(f"{BASE}/{left_id}").status_code == 404
        assert client.get(f"{BASE}/{right_id}").status_code == 404


# ---------------------------------------------------------------------------
# Project extension (update triggers merge)
# ---------------------------------------------------------------------------


class TestProjectExtension:
    """User extends (updates) a pointage so it becomes adjacent to another
    entry; the backend must merge them automatically."""

    def test_extend_end_date_merges_adjacent(
        self, client, utilisateur_alice, projet_dev
    ):
        """Extend a Monday entry to include Tuesday → the pre-existing Wednesday
        entry becomes adjacent and is automatically merged.

        pid1 = Monday matin→soir  (2026-03-02)
        pid2 = Wednesday matin→soir (2026-03-04)   ← not adjacent (Tuesday gap)
        PUT pid1: extend date_fin to Tuesday soir
          → Wednesday is now adjacent → merged into Monday–Wednesday
        """
        # Monday full
        rv1 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                periode_debut="matin",
                date_fin="2026-03-02",
                periode_fin="soir",
            ),
        )
        assert rv1.status_code == 201
        pid1 = rv1.get_json()["id"]

        # Wednesday full (not adjacent to Monday — Tuesday is missing)
        rv2 = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-04",
                periode_debut="matin",
                date_fin="2026-03-04",
                periode_fin="soir",
            ),
        )
        assert rv2.status_code == 201
        pid2 = rv2.get_json()["id"]

        # Extend Monday to Tuesday soir → now adjacent to Wednesday
        rv3 = put_pointage(
            client,
            pid1,
            {"date_fin": "2026-03-03", "periode_fin": "soir"},
        )
        assert rv3.status_code == 200
        merged = rv3.get_json()
        assert merged["date_debut"] == "2026-03-02"
        assert merged["date_fin"] == "2026-03-04"
        # Wednesday entry absorbed into merged span
        assert client.get(f"{BASE}/{pid2}").status_code == 404


# ---------------------------------------------------------------------------
# Bulk creation
# ---------------------------------------------------------------------------


class TestBulkCreate:
    """POST /bulk accepts a list; valid entries are created, invalid ones get
    an error report without rolling back the valid ones."""

    def test_bulk_all_valid(self, client, utilisateur_alice, projet_dev):
        payload = {
            "pointages": [
                make_payload(
                    utilisateur_alice.id,
                    projet_dev.id,
                    date_debut="2026-03-02",
                    periode_debut="matin",
                    date_fin="2026-03-02",
                    periode_fin="midi",
                ),
                make_payload(
                    utilisateur_alice.id,
                    projet_dev.id,
                    date_debut="2026-03-03",
                    periode_debut="matin",
                    date_fin="2026-03-03",
                    periode_fin="soir",
                ),
            ]
        }
        rv = client.post(f"{BASE}/bulk", json=payload)
        assert rv.status_code in (200, 201)
        data = rv.get_json()
        assert data["created"] >= 1  # may be merged into 1

    def test_bulk_partial_error_still_commits_valid(
        self, client, utilisateur_alice, projet_dev
    ):
        """One invalid date in a bulk list → that entry errors; the valid entry is
        still committed and returned."""
        bulk = {
            "pointages": [
                # Valid Monday entry
                make_payload(
                    utilisateur_alice.id,
                    projet_dev.id,
                    date_debut="2026-03-02",
                    periode_debut="matin",
                    date_fin="2026-03-02",
                    periode_fin="soir",
                ),
                # Invalid: date not in declared week 10
                make_payload(
                    utilisateur_alice.id,
                    projet_dev.id,
                    date_debut="2026-03-09",  # week 11
                    date_fin="2026-03-09",
                    numero_semaine=10,
                    annee=2026,
                ),
            ]
        }
        rv = client.post(f"{BASE}/bulk", json=bulk)
        assert rv.status_code in (200, 201)
        data = rv.get_json()
        assert data["created"] >= 1
        assert len(data["errors"]) >= 1

    def test_bulk_missing_field_reports_error(
        self, client, utilisateur_alice, projet_dev
    ):
        """A bulk entry missing a required field gets an individual error."""
        bulk = {
            "pointages": [
                # Missing projet_id
                {
                    "utilisateur_id": utilisateur_alice.id,
                    "date_debut": "2026-03-02",
                    "periode_debut": "matin",
                    "date_fin": "2026-03-02",
                    "periode_fin": "soir",
                    "numero_semaine": 10,
                    "annee": 2026,
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
    def test_end_before_start_rejected(self, client, utilisateur_alice, projet_dev):
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-03",
                date_fin="2026-03-02",
            ),
        )
        assert rv.status_code == 400

    def test_same_day_wrong_period_order_rejected(
        self, client, utilisateur_alice, projet_dev
    ):
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-02",
                date_fin="2026-03-02",
                periode_debut="midi",
                periode_fin="midi",  # must be strictly after debut
            ),
        )
        assert rv.status_code == 400

    def test_invalid_period_value(self, client, utilisateur_alice, projet_dev):
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                periode_debut="debut_invalide",
            ),
        )
        assert rv.status_code == 400

    def test_date_outside_declared_week_rejected(
        self, client, utilisateur_alice, projet_dev
    ):
        """Declared week 10 but date is in week 11 — must be rejected."""
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                date_debut="2026-03-09",  # week 11
                date_fin="2026-03-09",
                numero_semaine=10,
                annee=2026,
            ),
        )
        assert rv.status_code == 400

    def test_legacy_period_values_accepted(self, client, utilisateur_alice, projet_dev):
        """Legacy 'journee' is mapped to matin/soir."""
        rv = post_pointage(
            client,
            make_payload(
                utilisateur_alice.id,
                projet_dev.id,
                periode_debut="journee",
                periode_fin="journee",
            ),
        )
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["periode_debut"] == "matin"
        assert data["periode_fin"] == "soir"

    def test_nonexistent_user_returns_404(self, client, projet_dev):
        rv = post_pointage(client, make_payload(99999, projet_dev.id))
        assert rv.status_code == 404

    def test_nonexistent_project_returns_404(self, client, utilisateur_alice):
        rv = post_pointage(client, make_payload(utilisateur_alice.id, 99999))
        assert rv.status_code == 404

    def test_year_out_of_range_rejected(self, client, utilisateur_alice, projet_dev):
        rv = post_pointage(
            client,
            make_payload(utilisateur_alice.id, projet_dev.id, annee=1999),
        )
        assert rv.status_code == 400


# ---------------------------------------------------------------------------
# Filtering / list
# ---------------------------------------------------------------------------


class TestFiltering:
    def test_filter_by_utilisateur(
        self, client, utilisateur_alice, utilisateur_bob, projet_dev
    ):
        post_pointage(client, make_payload(utilisateur_alice.id, projet_dev.id))
        post_pointage(
            client,
            make_payload(
                utilisateur_bob.id,
                projet_dev.id,
                date_debut="2026-03-03",
                date_fin="2026-03-03",
            ),
        )
        rv = client.get(f"{BASE}?utilisateur_id={utilisateur_alice.id}")
        data = rv.get_json()
        assert all(p["utilisateur"]["id"] == utilisateur_alice.id for p in data)

    def test_filter_by_week(self, client, utilisateur_alice, projet_dev):
        post_pointage(client, make_payload(utilisateur_alice.id, projet_dev.id))
        rv = client.get(f"{BASE}?numero_semaine=10&annee=2026")
        data = rv.get_json()
        assert len(data) >= 1
        assert all(p["numero_semaine"] == 10 for p in data)
