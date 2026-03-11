import calendar
from datetime import date, timedelta

from flask import Blueprint, jsonify, request

from app.models import Pointage, Projet, Utilisateur

stats_bp = Blueprint("stats", __name__)

MOIS_NOMS = [
    "Jan",
    "Fév",
    "Mar",
    "Avr",
    "Mai",
    "Juin",
    "Juil",
    "Août",
    "Sep",
    "Oct",
    "Nov",
    "Déc",
]


def _get_iso_week_date_range(annee, semaine):
    """Return (monday, friday) for the given ISO week."""
    jan4 = date(annee, 1, 4)
    monday_week1 = jan4 - timedelta(days=jan4.isoweekday() - 1)
    monday = monday_week1 + timedelta(weeks=semaine - 1)
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


def _count_half_days(date_debut, periode_debut, date_fin, periode_fin):
    """Count working half-days covered by a pointage entry."""
    total = 0
    current = date_debut
    while current <= date_fin:
        if current.weekday() < 5:
            if current == date_debut and current == date_fin:
                # Single day
                total += (
                    2 if (periode_debut == "matin" and periode_fin == "soir") else 1
                )
            elif current == date_debut:
                total += 2 if periode_debut == "matin" else 1
            elif current == date_fin:
                total += 2 if periode_fin == "soir" else 1
            else:
                total += 2
        current += timedelta(days=1)
    return total


