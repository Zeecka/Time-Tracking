import calendar
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request

from app.models import Project, TimeEntry, TrackingCode, User

stats_bp = Blueprint("stats", __name__)

MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]


def _get_iso_week_date_range(year, week):
    """Return (monday, friday) for the given ISO week."""
    jan4 = date(year, 1, 4)
    monday_week1 = jan4 - timedelta(days=jan4.isoweekday() - 1)
    monday = monday_week1 + timedelta(weeks=week - 1)
    friday = monday + timedelta(days=4)
    return monday, friday


def _count_working_days(start, end):
    """Count Mon–Fri days between start and end inclusive."""
    total = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            total += 1
        current += timedelta(days=1)
    return total


def _count_half_days(start_date, start_period, end_date, end_period):
    """Count working half-days covered by a time entry."""
    total = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:
            if current == start_date and current == end_date:
                # Single day
                total += (
                    2 if (start_period == "morning" and end_period == "evening") else 1
                )
            elif current == start_date:
                total += 2 if start_period == "morning" else 1
            elif current == end_date:
                total += 2 if end_period == "evening" else 1
            else:
                total += 2
        current += timedelta(days=1)
    return total


def _count_half_days_in_range(
    start_date, start_period, end_date, end_period, range_start, range_end
):
    """Count working half-days of a time entry that fall within [range_start, range_end]."""
    actual_start = max(start_date, range_start)
    actual_end = min(end_date, range_end)
    if actual_start > actual_end:
        return 0
    eff_start = "morning" if actual_start > start_date else start_period
    eff_end = "evening" if actual_end < end_date else end_period
    return _count_half_days(actual_start, eff_start, actual_end, eff_end)


def _get_unique_weeks_in_range(start, end):
    """Return list of (iso_year, iso_week) tuples present in the date range."""
    seen, result = set(), []
    current = start
    while current <= end:
        if current.weekday() < 5:
            iso = current.isocalendar()
            key = (iso.year, iso.week)
            if key not in seen:
                seen.add(key)
                result.append(key)
        current += timedelta(days=1)
    return result


def _normalize_code(code):
    return (code or "").strip().upper()


