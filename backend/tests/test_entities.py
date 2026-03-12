"""
Tests for Projet, CodePointage, and Utilisateur routes.

Covers:
 - Basic CRUD for all three resources
 - Referential integrity (cannot delete a CodePointage that has projects)
 - Cannot delete a Projet that has pointages
 - Cannot delete a Utilisateur that has pointages
 - Uniqueness constraints
 - Colour validation
"""

import io

BASE_CODE = "/api/v1/code-pointage"
BASE_PROJ = "/api/v1/projets"
BASE_USER = "/api/v1/utilisateurs"
BASE_POINTAGE = "/api/v1/pointages"


def make_week10_pointage(user_id, proj_id):
    return {
        "utilisateur_id": user_id,
        "projet_id": proj_id,
        "date_debut": "2026-03-02",
        "periode_debut": "matin",
        "date_fin": "2026-03-02",
        "periode_fin": "soir",
        "numero_semaine": 10,
        "annee": 2026,
    }


# ---------------------------------------------------------------------------
# CodePointage
# ---------------------------------------------------------------------------


class TestCodePointageCRUD:
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

    def test_delete_code_with_projects_blocked(self, client, code_dev, projet_dev):
        """Deleting a CodePointage that has linked projects must be refused."""
        rv = client.delete(f"{BASE_CODE}/{code_dev.id}")
        assert rv.status_code == 409

    def test_get_nonexistent_code_returns_404(self, client):
        rv = client.get(f"{BASE_CODE}/99999")
        assert rv.status_code == 404


# ---------------------------------------------------------------------------
# Projet
# ---------------------------------------------------------------------------


class TestProjetCRUD:
    def test_create_project(self, client, code_dev):
        rv = client.post(
            BASE_PROJ,
            json={
                "nom": "Mon Projet",
                "couleur": "#ff5733",
                "motif": "uni",
                "code_pointage_id": code_dev.id,
            },
        )
        assert rv.status_code == 201
        assert rv.get_json()["nom"] == "Mon Projet"

    def test_list_projects(self, client, projet_dev):
        rv = client.get(BASE_PROJ)
        assert rv.status_code == 200
        assert any(p["nom"] == "Développement" for p in rv.get_json())

    def test_update_project_colour_and_motif(self, client, projet_dev):
        rv = client.put(
            f"{BASE_PROJ}/{projet_dev.id}",
            json={"couleur": "#1abc9c", "motif": "raye"},
        )
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["couleur"] == "#1abc9c"
        assert data["motif"] == "raye"

    def test_invalid_motif_rejected(self, client, code_dev):
        rv = client.post(
            BASE_PROJ,
            json={
                "nom": "Motif Invalide",
                "couleur": "#aabbcc",
                "motif": "zigzag",
                "code_pointage_id": code_dev.id,
            },
        )
        assert rv.status_code == 400

    def test_duplicate_project_name_rejected(self, client, code_dev, projet_dev):
        rv = client.post(
            BASE_PROJ,
            json={
                "nom": "Développement",
                "couleur": "#000000",
                "motif": "uni",
                "code_pointage_id": code_dev.id,
            },
        )
        assert rv.status_code == 409

    def test_delete_project_without_pointages(self, client, code_dev):
        rv = client.post(
            BASE_PROJ,
            json={
                "nom": "Temporaire",
                "couleur": "#ffffff",
                "motif": "uni",
                "code_pointage_id": code_dev.id,
            },
        )
        pid = rv.get_json()["id"]
        rv_del = client.delete(f"{BASE_PROJ}/{pid}")
        assert rv_del.status_code == 204

    def test_delete_project_with_pointages_blocked(
        self, client, projet_dev, utilisateur_alice
    ):
        """Cannot delete a project that still has pointages."""
        client.post(
            BASE_POINTAGE,
            json=make_week10_pointage(utilisateur_alice.id, projet_dev.id),
        )
        rv = client.delete(f"{BASE_PROJ}/{projet_dev.id}")
        assert rv.status_code == 409

    def test_project_nonexistent_code_rejected(self, client):
        rv = client.post(
            BASE_PROJ,
            json={
                "nom": "Orphan",
                "couleur": "#aaaaaa",
                "motif": "uni",
                "code_pointage_id": 99999,
            },
        )
        assert rv.status_code in (400, 404)  # implementation may return either


