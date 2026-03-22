import csv
import io

from flask import Blueprint, Response, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import TrackingCode
from app.schemas import tracking_code_schema, tracking_codes_schema

tracking_code_bp = Blueprint("tracking_code", __name__)


@tracking_code_bp.route("", methods=["GET"])
def get_all_tracking_codes():
    """Get all tracking codes"""
    codes = TrackingCode.query.order_by(TrackingCode.code).all()
    return jsonify(tracking_codes_schema.dump(codes)), 200


@tracking_code_bp.route("/<int:id>", methods=["GET"])
def get_tracking_code(id):
    """Get a single tracking code by ID"""
    code = TrackingCode.query.get_or_404(id)
    return jsonify(tracking_code_schema.dump(code)), 200


@tracking_code_bp.route("", methods=["POST"])
def create_tracking_code():
    """Create a new tracking code"""
    try:
        data = request.get_json()

        if not data or "code" not in data:
            return jsonify({"error": "Code is required"}), 400

        # Check if code already exists
        existing = TrackingCode.query.filter_by(code=data["code"]).first()
        if existing:
            return jsonify({"error": "Code already exists"}), 409

        tracking_code = TrackingCode(code=data["code"], note=data.get("note"))
        db.session.add(tracking_code)
        db.session.commit()

        return jsonify(tracking_code_schema.dump(tracking_code)), 201

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Code already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@tracking_code_bp.route("/<int:id>", methods=["PUT"])
def update_tracking_code(id):
    """Update a tracking code"""
    try:
        tracking_code = TrackingCode.query.get_or_404(id)
        data = request.get_json()

        if not data or "code" not in data:
            return jsonify({"error": "Code is required"}), 400

        # Check if new code already exists (excluding current record)
        existing = TrackingCode.query.filter(
            TrackingCode.code == data["code"], TrackingCode.id != id
        ).first()
        if existing:
            return jsonify({"error": "Code already exists"}), 409

        tracking_code.code = data["code"]
        tracking_code.note = data.get("note")
        db.session.commit()

        return jsonify(tracking_code_schema.dump(tracking_code)), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Code already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@tracking_code_bp.route("/<int:id>", methods=["DELETE"])
def delete_tracking_code(id):
    """Delete a tracking code"""
    try:
        tracking_code = TrackingCode.query.get_or_404(id)

        # Check if there are associated projects
        if tracking_code.projects.count() > 0:
            return jsonify(
                {"error": "Cannot delete code with associated projects"}
            ), 409

        db.session.delete(tracking_code)
        db.session.commit()

        return "", 204

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@tracking_code_bp.route("/export-csv", methods=["GET"])
def export_tracking_codes_csv():
    """Export all tracking codes as CSV."""
    codes = TrackingCode.query.order_by(TrackingCode.code).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["code", "note"])

    for code in codes:
        writer.writerow([code.code, code.note or ""])

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=tracking_codes.csv"},
    )


@tracking_code_bp.route("/import-csv", methods=["POST"])
def import_tracking_codes_csv():
    """Import tracking codes from CSV file."""
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

            existing = TrackingCode.query.filter_by(code=code_value).first()
            if existing:
                skipped += 1
                continue

            note_value = str(row.get("note", "")).strip() or None
            db.session.add(TrackingCode(code=code_value, note=note_value))
            created += 1

        db.session.commit()

        status = 201 if created > 0 else 200
        return jsonify(
            {"created": created, "skipped": skipped, "errors": errors}
        ), status

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
