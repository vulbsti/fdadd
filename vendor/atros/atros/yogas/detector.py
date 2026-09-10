"""
Unified Yoga Detection Engine.

This module combines all yoga detectors and provides a single
interface for detecting all yogas in a chart.
"""

from typing import List

from ..core.models import LagnaChart, Yoga
from .affliction import AfflictionYogaDetector
from .base import YogaDetector
from .career import CareerYogaDetector
from .dhana import DhanaYogaDetector
from .lunar import LunarYogaDetector
from .mahapurusha import MahapurushaYogaDetector
from .raja import BasicRajaYogaDetector, NeechaBhangaRajaYogaDetector
from .special import ViparitaRajaYogaDetector


class YogaEngine:
    """
    Unified yoga detection engine.

    Combines multiple yoga detectors and runs them all on a chart.
    """

    def __init__(self):
        """Initialize with all available yoga detectors."""
        self.detectors: List[YogaDetector] = [
            MahapurushaYogaDetector(),
            NeechaBhangaRajaYogaDetector(),
            BasicRajaYogaDetector(),
            DhanaYogaDetector(),
            LunarYogaDetector(),
            CareerYogaDetector(),
            AfflictionYogaDetector(),
            ViparitaRajaYogaDetector(),
        ]

    def detect_all(self, chart: LagnaChart) -> List[Yoga]:
        """
        Run all yoga detectors on the chart.

        Args:
            chart: LagnaChart with all planetary positions

        Returns:
            List of all detected Yoga objects
        """
        all_yogas = []

        for detector in self.detectors:
            try:
                yogas = detector.detect(chart)
                all_yogas.extend(yogas)
            except Exception as e:
                # Log error but continue with other detectors
                print(f"Error in {detector.__class__.__name__}: {e}")
                continue

        # Sort yogas by strength (highest first)
        all_yogas.sort(key=lambda y: y.strength or 0, reverse=True)

        return all_yogas

    def detect_by_type(self, chart: LagnaChart, yoga_type: str) -> List[Yoga]:
        """
        Detect only yogas of a specific type.

        Args:
            chart: LagnaChart with planetary positions
            yoga_type: Type of yoga to detect (e.g., "Mahapurusha", "Raja")

        Returns:
            List of detected Yoga objects of the specified type
        """
        matching_detectors = [
            d for d in self.detectors if d.yoga_type == yoga_type
        ]

        yogas = []
        for detector in matching_detectors:
            try:
                yogas.extend(detector.detect(chart))
            except Exception:
                continue

        return yogas

    def get_available_yoga_types(self) -> List[str]:
        """
        Get list of yoga types this engine can detect.

        Returns:
            List of yoga type names
        """
        return list(set(d.yoga_type for d in self.detectors))

    def add_detector(self, detector: YogaDetector) -> None:
        """
        Add a custom yoga detector.

        Args:
            detector: YogaDetector instance to add
        """
        self.detectors.append(detector)


def detect_yogas(chart: LagnaChart) -> List[Yoga]:
    """
    Convenience function to detect all yogas in a chart.

    Args:
        chart: LagnaChart with planetary positions

    Returns:
        List of all detected Yoga objects
    """
    engine = YogaEngine()
    return engine.detect_all(chart)
