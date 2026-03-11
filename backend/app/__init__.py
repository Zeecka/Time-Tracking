import os

import click
from flask import Flask

from app.config import config
from app.extensions import cors, db, ma


def create_app(config_name=None):
    """Application factory pattern"""
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Initialize extensions
    db.init_app(app)
    ma.init_app(app)
    cors.init_app(app, resources={r"/api/*": app.config["CORS_CONFIG"]})

    # Register blueprints
    from app.routes import (
        analyzer_bp,
        code_pointage_bp,
        pointage_bp,
        projet_bp,
        stats_bp,
        utilisateur_bp,
    )

    app.register_blueprint(code_pointage_bp, url_prefix="/api/v1/code-pointage")
    app.register_blueprint(projet_bp, url_prefix="/api/v1/projets")
    app.register_blueprint(utilisateur_bp, url_prefix="/api/v1/utilisateurs")
    app.register_blueprint(pointage_bp, url_prefix="/api/v1/pointages")
    app.register_blueprint(stats_bp, url_prefix="/api/v1/stats")
    app.register_blueprint(analyzer_bp, url_prefix="/api/v1/analyzer")

    with app.app_context():
        try:
            from app import models as _models  # noqa: F401

            db.create_all()
        except Exception as exc:
            app.logger.error("Failed to auto-create database tables: %s", exc)

    # Health check route
    @app.route("/health")
    def health():
        return {"status": "healthy"}, 200

    @app.cli.command("seed-dev")
    def seed_dev_command():
        from app.seed import seed_dev_data

        result = seed_dev_data()
        if result["created"]:
            click.echo(
                f"Données de dev créées: {result['codes']} codes, {result['projets']} projets, {result['utilisateurs']} utilisateurs, {result['pointages_created']} pointages"
            )
        else:
            click.echo(
                f"Données de base mises à jour: {result['codes']} codes, {result['projets']} projets, {result['utilisateurs']} utilisateurs. Pointages déjà présents, génération ignorée."
            )

    @app.cli.command("init-db")
    @click.option(
        "--reset",
        is_flag=True,
        help="Supprime puis recrée toutes les tables avant l'initialisation.",
    )
    def init_db_command(reset):
        from app import models as _models  # noqa: F401

        if reset:
            db.drop_all()
            click.echo("Tables supprimées.")

        db.create_all()
        click.echo("Schéma de base de données initialisé.")

    return app
