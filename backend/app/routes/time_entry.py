import csv
import io
from datetime import datetime, timedelta

from flask import Blueprint, Response, jsonify, request

from app.extensions import db
from app.models import Project, TimeEntry, User
from app.schemas import time_entries_schema, time_entry_schema

time_entry_bp = Blueprint("time_entry", __name__)

START_PERIODS = {"morning", "midday"}
END_PERIODS = {"midday", "evening"}
START_PERIOD_LEGACY_MAP = {"full_day": "morning", "afternoon": "midday"}
END_PERIOD_LEGACY_MAP = {"full_day": "evening", "afternoon": "midday"}
PERIOD_ORDER = {"morning": 0, "midday": 1, "evening": 2}


def _parse_iso_date(value, field_name):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValueError(f"Invalid {field_name}, expected format YYYY-MM-DD")


def _validate_week_year_for_dates(start_date, end_date, week_number, year):
    start_iso = start_date.isocalendar()
    end_iso = end_date.isocalendar()

    if start_iso.year != year or start_iso.week != week_number:
        raise ValueError("Start date must be in the provided ISO week/year")
    if end_iso.year != year or end_iso.week != week_number:
        raise ValueError("End date must be in the provided ISO week/year")


def _normalize_and_validate_period(value, field_name, is_start):
    period = str(value).strip().lower()
    if is_start and period in START_PERIOD_LEGACY_MAP:
        period = START_PERIOD_LEGACY_MAP[period]
    if not is_start and period in END_PERIOD_LEGACY_MAP:
        period = END_PERIOD_LEGACY_MAP[period]

    allowed_values = START_PERIODS if is_start else END_PERIODS
    allowed_values_str = ", ".join(sorted(allowed_values))

    if period not in allowed_values:
        raise ValueError(f"Invalid {field_name}, allowed values: {allowed_values_str}")
    return period