@stats_bp.route("", methods=["GET"])
def get_stats():
    """
    Compute attendance statistics for a given period.

    Query params:
      granularity  : 'week' | 'month' | 'year'  (default: 'month')
      year         : int  (default: current year)
      month        : int  (required when granularity='month')
      week_number  : int  (required when granularity='week')
      user_id      : int  (optional – restrict to one user)
    """
    granularity = request.args.get("granularity", "month")
    year = request.args.get("year", type=int) or date.today().year
    month = request.args.get("month", type=int)
    week_number = request.args.get("week_number", type=int)
    user_id = request.args.get("user_id", type=int)

    # --- Build date range --------------------------------------------------
    if granularity == "week":
        if not week_number:
            return jsonify(
                {"error": "week_number is required for granularity=week"}
            ), 400
        range_start, range_end = _get_iso_week_date_range(year, week_number)

    elif granularity == "month":
        if not month:
            month = date.today().month
        last_day = calendar.monthrange(year, month)[1]
        range_start = date(year, month, 1)
        range_end = date(year, month, last_day)

    else:  # year
        granularity = "year"
        range_start = date(year, 1, 1)
        range_end = date(year, 12, 31)

    # --- Working day reference (informational KPI only) -------------------
    working_days = _count_working_days(range_start, range_end)

    # --- Fetch time entries in range --------------------------------------
    q = TimeEntry.query.filter(
        TimeEntry.start_date <= range_end,
        TimeEntry.end_date >= range_start,
    )
    if user_id:
        q = q.filter_by(user_id=user_id)
    entries = q.all()

    # --- Users list -------------------------------------------------------
    uq = User.query
    if user_id:
        uq = uq.filter_by(id=user_id)
    users = uq.order_by(User.name).all()

    projects_map = {p.id: p for p in Project.query.all()}
    codes_map = {tc.id: tc for tc in TrackingCode.query.all()}
    project_code_by_project_id = {}
    for p in projects_map.values():
        tc = codes_map.get(p.tracking_code_id)
        project_code_by_project_id[p.id] = _normalize_code(tc.code if tc else None)
    exclude_codes = {
        _normalize_code(code)
        for code in current_app.config.get("STATS_EXCLUDE_CODES", [])
    }

    # --- Compute per-user stats -------------------------------------------
    user_stats = {
        u.id: {
            "id": u.id,
            "name": u.name,
            "color": u.color,
            "worked_half_days": 0,
            "absent_half_days": 0,
            "by_project": {},
        }
        for u in users
    }
    project_totals = {}
    code_totals = {}

    for entry in entries:
        hd = _count_half_days_in_range(
            entry.start_date,
            entry.start_period,
            entry.end_date,
            entry.end_period,
            range_start,
            range_end,
        )

        if hd <= 0:
            continue

        proj = projects_map.get(entry.project_id)
        project_name = proj.name if proj else "?"
        tracking_code_value = project_code_by_project_id.get(entry.project_id, "")
        is_absence = tracking_code_value in exclude_codes

        if entry.user_id in user_stats:
            if is_absence:
                user_stats[entry.user_id]["absent_half_days"] += hd
            else:
                user_stats[entry.user_id]["worked_half_days"] += hd

            by_proj = user_stats[entry.user_id]["by_project"]
            if entry.project_id not in by_proj:
                by_proj[entry.project_id] = {
                    "project_id": entry.project_id,
                    "name": project_name,
                    "color": proj.color if proj else "#ccc",
                    "half_days": 0,
                }
            by_proj[entry.project_id]["half_days"] += hd

        if entry.project_id not in project_totals:
            project_totals[entry.project_id] = {
                "project_id": entry.project_id,
                "name": project_name,
                "color": proj.color if proj else "#ccc",
                "half_days": 0,
            }
        project_totals[entry.project_id]["half_days"] += hd

        if proj:
            code_id = proj.tracking_code_id
            if code_id not in code_totals:
                tc = codes_map.get(code_id)
                code_totals[code_id] = {
                    "code_id": code_id,
                    "code": tc.code if tc else "?",
                    "half_days": 0,
                }
            code_totals[code_id]["half_days"] += hd

    # Build final user list
    users_result = []
    for us in user_stats.values():
        worked = us["worked_half_days"]
        absent = us["absent_half_days"]
        classified_total = worked + absent
        presence_rate = (
            round(worked / classified_total, 4) if classified_total > 0 else 0.0
        )
        absence_rate = (
            round(absent / classified_total, 4) if classified_total > 0 else 0.0
        )
        users_result.append(
            {
                "id": us["id"],
                "name": us["name"],
                "color": us["color"],
                "worked_half_days": worked,
                "absent_half_days": absent,
                "total_classified_half_days": classified_total,
                "presence_rate": min(1.0, presence_rate),
                "absence_rate": min(1.0, absence_rate),
                "by_project": sorted(
                    us["by_project"].values(), key=lambda x: -x["half_days"]
                ),
            }
        )

    total_worked_half_days = sum(u["worked_half_days"] for u in users_result)
    total_absent_half_days = sum(u["absent_half_days"] for u in users_result)
    total_classified_half_days = total_worked_half_days + total_absent_half_days

    # --- Trend data -------------------------------------------------------
    trend = []

    if granularity == "year":
        for m in range(1, 13):
            last_day = calendar.monthrange(year, m)[1]
            m_start = date(year, m, 1)
            m_end = date(year, m, last_day)
            m_worked = 0
            m_absent = 0
            for e in entries:
                m_entry_hd = _count_half_days_in_range(
                    e.start_date,
                    e.start_period,
                    e.end_date,
                    e.end_period,
                    m_start,
                    m_end,
                )
                if m_entry_hd <= 0:
                    continue
                m_is_absence = (
                    project_code_by_project_id.get(e.project_id, "") in exclude_codes
                )
                if m_is_absence:
                    m_absent += m_entry_hd
                else:
                    m_worked += m_entry_hd

            trend.append(
                {
                    "label": MONTH_NAMES[m - 1],
                    "month": m,
                    "year": year,
                    "half_days": m_worked,
                    "possible_half_days": m_worked + m_absent,
                }
            )

    elif granularity == "month":
        for w_year, w_num in _get_unique_weeks_in_range(range_start, range_end):
            w_start, w_end = _get_iso_week_date_range(w_year, w_num)
            w_start = max(w_start, range_start)
            w_end = min(w_end, range_end)
            w_worked = 0
            w_absent = 0
            for e in entries:
                w_entry_hd = _count_half_days_in_range(
                    e.start_date,
                    e.start_period,
                    e.end_date,
                    e.end_period,
                    w_start,
                    w_end,
                )
                if w_entry_hd <= 0:
                    continue
                w_is_absence = (
                    project_code_by_project_id.get(e.project_id, "") in exclude_codes
                )
                if w_is_absence:
                    w_absent += w_entry_hd
                else:
                    w_worked += w_entry_hd

            trend.append(
                {
                    "label": f"W{w_num}",
                    "week": w_num,
                    "year": w_year,
                    "half_days": w_worked,
                    "possible_half_days": w_worked + w_absent,
                }
            )

    return jsonify(
        {
            "period": {
                "granularity": granularity,
                "year": year,
                "month": month if granularity == "month" else None,
                "week_number": week_number if granularity == "week" else None,
                "range_start": range_start.isoformat(),
                "range_end": range_end.isoformat(),
            },
            "working_days": working_days,
            "possible_half_days": total_classified_half_days,
            "users": sorted(users_result, key=lambda x: -x["worked_half_days"]),
            "projects": sorted(
                (
                    v
                    for v in project_totals.values()
                    if project_code_by_project_id.get(v["project_id"], "")
                    not in exclude_codes
                ),
                key=lambda x: -x["half_days"],
            ),
            "tracking_codes": sorted(
                (
                    v
                    for v in code_totals.values()
                    if _normalize_code(v["code"]) not in exclude_codes
                ),
                key=lambda x: -x["half_days"],
            ),
            "trend": trend,
        }
    ), 200
