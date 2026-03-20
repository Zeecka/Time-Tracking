import csv
import io

from flask import Blueprint, Response, jsonify, request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import Project, TrackingCode
from app.schemas import project_schema, projects_schema

project_bp = Blueprint("project", __name__)
ALLOWED_PATTERNS = {"solid", "striped", "dotted"}


def _normalize_and_validate_pattern(value):
    pattern = str(value or "solid").strip().lower()
    if pattern not in ALLOWED_PATTERNS:
        allowed_values = ", ".join(sorted(ALLOWED_PATTERNS))
        raise ValueError(f"Invalid pattern, allowed values: {allowed_values}")
    return pattern


@project_bp.route("", methods=["GET"])
def get_all_projects():
    """Get all projects"""
    projects = Project.query.order_by(Project.name).all()
    return jsonify(projects_schema.dump(projects)), 200


@project_bp.route("/<int:id>", methods=["GET"])
def get_project(id):
    """Get a single project by ID"""
    project = Project.query.get_or_404(id)
    return jsonify(project_schema.dump(project)), 200


@project_bp.route("", methods=["POST"])
def create_project():
    """Create a new project"""
    try:
        data = request.get_json()

        if not data or "name" not in data or "tracking_code_id" not in data:
            return jsonify(
                {"error": "Project name and tracking_code_id are required"}
            ), 400

        # Check if tracking code exists
        tracking_code = TrackingCode.query.get(data["tracking_code_id"])
        if not tracking_code:
            return jsonify({"error": "Tracking code not found"}), 404

        # Check if project name already exists
        existing = Project.query.filter_by(name=data["name"]).first()
        if existing:
            return jsonify({"error": "Project name already exists"}), 409

        try:
            pattern = _normalize_and_validate_pattern(data.get("pattern", "solid"))
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        project = Project(
            name=data["name"],
            color=data.get("color", "#3498db"),
            pattern=pattern,
            tracking_code_id=data["tracking_code_id"],
        )
        db.session.add(project)
        db.session.commit()

        return jsonify(project_schema.dump(project)), 201

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Project name already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@project_bp.route("/<int:id>", methods=["PUT"])
def update_project(id):
    """Update a project"""
    try:
        project = Project.query.get_or_404(id)
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Update name if provided
        if "name" in data:
            # Check if new name already exists (excluding current record)
            existing = Project.query.filter(
                Project.name == data["name"], Project.id != id
            ).first()
            if existing:
                return jsonify({"error": "Project name already exists"}), 409
            project.name = data["name"]

        # Update tracking code if provided
        if "tracking_code_id" in data:
            tracking_code = TrackingCode.query.get(data["tracking_code_id"])
            if not tracking_code:
                return jsonify({"error": "Tracking code not found"}), 404
            project.tracking_code_id = data["tracking_code_id"]

        # Update color if provided
        if "color" in data:
            project.color = data["color"]

        if "pattern" in data:
            try:
                project.pattern = _normalize_and_validate_pattern(data["pattern"])
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        db.session.commit()
        return jsonify(project_schema.dump(project)), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Project name already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@project_bp.route("/<int:id>", methods=["DELETE"])
def delete_project(id):
    """Delete a project"""
    try:
        project = Project.query.get_or_404(id)

        # Check if there are associated time entries
        if project.time_entries.count() > 0:
            return jsonify(
                {"error": "Cannot delete project with associated time entries"}
            ), 409

        db.session.delete(project)
        db.session.commit()

        return "", 204

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@project_bp.route("/export-csv", methods=["GET"])
def export_projects_csv():
    """Export all projects as CSV."""
    projects = Project.query.order_by(Project.name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["name", "color", "pattern", "tracking_code"])

    for project in projects:
        writer.writerow(
            [
                project.name,
                project.color,
                project.pattern,
                project.tracking_code.code if project.tracking_code else "",
            ]
        )

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=projects.csv"},
    )


@project_bp.route("/import-csv", methods=["POST"])
def import_projects_csv():
    """Import projects from CSV file."""
    try:
        if "file" not in request.files:
            return jsonify({"error": 'CSV file is required in form field "file"'}), 400

        csv_file = request.files["file"]
        if not csv_file or not csv_file.filename:
            return jsonify({"error": "CSV file is required"}), 400

        content = csv_file.stream.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))

        required_headers = {"name", "tracking_code"}
        if not reader.fieldnames or not required_headers.issubset(
            set(reader.fieldnames)
        ):
            return jsonify(
                {
                    "error": "CSV header must contain: name,tracking_code (color,pattern optional)"
                }
            ), 400

        created = 0
        updated = 0
        errors = []

        for idx, row in enumerate(reader, start=2):
            name = str(row.get("name", "")).strip()
            code_value = str(row.get("tracking_code", "")).strip()
            color = str(row.get("color", "")).strip() or "#3498db"
            pattern_value = row.get("pattern", "solid")

            if not name or not code_value:
                errors.append(
                    {"line": idx, "error": "name and tracking_code are required"}
                )
                continue

            tracking_code = TrackingCode.query.filter_by(code=code_value).first()
            if not tracking_code:
                errors.append(
                    {"line": idx, "error": f"tracking_code not found: {code_value}"}
                )
                continue

            try:
                pattern = _normalize_and_validate_pattern(pattern_value)
            except ValueError as e:
                errors.append({"line": idx, "error": str(e)})
                continue

            project = Project.query.filter_by(name=name).first()
            if project:
                project.tracking_code_id = tracking_code.id
                project.color = color
                project.pattern = pattern
                updated += 1
            else:
                db.session.add(
                    Project(
                        name=name,
                        color=color,
                        pattern=pattern,
                        tracking_code_id=tracking_code.id,
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
