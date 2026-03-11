from flask import Blueprint, jsonify, request
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
