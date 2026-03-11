from datetime import date, timedelta

from app.extensions import db
from app.models import CodePointage, Pointage, Projet, Utilisateur


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

def _upsert_code_pointage(code):
    item = CodePointage.query.filter_by(code=code).first()
    if item:
        return item
    item = CodePointage(code=code)
    db.session.add(item)
    return item


def _upsert_projet(nom, couleur, motif, code_pointage):
    item = Projet.query.filter_by(nom=nom).first()
    if item:
        item.couleur = couleur
        item.motif = motif
        item.code_pointage = code_pointage
        return item
    item = Projet(nom=nom, couleur=couleur, motif=motif, code_pointage=code_pointage)
    db.session.add(item)
    return item


def _upsert_utilisateur(nom, couleur, sub=None):
    item = Utilisateur.query.filter_by(nom=nom).first()
    if item:
        item.couleur = couleur
        if sub is not None:
            item.sub = sub
        return item
    item = Utilisateur(nom=nom, couleur=couleur, sub=sub)
    db.session.add(item)
    return item


# ---------------------------------------------------------------------------
# Pointage creation helper
# ---------------------------------------------------------------------------

def _add_pointage(user, projet, monday, d_start, p_start, d_end, p_end, note=None):
    """
    Add a Pointage directly to the session.

    d_start / d_end : integer offsets from monday (0=Mon ... 4=Fri).
    p_start         : 'matin' | 'midi'
    p_end           : 'midi'  | 'soir'
    """
    date_debut = monday + timedelta(days=d_start)
    date_fin   = monday + timedelta(days=d_end)
    year, week, _ = date_debut.isocalendar()
    db.session.add(
        Pointage(
            date_debut=date_debut,
            periode_debut=p_start,
            date_fin=date_fin,
            periode_fin=p_end,
            numero_semaine=week,
            annee=year,
            utilisateur_id=user.id,
            projet_id=projet.id,
            note=note,
        )
    )


# ---------------------------------------------------------------------------
# Main seed function
# ---------------------------------------------------------------------------

