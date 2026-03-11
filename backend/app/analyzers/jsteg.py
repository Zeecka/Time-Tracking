"""Jsteg analyzer for detecting steganography in JPEG images"""

from typing import Any, Dict

from app.analyzers.base import BaseAnalyzer

try:
    import jsteg
    JSTEG_AVAILABLE = True
except ImportError:
    JSTEG_AVAILABLE = False


class JstegAnalyzer(BaseAnalyzer):
    """Analyzer for detecting hidden data in JPEG images using Jsteg technique"""

    def __init__(self):
        """Initialize the Jsteg analyzer"""
        super().__init__(
            name='jsteg',
            description='Detects hidden data in JPEG images using Jsteg steganography technique'
        )
        self.available = JSTEG_AVAILABLE

    def analyze(self, image_path: str) -> Dict[str, Any]:
        """
        Analyze a JPEG image for hidden data using Jsteg technique.
        
        Args:
            image_path: Path to the JPEG image file
            
        Returns:
            Dictionary containing:
                - success: bool indicating if analysis was performed
                - analyzer: analyzer name
                - image_file: the analyzed image filename
                - has_hidden_data: bool indicating if hidden data was detected
                - data_size: size of hidden data if detected (bytes)
                - error: error message if analysis failed
                
        Raises:
            FileNotFoundError: if image file doesn't exist
        """
        import os

        # Check if file exists
        if not os.path.exists(image_path):
            return {
                'success': False,
                'analyzer': self.name,
                'image_file': os.path.basename(image_path),
                'error': f'File not found: {image_path}'
            }

        # Check if jsteg is available
        if not self.available:
            return {
                'success': False,
                'analyzer': self.name,
                'image_file': os.path.basename(image_path),
                'error': 'Jsteg library not available'
            }

        try:
            # Check if file is a JPEG
            if not image_path.lower().endswith(('.jpg', '.jpeg')):
                return {
                    'success': False,
                    'analyzer': self.name,
                    'image_file': os.path.basename(image_path),
                    'error': 'File must be a JPEG image (.jpg or .jpeg)'
                }

            # Try to extract hidden data
            with open(image_path, 'rb') as f:
                image_data = f.read()

            # Attempt to detect/extract hidden data using jsteg
            # Note: jsteg.reveal() returns hidden data if present, empty bytes if not
            try:
                hidden_data = jsteg.reveal(image_data)
                has_hidden_data = len(hidden_data) > 0

                return {
                    'success': True,
                    'analyzer': self.name,
                    'image_file': os.path.basename(image_path),
                    'has_hidden_data': has_hidden_data,
                    'data_size': len(hidden_data),
                    'data_preview': hidden_data[:100].decode('utf-8', errors='replace') if hidden_data else None
                }
            except Exception as e:
                return {
                    'success': False,
                    'analyzer': self.name,
                    'image_file': os.path.basename(image_path),
                    'error': f'Jsteg analysis error: {str(e)}'
                }

        except Exception as e:
            return {
                'success': False,
                'analyzer': self.name,
                'image_file': os.path.basename(image_path),
                'error': f'Analysis failed: {str(e)}'
            }
