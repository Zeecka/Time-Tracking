import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration"""

    SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-secret-key-change-in-production"
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Database configuration
    DATABASE_URL = (
        os.environ.get("DATABASE_URL")
        or "mysql+pymysql://pointage_user:pointage_password@localhost:3306/pointage_db"
    )
    SQLALCHEMY_DATABASE_URI = DATABASE_URL

    # CORS configuration
    CORS_ORIGINS_STR = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
    CORS_ORIGINS = [
        origin.strip() for origin in CORS_ORIGINS_STR.split(",") if origin.strip()
    ]
    CORS_CONFIG = {
        "origins": CORS_ORIGINS,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "max_age": 3600,
    }

    # Stats configuration: comma-separated list of project names to exclude from TOP Projets
    STATS_EXCLUDE_PROJETS_STR = os.environ.get("STATS_EXCLUDE_PROJETS", "")
    STATS_EXCLUDE_PROJETS = [
        name.strip() for name in STATS_EXCLUDE_PROJETS_STR.split(",") if name.strip()
    ]


class DevelopmentConfig(Config):
    """Development configuration"""

    DEBUG = True
    SQLALCHEMY_ECHO = True

    # Allow all origins in dev for testing
    CORS_CONFIG = {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
        "supports_credentials": False,
        "max_age": 3600,
    }


class TestingConfig(Config):
    """Testing configuration — uses in-memory SQLite, no external DB required."""

    TESTING = True
    DEBUG = False
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    CORS_CONFIG = {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": False,
        "max_age": 3600,
    }


class ProductionConfig(Config):
    """Production configuration"""

    DEBUG = False
    SQLALCHEMY_ECHO = False


config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
