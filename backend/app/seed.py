from datetime import date, timedelta

from app.extensions import db
from app.models import Project, TimeEntry, TrackingCode, User

# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------


def _upsert_tracking_code(code):
    item = TrackingCode.query.filter_by(code=code).first()
    if item:
        return item
    item = TrackingCode(code=code)
    db.session.add(item)
    return item


def _upsert_project(name, color, pattern, tracking_code):
    item = Project.query.filter_by(name=name).first()
    if item:
        item.color = color
        item.pattern = pattern
        item.tracking_code = tracking_code
        return item
    item = Project(name=name, color=color, pattern=pattern, tracking_code=tracking_code)
    db.session.add(item)
    return item


def _upsert_user(name, color, sub=None):
    item = User.query.filter_by(name=name).first()
    if item:
        item.color = color
        if sub is not None:
            item.sub = sub
        return item
    item = User(name=name, color=color, sub=sub)
    db.session.add(item)
    return item


# ---------------------------------------------------------------------------
# Time entry creation helper
# ---------------------------------------------------------------------------


def _add_time_entry(user, project, monday, d_start, p_start, d_end, p_end, note=None):
    """
    Add a TimeEntry directly to the session.

    d_start / d_end : integer offsets from monday (0=Mon ... 4=Fri).
    p_start         : 'morning' | 'midday'
    p_end           : 'midday'  | 'evening'
    """
    start_date = monday + timedelta(days=d_start)
    end_date = monday + timedelta(days=d_end)
    year, week, _ = start_date.isocalendar()
    db.session.add(
        TimeEntry(
            start_date=start_date,
            start_period=p_start,
            end_date=end_date,
            end_period=p_end,
            week_number=week,
            year=year,
            user_id=user.id,
            project_id=project.id,
            note=note,
        )
    )


# ---------------------------------------------------------------------------
# Main seed function
# ---------------------------------------------------------------------------


