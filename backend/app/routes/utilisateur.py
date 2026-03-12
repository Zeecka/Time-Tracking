import csv
import io
import re

from app.extensions import db
from app.models import Utilisateur
from app.schemas import utilisateur_schema, utilisateurs_schema
from flask import Blueprint, Response, jsonify, request
from sqlalchemy.exc import IntegrityError

utilisateur_bp = Blueprint('utilisateur', __name__)


def validate_hex_color(color):
    """Validate hex color format #RRGGBB"""
    pattern = r'^#[0-9A-Fa-f]{6}$'
    return re.match(pattern, color) is not None


@utilisateur_bp.route('', methods=['GET'])
def get_all_utilisateurs():
    """Get all users"""
    utilisateurs = Utilisateur.query.order_by(Utilisateur.nom).all()
    return jsonify(utilisateurs_schema.dump(utilisateurs)), 200


@utilisateur_bp.route('/<int:id>', methods=['GET'])
def get_utilisateur(id):
    """Get a single user by ID"""
    utilisateur = Utilisateur.query.get_or_404(id)
    return jsonify(utilisateur_schema.dump(utilisateur)), 200


@utilisateur_bp.route('', methods=['POST'])
def create_utilisateur():
    """Create a new user"""
    try:
        data = request.get_json()

        if not data or 'nom' not in data or 'couleur' not in data:
            return jsonify({'error': 'Name and color are required'}), 400

        # Validate color format
        if not validate_hex_color(data['couleur']):
            return jsonify({'error': 'Color must be in hex format #RRGGBB'}), 400

        utilisateur = Utilisateur(
            nom=data['nom'],
            couleur=data['couleur'],
            sub=data.get('sub')
        )
        db.session.add(utilisateur)
        db.session.commit()

        return jsonify(utilisateur_schema.dump(utilisateur)), 201

    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'User with this OIDC subject already exists'}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@utilisateur_bp.route('/<int:id>', methods=['PUT'])
def update_utilisateur(id):
    """Update a user"""
    try:
        utilisateur = Utilisateur.query.get_or_404(id)
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Update name if provided
        if 'nom' in data:
            utilisateur.nom = data['nom']

        # Update color if provided
        if 'couleur' in data:
            if not validate_hex_color(data['couleur']):
                return jsonify({'error': 'Color must be in hex format #RRGGBB'}), 400
            utilisateur.couleur = data['couleur']

        # Update OIDC subject if provided
        if 'sub' in data:
            # Check if sub already exists (excluding current record)
            if data['sub']:
                existing = Utilisateur.query.filter(
                    Utilisateur.sub == data['sub'],
                    Utilisateur.id != id
                ).first()
                if existing:
                    return jsonify({'error': 'User with this OIDC subject already exists'}), 409
            utilisateur.sub = data['sub']

        db.session.commit()
        return jsonify(utilisateur_schema.dump(utilisateur)), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'User with this OIDC subject already exists'}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@utilisateur_bp.route('/<int:id>', methods=['DELETE'])
def delete_utilisateur(id):
    """Delete a user"""
    try:
        utilisateur = Utilisateur.query.get_or_404(id)

        # Check if there are associated pointages
        if utilisateur.pointages.count() > 0:
            return jsonify({'error': 'Cannot delete user with associated time entries'}), 409

        db.session.delete(utilisateur)
        db.session.commit()

        return '', 204

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@utilisateur_bp.route('/export-csv', methods=['GET'])
def export_utilisateurs_csv():
    """Export all users as CSV."""
    utilisateurs = Utilisateur.query.order_by(Utilisateur.nom).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['nom', 'couleur', 'sub'])

    for utilisateur in utilisateurs:
        writer.writerow([utilisateur.nom, utilisateur.couleur, utilisateur.sub or ''])

    csv_content = output.getvalue()
    output.close()

    return Response(
        csv_content,
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=utilisateurs.csv'},
    )


@utilisateur_bp.route('/import-csv', methods=['POST'])
def import_utilisateurs_csv():
    """Import users from CSV file."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'CSV file is required in form field "file"'}), 400

        csv_file = request.files['file']
        if not csv_file or not csv_file.filename:
            return jsonify({'error': 'CSV file is required'}), 400

        content = csv_file.stream.read().decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(content))

        required_headers = {'nom', 'couleur'}
        if not reader.fieldnames or not required_headers.issubset(set(reader.fieldnames)):
            return jsonify({'error': 'CSV header must contain: nom,couleur (sub optional)'}), 400

        created = 0
        updated = 0
        errors = []

        for idx, row in enumerate(reader, start=2):
            nom = str(row.get('nom', '')).strip()
            couleur = str(row.get('couleur', '')).strip()
            sub = str(row.get('sub', '')).strip() or None

            if not nom or not couleur:
                errors.append({'line': idx, 'error': 'nom and couleur are required'})
                continue

            if not validate_hex_color(couleur):
                errors.append({'line': idx, 'error': 'couleur must be in #RRGGBB format'})
                continue

            target = None
            if sub:
                target = Utilisateur.query.filter_by(sub=sub).first()
            if not target:
                target = Utilisateur.query.filter_by(nom=nom).first()

            if target:
                target.nom = nom
                target.couleur = couleur
                if sub:
                    existing_sub = Utilisateur.query.filter(
                        Utilisateur.sub == sub,
                        Utilisateur.id != target.id,
                    ).first()
                    if existing_sub:
                        errors.append({'line': idx, 'error': 'sub already used by another user'})
                        continue
                target.sub = sub
                updated += 1
            else:
                existing_sub = Utilisateur.query.filter_by(sub=sub).first() if sub else None
                if existing_sub:
                    errors.append({'line': idx, 'error': 'sub already used by another user'})
                    continue

                db.session.add(Utilisateur(nom=nom, couleur=couleur, sub=sub))
                created += 1

        db.session.commit()

        status = 201 if created > 0 else 200
        return jsonify({'created': created, 'updated': updated, 'errors': errors}), status

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
