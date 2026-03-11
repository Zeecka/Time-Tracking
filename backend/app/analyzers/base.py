"""Base analyzer class for all analyzers"""

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseAnalyzer(ABC):
    """Abstract base class for all image analyzers"""

    def __init__(self, name: str, description: str):
        """
        Initialize the analyzer.
        
        Args:
            name: Name of the analyzer
            description: Description of what the analyzer does
        """
        self.name = name
        self.description = description

    @abstractmethod
    def analyze(self, image_path: str) -> Dict[str, Any]:
        """
        Analyze the image for steganography or other artifacts.
        
        Args:
            image_path: Path to the image file
            
        Returns:
            Dictionary containing analysis results
        """
        pass

    def get_info(self) -> Dict[str, str]:
        """
        Get information about the analyzer.
        
        Returns:
            Dictionary with analyzer metadata
        """
        return {
            'name': self.name,
            'description': self.description
        }
