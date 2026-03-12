import csv
import io
from datetime import datetime, timedelta

from flask import Blueprint, Response, jsonify, request

from app.extensions import db
from app.models import Pointage, Projet, Utilisateur
from app.schemas import pointage_schema, pointages_schema

pointage_bp = Blueprint("pointage", __name__)

PERIODES_DEBUT = {"matin", "midi"}
PERIODES_FIN = {"midi", "soir"}
PERIODES_DEBUT_LEGACY_MAP = {"journee": "matin", "apres_midi": "midi"}
PERIODES_FIN_LEGACY_MAP = {"journee": "soir", "apres_midi": "midi"}
PERIODE_ORDER = {"matin": 0, "midi": 1, "soir": 2}


def _parse_iso_date(value, field_name):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValueError(f"Invalid {field_name}, expected format YYYY-MM-DD")


def _validate_week_year_for_dates(date_debut, date_fin, numero_semaine, annee):
    start_iso = date_debut.isocalendar()
    end_iso = date_fin.isocalendar()

    if start_iso.year != annee or start_iso.week != numero_semaine:
        raise ValueError("Start date must be in the provided ISO week/year")
    if end_iso.year != annee or end_iso.week != numero_semaine:
        raise ValueError("End date must be in the provided ISO week/year")


def _normalize_and_validate_periode(value, field_name, is_start):
    periode = str(value).strip().lower()
    if is_start and periode in PERIODES_DEBUT_LEGACY_MAP:
        periode = PERIODES_DEBUT_LEGACY_MAP[periode]
    if not is_start and periode in PERIODES_FIN_LEGACY_MAP:
        periode = PERIODES_FIN_LEGACY_MAP[periode]

    allowed_values = PERIODES_DEBUT if is_start else PERIODES_FIN
    allowed_values_str = ", ".join(sorted(allowed_values))

    if periode not in allowed_values:
        raise ValueError(f"Invalid {field_name}, allowed values: {allowed_values_str}")
    return periode


def _validate_pointage_dates_and_periodes(
    date_debut, date_fin, periode_debut, periode_fin
):
    if date_fin < date_debut:
        raise ValueError("End date must be greater than or equal to start date")
    if (
        date_debut == date_fin
        and PERIODE_ORDER[periode_fin] <= PERIODE_ORDER[periode_debut]
    ):
        raise ValueError(
            "For a single day entry, end period must be after start period"
        )


def _check_overlap(
    date1_start,
    period1_start,
    date1_end,
    period1_end,
    date2_start,
    period2_start,
    date2_end,
    period2_end,
):
    """Check if two time periods overlap, considering half-days (morning/afternoon)."""

    # Convert dates and periods to comparable values
    # Each day has 2 slots: 0 (matin-midi) and 1 (midi-soir)
    def date_period_to_timestamp(date, period):
        # Convert to a comparable number: date in days + slot in half-days
        days = date.toordinal()
        if period == "matin":
            slot = 0
        elif period == "midi":
            slot = 0.5  # midi can be start or end
        else:  # soir
            slot = 1
        return days + slot

    start1 = date_period_to_timestamp(date1_start, period1_start)
    end1 = date_period_to_timestamp(date1_end, period1_end)
    start2 = date_period_to_timestamp(date2_start, period2_start)
    end2 = date_period_to_timestamp(date2_end, period2_end)

    # Two ranges overlap if: start1 < end2 AND start2 < end1
    return start1 < end2 and start2 < end1


