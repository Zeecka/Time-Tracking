"""Analyzer routes for image analysis and steganography detection"""

from werkzeug.utils import secure_filename
from flask import Blueprint, jsonify, request
import os
import tempfile

from app.analyzers import JstegAnalyzer

analyzer_bp = Blueprint('analyzer', __name__)

# Initialize analyzers
jsteg_analyzer = JstegAnalyzer()

# Allowed file extensions
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'}


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@analyzer_bp.route('/analyzers', methods=['GET'])
def get_analyzers():
    """Get list of available analyzers"""
    analyzers = [
        jsteg_analyzer.get_info(),
    ]
    return jsonify({'analyzers': analyzers}), 200


@analyzer_bp.route('/analyze/jsteg', methods=['POST'])
def analyze_jsteg():
    """
    Analyze an uploaded image for hidden data using Jsteg technique.
    
    Expects multipart/form-data with 'image' file field.
    """
    try:
        # Check if image file is present
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']

        if file.filename == '':
            return jsonify({'error': 'No image file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': f'File type not allowed. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

        # Save file temporarily
        temp_dir = tempfile.gettempdir()
        filename = secure_filename(file.filename)
        temp_path = os.path.join(temp_dir, filename)

        try:
            file.save(temp_path)

            # Perform analysis
            result = jsteg_analyzer.analyze(temp_path)

            return jsonify(result), 200 if result.get('success') else 400

        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)

    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500


@analyzer_bp.route('/analyze', methods=['POST'])
def analyze():
    """
    Generic analyzer endpoint that accepts an image and returns analysis from all available analyzers.
    """
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']

        if file.filename == '':
            return jsonify({'error': 'No image file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': f'File type not allowed. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

        # Save file temporarily
        temp_dir = tempfile.gettempdir()
        filename = secure_filename(file.filename)
        temp_path = os.path.join(temp_dir, filename)

        try:
            file.save(temp_path)

            # Perform analysis with all available analyzers
            results = {
                'image_file': file.filename,
                'analyzers': {
                    'jsteg': jsteg_analyzer.analyze(temp_path)
                }
            }

            return jsonify(results), 200

        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)

    except Exception as e:
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500
