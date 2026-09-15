"""Ashtakoota (eight-fold) Kundali matching for Vedic astrology."""

import math
from typing import List

from atros.core.constants import (
    BHAKOOT_MATRIX,
    GANA_BY_NAKSHATRA,
    GANA_MATRIX,
    GRAHA_MAITRI_MATRIX,
    MANGAL_DOSHA_HOUSES,
    NADI_BY_NAKSHATRA,
    NAKSHATRAS,
    RASHI_LORD_INDEX,
    RASHI_NAMES,
    VARNA_BY_RASHI,
    VASHYA_BY_RASHI,
    VASHYA_MATRIX,
    YONI_BY_NAKSHATRA,
    YONI_MATRIX,
)
from atros.core.models import KootaScore, KundaliMatchResult


def nakshatra_to_rashi_index(nakshatra_index: int, pada: int = 1) -> int:
    """Convert 0-based nakshatra + pada to 0-based rashi index.

    Each nakshatra spans 13.333 degrees, each pada 3.333 degrees.
    Total degrees = nak_index * 13.333 + (pada-1) * 3.333 + 1.667
    rashi = floor(total_degrees / 30)
    """
    nak_span = 13 + 1 / 3  # 13.333...
    pada_span = nak_span / 4  # 3.333...
    total_degrees = nakshatra_index * nak_span + (pada - 1) * pada_span + pada_span / 2
    return int(math.floor(total_degrees / 30))


def score_varna(girl_rashi: int, boy_rashi: int) -> KootaScore:
    """Max 1 point. Boy's varna must be <= Girl's varna (equal or higher caste).

    Varna values: 0=Brahmin (highest), 1=Kshatriya, 2=Vaishya, 3=Shudra (lowest).
    Boy scores if his varna number <= girl's varna number.
    """
    boy_varna = VARNA_BY_RASHI[boy_rashi]
    girl_varna = VARNA_BY_RASHI[girl_rashi]
    score = 1.0 if boy_varna <= girl_varna else 0.0
    return KootaScore(
        koota="Varna",
        score=score,
        max_score=1.0,
        description=f"Boy varna={boy_varna}, Girl varna={girl_varna}",
    )


def score_vashya(girl_rashi: int, boy_rashi: int) -> KootaScore:
    """Max 2 points. Use VASHYA_MATRIX lookup."""
    girl_type = VASHYA_BY_RASHI[girl_rashi]
    boy_type = VASHYA_BY_RASHI[boy_rashi]
    score = VASHYA_MATRIX[girl_type][boy_type]
    return KootaScore(
        koota="Vashya",
        score=score,
        max_score=2.0,
        description=f"Girl type={girl_type}, Boy type={boy_type}",
    )


def score_tara(boy_nak: int, girl_nak: int) -> KootaScore:
    """Max 3 points. Check both directions.

    For boy-to-girl direction: remainder = ((girl_nak - boy_nak) % 9)
    For girl-to-boy direction: remainder = ((boy_nak - girl_nak) % 9)
    Remainder 3, 5, 7 = inauspicious for that direction.
    Each good direction = 1.5 points.
    Nakshatra indices are 0-based (0-26).
    """
    points = 0.0

    # Boy to girl direction
    diff_bg = (girl_nak - boy_nak) % 9
    if diff_bg not in (3, 5, 7):
        points += 1.5

    # Girl to boy direction
    diff_gb = (boy_nak - girl_nak) % 9
    if diff_gb not in (3, 5, 7):
        points += 1.5

    return KootaScore(
        koota="Tara",
        score=points,
        max_score=3.0,
        description=f"Boy->Girl remainder={diff_bg}, Girl->Boy remainder={diff_gb}",
    )


def score_yoni(boy_nak: int, girl_nak: int) -> KootaScore:
    """Max 4 points. Use YONI_BY_NAKSHATRA and YONI_MATRIX."""
    boy_animal = YONI_BY_NAKSHATRA[boy_nak]
    girl_animal = YONI_BY_NAKSHATRA[girl_nak]
    score = float(YONI_MATRIX[girl_animal][boy_animal])
    return KootaScore(
        koota="Yoni",
        score=score,
        max_score=4.0,
        description=f"Girl animal={girl_animal}, Boy animal={boy_animal}",
    )


