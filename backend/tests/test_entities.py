"""
Tests for Project, TrackingCode, and User routes.

Covers:
 - Basic CRUD for all three resources
 - Referential integrity (cannot delete a TrackingCode that has projects)
 - Cannot delete a Project that has time entries
 - Cannot delete a User that has time entries
 - Uniqueness constraints
 - Color validation
"""

import io

BASE_CODE = "/api/v1/tracking-code"
BASE_PROJ = "/api/v1/project"
BASE_USER = "/api/v1/user"
BASE_ENTRY = "/api/v1/time-entry"


def make_week10_time_entry(user_id, project_id):
    return {
        "user_id": user_id,
        "project_id": project_id,
        "start_date": "2026-03-02",
        "start_period": "morning",
        "end_date": "2026-03-02",
        "end_period": "evening",
        "week_number": 10,
        "year": 2026,
    }


# ---------------------------------------------------------------------------
# TrackingCode
# ---------------------------------------------------------------------------


class TestTrackingCodeCRUD:
    def test_create_code(self, client):
        rv = client.post(BASE_CODE, json={"code": "ALPHA"})
        assert rv.status_code == 201
        assert rv.get_json()["code"] == "ALPHA"

    def test_list_codes(self, client, code_dev):
        rv = client.get(BASE_CODE)
        assert rv.status_code == 200
        codes = rv.get_json()
        assert any(c["code"] == "DEV" for c in codes)

    def test_get_by_id(self, client, code_dev):
        rv = client.get(f"{BASE_CODE}/{code_dev.id}")
        assert rv.status_code == 200
        assert rv.get_json()["code"] == "DEV"

    def test_update_code(self, client, code_dev):
        rv = client.put(f"{BASE_CODE}/{code_dev.id}", json={"code": "DEV2"})
        assert rv.status_code == 200
        assert rv.get_json()["code"] == "DEV2"

    def test_duplicate_code_rejected(self, client, code_dev):
        rv = client.post(BASE_CODE, json={"code": "DEV"})
        assert rv.status_code == 409

    def test_delete_code_without_projects(self, client):
        rv = client.post(BASE_CODE, json={"code": "TEMP"})
        cid = rv.get_json()["id"]
        rv_del = client.delete(f"{BASE_CODE}/{cid}")
        assert rv_del.status_code == 204

    def test_delete_code_with_projects_blocked(self, client, code_dev, project_dev):
        """Deleting a TrackingCode that has linked projects must be refused."""
        rv = client.delete(f"{BASE_CODE}/{code_dev.id}")
        assert rv.status_code == 409

    def test_get_nonexistent_code_returns_404(self, client):
        rv = client.get(f"{BASE_CODE}/99999")
        assert rv.status_code == 404


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------


class TestProjectCRUD:
    def test_create_project(self, client, code_dev):
        rv = client.post(
            BASE_PROJ,
            json={
                "name": "My Project",
                "color": "#ff5733",
                "pattern": "solid",
                "tracking_code_id": code_dev.id,
            },
        )
        assert rv.status_code == 201
        assert rv.get_json()["name"] == "My Project"

    def test_list_projects(self, client, project_dev):
        rv = client.get(BASE_PROJ)
        assert rv.status_code == 200
        assert any(p["name"] == "Development" for p in rv.get_json())

    def test_update_project_color_and_pattern(self, client, project_dev):
        rv = client.put(
            f"{BASE_PROJ}/{project_dev.id}",
            json={"color": "#1abc9c", "pattern": "striped"},
        )
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["color"] == "#1abc9c"
        assert data["pattern"] == "striped"

    def test_invalid_pattern_rejected(self, client, code_dev):
        rv = client.post(
            BASE_PROJ,
            json={
                "name": "Invalid Pattern",
                "color": "#aabbcc",
                "pattern": "zigzag",
                "tracking_code_id": code_dev.id,
            },
        )
        assert rv.status_code == 400

    def test_duplicate_project_name_rejected(self, client, code_dev, project_dev):
        rv = client.post(
            BASE_PROJ,
            json={
                "name": "Development",
                "color": "#000000",
                "pattern": "solid",
                "tracking_code_id": code_dev.id,
            },
        )
        assert rv.status_code == 409

    def test_delete_project_without_time_entries(self, client, code_dev):
        rv = client.post(
            BASE_PROJ,
            json={
                "name": "Temporary",
                "color": "#ffffff",
                "pattern": "solid",
                "tracking_code_id": code_dev.id,
            },
        )
        pid = rv.get_json()["id"]
        rv_del = client.delete(f"{BASE_PROJ}/{pid}")
        assert rv_del.status_code == 204

    def test_delete_project_with_time_entries_blocked(
        self, client, project_dev, user_alice
    ):
        """Cannot delete a project that still has time entries."""
        client.post(
            BASE_ENTRY,
            json=make_week10_time_entry(user_alice.id, project_dev.id),
        )
        rv = client.delete(f"{BASE_PROJ}/{project_dev.id}")
        assert rv.status_code == 409

    def test_project_nonexistent_code_rejected(self, client):
        rv = client.post(
            BASE_PROJ,
            json={
                "name": "Orphan",
                "color": "#aaaaaa",
                "pattern": "solid",
                "tracking_code_id": 99999,
            },
        )
        assert rv.status_code in (400, 404)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------


