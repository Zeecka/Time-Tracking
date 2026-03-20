from datetime import datetime

from app.extensions import db


class TrackingCode(db.Model):
    """Tracking code linked to one or more projects"""

    __tablename__ = "tracking_code"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(128), unique=True, nullable=False, index=True)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    projects = db.relationship(
        "Project",
        back_populates="tracking_code",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<TrackingCode {self.code}>"


class Project(db.Model):
    """Project linked to a tracking code"""

    __tablename__ = "project"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), unique=True, nullable=False, index=True)
    color = db.Column(
        db.String(7), nullable=False, default="#3498db"
    )  # Hex color code #RRGGBB
    pattern = db.Column(db.String(20), nullable=False, default="solid")
    tracking_code_id = db.Column(
        db.Integer, db.ForeignKey("tracking_code.id"), nullable=False
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    tracking_code = db.relationship("TrackingCode", back_populates="projects")
    time_entries = db.relationship(
        "TimeEntry",
        back_populates="project",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Project {self.name}>"


class User(db.Model):
    """User with name and display color"""

    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    color = db.Column(db.String(7), nullable=False)  # Hex color code #RRGGBB
    sub = db.Column(
        db.String(255), unique=True, nullable=True, index=True
    )  # OIDC subject identifier
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    time_entries = db.relationship(
        "TimeEntry",
        back_populates="user",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<User {self.name}>"


class TimeEntry(db.Model):
    """Time entry with date range, periods, week number, user and project"""

    __tablename__ = "time_entry"

    id = db.Column(db.Integer, primary_key=True)
    start_date = db.Column(db.Date, nullable=False)
    start_period = db.Column(db.String(20), nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    end_period = db.Column(db.String(20), nullable=False)
    week_number = db.Column(
        db.Integer, nullable=False, index=True
    )  # ISO week number
    year = db.Column(db.Integer, nullable=False, index=True)  # Year for the week
    user_id = db.Column(
        db.Integer, db.ForeignKey("user.id"), nullable=False
    )
    project_id = db.Column(db.Integer, db.ForeignKey("project.id"), nullable=False)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user = db.relationship("User", back_populates="time_entries")
    project = db.relationship("Project", back_populates="time_entries")

    # Index for efficient querying by week/year
    __table_args__ = (db.Index("idx_time_entry_week_year", "week_number", "year"),)

    def __repr__(self):
        return f"<TimeEntry User:{self.user_id} Project:{self.project_id} Week:{self.week_number}/{self.year} {self.start_date}->{self.end_date}>"
