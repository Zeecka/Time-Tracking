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
        project_bp,
        stats_bp,
        time_entry_bp,
        tracking_code_bp,
        user_bp,
    )

    app.register_blueprint(tracking_code_bp, url_prefix="/api/v1/tracking-codes")
    app.register_blueprint(project_bp, url_prefix="/api/v1/projects")
    app.register_blueprint(user_bp, url_prefix="/api/v1/users")
    app.register_blueprint(time_entry_bp, url_prefix="/api/v1/time-entries")
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
                f"Dev data created: {result['codes']} codes, {result['projects']} projects, {result['users']} users, {result['entries_created']} time entries"
            )
        else:
            click.echo(
                f"Base data updated: {result['codes']} codes, {result['projects']} projects, {result['users']} users. Time entries already present, generation skipped."
            )

    @app.cli.command("init-db")
    @click.option(
        "--reset",
        is_flag=True,
        help="Drop and recreate all tables before initialization.",
    )
    def init_db_command(reset):
        from app import models as _models  # noqa: F401

        if reset:
            db.drop_all()
            click.echo("Tables dropped.")

        db.create_all()
        click.echo("Database schema initialized.")

    return app
