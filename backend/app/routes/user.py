import csv
import io
import re

from flask import Blueprint, Response, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import User
from app.schemas import user_schema, users_schema

user_bp = Blueprint("user", __name__)


def validate_hex_color(color):
    """Validate hex color format #RRGGBB"""
    pattern = r"^#[0-9A-Fa-f]{6}$"
    return re.match(pattern, color) is not None


@user_bp.route("", methods=["GET"])
def get_all_users():
    """Get all users"""
    users = User.query.order_by(User.name).all()
    return jsonify(users_schema.dump(users)), 200


@user_bp.route("/<int:id>", methods=["GET"])
def get_user(id):
    """Get a single user by ID"""
    user = User.query.get_or_404(id)
    return jsonify(user_schema.dump(user)), 200


@user_bp.route("", methods=["POST"])
def create_user():
    """Create a new user"""
    try:
        data = request.get_json()

        if not data or "name" not in data or "color" not in data:
            return jsonify({"error": "Name and color are required"}), 400

        # Validate color format
        if not validate_hex_color(data["color"]):
            return jsonify({"error": "Color must be in hex format #RRGGBB"}), 400

        user = User(
            name=data["name"], color=data["color"], sub=data.get("sub")
        )
        db.session.add(user)
        db.session.commit()

        return jsonify(user_schema.dump(user)), 201

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "User with this OIDC subject already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@user_bp.route("/<int:id>", methods=["PUT"])
def update_user(id):
    """Update a user"""
    try:
        user = User.query.get_or_404(id)
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Update name if provided
        if "name" in data:
            user.name = data["name"]

        # Update color if provided
        if "color" in data:
            if not validate_hex_color(data["color"]):
                return jsonify({"error": "Color must be in hex format #RRGGBB"}), 400
            user.color = data["color"]

        # Update OIDC subject if provided
        if "sub" in data:
            # Check if sub already exists (excluding current record)
            if data["sub"]:
                existing = User.query.filter(
                    User.sub == data["sub"], User.id != id
                ).first()
                if existing:
                    return jsonify(
                        {"error": "User with this OIDC subject already exists"}
                    ), 409
            user.sub = data["sub"]

        db.session.commit()
        return jsonify(user_schema.dump(user)), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "User with this OIDC subject already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@user_bp.route("/<int:id>", methods=["DELETE"])
def delete_user(id):
    """Delete a user"""
    try:
        user = User.query.get_or_404(id)

        # Check if there are associated time entries
        if user.time_entries.count() > 0:
            return jsonify(
                {"error": "Cannot delete user with associated time entries"}
            ), 409

        db.session.delete(user)
        db.session.commit()

        return "", 204

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@user_bp.route("/export-csv", methods=["GET"])
def export_users_csv():
    """Export all users as CSV."""
    users = User.query.order_by(User.name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "color", "sub"])

    for user in users:
        writer.writerow([user.name, user.color, user.sub or ""])

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@user_bp.route("/import-csv", methods=["POST"])
def import_users_csv():
    """Import users from CSV file."""
    try:
        if "file" not in request.files:
            return jsonify({"error": 'CSV file is required in form field "file"'}), 400

        csv_file = request.files["file"]
        if not csv_file or not csv_file.filename:
            return jsonify({"error": "CSV file is required"}), 400

        content = csv_file.stream.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))

        required_headers = {"name", "color"}
        if not reader.fieldnames or not required_headers.issubset(
            set(reader.fieldnames)
        ):
            return jsonify(
                {"error": "CSV header must contain: name,color (sub optional)"}
            ), 400

        created = 0
        updated = 0
        errors = []

        for idx, row in enumerate(reader, start=2):
            name = str(row.get("name", "")).strip()
            color = str(row.get("color", "")).strip()
            sub = str(row.get("sub", "")).strip() or None

            if not name or not color:
                errors.append({"line": idx, "error": "name and color are required"})
                continue

            if not validate_hex_color(color):
                errors.append(
                    {"line": idx, "error": "color must be in #RRGGBB format"}
                )
                continue

            target = None
            if sub:
                target = User.query.filter_by(sub=sub).first()
            if not target:
                target = User.query.filter_by(name=name).first()

            if target:
                target.name = name
                target.color = color
                if sub:
                    existing_sub = User.query.filter(
                        User.sub == sub,
                        User.id != target.id,
                    ).first()
                    if existing_sub:
                        errors.append(
                            {"line": idx, "error": "sub already used by another user"}
                        )
                        continue
                target.sub = sub
                updated += 1
            else:
                existing_sub = (
                    User.query.filter_by(sub=sub).first() if sub else None
                )
                if existing_sub:
                    errors.append(
                        {"line": idx, "error": "sub already used by another user"}
                    )
                    continue

                db.session.add(User(name=name, color=color, sub=sub))
                created += 1

        db.session.commit()

        status = 201 if created > 0 else 200
        return jsonify(
            {"created": created, "updated": updated, "errors": errors}
        ), status

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