def _validate_no_overlap_for_user(
    utilisateur_id,
    date_debut,
    periode_debut,
    date_fin,
    periode_fin,
    exclude_pointage_id=None,
):
    """Validate that a new time entry does not overlap with existing entries for the same user."""

    # Get all pointages for this user
    query = Pointage.query.filter_by(utilisateur_id=utilisateur_id)

    # Exclude current pointage if updating
    if exclude_pointage_id:
        query = query.filter(Pointage.id != exclude_pointage_id)

    # Filter by date range to reduce checks (overlapping dates must be within range)
    query = query.filter(
        Pointage.date_debut <= date_fin, Pointage.date_fin >= date_debut
    )

    existing_pointages = query.all()

    for existing in existing_pointages:
        if _check_overlap(
            date_debut,
            periode_debut,
            date_fin,
            periode_fin,
            existing.date_debut,
            existing.periode_debut,
            existing.date_fin,
            existing.periode_fin,
        ):
            return False, (
                "Ce pointage chevauche un pointage existant pour cet utilisateur "
                f"(projet : {existing.projet.nom})"
            )

    return True, None


def _are_periods_adjacent(period1, period2, is_end_to_start=True):
    """
    Check if two periods are adjacent (no gap, no overlap).

    If is_end_to_start is True, check if period1 ends right before/at same time as period2 starts.
    Adjacency means periods are consecutive without overlap.

    Periods order: matin(morning) -> midi(midday) -> soir(evening)
    """
    if is_end_to_start:
        # Adjacent combinations for end->start on same date:
        # matin -> midi, midi -> soir, multi->midi (same boundary point)
        if period1 == "midi" and period2 in ["midi", "soir"]:
            return True
        if period1 == "matin" and period2 == "midi":
            return True
        return False
    else:
        # This case mirrors the above (end->start)
        if period2 == "midi" and period1 in ["midi", "soir"]:
            return True
        if period2 == "matin" and period1 == "midi":
            return True
        return False


def _find_adjacent_pointages(pointage):
    """
    Find pointages that are adjacent to the given pointage for same user and project.
    Returns a tuple (before_pointage, after_pointage) where:
    - before_pointage: ends right before this pointage starts
    - after_pointage: starts right after this pointage ends
    """
    adjacent_before = None
    adjacent_after = None

    # Query all pointages for same user and project
    same_user_project = (
        Pointage.query.filter_by(
            utilisateur_id=pointage.utilisateur_id,
            projet_id=pointage.projet_id,
        )
        .filter(Pointage.id != pointage.id)
        .all()
    )

    for existing in same_user_project:
        # Check if existing ends right before this one starts
        day_before = pointage.date_debut - timedelta(days=1)

        if existing.date_fin < pointage.date_debut:
            # existing is completely before
            if existing.date_fin == day_before:
                # existing is the day before, only soir -> matin is adjacent
                if existing.periode_fin == "soir" and pointage.periode_debut == "matin":
                    adjacent_before = existing
        elif existing.date_fin == pointage.date_debut:
            # same end date and start date, check periods
            if _are_periods_adjacent(
                existing.periode_fin, pointage.periode_debut, is_end_to_start=True
            ):
                adjacent_before = existing

        # Check if existing starts right after this one ends
        day_after = pointage.date_fin + timedelta(days=1)

        if existing.date_debut > pointage.date_fin:
            # existing is completely after
            if existing.date_debut == day_after:
                # existing is the day after, only soir -> matin is adjacent
                if pointage.periode_fin == "soir" and existing.periode_debut == "matin":
                    adjacent_after = existing
        elif existing.date_debut == pointage.date_fin:
            # same start date and end date, check periods
            if _are_periods_adjacent(
                pointage.periode_fin, existing.periode_debut, is_end_to_start=True
            ):
                adjacent_after = existing

    return adjacent_before, adjacent_after


def _merge_pointages(pointage, before_pointage=None, after_pointage=None):
    """
    Merge adjacent pointages and return the merged result.
    Updates date_debut/periode_debut from before_pointage if exists.
    Updates date_fin/periode_fin from after_pointage if exists.
    Concatenates notes from all involved pointages.
    Deletes the before and after pointages from DB.
    """
    # Collect all notes to concatenate
    notes = []

    if before_pointage and before_pointage.note:
        notes.append(before_pointage.note)
    if pointage.note:
        notes.append(pointage.note)
    if after_pointage and after_pointage.note:
        notes.append(after_pointage.note)

    # Update start date/period if there's a before pointage
    if before_pointage:
        pointage.date_debut = before_pointage.date_debut
        pointage.periode_debut = before_pointage.periode_debut

    # Update end date/period if there's an after pointage
    if after_pointage:
        pointage.date_fin = after_pointage.date_fin
        pointage.periode_fin = after_pointage.periode_fin

    # Merge notes with newlines
    if notes:
        pointage.note = "\n".join(notes) if len(notes) > 1 else notes[0]

    # Delete old pointages
    if before_pointage:
        db.session.delete(before_pointage)
    if after_pointage:
        db.session.delete(after_pointage)

    return pointage


