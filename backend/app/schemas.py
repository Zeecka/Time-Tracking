from app.extensions import ma
from app.models import Project, TimeEntry, TrackingCode, User


class TrackingCodeSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = TrackingCode
        load_instance = True
        include_fk = True


class ProjectSchema(ma.SQLAlchemyAutoSchema):
    tracking_code = ma.Nested(TrackingCodeSchema, only=["id", "code"])

    class Meta:
        model = Project
        load_instance = True
        include_fk = True
        fields = (
            "id",
            "name",
            "color",
            "pattern",
            "tracking_code_id",
            "created_at",
            "updated_at",
            "tracking_code",
        )


class UserSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = User
        load_instance = True
        include_fk = True


class TimeEntrySchema(ma.SQLAlchemyAutoSchema):
    user = ma.Nested(UserSchema, only=["id", "name", "color"])
    project = ma.Nested(
        ProjectSchema,
        only=["id", "name", "color", "pattern", "tracking_code_id", "tracking_code"],
    )

    class Meta:
        model = TimeEntry
        load_instance = True
        include_fk = True


# Schema instances
tracking_code_schema = TrackingCodeSchema()
tracking_codes_schema = TrackingCodeSchema(many=True)

project_schema = ProjectSchema()
projects_schema = ProjectSchema(many=True)

user_schema = UserSchema()
users_schema = UserSchema(many=True)

time_entry_schema = TimeEntrySchema()
time_entries_schema = TimeEntrySchema(many=True)
