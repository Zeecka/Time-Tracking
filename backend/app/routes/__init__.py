from flask import Blueprint

from app.routes.project import project_bp
from app.routes.stats import stats_bp
from app.routes.time_entry import time_entry_bp
from app.routes.tracking_code import tracking_code_bp
from app.routes.user import user_bp

__all__ = [
    "tracking_code_bp",
    "project_bp",
    "user_bp",
    "time_entry_bp",
    "stats_bp",
]