def seed_dev_data():
    existing_entries = TimeEntry.query.count()

    # ------------------------------------------------------------------
    # 1. Tracking codes
    # ------------------------------------------------------------------
    codes = {
        "DEV": _upsert_tracking_code("DEV"),
        "BUG": _upsert_tracking_code("BUG"),
        "DOC": _upsert_tracking_code("DOC"),
        "RUN": _upsert_tracking_code("RUN"),
        "MEET": _upsert_tracking_code("MEET"),
        "ABS": _upsert_tracking_code("ABS"),
        # Archived code without project — tests deletion without 409 conflict
        "ARCV": _upsert_tracking_code("ARCV"),
    }

    # ------------------------------------------------------------------
    # 2. Projects (covers all 3 patterns: solid / striped / dotted)
    # ------------------------------------------------------------------
    projects = [
        # idx 0  — solid
        _upsert_project("Client Portal", "#0d6efd", "solid", codes["DEV"]),
        # idx 1  — dotted
        _upsert_project("Billing API", "#20c997", "dotted", codes["BUG"]),
        # idx 2  — dotted
        _upsert_project("Mobile App", "#6f42c1", "dotted", codes["DEV"]),
        # idx 3  — solid
        _upsert_project("UI Redesign", "#fd7e14", "solid", codes["DOC"]),
        # idx 4  — solid
        _upsert_project("CI/CD Infra", "#198754", "solid", codes["RUN"]),
        # idx 5  — dotted
        _upsert_project("Team Rituals", "#dc3545", "dotted", codes["MEET"]),
        # idx 6  — striped (absence)
        _upsert_project("Public Holiday", "#6c757d", "striped", codes["ABS"]),
        # idx 7  — striped (absence)
        _upsert_project("RTT", "#ffc107", "striped", codes["ABS"]),
        # idx 8  — striped (absence)
        _upsert_project("Sick Leave", "#e83e8c", "striped", codes["ABS"]),
        # idx 9  — solid
        _upsert_project("Azure Training", "#17a2b8", "solid", codes["DOC"]),
        # idx 10 — solid — NO time entries: tests empty project display
        _upsert_project("Tech Watch", "#0dcaf0", "solid", codes["DOC"]),
    ]

    CP = projects[0]   # Client Portal
    BA = projects[1]   # Billing API
    MA = projects[2]   # Mobile App
    UIR = projects[3]  # UI Redesign
    INF = projects[4]  # CI/CD Infra
    TR = projects[5]   # Team Rituals
    PH = projects[6]   # Public Holiday
    RTT = projects[7]  # RTT
    SL = projects[8]   # Sick Leave
    AT = projects[9]   # Azure Training

    # ------------------------------------------------------------------
    # 3. Users (5 users; Camille has an OIDC sub to test uniqueness)
    # ------------------------------------------------------------------
    users = [
        _upsert_user("Alice Martin", "#3b82f6"),
        _upsert_user("Yassine Benali", "#14b8a6"),
        _upsert_user("Sophie Leroy", "#a855f7"),
        _upsert_user("Thomas Bernard", "#f59e0b"),
        _upsert_user("Camille Dupont", "#ef4444", sub="oidc-sub-camille-001"),
    ]

    ALICE = users[0]
    YASSINE = users[1]
    SOPHIE = users[2]
    THOMAS = users[3]
    CAMILLE = users[4]

    db.session.flush()

    # ------------------------------------------------------------------
    # 4. Time entries — created only if the table is empty
    # ------------------------------------------------------------------
    if existing_entries == 0:
        today = date.today()
        current_monday = today - timedelta(days=today.weekday())

        def P(user, proj, monday, ds, ps, de, pe, note=None):
            _add_time_entry(user, proj, monday, ds, ps, de, pe, note)

        # --------------------------------------------------------------
        # Week -3
        # --------------------------------------------------------------
        w = current_monday + timedelta(weeks=-3)

        P(ALICE, CP, w, 0, "morning", 0, "evening")
        P(ALICE, BA, w, 1, "morning", 2, "evening")
        P(ALICE, TR, w, 3, "morning", 3, "midday")
        P(ALICE, AT, w, 3, "midday", 3, "evening")
        P(ALICE, INF, w, 4, "morning", 4, "evening")

        P(YASSINE, MA, w, 0, "morning", 1, "evening")
        P(YASSINE, CP, w, 2, "morning", 2, "evening")
        P(YASSINE, BA, w, 3, "morning", 3, "midday")
        P(YASSINE, TR, w, 3, "midday", 3, "evening")
        P(YASSINE, UIR, w, 4, "morning", 4, "evening")

        P(SOPHIE, TR, w, 0, "morning", 0, "midday")
        P(SOPHIE, CP, w, 0, "midday", 0, "evening")
        P(SOPHIE, UIR, w, 1, "morning", 3, "evening")
        P(SOPHIE, AT, w, 4, "morning", 4, "midday")
        P(SOPHIE, INF, w, 4, "midday", 4, "evening")

        P(THOMAS, CP, w, 0, "morning", 2, "evening")
        P(
            THOMAS,
            BA,
            w,
            3,
            "morning",
            3,
            "evening",
            "Critical bug fix -- data loss in production",
        )
        P(THOMAS, MA, w, 4, "morning", 4, "evening")

        P(
            CAMILLE,
            AT,
            w,
            0,
            "morning",
            0,
            "evening",
            "Initial Azure Fundamentals training (AZ-900)",
        )
        P(CAMILLE, CP, w, 1, "morning", 1, "evening")
        P(CAMILLE, MA, w, 2, "morning", 2, "midday")
        P(CAMILLE, TR, w, 2, "midday", 2, "evening")
        P(CAMILLE, INF, w, 3, "morning", 4, "evening")

        # --------------------------------------------------------------
        # Week -2
        # --------------------------------------------------------------
        w = current_monday + timedelta(weeks=-2)

        P(ALICE, MA, w, 0, "morning", 1, "evening")
        P(ALICE, TR, w, 2, "morning", 2, "midday")
        P(ALICE, CP, w, 2, "midday", 2, "evening")
        P(ALICE, UIR, w, 3, "morning", 4, "evening")

        P(YASSINE, AT, w, 0, "morning", 0, "midday")
        P(YASSINE, BA, w, 0, "midday", 1, "evening")
        P(YASSINE, CP, w, 2, "morning", 2, "evening")
        P(YASSINE, INF, w, 3, "morning", 3, "midday")
        P(YASSINE, MA, w, 3, "midday", 4, "evening")

        P(SOPHIE, MA, w, 0, "morning", 3, "evening")
        P(SOPHIE, TR, w, 4, "morning", 4, "evening")

        P(THOMAS, TR, w, 0, "morning", 0, "midday")
        P(THOMAS, BA, w, 0, "midday", 1, "evening")
        P(THOMAS, CP, w, 2, "morning", 3, "evening")
        P(THOMAS, INF, w, 4, "morning", 4, "midday")
        P(THOMAS, AT, w, 4, "midday", 4, "evening")

        P(CAMILLE, TR, w, 0, "morning", 0, "evening")
        P(CAMILLE, CP, w, 1, "morning", 1, "midday")
        P(CAMILLE, MA, w, 1, "midday", 1, "evening")
        P(CAMILLE, UIR, w, 2, "morning", 4, "evening")

        # --------------------------------------------------------------
        # Week -1
        # --------------------------------------------------------------
        w = current_monday + timedelta(weeks=-1)

        P(ALICE, TR, w, 0, "morning", 0, "midday")
        P(ALICE, MA, w, 0, "midday", 0, "evening")
        P(ALICE, CP, w, 1, "morning", 1, "evening")
        P(
            ALICE,
            RTT,
            w,
            2,
            "morning",
            2,
            "evening",
            "RTT — overtime recovery",
        )
        P(ALICE, BA, w, 3, "morning", 3, "midday")
        P(ALICE, UIR, w, 3, "midday", 3, "evening")
        P(ALICE, AT, w, 4, "morning", 4, "evening")

        P(YASSINE, CP, w, 0, "morning", 2, "evening")
        P(
            YASSINE,
            SL,
            w,
            3,
            "morning",
            4,
            "evening",
            "Certified sick leave -- 2 days",
        )

        P(SOPHIE, TR, w, 0, "morning", 0, "midday")
        P(SOPHIE, INF, w, 0, "midday", 2, "evening")
        P(SOPHIE, BA, w, 3, "morning", 3, "evening")
        P(SOPHIE, AT, w, 4, "morning", 4, "midday")
        P(SOPHIE, CP, w, 4, "midday", 4, "evening")

        P(THOMAS, PH, w, 0, "morning", 0, "evening", "Easter Monday")
        P(THOMAS, MA, w, 1, "morning", 3, "evening")
        P(THOMAS, TR, w, 4, "morning", 4, "midday")
        P(THOMAS, AT, w, 4, "midday", 4, "evening")

        P(CAMILLE, CP, w, 0, "morning", 1, "evening")
        P(CAMILLE, RTT, w, 2, "morning", 2, "evening", "RTT taken")
        P(CAMILLE, MA, w, 3, "morning", 3, "midday")
        P(CAMILLE, UIR, w, 3, "midday", 3, "evening")
        P(CAMILLE, TR, w, 4, "morning", 4, "evening")

        # --------------------------------------------------------------
        # Week 0 (current week)
        # --------------------------------------------------------------
        w = current_monday
        today_offset = today.weekday()

        if today_offset >= 0:
            P(ALICE, CP, w, 0, "morning", 0, "evening")
        if today_offset >= 1:
            P(ALICE, TR, w, 1, "morning", 1, "midday")
            P(ALICE, BA, w, 1, "midday", 1, "evening")

        if today_offset >= 1:
            P(YASSINE, INF, w, 0, "morning", 1, "evening")
        elif today_offset == 0:
            P(YASSINE, INF, w, 0, "morning", 0, "evening")
        if today_offset >= 2:
            P(YASSINE, MA, w, 2, "morning", 2, "midday")

        if today_offset >= 0:
            P(SOPHIE, TR, w, 0, "morning", 0, "evening")
        if today_offset >= 1:
            P(SOPHIE, CP, w, 1, "morning", 1, "midday")
            P(SOPHIE, AT, w, 1, "midday", 1, "evening")
        if today_offset >= 2:
            P(SOPHIE, UIR, w, 2, "morning", 2, "evening")

        if today_offset >= 0:
            P(THOMAS, BA, w, 0, "morning", 0, "midday")
            P(THOMAS, MA, w, 0, "midday", 0, "evening")
        if today_offset >= 2:
            P(THOMAS, CP, w, 1, "morning", 2, "evening")

        if today_offset >= 0:
            P(
                CAMILLE,
                AT,
                w,
                0,
                "morning",
                0,
                "evening",
                "Advanced Azure Administrator training (AZ-104)",
            )
        if today_offset >= 1:
            P(CAMILLE, TR, w, 1, "morning", 1, "midday")
        if today_offset >= 2:
            P(CAMILLE, INF, w, 1, "midday", 2, "evening")

        # --------------------------------------------------------------
        # Week +1 (next week — forward planning)
        # --------------------------------------------------------------
        w = current_monday + timedelta(weeks=1)

        P(ALICE, RTT, w, 0, "morning", 0, "evening", "Planned RTT — bridge day")
        P(
            THOMAS,
            AT,
            w,
            0,
            "morning",
            4,
            "evening",
            "Azure DevOps training week (AZ-400) -- certification target",
        )
        P(CAMILLE, TR, w, 1, "morning", 1, "midday")

        db.session.commit()

        total = TimeEntry.query.count()
        return {
            "created": True,
            "entries_created": total,
            "users": len(users),
            "projects": len(projects),
            "codes": len(codes),
        }

    db.session.commit()
    return {
        "created": False,
        "entries_created": 0,
        "users": len(users),
        "projects": len(projects),
        "codes": len(codes),
    }