@pointage_bp.route("", methods=["GET"])
def get_all_pointages():
    """Get all time entries with optional filtering"""
    # Query parameters for filtering
    utilisateur_id = request.args.get("utilisateur_id", type=int)
    projet_id = request.args.get("projet_id", type=int)
    numero_semaine = request.args.get("numero_semaine", type=int)
    annee = request.args.get("annee", type=int)

    query = Pointage.query

    # Apply filters
    if utilisateur_id:
        query = query.filter_by(utilisateur_id=utilisateur_id)
    if projet_id:
        query = query.filter_by(projet_id=projet_id)
    if numero_semaine:
        query = query.filter_by(numero_semaine=numero_semaine)
    if annee:
        query = query.filter_by(annee=annee)

    # Order by year, week, then user
    pointages = query.order_by(
        Pointage.annee.desc(), Pointage.numero_semaine.desc(), Pointage.utilisateur_id
    ).all()

    return jsonify(pointages_schema.dump(pointages)), 200


@pointage_bp.route("/<int:id>", methods=["GET"])
def get_pointage(id):
    """Get a single time entry by ID"""
    pointage = Pointage.query.get_or_404(id)
    return jsonify(pointage_schema.dump(pointage)), 200


@pointage_bp.route("", methods=["POST"])
def create_pointage():
    """Create a new time entry"""
    try:
        data = request.get_json()

        # Validate required fields
        required_fields = [
            "date_debut",
            "periode_debut",
            "date_fin",
            "periode_fin",
            "numero_semaine",
            "annee",
            "utilisateur_id",
            "projet_id",
        ]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"{field} is required"}), 400

        # Validate dates
        try:
            date_debut = _parse_iso_date(data["date_debut"], "date_debut")
            date_fin = _parse_iso_date(data["date_fin"], "date_fin")
            periode_debut = _normalize_and_validate_periode(
                data["periode_debut"], "periode_debut", True
            )
            periode_fin = _normalize_and_validate_periode(
                data["periode_fin"], "periode_fin", False
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        try:
            _validate_pointage_dates_and_periodes(
                date_debut,
                date_fin,
                periode_debut,
                periode_fin,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        # Validate week number (1-53)
        if not 1 <= data["numero_semaine"] <= 53:
            return jsonify({"error": "Week number must be between 1 and 53"}), 400

        # Validate year
        if data["annee"] < 2000 or data["annee"] > 2100:
            return jsonify({"error": "Year must be between 2000 and 2100"}), 400

        # Validate dates are in requested week/year
        try:
            _validate_week_year_for_dates(
                date_debut, date_fin, data["numero_semaine"], data["annee"]
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        # Check if user exists
        utilisateur = Utilisateur.query.get(data["utilisateur_id"])
        if not utilisateur:
            return jsonify({"error": "User not found"}), 404

        # Check if project exists
        projet = Projet.query.get(data["projet_id"])
        if not projet:
            return jsonify({"error": "Project not found"}), 404

        # Validate no overlap for this user
        is_valid, error_msg = _validate_no_overlap_for_user(
            data["utilisateur_id"], date_debut, periode_debut, date_fin, periode_fin
        )
        if not is_valid:
            return jsonify({"error": error_msg}), 409

        pointage = Pointage(
            date_debut=date_debut,
            periode_debut=periode_debut,
            date_fin=date_fin,
            periode_fin=periode_fin,
            numero_semaine=data["numero_semaine"],
            annee=data["annee"],
            utilisateur_id=data["utilisateur_id"],
            projet_id=data["projet_id"],
            note=data.get("note") or None,
        )
        db.session.add(pointage)
        db.session.flush()  # Flush to get the ID

        # Check for adjacent pointages and merge if found
        before_pointage, after_pointage = _find_adjacent_pointages(pointage)
        if before_pointage or after_pointage:
            pointage = _merge_pointages(pointage, before_pointage, after_pointage)

        db.session.commit()

        return jsonify(pointage_schema.dump(pointage)), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@pointage_bp.route("/<int:id>", methods=["PUT"])
def update_pointage(id):
    """Update a time entry"""
    try:
        pointage = Pointage.query.get_or_404(id)
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Update dates if provided
        if "date_debut" in data:
            try:
                pointage.date_debut = _parse_iso_date(data["date_debut"], "date_debut")
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        if "date_fin" in data:
            try:
                pointage.date_fin = _parse_iso_date(data["date_fin"], "date_fin")
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        if "periode_debut" in data:
            try:
                pointage.periode_debut = _normalize_and_validate_periode(
                    data["periode_debut"], "periode_debut", True
                )
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        if "periode_fin" in data:
            try:
                pointage.periode_fin = _normalize_and_validate_periode(
                    data["periode_fin"], "periode_fin", False
                )
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        try:
            pointage.periode_debut = _normalize_and_validate_periode(
                pointage.periode_debut, "periode_debut", True
            )
            pointage.periode_fin = _normalize_and_validate_periode(
                pointage.periode_fin, "periode_fin", False
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        # Update week number if provided
        if "numero_semaine" in data:
            if not 1 <= data["numero_semaine"] <= 53:
                return jsonify({"error": "Week number must be between 1 and 53"}), 400
            pointage.numero_semaine = data["numero_semaine"]

        # Update year if provided
        if "annee" in data:
            if data["annee"] < 2000 or data["annee"] > 2100:
                return jsonify({"error": "Year must be between 2000 and 2100"}), 400
            pointage.annee = data["annee"]

        try:
            _validate_pointage_dates_and_periodes(
                pointage.date_debut,
                pointage.date_fin,
                pointage.periode_debut,
                pointage.periode_fin,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        try:
            _validate_week_year_for_dates(
                pointage.date_debut,
                pointage.date_fin,
                pointage.numero_semaine,
                pointage.annee,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        # Update user if provided
        if "utilisateur_id" in data:
            utilisateur = Utilisateur.query.get(data["utilisateur_id"])
            if not utilisateur:
                return jsonify({"error": "User not found"}), 404
            pointage.utilisateur_id = data["utilisateur_id"]

        # Update project if provided
        if "projet_id" in data:
            projet = Projet.query.get(data["projet_id"])
            if not projet:
                return jsonify({"error": "Project not found"}), 404
            pointage.projet_id = data["projet_id"]

        # Update note if provided
        if "note" in data:
            pointage.note = data["note"] or None

        # Validate no overlap for this user (excluding current pointage)
        is_valid, error_msg = _validate_no_overlap_for_user(
            pointage.utilisateur_id,
            pointage.date_debut,
            pointage.periode_debut,
            pointage.date_fin,
            pointage.periode_fin,
            exclude_pointage_id=id,
        )
        if not is_valid:
            return jsonify({"error": error_msg}), 409

        # Check for adjacent pointages and merge if found
        before_pointage, after_pointage = _find_adjacent_pointages(pointage)
        if before_pointage or after_pointage:
            pointage = _merge_pointages(pointage, before_pointage, after_pointage)

        db.session.commit()
        return jsonify(pointage_schema.dump(pointage)), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@pointage_bp.route("/<int:id>", methods=["DELETE"])
def delete_pointage(id):
    """Delete a time entry"""
    try:
        pointage = Pointage.query.get_or_404(id)
        db.session.delete(pointage)
        db.session.commit()

        return "", 204

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@pointage_bp.route("/bulk", methods=["POST"])
def bulk_create_pointages():
    """Create multiple time entries at once"""
    try:
        data = request.get_json()

        if not data or "pointages" not in data:
            return jsonify({"error": "Array of pointages is required"}), 400

        created_pointages = []
        errors = []

        for idx, pointage_data in enumerate(data["pointages"]):
            try:
                # Validate required fields
                required_fields = [
                    "date_debut",
                    "periode_debut",
                    "date_fin",
                    "periode_fin",
                    "numero_semaine",
                    "annee",
                    "utilisateur_id",
                    "projet_id",
                ]
                missing_fields = [
                    field for field in required_fields if field not in pointage_data
                ]
                if missing_fields:
                    errors.append(
                        {
                            "index": idx,
                            "error": f"Missing required fields: {', '.join(missing_fields)}",
                        }
                    )
                    continue

                date_debut = _parse_iso_date(pointage_data["date_debut"], "date_debut")
                date_fin = _parse_iso_date(pointage_data["date_fin"], "date_fin")
                periode_debut = _normalize_and_validate_periode(
                    pointage_data["periode_debut"], "periode_debut", True
                )
                periode_fin = _normalize_and_validate_periode(
                    pointage_data["periode_fin"], "periode_fin", False
                )

                _validate_pointage_dates_and_periodes(
                    date_debut,
                    date_fin,
                    periode_debut,
                    periode_fin,
                )

                _validate_week_year_for_dates(
                    date_debut,
                    date_fin,
                    pointage_data["numero_semaine"],
                    pointage_data["annee"],
                )

                pointage = Pointage(
                    date_debut=date_debut,
                    periode_debut=periode_debut,
                    date_fin=date_fin,
                    periode_fin=periode_fin,
                    numero_semaine=pointage_data["numero_semaine"],
                    annee=pointage_data["annee"],
                    utilisateur_id=pointage_data["utilisateur_id"],
                    projet_id=pointage_data["projet_id"],
                    note=pointage_data.get("note") or None,
                )
                db.session.add(pointage)
                db.session.flush()  # Flush to get the ID

                # Check for adjacent pointages and merge if found
                before_pointage, after_pointage = _find_adjacent_pointages(pointage)
                if before_pointage or after_pointage:
                    pointage = _merge_pointages(
                        pointage, before_pointage, after_pointage
                    )

                created_pointages.append(pointage)

            except Exception as e:
                errors.append({"index": idx, "error": str(e)})

        if created_pointages:
            db.session.commit()

        return jsonify(
            {
                "created": len(created_pointages),
                "errors": errors,
                "pointages": pointages_schema.dump(created_pointages),
            }
        ), 201 if created_pointages else 400

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@pointage_bp.route("/export-csv", methods=["GET"])
def export_pointages_csv():
    """Export all pointages (or filtered by week/year) as CSV."""
    numero_semaine = request.args.get("numero_semaine", type=int)
    annee = request.args.get("annee", type=int)

    query = Pointage.query
    if numero_semaine:
        query = query.filter_by(numero_semaine=numero_semaine)
    if annee:
        query = query.filter_by(annee=annee)

    pointages = query.order_by(
        Pointage.annee.desc(),
        Pointage.numero_semaine.desc(),
        Pointage.date_debut.asc(),
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "date_debut",
            "periode_debut",
            "date_fin",
            "periode_fin",
            "numero_semaine",
            "annee",
            "utilisateur",
            "projet",
            "note",
        ]
    )

    for pointage in pointages:
        writer.writerow(
            [
                pointage.date_debut.isoformat(),
                pointage.periode_debut,
                pointage.date_fin.isoformat(),
                pointage.periode_fin,
                pointage.numero_semaine,
                pointage.annee,
                pointage.utilisateur.nom if pointage.utilisateur else "",
                pointage.projet.nom if pointage.projet else "",
                pointage.note or "",
            ]
        )

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=pointages.csv"},
    )


@pointage_bp.route("/import-csv", methods=["POST"])
def import_pointages_csv():
    """Import pointages from CSV file."""
    try:
        if "file" not in request.files:
            return jsonify({"error": 'CSV file is required in form field "file"'}), 400

        csv_file = request.files["file"]
        if not csv_file or not csv_file.filename:
            return jsonify({"error": "CSV file is required"}), 400

        content = csv_file.stream.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))

        required_headers = {
            "date_debut",
            "periode_debut",
            "date_fin",
            "periode_fin",
            "numero_semaine",
            "annee",
            "utilisateur",
            "projet",
        }
        if not reader.fieldnames or not required_headers.issubset(
            set(reader.fieldnames)
        ):
            return jsonify(
                {
                    "error": (
                        "CSV header must contain: "
                        "date_debut,periode_debut,date_fin,periode_fin,numero_semaine,annee,utilisateur,projet "
                        "(note optional)"
                    )
                }
            ), 400

        created_pointages = []
        errors = []

        for idx, row in enumerate(reader, start=2):
            with db.session.begin_nested():
                try:
                    utilisateur_nom = str(row.get("utilisateur", "")).strip()
                    projet_nom = str(row.get("projet", "")).strip()

                    if not utilisateur_nom or not projet_nom:
                        raise ValueError("utilisateur and projet are required")

                    utilisateur = Utilisateur.query.filter_by(
                        nom=utilisateur_nom
                    ).first()
                    if not utilisateur:
                        raise ValueError(f"User not found: {utilisateur_nom}")

                    projet = Projet.query.filter_by(nom=projet_nom).first()
                    if not projet:
                        raise ValueError(f"Project not found: {projet_nom}")

                    numero_semaine = int(str(row.get("numero_semaine", "")).strip())
                    annee = int(str(row.get("annee", "")).strip())
                    if not 1 <= numero_semaine <= 53:
                        raise ValueError("Week number must be between 1 and 53")
                    if annee < 2000 or annee > 2100:
                        raise ValueError("Year must be between 2000 and 2100")

                    date_debut = _parse_iso_date(row.get("date_debut"), "date_debut")
                    date_fin = _parse_iso_date(row.get("date_fin"), "date_fin")
                    periode_debut = _normalize_and_validate_periode(
                        row.get("periode_debut"), "periode_debut", True
                    )
                    periode_fin = _normalize_and_validate_periode(
                        row.get("periode_fin"), "periode_fin", False
                    )

                    _validate_pointage_dates_and_periodes(
                        date_debut,
                        date_fin,
                        periode_debut,
                        periode_fin,
                    )
                    _validate_week_year_for_dates(
                        date_debut,
                        date_fin,
                        numero_semaine,
                        annee,
                    )

                    is_valid, error_msg = _validate_no_overlap_for_user(
                        utilisateur.id,
                        date_debut,
                        periode_debut,
                        date_fin,
                        periode_fin,
                    )
                    if not is_valid:
                        raise ValueError(error_msg)

                    pointage = Pointage(
                        date_debut=date_debut,
                        periode_debut=periode_debut,
                        date_fin=date_fin,
                        periode_fin=periode_fin,
                        numero_semaine=numero_semaine,
                        annee=annee,
                        utilisateur_id=utilisateur.id,
                        projet_id=projet.id,
                        note=str(row.get("note", "")).strip() or None,
                    )
                    db.session.add(pointage)
                    db.session.flush()

                    before_pointage, after_pointage = _find_adjacent_pointages(pointage)
                    if before_pointage or after_pointage:
                        pointage = _merge_pointages(
                            pointage,
                            before_pointage,
                            after_pointage,
                        )

                    created_pointages.append(pointage)

                except Exception as row_error:
                    errors.append({"line": idx, "error": str(row_error)})

        if created_pointages:
            db.session.commit()

        status = 201 if created_pointages else 200
        return jsonify(
            {
                "created": len(created_pointages),
                "errors": errors,
                "pointages": pointages_schema.dump(created_pointages),
            }
        ), status

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