def score_graha_maitri(girl_rashi: int, boy_rashi: int) -> KootaScore:
    """Max 5 points. Use RASHI_LORD_INDEX and GRAHA_MAITRI_MATRIX."""
    girl_lord = RASHI_LORD_INDEX[girl_rashi]
    boy_lord = RASHI_LORD_INDEX[boy_rashi]
    score = GRAHA_MAITRI_MATRIX[girl_lord][boy_lord]
    return KootaScore(
        koota="Graha Maitri",
        score=score,
        max_score=5.0,
        description=f"Girl lord={girl_lord}, Boy lord={boy_lord}",
    )


def score_gana(boy_nak: int, girl_nak: int) -> KootaScore:
    """Max 6 points. Use GANA_BY_NAKSHATRA and GANA_MATRIX."""
    boy_gana = GANA_BY_NAKSHATRA[boy_nak]
    girl_gana = GANA_BY_NAKSHATRA[girl_nak]
    score = float(GANA_MATRIX[girl_gana][boy_gana])
    return KootaScore(
        koota="Gana",
        score=score,
        max_score=6.0,
        description=f"Girl gana={girl_gana}, Boy gana={boy_gana}",
    )


def score_bhakoot(girl_rashi: int, boy_rashi: int) -> KootaScore:
    """Max 7 points. Use BHAKOOT_MATRIX."""
    score = float(BHAKOOT_MATRIX[girl_rashi][boy_rashi])
    return KootaScore(
        koota="Bhakoot",
        score=score,
        max_score=7.0,
        description=f"Girl rashi={girl_rashi}, Boy rashi={boy_rashi}",
    )


def score_nadi(boy_nak: int, girl_nak: int) -> KootaScore:
    """Max 8 points. Same nadi = 0, different = 8."""
    boy_nadi = NADI_BY_NAKSHATRA[boy_nak]
    girl_nadi = NADI_BY_NAKSHATRA[girl_nak]
    score = 0.0 if boy_nadi == girl_nadi else 8.0
    return KootaScore(
        koota="Nadi",
        score=score,
        max_score=8.0,
        description=f"Boy nadi={boy_nadi}, Girl nadi={girl_nadi}",
    )


def check_mangal_dosha(mars_house: int) -> bool:
    """True if Mars is in house 1, 2, 4, 7, 8, or 12."""
    return mars_house in MANGAL_DOSHA_HOUSES


def calculate_matching(
    boy_nakshatra_index: int,
    boy_rashi_index: int,
    girl_nakshatra_index: int,
    girl_rashi_index: int,
    boy_mars_house: int = 0,
    girl_mars_house: int = 0,
) -> KundaliMatchResult:
    """Calculate all 8 kootas and return complete result.

    Recommendation thresholds:
      <18  = "Not Recommended"
      18-24 = "Average"
      24-32 = "Good"
      32-36 = "Excellent"
    """
    koota_scores: List[KootaScore] = [
        score_varna(girl_rashi_index, boy_rashi_index),
        score_vashya(girl_rashi_index, boy_rashi_index),
        score_tara(boy_nakshatra_index, girl_nakshatra_index),
        score_yoni(boy_nakshatra_index, girl_nakshatra_index),
        score_graha_maitri(girl_rashi_index, boy_rashi_index),
        score_gana(boy_nakshatra_index, girl_nakshatra_index),
        score_bhakoot(girl_rashi_index, boy_rashi_index),
        score_nadi(boy_nakshatra_index, girl_nakshatra_index),
    ]

    total = sum(ks.score for ks in koota_scores)

    is_manglik_boy = check_mangal_dosha(boy_mars_house) if boy_mars_house else False
    is_manglik_girl = check_mangal_dosha(girl_mars_house) if girl_mars_house else False

    if total >= 32:
        recommendation = "Excellent"
    elif total >= 24:
        recommendation = "Good"
    elif total >= 18:
        recommendation = "Average"
    else:
        recommendation = "Not Recommended"

    return KundaliMatchResult(
        boy_nakshatra=NAKSHATRAS[boy_nakshatra_index]["name"],
        girl_nakshatra=NAKSHATRAS[girl_nakshatra_index]["name"],
        boy_rashi=RASHI_NAMES[boy_rashi_index],
        girl_rashi=RASHI_NAMES[girl_rashi_index],
        koota_scores=koota_scores,
        total_score=total,
        is_manglik_boy=is_manglik_boy,
        is_manglik_girl=is_manglik_girl,
        recommendation=recommendation,
    )
