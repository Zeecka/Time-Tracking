import re

from app.extensions import db
from app.models import Utilisateur
from app.schemas import utilisateur_schema, utilisateurs_schema
from flask import Blueprint, jsonify, request
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