class TestUserCRUD:
    def test_create_user(self, client):
        rv = client.post(
            BASE_USER,
            json={"name": "Claire", "color": "#f39c12"},
        )
        assert rv.status_code == 201
        assert rv.get_json()["name"] == "Claire"

    def test_list_users(self, client, user_alice):
        rv = client.get(BASE_USER)
        assert rv.status_code == 200
        assert any(u["name"] == "Alice" for u in rv.get_json())

    def test_update_user_name_and_color(self, client, user_alice):
        rv = client.put(
            f"{BASE_USER}/{user_alice.id}",
            json={"name": "Alice Martin", "color": "#27ae60"},
        )
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["name"] == "Alice Martin"
        assert data["color"] == "#27ae60"

    def test_invalid_color_format_rejected(self, client):
        rv = client.post(
            BASE_USER,
            json={"name": "BadColor", "color": "red"},
        )
        assert rv.status_code == 400

    def test_delete_user_without_time_entries(self, client):
        rv = client.post(
            BASE_USER,
            json={"name": "TemporaryUser", "color": "#cccccc"},
        )
        uid = rv.get_json()["id"]
        rv_del = client.delete(f"{BASE_USER}/{uid}")
        assert rv_del.status_code == 204

    def test_delete_user_with_time_entries_blocked(
        self, client, user_alice, project_dev
    ):
        """Cannot delete a user that still has time entries."""
        client.post(
            BASE_ENTRY,
            json=make_week10_time_entry(user_alice.id, project_dev.id),
        )
        rv = client.delete(f"{BASE_USER}/{user_alice.id}")
        assert rv.status_code == 409

    def test_duplicate_sub_rejected(self, client):
        """Two users with the same OIDC sub must be rejected."""
        client.post(
            BASE_USER,
            json={"name": "UserA", "color": "#aaaaaa", "sub": "oidc|abc123"},
        )
        rv = client.post(
            BASE_USER,
            json={"name": "UserB", "color": "#bbbbbb", "sub": "oidc|abc123"},
        )
        assert rv.status_code == 409

    def test_null_sub_allowed_multiple(self, client):
        """Multiple users may have sub=None (unique nullable constraint)."""
        rv1 = client.post(BASE_USER, json={"name": "NoSub1", "color": "#111111"})
        rv2 = client.post(BASE_USER, json={"name": "NoSub2", "color": "#222222"})
        assert rv1.status_code == 201
        assert rv2.status_code == 201


class TestCsvImportExport:
    def test_export_code_csv(self, client, code_dev):
        rv = client.get(f"{BASE_CODE}/export-csv")
        assert rv.status_code == 200
        body = rv.data.decode("utf-8")
        assert "code" in body
        assert "DEV" in body

    def test_import_code_csv(self, client):
        csv_content = "code\nDEV\nABS\n"
        rv = client.post(
            f"{BASE_CODE}/import-csv",
            data={"file": (io.BytesIO(csv_content.encode("utf-8")), "codes.csv")},
            content_type="multipart/form-data",
        )
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["created"] == 2

    def test_import_user_csv_create_and_update(self, client, user_alice):
        csv_content = "name,color,sub\nAlice,#ff0000,\nClaire,#123456,oidc|claire\n"
        rv = client.post(
            f"{BASE_USER}/import-csv",
            data={"file": (io.BytesIO(csv_content.encode("utf-8")), "users.csv")},
            content_type="multipart/form-data",
        )
        assert rv.status_code in (200, 201)
        data = rv.get_json()
        assert data["updated"] == 1
        assert data["created"] == 1

    def test_import_project_csv(self, client, code_dev):
        csv_content = (
            "name,color,pattern,tracking_code\nOnboarding,#abcdef,dotted,DEV\n"
        )
        rv = client.post(
            f"{BASE_PROJ}/import-csv",
            data={"file": (io.BytesIO(csv_content.encode("utf-8")), "projects.csv")},
            content_type="multipart/form-data",
        )
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["created"] == 1

    def test_import_project_csv_with_unknown_tracking_code(self, client, code_dev):
        csv_content = (
            "name,color,pattern,tracking_code\nOnboarding,#abcdef,dotted,UNKNOWN\n"
        )
        rv = client.post(
            f"{BASE_PROJ}/import-csv",
            data={"file": (io.BytesIO(csv_content.encode("utf-8")), "projects.csv")},
            content_type="multipart/form-data",
        )

        assert rv.status_code == 200
        data = rv.get_json()
        assert data["created"] == 0
        assert len(data["errors"]) == 1
        assert "tracking_code not found" in data["errors"][0]["error"]

    def test_import_project_excel_like_file_with_valid_csv_content(
        self, client, code_dev
    ):
        csv_content = "name,color,pattern,tracking_code\nRoadmap,#112233,solid,DEV\n"
        rv = client.post(
            f"{BASE_PROJ}/import-csv",
            data={"file": (io.BytesIO(csv_content.encode("utf-8")), "projects.xlsx")},
            content_type="multipart/form-data",
        )

        assert rv.status_code == 201
        data = rv.get_json()
        assert data["created"] == 1
        assert data["updated"] == 0
        assert len(data["errors"]) == 0
