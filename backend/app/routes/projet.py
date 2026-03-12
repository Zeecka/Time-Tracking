import csv
import io

from flask import Blueprint, Response, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import CodePointage, Projet
from app.schemas import projet_schema, projets_schema

projet_bp = Blueprint("projet", __name__)
ALLOWED_MOTIFS = {"uni", "raye", "pointille"}


def _normalize_and_validate_motif(value):
    motif = str(value or "uni").strip().lower()
    if motif not in ALLOWED_MOTIFS:
        allowed_values = ", ".join(sorted(ALLOWED_MOTIFS))
        raise ValueError(f"Invalid motif, allowed values: {allowed_values}")
    return motif


@projet_bp.route("", methods=["GET"])
def get_all_projets():
    """Get all projects"""
    projets = Projet.query.order_by(Projet.nom).all()
    return jsonify(projets_schema.dump(projets)), 200


@projet_bp.route("/<int:id>", methods=["GET"])
def get_projet(id):
    """Get a single project by ID"""
    projet = Projet.query.get_or_404(id)
    return jsonify(projet_schema.dump(projet)), 200


@projet_bp.route("", methods=["POST"])
def create_projet():
    """Create a new project"""
    try:
        data = request.get_json()

        if not data or "nom" not in data or "code_pointage_id" not in data:
            return jsonify(
                {"error": "Project name and code_pointage_id are required"}
            ), 400

        # Check if code pointage exists
        code_pointage = CodePointage.query.get(data["code_pointage_id"])
        if not code_pointage:
            return jsonify({"error": "Code pointage not found"}), 404

        # Check if project name already exists
        existing = Projet.query.filter_by(nom=data["nom"]).first()
        if existing:
            return jsonify({"error": "Project name already exists"}), 409

        try:
            motif = _normalize_and_validate_motif(data.get("motif", "uni"))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        projet = Projet(
            nom=data["nom"],
            couleur=data.get("couleur", "#3498db"),
            motif=motif,
            code_pointage_id=data["code_pointage_id"],
        )
        db.session.add(projet)
        db.session.commit()

        return jsonify(projet_schema.dump(projet)), 201

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Project name already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@projet_bp.route("/<int:id>", methods=["PUT"])
def update_projet(id):
    """Update a project"""
    try:
        projet = Projet.query.get_or_404(id)
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Update name if provided
        if "nom" in data:
            # Check if new name already exists (excluding current record)
            existing = Projet.query.filter(
                Projet.nom == data["nom"], Projet.id != id
            ).first()
            if existing:
                return jsonify({"error": "Project name already exists"}), 409
            projet.nom = data["nom"]

        # Update code pointage if provided
        if "code_pointage_id" in data:
            code_pointage = CodePointage.query.get(data["code_pointage_id"])
            if not code_pointage:
                return jsonify({"error": "Code pointage not found"}), 404
            projet.code_pointage_id = data["code_pointage_id"]

        # Update couleur if provided
        if "couleur" in data:
            projet.couleur = data["couleur"]

        if "motif" in data:
            try:
                projet.motif = _normalize_and_validate_motif(data["motif"])
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        db.session.commit()
        return jsonify(projet_schema.dump(projet)), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Project name already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@projet_bp.route("/<int:id>", methods=["DELETE"])
def delete_projet(id):
    """Delete a project"""
    try:
        projet = Projet.query.get_or_404(id)

        # Check if there are associated pointages
        if projet.pointages.count() > 0:
            return jsonify(
                {"error": "Cannot delete project with associated time entries"}
            ), 409

        db.session.delete(projet)
        db.session.commit()

        return "", 204

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@projet_bp.route("/export-csv", methods=["GET"])
def export_projets_csv():
    """Export all projects as CSV."""
    projets = Projet.query.order_by(Projet.nom).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["nom", "couleur", "motif", "code_pointage"])

    for projet in projets:
        writer.writerow(
            [
                projet.nom,
                projet.couleur,
                projet.motif,
                projet.code_pointage.code if projet.code_pointage else "",
            ]
        )

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=projets.csv"},
    )


@projet_bp.route("/import-csv", methods=["POST"])
def import_projets_csv():
    """Import projects from CSV file."""
    try:
        if "file" not in request.files:
            return jsonify({"error": 'CSV file is required in form field "file"'}), 400

        csv_file = request.files["file"]
        if not csv_file or not csv_file.filename:
            return jsonify({"error": "CSV file is required"}), 400

        content = csv_file.stream.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))

        required_headers = {"nom", "code_pointage"}
        if not reader.fieldnames or not required_headers.issubset(
            set(reader.fieldnames)
        ):
            return jsonify(
                {
                    "error": "CSV header must contain: nom,code_pointage (couleur,motif optional)"
                }
            ), 400

        created = 0
        updated = 0
        errors = []

        for idx, row in enumerate(reader, start=2):
            nom = str(row.get("nom", "")).strip()
            code_value = str(row.get("code_pointage", "")).strip()
            couleur = str(row.get("couleur", "")).strip() or "#3498db"
            motif_value = row.get("motif", "uni")

            if not nom or not code_value:
                errors.append(
                    {"line": idx, "error": "nom and code_pointage are required"}
                )
                continue

            code = CodePointage.query.filter_by(code=code_value).first()
            if not code:
                errors.append(
                    {"line": idx, "error": f"code_pointage not found: {code_value}"}
                )
                continue

            try:
                motif = _normalize_and_validate_motif(motif_value)
            except ValueError as e:
                errors.append({"line": idx, "error": str(e)})
                continue

            projet = Projet.query.filter_by(nom=nom).first()
            if projet:
                projet.code_pointage_id = code.id
                projet.couleur = couleur
                projet.motif = motif
                updated += 1
            else:
                db.session.add(
                    Projet(
                        nom=nom,
                        couleur=couleur,
                        motif=motif,
                        code_pointage_id=code.id,
                    )
                )
                created += 1

        db.session.commit()

        status = 201 if created > 0 else 200
        return jsonify(
            {"created": created, "updated": updated, "errors": errors}
        ), status

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
