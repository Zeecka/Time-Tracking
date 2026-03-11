from datetime import datetime

from app.extensions import db


class CodePointage(db.Model):
    """Code de pointage - time tracking code"""

    __tablename__ = "code_pointage"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(128), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    projets = db.relationship(
        "Projet",
        back_populates="code_pointage",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<CodePointage {self.code}>"


class Projet(db.Model):
    """Projet - project linked to a time tracking code"""

    __tablename__ = "projet"

    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(128), unique=True, nullable=False, index=True)
    couleur = db.Column(
        db.String(7), nullable=False, default="#3498db"
    )  # Hex color code #RRGGBB
    motif = db.Column(db.String(20), nullable=False, default="uni")
    code_pointage_id = db.Column(
        db.Integer, db.ForeignKey("code_pointage.id"), nullable=False
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    code_pointage = db.relationship("CodePointage", back_populates="projets")
    pointages = db.relationship(
        "Pointage",
        back_populates="projet",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Projet {self.nom}>"


class Utilisateur(db.Model):
    """Utilisateur - user with name and color"""

    __tablename__ = "utilisateur"

    id = db.Column(db.Integer, primary_key=True)
    nom = db.Column(db.String(128), nullable=False)
    couleur = db.Column(db.String(7), nullable=False)  # Hex color code #RRGGBB
    sub = db.Column(
        db.String(255), unique=True, nullable=True, index=True
    )  # OIDC subject identifier
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    pointages = db.relationship(
        "Pointage",
        back_populates="utilisateur",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Utilisateur {self.nom}>"


class Pointage(db.Model):
    """Pointage - time entry with date range, periods, week number, user and project"""

    __tablename__ = "pointage"

    id = db.Column(db.Integer, primary_key=True)
    date_debut = db.Column(db.Date, nullable=False)
    periode_debut = db.Column(db.String(20), nullable=False)
    date_fin = db.Column(db.Date, nullable=False)
    periode_fin = db.Column(db.String(20), nullable=False)
    numero_semaine = db.Column(
        db.Integer, nullable=False, index=True
    )  # ISO week number
    annee = db.Column(db.Integer, nullable=False, index=True)  # Year for the week
    utilisateur_id = db.Column(
        db.Integer, db.ForeignKey("utilisateur.id"), nullable=False
    )
    projet_id = db.Column(db.Integer, db.ForeignKey("projet.id"), nullable=False)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    utilisateur = db.relationship("Utilisateur", back_populates="pointages")
    projet = db.relationship("Projet", back_populates="pointages")

    # Index for efficient querying by week/year
    __table_args__ = (db.Index("idx_pointage_week_year", "numero_semaine", "annee"),)

    def __repr__(self):
        return f"<Pointage User:{self.utilisateur_id} Project:{self.projet_id} Week:{self.numero_semaine}/{self.annee} {self.date_debut}->{self.date_fin}>"
