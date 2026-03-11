from app.extensions import ma
from app.models import CodePointage, Pointage, Projet, Utilisateur


class CodePointageSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = CodePointage
        load_instance = True
        include_fk = True


class ProjetSchema(ma.SQLAlchemyAutoSchema):
    code_pointage = ma.Nested(CodePointageSchema, only=["id", "code"])

    class Meta:
        model = Projet
        load_instance = True
        include_fk = True
        fields = (
            "id",
            "nom",
            "couleur",
            "motif",
            "code_pointage_id",
            "created_at",
            "updated_at",
            "code_pointage",
        )


class UtilisateurSchema(ma.SQLAlchemyAutoSchema):
    class Meta:
        model = Utilisateur
        load_instance = True
        include_fk = True


class PointageSchema(ma.SQLAlchemyAutoSchema):
    utilisateur = ma.Nested(UtilisateurSchema, only=["id", "nom", "couleur"])
    projet = ma.Nested(ProjetSchema, only=["id", "nom", "couleur", "motif"])

    class Meta:
        model = Pointage
        load_instance = True
        include_fk = True


# Schema instances
code_pointage_schema = CodePointageSchema()
code_pointages_schema = CodePointageSchema(many=True)

projet_schema = ProjetSchema()
projets_schema = ProjetSchema(many=True)

utilisateur_schema = UtilisateurSchema()
utilisateurs_schema = UtilisateurSchema(many=True)

pointage_schema = PointageSchema()
pointages_schema = PointageSchema(many=True)