def _count_half_days_in_range(
    date_debut, periode_debut, date_fin, periode_fin, range_start, range_end
):
    """Count working half-days of a pointage that fall within [range_start, range_end]."""
    actual_start = max(date_debut, range_start)
    actual_end = min(date_fin, range_end)
    if actual_start > actual_end:
        return 0
    eff_debut = "matin" if actual_start > date_debut else periode_debut
    eff_fin = "soir" if actual_end < date_fin else periode_fin
    return _count_half_days(actual_start, eff_debut, actual_end, eff_fin)


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
      granularite  : 'semaine' | 'mois' | 'annee'  (default: 'mois')
      annee        : int  (default: current year)
      mois         : int  (required when granularite='mois')
      numero_semaine: int (required when granularite='semaine')
      utilisateur_id: int (optional – restrict to one user)
    """
    granularite = request.args.get("granularite", "mois")
    annee = request.args.get("annee", type=int) or date.today().year
    mois = request.args.get("mois", type=int)
    numero_semaine = request.args.get("numero_semaine", type=int)
    utilisateur_id = request.args.get("utilisateur_id", type=int)

    # --- Build date range --------------------------------------------------
    if granularite == "semaine":
        if not numero_semaine:
            return jsonify(
                {"error": "numero_semaine requis pour granularite=semaine"}
            ), 400
        range_start, range_end = _get_iso_week_date_range(annee, numero_semaine)

    elif granularite == "mois":
        if not mois:
            mois = date.today().month
        last_day = calendar.monthrange(annee, mois)[1]
        range_start = date(annee, mois, 1)
        range_end = date(annee, mois, last_day)

    else:  # annee
        granularite = "annee"
        range_start = date(annee, 1, 1)
        range_end = date(annee, 12, 31)

    # --- Working time reference -------------------------------------------
    jours_ouvrables = _count_working_days(range_start, range_end)
    demi_journees_possibles = jours_ouvrables * 2

    # --- Fetch pointages in range -----------------------------------------
    q = Pointage.query.filter(
        Pointage.date_debut <= range_end,
        Pointage.date_fin >= range_start,
    )
    if utilisateur_id:
        q = q.filter_by(utilisateur_id=utilisateur_id)
    pointages = q.all()

    # --- Users list -------------------------------------------------------
    uq = Utilisateur.query
    if utilisateur_id:
        uq = uq.filter_by(id=utilisateur_id)
    utilisateurs = uq.order_by(Utilisateur.nom).all()

    projets_map = {p.id: p for p in Projet.query.all()}

    # --- Compute per-user stats -------------------------------------------
    user_stats = {
        u.id: {
            "id": u.id,
            "nom": u.nom,
            "couleur": u.couleur,
            "demi_journees_travaillees": 0,
            "par_projet": {},
        }
        for u in utilisateurs
    }
    projet_totals = {}

    for p in pointages:
        hd = _count_half_days_in_range(
            p.date_debut,
            p.periode_debut,
            p.date_fin,
            p.periode_fin,
            range_start,
            range_end,
        )

        # Per-user accumulation
        if p.utilisateur_id in user_stats:
            user_stats[p.utilisateur_id]["demi_journees_travaillees"] += hd
            by_proj = user_stats[p.utilisateur_id]["par_projet"]
            if p.projet_id not in by_proj:
                proj = projets_map.get(p.projet_id)
                by_proj[p.projet_id] = {
                    "projet_id": p.projet_id,
                    "nom": proj.nom if proj else "?",
                    "couleur": proj.couleur if proj else "#ccc",
                    "demi_journees": 0,
                }
            by_proj[p.projet_id]["demi_journees"] += hd

        # Global per-project accumulation
        if p.projet_id not in projet_totals:
            proj = projets_map.get(p.projet_id)
            projet_totals[p.projet_id] = {
                "projet_id": p.projet_id,
                "nom": proj.nom if proj else "?",
                "couleur": proj.couleur if proj else "#ccc",
                "demi_journees": 0,
            }
        projet_totals[p.projet_id]["demi_journees"] += hd

    # Build final user list
    users_result = []
    for us in user_stats.values():
        travailles = us["demi_journees_travaillees"]
        taux = (
            round(travailles / demi_journees_possibles, 4)
            if demi_journees_possibles > 0
            else 0.0
        )
        users_result.append(
            {
                "id": us["id"],
                "nom": us["nom"],
                "couleur": us["couleur"],
                "demi_journees_travaillees": travailles,
                "demi_journees_absentes": max(0, demi_journees_possibles - travailles),
                "taux_presence": min(1.0, taux),
                "taux_absence": max(0.0, round(1.0 - taux, 4)),
                "par_projet": sorted(
                    us["par_projet"].values(), key=lambda x: -x["demi_journees"]
                ),
            }
        )

    # --- Trend data -------------------------------------------------------
    tendance = []

    if granularite == "annee":
        for m in range(1, 13):
            last_day = calendar.monthrange(annee, m)[1]
            m_start = date(annee, m, 1)
            m_end = date(annee, m, last_day)
            m_possible = _count_working_days(m_start, m_end) * 2
            m_dj = sum(
                _count_half_days_in_range(
                    p.date_debut,
                    p.periode_debut,
                    p.date_fin,
                    p.periode_fin,
                    m_start,
                    m_end,
                )
                for p in pointages
            )
            tendance.append(
                {
                    "label": MOIS_NOMS[m - 1],
                    "mois": m,
                    "annee": annee,
                    "demi_journees": m_dj,
                    "demi_journees_possibles": m_possible,
                }
            )

    elif granularite == "mois":
        for w_annee, w_num in _get_unique_weeks_in_range(range_start, range_end):
            w_start, w_end = _get_iso_week_date_range(w_annee, w_num)
            # Clip to month
            w_start = max(w_start, range_start)
            w_end = min(w_end, range_end)
            w_possible = _count_working_days(w_start, w_end) * 2
            w_dj = sum(
                _count_half_days_in_range(
                    p.date_debut,
                    p.periode_debut,
                    p.date_fin,
                    p.periode_fin,
                    w_start,
                    w_end,
                )
                for p in pointages
            )
            tendance.append(
                {
                    "label": f"S{w_num}",
                    "semaine": w_num,
                    "annee": w_annee,
                    "demi_journees": w_dj,
                    "demi_journees_possibles": w_possible,
                }
            )

    return jsonify(
        {
            "periode": {
                "granularite": granularite,
                "annee": annee,
                "mois": mois if granularite == "mois" else None,
                "numero_semaine": numero_semaine if granularite == "semaine" else None,
                "range_start": range_start.isoformat(),
                "range_end": range_end.isoformat(),
            },
            "jours_ouvrables": jours_ouvrables,
            "demi_journees_possibles": demi_journees_possibles,
            "utilisateurs": sorted(
                users_result, key=lambda x: -x["demi_journees_travaillees"]
            ),
            "projets": sorted(
                projet_totals.values(), key=lambda x: -x["demi_journees"]
            ),
            "tendance": tendance,
        }
    ), 200
