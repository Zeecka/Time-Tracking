import csv
import io

from flask import Blueprint, Response, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import CodePointage
from app.schemas import code_pointage_schema, code_pointages_schema

code_pointage_bp = Blueprint("code_pointage", __name__)


@code_pointage_bp.route("", methods=["GET"])
def get_all_code_pointages():
    """Get all code pointages"""
    code_pointages = CodePointage.query.order_by(CodePointage.code).all()
    return jsonify(code_pointages_schema.dump(code_pointages)), 200


@code_pointage_bp.route("/<int:id>", methods=["GET"])
def get_code_pointage(id):
    """Get a single code pointage by ID"""
    code_pointage = CodePointage.query.get_or_404(id)
    return jsonify(code_pointage_schema.dump(code_pointage)), 200


@code_pointage_bp.route("", methods=["POST"])
def create_code_pointage():
    """Create a new code pointage"""
    try:
        data = request.get_json()

        if not data or "code" not in data:
            return jsonify({"error": "Code is required"}), 400

        # Check if code already exists
        existing = CodePointage.query.filter_by(code=data["code"]).first()
        if existing:
            return jsonify({"error": "Code already exists"}), 409

        code_pointage = CodePointage(code=data["code"])
        db.session.add(code_pointage)
        db.session.commit()

        return jsonify(code_pointage_schema.dump(code_pointage)), 201

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Code already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@code_pointage_bp.route("/<int:id>", methods=["PUT"])
def update_code_pointage(id):
    """Update a code pointage"""
    try:
        code_pointage = CodePointage.query.get_or_404(id)
        data = request.get_json()

        if not data or "code" not in data:
            return jsonify({"error": "Code is required"}), 400

        # Check if new code already exists (excluding current record)
        existing = CodePointage.query.filter(
            CodePointage.code == data["code"], CodePointage.id != id
        ).first()
        if existing:
            return jsonify({"error": "Code already exists"}), 409

        code_pointage.code = data["code"]
        db.session.commit()

        return jsonify(code_pointage_schema.dump(code_pointage)), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Code already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@code_pointage_bp.route("/<int:id>", methods=["DELETE"])
def delete_code_pointage(id):
    """Delete a code pointage"""
    try:
        code_pointage = CodePointage.query.get_or_404(id)

        # Check if there are associated projects
        if code_pointage.projets.count() > 0:
            return jsonify(
                {"error": "Cannot delete code with associated projects"}
            ), 409

        db.session.delete(code_pointage)
        db.session.commit()

        return "", 204

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@code_pointage_bp.route("/export-csv", methods=["GET"])
def export_code_pointages_csv():
    """Export all codes as CSV."""
    codes = CodePointage.query.order_by(CodePointage.code).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["code"])

    for code in codes:
        writer.writerow([code.code])

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=codes_pointage.csv"},
    )


@code_pointage_bp.route("/import-csv", methods=["POST"])
def import_code_pointages_csv():
    """Import codes from CSV file."""
    try:
        if "file" not in request.files:
            return jsonify({"error": 'CSV file is required in form field "file"'}), 400

        csv_file = request.files["file"]
        if not csv_file or not csv_file.filename:
            return jsonify({"error": "CSV file is required"}), 400

        content = csv_file.stream.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))

        if not reader.fieldnames or "code" not in reader.fieldnames:
            return jsonify({"error": "CSV header must contain: code"}), 400

        created = 0
        skipped = 0
        errors = []

        for idx, row in enumerate(reader, start=2):
            code_value = str(row.get("code", "")).strip()

            if not code_value:
                errors.append({"line": idx, "error": "code is required"})
                continue

            existing = CodePointage.query.filter_by(code=code_value).first()
            if existing:
                skipped += 1
                continue

            db.session.add(CodePointage(code=code_value))
            created += 1

        db.session.commit()

        status = 201 if created > 0 else 200
        return jsonify(
            {"created": created, "skipped": skipped, "errors": errors}
        ), status

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