# ---------------------------------------------------------------------------
# Utilisateur
# ---------------------------------------------------------------------------


class TestUtilisateurCRUD:
    def test_create_user(self, client):
        rv = client.post(
            BASE_USER,
            json={"nom": "Claire", "couleur": "#f39c12"},
        )
        assert rv.status_code == 201
        assert rv.get_json()["nom"] == "Claire"

    def test_list_users(self, client, utilisateur_alice):
        rv = client.get(BASE_USER)
        assert rv.status_code == 200
        assert any(u["nom"] == "Alice" for u in rv.get_json())

    def test_update_user_name_and_colour(self, client, utilisateur_alice):
        rv = client.put(
            f"{BASE_USER}/{utilisateur_alice.id}",
            json={"nom": "Alice Martin", "couleur": "#27ae60"},
        )
        assert rv.status_code == 200
        data = rv.get_json()
        assert data["nom"] == "Alice Martin"
        assert data["couleur"] == "#27ae60"

    def test_invalid_colour_format_rejected(self, client):
        rv = client.post(
            BASE_USER,
            json={"nom": "MauvaiseCouleur", "couleur": "rouge"},
        )
        assert rv.status_code == 400

    def test_delete_user_without_pointages(self, client):
        rv = client.post(
            BASE_USER,
            json={"nom": "TemporaireUser", "couleur": "#cccccc"},
        )
        uid = rv.get_json()["id"]
        rv_del = client.delete(f"{BASE_USER}/{uid}")
        assert rv_del.status_code == 204

    def test_delete_user_with_pointages_blocked(
        self, client, utilisateur_alice, projet_dev
    ):
        """Cannot delete a user that still has pointages."""
        client.post(
            BASE_POINTAGE,
            json=make_week10_pointage(utilisateur_alice.id, projet_dev.id),
        )
        rv = client.delete(f"{BASE_USER}/{utilisateur_alice.id}")
        assert rv.status_code == 409

    def test_duplicate_sub_rejected(self, client):
        """Two users with the same OIDC sub must be rejected."""
        client.post(
            BASE_USER,
            json={"nom": "UserA", "couleur": "#aaaaaa", "sub": "oidc|abc123"},
        )
        rv = client.post(
            BASE_USER,
            json={"nom": "UserB", "couleur": "#bbbbbb", "sub": "oidc|abc123"},
        )
        assert rv.status_code == 409

    def test_null_sub_allowed_multiple(self, client):
        """Multiple users may have sub=None (unique nullable constraint)."""
        rv1 = client.post(BASE_USER, json={"nom": "NoSub1", "couleur": "#111111"})
        rv2 = client.post(BASE_USER, json={"nom": "NoSub2", "couleur": "#222222"})
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

    def test_import_utilisateur_csv_create_and_update(self, client, utilisateur_alice):
        csv_content = "nom,couleur,sub\nAlice,#ff0000,\nClaire,#123456,oidc|claire\n"
        rv = client.post(
            f"{BASE_USER}/import-csv",
            data={"file": (io.BytesIO(csv_content.encode("utf-8")), "users.csv")},
            content_type="multipart/form-data",
        )
        assert rv.status_code in (200, 201)
        data = rv.get_json()
        assert data["updated"] == 1
        assert data["created"] == 1

    def test_import_projet_csv(self, client, code_dev):
        csv_content = (
            "nom,couleur,motif,code_pointage\nOnboarding,#abcdef,pointille,DEV\n"
        )
        rv = client.post(
            f"{BASE_PROJ}/import-csv",
            data={"file": (io.BytesIO(csv_content.encode("utf-8")), "projects.csv")},
            content_type="multipart/form-data",
        )
        assert rv.status_code == 201
        data = rv.get_json()
        assert data["created"] == 1
