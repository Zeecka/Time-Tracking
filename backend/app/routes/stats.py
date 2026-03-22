import calendar
from datetime import date, timedelta

from flask import Blueprint, current_app, jsonify, request

from app.models import Project, TimeEntry, TrackingCode, User

stats_bp = Blueprint("stats", __name__)

MONTH_NAMES = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

    # --- Working time reference -------------------------------------------
    working_days = _count_working_days(range_start, range_end)
    possible_half_days = working_days * 2

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

    # --- Compute per-user stats -------------------------------------------
    user_stats = {
        u.id: {
            "id": u.id,
            "name": u.name,
            "color": u.color,
            "worked_half_days": 0,
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

        if entry.user_id in user_stats:
            user_stats[entry.user_id]["worked_half_days"] += hd
            by_proj = user_stats[entry.user_id]["by_project"]
            if entry.project_id not in by_proj:
                proj = projects_map.get(entry.project_id)
                by_proj[entry.project_id] = {
                    "project_id": entry.project_id,
                    "name": proj.name if proj else "?",
                    "color": proj.color if proj else "#ccc",
                    "half_days": 0,
                }
            by_proj[entry.project_id]["half_days"] += hd

        if entry.project_id not in project_totals:
            proj = projects_map.get(entry.project_id)
            project_totals[entry.project_id] = {
                "project_id": entry.project_id,
                "name": proj.name if proj else "?",
                "color": proj.color if proj else "#ccc",
                "half_days": 0,
            }
        project_totals[entry.project_id]["half_days"] += hd

        proj = projects_map.get(entry.project_id)
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
        rate = (
            round(worked / possible_half_days, 4)
            if possible_half_days > 0
            else 0.0
        )
        users_result.append(
            {
                "id": us["id"],
                "name": us["name"],
                "color": us["color"],
                "worked_half_days": worked,
                "absent_half_days": max(0, possible_half_days - worked),
                "presence_rate": min(1.0, rate),
                "absence_rate": max(0.0, round(1.0 - rate, 4)),
                "by_project": sorted(
                    us["by_project"].values(), key=lambda x: -x["half_days"]
                ),
            }
        )

    # --- Trend data -------------------------------------------------------
    trend = []

    if granularity == "year":
        for m in range(1, 13):
            last_day = calendar.monthrange(year, m)[1]
            m_start = date(year, m, 1)
            m_end = date(year, m, last_day)
            m_possible = _count_working_days(m_start, m_end) * 2
            m_hd = sum(
                _count_half_days_in_range(
                    e.start_date,
                    e.start_period,
                    e.end_date,
                    e.end_period,
                    m_start,
                    m_end,
                )
                for e in entries
            )
            trend.append(
                {
                    "label": MONTH_NAMES[m - 1],
                    "month": m,
                    "year": year,
                    "half_days": m_hd,
                    "possible_half_days": m_possible,
                }
            )

    elif granularity == "month":
        for w_year, w_num in _get_unique_weeks_in_range(range_start, range_end):
            w_start, w_end = _get_iso_week_date_range(w_year, w_num)
            w_start = max(w_start, range_start)
            w_end = min(w_end, range_end)
            w_possible = _count_working_days(w_start, w_end) * 2
            w_hd = sum(
                _count_half_days_in_range(
                    e.start_date,
                    e.start_period,
                    e.end_date,
                    e.end_period,
                    w_start,
                    w_end,
                )
                for e in entries
            )
            trend.append(
                {
                    "label": f"W{w_num}",
                    "week": w_num,
                    "year": w_year,
                    "half_days": w_hd,
                    "possible_half_days": w_possible,
                }
            )

    exclude_projects = current_app.config.get("STATS_EXCLUDE_PROJECTS", [])

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
            "possible_half_days": possible_half_days,
            "users": sorted(
                users_result, key=lambda x: -x["worked_half_days"]
            ),
            "projects": sorted(
                (v for v in project_totals.values() if v["name"] not in exclude_projects),
                key=lambda x: -x["half_days"],
            ),
            "tracking_codes": sorted(
                code_totals.values(),
                key=lambda x: -x["half_days"],
            ),
            "trend": trend,
        }
    ), 200
