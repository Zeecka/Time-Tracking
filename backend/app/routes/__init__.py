from flask import Blueprint

from app.routes.analyzer import analyzer_bp
from app.routes.code_pointage import code_pointage_bp
from app.routes.pointage import pointage_bp
from app.routes.projet import projet_bp
from app.routes.stats import stats_bp
from app.routes.utilisateur import utilisateur_bp

__all__ = [
    "code_pointage_bp",
    "projet_bp",
    "utilisateur_bp",
    "pointage_bp",
    "stats_bp",
    "analyzer_bp",
]