def _validate_entry_dates_and_periods(start_date, end_date, start_period, end_period):
    if end_date < start_date:
        raise ValueError("End date must be greater than or equal to start date")
    if (
        start_date == end_date
        and PERIOD_ORDER[end_period] <= PERIOD_ORDER[start_period]
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

    def date_period_to_timestamp(date, period):
        days = date.toordinal()
        if period == "morning":
            slot = 0
        elif period == "midday":
            slot = 0.5
        else:  # evening
            slot = 1
        return days + slot

    start1 = date_period_to_timestamp(date1_start, period1_start)
    end1 = date_period_to_timestamp(date1_end, period1_end)
    start2 = date_period_to_timestamp(date2_start, period2_start)
    end2 = date_period_to_timestamp(date2_end, period2_end)

    # Two ranges overlap if: start1 < end2 AND start2 < end1
    return start1 < end2 and start2 < end1


def _date_period_to_boundary_index(date_value, period):
    period_offset = PERIOD_ORDER[period]
    return (date_value.toordinal() * 3) + period_offset


def _boundary_index_to_date_period(boundary_index):
    day_ordinal, offset = divmod(boundary_index, 3)
    if offset == 0:
        return datetime.fromordinal(day_ordinal).date(), "morning"
    if offset == 1:
        return datetime.fromordinal(day_ordinal).date(), "midday"
    return datetime.fromordinal(day_ordinal + 1).date(), "morning"


def _boundary_index_to_end_date_period(boundary_index):
    day_ordinal, offset = divmod(boundary_index, 3)
    if offset == 1:
        return datetime.fromordinal(day_ordinal).date(), "midday"
    if offset == 2:
        return datetime.fromordinal(day_ordinal).date(), "evening"
    return datetime.fromordinal(day_ordinal - 1).date(), "evening"


def _apply_interval_to_entry(entry, start_boundary, end_boundary):
    entry.start_date, entry.start_period = _boundary_index_to_date_period(
        start_boundary
    )
    entry.end_date, entry.end_period = _boundary_index_to_end_date_period(end_boundary)
    entry.week_number = entry.start_date.isocalendar().week
    entry.year = entry.start_date.isocalendar().year


def _split_overlapping_entry(existing_entry, new_start_boundary, new_end_boundary):
    existing_start = _date_period_to_boundary_index(
        existing_entry.start_date, existing_entry.start_period
    )
    existing_end = _date_period_to_boundary_index(
        existing_entry.end_date, existing_entry.end_period
    )

    if existing_start >= new_end_boundary or new_start_boundary >= existing_end:
        return

    left_segment = None
    right_segment = None

    if existing_start < new_start_boundary:
        left_segment = (existing_start, min(new_start_boundary, existing_end))

    if new_end_boundary < existing_end:
        right_segment = (max(new_end_boundary, existing_start), existing_end)

    if left_segment and right_segment:
        _apply_interval_to_entry(existing_entry, left_segment[0], left_segment[1])
        split_entry = TimeEntry(
            start_date=existing_entry.start_date,
            start_period=existing_entry.start_period,
            end_date=existing_entry.end_date,
            end_period=existing_entry.end_period,
            week_number=existing_entry.week_number,
            year=existing_entry.year,
            user_id=existing_entry.user_id,
            project_id=existing_entry.project_id,
            note=existing_entry.note,
        )
        _apply_interval_to_entry(split_entry, right_segment[0], right_segment[1])
        db.session.add(split_entry)
        return

    if left_segment:
        _apply_interval_to_entry(existing_entry, left_segment[0], left_segment[1])
        return

    if right_segment:
        _apply_interval_to_entry(existing_entry, right_segment[0], right_segment[1])
        return

    db.session.delete(existing_entry)


def _overwrite_overlapping_entries_for_user(
    user_id,
    start_date,
    start_period,
    end_date,
    end_period,
    exclude_entry_id=None,
):
    query = TimeEntry.query.filter_by(user_id=user_id)

    if exclude_entry_id:
        query = query.filter(TimeEntry.id != exclude_entry_id)

    overlapping_entries = query.filter(
        TimeEntry.start_date <= end_date,
        TimeEntry.end_date >= start_date,
    ).all()

    new_start_boundary = _date_period_to_boundary_index(start_date, start_period)
    new_end_boundary = _date_period_to_boundary_index(end_date, end_period)

    for existing in overlapping_entries:
        if not _check_overlap(
            start_date,
            start_period,
            end_date,
            end_period,
            existing.start_date,
            existing.start_period,
            existing.end_date,
            existing.end_period,
        ):
            continue
        _split_overlapping_entry(existing, new_start_boundary, new_end_boundary)


def _validate_no_overlap_for_user(
    user_id,
    start_date,
    start_period,
    end_date,
    end_period,
    exclude_entry_id=None,
):
    """Validate that a new time entry does not overlap with existing entries for the same user."""

    query = TimeEntry.query.filter_by(user_id=user_id)

    if exclude_entry_id:
        query = query.filter(TimeEntry.id != exclude_entry_id)

    query = query.filter(
        TimeEntry.start_date <= end_date, TimeEntry.end_date >= start_date
    )

    existing_entries = query.all()

    for existing in existing_entries:
        if _check_overlap(
            start_date,
            start_period,
            end_date,
            end_period,
            existing.start_date,
            existing.start_period,
            existing.end_date,
            existing.end_period,
        ):
            return False, (
                "This time entry overlaps an existing entry for this user "
                f"(project: {existing.project.name})"
            )

    return True, None


def _are_periods_adjacent(period1, period2, is_end_to_start=True):
    """
    Check if two periods are adjacent (no gap, no overlap).

    If is_end_to_start is True, check if period1 ends right before/at same time as period2 starts.
    Periods order: morning -> midday -> evening
    """
    if is_end_to_start:
        if period1 == "midday" and period2 in ["midday", "evening"]:
            return True
        if period1 == "morning" and period2 == "midday":
            return True
        return False
    else:
        if period2 == "midday" and period1 in ["midday", "evening"]:
            return True
        if period2 == "morning" and period1 == "midday":
            return True
        return False


def _find_adjacent_entries(entry):
    """
    Find entries that are adjacent to the given entry for same user and project.
    Returns a tuple (before_entry, after_entry).
    """
    adjacent_before = None
    adjacent_after = None

    same_user_project = (
        TimeEntry.query.filter_by(
            user_id=entry.user_id,
            project_id=entry.project_id,
        )
        .filter(TimeEntry.id != entry.id)
        .all()
    )

    for existing in same_user_project:
        day_before = entry.start_date - timedelta(days=1)

        if existing.end_date < entry.start_date:
            if existing.end_date == day_before:
                if existing.end_period == "evening" and entry.start_period == "morning":
                    adjacent_before = existing
        elif existing.end_date == entry.start_date:
            if _are_periods_adjacent(
                existing.end_period, entry.start_period, is_end_to_start=True
            ):
                adjacent_before = existing

        day_after = entry.end_date + timedelta(days=1)

        if existing.start_date > entry.end_date:
            if existing.start_date == day_after:
                if entry.end_period == "evening" and existing.start_period == "morning":
                    adjacent_after = existing
        elif existing.start_date == entry.end_date:
            if _are_periods_adjacent(
                entry.end_period, existing.start_period, is_end_to_start=True
            ):
                adjacent_after = existing

    return adjacent_before, adjacent_after


def _merge_entries(entry, before_entry=None, after_entry=None):
    """
    Merge adjacent time entries and return the merged result.
    Concatenates notes from all involved entries.
    Deletes the before and after entries from DB.
    """
    notes = []

    if before_entry and before_entry.note:
        notes.append(before_entry.note)
    if entry.note:
        notes.append(entry.note)
    if after_entry and after_entry.note:
        notes.append(after_entry.note)

    if before_entry:
        entry.start_date = before_entry.start_date
        entry.start_period = before_entry.start_period

    if after_entry:
        entry.end_date = after_entry.end_date
        entry.end_period = after_entry.end_period

    if notes:
        entry.note = "\n".join(notes) if len(notes) > 1 else notes[0]

    if before_entry:
        db.session.delete(before_entry)
    if after_entry:
        db.session.delete(after_entry)

    return entry


@time_entry_bp.route("", methods=["GET"])
def get_all_time_entries():
    """Get all time entries with optional filtering"""
    user_id = request.args.get("user_id", type=int)
    project_id = request.args.get("project_id", type=int)
    week_number = request.args.get("week_number", type=int)
    year = request.args.get("year", type=int)

    query = TimeEntry.query

    if user_id:
        query = query.filter_by(user_id=user_id)
    if project_id:
        query = query.filter_by(project_id=project_id)
    if week_number:
        query = query.filter_by(week_number=week_number)
    if year:
        query = query.filter_by(year=year)

    entries = query.order_by(
        TimeEntry.year.desc(), TimeEntry.week_number.desc(), TimeEntry.user_id
    ).all()

    return jsonify(time_entries_schema.dump(entries)), 200


@time_entry_bp.route("/<int:id>", methods=["GET"])
def get_time_entry(id):
    """Get a single time entry by ID"""
    entry = TimeEntry.query.get_or_404(id)
    return jsonify(time_entry_schema.dump(entry)), 200


@time_entry_bp.route("", methods=["POST"])
def create_time_entry():
    """Create a new time entry"""
    try:
        data = request.get_json()
        overwrite_conflicts = bool(data.get("overwrite_conflicts")) if data else False

        required_fields = [
            "start_date",
            "start_period",
            "end_date",
            "end_period",
            "week_number",
            "year",
            "user_id",
            "project_id",
        ]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"{field} is required"}), 400

        try:
            start_date = _parse_iso_date(data["start_date"], "start_date")
            end_date = _parse_iso_date(data["end_date"], "end_date")
            start_period = _normalize_and_validate_period(
                data["start_period"], "start_period", True
            )
            end_period = _normalize_and_validate_period(
                data["end_period"], "end_period", False
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        try:
            _validate_entry_dates_and_periods(
                start_date, end_date, start_period, end_period
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        if not 1 <= data["week_number"] <= 53:
            return jsonify({"error": "Week number must be between 1 and 53"}), 400

        if data["year"] < 2000 or data["year"] > 2100:
            return jsonify({"error": "Year must be between 2000 and 2100"}), 400

        try:
            _validate_week_year_for_dates(
                start_date, end_date, data["week_number"], data["year"]
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        user = User.query.get(data["user_id"])
        if not user:
            return jsonify({"error": "User not found"}), 404

        project = Project.query.get(data["project_id"])
        if not project:
            return jsonify({"error": "Project not found"}), 404

        if overwrite_conflicts:
            _overwrite_overlapping_entries_for_user(
                data["user_id"],
                start_date,
                start_period,
                end_date,
                end_period,
            )
        else:
            is_valid, error_msg = _validate_no_overlap_for_user(
                data["user_id"], start_date, start_period, end_date, end_period
            )
            if not is_valid:
                return jsonify({"error": error_msg}), 409

        entry = TimeEntry(
            start_date=start_date,
            start_period=start_period,
            end_date=end_date,
            end_period=end_period,
            week_number=data["week_number"],
            year=data["year"],
            user_id=data["user_id"],
            project_id=data["project_id"],
            note=data.get("note") or None,
        )
        db.session.add(entry)
        db.session.flush()

        before_entry, after_entry = _find_adjacent_entries(entry)
        if before_entry or after_entry:
            entry = _merge_entries(entry, before_entry, after_entry)

        db.session.commit()

        return jsonify(time_entry_schema.dump(entry)), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@time_entry_bp.route("/<int:id>", methods=["PUT"])
def update_time_entry(id):
    """Update a time entry"""
    try:
        entry = TimeEntry.query.get_or_404(id)
        data = request.get_json()
        overwrite_conflicts = bool(data.get("overwrite_conflicts")) if data else False

        if not data:
            return jsonify({"error": "No data provided"}), 400

        if "start_date" in data:
            try:
                entry.start_date = _parse_iso_date(data["start_date"], "start_date")
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        if "end_date" in data:
            try:
                entry.end_date = _parse_iso_date(data["end_date"], "end_date")
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        if "start_period" in data:
            try:
                entry.start_period = _normalize_and_validate_period(
                    data["start_period"], "start_period", True
                )
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        if "end_period" in data:
            try:
                entry.end_period = _normalize_and_validate_period(
                    data["end_period"], "end_period", False
                )
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        try:
            entry.start_period = _normalize_and_validate_period(
                entry.start_period, "start_period", True
            )
            entry.end_period = _normalize_and_validate_period(
                entry.end_period, "end_period", False
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        if "week_number" in data:
            if not 1 <= data["week_number"] <= 53:
                return jsonify({"error": "Week number must be between 1 and 53"}), 400
            entry.week_number = data["week_number"]

        if "year" in data:
            if data["year"] < 2000 or data["year"] > 2100:
                return jsonify({"error": "Year must be between 2000 and 2100"}), 400
            entry.year = data["year"]

        try:
            _validate_entry_dates_and_periods(
                entry.start_date,
                entry.end_date,
                entry.start_period,
                entry.end_period,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        try:
            _validate_week_year_for_dates(
                entry.start_date,
                entry.end_date,
                entry.week_number,
                entry.year,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        if "user_id" in data:
            user = User.query.get(data["user_id"])
            if not user:
                return jsonify({"error": "User not found"}), 404
            entry.user_id = data["user_id"]

        if "project_id" in data:
            project = Project.query.get(data["project_id"])
            if not project:
                return jsonify({"error": "Project not found"}), 404
            entry.project_id = data["project_id"]

        if "note" in data:
            entry.note = data["note"] or None

        if overwrite_conflicts:
            _overwrite_overlapping_entries_for_user(
                entry.user_id,
                entry.start_date,
                entry.start_period,
                entry.end_date,
                entry.end_period,
                exclude_entry_id=id,
            )
        else:
            is_valid, error_msg = _validate_no_overlap_for_user(
                entry.user_id,
                entry.start_date,
                entry.start_period,
                entry.end_date,
                entry.end_period,
                exclude_entry_id=id,
            )
            if not is_valid:
                return jsonify({"error": error_msg}), 409

        before_entry, after_entry = _find_adjacent_entries(entry)
        if before_entry or after_entry:
            entry = _merge_entries(entry, before_entry, after_entry)

        db.session.commit()
        return jsonify(time_entry_schema.dump(entry)), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@time_entry_bp.route("/<int:id>", methods=["DELETE"])
def delete_time_entry(id):
    """Delete a time entry"""
    try:
        entry = TimeEntry.query.get_or_404(id)
        db.session.delete(entry)
        db.session.commit()

        return "", 204

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@time_entry_bp.route("/bulk", methods=["POST"])
def bulk_create_time_entries():
    """Create multiple time entries at once"""
    try:
        data = request.get_json()

        if not data or "time_entries" not in data:
            return jsonify({"error": "Array of time_entries is required"}), 400

        created_entries = []
        errors = []

        for idx, entry_data in enumerate(data["time_entries"]):
            try:
                required_fields = [
                    "start_date",
                    "start_period",
                    "end_date",
                    "end_period",
                    "week_number",
                    "year",
                    "user_id",
                    "project_id",
                ]
                missing_fields = [
                    field for field in required_fields if field not in entry_data
                ]
                if missing_fields:
                    errors.append(
                        {
                            "index": idx,
                            "error": f"Missing required fields: {', '.join(missing_fields)}",
                        }
                    )
                    continue

                start_date = _parse_iso_date(entry_data["start_date"], "start_date")
                end_date = _parse_iso_date(entry_data["end_date"], "end_date")
                start_period = _normalize_and_validate_period(
                    entry_data["start_period"], "start_period", True
                )
                end_period = _normalize_and_validate_period(
                    entry_data["end_period"], "end_period", False
                )

                _validate_entry_dates_and_periods(
                    start_date, end_date, start_period, end_period
                )

                _validate_week_year_for_dates(
                    start_date,
                    end_date,
                    entry_data["week_number"],
                    entry_data["year"],
                )

                entry = TimeEntry(
                    start_date=start_date,
                    start_period=start_period,
                    end_date=end_date,
                    end_period=end_period,
                    week_number=entry_data["week_number"],
                    year=entry_data["year"],
                    user_id=entry_data["user_id"],
                    project_id=entry_data["project_id"],
                    note=entry_data.get("note") or None,
                )
                db.session.add(entry)
                db.session.flush()

                before_entry, after_entry = _find_adjacent_entries(entry)
                if before_entry or after_entry:
                    entry = _merge_entries(entry, before_entry, after_entry)

                created_entries.append(entry)

            except Exception as e:
                errors.append({"index": idx, "error": str(e)})

        if created_entries:
            db.session.commit()

        return jsonify(
            {
                "created": len(created_entries),
                "errors": errors,
                "time_entries": time_entries_schema.dump(created_entries),
            }
        ), 201 if created_entries else 400

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@time_entry_bp.route("/export-csv", methods=["GET"])
def export_time_entries_csv():
    """Export all time entries (or filtered by week/year) as CSV."""
    week_number = request.args.get("week_number", type=int)
    year = request.args.get("year", type=int)

    query = TimeEntry.query
    if week_number:
        query = query.filter_by(week_number=week_number)
    if year:
        query = query.filter_by(year=year)

    entries = query.order_by(
        TimeEntry.year.desc(),
        TimeEntry.week_number.desc(),
        TimeEntry.start_date.asc(),
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "start_date",
            "start_period",
            "end_date",
            "end_period",
            "week_number",
            "year",
            "user",
            "project",
            "note",
        ]
    )

    for entry in entries:
        writer.writerow(
            [
                entry.start_date.isoformat(),
                entry.start_period,
                entry.end_date.isoformat(),
                entry.end_period,
                entry.week_number,
                entry.year,
                entry.user.name if entry.user else "",
                entry.project.name if entry.project else "",
                entry.note or "",
            ]
        )

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=time_entries.csv"},
    )


@time_entry_bp.route("/import-csv", methods=["POST"])
def import_time_entries_csv():
    """Import time entries from CSV file."""
    try:
        if "file" not in request.files:
            return jsonify({"error": 'CSV file is required in form field "file"'}), 400

        csv_file = request.files["file"]
        if not csv_file or not csv_file.filename:
            return jsonify({"error": "CSV file is required"}), 400

        content = csv_file.stream.read().decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))

        required_headers = {
            "start_date",
            "start_period",
            "end_date",
            "end_period",
            "week_number",
            "year",
            "user",
            "project",
        }
        if not reader.fieldnames or not required_headers.issubset(
            set(reader.fieldnames)
        ):
            return jsonify(
                {
                    "error": (
                        "CSV header must contain: "
                        "start_date,start_period,end_date,end_period,week_number,year,user,project "
                        "(note optional)"
                    )
                }
            ), 400

        created_entries = []
        errors = []

        for idx, row in enumerate(reader, start=2):
            with db.session.begin_nested():
                try:
                    user_name = str(row.get("user", "")).strip()
                    project_name = str(row.get("project", "")).strip()

                    if not user_name or not project_name:
                        raise ValueError("user and project are required")

                    user = User.query.filter_by(name=user_name).first()
                    if not user:
                        raise ValueError(f"User not found: {user_name}")

                    project = Project.query.filter_by(name=project_name).first()
                    if not project:
                        raise ValueError(f"Project not found: {project_name}")

                    week_number = int(str(row.get("week_number", "")).strip())
                    year = int(str(row.get("year", "")).strip())
                    if not 1 <= week_number <= 53:
                        raise ValueError("Week number must be between 1 and 53")
                    if year < 2000 or year > 2100:
                        raise ValueError("Year must be between 2000 and 2100")

                    start_date = _parse_iso_date(row.get("start_date"), "start_date")
                    end_date = _parse_iso_date(row.get("end_date"), "end_date")
                    start_period = _normalize_and_validate_period(
                        row.get("start_period"), "start_period", True
                    )
                    end_period = _normalize_and_validate_period(
                        row.get("end_period"), "end_period", False
                    )

                    _validate_entry_dates_and_periods(
                        start_date, end_date, start_period, end_period
                    )
                    _validate_week_year_for_dates(
                        start_date, end_date, week_number, year
                    )

                    is_valid, error_msg = _validate_no_overlap_for_user(
                        user.id,
                        start_date,
                        start_period,
                        end_date,
                        end_period,
                    )
                    if not is_valid:
                        raise ValueError(error_msg)

                    entry = TimeEntry(
                        start_date=start_date,
                        start_period=start_period,
                        end_date=end_date,
                        end_period=end_period,
                        week_number=week_number,
                        year=year,
                        user_id=user.id,
                        project_id=project.id,
                        note=str(row.get("note", "")).strip() or None,
                    )
                    db.session.add(entry)
                    db.session.flush()

                    before_entry, after_entry = _find_adjacent_entries(entry)
                    if before_entry or after_entry:
                        entry = _merge_entries(entry, before_entry, after_entry)

                    created_entries.append(entry)

                except Exception as row_error:
                    errors.append({"line": idx, "error": str(row_error)})

        if created_entries:
            db.session.commit()

        status = 201 if created_entries else 200
        return jsonify(
            {
                "created": len(created_entries),
                "errors": errors,
                "time_entries": time_entries_schema.dump(created_entries),
            }
        ), status

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