def seed_dev_data():
    existing_pointages = Pointage.query.count()

    # ------------------------------------------------------------------
    # 1. Codes de pointage
    #    Every active category + one archived code with no projects
    #    (allows testing DELETE /api/code-pointages/:id without 409).
    # ------------------------------------------------------------------
    codes = {
        "DEV":  _upsert_code_pointage("DEV"),
        "BUG":  _upsert_code_pointage("BUG"),
        "DOC":  _upsert_code_pointage("DOC"),
        "RUN":  _upsert_code_pointage("RUN"),
        "MEET": _upsert_code_pointage("MEET"),
        "ABS":  _upsert_code_pointage("ABS"),
        # Code archivé sans projet — teste la suppression sans conflit 409
        "ARCV": _upsert_code_pointage("ARCV"),
    }

    # ------------------------------------------------------------------
    # 2. Projets   (couvre les 3 motifs : uni / raye / pointille)
    #    "Veille Technologique" n'a aucun pointage → teste l'UI vide.
    # ------------------------------------------------------------------
    projets = [
        # idx 0  — motif uni
        _upsert_projet("Portail Client",       "#0d6efd", "uni",       codes["DEV"]),
        # idx 1  — motif pointille
        _upsert_projet("API Facturation",      "#20c997", "pointille", codes["BUG"]),
        # idx 2  — motif pointille
        _upsert_projet("Application Mobile",   "#6f42c1", "pointille", codes["DEV"]),
        # idx 3  — motif uni
        _upsert_projet("Refonte UI",           "#fd7e14", "uni",       codes["DOC"]),
        # idx 4  — motif uni
        _upsert_projet("Infra CI/CD",          "#198754", "uni",       codes["RUN"]),
        # idx 5  — motif pointille
        _upsert_projet("Rituels Equipe",       "#dc3545", "pointille", codes["MEET"]),
        # idx 6  — motif raye (absence)
        _upsert_projet("Jour Ferie",           "#6c757d", "raye",      codes["ABS"]),
        # idx 7  — motif raye (absence)
        _upsert_projet("RTT",                  "#ffc107", "raye",      codes["ABS"]),
        # idx 8  — motif raye (absence)
        _upsert_projet("Arret Maladie",        "#e83e8c", "raye",      codes["ABS"]),
        # idx 9  — motif uni
        _upsert_projet("Formation Azure",      "#17a2b8", "uni",       codes["DOC"]),
        # idx 10 — motif uni — AUCUN pointage : teste l'affichage d'un projet vide
        _upsert_projet("Veille Technologique", "#0dcaf0", "uni",       codes["DOC"]),
    ]

    PC   = projets[0]   # Portail Client
    AF   = projets[1]   # API Facturation
    AM   = projets[2]   # Application Mobile
    RUI  = projets[3]   # Refonte UI
    INF  = projets[4]   # Infra CI/CD
    RE   = projets[5]   # Rituels Equipe
    JF   = projets[6]   # Jour Ferie
    RTT  = projets[7]   # RTT
    ABS  = projets[8]   # Arret Maladie
    FA   = projets[9]   # Formation Azure

    # ------------------------------------------------------------------
    # 3. Utilisateurs
    #    5 users ; Camille possede un OIDC sub pour tester la contrainte
    #    d'unicite du sub et la route PUT utilisateur.
    # ------------------------------------------------------------------
    utilisateurs = [
        _upsert_utilisateur("Alice Martin",    "#3b82f6"),
        _upsert_utilisateur("Yassine Benali",  "#14b8a6"),
        _upsert_utilisateur("Sophie Leroy",    "#a855f7"),
        _upsert_utilisateur("Thomas Bernard",  "#f59e0b"),
        _upsert_utilisateur("Camille Dupont",  "#ef4444", sub="oidc-sub-camille-001"),
    ]

    ALICE   = utilisateurs[0]
    YASSINE = utilisateurs[1]
    SOPHIE  = utilisateurs[2]
    THOMAS  = utilisateurs[3]
    CAMILLE = utilisateurs[4]

    db.session.flush()

    # ------------------------------------------------------------------
    # 4. Pointages — crees uniquement si la table est vide
    # ------------------------------------------------------------------
    if existing_pointages == 0:
        today = date.today()
        current_monday = today - timedelta(days=today.weekday())

        # Alias court
        def P(user, proj, monday, ds, ps, de, pe, note=None):
            _add_pointage(user, proj, monday, ds, ps, de, pe, note)

        # --------------------------------------------------------------
        # Semaine -3  (il y a trois semaines)
        # Couverture:
        #   - Entrees full-day (matin -> soir)
        #   - Blocs multi-jours (ex: mar -> mer)
        #   - Demi-journee matin (matin -> midi)
        #   - Demi-journee apres-midi (midi -> soir)
        #   - Tous les projets non-absence utilises
        #   - Note sur une entree Thomas
        # --------------------------------------------------------------
        w = current_monday + timedelta(weeks=-3)

        # Alice : lun full | mar-mer multi-jours | jeu matin + apres-midi | ven full
        P(ALICE, PC,  w, 0, "matin", 0, "soir")
        P(ALICE, AF,  w, 1, "matin", 2, "soir")   # multi-jours mar->mer
        P(ALICE, RE,  w, 3, "matin", 3, "midi")   # jeu matin
        P(ALICE, FA,  w, 3, "midi",  3, "soir")   # jeu apres-midi
        P(ALICE, INF, w, 4, "matin", 4, "soir")

        # Yassine : lun-mar multi-jours | mer full | jeu matin + apres-midi | ven full
        P(YASSINE, AM,  w, 0, "matin", 1, "soir")  # multi-jours lun->mar
        P(YASSINE, PC,  w, 2, "matin", 2, "soir")
        P(YASSINE, AF,  w, 3, "matin", 3, "midi")
        P(YASSINE, RE,  w, 3, "midi",  3, "soir")
        P(YASSINE, RUI, w, 4, "matin", 4, "soir")

        # Sophie : lun matin + apres-midi | mar-jeu multi-jours | ven matin + apres-midi
        P(SOPHIE, RE,  w, 0, "matin", 0, "midi")
        P(SOPHIE, PC,  w, 0, "midi",  0, "soir")
        P(SOPHIE, RUI, w, 1, "matin", 3, "soir")  # multi-jours mar->jeu
        P(SOPHIE, FA,  w, 4, "matin", 4, "midi")
        P(SOPHIE, INF, w, 4, "midi",  4, "soir")

        # Thomas : lun-mer multi-jours | jeu full (avec note) | ven full
        P(THOMAS, PC,  w, 0, "matin", 2, "soir")  # multi-jours lun->mer
        P(THOMAS, AF,  w, 3, "matin", 3, "soir",
          "Correction bug critique -- perte de donnees en production")
        P(THOMAS, AM,  w, 4, "matin", 4, "soir")

        # Camille : lun full (note) | mar full | mer matin + apres-midi | jeu-ven multi-jours
        P(CAMILLE, FA,  w, 0, "matin", 0, "soir",
          "Formation initiale Azure Fundamentals (AZ-900)")
        P(CAMILLE, PC,  w, 1, "matin", 1, "soir")
        P(CAMILLE, AM,  w, 2, "matin", 2, "midi")
        P(CAMILLE, RE,  w, 2, "midi",  2, "soir")
        P(CAMILLE, INF, w, 3, "matin", 4, "soir")  # multi-jours jeu->ven

        # --------------------------------------------------------------
        # Semaine -2
        # Couverture:
        #   - Entree debutant un apres-midi et finissant le jour suivant
        #     (chevauchement midi inter-jours : lun PM -> mar soir)
        #   - Bloc lun->jeu (4 jours) pour Sophie
        # --------------------------------------------------------------
        w = current_monday + timedelta(weeks=-2)

        # Alice : lun-mar multi-jours | mer matin + apres-midi | jeu-ven multi-jours
        P(ALICE, AM,  w, 0, "matin", 1, "soir")
        P(ALICE, RE,  w, 2, "matin", 2, "midi")
        P(ALICE, PC,  w, 2, "midi",  2, "soir")
        P(ALICE, RUI, w, 3, "matin", 4, "soir")

        # Yassine : lun matin | lun PM->mar soir | mer full | jeu matin | jeu PM->ven soir
        P(YASSINE, FA,  w, 0, "matin", 0, "midi")
        P(YASSINE, AF,  w, 0, "midi",  1, "soir")   # lun PM -> mar soir inter-jours
        P(YASSINE, PC,  w, 2, "matin", 2, "soir")
        P(YASSINE, INF, w, 3, "matin", 3, "midi")
        P(YASSINE, AM,  w, 3, "midi",  4, "soir")   # jeu PM -> ven soir inter-jours

        # Sophie : lun->jeu multi-jours (4 jours) | ven full
        P(SOPHIE, AM,  w, 0, "matin", 3, "soir")
        P(SOPHIE, RE,  w, 4, "matin", 4, "soir")

        # Thomas : lun matin | lun PM->mar soir | mer-jeu multi-jours | ven matin + apres-midi
        P(THOMAS, RE,  w, 0, "matin", 0, "midi")
        P(THOMAS, AF,  w, 0, "midi",  1, "soir")    # lun PM -> mar soir
        P(THOMAS, PC,  w, 2, "matin", 3, "soir")
        P(THOMAS, INF, w, 4, "matin", 4, "midi")
        P(THOMAS, FA,  w, 4, "midi",  4, "soir")

        # Camille : lun full | mar matin + apres-midi | mer-ven multi-jours
        P(CAMILLE, RE,  w, 0, "matin", 0, "soir")
        P(CAMILLE, PC,  w, 1, "matin", 1, "midi")
        P(CAMILLE, AM,  w, 1, "midi",  1, "soir")
        P(CAMILLE, RUI, w, 2, "matin", 4, "soir")   # mer->ven

        # --------------------------------------------------------------
        # Semaine -1  (semaine passee)
        # Couverture:
        #   - RTT (Alice mer, Camille mer)
        #   - Jour Ferie (Thomas lun)
        #   - Arret Maladie multi-jours (Yassine jeu-ven)
        #   - Notes sur les absences
        # --------------------------------------------------------------
        w = current_monday + timedelta(weeks=-1)

        # Alice : lun matin+PM | mar full | mer RTT | jeu matin+PM | ven full
        P(ALICE, RE,  w, 0, "matin", 0, "midi")
        P(ALICE, AM,  w, 0, "midi",  0, "soir")
        P(ALICE, PC,  w, 1, "matin", 1, "soir")
        P(ALICE, RTT, w, 2, "matin", 2, "soir",
          "RTT recuperation heures supplementaires")
        P(ALICE, AF,  w, 3, "matin", 3, "midi")
        P(ALICE, RUI, w, 3, "midi",  3, "soir")
        P(ALICE, FA,  w, 4, "matin", 4, "soir")

        # Yassine : lun->mer multi-jours | jeu-ven Arret Maladie
        P(YASSINE, PC,  w, 0, "matin", 2, "soir")
        P(YASSINE, ABS, w, 3, "matin", 4, "soir",
          "Arret maladie certifie medecin -- 2 jours")

        # Sophie : lun matin | lun PM->mer soir | jeu full | ven matin+PM
        P(SOPHIE, RE,  w, 0, "matin", 0, "midi")
        P(SOPHIE, INF, w, 0, "midi",  2, "soir")   # lun PM -> mer soir
        P(SOPHIE, AF,  w, 3, "matin", 3, "soir")
        P(SOPHIE, FA,  w, 4, "matin", 4, "midi")
        P(SOPHIE, PC,  w, 4, "midi",  4, "soir")

        # Thomas : lun Jour Ferie | mar->jeu multi-jours | ven matin+PM
        P(THOMAS, JF,  w, 0, "matin", 0, "soir",
          "Lundi de Paques")
        P(THOMAS, AM,  w, 1, "matin", 3, "soir")   # mar->jeu
        P(THOMAS, RE,  w, 4, "matin", 4, "midi")
        P(THOMAS, FA,  w, 4, "midi",  4, "soir")

        # Camille : lun-mar multi-jours | mer RTT | jeu matin+PM | ven full
        P(CAMILLE, PC,  w, 0, "matin", 1, "soir")
        P(CAMILLE, RTT, w, 2, "matin", 2, "soir",
          "RTT pose")
        P(CAMILLE, AM,  w, 3, "matin", 3, "midi")
        P(CAMILLE, RUI, w, 3, "midi",  3, "soir")
        P(CAMILLE, RE,  w, 4, "matin", 4, "soir")

        # --------------------------------------------------------------
        # Semaine 0  (semaine courante)
        # Couverture:
        #   - Seuls les jours jusqu'a aujourd'hui sont remplis pour
        #     simuler la saisie progressive en cours de semaine.
        #   - Les jours non atteints laissent des cases vides (test UI).
        # --------------------------------------------------------------
        w = current_monday
        today_offset = today.weekday()  # 0=lun ... 4=ven

        # Alice : lun full | mar matin+PM  (jeu-ven vides intentionnellement)
        if today_offset >= 0:
            P(ALICE, PC,  w, 0, "matin", 0, "soir")
        if today_offset >= 1:
            P(ALICE, RE,  w, 1, "matin", 1, "midi")
            P(ALICE, AF,  w, 1, "midi",  1, "soir")

        # Yassine : lun full ou lun-mar multi (si mar atteint) | mer matin
        if today_offset >= 1:
            P(YASSINE, INF, w, 0, "matin", 1, "soir")
        elif today_offset == 0:
            P(YASSINE, INF, w, 0, "matin", 0, "soir")
        if today_offset >= 2:
            P(YASSINE, AM,  w, 2, "matin", 2, "midi")

        # Sophie : lun full | mar matin+PM | mer full
        if today_offset >= 0:
            P(SOPHIE, RE,  w, 0, "matin", 0, "soir")
        if today_offset >= 1:
            P(SOPHIE, PC,  w, 1, "matin", 1, "midi")
            P(SOPHIE, FA,  w, 1, "midi",  1, "soir")
        if today_offset >= 2:
            P(SOPHIE, RUI, w, 2, "matin", 2, "soir")

        # Thomas : lun matin+PM | mar-mer multi (si mer atteint)
        if today_offset >= 0:
            P(THOMAS, AF,  w, 0, "matin", 0, "midi")
            P(THOMAS, AM,  w, 0, "midi",  0, "soir")
        if today_offset >= 2:
            P(THOMAS, PC,  w, 1, "matin", 2, "soir")    # mar-mer multi

        # Camille : lun full (note formation) | mar matin+PM->mer (si atteint)
        if today_offset >= 0:
            P(CAMILLE, FA,  w, 0, "matin", 0, "soir",
              "Formation avancee Azure Administrator (AZ-104)")
        if today_offset >= 1:
            P(CAMILLE, RE,  w, 1, "matin", 1, "midi")
        if today_offset >= 2:
            P(CAMILLE, INF, w, 1, "midi",  2, "soir")   # mar PM -> mer soir

        # --------------------------------------------------------------
        # Semaine +1  (semaine prochaine — planification anticipee)
        # Couverture:
        #   - RTT planifie (Alice lun)
        #   - Formation semaine entiere lun->ven (Thomas)
        #   - Reunion isolee demi-journee (Camille mar matin)
        # --------------------------------------------------------------
        w = current_monday + timedelta(weeks=1)

        P(ALICE, RTT, w, 0, "matin", 0, "soir",
          "RTT planifie -- pont")
        P(THOMAS, FA, w, 0, "matin", 4, "soir",
          "Semaine de formation Azure DevOps (AZ-400) -- certif visee")
        P(CAMILLE, RE, w, 1, "matin", 1, "midi")

        db.session.commit()

        total = Pointage.query.count()
        return {
            "created": True,
            "pointages_created": total,
            "utilisateurs": len(utilisateurs),
            "projets": len(projets),
            "codes": len(codes),
        }

    db.session.commit()
    return {
        "created": False,
        "pointages_created": 0,
        "utilisateurs": len(utilisateurs),
        "projets": len(projets),
        "codes": len(codes),
    }
