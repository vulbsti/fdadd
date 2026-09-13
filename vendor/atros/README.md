# Atros - Vedic Astrology Calculation System

Accurate Vedic astrology calculations using Swiss Ephemeris with Lahiri Ayanamsa.

## Features

- **Lagna Chart (D1)** - Complete birth chart with planetary positions, nakshatras, and dignities
- **Divisional Charts** - D1, D2, D3, D4, D7, D9, D10, D12, D30, D60
- **Vimshottari Dasha** - Complete timeline with Mahadasha and Antardasha periods
- **Yoga Detection** - Mahapurusha Yogas, Neecha Bhanga Raja Yoga, and more
- **Planetary Relationships** - Natural, temporary, and compound (Panchadha) relationships

## Installation

```bash
pip install -e .
```

## Usage

### CLI

```bash
# Generate complete chart
atros chart \
  --name "Person" \
  --date 2000-04-22 \
  --time 09:15 \
  --lat 26.4499 \
  --lng 80.3319 \
  --tz "Asia/Kolkata" \
  --output json

# Show dasha timeline
atros dasha \
  --date 2000-04-22 \
  --time 09:15 \
  --lat 26.4499 \
  --lng 80.3319 \
  --tz "Asia/Kolkata"

# Show current dasha
atros current \
  --date 2000-04-22 \
  --time 09:15 \
  --lat 26.4499 \
  --lng 80.3319 \
  --tz "Asia/Kolkata"
```

### Python API

```python
from datetime import date, datetime
from atros.core.models import BirthData
from atros.services.chart_service import ChartService

birth_data = BirthData(
    name="Person",
    date=date(2000, 4, 22),
    time=datetime(2000, 4, 22, 9, 15),
    latitude=26.4499,
    longitude=80.3319,
    timezone="Asia/Kolkata",
    place_name="Kanpur, India"
)

service = ChartService()
chart = service.generate_full_chart(birth_data)

# Access planetary positions
for planet in chart.lagna_chart.planets:
    print(f"{planet.planet}: {planet.sign} {planet.degree:.2f} - {planet.nakshatra}")

# Access current dasha
print(f"Current Mahadasha: {chart.dasha_timeline.current_mahadasha.planet}")

# Access yogas
for yoga in chart.yogas:
    print(f"{yoga.name}: {yoga.description}")
```

## Technical Details

- **Ephemeris**: Kerykeion (Swiss Ephemeris wrapper)
- **Ayanamsa**: Lahiri (Chitrapaksha) - Official Indian Government standard
- **Accuracy**: 1 milli-arcsecond (NASA JPL DE431 based)
- **Python**: 3.9+

## Calculation Formulas

### Nakshatra
- 27 nakshatras, each spanning 13°20'
- Lords cycle: Ketu → Venus → Sun → Moon → Mars → Rahu → Jupiter → Saturn → Mercury

### Vimshottari Dasha
- 120-year cycle based on Moon's nakshatra
- Antardasha = (MD_years × AD_years) / 120

### Divisional Charts
- Each chart divides the 30° sign into N equal parts
- Starting sign depends on sign quality (Movable/Fixed/Dual)

## License

MIT
